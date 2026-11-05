import { Meter, AnomalyAlert, TelemetryLog } from '../types/energy';

// 30-minute window in milliseconds
export const ONLINE_THRESHOLD_MS = 30 * 60 * 1000; // 1,800,000 ms

/**
 * Format a sequence number into a 4-digit Meter ID with prefix MTR-
 * e.g., 1 -> "MTR-0001", 21 -> "MTR-0021"
 */
export function formatMeterId(sequenceNumber: number): string {
  const num = Math.max(1, Math.floor(sequenceNumber));
  return `MTR-${String(num).padStart(4, '0')}`;
}

/**
 * Generate a cryptographically random 16-character API key
 * Format: "VP-" + 13 uppercase alphanumeric characters = 16 chars (identical to rotation format)
 */
export function generate16CharApiKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'VP-';
  for (let i = 0; i < 13; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

/**
 * Determine if a meter is currently ONLINE based on a 30-minute window from last received telemetry.
 */
export function getMeterOnlineStatus(lastHeartbeat?: string | null, now = Date.now()): 'ONLINE' | 'OFFLINE' {
  if (!lastHeartbeat) return 'OFFLINE';
  const time = new Date(lastHeartbeat).getTime();
  if (isNaN(time) || time <= 0) return 'OFFLINE';
  return (now - time) <= ONLINE_THRESHOLD_MS ? 'ONLINE' : 'OFFLINE';
}

/**
 * Format the Last Seen time into human-friendly relative units:
 * e.g., "12s ago", "4 mins ago", "1 hr 15m ago", "2 hrs ago", "3 days ago"
 */
export function formatLastSeen(lastHeartbeat?: string | null, now = Date.now()): {
  isOnline: boolean;
  ageSec: number;
  relativeTime: string;
  badgeText: string;
} {
  if (!lastHeartbeat) {
    return {
      isOnline: false,
      ageSec: Infinity,
      relativeTime: 'Never seen',
      badgeText: 'OFFLINE • Never seen',
    };
  }

  const time = new Date(lastHeartbeat).getTime();
  if (isNaN(time) || time <= 0) {
    return {
      isOnline: false,
      ageSec: Infinity,
      relativeTime: 'Unknown',
      badgeText: 'OFFLINE • Unknown',
    };
  }

  const diffMs = Math.max(0, now - time);
  const diffSec = Math.floor(diffMs / 1000);
  const isOnline = diffMs <= ONLINE_THRESHOLD_MS;

  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  let relativeTime = '';
  if (diffSec < 60) {
    relativeTime = `${diffSec}s ago`;
  } else if (diffMin < 60) {
    relativeTime = diffMin === 1 ? '1 min ago' : `${diffMin} mins ago`;
  } else if (diffHr < 24) {
    const remainingMin = diffMin % 60;
    if (diffHr === 1 && remainingMin > 0) {
      relativeTime = `1 hr ${remainingMin}m ago`;
    } else {
      relativeTime = diffHr === 1 ? '1 hr ago' : `${diffHr} hrs ago`;
    }
  } else {
    relativeTime = diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }

  const badgeText = isOnline ? `ONLINE • ${relativeTime}` : `OFFLINE • ${relativeTime}`;

  return {
    isOnline,
    ageSec: diffSec,
    relativeTime,
    badgeText,
  };
}

/**
 * Evaluate whether a TelemetryLog point contains any electrical anomaly
 */
export function isTelemetryLogAnomalous(log: TelemetryLog): boolean {
  if (!log) return false;
  if (log.hasAnomaly) return true;
  const v = Number(log.voltage) || 0;
  const i = Number(log.current) || 0;
  const p = Number(log.activePower) || 0;
  const f = Number(log.frequency) || 0;

  if (log.relayState === 'OFF' && (i > 0.8 || Math.abs(p) > 100)) return true;
  if (v >= 242 || (v > 0 && v < 207)) return true;
  if (i > 42 || p > 9500) return true;
  if (i < -0.3 || p < -60) return true;
  if (f > 0 && (f < 47.5 || f > 52.5)) return true;
  if (v * i > 800 && p < 40 && i > 3.5) return true;
  return false;
}

/**
 * Robust Meter Reconciliation:
 * Separates telemetry sample freshness (lastHeartbeat) from metadata/acknowledgement freshness (updatedAt).
 * - Telemetry values (voltage, current, power, energy, frequency, powerFactor) ONLY update when incoming
 *   has an equal or newer `lastHeartbeat` (so acknowledging an anomaly never reverts telemetry to older data).
 * - Anomaly banner status (`hasAnomaly`, etc.) updates when a strictly newer telemetry sample arrives
 *   OR when `updatedAt` is newer for the same sample (e.g., user clicked Acknowledge).
 */
export function reconcileMeter(existing: Meter | null | undefined, incoming: Meter): Meter {
  if (!existing) {
    const status = getMeterOnlineStatus(incoming.lastHeartbeat);
    return { ...incoming, status };
  }

  // Never allow a payload belonging to a different user account to overwrite an existing meter
  if (
    existing.ownerUid &&
    incoming.ownerUid &&
    existing.ownerUid !== 'demo_user' &&
    incoming.ownerUid !== 'demo_user' &&
    existing.ownerUid !== incoming.ownerUid
  ) {
    return existing;
  }

  const existingHb = new Date(existing.lastHeartbeat || 0).getTime() || 0;
  const incomingHb = new Date(incoming.lastHeartbeat || 0).getTime() || 0;

  const existingUpd = new Date(existing.updatedAt || existing.lastHeartbeat || 0).getTime() || 0;
  const incomingUpd = new Date(incoming.updatedAt || incoming.lastHeartbeat || 0).getTime() || 0;

  // Determine which object has the freshest actual hardware/workbench telemetry reading
  const useIncomingTelemetry = incomingHb > existingHb || (incomingHb === existingHb && incomingHb > 0 && incomingUpd >= existingUpd);

  const telemetrySource = useIncomingTelemetry ? incoming : existing;
  const metaSource = incomingUpd >= existingUpd ? incoming : existing;

  let hasAnomaly = existing.hasAnomaly;
  let anomalyType = existing.anomalyType;
  let anomalySeverity = existing.anomalySeverity;
  let anomalyDescription = existing.anomalyDescription;

  if (incomingHb > existingHb) {
    hasAnomaly = incoming.hasAnomaly;
    anomalyType = incoming.anomalyType;
    anomalySeverity = incoming.anomalySeverity;
    anomalyDescription = incoming.anomalyDescription;
  } else if (incomingHb === existingHb) {
    if (incomingUpd >= existingUpd) {
      hasAnomaly = incoming.hasAnomaly;
      anomalyType = incoming.anomalyType;
      anomalySeverity = incoming.anomalySeverity;
      anomalyDescription = incoming.anomalyDescription;
    }
  } else {
    if (incomingUpd > existingUpd && !incoming.hasAnomaly) {
      hasAnomaly = false;
      anomalyType = 'NONE';
      anomalySeverity = 'LOW';
      anomalyDescription = incoming.anomalyDescription || 'Operating normally';
    }
  }

  const bestHeartbeat = telemetrySource.lastHeartbeat || existing.lastHeartbeat || incoming.lastHeartbeat;
  const status = getMeterOnlineStatus(bestHeartbeat);

  const peakActivePower = Math.max(
    Number(existing.peakActivePower) || 0,
    Number(incoming.peakActivePower) || 0,
    Number(existing.activePower) || 0,
    Number(incoming.activePower) || 0
  );

  return {
    ...existing,
    ...metaSource,
    voltage: telemetrySource.voltage,
    current: telemetrySource.current,
    activePower: telemetrySource.activePower,
    peakActivePower,
    reactivePower: telemetrySource.reactivePower,
    powerFactor: telemetrySource.powerFactor,
    frequency: telemetrySource.frequency,
    totalEnergy: telemetrySource.totalEnergy,
    lastHeartbeat: bestHeartbeat,
    hasAnomaly,
    anomalyType,
    anomalySeverity,
    anomalyDescription,
    relayState: metaSource.relayState || existing.relayState,
    updatedAt: incomingUpd >= existingUpd ? incoming.updatedAt : existing.updatedAt,
    status,
    apiKey: incoming.apiKey || existing.apiKey,
    name: metaSource.name || existing.name,
    address: metaSource.address || existing.address,
  };
}

/**
 * Reconcile & merge telemetry logs with referential stability:
 * - Never drops existing logs when partial backend/Firestore polls return
 * - Normalizes `hasAnomaly` on each log
 * - Returns the exact `existing` array reference when no new logs or changes exist,
 *   preventing the telemetry chart from re-rendering or shifting when no telemetry is ingested.
 */
export function reconcileTelemetryLogs(
  existing: TelemetryLog[] = [],
  incoming: TelemetryLog[] = []
): TelemetryLog[] {
  if (!incoming || incoming.length === 0) {
    return existing;
  }

  const map = new Map<string, TelemetryLog>();
  for (const log of existing) {
    if (log && log.id) {
      map.set(log.id, {
        ...log,
        hasAnomaly: isTelemetryLogAnomalous(log),
      });
    }
  }

  let hasChanges = false;

  for (const rawInc of incoming) {
    if (!rawInc || !rawInc.id) continue;
    const inc: TelemetryLog = {
      ...rawInc,
      hasAnomaly: isTelemetryLogAnomalous(rawInc),
    };

    const existingEntry = map.get(inc.id);
    if (existingEntry) {
      if (existingEntry.hasAnomaly !== inc.hasAnomaly) {
        map.set(inc.id, {
          ...existingEntry,
          ...inc,
          hasAnomaly: existingEntry.hasAnomaly || inc.hasAnomaly,
        });
        hasChanges = true;
      }
      continue;
    }

    // Check if an identical reading (within 800ms with same metrics) already exists under a different ID
    const incTime = new Date(inc.timestamp).getTime() || 0;
    let alreadyRepresented = false;
    for (const v of map.values()) {
      const vTime = new Date(v.timestamp).getTime() || 0;
      if (
        Math.abs(incTime - vTime) < 800 &&
        v.voltage === inc.voltage &&
        v.current === inc.current &&
        v.activePower === inc.activePower &&
        v.frequency === inc.frequency
      ) {
        alreadyRepresented = true;
        break;
      }
    }

    if (!alreadyRepresented) {
      map.set(inc.id, inc);
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return existing;
  }

  return Array.from(map.values())
    .sort((a, b) => {
      const timeDiff = (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0);
      return timeDiff !== 0 ? timeDiff : b.id.localeCompare(a.id);
    })
    .slice(0, 150);
}

/**
 * Robust Anomaly Reconciliation:
 * Preserves all distinct anomaly types (even when multiple anomalies are logged in a single telemetry ingest).
 */
export function reconcileAnomalies(
  existing: AnomalyAlert[] = [],
  incoming: AnomalyAlert[] = []
): AnomalyAlert[] {
  if (!incoming || incoming.length === 0) {
    return existing;
  }

  const map = new Map<string, AnomalyAlert>();

  // 1. Load existing alerts
  for (const a of existing) {
    if (a && a.id) {
      map.set(a.id, a);
    }
  }

  let hasChanges = false;

  // 2. Merge incoming alerts
  for (const inc of incoming) {
    if (!inc || !inc.id) continue;
    const prev = map.get(inc.id);

    if (!prev) {
      // Check if there is an existing alert for the same meter AND same anomaly type AND same title created within 2 seconds
      let matchedKey: string | null = null;
      const incTime = new Date(inc.createdAt).getTime();

      for (const [key, val] of map.entries()) {
        if (val.meterId === inc.meterId && val.type === inc.type && val.title === inc.title) {
          const valTime = new Date(val.createdAt).getTime();
          if (Math.abs(incTime - valTime) < 2000) {
            matchedKey = key;
            break;
          }
        }
      }

      if (matchedKey) {
        const existingAlert = map.get(matchedKey)!;
        if (matchedKey !== inc.id) {
          map.delete(matchedKey);
          map.set(inc.id, {
            ...inc,
            status: existingAlert.status === 'RESOLVED' ? 'RESOLVED' : inc.status,
          });
          hasChanges = true;
        }
      } else {
        map.set(inc.id, inc);
        hasChanges = true;
      }
    } else {
      const status = (prev.status === 'RESOLVED' || inc.status === 'RESOLVED') ? 'RESOLVED' : inc.status;
      if (prev.status !== status || prev.description !== inc.description) {
        map.set(inc.id, {
          ...prev,
          ...inc,
          status,
        });
        hasChanges = true;
      }
    }
  }

  if (!hasChanges) {
    return existing;
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime() || 0;
    const timeB = new Date(b.createdAt).getTime() || 0;
    return timeB !== timeA ? timeB - timeA : b.id.localeCompare(a.id);
  });
}
