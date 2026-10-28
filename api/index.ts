import express from 'express';
import fs from 'fs';
import path from 'path';

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

const CACHE_FILE = path.join(process.platform === 'win32' ? process.cwd() : '/tmp', 'volt_pulse_meters.json');

function saveMetersToDisk() {
  try {
    const list = Array.from(activeMeters.values());
    fs.writeFileSync(CACHE_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

function loadMetersFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((m: MeterData) => {
          if (m && m.meterId && !activeMeters.has(m.meterId)) {
            activeMeters.set(m.meterId, m);
          }
        });
      }
    }
  } catch {}
}

loadMetersFromDisk();

export const ONLINE_WINDOW_MS = 30 * 60 * 1000; // 30-minute window
export function evaluateOnline(lastHeartbeat?: string | null): 'ONLINE' | 'OFFLINE' {
  if (!lastHeartbeat) return 'OFFLINE';
  const t = new Date(lastHeartbeat).getTime();
  if (isNaN(t) || t <= 0) return 'OFFLINE';
  return (Date.now() - t) <= ONLINE_WINDOW_MS ? 'ONLINE' : 'OFFLINE';
}

export function generate16CharKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'VP-';
  for (let i = 0; i < 13; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

export function getNextMeterId(): string {
  let maxSeq = 0;
  for (const mId of activeMeters.keys()) {
    const match = mId.match(/^MTR-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const nextNum = Math.max(activeMeters.size + 1, maxSeq + 1);
  return `MTR-${String(nextNum).padStart(4, '0')}`;
}

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
      return res.status(400).json({ success: false, error: "Validation failed: 'meterId' is required" });
    }

    // STRICT CHECK: Meter MUST already exist
    let meter = activeMeters.get(meterId);
    if (!meter) {
      loadMetersFromDisk();
      meter = activeMeters.get(meterId);
    }
    if (!meter) {
      return res.status(404).json({
        success: false,
        error: `Meter '${meterId}' is not registered. Please register the meter in the VoltPulse dashboard before streaming telemetry.`,
      });
    }

    // STRICT AUTHENTICATION: API key MUST match
    const incomingApiKey = ((req.headers['x-api-key'] as string) || payload.apiKey || '').trim();
    if (!incomingApiKey) {
      return res.status(401).json({
        success: false,
        error: `Authentication failed: Missing API Key for meter '${meterId}'. Include 'X-API-Key' header or 'apiKey' field.`,
      });
    }

    if (incomingApiKey !== meter.apiKey) {
      return res.status(401).json({
        success: false,
        error: `Authentication failed: Invalid API key for meter '${meterId}'. Verify your key in Dashboard > Settings.`,
      });
    }

    // Handle remote relay toggle
    if (payload.action === 'relay_toggle' || (payload.relayState && payload.voltage === undefined && payload.current === undefined)) {
      if (payload.relayState !== 'ON' && payload.relayState !== 'OFF') {
        return res.status(400).json({ success: false, error: "relayState must be 'ON' or 'OFF'" });
      }
      meter.relayState = payload.relayState;
      meter.updatedAt = new Date().toISOString();
      return res.json({ success: true, meterId, relayState: meter.relayState });
    }

    // Metrics validation
    if (payload.voltage === undefined && payload.current === undefined && payload.activePower === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: Telemetry payload must include at least voltage, current, or activePower readings',
      });
    }

    const now = new Date().toISOString();

    let voltage = meter.voltage;
    if (payload.voltage !== undefined) {
      const parsedV = Number(payload.voltage);
      if (!Number.isFinite(parsedV) || isNaN(parsedV) || parsedV < 0 || parsedV > 600) {
        return res.status(400).json({ success: false, error: `'voltage' must be a valid number between 0V and 600V` });
      }
      voltage = Math.round(parsedV * 10) / 10;
    }

    let current = meter.current;
    if (payload.current !== undefined) {
      const parsedI = Number(payload.current);
      if (!Number.isFinite(parsedI) || isNaN(parsedI) || parsedI < 0 || parsedI > 500) {
        return res.status(400).json({ success: false, error: `'current' must be a valid number between 0A and 500A` });
      }
      current = Math.round(parsedI * 100) / 100;
    }

    let powerFactor = meter.powerFactor || 0.96;
    if (payload.powerFactor !== undefined) {
      const parsedPF = Number(payload.powerFactor);
      if (!Number.isFinite(parsedPF) || isNaN(parsedPF) || parsedPF < -1.0 || parsedPF > 1.0) {
        return res.status(400).json({ success: false, error: `'powerFactor' must be between -1.0 and 1.0` });
      }
      powerFactor = Math.round(parsedPF * 100) / 100;
    }

    let activePower: number;
    if (payload.activePower !== undefined) {
      const parsedP = Number(payload.activePower);
      if (!Number.isFinite(parsedP) || isNaN(parsedP) || parsedP < -50000 || parsedP > 200000) {
        return res.status(400).json({ success: false, error: `'activePower' must be a valid number` });
      }
      activePower = Math.round(parsedP * 10) / 10;
    } else {
      activePower = Math.round(voltage * current * powerFactor * 10) / 10;
    }

    const apparent = Math.abs(voltage * current);
    let reactivePower: number;
    if (payload.reactivePower !== undefined) {
      const parsedQ = Number(payload.reactivePower);
      if (!Number.isFinite(parsedQ) || isNaN(parsedQ)) {
        return res.status(400).json({ success: false, error: `'reactivePower' must be a valid number` });
      }
      reactivePower = Math.round(parsedQ * 10) / 10;
    } else if (apparent >= Math.abs(activePower)) {
      reactivePower = Math.round(Math.sqrt(Math.max(0, apparent * apparent - activePower * activePower)) * 10) / 10;
    } else {
      reactivePower = 0;
    }

    let frequency = meter.frequency || 50.0;
    if (payload.frequency !== undefined) {
      const parsedF = Number(payload.frequency);
      if (!Number.isFinite(parsedF) || isNaN(parsedF) || parsedF < 40.0 || parsedF > 75.0) {
        return res.status(400).json({ success: false, error: `'frequency' must be between 40Hz and 75Hz` });
      }
      frequency = Math.round(parsedF * 100) / 100;
    }

    let relayState = meter.relayState;
    if (payload.relayState !== undefined) {
      if (payload.relayState !== 'ON' && payload.relayState !== 'OFF') {
        return res.status(400).json({ success: false, error: `'relayState' must be 'ON' or 'OFF'` });
      }
      relayState = payload.relayState;
    }

    let energy = meter.totalEnergy;
    if (payload.energy !== undefined) {
      const parsedE = Number(payload.energy);
      if (!Number.isFinite(parsedE) || isNaN(parsedE) || parsedE < 0) {
        return res.status(400).json({ success: false, error: `'energy' must be a positive number` });
      }
      energy = Math.round(parsedE * 1000) / 1000;
    } else {
      energy = Math.round((meter.totalEnergy + 0.005) * 1000) / 1000;
    }

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
    } else if (voltage >= 250) {
      hasAnomaly = true;
      anomalyType = 'OVERVOLTAGE';
      anomalySeverity = 'CRITICAL';
      anomalyDesc = `Critical over-voltage hazard: line voltage reached ${voltage.toFixed(1)}V (>= 250V threshold). High risk of electronics destruction and electrical fire.`;
      recommendation = 'Remotely trip meter relay or isolate sensitive appliances immediately.';
    } else if (voltage < 180) {
      hasAnomaly = true;
      anomalyType = 'UNDERVOLTAGE';
      anomalySeverity = 'CRITICAL';
      anomalyDesc = `Critical under-voltage sag: line voltage dropped to ${voltage.toFixed(1)}V (< 180V threshold). Risk of motor burnout and power supply failure.`;
      recommendation = 'Disconnect heavy inductive loads and compressors immediately.';
    } else if (voltage >= 180 && voltage < 207) {
      hasAnomaly = true;
      anomalyType = 'UNDERVOLTAGE';
      anomalySeverity = 'MEDIUM';
      anomalyDesc = `Under-voltage warning: line voltage sagged to ${voltage.toFixed(1)}V (within 180V - 207V warning band).`;
      recommendation = 'Check transformer tap and monitor line voltage.';
    } else if (voltage >= 242 && voltage < 250) {
      hasAnomaly = true;
      anomalyType = 'OVERVOLTAGE';
      anomalySeverity = 'MEDIUM';
      anomalyDesc = `Over-voltage warning: line voltage elevated to ${voltage.toFixed(1)}V (approaching 250V critical limit).`;
      recommendation = 'Monitor grid regulation; ensure surge suppression active.';
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
    meter.hasAnomaly = hasAnomaly;
    meter.anomalyType = anomalyType;
    meter.anomalySeverity = anomalySeverity;
    meter.anomalyDescription = anomalyDesc;

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

    let anomalyAlert: any = null;
    if (hasAnomaly) {
      const alertId = `ALT-${Date.now()}`;
      anomalyAlert = {
        id: alertId,
        meterId,
        ownerUid: meter.ownerUid,
        type: anomalyType,
        severity: anomalySeverity,
        title: hasAnomaly ? anomalyType : 'Optimal Grid Operation',
        description: anomalyDesc,
        status: 'ACTIVE',
        telemetrySnapshot: {
          voltage,
          current,
          activePower,
          reactivePower,
          energy,
          timestamp: now,
        },
        createdAt: now,
      };
      const alerts = anomalyStore.get(meterId) || [];
      alerts.unshift(anomalyAlert);
      if (alerts.length > 50) alerts.pop();
      anomalyStore.set(meterId, alerts);
    }

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
      anomalyAlert,
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
    const list = Array.from(activeMeters.values()).map(m => ({ ...m, status: evaluateOnline(m.lastHeartbeat) }));
    return res.json({ success: true, meters: list });
  }
  const meter = activeMeters.get(meterId) || null;
  if (meter) {
    meter.status = evaluateOnline(meter.lastHeartbeat);
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

app.get(['/api/telemetry/meters', '/telemetry/meters'], (req, res) => {
  seedDemoData();
  const list = Array.from(activeMeters.values()).map(m => ({ ...m, status: evaluateOnline(m.lastHeartbeat) }));
  res.json({
    success: true,
    meters: list,
    count: list.length,
    timestamp: new Date().toISOString(),
  });
});

// 3. Relay status fast poll
app.get(['/api/meters/:meterId/relay-status', '/meters/:meterId/relay-status'], (req, res) => {
  seedDemoData();
  const meter = activeMeters.get(req.params.meterId);
  const status = meter ? evaluateOnline(meter.lastHeartbeat) : 'UNKNOWN';
  res.json({
    meterId: req.params.meterId,
    relayState: meter ? meter.relayState : 'ON',
    status,
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

// Next auto-generated Meter ID based on total meters created across all accounts
app.get(['/api/meters/next-id', '/meters/next-id'], (req, res) => {
  seedDemoData();
  res.json({
    success: true,
    nextMeterId: getNextMeterId(),
    totalMetersCount: activeMeters.size,
  });
});

app.post(['/api/meters', '/meters'], (req, res) => {
  try {
    seedDemoData();
    const body = req.body || {};
    const meterId = (body.meterId?.trim()) || getNextMeterId();
    const now = new Date().toISOString();

    // Always auto-generate 16-character secure API key if not provided
    const assignedApiKey = (body.apiKey && typeof body.apiKey === 'string' && body.apiKey.trim())
      ? body.apiKey.trim()
      : generate16CharKey();

    const newMeter: MeterData = {
      id: meterId,
      meterId,
      ownerUid: body.ownerUid || 'demo_user',
      name: body.name || `Smart Meter ${meterId}`,
      relayState: 'ON',
      status: 'OFFLINE',
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
      anomalyType: 'NONE',
      anomalySeverity: 'LOW',
      anomalyDescription: 'Newly configured meter awaiting initial telemetry stream',
      createdAt: now,
      updatedAt: now,
    };

    activeMeters.set(meterId, newMeter);
    saveMetersToDisk();
    res.status(201).json({ success: true, meter: newMeter });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save meter' });
  }
});

// Bulk sync meters from Firestore / UI
app.post(['/api/meters/sync', '/meters/sync'], (req, res) => {
  try {
    seedDemoData();
    const body = req.body || {};
    const metersToSync = Array.isArray(body.meters) ? body.meters : (body.meter ? [body.meter] : []);
    for (const m of metersToSync) {
      if (m && m.meterId) {
        const existing = activeMeters.get(m.meterId);
        if (!existing) {
          activeMeters.set(m.meterId, {
            ...m,
            apiKey: m.apiKey || generate16CharKey(),
            status: evaluateOnline(m.lastHeartbeat),
          });
        } else {
          activeMeters.set(m.meterId, {
            ...existing,
            ...m,
            apiKey: m.apiKey || existing.apiKey,
          });
        }
      }
    }
    saveMetersToDisk();
    res.json({ success: true, count: activeMeters.size });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get(['/api/meters/:meterId', '/meters/:meterId'], (req, res) => {
  seedDemoData();
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ error: 'Meter not found' });
  res.json({ meter });
});

// Rotate API key - strictly auto-generated with fixed length of 16 characters
app.post(['/api/meters/:meterId/rotate-key', '/meters/:meterId/rotate-key'], (req, res) => {
  seedDemoData();
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ success: false, error: 'Meter not found' });
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let newKey = 'VP-';
  for (let i = 0; i < 13; i++) {
    newKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  meter.apiKey = newKey;
  meter.updatedAt = new Date().toISOString();
  activeMeters.set(req.params.meterId, meter);
  res.json({ success: true, meterId: req.params.meterId, apiKey: newKey, meter });
});

// Delete meter
app.delete(['/api/meters/:meterId', '/meters/:meterId'], (req, res) => {
  seedDemoData();
  const targetId = req.params.meterId;
  if (!activeMeters.has(targetId)) {
    return res.status(404).json({ success: false, error: `Meter '${targetId}' not found` });
  }
  activeMeters.delete(targetId);
  telemetryStore.delete(targetId);
  anomalyStore.delete(targetId);
  res.json({ success: true, meterId: targetId, message: `Meter '${targetId}' deleted successfully.` });
});

// Update meter
app.put(['/api/meters/:meterId', '/meters/:meterId'], (req, res) => {
  seedDemoData();
  const meter = activeMeters.get(req.params.meterId);
  if (!meter) return res.status(404).json({ success: false, error: 'Meter not found' });
  const body = req.body || {};
  if (body.name) meter.name = body.name.trim();
  if (body.address) meter.address = body.address.trim();
  if (body.latitude !== undefined) meter.latitude = Number(body.latitude);
  if (body.longitude !== undefined) meter.longitude = Number(body.longitude);
  meter.updatedAt = new Date().toISOString();
  activeMeters.set(req.params.meterId, meter);
  res.json({ success: true, meter });
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
