import React, { useState } from 'react';
import { MapPin, Navigation, ExternalLink, Radio, Globe, Crosshair } from 'lucide-react';
import { Meter } from '../types/energy';

interface GpsLocationMapProps {
  meter: Meter;
  onUpdateLocation: (lat: number, lng: number, address: string) => Promise<void>;
}

export const GpsLocationMap: React.FC<GpsLocationMapProps> = ({
  meter,
  onUpdateLocation,
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [customLat, setCustomLat] = useState(meter.latitude.toString());
  const [customLng, setCustomLng] = useState(meter.longitude.toString());
  const [customAddr, setCustomAddr] = useState(meter.address);

  const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${meter.longitude - 0.02}%2C${meter.latitude - 0.02}%2C${meter.longitude + 0.02}%2C${meter.latitude + 0.02}&layer=mapnik&marker=${meter.latitude}%2C${meter.longitude}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${meter.latitude},${meter.longitude}`;

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsLocating(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        setCustomLat(lat.toString());
        setCustomLng(lng.toString());
        await onUpdateLocation(lat, lng, `Device Geolocation (${lat}, ${lng})`);
      },
      (err) => {
        setIsLocating(false);
        console.error('Geolocation error:', err);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSaveCoordinates = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lng = parseFloat(customLng);
    if (isNaN(lat) || isNaN(lng)) return;
    await onUpdateLocation(lat, lng, customAddr);
    setIsEditing(false);
  };

  return (
    <div className="rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg mb-6 text-white transition-all hover:border-white/40">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/15">
        <div>
          <div className="flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-white" />
            <h3 className="text-base font-bold text-white">ESP32 GPS Telemetry &amp; Geospatial Site</h3>
          </div>
          <p className="text-xs text-teal-200 mt-0.5">
            Geotagged physical installation point for Meter <span className="font-mono text-white font-extrabold">{meter.meterId}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#003d37] hover:bg-[#004841] text-white text-xs font-bold transition-colors border border-white/20 disabled:opacity-50"
          >
            <Crosshair className={`w-3.5 h-3.5 text-teal-300 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'Acquiring Fix...' : 'Geotag via GPS'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="px-3 py-1.5 rounded-lg bg-[#003d37] hover:bg-[#004841] text-white text-xs font-bold transition-colors border border-white/20"
          >
            {isEditing ? 'Cancel Edit' : 'Edit Coordinates'}
          </button>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-colors shadow-md"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#005149]" />
            <span>Google Maps</span>
          </a>
        </div>
      </div>

      {/* Coordinate Edit Form */}
      {isEditing && (
        <form onSubmit={handleSaveCoordinates} className="p-4 my-4 rounded-xl bg-[#003833] border border-white/20 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-teal-200 uppercase">Latitude</label>
              <input
                type="number"
                step="any"
                value={customLat}
                onChange={e => setCustomLat(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#004841] border border-white/30 text-white font-mono text-xs focus:outline-none focus:border-white"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-teal-200 uppercase">Longitude</label>
              <input
                type="number"
                step="any"
                value={customLng}
                onChange={e => setCustomLng(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#004841] border border-white/30 text-white font-mono text-xs focus:outline-none focus:border-white"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-teal-200 uppercase">Physical Site Address</label>
              <input
                type="text"
                value={customAddr}
                onChange={e => setCustomAddr(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#004841] border border-white/30 text-white text-xs focus:outline-none focus:border-white"
                required
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-teal-200 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md"
            >
              Update Location Pin
            </button>
          </div>
        </form>
      )}

      {/* Location Details Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
        <div className="p-3.5 rounded-xl bg-[#003d37] border border-white/15 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-white text-[#005149]">
            <Navigation className="w-4 h-4 text-[#005149]" />
          </div>
          <div>
            <div className="text-[11px] text-teal-200 uppercase font-bold">Coordinates</div>
            <div className="text-xs font-mono font-bold text-white mt-0.5">
              {meter.latitude.toFixed(6)}° N, {meter.longitude.toFixed(6)}° E
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#003d37] border border-white/15 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-white text-[#005149]">
            <Globe className="w-4 h-4 text-[#005149]" />
          </div>
          <div className="overflow-hidden">
            <div className="text-[11px] text-teal-200 uppercase font-bold">Installation Site</div>
            <div className="text-xs font-semibold text-white mt-0.5 truncate">
              {meter.address}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#003d37] border border-white/15 flex items-center space-x-3">
          <div className={`p-2.5 rounded-lg ${meter.hasAnomaly ? 'bg-rose-500 text-white' : 'bg-white text-[#005149]'}`}>
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-teal-200 uppercase font-bold">Grid Node Telemetry</div>
            <div className="text-xs font-mono font-bold text-white mt-0.5">
              PZEM-004T + NEO-6M GPS Active
            </div>
          </div>
        </div>
      </div>

      {/* Map Embed Container */}
      <div className="relative w-full h-[360px] rounded-xl overflow-hidden border border-white/20 shadow-inner bg-[#002824]">
        <iframe
          title={`GPS Map for meter ${meter.meterId}`}
          width="100%"
          height="100%"
          loading="lazy"
          className="w-full h-full border-0 transition-opacity"
          src={osmUrl}
        />

        {/* Live HUD Overlay Badge */}
        <div className="absolute top-3 left-3 px-3.5 py-2 rounded-xl bg-[#002b27]/95 backdrop-blur-md border border-white/25 shadow-xl text-xs font-mono pointer-events-none">
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${meter.status === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className="font-bold text-white">{meter.meterId}</span>
            <span className="text-teal-200">({meter.status})</span>
          </div>
          <div className="text-[11px] text-white font-bold mt-0.5">
            Lat: {meter.latitude.toFixed(5)} | Lng: {meter.longitude.toFixed(5)}
          </div>
        </div>
      </div>

    </div>
  );
};
