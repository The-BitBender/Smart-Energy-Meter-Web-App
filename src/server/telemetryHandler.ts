import { analyzeTelemetryForAnomalies, TelemetrySample } from '../utils/anomalyDetector';
import { AnomalyAlert, Meter, RelayState, TelemetryLog, NotificationPreferences } from '../types/energy';

// Persistent in-memory cache synchronized with storage
export const activeMeters = new Map<string, Meter>();
export const telemetryStore = new Map<string, TelemetryLog[]>();
export const anomalyStore = new Map<string, AnomalyAlert[]>();
export const userPreferencesStore = new Map<string, NotificationPreferences>();

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
  voltage: number;
  current: number;
  activePower?: number;
  reactivePower?: number;
  powerFactor?: number;
  frequency?: number;
  energy?: number;
  relayState?: RelayState;
  latitude?: number;
  longitude?: number;
  address?: string;
}

export function processTelemetryIngest(payload: IngestPayload, ownerUid = 'default_user') {
  const meterId = payload.meterId?.trim();
  if (!meterId) {
    throw new Error('meterId is required');
  }

  // Find or initialize meter
  let meter = activeMeters.get(meterId);
  const now = new Date().toISOString();

  // If active power or reactive power not provided, calculate from V & I
  const voltage = Number(payload.voltage) || 230.0;
  const current = Number(payload.current) || 0.0;
  const powerFactor = payload.powerFactor !== undefined ? Number(payload.powerFactor) : 0.96;
  const activePower = payload.activePower !== undefined ? Number(payload.activePower) : Math.round(voltage * current * powerFactor * 10) / 10;
  
  // Apparent power S = V * I; Reactive Q = sqrt(S^2 - P^2)
  const apparentPower = voltage * current;
  let reactivePower = payload.reactivePower !== undefined ? Number(payload.reactivePower) : 0;
  if (payload.reactivePower === undefined && apparentPower >= Math.abs(activePower)) {
    reactivePower = Math.round(Math.sqrt(Math.max(0, (apparentPower * apparentPower) - (activePower * activePower))) * 10) / 10;
  }

  const frequency = Number(payload.frequency) || 50.0;
  const relayState: RelayState = payload.relayState || (meter ? meter.relayState : 'ON');
  const energy = payload.energy !== undefined ? Number(payload.energy) : (meter ? meter.totalEnergy + 0.005 : 12.45);

  const prevSample = meter ? {
    voltage: meter.voltage,
    current: meter.current,
    activePower: meter.activePower,
    energy: meter.totalEnergy,
    timestamp: meter.updatedAt,
  } : undefined;

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

  if (!meter) {
    meter = {
      id: meterId,
      meterId,
      ownerUid,
      name: `ESP32 Meter ${meterId}`,
      relayState,
      status: 'ONLINE',
      apiKey: payload.apiKey || `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      lastHeartbeat: now,
      latitude: payload.latitude !== undefined ? Number(payload.latitude) : 6.5244,
      longitude: payload.longitude !== undefined ? Number(payload.longitude) : 3.3792,
      address: payload.address || 'Victoria Island Substation 4, Lagos',
      voltage,
      current,
      activePower,
      reactivePower,
      powerFactor,
      frequency,
      totalEnergy: energy,
      hasAnomaly: anomalyResult.hasAnomaly,
      anomalyType: anomalyResult.type,
      anomalySeverity: anomalyResult.severity,
      anomalyDescription: anomalyResult.hasAnomaly ? anomalyResult.description : 'System normal',
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
    meter.status = 'ONLINE';
    meter.lastHeartbeat = now;
    meter.updatedAt = now;
    if (payload.latitude !== undefined) meter.latitude = Number(payload.latitude);
    if (payload.longitude !== undefined) meter.longitude = Number(payload.longitude);
    if (payload.address) meter.address = payload.address;

    meter.hasAnomaly = anomalyResult.hasAnomaly;
    meter.anomalyType = anomalyResult.type;
    meter.anomalySeverity = anomalyResult.severity;
    meter.anomalyDescription = anomalyResult.hasAnomaly ? anomalyResult.description : 'System normal';
  }

  activeMeters.set(meterId, meter);

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
  // Keep last 500 logs per meter to optimize memory
  if (currentLogs.length > 500) {
    currentLogs.shift();
  }
  telemetryStore.set(meterId, currentLogs);

  // If anomaly detected, log an active alert
  if (anomalyResult.hasAnomaly) {
    const alertId = `ALT-${Date.now()}`;
    const alert: AnomalyAlert = {
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
    meterAlerts.unshift(alert);
    if (meterAlerts.length > 100) meterAlerts.pop();
    anomalyStore.set(meterId, meterAlerts);

    // Evaluate notification preferences and trigger email dispatch
    const ownerPrefs = userPreferencesStore.get(meter.ownerUid) || userPreferencesStore.get('demo_user');
    if (ownerPrefs && ownerPrefs.emailAlertsEnabled && ownerPrefs.alertEmail) {
      const severityRanks: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      const currentRank = severityRanks[anomalyResult.severity] || 1;
      const minRank = severityRanks[ownerPrefs.minimumSeverity] || 3;

      let isTriggerEligible = currentRank >= minRank;
      if (isTriggerEligible) {
        if (anomalyResult.type === 'CURRENT_SHUNT_THEFT' || anomalyResult.type === 'UNMETERED_BYPASS' || anomalyResult.type === 'TAMPER_ZERO_READING') {
          isTriggerEligible = ownerPrefs.notifyCriticalTheft;
        } else if (anomalyResult.type === 'SURGE_SPIKE') {
          isTriggerEligible = ownerPrefs.notifyOvercurrentSurge;
        } else if (anomalyResult.type === 'VOLTAGE_DROP_HIGH_DRAW') {
          isTriggerEligible = ownerPrefs.notifyVoltageSag;
        }
      }

      if (isTriggerEligible) {
        console.log(`[ALERT NOTIFICATION DISPATCHED] To: ${ownerPrefs.alertEmail} | Severity: ${anomalyResult.severity} | Event: ${anomalyResult.title} on Meter ${meterId}`);
      }
    }
  }

  return {
    success: true,
    meterId,
    relayState: meter.relayState,
    anomalyDetected: anomalyResult.hasAnomaly,
    anomaly: anomalyResult,
    meter,
    log,
  };
}
