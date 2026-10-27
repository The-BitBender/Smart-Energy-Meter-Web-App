import { Meter } from '../types/energy';

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
 * Robust Meter Reconciliation:
 * Prevents telemetry values from fluctuating by ensuring newer readings are NEVER overwritten
 * by stale polling data or older Firestore snapshots.
 */
export function reconcileMeter(existing: Meter | null | undefined, incoming: Meter): Meter {
  if (!existing) {
    const status = getMeterOnlineStatus(incoming.lastHeartbeat);
    return { ...incoming, status };
  }

  const existingTime = new Date(existing.updatedAt || existing.lastHeartbeat || 0).getTime();
  const incomingTime = new Date(incoming.updatedAt || incoming.lastHeartbeat || 0).getTime();

  // If incoming telemetry is newer or identical in time, accept the new readings
  if (incomingTime >= existingTime) {
    const status = getMeterOnlineStatus(incoming.lastHeartbeat || existing.lastHeartbeat);
    return {
      ...existing,
      ...incoming,
      status,
      // Preserve any local active changes if missing from incoming
      apiKey: incoming.apiKey || existing.apiKey,
      name: incoming.name || existing.name,
      address: incoming.address || existing.address,
    };
  }

  // Incoming data is OLDER than current local state!
  // Do NOT revert the live telemetry metrics (voltage, current, power, energy, heartbeat)
  const status = getMeterOnlineStatus(existing.lastHeartbeat);
  return {
    ...incoming,
    // Keep newer telemetry values
    voltage: existing.voltage,
    current: existing.current,
    activePower: existing.activePower,
    reactivePower: existing.reactivePower,
    powerFactor: existing.powerFactor,
    frequency: existing.frequency,
    totalEnergy: existing.totalEnergy,
    relayState: existing.relayState,
    hasAnomaly: existing.hasAnomaly,
    anomalyType: existing.anomalyType,
    anomalySeverity: existing.anomalySeverity,
    anomalyDescription: existing.anomalyDescription,
    lastHeartbeat: existing.lastHeartbeat,
    updatedAt: existing.updatedAt,
    status,
    apiKey: incoming.apiKey || existing.apiKey,
  };
}
