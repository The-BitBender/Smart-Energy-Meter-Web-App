import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Key, 
  Sparkles, 
  Copy, 
  Check, 
  ArrowRight, 
  MapPin, 
  RefreshCw, 
  Sliders, 
  ShieldCheck, 
  AlertCircle,
  Wifi,
  Radio
} from 'lucide-react';
import { Meter } from '../types/energy';

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
}

export const MeterOnboardingModal: React.FC<MeterOnboardingModalProps> = ({
  isOpen,
  user,
  onComplete,
  isLoading,
}) => {
  const [tab, setTab] = useState<'auto' | 'custom'>('auto');
  
  // State for credentials
  const [meterId, setMeterId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('6.5244');
  const [longitude, setLongitude] = useState('3.3792');
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsDetecting, setGpsDetecting] = useState(false);

  // Helper to generate unique IDs
  const generateRandomCredentials = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    return {
      id: `ESP32-MTR-${randomNum}`,
      key: `VP-${randomNum}-${randomHex}-KEY`,
      defaultName: `Main Feeder Board (Meter ${randomNum})`,
      defaultAddress: 'Distribution Pole 14, Commercial Substation Area',
    };
  };

  // Initialize auto-generated credentials on mount
  useEffect(() => {
    if (isOpen) {
      const generated = generateRandomCredentials();
      setMeterId(generated.id);
      setApiKey(generated.key);
      setName(generated.defaultName);
      setAddress(generated.defaultAddress);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRegenerate = () => {
    const generated = generateRandomCredentials();
    setMeterId(generated.id);
    setApiKey(generated.key);
    setName(generated.defaultName);
  };

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
        setError('Could not detect exact GPS coordinates. Using substation default.');
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
        name: name.trim() || `ESP32 Meter ${cleanMeterId}`,
        apiKey: apiKey.trim() || `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#003833] border-2 border-white/20 shadow-2xl p-6 sm:p-8 text-white my-8">
        
        {/* Glow accent */}
        <div className="absolute top-0 right-1/4 -mt-10 w-40 h-40 bg-teal-400/20 rounded-full blur-3xl pointer-events-none"></div>

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
            onClick={() => setTab('auto')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-black transition-all ${
              tab === 'auto'
                ? 'bg-white text-[#005149] shadow-md'
                : 'text-teal-200 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Auto-Generate Credentials (Recommended)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('custom')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-black transition-all ${
              tab === 'custom'
                ? 'bg-white text-[#005149] shadow-md'
                : 'text-teal-200 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Custom Hardware Input</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs flex items-start space-x-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: Auto-Generated Mode */}
        {tab === 'auto' && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-[#004741] border border-white/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-100 uppercase tracking-wide">
                  Auto-Provisioned Hardware Credentials
                </span>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="flex items-center space-x-1 text-xs text-white hover:text-teal-100 font-bold bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3 h-3 text-teal-200" />
                  <span>Regenerate Pair</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
                <div className="p-3 rounded-xl bg-[#002f2b] border border-white/10">
                  <span className="text-[10px] text-teal-300 uppercase block font-sans font-bold">Meter Hardware ID</span>
                  <span className="text-base font-extrabold text-white tracking-wide">{meterId}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#002f2b] border border-white/10">
                  <span className="text-[10px] text-teal-300 uppercase block font-sans font-bold">Hardware API Secret Key</span>
                  <span className="text-xs font-extrabold text-amber-300 tracking-wider truncate block">{apiKey}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-teal-100 pt-1">
                <span>Panel Label: <strong className="text-white">{name}</strong></span>
                <span className="text-teal-300 font-mono text-[11px]">GPS: {latitude}, {longitude}</span>
              </div>
            </div>

            {/* Ready-to-flash C++ Code Snippet */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-teal-100 uppercase tracking-wide flex items-center space-x-1.5">
                  <Cpu className="w-3.5 h-3.5 text-teal-200" />
                  <span>Ready-to-Flash ESP32 Firmware Snippet</span>
                </label>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span className="text-emerald-300">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-teal-200" />
                      <span>Copy Snippet</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-[#002723] border border-white/15 text-[11px] font-mono text-teal-100 overflow-x-auto leading-relaxed">
                {firmwareSnippet}
              </pre>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
              >
                <span>{isLoading ? 'Registering & Linking Meter...' : 'Save & Open Live Energy Dashboard'}</span>
                <ArrowRight className="w-4 h-4 text-[#005149]" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Custom Configuration Mode */}
        {tab === 'custom' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-teal-100 uppercase tracking-wide">
                    Meter Hardware ID
                  </label>
                  <button
                    type="button"
                    onClick={() => setMeterId(`ESP32-MTR-${Math.floor(1000 + Math.random() * 9000)}`)}
                    className="text-[11px] text-teal-200 hover:text-white underline"
                  >
                    Random ID
                  </button>
                </div>
                <input
                  type="text"
                  value={meterId}
                  onChange={(e) => setMeterId(e.target.value)}
                  placeholder="e.g. ESP32-MTR-9021"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white font-mono text-sm focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-teal-100 uppercase tracking-wide">
                    Hardware API Secret Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setApiKey(`VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}-KEY`)}
                    className="text-[11px] text-teal-200 hover:text-white underline"
                  >
                    Random Key
                  </button>
                </div>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="e.g. VP-9021-SECURE-KEY"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-white"
                  required
                />
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white text-sm focus:outline-none focus:border-white"
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white text-sm focus:outline-none focus:border-white"
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
                  className="text-[11px] text-teal-200 hover:text-white font-bold flex items-center space-x-1"
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
                  className="px-3.5 py-2 rounded-xl bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-white"
                  required
                />
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude (e.g. 3.3792)"
                  className="px-3.5 py-2 rounded-xl bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-white"
                  required
                />
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
              >
                <span>{isLoading ? 'Connecting Hardware...' : 'Link Custom Meter & Launch Dashboard'}</span>
                <ArrowRight className="w-4 h-4 text-[#005149]" />
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
