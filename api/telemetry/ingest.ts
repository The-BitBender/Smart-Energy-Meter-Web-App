// Standalone, zero-dependency Vercel Serverless Function for ESP32 Telemetry Ingestion
// Handles POST, GET, DELETE /api/telemetry/ingest
import fs from 'fs';
import path from 'path';

export interface TelemetrySample {
  voltage: number;
  current: number;
  activePower: number;
  apparentPower?: number;
  reactivePower: number;
  powerFactor: number;
  frequency: number;
  energy: number;
  relayState: 'ON' | 'OFF';
  peakActivePower?: number;
  previousSample?: {
    voltage: number;
    current: number;
    activePower: number;
    energy: number;
    timestamp?: string;
  };
}

export interface AnomalyDetectionResult {
  hasAnomaly: boolean;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  recommendation: string;
}

const SEVERITY_RANK: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function analyzeAllTelemetryAnomalies(sample: TelemetrySample): AnomalyDetectionResult[] {
  const { voltage, current, activePower, powerFactor, frequency, relayState, peakActivePower, previousSample } = sample;
  const detected: AnomalyDetectionResult[] = [];

  if (relayState === 'OFF') {
    if (current > 0.8 || Math.abs(activePower) > 100) {
      detected.push({
        hasAnomaly: true,
        type: 'UNMETERED_BYPASS',
        severity: 'CRITICAL',
        title: 'Unauthorized Current While Relay Tripped',
        description: `Current of ${current.toFixed(2)}A and power of ${activePower.toFixed(0)}W detected while the meter relay is commanded OFF. Strong indicator of physical line bridge or relay contact welded bypass.`,
        recommendation: 'Inspect physical meter enclosure immediately. Check for jumper wires across the relay contacts.',
      });
    }
  } else {
    // 1. Current Shunt / Bypass Theft
    if (previousSample && previousSample.activePower > 1200 && activePower < 5 && voltage > 200 && previousSample.voltage > 200) {
      detected.push({
        hasAnomaly: true,
        type: 'CURRENT_SHUNT_THEFT',
        severity: 'CRITICAL',
        title: 'Sudden Load Collapse (Suspected Current Shunt)',
        description: `Active power abruptly dropped from ${previousSample.activePower.toFixed(0)}W to ${activePower.toFixed(0)}W within seconds while grid voltage remained steady at ${voltage.toFixed(1)}V. Possible CT coil bypass or magnetic tampering.`,
        recommendation: 'Deploy field inspection team to audit meter CT connections and check for external neodymium magnets or shunt jumpers.',
      });
    }

    // 2. Unmetered Bypass / Phase Discrepancy
    const apparentPower = sample.apparentPower !== undefined ? sample.apparentPower : Math.abs(voltage * current);
    if (apparentPower > 800 && activePower < 40 && current > 3.5) {
      detected.push({
        hasAnomaly: true,
        type: 'UNMETERED_BYPASS',
        severity: 'HIGH',
        title: 'Phase Angle Distortion / Neutral Tamper',
        description: `Apparent power is ${apparentPower.toFixed(0)}VA with ${current.toFixed(2)}A flowing, but registered active power is only ${activePower.toFixed(0)}W (Power Factor: ${powerFactor.toFixed(2)}). Typical of missing neutral or phase inversion tamper.`,
        recommendation: 'Verify neutral conductor integrity and phase-to-ground isolation at the main service entrance.',
      });
    }
  }

  // 3. Reverse Current Flow
  if (activePower < -60 || current < -0.3) {
    detected.push({
      hasAnomaly: true,
      type: 'REVERSE_CURRENT',
      severity: 'HIGH',
      title: 'Reverse Power Flow Detected',
      description: `Meter recorded negative active power (${activePower.toFixed(0)}W). Unapproved grid-tied generator or reverse polarity wiring.`,
      recommendation: 'Audit customer on-site generation installations or inspect polarity of meter wiring.',
    });
  }

  // 4. Voltage Anomalies (Over-voltage >= 250V Critical, 242-250V Warning; Under-voltage < 180V Critical, 180-207V Warning)
  if (voltage >= 250) {
    detected.push({
      hasAnomaly: true,
      type: 'OVERVOLTAGE',
      severity: 'CRITICAL',
      title: 'Critical Over-voltage Hazard (>= 250V)',
      description: `Dangerous line over-voltage: measured ${voltage.toFixed(1)}V (>= 250V threshold). Extreme risk of insulation breakdown, equipment fire, and immediate electronics destruction.`,
      recommendation: 'Remotely trip meter relay or isolate sensitive appliances and electronic equipment immediately.',
    });
  } else if (voltage >= 242 && voltage < 250) {
    detected.push({
      hasAnomaly: true,
      type: 'OVERVOLTAGE',
      severity: 'MEDIUM',
      title: 'Over-voltage Warning (242V - 250V)',
      description: `Line voltage elevated to ${voltage.toFixed(1)}V (exceeds nominal band, approaching 250V critical limit).`,
      recommendation: 'Monitor grid voltage regulation and ensure surge arresters are active.',
    });
  } else if (voltage > 0 && voltage < 180) {
    detected.push({
      hasAnomaly: true,
      type: 'UNDERVOLTAGE',
      severity: 'CRITICAL',
      title: 'Critical Under-voltage Sag (< 180V)',
      description: `Severe line under-voltage sag: measured ${voltage.toFixed(1)}V (< 180V threshold). Severe brownout condition risking motor compressor burnout and equipment failure.`,
      recommendation: 'Disconnect AC compressors, refrigeration units, and high-draw inductive equipment to prevent winding burnout.',
    });
  } else if (voltage >= 180 && voltage < 207) {
    detected.push({
      hasAnomaly: true,
      type: 'UNDERVOLTAGE',
      severity: 'MEDIUM',
      title: 'Under-voltage Warning (180V - 207V)',
      description: `Line voltage sagged to ${voltage.toFixed(1)}V (below standard 207V lower limit, within 180V - 207V warning band). Equipment may experience degraded performance or brownout stress.`,
      recommendation: 'Inspect service entrance wiring, check distribution transformer tap, and avoid running heavy inductive motors.',
    });
  }

  // 5. Overcurrent & Surge Hazard
  if (current > 42 || activePower > 9500) {
    detected.push({
      hasAnomaly: true,
      type: 'SURGE_SPIKE',
      severity: 'CRITICAL',
      title: 'Overcurrent Overload Warning',
      description: `Sustained current draw reached ${current.toFixed(1)}A (Active Power: ${(activePower / 1000).toFixed(2)} kW), exceeding standard residential service rating (40A). High thermal fire risk.`,
      recommendation: 'Remotely trip meter relay or switch off heavy inductive appliances immediately to prevent thermal breaker failure.',
    });
  }

  // 6. Severe Voltage Sag Under Load
  if (voltage > 0 && voltage < 190 && current > 20) {
    detected.push({
      hasAnomaly: true,
      type: 'VOLTAGE_DROP_HIGH_DRAW',
      severity: 'HIGH',
      title: 'Severe Voltage Sag Under High Load',
      description: `Line voltage collapsed to ${voltage.toFixed(1)}V under a ${current.toFixed(1)}A load. Indicates excessive voltage drop or illegal secondary tapping.`,
      recommendation: 'Check distribution drop cable and inspect meter terminal block for hot spots.',
    });
  }

  // 7. Frequency Deviation (Normal operating range: 49.5 - 50.5 Hz)
  if (frequency > 0 && (frequency < 49.5 || frequency > 50.5)) {
    const freqSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
      frequency <= 45.0 || frequency >= 55.0
        ? 'CRITICAL'
        : frequency < 47.5 || frequency > 52.5
        ? 'HIGH'
        : 'MEDIUM';
    detected.push({
      hasAnomaly: true,
      type: 'FREQUENCY_INSTABILITY',
      severity: freqSeverity,
      title: `Grid Frequency Anomaly (${frequency.toFixed(2)} Hz)`,
      description: `Frequency shifted to ${frequency.toFixed(2)}Hz (Normal operating range: 49.5 - 50.5 Hz). Potential local generator oscillation, sensor fault, or grid instability.`,
      recommendation: 'Monitor frequency trend; notify local grid operator if frequency fails to recover.',
    });
  }

  // 8. Peak Active Power Exceeded (compared against all-time peak active power)
  // 20% - 49% above peak = LOW | 50% - 99% above peak = MEDIUM | 100% - 200% above peak = HIGH | > 200% above peak = CRITICAL
  if (peakActivePower && peakActivePower > 0 && activePower > peakActivePower) {
    const exceedPct = ((activePower - peakActivePower) / peakActivePower) * 100;
    if (exceedPct >= 20) {
      let peakSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (exceedPct > 200) {
        peakSeverity = 'CRITICAL';
      } else if (exceedPct >= 100) {
        peakSeverity = 'HIGH';
      } else if (exceedPct >= 50) {
        peakSeverity = 'MEDIUM';
      } else {
        peakSeverity = 'LOW';
      }

      detected.push({
        hasAnomaly: true,
        type: 'PEAK_POWER_EXCEEDED',
        severity: peakSeverity,
        title: `Peak Active Power Exceeded (+${exceedPct.toFixed(1)}%)`,
        description: `Reported active power of ${activePower.toFixed(1)}W exceeded the previous all-time peak of ${peakActivePower.toFixed(1)}W by ${exceedPct.toFixed(1)}% (${peakSeverity} alert tier).`,
        recommendation: 'Verify if new high-draw loads were connected or inspect the circuit for unauthorized load tapping.',
      });
    }
  }

  detected.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return detected;
}

