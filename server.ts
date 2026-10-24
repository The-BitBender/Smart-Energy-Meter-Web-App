import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { activeMeters, anomalyStore, processTelemetryIngest, telemetryStore, userPreferencesStore } from './src/server/telemetryHandler';
import type { NotificationPreferences } from './src/types/energy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Helper to seed initial demo data on server boot
function ensureDemoMeters() {
  if (activeMeters.size > 0) return;

  const demoMeterId = 'ESP32-MTR-8842';
  const now = Date.now();

  const demoMeter = {
    id: demoMeterId,
    meterId: demoMeterId,
    ownerUid: 'demo_user',
    name: 'Main Feeder Panel - Workshop A',
    relayState: 'ON' as const,
    status: 'ONLINE' as const,
    apiKey: 'VP-8842-SECURE-KEY',
    lastHeartbeat: new Date(now).toISOString(),
    latitude: 6.5244,
    longitude: 3.3792,
    address: 'Plot 12 Commercial Way, Industrial Estate, Lagos',
    voltage: 231.8,
    current: 14.6,
    activePower: 3315.0,
    reactivePower: 410.0,
    powerFactor: 0.98,
    frequency: 50.02,
    totalEnergy: 148.62,
    hasAnomaly: false,
    anomalyType: 'NONE' as const,
    anomalySeverity: 'LOW' as const,
    anomalyDescription: 'Operating normally',
    createdAt: new Date(now - 86400000 * 7).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  activeMeters.set(demoMeterId, demoMeter);

  const logs = [];
  let cumulativeEnergy = 132.0;

  for (let i = 48; i >= 0; i--) {
    const time = new Date(now - i * 30 * 60 * 1000).toISOString();
    const hour = (new Date(time)).getHours();
    let baseCurrent = 5.0;
    if (hour >= 8 && hour <= 18) {
      baseCurrent = 12.0 + Math.sin(hour / 3) * 6.0;
    } else if (hour >= 19 && hour <= 23) {
      baseCurrent = 9.0;
    } else {
      baseCurrent = 3.5;
    }
    const noise = (Math.random() - 0.5) * 1.5;
    const current = Math.max(0.5, Math.round((baseCurrent + noise) * 10) / 10);
    const voltage = Math.round((229.0 + (Math.random() - 0.5) * 4) * 10) / 10;
    const pf = 0.96 + (Math.random() - 0.5) * 0.04;
    const activePower = Math.round(voltage * current * pf * 10) / 10;
    const apparent = voltage * current;
    const reactivePower = Math.round(Math.sqrt(Math.max(0, apparent * apparent - activePower * activePower)) * 10) / 10;
    cumulativeEnergy += (activePower * 0.5) / 1000.0;

    logs.push({
      id: `TL-HIST-${i}`,
      meterId: demoMeterId,
      ownerUid: 'demo_user',
      voltage,
      current,
      activePower,
      reactivePower,
      powerFactor: Math.round(pf * 100) / 100,
      frequency: 50.01,
      energy: Math.round(cumulativeEnergy * 1000) / 1000,
      relayState: 'ON' as const,
      hasAnomaly: false,
      timestamp: time,
    });
  }

  telemetryStore.set(demoMeterId, logs);
}

ensureDemoMeters();

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'VoltPulse IoT Production Engine',
    activeMetersCount: activeMeters.size,
    timestamp: new Date().toISOString(),
  });
});

// Telemetry Ingestion
app.post('/api/telemetry/ingest', (req, res) => {
  try {
    const payload = req.body || {};
    const apiKey = (req.headers['x-api-key'] as string) || payload.apiKey;
    if (apiKey) payload.apiKey = apiKey;

    const result = processTelemetryIngest(payload);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ingestion failed' });
  }
});

// Fast relay poll
app.get('/api/meters/:meterId/relay-status', (req, res) => {
  const meter = activeMeters.get(req.params.meterId);
  res.json({
    meterId: req.params.meterId,
    relayState: meter ? meter.relayState : 'ON',
    status: meter ? meter.status : 'UNKNOWN',
  });
});

// Remote relay toggle
app.post('/api/meters/:meterId/relay', (req, res) => {
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ error: 'Meter not found' });
  if (req.body.relayState !== 'ON' && req.body.relayState !== 'OFF') {
    return res.status(400).json({ error: 'relayState must be ON or OFF' });
  }
  meter.relayState = req.body.relayState;
  meter.updatedAt = new Date().toISOString();
  activeMeters.set(req.params.meterId, meter);
  res.json({ success: true, meterId: meter.meterId, relayState: meter.relayState });
});

// Meters endpoints
app.get('/api/meters', (req, res) => {
  res.json({ meters: Array.from(activeMeters.values()) });
});

