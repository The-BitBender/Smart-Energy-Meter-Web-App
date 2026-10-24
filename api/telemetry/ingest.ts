// Standalone, zero-dependency Vercel Serverless Function for ESP32 Telemetry Ingestion
// Directly handles POST /api/telemetry/ingest

export interface TelemetrySample {
  voltage: number;
  current: number;
  activePower: number;
  reactivePower: number;
  powerFactor: number;
  frequency: number;
  energy: number;
  relayState: 'ON' | 'OFF';
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

export function analyzeTelemetryForAnomalies(sample: TelemetrySample): AnomalyDetectionResult {
  const { voltage, current, activePower, powerFactor, frequency, relayState, previousSample } = sample;

  // If relay is intentionally turned OFF, any current indicates bypass or welded contacts
  if (relayState === 'OFF') {
    if (current > 0.8 || Math.abs(activePower) > 100) {
      return {
        hasAnomaly: true,
        type: 'UNMETERED_BYPASS',
        severity: 'CRITICAL',
        title: 'Unauthorized Current While Relay Tripped',
        description: `Current of ${current.toFixed(2)}A and power of ${activePower.toFixed(0)}W detected while the meter relay is commanded OFF. Strong indicator of physical line bridge or relay contact welded bypass.`,
        recommendation: 'Inspect physical meter enclosure immediately. Check for jumper wires across the relay contacts.',
      };
    }
    return {
      hasAnomaly: false,
      type: 'NONE',
      severity: 'LOW',
      title: 'Normal Idle State',
      description: 'Relay is OFF. System isolated.',
      recommendation: 'No action required.',
    };
  }

  // 1. Current Shunt / Bypass Theft
  if (previousSample && previousSample.activePower > 1200 && activePower < 5 && voltage > 200 && previousSample.voltage > 200) {
    return {
      hasAnomaly: true,
      type: 'CURRENT_SHUNT_THEFT',
      severity: 'CRITICAL',
      title: 'Sudden Load Collapse (Suspected Current Shunt)',
      description: `Active power abruptly dropped from ${previousSample.activePower.toFixed(0)}W to ${activePower.toFixed(0)}W within seconds while grid voltage remained steady at ${voltage.toFixed(1)}V. Possible CT coil bypass or magnetic tampering.`,
      recommendation: 'Deploy field inspection team to audit meter CT connections and check for external neodymium magnets or shunt jumpers.',
    };
  }

  // 2. Unmetered Bypass / Phase Discrepancy
  const apparentPower = voltage * current;
  if (apparentPower > 800 && activePower < 40 && current > 3.5) {
    return {
      hasAnomaly: true,
      type: 'UNMETERED_BYPASS',
      severity: 'HIGH',
      title: 'Phase Angle Distortion / Neutral Tamper',
      description: `Apparent power is ${apparentPower.toFixed(0)}VA with ${current.toFixed(2)}A flowing, but registered active power is only ${activePower.toFixed(0)}W (Power Factor: ${powerFactor.toFixed(2)}). Typical of missing neutral or phase inversion tamper.`,
      recommendation: 'Verify neutral conductor integrity and phase-to-ground isolation at the main service entrance.',
    };
  }

  // 3. Reverse Current Flow
  if (activePower < -60 || current < -0.3) {
    return {
      hasAnomaly: true,
      type: 'REVERSE_CURRENT',
      severity: 'HIGH',
      title: 'Reverse Power Flow Detected',
      description: `Meter recorded negative active power (${activePower.toFixed(0)}W). Unapproved grid-tied generator or reverse polarity wiring.`,
      recommendation: 'Audit customer on-site generation installations or inspect polarity of meter wiring.',
    };
  }

  // 4. Overcurrent & Surge Hazard
  if (current > 42 || activePower > 9500) {
    return {
      hasAnomaly: true,
      type: 'SURGE_SPIKE',
      severity: 'CRITICAL',
      title: 'Overcurrent Overload Warning',
      description: `Sustained current draw reached ${current.toFixed(1)}A (Active Power: ${(activePower / 1000).toFixed(2)} kW), exceeding standard residential service rating (40A). High thermal fire risk.`,
      recommendation: 'Remotely trip meter relay or switch off heavy inductive appliances immediately to prevent thermal breaker failure.',
    };
  }

  // 5. Severe Voltage Sag
  if (voltage < 190 && current > 20) {
    return {
      hasAnomaly: true,
      type: 'VOLTAGE_DROP_HIGH_DRAW',
      severity: 'HIGH',
      title: 'Severe Voltage Sag Under High Load',
      description: `Line voltage collapsed to ${voltage.toFixed(1)}V under a ${current.toFixed(1)}A load. Indicates excessive voltage drop or illegal secondary tapping.`,
      recommendation: 'Check distribution drop cable and inspect meter terminal block for hot spots.',
    };
  }

  // 6. Frequency Deviation
  if (frequency < 47.5 || frequency > 52.5) {
    return {
      hasAnomaly: true,
      type: 'FREQUENCY_INSTABILITY',
      severity: 'MEDIUM',
      title: 'Grid Frequency Anomaly',
      description: `Frequency shifted to ${frequency.toFixed(2)}Hz (Normal range: 49.5 - 50.5 Hz). Potential local generator oscillation or grid instability.`,
      recommendation: 'Monitor frequency trend; notify local grid operator if frequency fails to recover.',
    };
  }

  // 7. Voltage Swell
  if (voltage > 265) {
    return {
      hasAnomaly: true,
      type: 'SURGE_SPIKE',
      severity: 'HIGH',
      title: 'Dangerous Overvoltage Swell',
      description: `Voltage surged to ${voltage.toFixed(1)}V (> 265V threshold). Electronics and appliances risk immediate damage.`,
      recommendation: 'Recommend activating surge protection or isolating sensitive electronic loads.',
    };
  }

  // Healthy
  return {
    hasAnomaly: false,
    type: 'NONE',
    severity: 'LOW',
    title: 'Optimal Grid Operation',
    description: 'All voltage, current, power factor, and frequency metrics are within normal IEC/IEEE parameters.',
    recommendation: 'Routine periodic monitoring active.',
  };
}

// In-memory cache for warm Vercel lambda instances
const globalMeters = new Map<string, any>();
const globalLogs = new Map<string, any[]>();
const globalAnomalies = new Map<string, any[]>();

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.end(JSON.stringify(data));
}

