import express from 'express';
import { activeMeters, anomalyStore, processTelemetryIngest, telemetryStore, userPreferencesStore } from '../src/server/telemetryHandler';
import type { Meter, NotificationPreferences } from '../src/types/energy';

const app = express();

app.use(express.json());

// CORS & Preflight handling
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Normalize rewritten paths from Vercel if necessary
app.use((req, res, next) => {
  const forwarded = req.headers['x-forwarded-url'] as string || req.headers['x-matched-path'] as string;
  if (forwarded && req.url === '/api/index') {
    req.url = forwarded;
  }
  next();
});

// Helper to seed initial demo meter if cache is empty
function ensureDemoMeters() {
  if (activeMeters.size > 0) return;

  const demoMeterId = 'ESP32-MTR-8842';
  const now = Date.now();

  const demoMeter: Meter = {
    id: demoMeterId,
    meterId: demoMeterId,
    ownerUid: 'demo_user',
    name: 'Main Feeder Panel - Workshop A',
    relayState: 'ON',
    status: 'ONLINE',
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
    anomalyType: 'NONE',
    anomalySeverity: 'LOW',
    anomalyDescription: 'Operating normally',
    createdAt: new Date(now - 86400000 * 7).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  activeMeters.set(demoMeterId, demoMeter);
}

// 1. Health check
app.get(['/api/health', '/health'], (req, res) => {
  ensureDemoMeters();
  res.json({
    status: 'online',
    system: 'VoltPulse IoT Ingestion Engine (Vercel Serverless)',
    activeMetersCount: activeMeters.size,
    timestamp: new Date().toISOString(),
  });
});

// 2. Telemetry ingestion from physical ESP32 or simulator
app.post(['/api/telemetry/ingest', '/telemetry/ingest'], (req, res) => {
  try {
    ensureDemoMeters();
    const payload = req.body || {};
    const apiKey = (req.headers['x-api-key'] as string) || payload.apiKey;
    if (apiKey) payload.apiKey = apiKey;

    const result = processTelemetryIngest(payload);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ingestion failed' });
  }
});

// 3. Fast relay polling for ESP32
app.get(['/api/meters/:meterId/relay-status', '/meters/:meterId/relay-status'], (req, res) => {
  ensureDemoMeters();
  const meter = activeMeters.get(req.params.meterId);
  res.json({
    meterId: req.params.meterId,
    relayState: meter ? meter.relayState : 'ON',
    status: meter ? meter.status : 'UNKNOWN',
  });
});

// 4. Remote relay toggle
app.post(['/api/meters/:meterId/relay', '/meters/:meterId/relay'], (req, res) => {
  ensureDemoMeters();
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

// 5. Meters list & register
app.get(['/api/meters', '/meters'], (req, res) => {
  ensureDemoMeters();
  res.json({ meters: Array.from(activeMeters.values()) });
});

app.post(['/api/meters', '/meters'], (req, res) => {
  try {
    ensureDemoMeters();
    const body = req.body || {};
    const meterId = body.meterId?.trim();
    if (!meterId) {
      return res.status(400).json({ error: 'meterId is required' });
    }

    const now = new Date().toISOString();
    const newMeter: Meter = {
      id: meterId,
      meterId,
      ownerUid: body.ownerUid || 'demo_user',
      name: body.name || `Smart Meter ${meterId}`,
      relayState: 'ON',
      status: 'ONLINE',
      apiKey: body.apiKey || `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      lastHeartbeat: now,
      latitude: Number(body.latitude) || 6.5244,
      longitude: Number(body.longitude) || 3.3792,
      address: body.address || 'Victoria Island Substation 4, Lagos',
      voltage: Number(body.voltage) || 230.0,
      current: Number(body.current) || 0.0,
      activePower: Number(body.activePower) || 0.0,
      reactivePower: Number(body.reactivePower) || 0.0,
      powerFactor: Number(body.powerFactor) || 0.96,
      frequency: Number(body.frequency) || 50.0,
      totalEnergy: Number(body.totalEnergy) || 0.0,
      hasAnomaly: false,
      anomalyType: 'NONE',
      anomalySeverity: 'LOW',
      anomalyDescription: 'Operating normally',
      createdAt: now,
      updatedAt: now,
    };

    activeMeters.set(meterId, newMeter);
    res.status(201).json({ success: true, meter: newMeter });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save meter' });
  }
});

app.get(['/api/meters/:meterId', '/meters/:meterId'], (req, res) => {
  ensureDemoMeters();
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ error: 'Meter not found' });
  res.json({ meter });
});

// 6. Telemetry history
app.get(['/api/telemetry/history', '/telemetry/history'], (req, res) => {
  ensureDemoMeters();
  const meterId = req.query.meterId as string;
  if (!meterId) {
    const all = Array.from(telemetryStore.values()).flat();
    return res.json({ logs: all.slice(-100) });
  }
  const logs = telemetryStore.get(meterId) || [];
  res.json({ logs });
});

// 7. Anomalies list
app.get(['/api/anomalies', '/anomalies'], (req, res) => {
  ensureDemoMeters();
  const meterId = req.query.meterId as string;
  if (meterId) {
    return res.json({ anomalies: anomalyStore.get(meterId) || [] });
  }
  const all = Array.from(anomalyStore.values()).flat();
  res.json({ anomalies: all });
});

// 8. User preferences
app.get(['/api/preferences', '/preferences'], (req, res) => {
  const userId = (req.query.userId as string) || 'demo_user';
  const prefs = userPreferencesStore.get(userId) || {
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
  res.json({ preferences: prefs });
});

app.post(['/api/preferences', '/preferences'], (req, res) => {
  const body = req.body || {};
  const userId = body.userId || 'demo_user';
  const existing = userPreferencesStore.get(userId) || {
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

  const preferences: NotificationPreferences = {
    ...existing,
    ...body,
    userId,
    updatedAt: new Date().toISOString(),
  };

  userPreferencesStore.set(userId, preferences);
  res.json({ success: true, preferences });
});

// Catch-all for API 404 (always JSON)
app.all('*', (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl || req.url}` });
});

// Global API error handler (always JSON)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Vercel API Error]', err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

export default app;
