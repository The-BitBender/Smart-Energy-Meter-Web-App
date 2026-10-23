import React, { useState } from 'react';
import { X, Plus, Key, Cpu, RefreshCw } from 'lucide-react';

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
}

export const LinkMeterModal: React.FC<LinkMeterModalProps> = ({
  isOpen,
  onClose,
  onLinkMeter,
  isLoading,
}) => {
  const [meterId, setMeterId] = useState(`ESP32-MTR-${Math.floor(1000 + Math.random() * 9000)}`);
  const [name, setName] = useState('Workshop Sub-Distribution Board');
  const [apiKey, setApiKey] = useState(`VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`);
  const [latitude, setLatitude] = useState('6.5244');
  const [longitude, setLongitude] = useState('3.3792');
  const [address, setAddress] = useState('Distribution Pole 4, Industrial Area');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRegenerateId = () => {
    setMeterId(`ESP32-MTR-${Math.floor(1000 + Math.random() * 9000)}`);
    setApiKey(`VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!meterId.trim()) {
      setError('Meter ID cannot be empty');
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
        name: name.trim() || `Meter ${meterId}`,
        apiKey: apiKey.trim(),
        latitude: lat,
        longitude: lng,
        address: address.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to link meter');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-[#00423c] border border-white/20 shadow-2xl p-6 text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/15">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-md">
              <Cpu className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Link New ESP32 Energy Meter</h3>
              <p className="text-xs text-teal-200">Bind physical hardware device to your cloud account</p>
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
          
          {/* Unique Meter ID */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-teal-100 uppercase tracking-wide">
                Unique Meter Hardware ID
              </label>
              <button
                type="button"
                onClick={handleRegenerateId}
                className="text-[11px] text-white hover:underline font-bold flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3 text-teal-200" />
                <span>Generate ID</span>
              </button>
            </div>
            <input
              type="text"
              value={meterId}
              onChange={e => setMeterId(e.target.value)}
              placeholder="e.g. ESP32-MTR-8842"
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white font-mono text-sm focus:outline-none focus:border-white"
              required
            />
            <span className="text-[10px] text-teal-200 mt-1 block">
              Match this exact Meter ID in your ESP32 Arduino sketch configuration.
            </span>
          </div>

          {/* Friendly Display Name */}
          <div>
            <label className="text-xs font-bold text-teal-100 uppercase tracking-wide">
              Panel / Installation Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Workshop Feeder A"
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white text-sm focus:outline-none focus:border-white"
              required
            />
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs font-bold text-teal-100 uppercase tracking-wide flex items-center space-x-1">
              <Key className="w-3.5 h-3.5 text-amber-300" />
              <span>Hardware API Secret Key</span>
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-white"
              required
            />
          </div>

          {/* Coordinates & Site Address */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-teal-100 uppercase tracking-wide">Latitude</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={e => setLatitude(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#00342f] border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-teal-100 uppercase tracking-wide">Longitude</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={e => setLongitude(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#00342f] border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-teal-100 uppercase tracking-wide">Site Physical Address</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#00342f] border border-white/20 text-white text-xs focus:outline-none focus:border-white"
              required
            />
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
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Plus className="w-4 h-4 text-[#005149]" />
              <span>{isLoading ? 'Registering Meter...' : 'Link Meter Now'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
