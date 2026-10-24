import express from 'express';

const app = express();
app.use(express.json());

// CORS & Preflight
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

// Types & In-Memory Stores
export interface MeterData {
  id: string;
  meterId: string;
  ownerUid: string;
  name: string;
  relayState: 'ON' | 'OFF';
  status: 'ONLINE' | 'OFFLINE';
  apiKey: string;
  lastHeartbeat: string;
  latitude: number;
  longitude: number;
  address: string;
  voltage: number;
  current: number;
  activePower: number;
  reactivePower: number;
  powerFactor: number;
  frequency: number;
  totalEnergy: number;
  hasAnomaly: boolean;
  anomalyType: string;
  anomalySeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  anomalyDescription: string;
  createdAt: string;
  updatedAt: string;
}

const activeMeters = new Map<string, MeterData>();
const telemetryStore = new Map<string, any[]>();
const anomalyStore = new Map<string, any[]>();
const userPreferencesStore = new Map<string, any>();

function seedDemoData() {
  if (activeMeters.size > 0) return;
  const now = Date.now();
  const demoMeterId = 'ESP32-MTR-8842';

  const demoMeter: MeterData = {
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

  userPreferencesStore.set('demo_user', {
    userId: 'demo_user',
    emailAlertsEnabled: true,
    alertEmail: 'yinkusben4sure@gmail.com',
    notifyCriticalTheft: true,
    notifyOvercurrentSurge: true,
    notifyVoltageSag: true,
    notifyOfflineHeartbeat: false,
    minimumSeverity: 'HIGH',
    updatedAt: new Date(now).toISOString(),
  });
}

seedDemoData();

// 1. Health
app.get(['/api/health', '/health'], (req, res) => {
  seedDemoData();
  res.json({
    status: 'online',
    system: 'VoltPulse IoT Production Serverless Router',
    activeMetersCount: activeMeters.size,
    timestamp: new Date().toISOString(),
  });
});

// 2. Telemetry Ingest
app.post(['/api/telemetry/ingest', '/telemetry/ingest'], (req, res) => {
  try {
    seedDemoData();
    const payload = req.body || {};
    const meterId = payload.meterId?.trim();
    if (!meterId) {
      return res.status(400).json({ error: 'meterId is required' });
    }

    const apiKey = (req.headers['x-api-key'] as string) || payload.apiKey;
    const now = new Date().toISOString();

    const voltage = Number(payload.voltage) || 230.0;
    const current = Number(payload.current) || 0.0;
    const powerFactor = payload.powerFactor !== undefined ? Number(payload.powerFactor) : 0.96;
    const activePower = payload.activePower !== undefined ? Number(payload.activePower) : Math.round(voltage * current * powerFactor * 10) / 10;
    
    const apparent = voltage * current;
    let reactivePower = payload.reactivePower !== undefined ? Number(payload.reactivePower) : 0;
    if (payload.reactivePower === undefined && apparent >= Math.abs(activePower)) {
      reactivePower = Math.round(Math.sqrt(Math.max(0, apparent * apparent - activePower * activePower)) * 10) / 10;
    }

    const frequency = Number(payload.frequency) || 50.0;
    let meter = activeMeters.get(meterId);
    const relayState = payload.relayState || (meter ? meter.relayState : 'ON');
    const energy = payload.energy !== undefined ? Number(payload.energy) : (meter ? Math.round((meter.totalEnergy + 0.005) * 1000) / 1000 : 12.45);

    let hasAnomaly = false;
    let anomalyType = 'NONE';
    let anomalySeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let anomalyDesc = 'Operating normally';
    let recommendation = 'Routine periodic monitoring active.';

    if (relayState === 'OFF' && (current > 0.8 || Math.abs(activePower) > 100)) {
      hasAnomaly = true;
      anomalyType = 'UNMETERED_BYPASS';
      anomalySeverity = 'CRITICAL';
      anomalyDesc = `Current of ${current.toFixed(2)}A detected while relay is OFF`;
      recommendation = 'Check physical wiring across relay contacts.';
    } else if (current > 42 || activePower > 9500) {
      hasAnomaly = true;
      anomalyType = 'SURGE_SPIKE';
      anomalySeverity = 'CRITICAL';
      anomalyDesc = `Current ${current.toFixed(1)}A exceeds residential service limit`;
      recommendation = 'Switch off high-draw loads immediately.';
    } else if (voltage < 190 && current > 20) {
      hasAnomaly = true;
      anomalyType = 'VOLTAGE_DROP_HIGH_DRAW';
      anomalySeverity = 'HIGH';
      anomalyDesc = `Severe voltage sag ${voltage.toFixed(1)}V under load`;
      recommendation = 'Check feeder cable.';
    }

    if (!meter) {
      meter = {
        id: meterId,
        meterId,
        ownerUid: payload.ownerUid || 'demo_user',
        name: payload.name || `ESP32 Meter ${meterId}`,
        relayState,
        status: 'ONLINE',
        apiKey: apiKey || `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        lastHeartbeat: now,
        latitude: payload.latitude !== undefined ? Number(payload.latitude) : 6.5244,
        longitude: payload.longitude !== undefined ? Number(payload.longitude) : 3.3792,
        address: payload.address || 'Smart Grid Connection Point',
        voltage,
        current,
        activePower,
        reactivePower,
        powerFactor,
        frequency,
        totalEnergy: energy,
        hasAnomaly,
        anomalyType,
        anomalySeverity,
        anomalyDescription: anomalyDesc,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      meter.voltage = voltage;
      meter.current = current;
      meter.activePower = activePower;
      meter.reactivePower = reactivePower;
      meter.powerFactor = powerFactor;
      meter.frequency = frequency;
      meter.totalEnergy = energy;
      meter.relayState = relayState;
      meter.status = 'ONLINE';
      meter.lastHeartbeat = now;
      meter.updatedAt = now;
      if (apiKey) meter.apiKey = apiKey;
      meter.hasAnomaly = hasAnomaly;
      meter.anomalyType = anomalyType;
      meter.anomalySeverity = anomalySeverity;
      meter.anomalyDescription = anomalyDesc;
    }

    activeMeters.set(meterId, meter);

    const logId = `TL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const log = {
      id: logId,
      meterId,
      ownerUid: meter.ownerUid,
      voltage,
      current,
      activePower,
      reactivePower,
      powerFactor,
      frequency,
      energy,
      relayState: meter.relayState,
      hasAnomaly,
      timestamp: now,
    };

    const meterLogs = telemetryStore.get(meterId) || [];
    meterLogs.push(log);
    if (meterLogs.length > 200) meterLogs.shift();
    telemetryStore.set(meterId, meterLogs);

    res.json({
      success: true,
      meterId,
      relayState: meter.relayState,
      anomalyDetected: hasAnomaly,
      anomaly: {
        hasAnomaly,
        type: anomalyType,
        severity: anomalySeverity,
        title: hasAnomaly ? anomalyType : 'Optimal Grid Operation',
        description: anomalyDesc,
        recommendation,
      },
      meter,
      log,
      telemetryLog: log,
      timestamp: now,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ingest failed' });
  }
});

// Telemetry query routes matching ingest.ts
app.get(['/api/telemetry/latest', '/telemetry/latest'], (req, res) => {
  seedDemoData();
  const meterId = (req.query.meterId as string)?.trim();
  if (!meterId) {
    return res.json({ success: true, meters: Array.from(activeMeters.values()) });
  }
  const meter = activeMeters.get(meterId) || null;
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

app.get(['/api/telemetry/meters', '/telemetry/meters'], (req, res) => {
  seedDemoData();
  res.json({
    success: true,
    meters: Array.from(activeMeters.values()),
    count: activeMeters.size,
    timestamp: new Date().toISOString(),
  });
});

// 3. Relay status fast poll
app.get(['/api/meters/:meterId/relay-status', '/meters/:meterId/relay-status'], (req, res) => {
  seedDemoData();
  const meter = activeMeters.get(req.params.meterId);
  res.json({
    meterId: req.params.meterId,
    relayState: meter ? meter.relayState : 'ON',
    status: meter ? meter.status : 'UNKNOWN',
  });
});

// 4. Remote relay toggle
app.post(['/api/meters/:meterId/relay', '/meters/:meterId/relay'], (req, res) => {
  seedDemoData();
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

// 5. Meters listing & creation
app.get(['/api/meters', '/meters'], (req, res) => {
  seedDemoData();
  res.json({ meters: Array.from(activeMeters.values()) });
});

app.post(['/api/meters', '/meters'], (req, res) => {
  try {
    seedDemoData();
    const body = req.body || {};
    const meterId = body.meterId?.trim();
    if (!meterId) {
      return res.status(400).json({ error: 'meterId is required' });
    }

    const now = new Date().toISOString();
    const newMeter: MeterData = {
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
      address: body.address || 'Smart Grid Connection Point',
      voltage: Number(body.voltage) || 230.0,
      current: Number(body.current) || 0.0,
      activePower: Number(body.activePower) || 0.0,
      reactivePower: Number(body.reactivePower) || 0.0,
      powerFactor: Number(body.powerFactor) || 0.98,
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
  seedDemoData();
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ error: 'Meter not found' });
  res.json({ meter });
});

// 6. Telemetry History
app.get(['/api/meters/:meterId/telemetry', '/meters/:meterId/telemetry'], (req, res) => {
  const logs = telemetryStore.get(req.params.meterId) || [];
  res.json({ logs });
});

app.get(['/api/meters/:meterId/anomalies', '/meters/:meterId/anomalies'], (req, res) => {
  const alerts = anomalyStore.get(req.params.meterId) || [];
  res.json({ alerts });
});

// 7. Resolve Anomaly
app.post(['/api/meters/:meterId/anomalies/:alertId/resolve', '/meters/:meterId/anomalies/:alertId/resolve'], (req, res) => {
  const { meterId, alertId } = req.params;
  const alerts = anomalyStore.get(meterId) || [];
  const alert = alerts.find(a => a.id === alertId);
  if (alert) alert.status = 'RESOLVED';
  const meter = activeMeters.get(meterId);
  if (meter && alerts.filter(a => a.status === 'ACTIVE').length === 0) {
    meter.hasAnomaly = false;
    meter.anomalyType = 'NONE';
    meter.anomalySeverity = 'LOW';
    meter.anomalyDescription = 'Operating normally';
  }
  res.json({ success: true, alert });
});

// 8. User Settings
app.get(['/api/users/:userId/settings', '/users/:userId/settings'], (req, res) => {
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

app.post(['/api/users/:userId/settings', '/users/:userId/settings'], (req, res) => {
  const userId = req.params.userId;
  const body = req.body || {};
  const preferences = {
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

// Catch-all API 404 (always return JSON)
app.all('*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

// Global API error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Router Error]', err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

// Export default handler function compatible with both Vercel serverless and Express
export default function handler(req: any, res: any) {
  return app(req, res);
}
