import { AnomalyDetectionResult, AnomalyType } from '../types/energy';

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

/**
 * Advanced electrical anomaly and theft detection heuristics for ESP32 Energy Meters
 */
export function analyzeTelemetryForAnomalies(sample: TelemetrySample): AnomalyDetectionResult {
  const { voltage, current, activePower, reactivePower, powerFactor, frequency, relayState, previousSample } = sample;

  // If relay is intentionally turned OFF, zero current and power are expected normal behavior
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
  // Relay is ON, Voltage is healthy, but previous load (> 1000W) dropped instantly to 0W while voltage didn't change
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
  // Apparent power S = V * I is substantial, but active power is suspiciously close to 0 with distorted PF
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

  // 3. Reverse Current Flow (Illegal Backfeeding / Reverse Polarity)
  if (activePower < -60 || current < -0.3) {
    return {
      hasAnomaly: true,
      type: 'REVERSE_CURRENT',
      severity: 'HIGH',
      title: 'Reverse Power Flow Detected',
      description: `Meter recorded negative active power (${activePower.toFixed(0)}W). If an unapproved grid-tied generator or solar inverter is backfeeding into the grid without net-metering permission, this violates utility safety standards.`,
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

  // 5. Voltage Drop with High Draw (High Impedance Line Tap)
  if (voltage < 190 && current > 20) {
    return {
      hasAnomaly: true,
      type: 'VOLTAGE_DROP_HIGH_DRAW',
      severity: 'HIGH',
      title: 'Severe Voltage Sag Under High Load',
      description: `Line voltage collapsed to ${voltage.toFixed(1)}V under a ${current.toFixed(1)}A load. Indicates excessive voltage drop, dangerous corroded feeder splice, or illegal secondary tapping on customer feed.`,
      recommendation: 'Check distribution drop cable and inspect meter terminal block for hot spots.',
    };
  }

  // 6. Frequency Deviation / Grid Instability
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
