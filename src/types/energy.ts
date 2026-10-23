export type RelayState = 'ON' | 'OFF';
export type MeterStatus = 'ONLINE' | 'OFFLINE';
export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AnomalyStatus = 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED';

export type AnomalyType =
  | 'NONE'
  | 'CURRENT_SHUNT_THEFT'
  | 'VOLTAGE_DROP_HIGH_DRAW'
  | 'REVERSE_CURRENT'
  | 'UNMETERED_BYPASS'
  | 'SURGE_SPIKE'
  | 'TAMPER_ZERO_READING'
  | 'FREQUENCY_INSTABILITY';

export interface MeterLocation {
  latitude: number;
  longitude: number;
  address: string;
}

export interface Meter {
  id: string; // Document ID (usually same as meterId, e.g. "ESP32-MTR-8842")
  meterId: string;
  ownerUid: string;
  name: string;
  relayState: RelayState;
  status: MeterStatus;
  apiKey: string;
  lastHeartbeat: string;
  latitude: number;
  longitude: number;
  address: string;
  // Live Telemetry attributes
  voltage: number; // Volts (V)
  current: number; // Amperes (A)
  activePower: number; // Watts (W)
  reactivePower: number; // Volt-Amps Reactive (VAR)
  powerFactor: number; // cos phi (0.0 to 1.0)
  frequency: number; // Hertz (Hz)
  totalEnergy: number; // Kilowatt-hours (kWh)
  // Anomaly State
  hasAnomaly: boolean;
  anomalyType: AnomalyType;
  anomalySeverity: AnomalySeverity;
  anomalyDescription: string;
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface TelemetryLog {
  id: string;
  meterId: string;
  ownerUid: string;
  voltage: number;
  current: number;
  activePower: number;
  reactivePower: number;
  powerFactor: number;
  frequency: number;
  energy: number;
  relayState: RelayState;
  hasAnomaly: boolean;
  timestamp: string;
}

export interface AnomalyAlert {
  id: string;
  meterId: string;
  ownerUid: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  status: AnomalyStatus;
  telemetrySnapshot?: {
    voltage: number;
    current: number;
    activePower: number;
    reactivePower: number;
    energy: number;
    timestamp: string;
  };
  createdAt: string;
}

export interface AnomalyDetectionResult {
  hasAnomaly: boolean;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  recommendation: string;
}

export interface NotificationPreferences {
  userId: string;
  emailAlertsEnabled: boolean;
  alertEmail: string;
  notifyCriticalTheft: boolean;
  notifyOvercurrentSurge: boolean;
  notifyVoltageSag: boolean;
  notifyOfflineHeartbeat: boolean;
  minimumSeverity: AnomalySeverity;
  updatedAt: string;
}
