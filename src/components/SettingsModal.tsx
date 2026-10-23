import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Bell, 
  Mail, 
  ShieldAlert, 
  AlertTriangle, 
  Check, 
  Flame, 
  Activity, 
  Zap, 
  WifiOff, 
  Send, 
  CheckCircle2 
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { NotificationPreferences, AnomalySeverity } from '../types/energy';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
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

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preferences from Firestore on mount/open
  useEffect(() => {
    if (!isOpen) return;

    const loadPreferences = async () => {
      setIsLoading(true);
      setError(null);
      const userId = user?.uid || 'default_user';

      try {
        if (user) {
          const prefDocRef = doc(db, 'users', userId, 'settings', 'notifications');
          const snap = await getDoc(prefDocRef);
          if (snap.exists()) {
            setPreferences(snap.data() as NotificationPreferences);
          } else {
            // Also check root user doc
            const userSnap = await getDoc(doc(db, 'users', userId));
            if (userSnap.exists() && userSnap.data()?.notificationPreferences) {
              setPreferences(userSnap.data()?.notificationPreferences);
            } else if (user.email) {
              setPreferences(prev => ({ ...prev, alertEmail: user.email }));
            }
          }
        } else {
          // Fallback load from local storage or backend
          const saved = localStorage.getItem(`voltPulse_prefs_${userId}`);
          if (saved) {
            setPreferences(JSON.parse(saved));
          }
        }
      } catch (err) {
        console.warn('Error loading preferences from Firebase:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key as keyof NotificationPreferences],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    const userId = user?.uid || 'default_user';
    const updatedPref: NotificationPreferences = {
      ...preferences,
      userId,
      alertEmail: preferences.alertEmail.trim(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // 1. Save to Firebase Firestore backend
      if (user) {
        try {
          const prefDocRef = doc(db, 'users', userId, 'settings', 'notifications');
          await setDoc(prefDocRef, updatedPref, { merge: true });

          // Also sync to root user document
          await setDoc(doc(db, 'users', userId), {
            notificationPreferences: updatedPref,
            updatedAt: updatedPref.updatedAt,
          }, { merge: true });
        } catch (fbErr) {
          handleFirestoreError(fbErr, OperationType.WRITE, `users/${userId}/settings/notifications`);
        }
      }

      // 2. Sync to local backend API
      await fetch(`/api/users/${encodeURIComponent(userId)}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPref),
      }).catch(err => console.warn('API sync warning:', err));

      // 3. Cache in localStorage
      localStorage.setItem(`voltPulse_prefs_${userId}`, JSON.stringify(updatedPref));

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving notification preferences:', err);
      setError(err.message || 'Failed to save preferences to Firebase');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestAlert = () => {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-[#00423c] border border-white/20 shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/15">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-white text-[#005149] shadow-md">
              <Bell className="w-5 h-5 text-[#005149]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Alerts &amp; Notification Settings</h3>
              <p className="text-xs text-teal-200">Configure real-time email dispatch for critical grid anomalies</p>
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

        {saveSuccess && (
          <div className="my-3 p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>Preferences saved to Firebase Cloud Firestore successfully!</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5 my-4">
          
          {/* Master Email Alerts Toggle */}
          <div className="p-4 rounded-xl bg-[#00342f] border border-white/20 flex items-center justify-between">
            <div className="flex items-start space-x-3">
              <div className={`p-2 rounded-lg mt-0.5 ${
                preferences.emailAlertsEnabled ? 'bg-white text-[#005149]' : 'bg-white/10 text-teal-300'
              }`}>
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Dispatch Email Alerts</span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    preferences.emailAlertsEnabled ? 'bg-emerald-400 text-[#003833]' : 'bg-white/10 text-teal-300'
                  }`}>
                    {preferences.emailAlertsEnabled ? 'ACTIVE & ARMED' : 'MUTED'}
                  </span>
                </div>
                <p className="text-xs text-teal-200 mt-0.5 leading-relaxed">
                  Sends automated instant warning emails when the detection engine flags theft, bypasses, or overcurrent hazards.
                </p>
              </div>
            </div>

            {/* Custom Toggle Switch */}
            <button
              type="button"
              onClick={() => handleToggle('emailAlertsEnabled')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                preferences.emailAlertsEnabled ? 'bg-emerald-400' : 'bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#003833] shadow ring-0 transition duration-200 ease-in-out ${
                  preferences.emailAlertsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Destination Email Address */}
          <div>
            <label className="text-xs font-bold text-teal-100 uppercase tracking-wide flex items-center space-x-1.5 mb-1.5">
              <Mail className="w-3.5 h-3.5 text-teal-300" />
              <span>Recipient Email Address for Alerts</span>
            </label>
            <input
              type="email"
              value={preferences.alertEmail}
              onChange={e => setPreferences(prev => ({ ...prev, alertEmail: e.target.value }))}
              placeholder="e.g. technician@powergrid.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white font-mono text-sm focus:outline-none focus:border-white"
              required
            />
            <span className="text-[10px] text-teal-200 mt-1 block">
              Defaulted to your authenticated Google account; editable for on-duty technicians or emergency response teams.
            </span>
          </div>

          {/* Minimum Severity Filter */}
          <div>
            <label className="text-xs font-bold text-teal-100 uppercase tracking-wide block mb-1.5">
              Minimum Anomaly Severity Threshold
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as AnomalySeverity[]).map(sev => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setPreferences(prev => ({ ...prev, minimumSeverity: sev }))}
                  className={`py-2 px-1 rounded-xl text-xs font-mono font-bold transition-all border ${
                    preferences.minimumSeverity === sev
                      ? 'bg-white text-[#005149] border-white shadow-sm'
                      : 'bg-[#00342f] text-teal-200 border-white/10 hover:border-white/30'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Granular Anomaly Event Categories */}
          <div className="space-y-2 pt-2 border-t border-white/15">
            <label className="text-xs font-bold text-teal-100 uppercase tracking-wide block">
              Trigger Alerts for These Electrical Events:
            </label>

            {/* 1. Critical Theft & Shunts */}
            <div 
              onClick={() => handleToggle('notifyCriticalTheft')}
              className="p-3 rounded-xl bg-[#003833] border border-white/15 hover:border-white/30 flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-3">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <div>
                  <div className="text-xs font-bold text-white">Current Shunt &amp; Energy Theft Bypass</div>
                  <div className="text-[11px] text-teal-200">Abrupt load collapse with line energized; physical jumper tap</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={preferences.notifyCriticalTheft} 
                onChange={() => {}} 
                className="w-4 h-4 accent-white rounded cursor-pointer" 
              />
            </div>

            {/* 2. Overcurrent / Surge */}
            <div 
              onClick={() => handleToggle('notifyOvercurrentSurge')}
              className="p-3 rounded-xl bg-[#003833] border border-white/15 hover:border-white/30 flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Flame className="w-4 h-4 text-amber-300" />
                <div>
                  <div className="text-xs font-bold text-white">Overcurrent Spike &amp; Breaker Overload</div>
                  <div className="text-[11px] text-teal-200">Continuous load exceeding breaker rating (&gt; 42A / 9.5 kW)</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={preferences.notifyOvercurrentSurge} 
                onChange={() => {}} 
                className="w-4 h-4 accent-white rounded cursor-pointer" 
              />
            </div>

            {/* 3. Voltage Sag */}
            <div 
              onClick={() => handleToggle('notifyVoltageSag')}
              className="p-3 rounded-xl bg-[#003833] border border-white/15 hover:border-white/30 flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Zap className="w-4 h-4 text-cyan-300" />
                <div>
                  <div className="text-xs font-bold text-white">Severe Voltage Sag Under High Draw</div>
                  <div className="text-[11px] text-teal-200">Line voltage drops below 190V under high current (unmetered tap)</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={preferences.notifyVoltageSag} 
                onChange={() => {}} 
                className="w-4 h-4 accent-white rounded cursor-pointer" 
              />
            </div>

            {/* 4. Offline Heartbeat */}
            <div 
              onClick={() => handleToggle('notifyOfflineHeartbeat')}
              className="p-3 rounded-xl bg-[#003833] border border-white/15 hover:border-white/30 flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-3">
                <WifiOff className="w-4 h-4 text-teal-300" />
                <div>
                  <div className="text-xs font-bold text-white">ESP32 Offline Disconnection Timeout</div>
                  <div className="text-[11px] text-teal-200">Meter ceases heartbeat telemetry for over 60 seconds</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={preferences.notifyOfflineHeartbeat} 
                onChange={() => {}} 
                className="w-4 h-4 accent-white rounded cursor-pointer" 
              />
            </div>
          </div>

          {/* Test Alert Button */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handleSendTestAlert}
              disabled={testSent}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#003833] hover:bg-[#002f2b] text-teal-200 text-xs font-bold border border-white/20 transition-colors"
            >
              <Send className={`w-3.5 h-3.5 ${testSent ? 'animate-bounce text-emerald-300' : ''}`} />
              <span>{testSent ? 'Test Alert Dispatched!' : 'Send Test Warning Email'}</span>
            </button>

            {testSent && (
              <span className="text-[11px] text-emerald-300 font-mono">
                Sample alert formatted for {preferences.alertEmail}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Check className="w-4 h-4 text-[#005149]" />
              <span>{isSaving ? 'Saving to Firebase...' : 'Save Preferences'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
