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
  Bell,
  Power
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
      
      {/* =========================================================================
          TIER 1: Primary System Bar
          VoltPulse Brand, Active Meter Selector, Online Heartbeat Status & Account
          ========================================================================= */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[4rem] py-2.5 gap-3 flex-wrap md:flex-nowrap">
          
          {/* Left: Brand Identity & Active Meter Selector */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            
            {/* Logo */}
            <div className="flex items-center space-x-2.5">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-md text-[#005149] shrink-0">
                <Zap className="w-5 h-5 fill-current animate-pulse text-[#005149]" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#002b27]"></div>
              </div>
              <div className="leading-tight">
                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">
                    VoltPulse<span className="text-[#005149] font-mono text-[11px] ml-1.5 px-2 py-0.5 rounded-md bg-white font-black shadow-xs">IoT</span>
                  </span>
                </div>
                <p className="text-[10px] text-teal-200/80 font-semibold tracking-wide uppercase hidden sm:block">
                  Smart Energy Meter
                </p>
              </div>
            </div>

            {/* Meter Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMeterDropdownOpen(!meterDropdownOpen)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#00423c] hover:bg-[#004e47] border border-white/20 text-xs font-semibold text-white transition-colors shadow-xs active:scale-95 cursor-pointer"
                title="Select active energy meter"
              >
                <Radio className="w-3.5 h-3.5 text-teal-300 animate-pulse shrink-0" />
                <div className="flex flex-col text-left">
                  <span className="font-mono text-white font-extrabold text-xs leading-none">
                    {activeMeter?.meterId || 'No Meter'}
                  </span>
                  {activeMeter?.name && (
                    <span className="text-[10px] text-teal-200/80 max-w-[110px] sm:max-w-[140px] truncate leading-tight mt-0.5">
                      {activeMeter.name}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-teal-300 transition-transform ${meterDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {meterDropdownOpen && (
                <div 
                  className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl bg-[#003833] border border-white/20 shadow-2xl p-2.5 z-50 divide-y divide-white/10 animate-in fade-in zoom-in-95"
                  onMouseLeave={() => setMeterDropdownOpen(false)}
                >
                  <div className="px-2 py-1.5 text-[11px] font-bold text-teal-200 uppercase tracking-wider flex items-center justify-between">
                    <span>Registered Energy Meters</span>
                    <span className="text-white font-mono font-bold bg-white/15 px-2 py-0.5 rounded-md">{meters.length}</span>
                  </div>
                  <div className="py-1.5 max-h-60 overflow-y-auto space-y-1">
                    {meters.map((meter) => (
                      <button
                        key={meter.meterId}
                        onClick={() => {
                          onSelectMeter(meter);
                          setMeterDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          activeMeter?.meterId === meter.meterId
                            ? 'bg-white text-[#005149] font-bold shadow-xs'
                            : 'hover:bg-white/10 text-white'
                        }`}
                      >
                        <div className="overflow-hidden mr-2">
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
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold shrink-0 ${
                              activeMeter?.meterId === meter.meterId
                                ? 'bg-[#005149] text-white'
                                : mStatus.isOnline
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                            }`}>
                              {mStatus.isOnline ? 'ONLINE' : 'OFFLINE'}
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
                      className="w-full py-2 px-3 rounded-xl bg-white hover:bg-teal-50 text-[#005149] text-xs font-bold flex items-center justify-center space-x-2 transition-colors shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#005149]" />
                      <span>Add / Link New Meter</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Online / Offline Status Badge with Relative Last Seen */}
            <div className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-mono font-bold border transition-colors ${
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

          {/* Right Controls: Add Meter Button, Alerts, User Profile */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0 ml-auto">
            
            {/* Quick "Add Meter" Action Button */}
            <button
              type="button"
              onClick={onOpenLinkModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Add another meter"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline">Add Meter</span>
            </button>

            {/* Quick Email Alert Settings Trigger */}
            <button
              type="button"
              onClick={onOpenSettings}
              title="Configure Anomaly Email Alerts"
              aria-label="Notification & Alert Settings"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#00423c] hover:bg-[#004e47] border border-white/20 text-xs font-semibold text-white transition-colors shadow-xs active:scale-95 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-teal-300" />
              <span className="hidden sm:inline">Alerts</span>
            </button>

            {/* User Account / Google Sign-in */}
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center space-x-2 p-1 rounded-full hover:bg-white/10 transition-colors border border-white/20 cursor-pointer"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-8 h-8 rounded-full border border-white object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#005149] font-black text-xs">
                      {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <ChevronDown className="w-3 h-3 text-teal-200 hidden sm:block mr-1" />
                </button>

                {userDropdownOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#003833] border border-white/20 shadow-2xl p-3.5 z-50 text-white animate-in fade-in zoom-in-95"
                    onMouseLeave={() => setUserDropdownOpen(false)}
                  >
                    <div className="flex items-center space-x-2.5 pb-2.5 border-b border-white/10">
                      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#005149] font-black text-sm shrink-0">
                        {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold text-white truncate">{user.displayName || 'Operator'}</div>
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
                        className="w-full flex items-center space-x-2 py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors text-left cursor-pointer"
                      >
                        <Bell className="w-3.5 h-3.5 text-teal-300" />
                        <span>Email Alert Settings</span>
                      </button>
                    </div>

                    <div className="py-2 text-[11px] text-teal-200/80">
                      Connected to Google Account &amp; Firestore.
                    </div>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onSignOut();
                      }}
                      className="w-full mt-1 flex items-center justify-center space-x-2 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-bold transition-colors cursor-pointer"
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
                className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* Small Screen Online / Offline Status Bar (shown when sm: hidden) */}
        <div className="sm:hidden pb-2 flex items-center justify-between text-[11px] font-mono border-t border-white/10 pt-1.5">
          <div className="flex items-center space-x-1.5 text-teal-200">
            <span>Status:</span>
            <span className={`px-2 py-0.5 rounded-full font-bold ${
              isOnline ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'
            }`}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <span className="text-teal-300/80">{lastSeen.relativeTime}</span>
        </div>
      </div>

      {/* =========================================================================
          TIER 2: Sub-Navigation Tab Bar (Second Line)
          Dashboard, Telemetry Charts, GPS Location, Theft Shield, ESP32, Settings
          ========================================================================= */}
      <div className="bg-[#00221f] border-t border-white/10 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            
            {/* Horizontal Nav Tabs Strip with smooth scrolling */}
            <nav className="flex items-center space-x-1 sm:space-x-2 py-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden scroll-smooth w-full sm:w-auto">
              
              {/* Tab 1: Dashboard */}
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-[#005149] shadow-md font-extrabold scale-[1.02]'
                    : 'text-teal-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>

              {/* Tab 2: Telemetry Charts */}
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'bg-white text-[#005149] shadow-md font-extrabold scale-[1.02]'
                    : 'text-teal-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Telemetry Charts</span>
              </button>

              {/* Tab 3: GPS Location */}
              <button
                type="button"
                onClick={() => setActiveTab('map')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'map'
                    ? 'bg-white text-[#005149] shadow-md font-extrabold scale-[1.02]'
                    : 'text-teal-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>GPS Location</span>
              </button>

              {/* Tab 4: Theft Shield */}
              <button
                type="button"
                onClick={() => setActiveTab('anomalies')}
                className={`relative flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'anomalies'
                    ? 'bg-white text-[#005149] shadow-md font-extrabold scale-[1.02]'
                    : 'text-teal-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Theft Shield</span>
                {activeMeter?.hasAnomaly && (
                  <span className="relative flex h-2 w-2 ml-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </button>

              {/* Tab 5: ESP32 Hardware Workbench */}
              <button
                type="button"
                onClick={() => setActiveTab('workbench')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'workbench'
                    ? 'bg-white text-[#005149] shadow-md font-extrabold scale-[1.02]'
                    : 'text-teal-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>ESP32 Workbench</span>
              </button>

              {/* Tab 6: Settings */}
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-white text-[#005149] shadow-md font-extrabold scale-[1.02]'
                    : 'text-teal-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            </nav>

            {/* Quick Context Pill on Desktop (Relay state & Active Power) */}
            {activeMeter && (
              <div className="hidden lg:flex items-center space-x-3 text-xs font-mono text-teal-200/90 shrink-0 pl-4">
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/25 border border-white/10">
                  <Power className="w-3 h-3 text-teal-300" />
                  <span className="text-teal-300/70">Relay:</span>
                  <span className={`font-bold ${activeMeter.relayState === 'ON' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {activeMeter.relayState}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/25 border border-white/10">
                  <span className="text-teal-300/70">Power:</span>
                  <span className="text-white font-bold">
                    {(activeMeter.activePower / 1000).toFixed(2)} kW
                  </span>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

    </header>
  );
};