export function analyzeTelemetryForAnomalies(sample: TelemetrySample): AnomalyDetectionResult {
  const all = analyzeAllTelemetryAnomalies(sample);

  if (all.length === 0) {
    if (sample.relayState === 'OFF') {
      return {
        hasAnomaly: false,
        type: 'NONE',
        severity: 'LOW',
        title: 'Normal Idle State',
        description: 'Relay is OFF. System isolated.',
        recommendation: 'No action required.',
      };
    }
    return {
      hasAnomaly: false,
      type: 'NONE',
      severity: 'LOW',
      title: 'Optimal Grid Operation',
      description: 'All voltage, current, power factor, and frequency metrics are within normal IEC/IEEE parameters.',
      recommendation: 'Routine periodic monitoring active.',
    };
  }

  if (all.length === 1) {
    return all[0];
  }

  const primary = all[0];
  return {
    hasAnomaly: true,
    type: primary.type,
    severity: primary.severity,
    title: `${all.length} Simultaneous Anomalies: ${all.map(a => a.title).join(' + ')}`,
    description: all.map((a, idx) => `[${idx + 1}] ${a.description}`).join(' '),
    recommendation: all.map(a => a.recommendation).join(' '),
  };
}

// In-memory cache for warm Vercel lambda instances
const globalMeters = new Map<string, any>();
const globalLogs = new Map<string, any[]>();
const globalAnomalies = new Map<string, any[]>();
const deletedMeterIds = new Set<string>();
const recentlyDeletedTimestamps = new Map<string, number>();

