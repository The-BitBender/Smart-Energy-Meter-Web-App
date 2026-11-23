import React, { useState } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  ShieldCheck, 
  Power, 
  CheckCircle, 
  Cpu, 
  Zap, 
  FileText,
  ExternalLink,
  Loader2,
  X,
  Table2
} from 'lucide-react';
import { AnomalyAlert, AnomalySeverity, Meter } from '../types/energy';
import {
  authorizeGoogleDocsAccess,
  clearWorkspaceAccessToken,
  getWorkspaceAccessToken,
} from '../lib/firebase';
import {
  createAnomalyReferenceGoogleDoc,
  CreatedGoogleDocResult,
  DETECTABLE_ANOMALIES_CATALOG,
} from '../utils/googleDocsExport';

interface AnomalyShieldViewProps {
  meter: Meter;
  alerts: AnomalyAlert[];
  onTripRelay: () => void;
  onResolveAlert: (alertId: string) => Promise<void>;
}

const getSeverityBadgeClasses = (severity: AnomalySeverity) => {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-rose-500 text-white border-rose-400';
    case 'HIGH':
      return 'bg-amber-400 text-[#112327] border-amber-300';
    case 'MEDIUM':
      return 'bg-yellow-300/90 text-[#112327] border-yellow-200';
    case 'LOW':
    default:
      return 'bg-teal-300 text-[#112327] border-teal-200';
  }
};

