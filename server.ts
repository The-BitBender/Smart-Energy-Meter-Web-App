import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { activeMeters, anomalyStore, processTelemetryIngest, telemetryStore, userPreferencesStore } from './src/server/telemetryHandler.js';
import type { NotificationPreferences } from './src/types/energy.js';

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
    const payload = req.body;
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
  const body = req.body;
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

// Serve frontend static build in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VoltPulse IoT Server running on http://0.0.0.0:${PORT}`);
});
