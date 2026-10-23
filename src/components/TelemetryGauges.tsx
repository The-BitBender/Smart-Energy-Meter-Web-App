import React from 'react';
import { 
  Zap, 
  Activity, 
  Gauge, 
  Flame, 
  TrendingUp, 
  Clock, 
  Compass, 
  DollarSign, 
  Leaf
} from 'lucide-react';
import { Meter } from '../types/energy';

interface TelemetryGaugesProps {
  meter: Meter;
}

export const TelemetryGauges: React.FC<TelemetryGaugesProps> = ({ meter }) => {
  // Calculations
  const apparentPowerVA = Math.round(meter.voltage * meter.current);
  const activePowerKW = (meter.activePower / 1000).toFixed(3);
  const reactivePowerKVAR = (meter.reactivePower / 1000).toFixed(3);
  const costPerHour = ((meter.activePower / 1000) * 0.18).toFixed(3);
  const totalCost = (meter.totalEnergy * 0.18).toFixed(2);
  const co2Kg = (meter.totalEnergy * 0.475).toFixed(1);

  // Voltage health evaluation (230V reference)
  const voltagePercent = Math.min(100, Math.max(0, ((meter.voltage - 160) / (280 - 160)) * 100));
  const isVoltageHealthy = meter.voltage >= 207 && meter.voltage <= 253;

  // Current load rating (assuming 40A breaker max)
  const currentPercent = Math.min(100, Math.max(0, (meter.current / 40) * 100));

  // Power factor quality
  const pfQuality = meter.powerFactor >= 0.95 ? 'Optimal' : meter.powerFactor >= 0.85 ? 'Acceptable' : 'Low PF';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      
      {/* 1. Cumulative Energy (kWh) - FIRST as requested - Dominant Teal Green #005149 */}
      <div className="relative overflow-hidden rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg hover:border-white/40 transition-all text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-sm">
              <TrendingUp className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-100">
                Cumulative Energy
              </span>
              <div className="text-[11px] text-teal-200/80">Total Consumption Meter Register</div>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white text-[#005149] font-extrabold shadow-sm">
            ${totalCost} Billed
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white drop-shadow-xs">
              {meter.totalEnergy.toFixed(2)}
            </span>
            <span className="text-lg font-bold text-teal-200">kWh</span>
          </div>
          <div className="text-right text-xs font-mono text-teal-100 flex flex-col items-end">
            <div className="flex items-center space-x-1 text-white font-bold bg-white/15 px-2 py-0.5 rounded-full">
              <Leaf className="w-3.5 h-3.5 text-emerald-300" />
              <span>{co2Kg} kg CO₂</span>
            </div>
            <div className="text-[10px] text-teal-200/70 mt-0.5">Carbon offset est.</div>
          </div>
        </div>

        {/* Digital Odometer Register styling in crisp white on teal */}
        <div className="mt-4 p-2.5 rounded-xl bg-[#003833] border border-white/20 flex items-center justify-between font-mono text-xs shadow-inner">
          <span className="text-xs font-bold text-teal-200">METER REGISTER:</span>
          <div className="flex space-x-1">
            {meter.totalEnergy.toFixed(2).padStart(8, '0').split('').map((char, idx) => (
              <span
                key={idx}
                className={`px-1.5 py-0.5 rounded text-xs font-black shadow-sm ${
                  char === '.'
                    ? 'text-white font-extrabold'
                    : idx >= 6
                    ? 'bg-rose-500 text-white font-bold'
                    : 'bg-white text-[#005149] font-black'
                }`}
              >
                {char}
              </span>
            ))}
            <span className="text-teal-200 font-bold ml-1">kWh</span>
          </div>
        </div>
      </div>

      {/* 2. Active Real Power (W / kW) - SECOND as requested - Dominant Teal Green #005149 */}
      <div className="relative overflow-hidden rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg hover:border-white/40 transition-all text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-sm">
              <Flame className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-100">
                Active Real Power
              </span>
              <div className="text-[11px] text-teal-200/80">P = V × I × cos(φ)</div>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold border border-white/30 flex items-center space-x-1">
            <DollarSign className="w-3 h-3 text-emerald-300" />
            <span>${costPerHour}/hr</span>
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white drop-shadow-xs">
              {meter.activePower >= 1000 ? activePowerKW : meter.activePower.toFixed(1)}
            </span>
            <span className="text-lg font-bold text-teal-200">
              {meter.activePower >= 1000 ? 'kW' : 'W'}
            </span>
          </div>
          <div className="text-right text-xs font-mono text-teal-100">
            <div className="font-semibold text-white">Raw: {meter.activePower.toFixed(0)} Watts</div>
            <div className="text-teal-200 font-medium">{(meter.activePower / 1000 * 24).toFixed(1)} kWh/day est.</div>
          </div>
        </div>

        <div className="mt-4 pt-2.5 border-t border-white/15 flex items-center justify-between text-xs text-teal-100">
          <span className="font-medium text-teal-200">Relay Contact:</span>
          <span className={`font-mono font-bold px-2.5 py-0.5 rounded text-[11px] ${
            meter.relayState === 'ON' 
              ? 'bg-emerald-400 text-[#003833] font-black' 
              : 'bg-rose-500 text-white font-black'
          }`}>
            {meter.relayState === 'ON' ? 'ENERGIZED (ON)' : 'DISCONNECTED (OFF)'}
          </span>
        </div>
      </div>

      {/* 3. Reactive Power & PF (VAR / kVAR) - THIRD as requested - Dominant Teal Green #005149 */}
      <div className="relative overflow-hidden rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg hover:border-white/40 transition-all text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-sm">
              <Compass className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-100">
                Reactive Power &amp; PF
              </span>
              <div className="text-[11px] text-teal-200/80">Q = V × I × sin(φ)</div>
            </div>
          </div>
          <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-bold ${
            meter.powerFactor >= 0.90 
              ? 'bg-white/20 text-white border-white/30' 
              : 'bg-amber-400 text-[#003833] border-amber-300 font-black'
          }`}>
            {pfQuality}
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white drop-shadow-xs">
                {meter.reactivePower.toFixed(0)}
              </span>
              <span className="text-lg font-bold text-teal-200">VAR</span>
            </div>
            <div className="text-[11px] text-teal-200 font-mono mt-0.5">({reactivePowerKVAR} kVAR)</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-teal-200 uppercase font-semibold">Power Factor</div>
            <div className="text-3xl font-black font-mono text-white">
              {meter.powerFactor.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-2.5 border-t border-white/15 flex items-center justify-between text-xs text-teal-100 font-mono">
          <span>Phase Angle: {(Math.acos(Math.min(1, Math.max(-1, meter.powerFactor))) * (180 / Math.PI)).toFixed(1)}°</span>
          <span className="text-white font-bold">Inductive Lag</span>
        </div>
      </div>

      {/* 4. Line Voltage (V) - FOURTH as requested - Dominant Teal Green #005149 */}
      <div className="relative overflow-hidden rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg hover:border-white/40 transition-all text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-sm">
              <Zap className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-100">
                Line Voltage
              </span>
              <div className="text-[11px] text-teal-200/80">Phase-to-Neutral (RMS)</div>
            </div>
          </div>
          <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-bold ${
            isVoltageHealthy 
              ? 'bg-emerald-400 text-[#003833] font-black' 
              : 'bg-rose-500 text-white font-black'
          }`}>
            {isVoltageHealthy ? 'NOMINAL' : 'UNSTABLE'}
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white drop-shadow-xs">
              {meter.voltage.toFixed(1)}
            </span>
            <span className="text-lg font-bold text-teal-200">V</span>
          </div>
          <div className="text-right text-xs font-mono text-teal-100">
            <div className="font-semibold text-white">Ref: 230.0 V</div>
            <div className={meter.voltage >= 230 ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold'}>
              {meter.voltage >= 230 ? '+' : ''}{(meter.voltage - 230).toFixed(1)}V deviation
            </div>
          </div>
        </div>

        {/* Progress gauge bar */}
        <div className="mt-3">
          <div className="h-2.5 w-full rounded-full bg-[#003833] overflow-hidden flex">
            <div
              className={`h-full transition-all duration-500 ${
                isVoltageHealthy ? 'bg-white' : 'bg-rose-400'
              }`}
              style={{ width: `${voltagePercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-teal-200 mt-1.5">
            <span>160V</span>
            <span>207V min</span>
            <span className="text-white font-black">230V</span>
            <span>253V max</span>
            <span>280V</span>
          </div>
        </div>
      </div>

      {/* 5. Load Current (A) - FIFTH as requested - Dominant Teal Green #005149 */}
      <div className="relative overflow-hidden rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg hover:border-white/40 transition-all text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-sm">
              <Activity className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-100">
                AC Load Current
              </span>
              <div className="text-[11px] text-teal-200/80">Instantaneous RMS Current</div>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30 font-bold">
            Apparent: {apparentPowerVA} VA
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white drop-shadow-xs">
              {meter.current.toFixed(2)}
            </span>
            <span className="text-lg font-bold text-teal-200">A</span>
          </div>
          <div className="text-right text-xs font-mono text-teal-100">
            <div className="font-semibold text-white">Rated: 40.0 A max</div>
            <div className="text-white font-extrabold">{currentPercent.toFixed(0)}% Line Utilization</div>
          </div>
        </div>

        {/* Current load bar */}
        <div className="mt-3">
          <div className="h-2.5 w-full rounded-full bg-[#003833] overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                currentPercent > 80 ? 'bg-rose-400' : currentPercent > 50 ? 'bg-amber-400' : 'bg-white'
              }`}
              style={{ width: `${currentPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-teal-200 mt-1.5">
            <span>0 A</span>
            <span>10 A</span>
            <span>20 A</span>
            <span>30 A</span>
            <span>40 A (Trip Limit)</span>
          </div>
        </div>
      </div>

      {/* 6. Grid Frequency & System Telemetry Health - SIXTH - Dominant Teal Green #005149 */}
      <div className="relative overflow-hidden rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg hover:border-white/40 transition-all text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-sm">
              <Gauge className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-100">
                Grid Frequency
              </span>
              <div className="text-[11px] text-teal-200/80">AC Alternation Rate</div>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white text-[#005149] font-black">
            SYNC LOCK
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white drop-shadow-xs">
              {meter.frequency.toFixed(2)}
            </span>
            <span className="text-lg font-bold text-teal-200">Hz</span>
          </div>
          <div className="text-right text-xs font-mono text-teal-100">
            <div className="font-semibold text-white">Target: 50.00 Hz</div>
            <div className="text-teal-200 font-bold">{(meter.frequency - 50.0).toFixed(2)} Hz drift</div>
          </div>
        </div>

        <div className="mt-4 pt-2.5 border-t border-white/15 flex items-center justify-between text-xs text-teal-100">
          <span className="flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-300" />
            <span>Updated: {new Date(meter.updatedAt).toLocaleTimeString()}</span>
          </span>
          <span className="font-mono text-[11px] text-white font-bold truncate max-w-[130px]">
            {meter.address.split(',')[0]}
          </span>
        </div>
      </div>

    </div>
  );
};
