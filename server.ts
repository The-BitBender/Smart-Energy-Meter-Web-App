import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  activeMeters, 
  anomalyStore, 
  processTelemetryIngest, 
  telemetryStore, 
  userPreferencesStore,
  deleteMeter,
  rotateMeterApiKey,
  updateMeter,
  IngestionError,
  generateApiKey,
  evaluateOnlineStatus,
  getNextMeterId,
  incrementMetersCreated,
  saveMetersToDisk,
  loadMetersFromDisk,
  syncMeters,
  deletedMeterIds,
  resetAllMeters
} from './src/server/telemetryHandler';
import type { NotificationPreferences, Meter } from './src/types/energy';

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

// Do not auto-seed demo meters so clean/deleted databases remain empty
function ensureDemoMeters() {
  return;
}

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
    const action = (req.query.action as string) || payload.action;

    if (action === 'reset_all') {
      resetAllMeters();
      return res.json({ success: true, reset: true });
    }

    if (action === 'delete_meter') {
      const targetId = ((req.query.meterId as string) || payload.meterId || '').trim();
      if (targetId) {
        deleteMeter(targetId);
      }
      return res.json({ success: true, deleted: true, meterId: targetId });
    }

    if (action === 'sync_meters') {
      const metersToSync = Array.isArray(payload.meters) ? payload.meters : (payload.meter ? [payload.meter] : []);
      syncMeters(metersToSync, Boolean(payload.replaceAll), payload.deletedIds);
      return res.json({ success: true, count: activeMeters.size });
    }

    if (action === 'register_meter') {
      const meterId = (payload.meterId?.trim()) || getNextMeterId();
      deletedMeterIds.delete(meterId);
      telemetryStore.delete(meterId);
      anomalyStore.delete(meterId);
      const now = new Date().toISOString();
      const assignedApiKey = (payload.apiKey && typeof payload.apiKey === 'string' && payload.apiKey.trim())
        ? payload.apiKey.trim()
        : generateApiKey();
      const newMeter: Meter = {
        id: meterId,
        meterId,
        ownerUid: payload.ownerUid || 'demo_user',
        name: payload.name?.trim() || `Smart Meter ${meterId}`,
        relayState: 'ON',
        status: 'OFFLINE',
        apiKey: assignedApiKey,
        lastHeartbeat: null as any,
        latitude: Number(payload.latitude) || 6.5244,
        longitude: Number(payload.longitude) || 3.3792,
        address: payload.address || 'Smart Grid Connection Point',
        voltage: 0.0,
        current: 0.0,
        activePower: 0.0,
        reactivePower: 0.0,
        powerFactor: 0.0,
        frequency: 0.0,
        totalEnergy: 0.0,
        hasAnomaly: false,
        anomalyType: 'NONE',
        anomalySeverity: 'LOW',
        anomalyDescription: 'Newly configured meter awaiting initial telemetry stream',
        createdAt: now,
        updatedAt: now,
      };
      activeMeters.set(meterId, newMeter);
      saveMetersToDisk();
      return res.status(201).json({ success: true, meter: newMeter });
    }

    const apiKey = (req.headers['x-api-key'] as string) || payload.apiKey;

    const result = processTelemetryIngest(payload, apiKey);
    res.json(result);
  } catch (err: any) {
    const statusCode = err instanceof IngestionError ? err.statusCode : 400;
    res.status(statusCode).json({ success: false, error: err.message || 'Ingestion failed' });
  }
});

// Fast telemetry query for live UI sync
app.get('/api/telemetry/latest', (req, res) => {
  ensureDemoMeters();
  const meterId = (req.query.meterId as string)?.trim();
  if (!meterId) {
    const all = Array.from(activeMeters.values()).map(m => {
      m.status = evaluateOnlineStatus(m.lastHeartbeat);
      return m;
    });
    return res.json({ success: true, meters: all });
  }
  const meter = activeMeters.get(meterId) || null;
  if (meter) {
    meter.status = evaluateOnlineStatus(meter.lastHeartbeat);
  }
  const logs = telemetryStore.get(meterId) || [];
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
  res.json({
    success: true,
    exists: !!meter,
    meter,
    latestLog,
    logs: logs.slice(-50),
    alerts: anomalyStore.get(meterId) || [],
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/telemetry/meters', (req, res) => {
  ensureDemoMeters();
  const all = Array.from(activeMeters.values()).map(m => {
    m.status = evaluateOnlineStatus(m.lastHeartbeat);
    return m;
  });
  res.json({
    success: true,
    meters: all,
    count: all.length,
    timestamp: new Date().toISOString(),
  });
});

// Fast relay poll
app.get('/api/meters/:meterId/relay-status', (req, res) => {
  const meter = activeMeters.get(req.params.meterId);
  const status = meter ? evaluateOnlineStatus(meter.lastHeartbeat) : 'UNKNOWN';
  res.json({
    meterId: req.params.meterId,
    relayState: meter ? meter.relayState : 'ON',
    status,
  });
});

// Remote relay toggle
app.post('/api/meters/:meterId/relay', (req, res) => {
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ success: false, error: 'Meter not found' });
  if (req.body.relayState !== 'ON' && req.body.relayState !== 'OFF') {
    return res.status(400).json({ success: false, error: 'relayState must be ON or OFF' });
  }
  meter.relayState = req.body.relayState;
  meter.updatedAt = new Date().toISOString();
  activeMeters.set(req.params.meterId, meter);
  res.json({ success: true, meterId: meter.meterId, relayState: meter.relayState });
});