const TMP_CACHE_FILE = path.join(process.platform === 'win32' ? process.cwd() : '/tmp', 'volt_pulse_meters.json');
const WORKSPACE_CACHE_FILE = path.join(process.cwd(), '.voltpulse_meters.json');
const DELETED_CACHE_FILE = path.join(process.platform === 'win32' ? process.cwd() : '/tmp', 'volt_pulse_deleted_meters.json');

const FIRESTORE_BASE_URL =
  'https://firestore.googleapis.com/v1/projects/gen-lang-client-0885826858/databases/ai-studio-33e80a9d-c379-4691-ae33-800b1ee682eb/documents';

function parseFsVal(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  return undefined;
}

function parseFsFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) {
    out[k] = parseFsVal(v);
  }
  return out;
}

function toFsVal(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return { doubleValue: Number.isFinite(val) ? val : 0 };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFsVal) } };
  if (typeof val === 'object') return { mapValue: { fields: toFsFields(val) } };
  return { stringValue: String(val) };
}

function toFsFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) {
      fields[k] = toFsVal(v);
    }
  }
  return fields;
}

async function persistMeterToFirestore(meter: any, log?: any, alerts?: any): Promise<void> {
  if (!meter || !meter.meterId || !meter.apiKey) return;
  try {
    const writes: Promise<any>[] = [
      fetch(`${FIRESTORE_BASE_URL}/meters/${encodeURIComponent(meter.meterId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFsFields(meter) }),
      }).catch(() => {}),
    ];

    if (log && log.id) {
      writes.push(
        fetch(
          `${FIRESTORE_BASE_URL}/meters/${encodeURIComponent(meter.meterId)}/telemetry?documentId=${encodeURIComponent(log.id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: toFsFields(log) }),
          }
        ).catch(() => {})
      );
    }

    const alertList = Array.isArray(alerts) ? alerts : alerts ? [alerts] : [];
    for (const alert of alertList) {
      if (alert && alert.id) {
        writes.push(
          fetch(
            `${FIRESTORE_BASE_URL}/meters/${encodeURIComponent(meter.meterId)}/anomalies?documentId=${encodeURIComponent(alert.id)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: toFsFields(alert) }),
            }
          ).catch(() => {})
        );
      }
    }

    await Promise.allSettled(writes);
  } catch {}
}

async function fetchMeterFromFirestore(meterId: string): Promise<any | null> {
  if (!meterId || typeof meterId !== 'string') return null;
  const cleanId = meterId.trim();
  const deletedAt = recentlyDeletedTimestamps.get(cleanId);
  if (deletedAt && Date.now() - deletedAt < 5000) return null;
  try {
    const res = await fetch(`${FIRESTORE_BASE_URL}/meters/${encodeURIComponent(cleanId)}`);
    if (!res.ok) return null;
    const docJson = await res.json();
    if (!docJson || !docJson.fields) return null;
    const data = parseFsFields(docJson.fields);
    if (!data.apiKey) return null;
    const hydrated = {
      id: data.id || cleanId,
      meterId: data.meterId || cleanId,
      ownerUid: data.ownerUid || 'demo_user',
      name: data.name || `Smart Meter ${cleanId}`,
      relayState: data.relayState === 'OFF' ? 'OFF' : 'ON',
      status: getOnlineStatus(data.lastHeartbeat),
      apiKey: String(data.apiKey),
      lastHeartbeat: data.lastHeartbeat || null,
      latitude: Number(data.latitude) || 6.5244,
      longitude: Number(data.longitude) || 3.3792,
      address: data.address || 'Smart Grid Connection Point',
      voltage: Number(data.voltage) || 0.0,
      current: Number(data.current) || 0.0,
      activePower: Number(data.activePower) || 0.0,
      peakActivePower: Math.max(Number(data.peakActivePower) || 0.0, Number(data.activePower) || 0.0),
      apparentPower: data.apparentPower !== undefined ? Number(data.apparentPower) : Math.round(Math.abs((Number(data.voltage) || 0) * (Number(data.current) || 0)) * 10) / 10,
      reactivePower: Number(data.reactivePower) || 0.0,
      powerFactor: Number(data.powerFactor) || 0.0,
      frequency: Number(data.frequency) || 0.0,
      totalEnergy: Number(data.totalEnergy) || 0.0,
      hasAnomaly: Boolean(data.hasAnomaly),
      anomalyType: data.anomalyType || 'NONE',
      anomalySeverity: data.anomalySeverity || 'LOW',
      anomalyDescription: data.anomalyDescription || 'System normal',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    deletedMeterIds.delete(cleanId);
    globalMeters.set(cleanId, hydrated);
    saveMetersToDisk();
    return hydrated;
  } catch {
    return null;
  }
}

async function ensureMeterLoaded(meterId: string): Promise<any | undefined> {
  if (!meterId) return undefined;
  const cleanId = meterId.trim();
  let meter = globalMeters.get(cleanId);
  if (!meter) {
    loadMetersFromDisk();
    meter = globalMeters.get(cleanId);
  }
  if (!meter) {
    meter = (await fetchMeterFromFirestore(cleanId)) || undefined;
  }
  return meter;
}

function saveMetersToDisk() {
  const list = Array.from(globalMeters.values());
  const payload = JSON.stringify(list, null, 2);
  try {
    fs.writeFileSync(TMP_CACHE_FILE, payload, 'utf-8');
  } catch {}
  try {
    fs.writeFileSync(WORKSPACE_CACHE_FILE, payload, 'utf-8');
  } catch {}
}

function loadMetersFromDisk() {
  for (const file of [WORKSPACE_CACHE_FILE, TMP_CACHE_FILE]) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((m: any) => {
            if (m && m.meterId && !globalMeters.has(m.meterId) && !deletedMeterIds.has(m.meterId)) {
              globalMeters.set(m.meterId, m);
            }
          });
        }
      }
    } catch {}
  }
}

function resetAllMeters() {
  globalMeters.clear();
  globalLogs.clear();
  globalAnomalies.clear();
  deletedMeterIds.clear();
  recentlyDeletedTimestamps.clear();
  for (const file of [TMP_CACHE_FILE, WORKSPACE_CACHE_FILE, DELETED_CACHE_FILE]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
  }
}

loadMetersFromDisk();

export const FIXED_API_KEY_LENGTH = 16;
export const ONLINE_WINDOW_MS = 30 * 60 * 1000; // 30-minute window

export function generateKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'VP-';
  for (let i = 0; i < 13; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s; // Exactly 16 chars
}

export function getNextMeterId(): string {
  loadMetersFromDisk();
  let maxSeq = 0;
  for (const mId of globalMeters.keys()) {
    const match = mId.match(/^MTR-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const nextNum = Math.max(globalMeters.size + 1, maxSeq + 1);
  return `MTR-${String(nextNum).padStart(4, '0')}`;
}

export async function resolveUniqueMeterId(
  preferredId?: string,
  ownerUid?: string,
  createNew = false
): Promise<string> {
  loadMetersFromDisk();

  const cleanPreferred = preferredId?.trim();
  if (cleanPreferred && !createNew) {
    const existing = (await fetchMeterFromFirestore(cleanPreferred)) || globalMeters.get(cleanPreferred);
    if (!existing) {
      return cleanPreferred;
    }
    if (ownerUid && existing.ownerUid === ownerUid) {
      return cleanPreferred;
    }
  } else if (cleanPreferred && createNew) {
    const existing = (await fetchMeterFromFirestore(cleanPreferred)) || globalMeters.get(cleanPreferred);
    if (!existing) {
      return cleanPreferred;
    }
  }

  let seq = 1;
  for (const mId of globalMeters.keys()) {
    const match = mId.match(/^MTR-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num >= seq) {
        seq = num + 1;
      }
    }
  }

  for (let attempts = 0; attempts < 500; attempts++) {
    const candidateId = `MTR-${String(seq).padStart(4, '0')}`;
    const inMemory = globalMeters.get(candidateId);
    const inFirestore = await fetchMeterFromFirestore(candidateId);
    if (!inMemory && !inFirestore) {
      return candidateId;
    }
    seq += 1;
  }

  return `MTR-${String(seq).padStart(4, '0')}`;
}

export function getOnlineStatus(lastHeartbeat?: string | null): 'ONLINE' | 'OFFLINE' {
  if (!lastHeartbeat) return 'OFFLINE';
  const t = new Date(lastHeartbeat).getTime();
  if (isNaN(t) || t <= 0) return 'OFFLINE';
  return (Date.now() - t) <= ONLINE_WINDOW_MS ? 'ONLINE' : 'OFFLINE';
}

// Resilient body parser that supports pre-parsed JSON, raw strings, and streams
async function parseRequestBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendResponse(res: any, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.end(JSON.stringify(data));
}

function seedInitialDemoMeter() {
  loadMetersFromDisk();
}

// Default export: standard Vercel serverless function entrypoint
export default async function handler(req: any, res: any) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.end();
    return;
  }

  seedInitialDemoMeter();

  const host = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url, `http://${host}`);
  const queryMeterId = parsedUrl.searchParams.get('meterId')?.trim();
  const action = parsedUrl.searchParams.get('action');

  // Handle DELETE request to delete a meter
  if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete_meter')) {
    const payload = req.method === 'POST' ? await parseRequestBody(req) : {};
    const pathMatch = parsedUrl.pathname.match(/\/meters\/([^\/]+)$/);
    const pathMeterId = pathMatch ? decodeURIComponent(pathMatch[1]) : undefined;
    const targetMeterId = (queryMeterId || pathMeterId || payload.meterId || '').trim();
    if (!targetMeterId) {
      return sendResponse(res, 400, { success: false, error: 'meterId is required for deletion' });
    }
    loadMetersFromDisk();
    deletedMeterIds.add(targetMeterId);
    globalMeters.delete(targetMeterId);
    globalLogs.delete(targetMeterId);
    globalAnomalies.delete(targetMeterId);
    saveMetersToDisk();
    return sendResponse(res, 200, {
      success: true,
      meterId: targetMeterId,
      message: `Meter '${targetMeterId}' deleted successfully`,
    });
  }

  // 1. GET requests: Query live meter status, logs, or list of meters
  if (req.method === 'GET') {
    try {
      const isAll = parsedUrl.searchParams.get('all') === 'true' || (!queryMeterId && !action);

      // Return next globally available Meter ID across all accounts
      if (action === 'next_meter_id' || parsedUrl.pathname.endsWith('/next-id')) {
        const nextMeterId = await resolveUniqueMeterId(undefined, undefined, true);
        return sendResponse(res, 200, {
          success: true,
          nextMeterId,
          totalMetersCount: globalMeters.size,
        });
      }

      // Retrieve last cumulative energy for hardware ESP32 boot/resumption
      if (action === 'energy' || parsedUrl.pathname.endsWith('/energy')) {
        const pathMatch = parsedUrl.pathname.match(/\/meters\/([^\/]+)\/energy$/);
        const pathMeterId = pathMatch ? decodeURIComponent(pathMatch[1]) : undefined;
        const headerMeterId = (req.headers['x-device-id'] as string)?.trim();
        const targetMeterId = (queryMeterId || pathMeterId || headerMeterId || '').trim();

        if (!targetMeterId) {
          return sendResponse(res, 400, { success: false, error: 'meterId is required' });
        }

        const meter = await ensureMeterLoaded(targetMeterId);
        if (!meter) {
          return sendResponse(res, 404, { success: false, error: `Meter '${targetMeterId}' not found` });
        }

        const incomingApiKey = ((req.headers['x-api-key'] as string) || parsedUrl.searchParams.get('apiKey') || '').trim();
        if (!incomingApiKey) {
          return sendResponse(res, 401, {
            success: false,
            error: `Authentication failed: Missing API Key for meter '${targetMeterId}'. Include 'X-API-Key' header or 'apiKey' query parameter.`,
          });
        }
        if (incomingApiKey !== meter.apiKey) {
          return sendResponse(res, 401, {
            success: false,
            error: `Authentication failed: Invalid API key for meter '${targetMeterId}'.`,
          });
        }

        const energyKwh = Math.round((Number(meter.totalEnergy) || 0) * 1000) / 1000;
        const energyWh = Math.round(energyKwh * 1000 * 10) / 10;

        return sendResponse(res, 200, {
          success: true,
          meterId: meter.meterId,
          energy: energyKwh,
          energyWh,
          relayState: meter.relayState || 'ON',
          timestamp: meter.lastHeartbeat || meter.updatedAt || new Date().toISOString(),
        });
      }

      // Fast relay status poll for hardware ESP32
      if (queryMeterId && action === 'relay_status') {
        const meter = await ensureMeterLoaded(queryMeterId);
        return sendResponse(res, 200, {
          meterId: queryMeterId,
          relayState: meter ? meter.relayState : 'ON',
          status: meter ? getOnlineStatus(meter.lastHeartbeat) : 'OFFLINE',
        });
      }

      // Query single meter live state and recent logs
      if (queryMeterId && !isAll) {
        const meter = globalMeters.get(queryMeterId);
        if (meter) {
          meter.status = getOnlineStatus(meter.lastHeartbeat);
        }
        const logs = globalLogs.get(queryMeterId) || [];
        const alerts = globalAnomalies.get(queryMeterId) || [];
        const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

        return sendResponse(res, 200, {
          success: true,
          exists: !!meter,
          meter: meter || null,
          latestLog,
          logs: logs.slice(-50),
          alerts,
          timestamp: new Date().toISOString(),
        });
      }

      // Query all reporting meters with 30-minute status check
      const allMeters = Array.from(globalMeters.values()).map(m => {
        m.status = getOnlineStatus(m.lastHeartbeat);
        return m;
      });
      return sendResponse(res, 200, {
        success: true,
        meters: allMeters,
        count: allMeters.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendResponse(res, 500, { success: false, error: err?.message || 'Failed to query telemetry state' });
    }
  }

  if (req.method !== 'POST') {
    return sendResponse(res, 405, { success: false, error: 'Method Not Allowed. Use GET, POST, or DELETE.' });
  }

  try {
    const payload = await parseRequestBody(req);
    const now = new Date().toISOString();
    const pathname = parsedUrl.pathname;

    // 0a. Check if this is a reset_all request
    if (payload.action === 'reset_all' || action === 'reset_all' || pathname.endsWith('/reset')) {
      resetAllMeters();
      return sendResponse(res, 200, { success: true, reset: true });
    }

    // 0. Check if this is a delete_meter request via POST JSON body
    if (payload.action === 'delete_meter') {
      const targetId = (payload.meterId || queryMeterId || '').trim();
      if (!targetId) {
        return sendResponse(res, 400, { success: false, error: 'meterId is required for deletion' });
      }
      loadMetersFromDisk();
      deletedMeterIds.add(targetId);
      globalMeters.delete(targetId);
      globalLogs.delete(targetId);
      globalAnomalies.delete(targetId);
      saveMetersToDisk();
      return sendResponse(res, 200, {
        success: true,
        meterId: targetId,
        message: `Meter '${targetId}' deleted successfully`,
      });
    }

    // 1. Check if this is a bulk meter sync from Firestore / UI
    if (payload.action === 'sync_meters' || pathname.endsWith('/sync')) {
      loadMetersFromDisk();
      const metersToSync = Array.isArray(payload.meters) ? payload.meters : (payload.meter ? [payload.meter] : []);
      const incomingIds = new Set(metersToSync.map((m: any) => m?.meterId).filter(Boolean));
      if (Array.isArray(payload.deletedIds)) {
        for (const delId of payload.deletedIds) {
          if (delId && !incomingIds.has(delId)) {
            deletedMeterIds.add(delId);
            globalMeters.delete(delId);
            globalLogs.delete(delId);
            globalAnomalies.delete(delId);
          }
        }
      }
      for (const m of metersToSync) {
        if (m && m.meterId) {
          deletedMeterIds.delete(m.meterId);
          const current = globalMeters.get(m.meterId);
          if (!current) {
            globalMeters.set(m.meterId, m);
          } else {
            // Prevent a different user account from overwriting an existing meter's ownerUid or apiKey
            if (
              current.ownerUid &&
              m.ownerUid &&
              current.ownerUid !== 'demo_user' &&
              m.ownerUid !== current.ownerUid
            ) {
              continue;
            }

            const currentHb = new Date(current.lastHeartbeat || 0).getTime() || 0;
            const incomingHb = new Date(m.lastHeartbeat || 0).getTime() || 0;
            const currentUpd = new Date(current.updatedAt || current.lastHeartbeat || 0).getTime() || 0;
            const incomingUpd = new Date(m.updatedAt || m.lastHeartbeat || 0).getTime() || 0;

            const telSrc = incomingHb >= currentHb && incomingHb > 0 ? m : current;
            const metaSrc = incomingUpd >= currentUpd ? m : current;

            let hasAnomaly = current.hasAnomaly;
            let anomalyType = current.anomalyType;
            let anomalySeverity = current.anomalySeverity;
            let anomalyDescription = current.anomalyDescription;

            if (incomingHb > currentHb) {
              hasAnomaly = m.hasAnomaly;
              anomalyType = m.anomalyType;
              anomalySeverity = m.anomalySeverity;
              anomalyDescription = m.anomalyDescription;
            } else if (incomingUpd >= currentUpd) {
              hasAnomaly = m.hasAnomaly;
              anomalyType = m.anomalyType;
              anomalySeverity = m.anomalySeverity;
              anomalyDescription = m.anomalyDescription;
            }

            globalMeters.set(m.meterId, {
              ...current,
              ...metaSrc,
              ownerUid: current.ownerUid && current.ownerUid !== 'demo_user' ? current.ownerUid : (m.ownerUid || current.ownerUid),
              voltage: telSrc.voltage,
              current: telSrc.current,
              activePower: telSrc.activePower,
              peakActivePower: Math.max(
                Number(current.peakActivePower) || 0,
                Number(m.peakActivePower) || 0,
                Number(current.activePower) || 0,
                Number(m.activePower) || 0
              ),
              apparentPower: telSrc.apparentPower !== undefined ? telSrc.apparentPower : Math.round(Math.abs((Number(telSrc.voltage) || 0) * (Number(telSrc.current) || 0)) * 10) / 10,
              reactivePower: telSrc.reactivePower,
              powerFactor: telSrc.powerFactor,
              frequency: telSrc.frequency,
              totalEnergy: telSrc.totalEnergy,
              lastHeartbeat: telSrc.lastHeartbeat || current.lastHeartbeat || m.lastHeartbeat,
              hasAnomaly,
              anomalyType,
              anomalySeverity,
              anomalyDescription,
              apiKey: current.apiKey || m.apiKey,
            });
          }
        }
      }
      saveMetersToDisk();
      return sendResponse(res, 200, { success: true, count: globalMeters.size });
    }

    if (payload.action === 'next_meter_id') {
      const nextMeterId = await resolveUniqueMeterId(undefined, payload.ownerUid, true);
      return sendResponse(res, 200, {
        success: true,
        nextMeterId,
        totalMetersCount: globalMeters.size,
      });
    }

    // 2. Check if this is an explicit meter registration from UI or /api/meters
    if (payload.action === 'register_meter' || pathname.endsWith('/meters')) {
      const ownerUid = payload.ownerUid || 'demo_user';
      const meterId = await resolveUniqueMeterId(payload.meterId, ownerUid, Boolean(payload.createNew));
      deletedMeterIds.delete(meterId);
      globalLogs.delete(meterId);
      globalAnomalies.delete(meterId);
      const assignedApiKey = (payload.apiKey && typeof payload.apiKey === 'string' && payload.apiKey.trim())
        ? payload.apiKey.trim()
        : generateKey();

      const newMeter = {
        id: meterId,
        meterId,
        ownerUid: payload.ownerUid || 'demo_user',
        name: payload.name || `Smart Meter ${meterId}`,
        relayState: 'ON',
        status: 'OFFLINE',
        apiKey: assignedApiKey,
        lastHeartbeat: null,
        latitude: Number(payload.latitude) || 6.5244,
        longitude: Number(payload.longitude) || 3.3792,
        address: payload.address || 'Smart Grid Connection Point',
        voltage: 0.0,
        current: 0.0,
        activePower: 0.0,
        peakActivePower: 0.0,
        apparentPower: 0.0,
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
      globalMeters.set(meterId, newMeter);
      saveMetersToDisk();
      await persistMeterToFirestore(newMeter);
      return sendResponse(res, 201, { success: true, meter: newMeter });
    }

    const meterId = (payload.meterId || queryMeterId)?.trim();
    if (!meterId) {
      return sendResponse(res, 400, { success: false, error: "Validation failed: 'meterId' is required in request body" });
    }

    // Check if this is an acknowledge_anomaly request (clears banner while preserving telemetry readings)
    if (payload.action === 'acknowledge_anomaly' || action === 'acknowledge_anomaly' || pathname.endsWith('/resolve')) {
      const meter = await ensureMeterLoaded(meterId);
      if (!meter) {
        return sendResponse(res, 404, { success: false, error: `Meter '${meterId}' not found` });
      }
      meter.hasAnomaly = false;
      meter.anomalyType = 'NONE';
      meter.anomalySeverity = 'LOW';
      meter.anomalyDescription = 'Operating normally';
      meter.updatedAt = now;
      globalMeters.set(meterId, meter);
      const alerts = globalAnomalies.get(meterId) || [];
      alerts.forEach((a: any) => {
        if (!payload.alertId || a.id === payload.alertId) {
          a.status = 'RESOLVED';
        }
      });
      globalAnomalies.set(meterId, alerts);
      saveMetersToDisk();
      await persistMeterToFirestore(meter);
      return sendResponse(res, 200, { success: true, meterId, meter });
    }

    // Check if this is an API key rotation request (strictly auto-generate 16-character key)
    if (payload.action === 'rotate_key') {
      const meter = await ensureMeterLoaded(meterId);
      if (!meter) {
        return sendResponse(res, 404, { success: false, error: `Meter '${meterId}' not found` });
      }
      const newKey = generateKey();
      meter.apiKey = newKey;
      meter.updatedAt = now;
      globalMeters.set(meterId, meter);
      saveMetersToDisk();
      await persistMeterToFirestore(meter);
      return sendResponse(res, 200, { success: true, meterId, apiKey: newKey, meter });
    }

    // STRICT CHECK: Meter MUST exist in database / registry. Hydrate from Firestore on cold start!
    const existingMeter = await ensureMeterLoaded(meterId);
    if (!existingMeter) {
      return sendResponse(res, 404, {
        success: false,
        error: `Meter '${meterId}' is not registered. Please register the meter in the VoltPulse dashboard before streaming telemetry.`,
      });
    }

    // STRICT AUTHENTICATION: API Key MUST be provided and MUST match
    const incomingApiKey = ((req.headers['x-api-key'] as string) || payload.apiKey || '').trim();
    if (!incomingApiKey) {
      return sendResponse(res, 401, {
        success: false,
        error: `Authentication failed: Missing API Key for meter '${meterId}'. Include 'X-API-Key' header or 'apiKey' field.`,
      });
    }

    if (incomingApiKey !== existingMeter.apiKey) {
      return sendResponse(res, 401, {
        success: false,
        error: `Authentication failed: Invalid API key for meter '${meterId}'. Verify your key in Dashboard > Settings.`,
      });
    }

    // Check if this is a remote relay toggle command
    if (payload.action === 'relay_toggle' || (payload.relayState && payload.voltage === undefined && payload.current === undefined)) {
      if (payload.relayState !== 'ON' && payload.relayState !== 'OFF') {
        return sendResponse(res, 400, { success: false, error: "relayState must be 'ON' or 'OFF'" });
      }
      existingMeter.relayState = payload.relayState;
      existingMeter.updatedAt = now;
      globalMeters.set(meterId, existingMeter);

      return sendResponse(res, 200, {
        success: true,
        meterId,
        relayState: existingMeter.relayState,
        updatedAt: now,
      });
    }

    // STRICT VALIDATION: Telemetry numbers must be valid numbers within plausible physical limits
    if (payload.voltage === undefined && payload.current === undefined && payload.activePower === undefined) {
      return sendResponse(res, 400, {
        success: false,
        error: 'Validation failed: Telemetry payload must include at least voltage, current, or activePower readings',
      });
    }

    // Voltage validation
    let voltage = existingMeter.voltage;
    if (payload.voltage !== undefined) {
      const parsedV = Number(payload.voltage);
      if (!Number.isFinite(parsedV) || isNaN(parsedV)) {
        return sendResponse(res, 400, { success: false, error: `'voltage' must be a valid number, received: ${payload.voltage}` });
      }
      if (parsedV < 0 || parsedV > 600) {
        return sendResponse(res, 400, { success: false, error: `'voltage' (${parsedV}V) is outside plausible range (0V - 600V)` });
      }
      voltage = Math.round(parsedV * 10) / 10;
    }

    // Current validation
    let current = existingMeter.current;
    if (payload.current !== undefined) {
      const parsedI = Number(payload.current);
      if (!Number.isFinite(parsedI) || isNaN(parsedI)) {
        return sendResponse(res, 400, { success: false, error: `'current' must be a valid number, received: ${payload.current}` });
      }
      if (parsedI < 0 || parsedI > 500) {
        return sendResponse(res, 400, { success: false, error: `'current' (${parsedI}A) is outside plausible range (0A - 500A)` });
      }
      current = Math.round(parsedI * 100) / 100;
    }

    // Power factor validation
    let powerFactor = existingMeter.powerFactor || 0.96;
    if (payload.powerFactor !== undefined) {
      const parsedPF = Number(payload.powerFactor);
      if (!Number.isFinite(parsedPF) || isNaN(parsedPF)) {
        return sendResponse(res, 400, { success: false, error: `'powerFactor' must be a valid number, received: ${payload.powerFactor}` });
      }
      if (parsedPF < -1.0 || parsedPF > 1.0) {
        return sendResponse(res, 400, { success: false, error: `'powerFactor' (${parsedPF}) must be between -1.0 and 1.0` });
      }
      powerFactor = Math.round(parsedPF * 100) / 100;
    }

    // Active power validation
    let activePower: number;
    if (payload.activePower !== undefined) {
      const parsedP = Number(payload.activePower);
      if (!Number.isFinite(parsedP) || isNaN(parsedP)) {
        return sendResponse(res, 400, { success: false, error: `'activePower' must be a valid number, received: ${payload.activePower}` });
      }
      if (parsedP < -50000 || parsedP > 200000) {
        return sendResponse(res, 400, { success: false, error: `'activePower' (${parsedP}W) is outside physical range` });
      }
      activePower = Math.round(parsedP * 10) / 10;
    } else {
      activePower = Math.round(voltage * current * powerFactor * 10) / 10;
    }

    // Apparent & Reactive power
    let apparentPower: number;
    if (payload.apparentPower !== undefined) {
      const parsedS = Number(payload.apparentPower);
      if (!Number.isFinite(parsedS) || isNaN(parsedS) || parsedS < 0) {
        return sendResponse(res, 400, { success: false, error: `'apparentPower' must be a valid non-negative number, received: ${payload.apparentPower}` });
      }
      apparentPower = Math.round(parsedS * 10) / 10;
    } else {
      apparentPower = Math.round(Math.abs(voltage * current) * 10) / 10;
    }

    let reactivePower: number;
    if (payload.reactivePower !== undefined) {
      const parsedQ = Number(payload.reactivePower);
      if (!Number.isFinite(parsedQ) || isNaN(parsedQ)) {
        return sendResponse(res, 400, { success: false, error: `'reactivePower' must be a valid number` });
      }
      reactivePower = Math.round(parsedQ * 10) / 10;
    } else if (apparentPower >= Math.abs(activePower)) {
      reactivePower = Math.round(Math.sqrt(Math.max(0, apparentPower * apparentPower - activePower * activePower)) * 10) / 10;
    } else {
      reactivePower = 0;
    }

    // Frequency validation (accept any non-negative finite frequency; out-of-range values trigger FREQUENCY_INSTABILITY anomaly)
    let frequency = existingMeter.frequency || 50.0;
    if (payload.frequency !== undefined) {
      const parsedF = Number(payload.frequency);
      if (!Number.isFinite(parsedF) || isNaN(parsedF) || parsedF < 0) {
        return sendResponse(res, 400, { success: false, error: `'frequency' must be a valid non-negative number` });
      }
      frequency = Math.round(parsedF * 100) / 100;
    }

    // Relay state validation
    let relayState = existingMeter.relayState;
    if (payload.relayState !== undefined) {
      if (payload.relayState !== 'ON' && payload.relayState !== 'OFF') {
        return sendResponse(res, 400, { success: false, error: `'relayState' must be 'ON' or 'OFF'` });
      }
      relayState = payload.relayState;
    }

    // Energy validation (Mandatory: the meter is the sole source of energy accumulation)
    if (payload.energy === undefined || payload.energy === null || payload.energy === '') {
      return sendResponse(res, 400, {
        success: false,
        error: "Validation failed: 'energy' is required in the telemetry JSON body (meter is the sole source of energy accumulation)",
      });
    }
    const parsedE = Number(payload.energy);
    if (!Number.isFinite(parsedE) || isNaN(parsedE) || parsedE < 0) {
      return sendResponse(res, 400, { success: false, error: `'energy' must be a valid non-negative number, received: ${payload.energy}` });
    }
    const energy = Math.round(parsedE * 1000) / 1000;

    const prevSample = {
      voltage: existingMeter.voltage,
      current: existingMeter.current,
      activePower: existingMeter.activePower,
      energy: existingMeter.totalEnergy,
      timestamp: existingMeter.updatedAt,
    };

    const priorPeak = Math.max(Number(existingMeter.peakActivePower) || 0, Number(existingMeter.activePower) || 0);

    const sample: TelemetrySample = {
      voltage,
      current,
      activePower,
      apparentPower,
      reactivePower,
      powerFactor,
      frequency,
      energy,
      relayState,
      peakActivePower: priorPeak,
      previousSample: prevSample,
    };

    const allAnomalies = analyzeAllTelemetryAnomalies(sample);
    const anomalyResult = analyzeTelemetryForAnomalies(sample);

    existingMeter.voltage = voltage;
    existingMeter.current = current;
    existingMeter.activePower = activePower;
    existingMeter.peakActivePower = Math.max(priorPeak, activePower);
    existingMeter.apparentPower = apparentPower;
    existingMeter.reactivePower = reactivePower;
    existingMeter.powerFactor = powerFactor;
    existingMeter.frequency = frequency;
    existingMeter.totalEnergy = energy;
    existingMeter.relayState = relayState;
    existingMeter.status = 'ONLINE';
    existingMeter.lastHeartbeat = now;
    existingMeter.updatedAt = now;

    existingMeter.hasAnomaly = anomalyResult.hasAnomaly;
    existingMeter.anomalyType = anomalyResult.type;
    existingMeter.anomalySeverity = anomalyResult.severity;
    existingMeter.anomalyDescription = anomalyResult.hasAnomaly ? anomalyResult.description : 'System normal';

    globalMeters.set(meterId, existingMeter);

    // Save telemetry log
    const logId = `TL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const log = {
      id: logId,
      meterId,
      ownerUid: existingMeter.ownerUid,
      voltage,
      current,
      activePower,
      apparentPower,
      reactivePower,
      powerFactor,
      frequency,
      energy,
      relayState: existingMeter.relayState,
      hasAnomaly: anomalyResult.hasAnomaly,
      timestamp: now,
    };

    const meterLogs = globalLogs.get(meterId) || [];
    meterLogs.push(log);
    if (meterLogs.length > 200) meterLogs.shift();
    globalLogs.set(meterId, meterLogs);

    const anomalyAlerts: any[] = [];
    if (allAnomalies.length > 0) {
      const baseMs = Date.now();
      const alerts = globalAnomalies.get(meterId) || [];

      allAnomalies.forEach((anomItem, idx) => {
        const alertId = `ALT-${baseMs}-${idx}-${anomItem.type}`;
        const alertObj = {
          id: alertId,
          meterId,
          ownerUid: existingMeter.ownerUid,
          type: anomItem.type,
          severity: anomItem.severity,
          title: anomItem.title,
          description: anomItem.description,
          status: 'ACTIVE',
          telemetrySnapshot: {
            voltage,
            current,
            activePower,
            apparentPower,
            reactivePower,
            energy,
            timestamp: now,
          },
          createdAt: new Date(baseMs + idx).toISOString(),
        };
        anomalyAlerts.push(alertObj);
        alerts.unshift(alertObj);
      });

      if (alerts.length > 100) alerts.length = 100;
      globalAnomalies.set(meterId, alerts);
    }

    saveMetersToDisk();
    await persistMeterToFirestore(existingMeter, log, anomalyAlerts);

    const compactResponse: Record<string, any> = {
      success: true,
      meterId,
      relayState: existingMeter.relayState,
      anomalyDetected: anomalyResult.hasAnomaly,
    };

    if (anomalyResult.hasAnomaly && allAnomalies.length > 0) {
      compactResponse.anomalies = allAnomalies.map((a) => ({
        type: a.type,
        severity: a.severity,
        title: a.title,
      }));
    }

    compactResponse.timestamp = now;

    return sendResponse(res, 200, compactResponse);
  } catch (err: any) {
    console.error('[Telemetry Ingest Error]', err);
    return sendResponse(res, 500, {
      success: false,
      error: err?.message || 'Internal telemetry processing error',
    });
  }
}
