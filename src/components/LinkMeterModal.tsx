import React, { useState, useEffect } from 'react';
import { X, Plus, Cpu, ShieldCheck, Copy, Check, MapPin, ArrowRight, CheckCircle2, Terminal } from 'lucide-react';
import { Meter } from '../types/energy';

interface LinkMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkMeter: (meterData: {
    meterId?: string;
    name: string;
    apiKey?: string;
    latitude: number;
    longitude: number;
    address: string;
  }) => Promise<Meter | any>;
  isLoading: boolean;
  existingMetersCount?: number;
}

export const LinkMeterModal: React.FC<LinkMeterModalProps> = ({
  isOpen,
  onClose,
  onLinkMeter,
  isLoading,
  existingMetersCount = 0,
}) => {
  // Step: 'form' (before Add Meter is clicked) -> 'credentials' (only after Add Meter is clicked)
  const [step, setStep] = useState<'form' | 'credentials'>('form');
  const [createdMeter, setCreatedMeter] = useState<Meter | null>(null);

  // Form fields (only installation metadata, NO Meter ID or API Key shown during creation)
  const [name, setName] = useState('');
  const [address, setAddress] = useState('Distribution Substation Node, Sector 4');
  const [latitude, setLatitude] = useState('6.5244');
  const [longitude, setLongitude] = useState('3.3792');
  const [gpsDetecting, setGpsDetecting] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setCreatedMeter(null);
      setName(`Substation Feeder Panel ${existingMetersCount + 1}`);
      setAddress('Distribution Substation Node, Sector 4');
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
        setError('Could not detect exact GPS coordinates. Using default.');
      },
      { timeout: 8000 }
    );
  };

  const handleAddMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Please provide valid decimal GPS coordinates');
      return;
    }

    try {
      // Create the meter on backend & database
      const meter = await onLinkMeter({
        name: name.trim() || `Smart Meter ${existingMetersCount + 1}`,
        address: address.trim() || 'Smart Grid Connection Point',
        latitude: lat,
        longitude: lng,
      });

      if (meter) {
        setCreatedMeter(meter);
        setStep('credentials');
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add meter. Please try again.');
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
// Flash this configuration to your microcontroller
// ==========================================
#define METER_ID   "${createdMeter.meterId}"
#define API_KEY    "${createdMeter.apiKey}"
#define INGEST_URL "http://YOUR_SERVER_IP:3000/api/telemetry/ingest"`
    : '';

  const handleCopySnippet = () => {
    if (!firmwareSnippet) return;
    navigator.clipboard.writeText(firmwareSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-[#003833] border border-white/20 shadow-2xl p-6 text-white max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/15">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-md">
              <Cpu className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {step === 'form' ? 'Add New Energy Meter' : 'Hardware Credentials Generated'}
              </h3>
              <p className="text-xs text-teal-200">
                {step === 'form'
                  ? 'Configure installation location and site metadata'
                  : 'Hardware authentication credentials generated successfully'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-teal-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="my-3 p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* STEP 1: FORM (Before clicking Add Meter - Meter ID and API Key are NOT shown) */}
        {step === 'form' && (
          <form onSubmit={handleAddMeter} className="space-y-4 my-4">
            
            {/* Friendly Display Name */}
            <div>
              <label className="text-xs font-bold text-teal-100 uppercase tracking-wide block mb-1">
                Panel / Installation Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Substation Feeder 1"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white text-sm focus:outline-hidden focus:border-white"
                required
              />
            </div>

            {/* Site Physical Address */}
            <div>
              <label className="text-xs font-bold text-teal-100 uppercase tracking-wide block mb-1">
                Site Physical Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Distribution Pole 14, Commercial Area"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white text-xs focus:outline-hidden focus:border-white"
                required
              />
            </div>

            {/* Coordinates */}
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
                  <span>{gpsDetecting ? 'Detecting GPS...' : 'Use My Location'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude"
                  className="w-full px-3 py-2 rounded-lg bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-hidden focus:border-white"
                  required
                />
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude"
                  className="w-full px-3 py-2 rounded-lg bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-hidden focus:border-white"
                  required
                />
              </div>
            </div>

            {/* Information Notice */}
            <div className="p-3.5 rounded-xl bg-[#002420] border border-teal-500/30 text-xs text-teal-100 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-emerald-300 text-[11px]">
                <ShieldCheck className="w-4 h-4" />
                <span>Automated Hardware Provisioning</span>
              </div>
              <p className="text-[11px] text-teal-200/80 leading-relaxed">
                When you click <strong>Add Meter</strong>, a sequential <strong>Meter ID (MTR-XXXX)</strong> and a secure <strong>16-character API Key</strong> will be automatically generated and displayed for flashing your ESP32 firmware.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/15">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#005149]" />
                <span>{isLoading ? 'Creating Meter...' : 'Add Meter'}</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: CREDENTIALS (Only seen AFTER "Add Meter" button has been clicked) */}
        {step === 'credentials' && createdMeter && (
          <div className="space-y-4 my-4 animate-in fade-in zoom-in-95">
            
            {/* Success Banner */}
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-white block">Meter Added Successfully!</span>
                <span className="text-[11px] text-emerald-200/90">
                  Your hardware credentials have been generated. Copy them to configure your ESP32 device.
                </span>
              </div>
            </div>

            {/* Credentials Card (Revealed ONLY after clicking Add meter) */}
            <div className="p-4 rounded-xl bg-[#002420] border border-teal-500/40 space-y-3.5">
              
              {/* Meter ID */}
              <div>
                <div className="flex items-center justify-between text-xs text-teal-200 mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Generated Meter ID</span>
                  <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-teal-200 font-bold">
                    Sequential
                  </span>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#001c18] border border-white/15 font-mono text-sm">
                  <span className="text-white font-black tracking-wider text-base">{createdMeter.meterId}</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 text-xs font-sans font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
                  </button>
                </div>
              </div>

              {/* API Key */}
              <div>
                <div className="flex items-center justify-between text-xs text-teal-200 mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Hardware API Key</span>
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                    16 Chars Fixed
                  </span>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#001c18] border border-white/15 font-mono text-xs">
                  <span className="text-emerald-300 font-bold tracking-wider">{createdMeter.apiKey}</span>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 text-xs font-sans font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                  </button>
                </div>
              </div>

              {/* Baseline Zero Note */}
              <div className="text-[11px] text-teal-300/80 pt-1 border-t border-white/10 flex items-center justify-between">
                <span>Dashboard Baseline:</span>
                <span className="font-mono font-bold text-white">0.0V • 0.0kW • OFFLINE</span>
              </div>
            </div>

            {/* Firmware Snippet */}
            <div className="rounded-xl bg-[#001c18] border border-white/15 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-teal-200">
                <span className="font-mono text-[11px] flex items-center space-x-1">
                  <Terminal className="w-3.5 h-3.5 text-teal-300" />
                  <span>Arduino C++ Config</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="text-[10px] font-mono text-teal-100/90 p-2.5 bg-black/40 rounded-lg overflow-x-auto leading-relaxed border border-white/5">
                {firmwareSnippet}
              </pre>
            </div>

            {/* Proceed to Dashboard Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full flex items-center justify-center space-x-2 py-3 px-6 rounded-xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-xl active:scale-[0.98] cursor-pointer"
              >
                <span>Open Dashboard</span>
                <ArrowRight className="w-4 h-4 text-[#005149]" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
