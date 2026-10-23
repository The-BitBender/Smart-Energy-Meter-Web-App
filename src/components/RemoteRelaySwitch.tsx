import React, { useState } from 'react';
import { Power, Cpu, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { Meter } from '../types/energy';

interface RemoteRelaySwitchProps {
  meter: Meter;
  onToggleRelay: (newState: 'ON' | 'OFF') => Promise<void>;
  isLoading: boolean;
}

export const RemoteRelaySwitch: React.FC<RemoteRelaySwitchProps> = ({
  meter,
  onToggleRelay,
  isLoading,
}) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const isEnergized = meter.relayState === 'ON';

  const handleInitiateToggle = () => {
    if (isEnergized) {
      setShowConfirmModal(true);
    } else {
      onToggleRelay('ON');
    }
  };

  const handleConfirmShutoff = async () => {
    setShowConfirmModal(false);
    await onToggleRelay('OFF');
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg mb-6 text-white transition-all hover:border-white/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          {/* Left info & status */}
          <div className="flex items-start space-x-3.5">
            <div className={`p-3 rounded-2xl border transition-all ${
              isEnergized
                ? 'bg-white text-[#005149] border-white/40 shadow-sm'
                : 'bg-rose-500 text-white border-rose-400 shadow-sm'
            }`}>
              <Power className={`w-6 h-6 ${isEnergized ? 'animate-pulse' : ''}`} />
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-200">
                  Remote Circuit Breaker &amp; Contactor
                </span>
                <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-black ${
                  isEnergized
                    ? 'bg-emerald-400 text-[#003833]'
                    : 'bg-rose-500 text-white'
                }`}>
                  {isEnergized ? 'CIRCUIT ENERGIZED (LIVE)' : 'CIRCUIT ISOLATED (TRIPPED)'}
                </span>
              </div>

              <h4 className="text-base sm:text-lg font-bold text-white mt-1 flex items-center space-x-2">
                <span>Relay Output Control: {meter.name}</span>
              </h4>

              <p className="text-xs text-teal-100 mt-1 max-w-xl leading-relaxed">
                {isEnergized
                  ? 'Main AC contactor is CLOSED. Downstream loads are powered. Commanded through ESP32 GPIO.'
                  : 'Main AC contactor is OPEN. Output power is completely cut off for safety or load shedding.'}
              </p>

              <div className="flex items-center space-x-4 mt-2 text-[11px] font-mono text-teal-200">
                <span className="flex items-center space-x-1">
                  <Cpu className="w-3.5 h-3.5 text-white" />
                  <span>Target Meter ID: <strong className="text-white">{meter.meterId}</strong></span>
                </span>
                <span>•</span>
                <span>Signal: HTTP REST / MQTT Synchronized</span>
              </div>
            </div>
          </div>

          {/* Right: Big industrial toggle button */}
          <div className="flex items-center sm:self-center">
            <button
              onClick={handleInitiateToggle}
              disabled={isLoading}
              type="button"
              className={`relative flex items-center justify-center space-x-2.5 px-6 py-3.5 rounded-xl font-black text-xs tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                isEnergized
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/40'
                  : 'bg-white hover:bg-teal-50 text-[#005149] shadow-lg'
              }`}
            >
              <Power className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>
                {isLoading
                  ? 'Transmitting Command...'
                  : isEnergized
                  ? 'REMOTE CUTOFF (TURN OFF)'
                  : 'RE-ENERGIZE (TURN ON)'}
              </span>
            </button>
          </div>
        </div>

        {/* Relay contact schematic visual */}
        <div className="mt-4 pt-4 border-t border-white/15 flex items-center justify-between text-xs font-mono text-teal-100">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white">GRID L1 INPUT</span>
            <span className="text-teal-300">─────</span>
            <div className={`px-2.5 py-0.5 rounded text-[11px] border flex items-center space-x-1.5 font-bold ${
              isEnergized 
                ? 'bg-white text-[#005149] border-white' 
                : 'bg-rose-500 text-white border-rose-400'
            }`}>
              {isEnergized ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              <span>{isEnergized ? '[== CONTACT CLOSED ==]' : '[ / CONTACT OPEN / ]'}</span>
            </div>
            <span className="text-teal-300">─────</span>
            <span className="font-bold text-white">CUSTOMER LOAD</span>
          </div>

          <div className="hidden sm:block text-[11px]">
            Relay Latency: <span className="text-white font-black">&lt; 280ms</span>
          </div>
        </div>
      </div>

      {/* Confirmation Modal to avoid accidental power shutoff */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#00423c] border border-white/20 shadow-2xl p-6 text-white">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300 flex-shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Confirm Remote Power Cutoff?
                </h3>
                <p className="text-xs text-teal-100 mt-1.5 leading-relaxed">
                  You are about to send a remote trip signal to meter <strong>{meter.meterId}</strong>.
                  This will immediately disconnect electrical power to all downstream circuits connected to this panel.
                </p>
              </div>
            </div>

            <div className="mt-5 p-3 rounded-xl bg-[#002d28] border border-white/10 text-xs font-mono text-teal-200 space-y-1">
              <div className="flex justify-between">
                <span>Current Active Power:</span>
                <span className="text-white font-bold">{meter.activePower.toFixed(0)} W</span>
              </div>
              <div className="flex justify-between">
                <span>Current Amperage:</span>
                <span className="text-white font-bold">{meter.current.toFixed(2)} A</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmShutoff}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-900/40"
              >
                Confirm Cutoff (Turn OFF)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
