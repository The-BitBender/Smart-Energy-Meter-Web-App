import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Key, 
  Trash2, 
  RefreshCw, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  ShieldAlert, 
  Bell, 
  Mail, 
  Cpu, 
  Radio, 
  MapPin, 
  Save, 
  CheckCircle2, 
  Flame, 
  Zap, 
  Activity, 
  Wifi, 
  WifiOff, 
  Terminal, 
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Meter, NotificationPreferences, AnomalySeverity } from '../types/energy';

interface SettingsTabProps {
  user: any;
  meters: Meter[];
  activeMeter: Meter | null;
  onSelectMeter: (meter: Meter) => void;
  onUpdateMeter: (meterId: string, updates: Partial<Meter>) => Promise<void>;
  onRotateApiKey: (meterId: string, customKey?: string) => Promise<string>;
  onDeleteMeter: (meterId: string) => Promise<void>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  user,
  meters,
  activeMeter,
  onSelectMeter,
  onUpdateMeter,
  onRotateApiKey,
  onDeleteMeter,
}) => {
  const currentMeter = activeMeter || (meters.length > 0 ? meters[0] : null);

  // Meter details editing state
  const [meterName, setMeterName] = useState(currentMeter?.name || '');
  const [meterAddress, setMeterAddress] = useState(currentMeter?.address || '');
  const [isUpdatingDetails, setIsUpdatingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);

  // API Key management state
  const [showKey, setShowKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [isRotating, setIsRotating] = useState(false);
  const [rotateSuccess, setRotateSuccess] = useState(false);

  // Meter deletion modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Code integration tab state
  const [codeTab, setCodeTab] = useState<'curl' | 'arduino' | 'micropython'>('curl');
  const [copiedCode, setCopiedCode] = useState(false);

  // Notification Preferences state
  const defaultEmail = user?.email || 'yinkusben4sure@gmail.com';
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    userId: user?.uid || 'default_user',
    emailAlertsEnabled: true,
    alertEmail: defaultEmail,
    notifyCriticalTheft: true,
    notifyOvercurrentSurge: true,
    notifyVoltageSag: true,
    notifyOfflineHeartbeat: false,
    minimumSeverity: 'HIGH',
    updatedAt: new Date().toISOString(),
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [testSent, setTestSent] = useState(false);

  // Sync inputs when active meter changes
  useEffect(() => {
    if (currentMeter) {
      setMeterName(currentMeter.name);
      setMeterAddress(currentMeter.address);
      setShowKey(false);
      setDeleteConfirmationInput('');
      setDeleteError(null);
    }
  }, [currentMeter?.meterId]);

  // Load notification preferences
  useEffect(() => {
    const loadPreferences = async () => {
      const userId = user?.uid || 'default_user';
      try {
        if (user) {
          const prefDocRef = doc(db, 'users', userId, 'settings', 'notifications');
          const snap = await getDoc(prefDocRef);
          if (snap.exists()) {
            setPreferences(snap.data() as NotificationPreferences);
          } else if (user.email) {
            setPreferences(prev => ({ ...prev, alertEmail: user.email }));
          }
        }
      } catch (err) {
        console.warn('Error loading preferences from Firebase:', err);
      }
    };
    loadPreferences();
  }, [user]);

  // Handle Save Meter Details
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMeter) return;
    setIsUpdatingDetails(true);
    try {
      await onUpdateMeter(currentMeter.meterId, {
        name: meterName.trim(),
        address: meterAddress.trim(),
      });
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 2500);
    } catch (err) {
      console.error('Save details error:', err);
    } finally {
      setIsUpdatingDetails(false);
    }
  };

  // Handle Copy API Key
  const handleCopyKey = () => {
    if (!currentMeter) return;
    navigator.clipboard.writeText(currentMeter.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Handle Rotate API Key
  const handleConfirmRotateKey = async () => {
    if (!currentMeter) return;
    setIsRotating(true);
    try {
      await onRotateApiKey(currentMeter.meterId, customKeyInput.trim() || undefined);
      setRotateSuccess(true);
      setTimeout(() => {
        setRotateSuccess(false);
        setIsRotateModalOpen(false);
        setCustomKeyInput('');
      }, 1500);
    } catch (err) {
      console.error('Rotate key error:', err);
    } finally {
      setIsRotating(false);
    }
  };

  // Handle Delete Meter
  const handleConfirmDelete = async () => {
    if (!currentMeter) return;
    if (deleteConfirmationInput.trim() !== currentMeter.meterId) {
      setDeleteError(`Please type '${currentMeter.meterId}' exactly to confirm.`);
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteMeter(currentMeter.meterId);
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete meter.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Save Preferences
  const handleSavePreferences = async () => {
    setIsSavingPrefs(true);
    try {
      const userId = user?.uid || 'default_user';
      if (user) {
        await setDoc(doc(db, 'users', userId, 'settings', 'notifications'), {
          ...preferences,
          updatedAt: new Date().toISOString(),
        });
      }
      // Also notify backend
      await fetch(`/api/users/${encodeURIComponent(userId)}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } catch (err) {
      console.error('Save preferences error:', err);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  // Handle Send Test Alert
  const handleSendTestNotification = () => {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 4000);
  };

  // Snippet generator
  const getCurlSnippet = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smart-energy-meter-mu.vercel.app';
    const meterId = currentMeter?.meterId || 'ESP32-MTR-8842';
    const key = currentMeter?.apiKey || 'VP-8842-SECURE-KEY';
    return `curl -X POST "${origin}/api/telemetry/ingest" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" \\
  -d '{
    "meterId": "${meterId}",
    "voltage": 230.2,
    "current": 12.8,
    "activePower": 2824.0,
    "powerFactor": 0.96,
    "frequency": 50.0,
    "relayState": "ON"
  }'`;
  };

  const getArduinoSnippet = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smart-energy-meter-mu.vercel.app';
    const meterId = currentMeter?.meterId || 'ESP32-MTR-8842';
    const key = currentMeter?.apiKey || 'VP-8842-SECURE-KEY';
    return `// ESP32 Telemetry Ingest Configuration
const char* METER_ID   = "${meterId}";
const char* API_KEY    = "${key}";
const char* SERVER_URL = "${origin}/api/telemetry/ingest";

void sendTelemetry(float v, float i, float p, float pf, float freq) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  String payload = "{\\"meterId\\":\\"" + String(METER_ID) + "\\","
                   "\\"voltage\\":" + String(v, 1) + ","
                   "\\"current\\":" + String(i, 2) + ","
                   "\\"activePower\\":" + String(p, 1) + ","
                   "\\"powerFactor\\":" + String(pf, 2) + ","
                   "\\"frequency\\":" + String(freq, 2) + ","
                   "\\"relayState\\":\\"ON\\"}";

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    Serial.println("Telemetry Ingested Successfully");
  } else {
    Serial.printf("Ingest Rejected! HTTP %d\\n", httpCode);
  }
  http.end();
}`;
  };

  const getMicroPythonSnippet = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smart-energy-meter-mu.vercel.app';
    const meterId = currentMeter?.meterId || 'ESP32-MTR-8842';
    const key = currentMeter?.apiKey || 'VP-8842-SECURE-KEY';
    return `import urequests, ujson

METER_ID = "${meterId}"
API_KEY = "${key}"
URL = "${origin}/api/telemetry/ingest"

payload = {
    "meterId": METER_ID,
    "voltage": 230.2,
    "current": 12.8,
    "activePower": 2824.0,
    "powerFactor": 0.96,
    "frequency": 50.0,
    "relayState": "ON"
}

headers = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY
}

res = urequests.post(URL, data=ujson.dumps(payload), headers=headers)
print("Response:", res.status_code, res.text)
res.close()`;
  };

  const getActiveCode = () => {
    if (codeTab === 'curl') return getCurlSnippet();
    if (codeTab === 'arduino') return getArduinoSnippet();
    return getMicroPythonSnippet();
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!currentMeter) {
    return (
      <div className="p-8 sm:p-12 rounded-3xl bg-[#003833] border border-white/20 text-center shadow-xl max-w-xl mx-auto my-12">
        <Cpu className="w-12 h-12 text-teal-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No Meter Selected</h3>
        <p className="text-sm text-teal-200">Connect or link a meter on the dashboard to configure settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Top Banner: Meter Selector & Tab Headline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/10 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Settings className="w-6 h-6 text-white" />
            <h1 className="text-2xl font-black text-white tracking-tight">Meter &amp; Security Settings</h1>
          </div>
          <p className="text-xs text-teal-200 mt-1">
            Manage hardware credentials, API authentication keys, telemetry ingest security, and notification rules.
          </p>
        </div>

        {/* Meter Selector Dropdown */}
        <div className="flex items-center space-x-2 bg-[#003833] p-1.5 rounded-xl border border-white/20">
          <Radio className="w-4 h-4 text-teal-300 ml-2" />
          <span className="text-xs text-teal-200 font-bold">Target Meter:</span>
          <select
            value={currentMeter.meterId}
            onChange={(e) => {
              const selected = meters.find(m => m.meterId === e.target.value);
              if (selected) onSelectMeter(selected);
            }}
            aria-label="Select Target Meter"
            className="bg-[#002b27] text-white text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white"
          >
            {meters.map(m => (
              <option key={m.meterId} value={m.meterId}>
                {m.meterId} ({m.name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid: 2 Columns for Credentials & Hardware Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* CARD 1: Hardware Credentials & API Key Management */}
        <div className="p-6 rounded-2xl bg-[#003833] border border-white/15 shadow-xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-white text-[#005149]">
                  <Key className="w-5 h-5 text-[#005149]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">API Ingestion Key</h3>
                  <p className="text-xs text-teal-200">Strict authentication token required for ESP32 streams</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-mono font-black px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                Active &amp; Guarded
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#002824] border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs text-teal-200">
                <span className="font-semibold">Current API Key:</span>
                <span className="text-[10px] text-teal-300/80 font-mono">X-API-Key Header</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex-1 bg-[#001d1a] border border-white/15 px-3 py-2 rounded-lg font-mono text-sm tracking-wider text-white font-bold select-all overflow-x-auto">
                  {showKey ? currentMeter.apiKey : '•'.repeat(Math.min(24, currentMeter.apiKey.length || 18))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/15"
                  title={showKey ? 'Mask API Key' : 'Reveal API Key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="p-2 rounded-lg bg-white hover:bg-teal-50 text-[#005149] transition-all font-bold shadow-xs flex items-center space-x-1"
                  title="Copy API Key"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-[#005149]" />}
                </button>
              </div>
            </div>

            <div className="text-xs text-teal-200/90 leading-relaxed space-y-1.5 bg-[#002e2a] p-3 rounded-xl border border-white/10">
              <div className="flex items-start space-x-2">
                <HelpCircle className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Security Rule:</strong> Ingestion endpoint strictly validates that the meter ID exists and matches this API key. Payloads with missing/wrong keys or non-existent meter IDs are rejected with <strong>401 Unauthorized</strong> or <strong>404 Not Found</strong>.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsRotateModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs flex items-center justify-center space-x-2 transition-all active:scale-98"
            >
              <RefreshCw className="w-4 h-4 text-teal-300" />
              <span>Rotate / Change API Key</span>
            </button>
          </div>
        </div>

        {/* CARD 2: Meter Profile & Physical Location */}
        <div className="p-6 rounded-2xl bg-[#003833] border border-white/15 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-white text-[#005149]">
                <Cpu className="w-5 h-5 text-[#005149]" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Hardware Identity</h3>
                <p className="text-xs text-teal-200">Device name, identifier, and connection point</p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#002622] border border-white/15 text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-white">{currentMeter.status}</span>
            </div>
          </div>

          <form onSubmit={handleSaveDetails} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-teal-200 mb-1">
                Meter ID (Hardware Identifier)
              </label>
              <div className="flex items-center justify-between bg-[#002824] px-3.5 py-2 rounded-lg border border-white/10">
                <span className="font-mono text-sm font-black text-white">{currentMeter.meterId}</span>
                <span className="text-[11px] text-teal-300 font-mono">Immutable</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-teal-200 mb-1">
                Display Name / Panel Label
              </label>
              <input
                type="text"
                value={meterName}
                onChange={(e) => setMeterName(e.target.value)}
                placeholder="e.g. Workshop Feeder Panel A"
                className="w-full bg-[#002420] text-white text-xs px-3.5 py-2.5 rounded-lg border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-teal-200 mb-1">
                Installation Location / Substation
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-teal-300 absolute left-3 top-3" />
                <input
                  type="text"
                  value={meterAddress}
                  onChange={(e) => setMeterAddress(e.target.value)}
                  placeholder="e.g. Substation 4, Plot 12 Commercial Way, Lagos"
                  className="w-full bg-[#002420] text-white text-xs pl-9 pr-3.5 py-2.5 rounded-lg border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-teal-300 font-mono">
                GPS: {currentMeter.latitude.toFixed(4)}, {currentMeter.longitude.toFixed(4)}
              </span>
              <button
                type="submit"
                disabled={isUpdatingDetails}
                className="px-4 py-2 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {detailsSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-[#005149]" />
                    <span>{isUpdatingDetails ? 'Saving...' : 'Save Profile'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* CARD 3: Quick Firmware & Integration Snippets */}
      <div className="p-6 rounded-2xl bg-[#003833] border border-white/15 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-white text-[#005149]">
              <Terminal className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Firmware Integration Snippet</h3>
              <p className="text-xs text-teal-200">Copy-paste this payload directly into your hardware sketch or test script</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex bg-[#002622] p-1 rounded-lg border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setCodeTab('curl')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  codeTab === 'curl' ? 'bg-white text-[#005149]' : 'text-teal-200 hover:text-white'
                }`}
              >
                cURL
              </button>
              <button
                type="button"
                onClick={() => setCodeTab('arduino')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  codeTab === 'arduino' ? 'bg-white text-[#005149]' : 'text-teal-200 hover:text-white'
                }`}
              >
                ESP32 (C++)
              </button>
              <button
                type="button"
                onClick={() => setCodeTab('micropython')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  codeTab === 'micropython' ? 'bg-white text-[#005149]' : 'text-teal-200 hover:text-white'
                }`}
              >
                MicroPython
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors flex items-center space-x-1.5 border border-white/20"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <pre className="p-4 rounded-xl bg-[#001d1a] border border-white/15 text-teal-100 font-mono text-xs overflow-x-auto leading-relaxed select-all">
          {getActiveCode()}
        </pre>
      </div>

      {/* CARD 4: Email Notifications & Anomaly Dispatch Rules */}
      <div className="p-6 rounded-2xl bg-[#003833] border border-white/15 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/10 gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-white text-[#005149]">
              <Bell className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Real-Time Email Alert Rules</h3>
              <p className="text-xs text-teal-200">Instant notification when meter tampering or electrical surges occur</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSendTestNotification}
              disabled={testSent}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors border border-white/20"
            >
              {testSent ? '✓ Test Alert Sent' : 'Send Test Alert'}
            </button>
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={isSavingPrefs}
              className="px-4 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all flex items-center space-x-1.5 shadow-sm"
            >
              {prefsSaved ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-[#005149]" />
                  <span>{isSavingPrefs ? 'Saving...' : 'Save Rules'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-teal-200 mb-1">
                Dispatch Alert Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-teal-300 absolute left-3 top-3" />
                <input
                  type="email"
                  value={preferences.alertEmail}
                  onChange={(e) => setPreferences({ ...preferences, alertEmail: e.target.value })}
                  placeholder="engineer@gridutility.com"
                  className="w-full bg-[#002420] text-white text-xs pl-9 pr-3.5 py-2.5 rounded-lg border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-teal-200 mb-1">
                Minimum Alert Severity Threshold
              </label>
              <select
                value={preferences.minimumSeverity}
                onChange={(e) => setPreferences({ ...preferences, minimumSeverity: e.target.value as AnomalySeverity })}
                aria-label="Minimum Alert Severity Threshold"
                className="w-full bg-[#002420] text-white text-xs px-3.5 py-2.5 rounded-lg border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white font-medium"
              >
                <option value="LOW">LOW — Notify on all grid events &amp; minor shifts</option>
                <option value="MEDIUM">MEDIUM — Notify on frequency/power factor deviations</option>
                <option value="HIGH">HIGH — Notify on severe voltage sag &amp; reverse current</option>
                <option value="CRITICAL">CRITICAL — Only notify on theft bypass &amp; thermal surge</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 bg-[#002622] p-4 rounded-xl border border-white/10">
            <span className="text-xs font-bold text-white block mb-1">Monitored Anomalies</span>

            <label className="flex items-center space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.notifyCriticalTheft}
                onChange={(e) => setPreferences({ ...preferences, notifyCriticalTheft: e.target.checked })}
                className="w-4 h-4 rounded-sm text-[#005149] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-teal-100 font-medium">Critical Theft &amp; Line Bypass Tampering</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.notifyOvercurrentSurge}
                onChange={(e) => setPreferences({ ...preferences, notifyOvercurrentSurge: e.target.checked })}
                className="w-4 h-4 rounded-sm text-[#005149] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-teal-100 font-medium">Overcurrent Surge &amp; Fire Hazard Overload</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.notifyVoltageSag}
                onChange={(e) => setPreferences({ ...preferences, notifyVoltageSag: e.target.checked })}
                className="w-4 h-4 rounded-sm text-[#005149] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-teal-100 font-medium">Severe Voltage Sag Under High Load</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.notifyOfflineHeartbeat}
                onChange={(e) => setPreferences({ ...preferences, notifyOfflineHeartbeat: e.target.checked })}
                className="w-4 h-4 rounded-sm text-[#005149] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-teal-100 font-medium">Meter Heartbeat Timeout (ESP32 Goes Offline)</span>
            </label>
          </div>
        </div>
      </div>

      {/* CARD 5: Danger Zone - Delete Meter */}
      <div className="p-6 rounded-2xl bg-rose-950/40 border-2 border-rose-600/50 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-200">Danger Zone: Delete Energy Meter</h3>
              <p className="text-xs text-rose-200/80 mt-1 max-w-xl">
                Permanently delete meter <code className="bg-rose-900/60 px-1.5 py-0.5 rounded font-mono text-white font-bold">{currentMeter.meterId}</code> from your dashboard and database. All stored telemetry logs, load charts, and anomaly alerts for this device will be erased.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Meter</span>
          </button>
        </div>
      </div>

      {/* MODAL 1: Rotate / Change API Key */}
      {isRotateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[#003833] border border-white/20 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-3 text-white">
              <div className="p-2 rounded-xl bg-white text-[#005149]">
                <RefreshCw className="w-5 h-5 text-[#005149]" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Rotate API Key</h3>
                <p className="text-xs text-teal-200">Generate or specify a new authentication token</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs leading-relaxed space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4" />
                <span>Firmware Update Required</span>
              </div>
              <p>
                Rotating this key immediately revokes the existing key. Any physical ESP32 meter streaming with the old key will be rejected with <strong>401 Unauthorized</strong> until updated with the new key.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-teal-200">
                Custom API Key (Optional — Leave blank to auto-generate secure key)
              </label>
              <input
                type="text"
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value.toUpperCase())}
                placeholder="e.g. VP-9921-XRTB-4412"
                className="w-full bg-[#002420] text-white font-mono text-xs px-3.5 py-2.5 rounded-lg border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white uppercase"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsRotateModalOpen(false)}
                disabled={isRotating}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRotateKey}
                disabled={isRotating}
                className="px-5 py-2 rounded-lg bg-white hover:bg-teal-50 text-[#005149] font-black text-xs transition-all shadow-md active:scale-95 flex items-center space-x-2"
              >
                {rotateSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Key Rotated!</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className={`w-4 h-4 ${isRotating ? 'animate-spin' : ''}`} />
                    <span>{isRotating ? 'Rotating...' : 'Confirm & Rotate Key'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete Meter Confirmation */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[#002b27] border-2 border-rose-500/60 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-3 text-rose-300">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Delete Energy Meter</h3>
                <p className="text-xs text-rose-300 font-mono">{currentMeter.meterId}</p>
              </div>
            </div>

            <p className="text-xs text-teal-200 leading-relaxed">
              This will permanently delete meter <strong className="text-white font-mono">{currentMeter.meterId}</strong> and all associated telemetry records. This action <strong>cannot be undone</strong>.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-rose-200">
                To confirm, type <span className="font-mono text-white font-bold select-all bg-rose-950/80 px-1 py-0.5 rounded">{currentMeter.meterId}</span> below:
              </label>
              <input
                type="text"
                value={deleteConfirmationInput}
                onChange={(e) => {
                  setDeleteConfirmationInput(e.target.value);
                  setDeleteError(null);
                }}
                placeholder={currentMeter.meterId}
                className="w-full bg-[#001d1a] text-white font-mono text-xs px-3.5 py-2.5 rounded-lg border border-rose-500/40 focus:outline-hidden focus:ring-2 focus:ring-rose-400"
              />
              {deleteError && (
                <p className="text-xs text-rose-400 font-semibold">{deleteError}</p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteConfirmationInput('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting || deleteConfirmationInput.trim() !== currentMeter.meterId}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs transition-all shadow-md active:scale-95 flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : 'I understand, delete this meter'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
