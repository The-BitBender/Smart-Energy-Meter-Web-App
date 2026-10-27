import React, { useState, useEffect } from 'react';
import { X, Plus, Cpu, ShieldCheck, Copy, Check, MapPin, Sparkles } from 'lucide-react';
import { generate16CharApiKey, formatMeterId } from '../utils/statusHelper';

interface LinkMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkMeter: (meterData: {
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

export const LinkMeterModal: React.FC<LinkMeterModalProps> = ({
  isOpen,
  onClose,
  onLinkMeter,
  isLoading,
  existingMetersCount = 0,
}) => {
  const [meterId, setMeterId] = useState(`MTR-${String(existingMetersCount + 1).padStart(4, '0')}`);
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState(generate16CharApiKey());
  const [latitude, setLatitude] = useState('6.5244');
  const [longitude, setLongitude] = useState('3.3792');
  const [address, setAddress] = useState('Distribution Substation Node, Sector 4');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the next global sequential Meter ID from backend whenever modal opens
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
            setName(`Substation Feeder (${data.nextMeterId})`);
            return;
          }
        }
      } catch (err) {
        console.warn('Could not query next meter id endpoint, using count fallback:', err);
      }

      if (isMounted) {
        const fallbackId = formatMeterId(existingMetersCount + 1);
        setMeterId(fallbackId);
        setName(`Substation Feeder (${fallbackId})`);
      }
    };

    fetchNextId();
    // Auto-generate fresh 16-character API key
    setApiKey(generate16CharApiKey());
    setError(null);

    return () => {
      isMounted = false;
    };
  }, [isOpen, existingMetersCount]);

  if (!isOpen) return null;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!meterId.trim()) {
      setError('Meter ID could not be generated. Please retry.');
      return;
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Please provide valid decimal coordinates');
      return;
    }

    try {
      await onLinkMeter({
        meterId: meterId.trim(),
        name: name.trim() || `Smart Meter ${meterId}`,
        apiKey: apiKey.trim(),
        latitude: lat,
        longitude: lng,
        address: address.trim() || 'Smart Grid Connection Point',
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to link meter');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-[#003833] border border-white/20 shadow-2xl p-6 text-white max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/15">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-md">
              <Cpu className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Link New Energy Meter</h3>
              <p className="text-xs text-teal-200">Auto-provision hardware credentials &amp; anti-theft telemetry</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-teal-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="my-3 p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 my-4">
          
          {/* Hardware Credentials Card: Auto-Generated ID and Key (NO INPUT REQUIRED) */}
          <div className="p-4 rounded-xl bg-[#002420] border border-teal-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-200 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                <span>Auto-Generated Hardware Credentials</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                16-Char Token
              </span>
            </div>

            {/* Meter ID (MTR-XXXX format based on total meters created) */}
            <div>
              <label className="text-[11px] font-medium text-teal-300/80 block mb-1">
                Meter Hardware ID (Prefix: MTR- + 4 Digits)
              </label>
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#001c18] border border-white/15 font-mono text-sm">
                <span className="text-white font-black tracking-wider text-base">{meterId}</span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 text-xs font-sans font-bold flex items-center space-x-1 transition-colors"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
                </button>
              </div>
              <span className="text-[10px] text-teal-300/70 mt-1 block">
                Calculated automatically from total meters registered across all accounts.
              </span>
            </div>

            {/* Auto-Generated API Key (Strictly auto-generated 16-character format, NO input field) */}
            <div>
              <label className="text-[11px] font-medium text-teal-300/80 block mb-1">
                Hardware API Secret Key (Auto-Generated Fixed 16-Char)
              </label>
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#001c18] border border-white/15 font-mono text-xs">
                <span className="text-emerald-300 font-bold tracking-wider">{apiKey}</span>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-teal-200 text-xs font-sans font-bold flex items-center space-x-1 transition-colors"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
              <span className="text-[10px] text-teal-300/70 mt-1 block">
                Never requires manual typing. Use this secret key when flashing your ESP32 microcontroller sketch.
              </span>
            </div>
          </div>

          {/* Friendly Display Name */}
          <div>
            <label className="text-xs font-bold text-teal-100 uppercase tracking-wide block mb-1">
              Panel / Installation Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
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
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. Distribution Pole 14, Commercial Area"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#002f2b] border border-white/20 text-white text-xs focus:outline-hidden focus:border-white"
              required
            />
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-teal-100 uppercase tracking-wide block mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={e => setLatitude(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-hidden focus:border-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-teal-100 uppercase tracking-wide block mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={e => setLongitude(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#002f2b] border border-white/20 text-white font-mono text-xs focus:outline-hidden focus:border-white"
                required
              />
            </div>
          </div>

          {/* Zero Initial State Notice */}
          <div className="p-3 rounded-xl bg-[#002420] border border-white/10 text-[11px] text-teal-200 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              All dashboard readings (voltage, active power, current, frequency, cumulative energy) will start at <strong>0.0</strong> in <strong>OFFLINE</strong> status until your physical ESP32 sends its initial telemetry packet.
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#005149]" />
              <span>{isLoading ? 'Registering Meter...' : 'Link & Activate Meter'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