// Rotate or set API key for a meter - strictly auto-generated with fixed length (16 chars)
app.post('/api/meters/:meterId/rotate-key', (req, res) => {
  try {
    const newKey = rotateMeterApiKey(req.params.meterId);
    const meter = activeMeters.get(req.params.meterId);
    res.json({ success: true, meterId: req.params.meterId, apiKey: newKey, meter });
  } catch (err: any) {
    const statusCode = err instanceof IngestionError ? err.statusCode : 400;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

// Delete a meter permanently
app.delete('/api/meters/:meterId', (req, res) => {
  const deleted = deleteMeter(req.params.meterId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: `Meter '${req.params.meterId}' not found` });
  }
  res.json({ 
    success: true, 
    meterId: req.params.meterId, 
    message: `Meter '${req.params.meterId}' deleted successfully.` 
  });
});

// Update meter metadata
app.put('/api/meters/:meterId', (req, res) => {
  try {
    const updated = updateMeter(req.params.meterId, req.body || {});
    res.json({ success: true, meter: updated });
  } catch (err: any) {
    const statusCode = err instanceof IngestionError ? err.statusCode : 400;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

// Meters endpoints
app.get('/api/meters', (req, res) => {
  res.json({ meters: Array.from(activeMeters.values()) });
});

// Next auto-generated Meter ID based on total meters created across all accounts
app.get('/api/meters/next-id', (req, res) => {
  res.json({
    success: true,
    nextMeterId: getNextMeterId(),
    totalMetersCount: activeMeters.size,
  });
});

// Reset all meters and telemetry logs
app.post('/api/meters/reset', (req, res) => {
  resetAllMeters();
  res.json({ success: true, reset: true });
});

// Register or link new meter (Auto-provision credentials flow)
app.post('/api/meters', (req, res) => {
  try {
    const body = req.body || {};
    const meterId = (body.meterId?.trim()) || getNextMeterId();
    deletedMeterIds.delete(meterId);
    telemetryStore.delete(meterId);
    anomalyStore.delete(meterId);
    incrementMetersCreated();

    const assignedApiKey = (body.apiKey && typeof body.apiKey === 'string' && body.apiKey.trim())
      ? body.apiKey.trim()
      : generateApiKey();

    const now = new Date().toISOString();
    // All dashboard metrics initialize strictly to 0.0, status to OFFLINE, lastHeartbeat to null
    const newMeter = {
      id: meterId,
      meterId,
      ownerUid: body.ownerUid || 'demo_user',
      name: body.name?.trim() || `Smart Meter ${meterId}`,
      relayState: 'ON' as const,
      status: 'OFFLINE' as const,
      apiKey: assignedApiKey,
      lastHeartbeat: null as any,
      latitude: Number(body.latitude) || 6.5244,
      longitude: Number(body.longitude) || 3.3792,
      address: body.address || 'Smart Grid Connection Point',
      voltage: 0.0,
      current: 0.0,
      activePower: 0.0,
      reactivePower: 0.0,
      powerFactor: 0.0,
      frequency: 0.0,
      totalEnergy: 0.0,
      hasAnomaly: false,
      anomalyType: 'NONE' as const,
      anomalySeverity: 'LOW' as const,
      anomalyDescription: 'Newly configured meter awaiting initial telemetry stream',
      createdAt: now,
      updatedAt: now,
    };

    activeMeters.set(meterId, newMeter);
    saveMetersToDisk();
    res.status(201).json({ success: true, meter: newMeter });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to register meter' });
  }
});

// Bulk sync meters from Firestore / UI
app.post('/api/meters/sync', (req, res) => {
  try {
    const body = req.body || {};
    const metersToSync = Array.isArray(body.meters) ? body.meters : (body.meter ? [body.meter] : []);
    syncMeters(metersToSync, Boolean(body.replaceAll), body.deletedIds);
    res.json({ success: true, count: activeMeters.size, meters: Array.from(activeMeters.values()) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
