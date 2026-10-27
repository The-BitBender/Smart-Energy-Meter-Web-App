import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Sparkles, 
  Copy, 
  Check, 
  ArrowRight, 
  MapPin, 
  ShieldCheck, 
  Sliders
} from 'lucide-react';
import { generate16CharApiKey, formatMeterId } from '../utils/statusHelper';

interface MeterOnboardingModalProps {
  isOpen: boolean;
  user: any;
  onComplete: (meterData: {
    meterId: string;
    name: string;
    apiKey: string;
    latitude: number;
    longitude: number;
    address: string;
  }) => Promise<void>;
  isLoading: boolean;
  existingMetersCount?: number;
}

export const MeterOnboardingModal: React.FC<MeterOnboardingModalProps> = ({
  isOpen,
  user,
  onComplete,
  isLoading,
  existingMetersCount = 0,
}) => {
  const [tab, setTab] = useState<'overview' | 'customize'>('overview');
  
  // State for credentials
  const [meterId, setMeterId] = useState(`MTR-${String(existingMetersCount + 1).padStart(4, '0')}`);
  const [apiKey, setApiKey] = useState(generate16CharApiKey());
  const [name, setName] = useState('');
  const [address, setAddress] = useState('Distribution Pole 14, Commercial Substation Area');
  const [latitude, setLatitude] = useState('6.5244');
  const [longitude, setLongitude] = useState('3.3792');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsDetecting, setGpsDetecting] = useState(false);

  // Initialize auto-generated credentials on modal open based on total meters created
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchNextId = async () => {
      try {
        const res = await fetch('/api/meters/next-id');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.nextMeterId) {
            setMeterId(data.nextMeterId);
            setName(`Main Feeder Board (${data.nextMeterId})`);
            return;
          }
        }
      } catch (err) {
        console.warn('Next ID endpoint query notice:', err);
      }

      if (isMounted) {
        const fallbackId = formatMeterId(existingMetersCount + 1);
        setMeterId(fallbackId);
        setName(`Main Feeder Board (${fallbackId})`);
      }
    };

    fetchNextId();
    // Strictly auto-generate 16-character secure API key (rotation format)
    setApiKey(generate16CharApiKey());
    setError(null);

    return () => {
      isMounted = false;
    };
  }, [isOpen, existingMetersCount]);

  if (!isOpen) return null;

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(5));
        setLongitude(pos.coords.longitude.toFixed(5));
        setGpsDetecting(false);
      },
      (err) => {
        console.warn('GPS detection notice:', err);
        setGpsDetecting(false);
        setError('Could not detect exact GPS coordinates. Using default.');
      },
      { timeout: 8000 }
    );
  };

  const firmwareSnippet = `// ==========================================
// VoltPulse IoT - ESP32 Hardware Credentials
// Flash this config to your ESP32 Arduino Sketch
// ==========================================
#define METER_ID   "${meterId}"
#define API_KEY    "${apiKey}"
#define INGEST_URL "http://YOUR_SERVER_IP:3000/api/telemetry/ingest"

// Sensor Pin Definitions
#define PIN_VOLTAGE_ADC  35 // ZMPT101B Voltage Sensor
#define PIN_CURRENT_ADC  34 // SCT-013-000 Current Transformer
#define PIN_RELAY_TRIP   26 // Solid-state Trip Relay
#define PIN_STATUS_LED    2 // Heartbeat LED`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(firmwareSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(meterId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const cleanMeterId = meterId.trim();
    if (!cleanMeterId) {
      setError('Meter Hardware ID is required');
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Please provide valid numerical GPS coordinates');
      return;
    }

    try {
      await onComplete({
        meterId: cleanMeterId,
        name: name.trim() || `Smart Meter ${cleanMeterId}`,
        apiKey: apiKey.trim(),
        latitude: lat,
        longitude: lng,
        address: address.trim() || 'Smart Grid Connection Point',
      });
    } catch (err: any) {
      console.error('Onboarding completion error:', err);
      let msg = err?.message || 'Failed to initialize meter. Please try again.';
      if (msg.includes('Unexpected token') || msg.includes('JSON') || msg.includes('server error')) {
        msg = 'Connection to meter service was interrupted. Please click Save again.';
      }
      setError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#003833] border-2 border-white/20 shadow-2xl p-6 sm:p-8 text-white my-8 max-h-[92vh] overflow-y-auto">
        
        {/* Wizard Header */}
        <div className="flex items-start justify-between pb-6 border-b border-white/15">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white text-[#005149] flex items-center justify-center shadow-lg font-black shrink-0">
              <Cpu className="w-7 h-7 text-[#005149]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-200 bg-white/10 px-2 py-0.5 rounded">
                  Initial Setup Step 1 of 1
                </span>
                <span className="text-xs text-emerald-400 font-mono font-bold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Account Active</span>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Connect Your ESP32 Energy Meter
              </h2>
              <p className="text-xs text-teal-100/90 mt-0.5">
                Welcome {user?.displayName || user?.email || 'Operator'}! Provision your hardware telemetry credentials to start streaming live grid metrics.
              </p>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex rounded-xl bg-[#002b27] p-1 border border-white/15 my-6">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              tab === 'overview'
                ? 'bg-white text-[#005149] shadow-md'
                : 'text-teal-200 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Auto-Generated Credentials (Recommended)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('customize')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              tab === 'customize'
                ? 'bg-white text-[#005149] shadow-md'
                : 'text-teal-200 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Customize Site &amp; Location</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* TAB 1: Auto Credentials Overview */}
        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Meter ID Card */}
              <div className="p-4 rounded-2xl bg-[#002b27] border border-white/15 space-y-2">
                <div className="flex items-center justify-between text-xs text-teal-200">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Meter Hardware ID</span>
                  <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-teal-200 font-bold">
                    Auto-Sequential
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-black font-mono text-white tracking-wide">
                    {meterId}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 transition-colors"
                    title="Copy Meter ID"
                  >
                    {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-teal-300/80">
                  Assigned automatically from total meters created across all accounts.
                </p>
              </div>

              {/* API Key Card (NO INPUT FIELD) */}
              <div className="p-4 rounded-2xl bg-[#002b27] border border-white/15 space-y-2">
                <div className="flex items-center justify-between text-xs text-teal-200">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Hardware Secret Key</span>
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-500/30">
                    16 Chars Fixed
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm sm:text-base font-bold font-mono text-emerald-300 tracking-wider truncate mr-2">
                    {apiKey}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 transition-colors shrink-0"
                    title="Copy API Key"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-teal-300/80">
                  Cryptographic random token. Never requires manual typing.
                </p>
              </div>
            </div>

            {/* Zero State Notice */}
            <div className="p-3.5 rounded-xl bg-[#002420] border border-white/10 text-xs text-teal-100 flex items-start space-x-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-white">Clean Zero Baseline Initialization</div>
                <div className="text-[11px] text-teal-200/80">
                  When initialized, all dashboard telemetry readings (voltage, active power, current, power factor, frequency, energy) will start at <strong>0.0</strong> in <strong>OFFLINE</strong> status until real-world hardware data is streamed.
                </div>
              </div>
            </div>

            {/* Firmware Code Snippet */}
            <div className="rounded-2xl bg-[#001e1b] border border-white/15 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-200 font-mono">
                  ESP32 Arduino Firmware Config (Ready to Flash)
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-mono text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied Code!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="text-[11px] font-mono text-teal-100/90 p-3 bg-black/40 rounded-xl overflow-x-auto leading-relaxed border border-white/5">
                {firmwareSnippet}
              </pre>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <span>{isLoading ? 'Registering & Linking Meter...' : 'Save & Open Live Energy Dashboard'}</span>
                <ArrowRight className="w-4 h-4 text-[#005149]" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Customize Installation Details (NO API KEY FIELD) */}
        {tab === 'customize' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Read-only Hardware Credentials Notice */}
            <div className="p-3.5 rounded-xl bg-[#002420] border border-teal-500/30 flex items-center justify-between text-xs">
              <div>
                <span className="text-teal-300/80 font-mono text-[11px]">Assigned Meter ID: </span>
                <span className="font-mono font-bold text-white text-sm">{meterId}</span>
              </div>
              <div className="text-right">
                <span className="text-teal-300/80 font-mono text-[11px]">API Key: </span>
                <span className="font-mono font-bold text-emerald-300">{apiKey.substring(0, 7)}...</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-teal-100 uppercase tracking-wide mb-1">
                Panel / Distribution Feeder Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Workshop Sub-Distribution Board"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white text-sm focus:outline-hidden focus:border-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-teal-100 uppercase tracking-wide mb-1">
                Physical Installation Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Distribution Pole 14, Commercial Way"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white text-sm focus:outline-hidden focus:border-white"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-teal-100 uppercase tracking-wide flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-300" />
                  <span>GPS Decimal Coordinates</span>
                </label>
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  disabled={gpsDetecting}
                  className="text-[11px] text-teal-200 hover:text-white font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <MapPin className="w-3 h-3 text-emerald-300" />
                  <span>{gpsDetecting ? 'Detecting GPS...' : 'Use My Current Location'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude (e.g. 6.5244)"
                  className="px-3.5 py-2 rounded-xl bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-hidden focus:border-white"
                  required
                />
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude (e.g. 3.3792)"
                  className="px-3.5 py-2 rounded-xl bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-hidden focus:border-white"
                  required
                />
              </div>
            </div>

            {/* Zero State Reminder */}
            <div className="p-3 rounded-xl bg-[#002420] border border-white/10 text-[11px] text-teal-200 flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                All gauges (voltage, power, current, energy) will start at <strong>0.0</strong> in <strong>OFFLINE</strong> state.
              </span>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <span>{isLoading ? 'Connecting Hardware...' : 'Link Meter & Launch Dashboard'}</span>
                <ArrowRight className="w-4 h-4 text-[#005149]" />
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
