import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  testConnection, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { AnomalyAlert, Meter, TelemetryLog } from './types/energy';
import { Navbar } from './components/Navbar';
import { AnomalyBanner } from './components/AnomalyBanner';
import { TelemetryGauges } from './components/TelemetryGauges';
import { RemoteRelaySwitch } from './components/RemoteRelaySwitch';
import { HistoricalCharts } from './components/HistoricalCharts';
import { GpsLocationMap } from './components/GpsLocationMap';
import { AnomalyShieldView } from './components/AnomalyShieldView';
import { HardwareWorkbench } from './components/HardwareWorkbench';
import { LinkMeterModal } from './components/LinkMeterModal';
import { SettingsModal } from './components/SettingsModal';
import { SettingsTab } from './components/SettingsTab';
import { AuthPage } from './components/AuthPage';
import { MeterOnboardingModal } from './components/MeterOnboardingModal';
import { Activity, ShieldCheck, Zap, Radio, AlertCircle, Plus, Cpu } from 'lucide-react';
import { reconcileMeter, formatLastSeen } from './utils/statusHelper';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [activeMeter, setActiveMeter] = useState<Meter | null>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'map' | 'anomalies' | 'workbench' | 'settings'>('dashboard');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRelayLoading, setIsRelayLoading] = useState(false);
  const [isLinkLoading, setIsLinkLoading] = useState(false);
  const [nowTime, setNowTime] = useState(Date.now());

  // Periodically refresh nowTime every 1s for live heartbeat counter
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check Firestore connection on boot per Firebase skill
  useEffect(() => {
    testConnection();
  }, []);

  // 1. Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        // Save user profile in Firestore
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || '',
            photoURL: currentUser.photoURL || '',
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (err) {
          console.warn('User profile sync notice:', err);
        }
      } else {
        // Clear cached state on sign out
        setMeters([]);
        setActiveMeter(null);
        setTelemetryLogs([]);
        setAnomalies([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch meters from telemetry ingest endpoint & API
  const fetchBackendMeters = useCallback(async (currentUserId?: string) => {
    try {
      // First check telemetry ingest endpoint for hardware meters reporting live
      let discoveredMeters: Meter[] = [];
      try {
        const telRes = await fetch('/api/telemetry/meters');
        if (telRes.ok) {
          const telData = await telRes.json();
          if (telData.meters && Array.isArray(telData.meters)) {
            discoveredMeters = telData.meters;
          }
        }
      } catch (telErr) {
        console.warn('Telemetry meters query notice:', telErr);
      }

      // Also query standard /api/meters
      try {
        const apiRes = await fetch('/api/meters');
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData.meters && Array.isArray(apiData.meters)) {
            const existingIds = new Set(discoveredMeters.map(m => m.meterId));
            apiData.meters.forEach((m: Meter) => {
              if (!existingIds.has(m.meterId)) {
                discoveredMeters.push(m);
              }
            });
          }
        }
      } catch (apiErr) {
        console.warn('API meters query notice:', apiErr);
      }

      if (discoveredMeters.length > 0) {
        setMeters((prevList) => {
          const map = new Map<string, Meter>();
          prevList.forEach((m) => map.set(m.meterId, m));
          discoveredMeters.forEach((m) => {
            const existing = map.get(m.meterId);
            map.set(m.meterId, reconcileMeter(existing, m));
          });
          return Array.from(map.values());
        });

        // Smart active meter selection
        setActiveMeter((prev) => {
          if (!prev) return discoveredMeters[0];
          
          // If current meter is the demo meter and an actual hardware meter reported live in last 120s, auto-switch
          const liveHardware = discoveredMeters.find(m => 
            m.meterId !== 'ESP32-MTR-8842' && 
            m.lastHeartbeat && 
            (Date.now() - new Date(m.lastHeartbeat).getTime()) < 120000
          );
          if (prev.meterId === 'ESP32-MTR-8842' && liveHardware) {
            return reconcileMeter(prev, liveHardware);
          }

          // Otherwise keep current meter updated with latest metrics without reverting newer readings
          const currentUpdated = discoveredMeters.find(m => m.meterId === prev.meterId);
          return currentUpdated ? reconcileMeter(prev, currentUpdated) : prev;
        });
      }
    } catch (e) {
      console.warn('API fetch meters fallback:', e);
    }
  }, []);

  // Periodic meter discovery poll every 4s
  useEffect(() => {
    fetchBackendMeters(user?.uid);
    const meterDiscoveryTimer = setInterval(() => {
      fetchBackendMeters(user?.uid);
    }, 4000);
    return () => clearInterval(meterDiscoveryTimer);
  }, [user, fetchBackendMeters]);

  // 3. Firestore Live Sync for Meters
  useEffect(() => {
    if (!user) return;

    // Attach real-time Firestore listener for user's meters
    const metersQuery = query(
      collection(db, 'meters'),
      where('ownerUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      metersQuery,
      (snapshot) => {
        const loadedMeters: Meter[] = [];
        snapshot.forEach((d) => {
          loadedMeters.push({ ...(d.data() as Meter), id: d.id });
        });

        if (loadedMeters.length > 0) {
          setMeters((prevMeters) => {
            const map = new Map<string, Meter>();
            prevMeters.forEach(m => map.set(m.meterId, m));
            loadedMeters.forEach(m => {
              const existing = map.get(m.meterId);
              map.set(m.meterId, reconcileMeter(existing, m));
            });
            return Array.from(map.values());
          });
          setActiveMeter((prev) => {
            if (!prev) return loadedMeters[0];
            const found = loadedMeters.find((m) => m.meterId === prev.meterId);
            return found ? reconcileMeter(prev, found) : prev;
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'meters');
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 4. Fetch/Listen for Active Meter Live Telemetry, Gauges & Anomalies
  useEffect(() => {
    if (!activeMeter) return;

    const meterId = activeMeter.meterId;

    // Fast-poll live telemetry from serverless ingestion point every 2s
    const fetchTelemetry = async () => {
      try {
        const [latestRes, telRes, anomRes] = await Promise.all([
          fetch(`/api/telemetry/latest?meterId=${encodeURIComponent(meterId)}`),
          fetch(`/api/meters/${encodeURIComponent(meterId)}/telemetry`),
          fetch(`/api/meters/${encodeURIComponent(meterId)}/anomalies`),
        ]);

        let latestMeterData: any = null;
        let latestLogData: any = null;

        if (latestRes.ok) {
          const data = await latestRes.json();
          if (data?.meter) {
            latestMeterData = data.meter;
          }
          if (data?.latestLog) {
            latestLogData = data.latestLog;
          }
          if (data?.logs && data.logs.length > 0) {
            setTelemetryLogs(data.logs);
          }
          if (data?.alerts && data.alerts.length > 0) {
            setAnomalies(data.alerts);
          }
        }

        // Fallback for standard routes
        if (!latestLogData && telRes.ok) {
          const telData = await telRes.json();
          if (telData.logs && telData.logs.length > 0) {
            setTelemetryLogs(telData.logs);
            latestLogData = telData.logs[telData.logs.length - 1];
          }
        }
        if (anomRes.ok) {
          const anomData = await anomRes.json();
          if (anomData.alerts && anomData.alerts.length > 0) {
            setAnomalies(anomData.alerts);
          }
        }

        // Live update active meter state with fresh voltage, current, active power, etc.
        if (latestMeterData) {
          setActiveMeter((prev) => {
            if (!prev || prev.meterId !== meterId) return prev;
            return reconcileMeter(prev, latestMeterData);
          });

          setMeters((prevList) =>
            prevList.map((item) => (item.meterId === meterId ? reconcileMeter(item, latestMeterData) : item))
          );

          // Authenticated Firestore real-time sync
          if (user) {
            try {
              await setDoc(
                doc(db, 'meters', meterId),
                {
                  ...latestMeterData,
                  ownerUid: user.uid,
                },
                { merge: true }
              );

              if (latestLogData) {
                await setDoc(
                  doc(db, 'meters', meterId, 'telemetry', latestLogData.id || `TL-${Date.now()}`),
                  {
                    ...latestLogData,
                    ownerUid: user.uid,
                  },
                  { merge: true }
                );
              }
            } catch (fsErr) {
              console.warn('Firestore real-time sync notice:', fsErr);
            }
          }
        }
      } catch (e) {
        console.warn('Error fetching telemetry from API:', e);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 2000);

    // If authenticated, also listen to Firestore subcollection
    let unsubscribeTel: (() => void) | undefined;
    let unsubscribeAnom: (() => void) | undefined;

    if (user) {
      try {
        const telQuery = query(
          collection(db, 'meters', meterId, 'telemetry'),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
        unsubscribeTel = onSnapshot(telQuery, (snapshot) => {
          const items: TelemetryLog[] = [];
          snapshot.forEach(d => items.push({ ...(d.data() as TelemetryLog), id: d.id }));
          if (items.length > 0) setTelemetryLogs(items);
        }, (error) => {
          console.warn('Firestore subcollection stream:', error.message);
        });

        const anomQuery = query(
          collection(db, 'meters', meterId, 'anomalies'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        unsubscribeAnom = onSnapshot(anomQuery, (snapshot) => {
          const items: AnomalyAlert[] = [];
          snapshot.forEach(d => items.push({ ...(d.data() as AnomalyAlert), id: d.id }));
          if (items.length > 0) setAnomalies(items);
        }, (error) => {
          console.warn('Firestore anomalies stream:', error.message);
        });
      } catch (err) {
        console.warn('Subcollection setup notice:', err);
      }
    }

    return () => {
      clearInterval(interval);
      if (unsubscribeTel) unsubscribeTel();
      if (unsubscribeAnom) unsubscribeAnom();
    };
  }, [activeMeter?.meterId, user]);

  // Heartbeat calculation and 30-minute online status window
  const lastSeenInfo = formatLastSeen(activeMeter?.lastHeartbeat, nowTime);
  const heartbeatAgeSec = lastSeenInfo.ageSec;
  const isOnline = lastSeenInfo.isOnline;

  // Toggle Relay Output (ON / OFF)
  const handleToggleRelay = async (newState: 'ON' | 'OFF') => {
    if (!activeMeter) return;
    setIsRelayLoading(true);

    try {
      // 1. Send command to backend (both telemetry ingest point and meters API)
      try {
        await Promise.allSettled([
          fetch('/api/telemetry/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meterId: activeMeter.meterId,
              action: 'relay_toggle',
              relayState: newState,
            }),
          }),
          fetch(`/api/meters/${encodeURIComponent(activeMeter.meterId)}/relay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relayState: newState }),
          }),
        ]);
      } catch (err) {
        console.warn('Backend relay API notice:', err);
      }

      // 2. Update local state
      setActiveMeter(prev => prev ? { ...prev, relayState: newState } : null);
      setMeters(prev => prev.map(m => m.meterId === activeMeter.meterId ? { ...m, relayState: newState } : m));

      // 3. Update Firestore if user is authenticated
      if (user) {
        try {
          await updateDoc(doc(db, 'meters', activeMeter.meterId), {
            relayState: newState,
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Firestore updateDoc notice:', e);
        }
      }
    } catch (err: any) {
      console.error('Error toggling relay:', err);
      alert(`Failed to send relay command: ${err.message}`);
    } finally {
      setIsRelayLoading(false);
    }
  };

  // Register & Link New Meter (used both in post-signup wizard and link modal)
  const handleLinkNewMeter = async (meterData: {
    meterId: string;
    name: string;
    apiKey: string;
    latitude: number;
    longitude: number;
    address: string;
  }) => {
    setIsLinkLoading(true);
    const ownerUid = user ? user.uid : 'demo_user';
    const now = new Date().toISOString();

    const newMeter: Meter = {
      id: meterData.meterId,
      meterId: meterData.meterId,
      ownerUid,
      name: meterData.name || `ESP32 Meter ${meterData.meterId}`,
      relayState: 'ON',
      status: 'ONLINE',
      apiKey: meterData.apiKey || `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      lastHeartbeat: now,
      latitude: meterData.latitude,
      longitude: meterData.longitude,
      address: meterData.address || 'Smart Grid Connection Point',
      voltage: 230.0,
      current: 0.0,
      activePower: 0.0,
      reactivePower: 0.0,
      powerFactor: 0.98,
      frequency: 50.0,
      totalEnergy: 0.0,
      hasAnomaly: false,
      anomalyType: 'NONE',
      anomalySeverity: 'LOW',
      anomalyDescription: 'Newly connected meter ready for telemetry stream',
      createdAt: now,
      updatedAt: now,
    };

    try {
      // 1. Post to backend API with resilient text parsing
      try {
        const res = await fetch('/api/meters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...meterData, ownerUid }),
        });

        if (res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (data?.meter) {
              Object.assign(newMeter, data.meter);
            }
          } catch {
            // Response was not JSON, status was ok
          }
        } else {
          console.warn(`Backend /api/meters responded with status ${res.status}`);
        }
      } catch (apiErr) {
        console.warn('Backend API meter sync skipped/offline:', apiErr);
      }

      // 2. Save in Firestore if authenticated
      if (user) {
        try {
          await setDoc(doc(db, 'meters', newMeter.meterId), {
            ...newMeter,
            ownerUid: user.uid,
          });
        } catch (e) {
          console.warn('Firestore create meter notice:', e);
        }
      }

      // 3. Update state & switch to newly linked meter
      setMeters(prev => [newMeter, ...prev.filter(m => m.meterId !== newMeter.meterId)]);
      setActiveMeter(newMeter);
      setIsOnboardingOpen(false);
      setIsLinkModalOpen(false);
      setActiveTab('dashboard');
    } catch (generalErr: any) {
      console.error('Error in handleLinkNewMeter:', generalErr);
      throw new Error(generalErr?.message || 'Could not complete meter setup. Please try again.');
    } finally {
      setIsLinkLoading(false);
    }
  };

  // Geolocation update
  const handleUpdateLocation = async (lat: number, lng: number, address: string) => {
    if (!activeMeter) return;
    try {
      setActiveMeter(prev => prev ? { ...prev, latitude: lat, longitude: lng, address } : null);
      setMeters(prev => prev.map(m => m.meterId === activeMeter.meterId ? { ...m, latitude: lat, longitude: lng, address } : m));

      if (user) {
        await updateDoc(doc(db, 'meters', activeMeter.meterId), {
          latitude: lat,
          longitude: lng,
          address,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Update location notice:', e);
    }
  };

  // Resolve Anomaly Alert
  const handleResolveAlert = async (alertId: string) => {
    if (!activeMeter) return;
    try {
      await fetch(`/api/meters/${encodeURIComponent(activeMeter.meterId)}/anomalies/${encodeURIComponent(alertId)}/resolve`, {
        method: 'POST',
      });
      setAnomalies(prev => prev.map(a => a.id === alertId ? { ...a, status: 'RESOLVED' } : a));
      setActiveMeter(prev => prev ? {
        ...prev,
        hasAnomaly: false,
        anomalyType: 'NONE',
        anomalySeverity: 'LOW',
        anomalyDescription: 'Operating normally',
      } : null);
    } catch (e) {
      console.error('Resolve alert error:', e);
    }
  };

  // Clear anomaly from top banner
  const handleClearAnomaly = async () => {
    if (!activeMeter) return;
    try {
      setActiveMeter(prev => prev ? {
        ...prev,
        hasAnomaly: false,
        anomalyType: 'NONE',
        anomalySeverity: 'LOW',
        anomalyDescription: 'Operating normally',
      } : null);

      if (user) {
        await updateDoc(doc(db, 'meters', activeMeter.meterId), {
          hasAnomaly: false,
          anomalyType: 'NONE',
          anomalySeverity: 'LOW',
          anomalyDescription: 'Operating normally',
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Clear anomaly notice:', e);
    }
  };

  // Delete Meter Handler
  const handleDeleteMeter = async (meterId: string) => {
    try {
      // 1. Delete from backend memory / API
      await fetch(`/api/meters/${encodeURIComponent(meterId)}`, {
        method: 'DELETE',
      });
      // Also notify telemetry/ingest in case of Vercel serverless
      try {
        await fetch('/api/telemetry/ingest?action=delete_meter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meterId }),
        });
      } catch {}

      // 2. Delete from Firestore if authenticated
      if (user) {
        try {
          await deleteDoc(doc(db, 'meters', meterId));
        } catch (fsErr) {
          console.warn('Firestore delete meter notice:', fsErr);
        }
      }

      // 3. Update local state
      const remainingMeters = meters.filter(m => m.meterId !== meterId);
      setMeters(remainingMeters);
      if (activeMeter?.meterId === meterId) {
        const nextMeter = remainingMeters.length > 0 ? remainingMeters[0] : null;
        setActiveMeter(nextMeter);
        if (!nextMeter) {
          setActiveTab('dashboard');
        }
      }
    } catch (err: any) {
      console.error('Delete meter error:', err);
      throw new Error(err?.message || 'Failed to delete meter');
    }
  };

  // Rotate / Change API Key Handler
  // Rotate / Change API Key Handler (Strictly auto-generates fixed 16-character key: VP- + 13 chars)
  const handleRotateApiKey = async (meterId: string): Promise<string> => {
    try {
      let newKey = '';
      const res = await fetch(`/api/meters/${encodeURIComponent(meterId)}/rotate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        newKey = data.apiKey;
      } else {
        // Fallback Vercel ingest endpoint
        const fbRes = await fetch('/api/telemetry/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rotate_key', meterId }),
        });
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          newKey = fbData.apiKey;
        }
      }

      // Ensure strict fixed length of 16 chars: "VP-" + 13 alphanumeric chars = 16 chars
      if (!newKey || newKey.length !== 16) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let randomSuffix = '';
        for (let i = 0; i < 13; i++) {
          randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        newKey = `VP-${randomSuffix}`;
      }

      // Update in local state
      setMeters(prev => prev.map(m => m.meterId === meterId ? { ...m, apiKey: newKey } : m));
      setActiveMeter(prev => prev && prev.meterId === meterId ? { ...prev, apiKey: newKey } : prev);

      // Update in Firestore
      if (user) {
        try {
          await updateDoc(doc(db, 'meters', meterId), {
            apiKey: newKey,
            updatedAt: new Date().toISOString(),
          });
        } catch (fsErr) {
          console.warn('Firestore rotate key notice:', fsErr);
        }
      }

      return newKey;
    } catch (err: any) {
      console.error('Rotate API key error:', err);
      throw new Error(err?.message || 'Failed to rotate API key');
    }
  };

  // Update Meter Metadata Handler
  const handleUpdateMeter = async (meterId: string, updates: Partial<Meter>) => {
    try {
      await fetch(`/api/meters/${encodeURIComponent(meterId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      setMeters(prev => prev.map(m => m.meterId === meterId ? { ...m, ...updates } : m));
      setActiveMeter(prev => prev && prev.meterId === meterId ? { ...prev, ...updates } : prev);

      if (user) {
        try {
          await updateDoc(doc(db, 'meters', meterId), {
            ...updates,
            updatedAt: new Date().toISOString(),
          });
        } catch (fsErr) {
          console.warn('Firestore update meter notice:', fsErr);
        }
      }
    } catch (err: any) {
      console.error('Update meter error:', err);
      throw new Error(err?.message || 'Failed to update meter');
    }
  };

  // Telemetry injection from Hardware Workbench
  const handleSendTelemetry = async (sampleData: any) => {
    if (!activeMeter) return;
    try {
      const res = await fetch('/api/telemetry/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meterId: activeMeter.meterId,
          apiKey: activeMeter.apiKey,
          ...sampleData,
        }),
      });
      if (res.ok) {
        const text = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(text);
        } catch {}
        if (data?.meter) {
          setActiveMeter(data.meter);
          setMeters(prev => prev.map(m => m.meterId === activeMeter.meterId ? data.meter : m));
          if (user) {
            try {
              setDoc(doc(db, 'meters', activeMeter.meterId), {
                ...data.meter,
                ownerUid: user.uid,
              }, { merge: true });
            } catch {}
          }
        }
        const incomingLog = data?.telemetryLog || data?.log;
        if (incomingLog) {
          setTelemetryLogs(prev => [incomingLog, ...prev.slice(0, 99)]);
          if (user) {
            try {
              setDoc(doc(db, 'meters', activeMeter.meterId, 'telemetry', incomingLog.id || `TL-${Date.now()}`), {
                ...incomingLog,
                ownerUid: user.uid,
              }, { merge: true });
            } catch {}
          }
        }
        if (data?.anomalyAlert || (data?.anomaly && data.anomaly.hasAnomaly)) {
          const alertObj = data.anomalyAlert || {
            id: `ALT-${Date.now()}`,
            meterId: activeMeter.meterId,
            ownerUid: user ? user.uid : 'demo_user',
            type: data.anomaly.type,
            severity: data.anomaly.severity,
            title: data.anomaly.title,
            description: data.anomaly.description,
            status: 'ACTIVE',
            telemetrySnapshot: incomingLog || sampleData,
            createdAt: new Date().toISOString(),
          };
          setAnomalies(prev => [alertObj, ...prev]);
        }
        return data;
      }
    } catch (err) {
      console.error('Telemetry workbench send error:', err);
    }
  };

  const handleSignIn = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const isNew = res.user.metadata.creationTime === res.user.metadata.lastSignInTime;
      if (isNew) {
        setIsOnboardingOpen(true);
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  // -------------------------------------------------------------
  // AUTH LOADING SCREEN
  // -------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#002b27] flex flex-col items-center justify-center p-4 text-white">
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-white text-[#005149] shadow-2xl mb-4 animate-bounce">
          <Zap className="w-9 h-9 fill-current text-[#005149]" />
        </div>
        <h2 className="text-xl font-black tracking-tight text-white">VoltPulse IoT</h2>
        <p className="text-xs text-teal-200 mt-1 font-mono">Verifying secure grid session...</p>
        <div className="mt-6 w-48 h-1.5 bg-[#003833] rounded-full overflow-hidden">
          <div className="w-full h-full bg-white animate-pulse"></div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // GATED AUTHENTICATION: Strict Login/Sign-up Requirement
  // -------------------------------------------------------------
  if (!user) {
    return (
      <AuthPage
        onAuthSuccess={(isNewUser) => {
          if (isNewUser) {
            setIsOnboardingOpen(true);
          }
        }}
      />
    );
  }

  // -------------------------------------------------------------
  // AUTHENTICATED DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#00221f] text-white flex flex-col font-sans selection:bg-white selection:text-[#005149]">
      
      {/* High-visibility Brand Navbar */}
      <Navbar
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        meters={meters}
        activeMeter={activeMeter}
        onSelectMeter={(meter) => setActiveMeter(meter)}
        onOpenLinkModal={() => setIsLinkModalOpen(true)}
        onOpenSettings={() => setActiveTab('settings')}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOnline={isOnline}
        heartbeatAgeSec={heartbeatAgeSec}
        nowTime={nowTime}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
        
        {/* If no meter configured yet, present quick connect hero */}
        {meters.length === 0 && !activeMeter && (
          <div className="p-8 sm:p-12 rounded-3xl bg-[#003833] border-2 border-white/20 text-center shadow-2xl space-y-6 my-6">
            <div className="w-16 h-16 rounded-2xl bg-white text-[#005149] flex items-center justify-center mx-auto shadow-xl">
              <Cpu className="w-8 h-8 text-[#005149]" />
            </div>
            <div className="space-y-2 max-w-lg mx-auto">
              <h2 className="text-2xl font-black text-white">No Energy Meter Connected Yet</h2>
              <p className="text-sm text-teal-200">
                To view telemetry and anti-theft monitoring, connect your ESP32 hardware meter or auto-generate a virtual test meter.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <button
                onClick={() => setIsOnboardingOpen(true)}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2"
              >
                <Plus className="w-5 h-5 text-[#005149]" />
                <span>Configure &amp; Connect Meter</span>
              </button>
            </div>
          </div>
        )}

        {/* Global Overview Bar */}
        {activeMeter && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-white/10 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {activeMeter.name}
                </h1>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-white text-[#005149] font-black shadow-xs">
                  {activeMeter.meterId}
                </span>
              </div>
              <p className="text-xs text-teal-200 mt-0.5 flex items-center space-x-1.5">
                <span>{activeMeter.address}</span>
                <span>•</span>
                <span className="font-mono text-teal-100">GPS: {activeMeter.latitude.toFixed(4)}, {activeMeter.longitude.toFixed(4)}</span>
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsLinkModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors border border-white/15"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Meter</span>
              </button>
            </div>
          </div>
        )}

        {activeMeter && (
          <>
            {/* Top Anomaly & Theft Warning Banner */}
            <AnomalyBanner
              meter={activeMeter}
              onTripRelay={() => handleToggleRelay('OFF')}
              onClearAnomaly={handleClearAnomaly}
              onViewDetails={() => setActiveTab('anomalies')}
            />

            {/* TAB 1: Main Dashboard (Ordered: Energy, Active Power, Reactive Power, Voltage, Current, Frequency) */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* 6 Real-time Telemetry Cards in requested sequence: Energy -> Active Power -> Reactive Power -> Voltage -> Current */}
                <TelemetryGauges meter={activeMeter} />

                {/* Industrial Remote Relay Circuit Breaker Switch */}
                <RemoteRelaySwitch
                  meter={activeMeter}
                  onToggleRelay={handleToggleRelay}
                  isLoading={isRelayLoading}
                />

                {/* Live Real-time Chart snippet */}
                <HistoricalCharts
                  logs={telemetryLogs}
                  meterId={activeMeter.meterId}
                />
              </div>
            )}

            {/* TAB 2: Historical Telemetry Charts */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <HistoricalCharts
                  logs={telemetryLogs}
                  meterId={activeMeter.meterId}
                />
              </div>
            )}

            {/* TAB 3: GPS Meter Location */}
            {activeTab === 'map' && (
              <div className="space-y-6">
                <GpsLocationMap
                  meter={activeMeter}
                  onUpdateLocation={handleUpdateLocation}
                />
              </div>
            )}

            {/* TAB 4: Theft & Anomaly Shield */}
            {activeTab === 'anomalies' && (
              <div className="space-y-6">
                <AnomalyShieldView
                  meter={activeMeter}
                  alerts={anomalies}
                  onTripRelay={() => handleToggleRelay('OFF')}
                  onResolveAlert={handleResolveAlert}
                />
              </div>
            )}

            {/* TAB 5: ESP32 Hardware Simulator & Firmware Workbench */}
            {activeTab === 'workbench' && (
              <div className="space-y-6">
                <HardwareWorkbench
                  meter={activeMeter}
                  onSendTelemetry={handleSendTelemetry}
                />
              </div>
            )}

            {/* TAB 6: Meter & Security Settings */}
            {activeTab === 'settings' && (
              <SettingsTab
                user={user}
                meters={meters}
                activeMeter={activeMeter}
                onSelectMeter={(meter) => setActiveMeter(meter)}
                onUpdateMeter={handleUpdateMeter}
                onRotateApiKey={handleRotateApiKey}
                onDeleteMeter={handleDeleteMeter}
              />
            )}
          </>
        )}

        {/* Allow Settings Tab access even if no active meter */}
        {activeTab === 'settings' && !activeMeter && (
          <SettingsTab
            user={user}
            meters={meters}
            activeMeter={null}
            onSelectMeter={(meter) => setActiveMeter(meter)}
            onUpdateMeter={handleUpdateMeter}
            onRotateApiKey={handleRotateApiKey}
            onDeleteMeter={handleDeleteMeter}
          />
        )}

      </main>

      {/* Footer in Deep Teal Green & White */}
      <footer className="border-t border-white/10 bg-[#002b27] py-4 text-center text-xs text-teal-200 font-mono shadow-md">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
            <span className="font-semibold text-white">VoltPulse IoT • ESP32 Grid Energy Telemetry &amp; Anti-Theft Protection</span>
          </div>
          <div>
            API Ingestion Endpoint: <code className="text-white bg-white/15 px-2 py-0.5 rounded font-bold">/api/telemetry/ingest</code>
          </div>
        </div>
      </footer>

      {/* Post-Signup Meter Onboarding Wizard */}
      <MeterOnboardingModal
        isOpen={isOnboardingOpen}
        user={user}
        onComplete={handleLinkNewMeter}
        isLoading={isLinkLoading}
      />

      {/* Link New Meter Modal */}
      <LinkMeterModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onLinkMeter={handleLinkNewMeter}
        isLoading={isLinkLoading}
      />

      {/* Alert & Notification Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
      />
    </div>
  );
}
