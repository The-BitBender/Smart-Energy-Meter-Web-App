import React from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  ShieldCheck, 
  Power, 
  CheckCircle, 
  Cpu, 
  Zap, 
  FileText 
} from 'lucide-react';
import { AnomalyAlert, Meter } from '../types/energy';

interface AnomalyShieldViewProps {
  meter: Meter;
  alerts: AnomalyAlert[];
  onTripRelay: () => void;
  onResolveAlert: (alertId: string) => Promise<void>;
}

export const AnomalyShieldView: React.FC<AnomalyShieldViewProps> = ({
  meter,
  alerts,
  onTripRelay,
  onResolveAlert,
}) => {
  return (
    <div className="space-y-6">
      
      {/* Hero Overview */}
      <div className={`p-6 rounded-2xl border transition-all text-white ${
        meter.hasAnomaly
          ? 'bg-rose-950/80 border-rose-400 shadow-xl'
          : 'bg-[#005149] border-white/20 shadow-lg'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start space-x-4">
            <div className={`p-3.5 rounded-2xl border mt-1 ${
              meter.hasAnomaly
                ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                : 'bg-white text-[#005149] border-white/30 shadow-md'
            }`}>
              {meter.hasAnomaly ? (
                <ShieldAlert className="w-8 h-8 animate-bounce text-rose-300" />
              ) : (
                <ShieldCheck className="w-8 h-8 text-[#005149]" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-teal-200">
                  VoltPulse Anti-Theft &amp; Electrical Anomaly Engine
                </span>
                <span className={`text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full border ${
                  meter.hasAnomaly
                    ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                    : 'bg-white text-[#005149] border-white font-extrabold'
                }`}>
                  {meter.hasAnomaly ? 'ACTIVE THREAT DETECTED' : 'GRID INTEGRITY SECURE'}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                {meter.hasAnomaly
                  ? `Security Warning: ${meter.anomalyType.replace(/_/g, ' ')}`
                  : 'Meter Line & Telemetry Integrity Verified'}
              </h2>

              <p className="text-xs sm:text-sm text-teal-100 mt-1.5 max-w-2xl leading-relaxed">
                {meter.hasAnomaly
                  ? meter.anomalyDescription
                  : 'Real-time telemetry algorithms are continuously analyzing voltage-current phase vectors, apparent vs active power ratios, and line resistance drops to detect illegal bypassing, shunts, or neutral tampering.'}
              </p>
            </div>
          </div>

          {meter.relayState === 'ON' && meter.hasAnomaly && (
            <div className="flex-shrink-0">
              <button
                onClick={onTripRelay}
                type="button"
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md active:scale-95"
              >
                <Power className="w-4 h-4" />
                <span>Trip Circuit Relay (Cutoff)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Forensic Detection Vector Guide Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#005149] border border-white/20 shadow-md text-white hover:border-white/40 transition-all">
          <div className="flex items-center space-x-2 text-teal-200 font-extrabold text-xs uppercase tracking-wide">
            <Zap className="w-4 h-4 text-white" />
            <span className="text-white">Current Shunt Bypass</span>
          </div>
          <p className="text-xs text-teal-100 mt-2 leading-relaxed">
            Flags when grid voltage is energized (~230V) but reported current collapses to 0.00A while historical usage suggests active branch circuits, or sudden 95% drop without load stepdown.
          </p>
          <div className="mt-3 text-[11px] font-mono text-white bg-[#003833] p-2.5 rounded-lg border border-white/15 font-bold">
            Trigger: V &gt; 200V &amp; ΔP &gt; 1200W collapse
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#005149] border border-white/20 shadow-md text-white hover:border-white/40 transition-all">
          <div className="flex items-center space-x-2 text-teal-200 font-extrabold text-xs uppercase tracking-wide">
            <Cpu className="w-4 h-4 text-white" />
            <span className="text-white">Unmetered Phase Inversion</span>
          </div>
          <p className="text-xs text-teal-100 mt-2 leading-relaxed">
            Flags high apparent power (S = V × I &gt; 800VA) with suspiciously low active power (&lt; 40W) and distorted power factor, indicating missing neutral or ground-return theft.
          </p>
          <div className="mt-3 text-[11px] font-mono text-white bg-[#003833] p-2.5 rounded-lg border border-white/15 font-bold">
            Trigger: S &gt; 800VA &amp; P &lt; 40W &amp; PF &lt; 0.20
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#005149] border border-white/20 shadow-md text-white hover:border-white/40 transition-all">
          <div className="flex items-center space-x-2 text-teal-200 font-extrabold text-xs uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4 text-amber-300" />
            <span className="text-white">Voltage Sag &amp; High Tap</span>
          </div>
          <p className="text-xs text-teal-100 mt-2 leading-relaxed">
            Severe line voltage collapse (&lt; 190V) combined with high amperage (&gt; 20A), indicating high contact impedance, unauthorized upstream tapping, or overheated service cables.
          </p>
          <div className="mt-3 text-[11px] font-mono text-amber-300 bg-[#003833] p-2.5 rounded-lg border border-white/15 font-bold">
            Trigger: V &lt; 190V &amp; I &gt; 20A
          </div>
        </div>
      </div>

      {/* Incident Log Table */}
      <div className="rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg text-white">
        <div className="flex items-center justify-between pb-4 border-b border-white/15">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <FileText className="w-4 h-4 text-teal-200" />
              <span>Anomaly Incident Log &amp; Audit Trail</span>
            </h3>
            <p className="text-xs text-teal-200 mt-0.5">
              Historical record of electrical anomalies and theft warnings for Meter {meter.meterId}
            </p>
          </div>

          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-[#003833] text-white border border-white/20">
            {alerts.length} Total Incidents
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="py-12 text-center text-xs text-teal-200">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-300 mb-2" />
            <p className="font-bold text-white">No anomaly incidents recorded.</p>
            <p className="mt-0.5 text-teal-200/80">All telemetry within normal limits. You can test the detection module in the ESP32 Workbench tab!</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10 mt-2">
            {alerts.map(alert => (
              <div key={alert.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div className={`p-2 rounded-lg mt-0.5 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-500 text-white'
                      : alert.severity === 'HIGH'
                      ? 'bg-amber-400 text-[#003833]'
                      : 'bg-white text-[#005149]'
                  }`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{alert.title}</span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        alert.status === 'ACTIVE'
                          ? 'bg-rose-500 text-white border-rose-400'
                          : 'bg-emerald-400 text-[#003833] border-emerald-300'
                      }`}>
                        {alert.status}
                      </span>
                    </div>
                    <p className="text-xs text-teal-100 mt-1 max-w-2xl leading-relaxed">{alert.description}</p>
                    <div className="flex items-center space-x-3 mt-1.5 text-[11px] font-mono text-teal-200">
                      <span>Logged: {new Date(alert.createdAt).toLocaleString()}</span>
                      {alert.telemetrySnapshot && (
                        <span>
                          • Snapshot: {alert.telemetrySnapshot.voltage.toFixed(1)}V / {alert.telemetrySnapshot.current.toFixed(1)}A / {alert.telemetrySnapshot.activePower.toFixed(0)}W
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {alert.status === 'ACTIVE' && (
                  <button
                    onClick={() => onResolveAlert(alert.id)}
                    type="button"
                    className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-colors shadow-md"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Resolve Alert</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
