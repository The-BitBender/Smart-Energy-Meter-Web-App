import React, { useState } from 'react';
import { 
  Zap, 
  Activity, 
  MapPin, 
  ShieldAlert, 
  Cpu, 
  BarChart3, 
  Plus, 
  LogOut, 
  Radio, 
  Wifi, 
  WifiOff,
  ChevronDown,
  Settings,
  Bell
} from 'lucide-react';
import { Meter } from '../types/energy';
import { formatLastSeen } from '../utils/statusHelper';

interface NavbarProps {
  user: any;
  onSignIn: () => void;
  onSignOut: () => void;
  meters: Meter[];
  activeMeter: Meter | null;
  onSelectMeter: (meter: Meter) => void;
  onOpenLinkModal: () => void;
  onOpenSettings: () => void;
  activeTab: 'dashboard' | 'analytics' | 'map' | 'anomalies' | 'workbench' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'map' | 'anomalies' | 'workbench' | 'settings') => void;
  isOnline: boolean;
  heartbeatAgeSec: number;
  nowTime?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onSignIn,
  onSignOut,
  meters,
  activeMeter,
  onSelectMeter,
  onOpenLinkModal,
  onOpenSettings,
  activeTab,
  setActiveTab,
  isOnline: _isOnlineProp,
  heartbeatAgeSec: _heartbeatAgeSecProp,
  nowTime = Date.now(),
}) => {
  const lastSeen = formatLastSeen(activeMeter?.lastHeartbeat, nowTime);
  const isOnline = lastSeen.isOnline;
  const [meterDropdownOpen, setMeterDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[#002b27] backdrop-blur-md border-b border-white/15 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand in Dominant Teal Green and White */}
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-md text-[#005149]">
              <Zap className="w-5 h-5 fill-current animate-pulse text-[#005149]" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#002b27]"></div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  VoltPulse<span className="text-[#005149] font-mono text-xs ml-1.5 px-2 py-0.5 rounded-md bg-white font-black shadow-xs">IoT</span>
                </span>
              </div>
              <p className="text-[10px] text-teal-200/80 font-semibold tracking-wide uppercase">
                SMART ENERGY METER
              </p>
            </div>
          </div>

          {/* Meter Selector & Online Status */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Active Meter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMeterDropdownOpen(!meterDropdownOpen)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-[#00423c] hover:bg-[#004e47] border border-white/20 text-xs font-semibold text-white transition-colors shadow-xs"
              >
                <Radio className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
                <span className="font-mono text-white font-extrabold">{activeMeter?.meterId || 'No Meter'}</span>
                <span className="text-teal-200 max-w-[130px] truncate">{activeMeter?.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-teal-300" />
              </button>

              {meterDropdownOpen && (
                <div 
                  className="absolute left-0 mt-2 w-72 rounded-xl bg-[#00423c] border border-white/20 shadow-2xl p-2 z-50 divide-y divide-white/10"
                  onMouseLeave={() => setMeterDropdownOpen(false)}
                >
                  <div className="px-2 py-1.5 text-[11px] font-bold text-teal-200 uppercase tracking-wider flex items-center justify-between">
                    <span>Registered Energy Meters</span>
                    <span className="text-white font-mono font-bold bg-white/15 px-1.5 py-0.2 rounded">{meters.length}</span>
                  </div>
                  <div className="py-1 max-h-56 overflow-y-auto space-y-1">
                    {meters.map((meter) => (
                      <button
                        key={meter.meterId}
                        onClick={() => {
                          onSelectMeter(meter);
                          setMeterDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          activeMeter?.meterId === meter.meterId
                            ? 'bg-white text-[#005149] font-bold shadow-xs'
                            : 'hover:bg-white/10 text-white'
                        }`}
                      >
                        <div>
                          <div className="font-mono font-bold flex items-center space-x-1.5">
                            <span>{meter.meterId}</span>
                            {meter.hasAnomaly && (
                              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
                            )}
                          </div>
                          <div className={`text-[11px] truncate max-w-[170px] ${activeMeter?.meterId === meter.meterId ? 'text-teal-800' : 'text-teal-200/80'}`}>
                            {meter.name}
                          </div>
                        </div>
                        {(() => {
                          const mStatus = formatLastSeen(meter.lastHeartbeat, nowTime);
                          return (
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                              activeMeter?.meterId === meter.meterId
                                ? 'bg-[#005149] text-white'
                                : mStatus.isOnline
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                            }`}>
                              {mStatus.isOnline ? 'ONLINE' : 'OFFLINE'} • {mStatus.relativeTime}
                            </span>
                          );
                        })()}
                      </button>
                    ))}
                  </div>
                  <div className="pt-2 mt-1">
                    <button
                      onClick={() => {
                        setMeterDropdownOpen(false);
                        onOpenLinkModal();
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-bold flex items-center justify-center space-x-2 transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#005149]" />
                      <span>Link New Meter ID</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Online / Offline Indicator Badge with 30-Minute Window & Relative Last Seen Counter */}
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono font-bold border transition-colors ${
              isOnline 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-xs' 
                : 'bg-rose-950/80 text-rose-300 border-rose-500/40 shadow-xs'
            }`}>
              {isOnline ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <Wifi className="w-3.5 h-3.5 text-emerald-300" />
                  <span>ONLINE • {lastSeen.relativeTime}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>OFFLINE • {lastSeen.relativeTime}</span>
                </>
              )}
            </div>
          </div>

          {/* Navigation Tabs - Inverted: White Active Tab, Teal Background */}
          <nav className="hidden lg:flex items-center space-x-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-white text-[#005149] shadow-sm font-extrabold'
                  : 'text-teal-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-white text-[#005149] shadow-sm font-extrabold'
                  : 'text-teal-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Telemetry Charts</span>
            </button>

            <button
              onClick={() => setActiveTab('map')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'map'
                  ? 'bg-white text-[#005149] shadow-sm font-extrabold'
                  : 'text-teal-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>GPS Location</span>
            </button>

            <button
              onClick={() => setActiveTab('anomalies')}
              className={`relative flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'anomalies'
                  ? 'bg-white text-[#005149] shadow-sm font-extrabold'
                  : 'text-teal-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Theft Shield</span>
              {activeMeter?.hasAnomaly && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('workbench')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'workbench'
                  ? 'bg-white text-[#005149] shadow-sm font-extrabold'
                  : 'text-teal-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>ESP32 Workbench</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'settings'
                  ? 'bg-white text-[#005149] shadow-sm font-extrabold'
                  : 'text-teal-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Controls: Alert Settings & User Profile / Google Sign-in */}
          <div className="flex items-center space-x-2.5">
            {/* Quick Email Alert Settings Trigger Button */}
            <button
              type="button"
              onClick={onOpenSettings}
              title="Configure Anomaly Email Alerts"
              aria-label="Notification & Alert Settings"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#00423c] hover:bg-[#004e47] border border-white/20 text-xs font-semibold text-white transition-colors shadow-xs active:scale-95"
            >
              <Settings className="w-3.5 h-3.5 text-teal-300" />
              <span className="hidden sm:inline">Alerts</span>
            </button>

            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center space-x-2 p-1.5 rounded-full hover:bg-white/10 transition-colors border border-white/20"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-8 h-8 rounded-full border border-white object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-xs text-[#005149]">
                      {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-teal-200" />
                </button>

                {userDropdownOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-64 rounded-xl bg-[#00423c] border border-white/20 shadow-2xl p-3 z-50 text-white"
                    onMouseLeave={() => setUserDropdownOpen(false)}
                  >
                    <div className="flex items-center space-x-2.5 pb-2 border-b border-white/10">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#005149] font-black text-xs">
                        {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold text-white truncate">{user.displayName || 'Authorized User'}</div>
                        <div className="text-[11px] text-teal-200 truncate">{user.email}</div>
                      </div>
                    </div>
                    
                    {/* Settings Option in Dropdown */}
                    <div className="py-2 border-b border-white/10">
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onOpenSettings();
                        }}
                        className="w-full flex items-center space-x-2 py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors text-left"
                      >
                        <Bell className="w-3.5 h-3.5 text-teal-300" />
                        <span>Email Alert Settings</span>
                      </button>
                    </div>

                    <div className="py-2 text-[11px] text-teal-100">
                      Connected to Google Account &amp; Firestore.
                    </div>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onSignOut();
                      }}
                      className="w-full mt-1 flex items-center justify-center space-x-2 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-bold transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-extrabold transition-all shadow-md active:scale-95"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Google Sign-In</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="lg:hidden flex items-center justify-around px-2 py-2 border-t border-white/10 bg-[#002b27] overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 ${
            activeTab === 'dashboard' ? 'text-[#005149] bg-white' : 'text-teal-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 ${
            activeTab === 'analytics' ? 'text-[#005149] bg-white' : 'text-teal-200'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Charts</span>
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 ${
            activeTab === 'map' ? 'text-[#005149] bg-white' : 'text-teal-200'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>GPS</span>
        </button>
        <button
          onClick={() => setActiveTab('anomalies')}
          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 ${
            activeTab === 'anomalies' ? 'text-[#005149] bg-white' : 'text-teal-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Theft</span>
        </button>
        <button
          onClick={() => setActiveTab('workbench')}
          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 ${
            activeTab === 'workbench' ? 'text-[#005149] bg-white' : 'text-teal-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>ESP32</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 ${
            activeTab === 'settings' ? 'text-[#005149] bg-white' : 'text-teal-200'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>
    </header>
  );
};
