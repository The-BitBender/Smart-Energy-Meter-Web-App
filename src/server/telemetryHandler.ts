import fs from 'fs';
import path from 'path';
import { analyzeTelemetryForAnomalies, TelemetrySample } from '../utils/anomalyDetector';
import { AnomalyAlert, Meter, RelayState, TelemetryLog, NotificationPreferences } from '../types/energy';

// Persistent in-memory cache synchronized with storage
export const activeMeters = new Map<string, Meter>();
export const telemetryStore = new Map<string, TelemetryLog[]>();
export const anomalyStore = new Map<string, AnomalyAlert[]>();
export const userPreferencesStore = new Map<string, NotificationPreferences>();

export const deletedMeterIds = new Set<string>();

const CACHE_FILE = path.join(process.platform === 'win32' ? process.cwd() : '/tmp', 'volt_pulse_meters.json');
const DELETED_CACHE_FILE = path.join(process.platform === 'win32' ? process.cwd() : '/tmp', 'volt_pulse_deleted_meters.json');

export function saveMetersToDisk(): void {
  try {
    const list = Array.from(activeMeters.values());
    fs.writeFileSync(CACHE_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal disk sync error
  }
}

export function loadMetersFromDisk(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((m: Meter) => {
          if (m && m.meterId && !activeMeters.has(m.meterId) && !deletedMeterIds.has(m.meterId)) {
            activeMeters.set(m.meterId, m);
          }
        });
      }
    }
  } catch (err) {
    // Non-fatal disk read error
  }
}

export function resetAllMeters(): void {
  activeMeters.clear();
  telemetryStore.clear();
  anomalyStore.clear();
  deletedMeterIds.clear();
  totalMetersEverCreated = 0;
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    if (fs.existsSync(DELETED_CACHE_FILE)) fs.unlinkSync(DELETED_CACHE_FILE);
  } catch {}
}

// Initial hydration from disk
loadMetersFromDisk();

