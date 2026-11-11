import React, { useState } from 'react';
import { Power, AlertTriangle, RefreshCw } from 'lucide-react';
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

  const pendingCmd =
    meter.pendingRelayCommand === 'ON' || meter.pendingRelayCommand === 'OFF'
      ? meter.pendingRelayCommand
      : null;
  const hasPendingCommand = Boolean(pendingCmd && pendingCmd !== meter.relayState);
  const isEnergized = meter.relayState === 'ON';

  // Effective target state if the user clicks the button:
  // - If a command is currently pending, clicking cancels the pending command (reverts target to current confirmed relayState)
  // - Otherwise, clicking toggles to the opposite of current confirmed relayState
  const handleInitiateToggle = () => {
    if (hasPendingCommand) {
      // Cancel pending command by setting target back to current confirmed physical state
      onToggleRelay(meter.relayState);
      return;
    }

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
      <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-5 px-5 py-3.5 rounded-2xl bg-[#1e373e] border-2 border-white/25 shadow-xl text-white">
        <div className="flex items-center space-x-3.5">
          <div
            className={`p-2.5 rounded-xl border transition-all shrink-0 shadow-sm ${
              hasPendingCommand
                ? 'bg-amber-400 text-[#112327] border-amber-300'
                : isEnergized
                ? 'bg-white text-[#112327] border-white/40'
                : 'bg-rose-500 text-white border-rose-400'
            }`}
          >
            {hasPendingCommand ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Power className="w-5 h-5" />
            )}
          </div>
          <div className="leading-snug">
            <div className="flex items-center space-x-2.5">
              <span className="text-sm sm:text-base font-black text-white whitespace-nowrap tracking-tight">
                Remote Control
              </span>
              <span
                className={`text-xs font-mono px-2.5 py-0.5 rounded-full font-black shadow-xs whitespace-nowrap ${
                  hasPendingCommand
                    ? 'bg-amber-400 text-[#112327]'
                    : isEnergized
                    ? 'bg-emerald-400 text-[#112327]'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {hasPendingCommand
                  ? `PENDING ${pendingCmd}`
                  : isEnergized
                  ? 'ON'
                  : 'OFF'}
              </span>
            </div>
            <p className="text-xs text-white/75 mt-0.5">
              {hasPendingCommand
                ? `Command locked • Awaiting meter ${pendingCmd} confirmation`
                : isEnergized
                ? 'Load energized'
                : 'Load disconnected'}
            </p>
          </div>
        </div>

        <button
          onClick={handleInitiateToggle}
          disabled={isLoading}
          type="button"
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-black text-sm tracking-wide transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
            hasPendingCommand
              ? 'bg-[#112327] hover:bg-[#1a2d31] text-amber-300 border border-amber-400/50'
              : isEnergized
              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/40'
              : 'bg-white hover:bg-white/90 text-[#112327] shadow-lg'
          }`}
        >
          <Power className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>
            {isLoading
              ? 'Sending...'
              : hasPendingCommand
              ? `Cancel Pending ${pendingCmd}`
              : isEnergized
              ? 'Turn Off'
              : 'Turn On'}
          </span>
        </button>
      </div>

      {/* Confirmation Modal to avoid accidental power shutoff */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#1a2d31] border border-white/20 shadow-2xl p-6 text-white">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300 flex-shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Confirm Power Cutoff?
                </h3>
                <p className="text-xs text-white/80 mt-1.5 leading-relaxed">
                  Are you sure you want to queue a remote <strong>OFF</strong> command for{' '}
                  <strong>{meter.meterId}</strong>? The command will be locked as{' '}
                  <strong>PENDING OFF</strong> and executed by the meter on its next telemetry response.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-[#1e373e] hover:bg-[#112327] border border-white/15 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmShutoff}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-900/40 cursor-pointer"
              >
                Turn Off Relay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
