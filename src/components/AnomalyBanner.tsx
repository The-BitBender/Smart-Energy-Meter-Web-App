import React from 'react';
import { AlertTriangle, Power, CheckCircle2, ArrowRight } from 'lucide-react';
import { Meter } from '../types/energy';

interface AnomalyBannerProps {
  meter: Meter;
  onTripRelay: () => void;
  onClearAnomaly: () => void;
  onViewDetails: () => void;
}

export const AnomalyBanner: React.FC<AnomalyBannerProps> = ({
  meter,
  onTripRelay,
  onClearAnomaly,
  onViewDetails,
}) => {
  if (!meter.hasAnomaly) return null;

  const isCritical = meter.anomalySeverity === 'CRITICAL';
  const isHigh = meter.anomalySeverity === 'HIGH';

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 mb-6 transition-all duration-300 shadow-xl ${
      isCritical
        ? 'bg-rose-950/80 border-rose-400 text-white'
        : isHigh
        ? 'bg-amber-950/80 border-amber-400 text-white'
        : 'bg-yellow-950/80 border-yellow-400 text-white'
    }`}>
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Icon and Diagnostic info */}
        <div className="flex items-start space-x-3.5">
          <div className={`flex-shrink-0 p-2.5 rounded-xl border mt-0.5 ${
            isCritical
              ? 'bg-rose-500/20 border-rose-400 text-rose-300'
              : 'bg-amber-500/20 border-amber-400 text-amber-300'
          }`}>
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-mono font-black px-2.5 py-0.5 rounded-full border tracking-wide uppercase ${
                isCritical
                  ? 'bg-rose-500 text-white border-rose-400'
                  : 'bg-amber-500 text-[#003833] border-amber-400 font-extrabold'
              }`}>
                {meter.anomalySeverity} ALERT • {meter.anomalyType.replace(/_/g, ' ')}
              </span>
              <span className="text-xs font-mono text-teal-200">
                Meter ID: <strong className="text-white">{meter.meterId}</strong>
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white mt-1">
              Potential Energy Theft or Electrical Hazard Detected
            </h3>

            <p className="text-xs sm:text-sm text-teal-100 mt-1 max-w-3xl leading-relaxed">
              {meter.anomalyDescription}
            </p>

            <div className="flex items-center space-x-4 mt-2 text-xs font-mono text-teal-200">
              <span>Telemetry Snapshot: <strong className="text-white">{meter.voltage.toFixed(1)}V</strong></span>
              <span>•</span>
              <span><strong className="text-white">{meter.current.toFixed(2)}A</strong></span>
              <span>•</span>
              <span><strong className="text-white">{meter.activePower.toFixed(0)}W</strong></span>
              <span>•</span>
              <span>PF: <strong className="text-white">{meter.powerFactor.toFixed(2)}</strong></span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap md:flex-col lg:flex-row items-center gap-2.5 flex-shrink-0">
          {meter.relayState === 'ON' && (
            <button
              onClick={onTripRelay}
              type="button"
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md active:scale-95"
            >
              <Power className="w-4 h-4" />
              <span>Emergency Cutoff</span>
            </button>
          )}

          <button
            onClick={onClearAnomaly}
            type="button"
            className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Acknowledge</span>
          </button>

          <button
            onClick={onViewDetails}
            type="button"
            className="flex items-center justify-center space-x-1 px-3 py-2 text-xs font-bold text-teal-200 hover:text-white transition-colors"
          >
            <span>Log Audit</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