export function syncMeters(meters: Meter[], _replaceAll = false, deletedIds?: string[]): void {
  if (!Array.isArray(meters)) return;
  loadMetersFromDisk();
  const incomingIds = new Set(meters.map(m => m?.meterId).filter(Boolean));

  if (Array.isArray(deletedIds)) {
    for (const delId of deletedIds) {
      if (delId && !incomingIds.has(delId)) {
        deletedMeterIds.add(delId);
        activeMeters.delete(delId);
        telemetryStore.delete(delId);
        anomalyStore.delete(delId);
      }
    }
  }

  for (const m of meters) {
    if (m && m.meterId) {
      // Any meter present in the active sync list is explicitly active (never deleted)
      deletedMeterIds.delete(m.meterId);
      const existing = activeMeters.get(m.meterId);
      if (!existing) {
        activeMeters.set(m.meterId, {
          ...m,
          status: evaluateOnlineStatus(m.lastHeartbeat),
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
}

// Custom error with HTTP status code
export class IngestionError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'IngestionError';
  }
}

// Fixed-length 16-character secure API key generator: 'VP-' (3 chars) + 13 alphanumeric chars = 16 characters
export const FIXED_API_KEY_LENGTH = 16;
export function generateApiKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = 'VP-';
  for (let i = 0; i < 13; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

// Global total meters counter across all accounts
export let totalMetersEverCreated = 0;

/**
 * Auto-generate Meter ID with prefix MTR- followed by 4 digits (e.g. MTR-0021)
 * Based on total number of meters created across all accounts
 */
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
  const nextNum = Math.max(activeMeters.size + 1, totalMetersEverCreated + 1, maxSeq + 1);
  return `MTR-${String(nextNum).padStart(4, '0')}`;
}

export function incrementMetersCreated(): void {
  totalMetersEverCreated = Math.max(totalMetersEverCreated + 1, activeMeters.size);
}

// 30-minute window in ms for Online / Offline evaluation
export const ONLINE_WINDOW_MS = 30 * 60 * 1000;

export function evaluateOnlineStatus(lastHeartbeat?: string | null): 'ONLINE' | 'OFFLINE' {
  if (!lastHeartbeat) return 'OFFLINE';
  const time = new Date(lastHeartbeat).getTime();
  if (isNaN(time) || time <= 0) return 'OFFLINE';
  return (Date.now() - time) <= ONLINE_WINDOW_MS ? 'ONLINE' : 'OFFLINE';
}

// Default fallback preferences for demo / initial user
userPreferencesStore.set('demo_user', {
  userId: 'demo_user',
  emailAlertsEnabled: true,
  alertEmail: 'yinkusben4sure@gmail.com',
  notifyCriticalTheft: true,
  notifyOvercurrentSurge: true,
  notifyVoltageSag: true,
  notifyOfflineHeartbeat: false,
  minimumSeverity: 'HIGH',
  updatedAt: new Date().toISOString(),
});

// Ingest telemetry payload from physical ESP32 or Simulator
export interface IngestPayload {
  meterId: string;
  apiKey?: string;
  voltage?: number | string;
  current?: number | string;
  activePower?: number | string;
  reactivePower?: number | string;
  powerFactor?: number | string;
  frequency?: number | string;
  energy?: number | string;
  relayState?: RelayState;
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
  action?: string;
}

/**
 * Delete a meter and its associated logs and alerts
 */
export function deleteMeter(meterId: string): boolean {
  loadMetersFromDisk();
  deletedMeterIds.add(meterId);
  const existed = activeMeters.has(meterId);
  activeMeters.delete(meterId);
  telemetryStore.delete(meterId);
  anomalyStore.delete(meterId);
  saveMetersToDisk();
  return existed || true;
}

/**
 * Rotate API key for a meter - strictly auto-generated with fixed length (16 chars)
 */
export function rotateMeterApiKey(meterId: string): string {
  let meter = activeMeters.get(meterId);
  if (!meter) {
    loadMetersFromDisk();
    meter = activeMeters.get(meterId);
  }
  if (!meter) {
    throw new IngestionError(404, `Meter '${meterId}' not found`);
  }

  // Always automatically generate a fixed-length (16-char) secure key
  const newKey = generateApiKey();
  meter.apiKey = newKey;
  meter.updatedAt = new Date().toISOString();
  activeMeters.set(meterId, meter);
  saveMetersToDisk();
  return newKey;
}

/**
 * Update general meter properties (name, address, GPS)
 */
export function updateMeter(meterId: string, updates: Partial<Meter>): Meter {
  let meter = activeMeters.get(meterId);
  if (!meter) {
    loadMetersFromDisk();
    meter = activeMeters.get(meterId);
  }
  if (!meter) {
    throw new IngestionError(404, `Meter '${meterId}' not found`);
  }

  if (updates.name !== undefined) meter.name = updates.name.trim();
  if (updates.address !== undefined) meter.address = updates.address.trim();
  if (updates.latitude !== undefined) meter.latitude = Number(updates.latitude);
  if (updates.longitude !== undefined) meter.longitude = Number(updates.longitude);
  if (updates.relayState !== undefined && (updates.relayState === 'ON' || updates.relayState === 'OFF')) {
    meter.relayState = updates.relayState;
  }
  meter.updatedAt = new Date().toISOString();
  activeMeters.set(meterId, meter);
  saveMetersToDisk();
  return meter;
}

/**
 * Strict telemetry ingestion processor:
 * - Meter MUST exist
 * - API Key MUST be present and match
 * - Numerical telemetry MUST be valid finite numbers within plausible physical ranges
 * - NEVER auto-creates a meter on ingestion
 */
export function processTelemetryIngest(payload: IngestPayload, headerApiKey?: string) {
  if (!payload || typeof payload !== 'object') {
    throw new IngestionError(400, 'Invalid request body: Expected a valid JSON object');
  }

  const rawMeterId = payload.meterId;
  if (!rawMeterId || typeof rawMeterId !== 'string' || !rawMeterId.trim()) {
    throw new IngestionError(400, "Validation failed: 'meterId' is required and must be a non-empty string");
  }

  const meterId = rawMeterId.trim();

  // 1. Strict Meter Existence Check - NO auto-creation
  let meter = activeMeters.get(meterId);
  if (!meter) {
    loadMetersFromDisk();
    meter = activeMeters.get(meterId);
  }

  if (!meter) {
    throw new IngestionError(
      404,
      `Meter '${meterId}' is not registered. Please register the meter in the VoltPulse dashboard before streaming telemetry.`
    );
  }

  // 2. Strict API Key Authentication
  const incomingApiKey = (headerApiKey || payload.apiKey || '').toString().trim();
  if (!incomingApiKey) {
    throw new IngestionError(
      401,
      `Authentication failed: Missing API Key for meter '${meterId}'. Include 'X-API-Key' header or 'apiKey' field.`
    );
  }

  if (incomingApiKey !== meter.apiKey) {
    throw new IngestionError(
      401,
      `Authentication failed: Invalid API key for meter '${meterId}'. Verify your key in Dashboard > Settings.`
    );
  }

  // Handle pure relay command or heartbeat
  if (payload.action === 'relay_toggle' && payload.relayState) {
    if (payload.relayState !== 'ON' && payload.relayState !== 'OFF') {
      throw new IngestionError(400, "Validation failed: 'relayState' must be 'ON' or 'OFF'");
    }
    meter.relayState = payload.relayState;
    meter.updatedAt = new Date().toISOString();
    return {
      success: true,
      meterId,
      relayState: meter.relayState,
      status: meter.status,
    };
  }

  // 3. Strict Payload Validation for Telemetry Metrics
  if (payload.voltage === undefined && payload.current === undefined && payload.activePower === undefined) {
    throw new IngestionError(
      400,
      'Validation failed: Telemetry payload must include at least voltage, current, or activePower readings'
    );
  }

  // Voltage validation
  let voltage = meter.voltage;
  if (payload.voltage !== undefined) {
    const parsedV = Number(payload.voltage);
    if (!Number.isFinite(parsedV) || isNaN(parsedV)) {
      throw new IngestionError(400, `Validation failed: 'voltage' must be a valid number, received: ${payload.voltage}`);
    }
    if (parsedV < 0 || parsedV > 600) {
      throw new IngestionError(400, `Validation failed: 'voltage' (${parsedV}V) is outside plausible physical range (0V - 600V)`);
    }
    voltage = Math.round(parsedV * 10) / 10;
  }

  // Current validation
  let current = meter.current;
  if (payload.current !== undefined) {
    const parsedI = Number(payload.current);
    if (!Number.isFinite(parsedI) || isNaN(parsedI)) {
      throw new IngestionError(400, `Validation failed: 'current' must be a valid number, received: ${payload.current}`);
    }
    if (parsedI < 0 || parsedI > 500) {
      throw new IngestionError(400, `Validation failed: 'current' (${parsedI}A) is outside plausible physical range (0A - 500A)`);
    }
    current = Math.round(parsedI * 100) / 100;
  }

  // Power Factor validation
  let powerFactor = meter.powerFactor || 0.96;
  if (payload.powerFactor !== undefined) {
    const parsedPF = Number(payload.powerFactor);
    if (!Number.isFinite(parsedPF) || isNaN(parsedPF)) {
      throw new IngestionError(400, `Validation failed: 'powerFactor' must be a valid number, received: ${payload.powerFactor}`);
    }
    if (parsedPF < -1.0 || parsedPF > 1.0) {
      throw new IngestionError(400, `Validation failed: 'powerFactor' (${parsedPF}) must be between -1.0 and 1.0`);
    }
    powerFactor = Math.round(parsedPF * 100) / 100;
  }

  // Active Power validation
  let activePower: number;
  if (payload.activePower !== undefined) {
    const parsedP = Number(payload.activePower);
    if (!Number.isFinite(parsedP) || isNaN(parsedP)) {
      throw new IngestionError(400, `Validation failed: 'activePower' must be a valid number, received: ${payload.activePower}`);
    }
    if (parsedP < -50000 || parsedP > 200000) {
      throw new IngestionError(400, `Validation failed: 'activePower' (${parsedP}W) is outside physical range (-50kW to 200kW)`);
    }
    activePower = Math.round(parsedP * 10) / 10;
  } else {
    activePower = Math.round(voltage * current * powerFactor * 10) / 10;
  }

  // Apparent & Reactive Power calculation
  const apparentPower = Math.abs(voltage * current);
  let reactivePower: number;
  if (payload.reactivePower !== undefined) {
    const parsedQ = Number(payload.reactivePower);
    if (!Number.isFinite(parsedQ) || isNaN(parsedQ)) {
      throw new IngestionError(400, `Validation failed: 'reactivePower' must be a valid number, received: ${payload.reactivePower}`);
    }
    reactivePower = Math.round(parsedQ * 10) / 10;
  } else if (apparentPower >= Math.abs(activePower)) {
    reactivePower = Math.round(Math.sqrt(Math.max(0, apparentPower * apparentPower - activePower * activePower)) * 10) / 10;
  } else {
    reactivePower = 0;
  }

  // Frequency validation
  let frequency = meter.frequency || 50.0;
  if (payload.frequency !== undefined) {
    const parsedF = Number(payload.frequency);
    if (!Number.isFinite(parsedF) || isNaN(parsedF)) {
      throw new IngestionError(400, `Validation failed: 'frequency' must be a valid number, received: ${payload.frequency}`);
    }
    if (parsedF < 40.0 || parsedF > 75.0) {
      throw new IngestionError(400, `Validation failed: 'frequency' (${parsedF}Hz) must be within 40Hz - 75Hz`);
    }
    frequency = Math.round(parsedF * 100) / 100;
  }

  // Relay State validation
  let relayState = meter.relayState;
  if (payload.relayState !== undefined) {
    if (payload.relayState !== 'ON' && payload.relayState !== 'OFF') {
      throw new IngestionError(400, `Validation failed: 'relayState' must be 'ON' or 'OFF', received: ${payload.relayState}`);
    }
    relayState = payload.relayState;
  }

  // Energy validation
  let energy = meter.totalEnergy;
  if (payload.energy !== undefined) {
    const parsedE = Number(payload.energy);
    if (!Number.isFinite(parsedE) || isNaN(parsedE) || parsedE < 0) {
      throw new IngestionError(400, `Validation failed: 'energy' must be a positive number, received: ${payload.energy}`);
    }
    energy = Math.round(parsedE * 1000) / 1000;
  } else {
    // Increment realistic energy consumption
    energy = Math.round((meter.totalEnergy + 0.005) * 1000) / 1000;
  }

  const now = new Date().toISOString();

  const prevSample = {
    voltage: meter.voltage,
    current: meter.current,
    activePower: meter.activePower,
    energy: meter.totalEnergy,
    timestamp: meter.updatedAt,
  };

  const sample: TelemetrySample = {
    voltage,
    current,
    activePower,
    reactivePower,
    powerFactor,
    frequency,
    energy,
    relayState,
    previousSample: prevSample,
  };

  // Run Anomaly and Theft Detection Algorithm
  const anomalyResult = analyzeTelemetryForAnomalies(sample);

  // Update Existing Meter
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

  if (payload.latitude !== undefined && Number.isFinite(Number(payload.latitude))) {
    meter.latitude = Number(payload.latitude);
  }
  if (payload.longitude !== undefined && Number.isFinite(Number(payload.longitude))) {
    meter.longitude = Number(payload.longitude);
  }
  if (payload.address && typeof payload.address === 'string') {
    meter.address = payload.address.trim();
  }

  meter.hasAnomaly = anomalyResult.hasAnomaly;
  meter.anomalyType = anomalyResult.type;
  meter.anomalySeverity = anomalyResult.severity;
  meter.anomalyDescription = anomalyResult.hasAnomaly ? anomalyResult.description : 'System normal';

  activeMeters.set(meterId, meter);
  saveMetersToDisk();

  // Store Telemetry Log
  const logId = `TL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const log: TelemetryLog = {
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
    hasAnomaly: anomalyResult.hasAnomaly,
    timestamp: now,
  };

  const currentLogs = telemetryStore.get(meterId) || [];
  currentLogs.push(log);
  if (currentLogs.length > 500) {
    currentLogs.shift();
  }
  telemetryStore.set(meterId, currentLogs);

  // If anomaly detected, log an active alert
  let anomalyAlert: AnomalyAlert | undefined = undefined;
  if (anomalyResult.hasAnomaly) {
    const alertId = `ALT-${Date.now()}`;
    anomalyAlert = {
      id: alertId,
      meterId,
      ownerUid: meter.ownerUid,
      type: anomalyResult.type,
      severity: anomalyResult.severity,
      title: anomalyResult.title,
      description: anomalyResult.description,
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

    const meterAlerts = anomalyStore.get(meterId) || [];
    meterAlerts.unshift(anomalyAlert);
    if (meterAlerts.length > 100) meterAlerts.pop();
    anomalyStore.set(meterId, meterAlerts);

    // Evaluate notification preferences
    const ownerPrefs = userPreferencesStore.get(meter.ownerUid) || userPreferencesStore.get('demo_user');
    if (ownerPrefs && ownerPrefs.emailAlertsEnabled && ownerPrefs.alertEmail) {
      console.log(`[ALERT NOTIFICATION] Meter ${meterId} -> ${ownerPrefs.alertEmail}: ${anomalyResult.title}`);
    }
  }

  return {
    success: true,
    meterId,
    relayState: meter.relayState,
    anomalyDetected: anomalyResult.hasAnomaly,
    anomaly: anomalyResult,
    anomalyAlert,
    meter,
    log,
    timestamp: now,
  };
}