export const AnomalyShieldView: React.FC<AnomalyShieldViewProps> = ({
  meter,
  alerts,
  onTripRelay,
  onResolveAlert,
}) => {
  const [showDocModal, setShowDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState(
    `VoltPulse IoT — Detectable Anomalies Reference (${new Date().toISOString().slice(0, 10)})`
  );
  const [isExportingDoc, setIsExportingDoc] = useState(false);
  const [isAuthorizingGoogle, setIsAuthorizingGoogle] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [createdDoc, setCreatedDoc] = useState<CreatedGoogleDocResult | null>(null);
  const [hasDocsToken, setHasDocsToken] = useState<boolean>(() => Boolean(getWorkspaceAccessToken()));

  const handleOpenDocModal = () => {
    setDocError(null);
    setHasDocsToken(Boolean(getWorkspaceAccessToken()));
    setShowDocModal(true);
  };

  const handleAuthorizeGoogleDocs = async () => {
    setDocError(null);
    setIsAuthorizingGoogle(true);
    try {
      await authorizeGoogleDocsAccess();
      setHasDocsToken(true);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setDocError('Google authorization popup was closed before completing.');
      } else if (err?.code === 'auth/popup-blocked') {
        setDocError('Popup was blocked by your browser. Allow popups for this site and try again.');
      } else {
        setDocError(err?.message || 'Failed to authorize Google Docs access.');
      }
    } finally {
      setIsAuthorizingGoogle(false);
    }
  };

  const handleConfirmCreateDoc = async () => {
    setDocError(null);
    let token = getWorkspaceAccessToken();
    if (!token) {
      setHasDocsToken(false);
      setDocError('Please connect your Google account first to grant Google Docs access.');
      return;
    }

    setIsExportingDoc(true);
    try {
      const result = await createAnomalyReferenceGoogleDoc(token, {
        title: docTitle,
        meterId: meter.meterId,
      });
      setCreatedDoc(result);
      setShowDocModal(false);
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate Google Doc.';
      if (msg.includes('DOCS_AUTH_REQUIRED')) {
        clearWorkspaceAccessToken();
        setHasDocsToken(false);
        setDocError('Your Google Docs session expired. Please sign in with Google again below.');
      } else {
        setDocError(msg);
      }
    } finally {
      setIsExportingDoc(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Hero Overview */}
      <div className={`p-6 rounded-2xl border transition-all text-white ${
        meter.hasAnomaly
          ? 'bg-rose-950/80 border-rose-400 shadow-xl'
          : 'bg-[#1e373e] border-white/20 shadow-lg'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start space-x-4">
            <div className={`p-3.5 rounded-2xl border mt-1 ${
              meter.hasAnomaly
                ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                : 'bg-white text-[#112327] border-white/30 shadow-md'
            }`}>
              {meter.hasAnomaly ? (
                <ShieldAlert className="w-8 h-8 animate-bounce text-rose-300" />
              ) : (
                <ShieldCheck className="w-8 h-8 text-[#112327]" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white/75">
                  VoltPulse Anti-Theft &amp; Electrical Anomaly Engine
                </span>
                <span className={`text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full border ${
                  meter.hasAnomaly
                    ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                    : 'bg-white text-[#112327] border-white font-extrabold'
                }`}>
                  {meter.hasAnomaly ? 'ACTIVE THREAT DETECTED' : 'GRID INTEGRITY SECURE'}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                {meter.hasAnomaly
                  ? `Security Warning: ${meter.anomalyType.replace(/_/g, ' ')}`
                  : 'Meter Line & Telemetry Integrity Verified'}
              </h2>

              <p className="text-xs sm:text-sm text-white/80 mt-1.5 max-w-2xl leading-relaxed">
                {meter.hasAnomaly
                  ? meter.anomalyDescription
                  : 'Real-time telemetry algorithms are continuously analyzing voltage-current phase vectors, apparent vs active power ratios, and line resistance drops to detect illegal bypassing, shunts, or neutral tampering.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <button
              onClick={handleOpenDocModal}
              type="button"
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-3 rounded-xl bg-white hover:bg-white/90 text-[#112327] text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#112327]" />
              <span>Export Table to Google Docs</span>
            </button>

            {meter.relayState === 'ON' && meter.hasAnomaly && (
              <button
                onClick={onTripRelay}
                type="button"
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Power className="w-4 h-4" />
                <span>Trip Circuit Relay (Cutoff)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Created Google Doc Success Banner */}
      {createdDoc && (
        <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-400/50 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-xl bg-emerald-400 text-[#112327] shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">
                Google Doc Generated Successfully
              </h3>
              <p className="text-xs text-white/80 mt-0.5">
                Created <span className="font-semibold text-white">{createdDoc.title}</span> with a formatted table of all {createdDoc.rowCount} detectable anomaly specifications.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <a
              href={createdDoc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white hover:bg-white/90 text-[#112327] text-xs font-black transition-all shadow-md"
            >
              <span>Open in Google Docs</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={() => setCreatedDoc(null)}
              aria-label="Dismiss Google Doc notification"
              className="p-2 rounded-xl bg-[#112327] hover:bg-[#1a2d31] border border-white/15 text-white/75 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Forensic Detection Vector Guide Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#1e373e] border border-white/20 shadow-md text-white hover:border-white/40 transition-all">
          <div className="flex items-center space-x-2 text-rose-300 font-extrabold text-xs uppercase tracking-wide">
            <ShieldAlert className="w-4 h-4 text-rose-300" />
            <span className="text-white">Over-voltage Surge</span>
          </div>
          <p className="text-xs text-white/80 mt-2 leading-relaxed">
            Flags dangerous overvoltage conditions: Line voltage reaching &ge; 250V is classified Critical Hazard; voltages from 242V to 250V trigger high-voltage Warning.
          </p>
          <div className="mt-3 text-[11px] font-mono text-rose-200 bg-[#112327] p-2 rounded-lg border border-white/15 font-bold">
            &ge; 250V: Critical | 242-250V: Warning
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#1e373e] border border-white/20 shadow-md text-white hover:border-white/40 transition-all">
          <div className="flex items-center space-x-2 text-amber-300 font-extrabold text-xs uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4 text-amber-300" />
            <span className="text-white">Under-voltage Sag</span>
          </div>
          <p className="text-xs text-white/80 mt-2 leading-relaxed">
            Severe line voltage collapse below 180V triggers Critical Sag hazard; line voltages sagged in the 180V - 207V band trigger brownout Warning.
          </p>
          <div className="mt-3 text-[11px] font-mono text-amber-300 bg-[#112327] p-2 rounded-lg border border-white/15 font-bold">
            &lt; 180V: Critical | 180-207V: Warning
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#1e373e] border border-white/20 shadow-md text-white hover:border-white/40 transition-all">
          <div className="flex items-center space-x-2 text-white/80 font-extrabold text-xs uppercase tracking-wide">
            <Zap className="w-4 h-4 text-white" />
            <span className="text-white">Current Shunt Bypass</span>
          </div>
          <p className="text-xs text-white/80 mt-2 leading-relaxed">
            Flags when grid voltage is energized (~230V) but reported current collapses to 0.00A while historical usage suggests active branch circuits.
          </p>
          <div className="mt-3 text-[11px] font-mono text-white bg-[#112327] p-2 rounded-lg border border-white/15 font-bold">
            Trigger: V &gt; 200V &amp; ΔP &gt; 1200W
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#1e373e] border border-white/20 shadow-md text-white hover:border-white/40 transition-all">
          <div className="flex items-center space-x-2 text-white/80 font-extrabold text-xs uppercase tracking-wide">
            <Cpu className="w-4 h-4 text-white" />
            <span className="text-white">Unmetered Bypass</span>
          </div>
          <p className="text-xs text-white/80 mt-2 leading-relaxed">
            High apparent power (S &gt; 800VA) with active power &lt; 40W and distorted PF, or current flowing while commanded relay is in OFF state.
          </p>
          <div className="mt-3 text-[11px] font-mono text-white bg-[#112327] p-2 rounded-lg border border-white/15 font-bold">
            Trigger: S &gt; 800VA &amp; P &lt; 40W
          </div>
        </div>
      </div>

      {/* Complete Detectable Anomalies Reference Table */}
      <div className="rounded-2xl bg-[#1e373e] border border-white/20 p-5 shadow-lg text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/15">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Table2 className="w-4 h-4 text-white" />
              <span>Detectable Anomalies Reference Specification</span>
            </h3>
            <p className="text-xs text-white/75 mt-0.5">
              All {DETECTABLE_ANOMALIES_CATALOG.length} anomaly types, severity tiers, and descriptions evaluated per telemetry sample
            </p>
          </div>

          <button
            onClick={handleOpenDocModal}
            type="button"
            className="self-start sm:self-center flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white hover:bg-white/90 text-[#112327] text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Generate Google Doc</span>
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-white/15 bg-[#112327]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#1a2d31] text-white/90 uppercase font-mono text-[11px] border-b border-white/15">
                <th className="py-3 px-4 font-bold">Anomaly Type</th>
                <th className="py-3 px-4 font-bold">Severity</th>
                <th className="py-3 px-4 font-bold">Description &amp; Trigger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {DETECTABLE_ANOMALIES_CATALOG.map((item) => (
                <tr key={item.id} className="hover:bg-[#1a2d31]/60 transition-colors align-top">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-mono font-bold text-white">{item.type}</div>
                    <div className="text-[11px] text-white/70 mt-0.5">{item.variant}</div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`inline-block text-[10px] font-mono font-black px-2.5 py-0.5 rounded border ${getSeverityBadgeClasses(
                        item.severity
                      )}`}
                    >
                      {item.severity}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-white/85 leading-relaxed min-w-[280px]">
                    <p>{item.description}</p>
                    <p className="text-[11px] font-mono text-white/65 mt-1">
                      Trigger: {item.trigger}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Log Table */}
      <div className="rounded-2xl bg-[#1e373e] border border-white/20 p-5 shadow-lg text-white">
        <div className="flex items-center justify-between pb-4 border-b border-white/15">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <FileText className="w-4 h-4 text-white" />
              <span>Anomaly Incident Log &amp; Audit Trail</span>
            </h3>
            <p className="text-xs text-white/75 mt-0.5">
              Historical record of electrical anomalies and theft warnings for Meter {meter.meterId}
            </p>
          </div>

          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-[#112327] text-white border border-white/20">
            {alerts.length} Total Incidents
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="py-12 text-center text-xs text-white/75">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-300 mb-2" />
            <p className="font-bold text-white">No anomaly incidents recorded.</p>
            <p className="mt-0.5 text-white/70">All telemetry within normal limits. You can test the detection module in the ESP32 Workbench tab!</p>
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
                      ? 'bg-amber-400 text-[#112327]'
                      : 'bg-white text-[#112327]'
                  }`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{alert.title}</span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        alert.status === 'ACTIVE'
                          ? 'bg-rose-500 text-white border-rose-400'
                          : 'bg-emerald-400 text-[#112327] border-emerald-300'
                      }`}>
                        {alert.status}
                      </span>
                    </div>
                    <p className="text-xs text-white/85 mt-1 max-w-2xl leading-relaxed">{alert.description}</p>
                    <div className="flex items-center space-x-3 mt-1.5 text-[11px] font-mono text-white/70">
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
                    className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-white/90 text-[#112327] text-xs font-black transition-colors shadow-md cursor-pointer"
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

      {/* Confirmation & Google Docs Export Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-[#1a2d31] border border-white/20 shadow-2xl p-6 text-white space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 rounded-xl bg-white text-[#112327] shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white">
                    Create Anomaly Reference in Google Docs?
                  </h3>
                  <p className="text-xs text-white/75 mt-1 leading-relaxed">
                    This will create a new Google Doc in your Google account containing a formatted 3-column table (Anomaly Type, Severity, Description) covering all {DETECTABLE_ANOMALIES_CATALOG.length} detectable anomalies.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg bg-[#112327] hover:bg-[#1e373e] border border-white/15 text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/90 uppercase tracking-wide mb-1.5">
                Google Document Title
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                disabled={isExportingDoc}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#112327] border border-white/20 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white"
              />
            </div>

            {docError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                <span>{docError}</span>
              </div>
            )}

            {!hasDocsToken ? (
              <div className="p-4 rounded-xl bg-[#112327] border border-white/15 space-y-3">
                <p className="text-xs text-white/85 leading-relaxed">
                  Connect your Google account with Google Docs permission to generate and populate this document directly in your Drive.
                </p>
                <button
                  type="button"
                  onClick={handleAuthorizeGoogleDocs}
                  disabled={isAuthorizingGoogle}
                  className="w-full flex items-center justify-center space-x-3 py-2.5 px-4 rounded-xl bg-white hover:bg-white/90 text-[#112327] font-bold text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4 block shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>
                    {isAuthorizingGoogle ? 'Connecting Google Docs...' : 'Sign in with Google to Authorize Docs'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-200 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>Google Docs permission ready. Click Confirm &amp; Create Google Doc below to generate the file.</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-1">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                disabled={isExportingDoc || isAuthorizingGoogle}
                className="px-4 py-2 rounded-xl bg-[#1e373e] hover:bg-[#112327] border border-white/15 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateDoc}
                disabled={!hasDocsToken || isExportingDoc || !docTitle.trim()}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white hover:bg-white/90 text-[#112327] text-xs font-black transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExportingDoc ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating Google Doc...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Create Google Doc</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