function seedInitialDemoMeter() {
  if (globalMeters.size > 0) return;
  const now = new Date().toISOString();
  const demoMeterId = 'ESP32-MTR-8842';
  globalMeters.set(demoMeterId, {
    id: demoMeterId,
    meterId: demoMeterId,
    ownerUid: 'demo_user',
    name: 'Main Feeder Panel - Workshop A',
    relayState: 'ON',
    status: 'ONLINE',
    apiKey: 'VP-8842-SECURE-KEY',
    lastHeartbeat: now,
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
    createdAt: now,
    updatedAt: now,
  });
}

// Default export: standard Vercel serverless function entrypoint
export default async function handler(req: any, res: any) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.end();
    return;
  }

  seedInitialDemoMeter();

  // 1. GET requests: Query live meter status, logs, or list of meters
  if (req.method === 'GET') {
    try {
      const host = req.headers.host || 'localhost';
      const parsedUrl = new URL(req.url, `http://${host}`);
      const queryMeterId = parsedUrl.searchParams.get('meterId')?.trim();
      const action = parsedUrl.searchParams.get('action');
      const isAll = parsedUrl.searchParams.get('all') === 'true' || (!queryMeterId && !action);

      // Fast relay status poll for hardware ESP32
      if (queryMeterId && action === 'relay_status') {
        const meter = globalMeters.get(queryMeterId);
        return sendResponse(res, 200, {
          meterId: queryMeterId,
          relayState: meter ? meter.relayState : 'ON',
          status: meter ? meter.status : 'ONLINE',
        });
      }

      // Query single meter live state and recent logs
      if (queryMeterId && !isAll) {
        const meter = globalMeters.get(queryMeterId);
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

      // Query all reporting meters
      const allMeters = Array.from(globalMeters.values());
      return sendResponse(res, 200, {
        success: true,
        meters: allMeters,
        count: allMeters.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendResponse(res, 500, { error: err?.message || 'Failed to query telemetry state' });
    }
  }

  if (req.method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method Not Allowed. Use GET or POST.' });
  }

  try {
    const payload = await parseRequestBody(req);
    const meterId = payload.meterId?.trim();
    if (!meterId) {
      return sendResponse(res, 400, { error: 'meterId is required in request body' });
    }

    const now = new Date().toISOString();

    // Check if this is a remote relay toggle command
    if (payload.action === 'relay_toggle' || (payload.relayState && payload.voltage === undefined && payload.current === undefined)) {
      let meter = globalMeters.get(meterId);
      if (!meter) {
        meter = {
          id: meterId,
          meterId,
          ownerUid: payload.ownerUid || 'demo_user',
          name: `ESP32 Meter ${meterId}`,
          relayState: payload.relayState,
          status: 'ONLINE',
          apiKey: `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          lastHeartbeat: now,
          latitude: 6.5244,
          longitude: 3.3792,
          address: 'Smart Grid Connection Point',
          voltage: 230.0,
          current: 0.0,
          activePower: 0.0,
          reactivePower: 0.0,
          powerFactor: 0.98,
          frequency: 50.0,
          totalEnergy: 0.0,
          hasAnomaly: false,
          anomalyType: 'NONE',
          anomalySeverity: 'LOW',
          anomalyDescription: 'System normal',
          createdAt: now,
          updatedAt: now,
        };
      } else {
        meter.relayState = payload.relayState;
        meter.updatedAt = now;
      }
      globalMeters.set(meterId, meter);

      return sendResponse(res, 200, {
        success: true,
        meterId,
        relayState: meter.relayState,
        updatedAt: now,
      });
    }

    const apiKey = (req.headers['x-api-key'] as string) || payload.apiKey;

    const voltage = Number(payload.voltage) || 230.0;
    const current = Number(payload.current) || 0.0;
    const powerFactor = payload.powerFactor !== undefined ? Number(payload.powerFactor) : 0.96;
    const activePower = payload.activePower !== undefined ? Number(payload.activePower) : Math.round(voltage * current * powerFactor * 10) / 10;
    
    const apparentPower = Math.abs(voltage * current);
    let reactivePower = payload.reactivePower !== undefined ? Number(payload.reactivePower) : 0;
    if (payload.reactivePower === undefined && apparentPower >= Math.abs(activePower)) {
      reactivePower = Math.round(Math.sqrt(Math.max(0, (apparentPower * apparentPower) - (activePower * activePower))) * 10) / 10;
    }

    const frequency = Number(payload.frequency) || 50.0;
    let existingMeter = globalMeters.get(meterId);
    const relayState = payload.relayState || (existingMeter ? existingMeter.relayState : 'ON');
    const energy = payload.energy !== undefined ? Number(payload.energy) : (existingMeter ? Math.round((existingMeter.totalEnergy + 0.005) * 1000) / 1000 : 12.45);

    const prevSample = existingMeter ? {
      voltage: existingMeter.voltage,
      current: existingMeter.current,
      activePower: existingMeter.activePower,
      energy: existingMeter.totalEnergy,
      timestamp: existingMeter.updatedAt,
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

    const anomalyResult = analyzeTelemetryForAnomalies(sample);

    if (!existingMeter) {
      existingMeter = {
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
        hasAnomaly: anomalyResult.hasAnomaly,
        anomalyType: anomalyResult.type,
        anomalySeverity: anomalyResult.severity,
        anomalyDescription: anomalyResult.hasAnomaly ? anomalyResult.description : 'System normal',
        createdAt: now,
        updatedAt: now,
      };
    } else {
      existingMeter.voltage = voltage;
      existingMeter.current = current;
      existingMeter.activePower = activePower;
      existingMeter.reactivePower = reactivePower;
      existingMeter.powerFactor = powerFactor;
      existingMeter.frequency = frequency;
      existingMeter.totalEnergy = energy;
      existingMeter.relayState = relayState;
      existingMeter.status = 'ONLINE';
      existingMeter.lastHeartbeat = now;
      existingMeter.updatedAt = now;
      if (apiKey) existingMeter.apiKey = apiKey;
      if (payload.ownerUid && payload.ownerUid !== 'demo_user') existingMeter.ownerUid = payload.ownerUid;
      existingMeter.hasAnomaly = anomalyResult.hasAnomaly;
      existingMeter.anomalyType = anomalyResult.type;
      existingMeter.anomalySeverity = anomalyResult.severity;
      existingMeter.anomalyDescription = anomalyResult.hasAnomaly ? anomalyResult.description : 'System normal';
    }

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

    if (anomalyResult.hasAnomaly) {
      const alertId = `ALT-${Date.now()}`;
      const alert = {
        id: alertId,
        meterId,
        ownerUid: existingMeter.ownerUid,
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
      const alerts = globalAnomalies.get(meterId) || [];
      alerts.unshift(alert);
      if (alerts.length > 50) alerts.pop();
      globalAnomalies.set(meterId, alerts);
    }

    return sendResponse(res, 200, {
      success: true,
      meterId,
      relayState: existingMeter.relayState,
      anomalyDetected: anomalyResult.hasAnomaly,
      anomaly: anomalyResult,
      meter: existingMeter,
      log,
      telemetryLog: log,
      timestamp: now,
    });
  } catch (err: any) {
    console.error('[Telemetry Ingest Error]', err);
    return sendResponse(res, 500, {
      error: err?.message || 'Internal telemetry processing error',
    });
  }
}
