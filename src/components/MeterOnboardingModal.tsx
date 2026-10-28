import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Sparkles, 
  Copy, 
  Check, 
  ArrowRight, 
  MapPin, 
  ShieldCheck, 
  CheckCircle2, 
  Terminal,
  Plus
} from 'lucide-react';
import { Meter } from '../types/energy';

interface MeterOnboardingModalProps {
  isOpen: boolean;
  user: any;
  onComplete: (meterData: {
    meterId?: string;
    name: string;
    apiKey?: string;
    latitude: number;
    longitude: number;
    address: string;
  }) => Promise<Meter | any>;
  onClose?: () => void;
  isLoading: boolean;
  existingMetersCount?: number;
}

export const MeterOnboardingModal: React.FC<MeterOnboardingModalProps> = ({
  isOpen,
  user,
  onComplete,
  onClose,
  isLoading,
  existingMetersCount = 0,
}) => {
  // Step: 'configure' (before Add Meter is clicked) -> 'credentials' (only after Add Meter is clicked)
  const [step, setStep] = useState<'configure' | 'credentials'>('configure');
  const [createdMeter, setCreatedMeter] = useState<Meter | null>(null);

  // Form state (only installation details, NO Meter ID or API Key shown before Add Meter)
  const [name, setName] = useState('');
  const [address, setAddress] = useState('Distribution Pole 14, Commercial Substation Area');
  const [latitude, setLatitude] = useState('6.5244');
  const [longitude, setLongitude] = useState('3.3792');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsDetecting, setGpsDetecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setCreatedMeter(null);
      setName(`Main Feeder Board ${existingMetersCount + 1}`);
      setAddress('Distribution Pole 14, Commercial Substation Area');
      setLatitude('6.5244');
      setLongitude('3.3792');
      setError(null);
    }
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
        setError('Could not detect exact GPS coordinates. Using substation default.');
      },
      { timeout: 8000 }
    );
  };

  const handleAddMeter = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Please provide valid numerical GPS coordinates');
      return;
    }

    try {
      const meter = await onComplete({
        name: name.trim() || `Smart Meter ${existingMetersCount + 1}`,
        address: address.trim() || 'Smart Grid Connection Point',
        latitude: lat,
        longitude: lng,
      });

      if (meter) {
        setCreatedMeter(meter);
        setStep('credentials');
      } else if (onClose) {
        onClose();
      }
    } catch (err: any) {
      console.error('Onboarding meter creation error:', err);
      let msg = err?.message || 'Failed to add meter. Please try again.';
      if (msg.includes('Unexpected token') || msg.includes('JSON') || msg.includes('server error')) {
        msg = 'Connection to meter service was interrupted. Please click Add Meter again.';
      }
      setError(msg);
    }
  };

  const handleCopyKey = () => {
    if (!createdMeter?.apiKey) return;
    navigator.clipboard.writeText(createdMeter.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyId = () => {
    if (!createdMeter?.meterId) return;
    navigator.clipboard.writeText(createdMeter.meterId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const firmwareSnippet = createdMeter
    ? `// ==========================================
// VoltPulse IoT - ESP32 Hardware Credentials
// Flash this config to your ESP32 Arduino Sketch
// ==========================================
#define METER_ID   "${createdMeter.meterId}"
#define API_KEY    "${createdMeter.apiKey}"
#define INGEST_URL "http://YOUR_SERVER_IP:3000/api/telemetry/ingest"

// Sensor Pin Definitions
#define PIN_VOLTAGE_ADC  35 // ZMPT101B Voltage Sensor
#define PIN_CURRENT_ADC  34 // SCT-013-000 Current Transformer
#define PIN_RELAY_TRIP   26 // Solid-state Trip Relay
#define PIN_STATUS_LED    2 // Heartbeat LED`
    : '';

  const handleCopyCode = () => {
    if (!firmwareSnippet) return;
    navigator.clipboard.writeText(firmwareSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleFinishOnboarding = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#003833] border-2 border-white/20 shadow-2xl p-6 sm:p-8 text-white my-8 max-h-[92vh] overflow-y-auto">
        
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
                  {step === 'configure' ? 'Setup: Step 1 of 2' : 'Setup: Step 2 of 2'}
                </span>
                <span className="text-xs text-emerald-400 font-mono font-bold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Account Active</span>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                {step === 'configure' ? 'Connect Your ESP32 Energy Meter' : 'Hardware Credentials Generated'}
              </h2>
              <p className="text-xs text-teal-100/90 mt-0.5">
                {step === 'configure'
                  ? `Welcome ${user?.displayName || user?.email || 'Operator'}! Provide your installation location to add your energy meter.`
                  : 'Meter registered successfully! Save your auto-generated credentials to flash your microcontroller.'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="my-4 p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* STEP 1: CONFIGURE (Before Add Meter is clicked - NO Meter ID or API Key shown) */}
        {step === 'configure' && (
          <form onSubmit={handleAddMeter} className="space-y-4 my-6">
            
            {/* Friendly Display Name */}
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

            {/* Physical Installation Address */}
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

            {/* GPS Coordinates */}
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

            {/* Informational Banner */}
            <div className="p-4 rounded-2xl bg-[#002420] border border-teal-500/30 text-xs text-teal-100 space-y-1.5">
              <div className="flex items-center space-x-2 text-emerald-300 font-bold">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Auto-Generated Sequential Identifier &amp; 16-Char Secret Key</span>
              </div>
              <p className="text-[11px] text-teal-200/80 leading-relaxed">
                Clicking <strong>Add Meter</strong> will assign the next sequential Meter ID (e.g., <strong>MTR-0001</strong>) based on total accounts, generate a 16-character secure API token, and initialize all dashboard values to zero.
              </p>
            </div>

            {/* Action Button: Add Meter */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#005149]" />
                <span>{isLoading ? 'Creating Energy Meter...' : 'Add Meter'}</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: CREDENTIALS (Only seen AFTER "Add Meter" button has been clicked) */}
        {step === 'credentials' && createdMeter && (
          <div className="space-y-5 my-6 animate-in fade-in zoom-in-95">
            
            {/* Success Status */}
            <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-center space-x-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-white text-sm block">Meter Successfully Created &amp; Linked!</span>
                <span className="text-[11px] text-emerald-200/90">
                  Your credentials have been generated. Use these in your ESP32 Arduino sketch configuration.
                </span>
              </div>
            </div>

            {/* Generated Credentials Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Meter ID */}
              <div className="p-4 rounded-2xl bg-[#002b27] border border-white/15 space-y-2">
                <div className="flex items-center justify-between text-xs text-teal-200">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Generated Meter ID</span>
                  <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-teal-200 font-bold">
                    Sequential
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-black font-mono text-white tracking-wide">
                    {createdMeter.meterId}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 transition-colors cursor-pointer"
                    title="Copy Meter ID"
                  >
                    {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-teal-300/80">
                  Assigned automatically based on total registered meters.
                </p>
              </div>

              {/* API Key */}
              <div className="p-4 rounded-2xl bg-[#002b27] border border-white/15 space-y-2">
                <div className="flex items-center justify-between text-xs text-teal-200">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Hardware Secret Key</span>
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-500/30">
                    16 Chars Fixed
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm sm:text-base font-bold font-mono text-emerald-300 tracking-wider truncate mr-2">
                    {createdMeter.apiKey}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 transition-colors shrink-0 cursor-pointer"
                    title="Copy API Key"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-teal-300/80">
                  Auto-generated token. Never requires manual typing.
                </p>
              </div>
            </div>

            {/* Zero Baseline Notification */}
            <div className="p-3.5 rounded-xl bg-[#002420] border border-white/10 text-xs text-teal-100 flex items-start space-x-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-white">Clean Zero Baseline Initialization</div>
                <div className="text-[11px] text-teal-200/80">
                  All dashboard metrics start at <strong>0.0</strong> (0.0V, 0.0kW, 0.0A) in <strong>OFFLINE</strong> status until real-world hardware data is streamed.
                </div>
              </div>
            </div>

            {/* Ready-to-Flash Arduino Code Snippet */}
            <div className="rounded-2xl bg-[#001e1b] border border-white/15 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-200 font-mono flex items-center space-x-1.5">
                  <Terminal className="w-3.5 h-3.5 text-teal-300" />
                  <span>ESP32 Arduino Sketch Config (Ready to Flash)</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-mono text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied Config!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="text-[11px] font-mono text-teal-100/90 p-3 bg-black/40 rounded-xl overflow-x-auto leading-relaxed border border-white/5">
                {firmwareSnippet}
              </pre>
            </div>

            {/* Launch Dashboard Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleFinishOnboarding}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-xl active:scale-[0.98] cursor-pointer"
              >
                <span>Launch Live Energy Dashboard</span>
                <ArrowRight className="w-4 h-4 text-[#005149]" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