// Register or link new meter (Auto-provision credentials flow)
app.post('/api/meters', (req, res) => {
  try {
    const body = req.body || {};
    const meterId = body.meterId?.trim();
    if (!meterId) {
      return res.status(400).json({ error: 'meterId is required' });
    }

    const now = new Date().toISOString();
    const newMeter = {
      id: meterId,
      meterId,
      ownerUid: body.ownerUid || 'demo_user',
      name: body.name?.trim() || `ESP32 Meter ${meterId}`,
      relayState: 'ON' as const,
      status: 'ONLINE' as const,
      apiKey: body.apiKey || `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      lastHeartbeat: now,
      latitude: Number(body.latitude) || 6.5244,
      longitude: Number(body.longitude) || 3.3792,
      address: body.address || 'Smart Grid Connection Point',
      voltage: 230.0,
      current: 0.0,
      activePower: 0.0,
      reactivePower: 0.0,
      powerFactor: 0.98,
      frequency: 50.0,
      totalEnergy: 0.0,
      hasAnomaly: false,
      anomalyType: 'NONE' as const,
      anomalySeverity: 'LOW' as const,
      anomalyDescription: 'Newly linked meter awaiting stream',
      createdAt: now,
      updatedAt: now,
    };

    activeMeters.set(meterId, newMeter);
    res.status(201).json({ success: true, meter: newMeter });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to register meter' });
  }
});

app.get('/api/meters/:meterId', (req, res) => {
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ error: 'Meter not found' });
  res.json({ meter });
});

app.get('/api/meters/:meterId/telemetry', (req, res) => {
  const logs = telemetryStore.get(req.params.meterId) || [];
  res.json({ logs });
});

app.get('/api/meters/:meterId/anomalies', (req, res) => {
  const alerts = anomalyStore.get(req.params.meterId) || [];
  res.json({ alerts });
});

// Resolve anomaly alert
app.post('/api/meters/:meterId/anomalies/:alertId/resolve', (req, res) => {
  const meterId = req.params.meterId;
  const alertId = req.params.alertId;
  const alerts = anomalyStore.get(meterId) || [];
  const alert = alerts.find(a => a.id === alertId);
  if (alert) {
    alert.status = 'RESOLVED';
  }
  const meter = activeMeters.get(meterId);
  if (meter && alerts.filter(a => a.status === 'ACTIVE').length === 0) {
    meter.hasAnomaly = false;
    meter.anomalyType = 'NONE';
    meter.anomalySeverity = 'LOW';
    meter.anomalyDescription = 'Operating normally';
  }
  res.json({ success: true, alert });
});

// User Notification Settings endpoints
app.get('/api/users/:userId/settings', (req, res) => {
  const userId = req.params.userId;
  const preferences = userPreferencesStore.get(userId) || userPreferencesStore.get('demo_user') || {
    userId,
    emailAlertsEnabled: true,
    alertEmail: 'yinkusben4sure@gmail.com',
    notifyCriticalTheft: true,
    notifyOvercurrentSurge: true,
    notifyVoltageSag: true,
    notifyOfflineHeartbeat: false,
    minimumSeverity: 'HIGH',
    updatedAt: new Date().toISOString(),
  };
  res.json({ preferences });
});

app.post('/api/users/:userId/settings', (req, res) => {
  const userId = req.params.userId;
  const body = req.body || {};
  const preferences: NotificationPreferences = {
    userId,
    emailAlertsEnabled: body.emailAlertsEnabled !== undefined ? Boolean(body.emailAlertsEnabled) : true,
    alertEmail: body.alertEmail || 'yinkusben4sure@gmail.com',
    notifyCriticalTheft: body.notifyCriticalTheft !== undefined ? Boolean(body.notifyCriticalTheft) : true,
    notifyOvercurrentSurge: body.notifyOvercurrentSurge !== undefined ? Boolean(body.notifyOvercurrentSurge) : true,
    notifyVoltageSag: body.notifyVoltageSag !== undefined ? Boolean(body.notifyVoltageSag) : true,
    notifyOfflineHeartbeat: body.notifyOfflineHeartbeat !== undefined ? Boolean(body.notifyOfflineHeartbeat) : false,
    minimumSeverity: body.minimumSeverity || 'HIGH',
    updatedAt: new Date().toISOString(),
  };
  userPreferencesStore.set(userId, preferences);
  res.json({ success: true, preferences });
});

// Catch-all 404 for unhandled API routes (always return JSON, never HTML)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// Global API error handler returning JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Server Error]', err);
  if (req.path.startsWith('/api') || req.url.startsWith('/api')) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
  next(err);
});

// Serve frontend static build in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const isDirectRun = Boolean(process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')));
if (isDirectRun && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoltPulse IoT Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
