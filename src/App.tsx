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
  getDocs,
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
import { reconcileMeter, reconcileAnomalies, formatLastSeen, generate16CharApiKey, formatMeterId } from './utils/statusHelper';

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

  // In-memory tracking of actively deleted meter IDs (never persisted as a permanent blacklist across creations)
  const deletedMeterIdsRef = React.useRef<Set<string>>(new Set());

  const markMeterDeleted = useCallback((meterId: string) => {
    deletedMeterIdsRef.current.add(meterId);
  }, []);

  const unmarkMeterDeleted = useCallback((meterId: string) => {
    deletedMeterIdsRef.current.delete(meterId);
    try {
      localStorage.removeItem('vp_deleted_meters');
    } catch {}
  }, []);

  // Cascade delete a meter document and all its telemetry & anomalies subcollections from Firestore
  const purgeMeterFromFirestore = useCallback(async (meterId: string, extraDocId?: string) => {
    const idsToPurge = Array.from(new Set([meterId, extraDocId].filter(Boolean) as string[]));
    for (const id of idsToPurge) {
      try {
        const [telSnap, anomSnap] = await Promise.all([
          getDocs(collection(db, 'meters', id, 'telemetry')).catch(() => null),
          getDocs(collection(db, 'meters', id, 'anomalies')).catch(() => null),
        ]);
        const subDeletes: Promise<any>[] = [];
        if (telSnap) {
          telSnap.forEach((d) => subDeletes.push(deleteDoc(d.ref).catch(() => {})));
        }
        if (anomSnap) {
          anomSnap.forEach((d) => subDeletes.push(deleteDoc(d.ref).catch(() => {})));
        }
        if (subDeletes.length > 0) {
          await Promise.allSettled(subDeletes);
        }
      } catch {}
      await deleteDoc(doc(db, 'meters', id)).catch(() => {});
    }
    try {
      const qSnap = await getDocs(query(collection(db, 'meters'), where('meterId', '==', meterId)));
      const qDeletes: Promise<any>[] = [];
      qSnap.forEach((d) => {
        qDeletes.push(deleteDoc(d.ref).catch(() => {}));
      });
      if (qDeletes.length > 0) {
        await Promise.allSettled(qDeletes);
      }
    } catch {}
  }, []);

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

      discoveredMeters = discoveredMeters.filter(m => m && m.meterId && !deletedMeterIdsRef.current.has(m.meterId));

      if (discoveredMeters.length > 0) {
        const discoveredMap = new Map<string, Meter>();
        discoveredMeters.forEach((m) => {
          if (!deletedMeterIdsRef.current.has(m.meterId)) {
            discoveredMap.set(m.meterId, m);
          }
        });

        // Only update live metrics for meters that ALREADY exist in state; never inject or resurrect deleted meters
        setMeters((prevList) =>
          prevList
            .filter((m) => !deletedMeterIdsRef.current.has(m.meterId))
            .map((m) => {
              const updated = discoveredMap.get(m.meterId);
              return updated ? reconcileMeter(m, updated) : m;
            })
        );

        setActiveMeter((prev) => {
          if (!prev) return null;
          if (deletedMeterIdsRef.current.has(prev.meterId)) {
            return null;
          }
          const currentUpdated = discoveredMap.get(prev.meterId);
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

  // 3. Firestore Live Sync for Meters (with one-time clean database reset)
  useEffect(() => {
    if (!user) return;

    let unsubscribe: (() => void) | undefined;
    let isCancelled = false;

    const initFirestoreSync = async () => {
      // Always clear legacy localStorage deleted-meter blacklist that previously blocked re-created IDs
      try {
        localStorage.removeItem('vp_deleted_meters');
      } catch {}

      // One-time database cleanup for a completely fresh start
      try {
        if (localStorage.getItem('vp_db_fresh_start_v2') !== 'done') {
          localStorage.setItem('vp_db_fresh_start_v2', 'done');
          deletedMeterIdsRef.current.clear();

          await Promise.allSettled([
            fetch('/api/meters/reset', { method: 'POST' }),
            fetch('/api/telemetry/ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reset_all' }),
            }),
          ]);

          const existingSnap = await getDocs(
            query(collection(db, 'meters'), where('ownerUid', '==', user.uid))
          ).catch(() => null);

          const allIdsToPurge = new Set<string>([
            'ESP32-MTR-8842',
            'MTR-0001',
            'MTR-0002',
            'MTR-0003',
            'MTR-0004',
            'MTR-0005',
            'MTR-0006',
            'MTR-0007',
            'MTR-0008',
            'MTR-0009',
            'MTR-0010',
          ]);
          if (existingSnap) {
            existingSnap.forEach((d) => {
              allIdsToPurge.add(d.id);
              const data = d.data() as Meter;
              if (data?.meterId) allIdsToPurge.add(data.meterId);
            });
          }

          await Promise.allSettled(
            Array.from(allIdsToPurge).map((id) => purgeMeterFromFirestore(id))
          );

          if (!isCancelled) {
            setMeters([]);
            setActiveMeter(null);
            setTelemetryLogs([]);
            setAnomalies([]);
          }
        }
      } catch (cleanupErr) {
        console.warn('Database cleanup notice:', cleanupErr);
      }

      if (isCancelled) return;

      // Attach real-time Firestore listener for user's meters
      const metersQuery = query(
        collection(db, 'meters'),
        where('ownerUid', '==', user.uid)
      );

      unsubscribe = onSnapshot(
        metersQuery,
        (snapshot) => {
          const loadedMeters: Meter[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as Meter;
            const m: Meter = { ...data, id: d.id, meterId: data.meterId || d.id };
            if (!deletedMeterIdsRef.current.has(m.meterId) && !deletedMeterIdsRef.current.has(d.id)) {
              loadedMeters.push(m);
            }
          });

          const deletedIdsList = Array.from(deletedMeterIdsRef.current);

          // Sync user meters to backend
          fetch('/api/meters/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meters: loadedMeters, deletedIds: deletedIdsList }),
          }).catch(() => {});
          fetch('/api/telemetry/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync_meters', meters: loadedMeters, deletedIds: deletedIdsList }),
          }).catch(() => {});

          // Firestore is authoritative: only keep meters present in loadedMeters
          setMeters((prevMeters) => {
            const prevMap = new Map<string, Meter>();
            prevMeters.forEach(m => prevMap.set(m.meterId, m));
            return loadedMeters
              .filter(m => !deletedMeterIdsRef.current.has(m.meterId))
              .map(m => reconcileMeter(prevMap.get(m.meterId), m));
          });

          setActiveMeter((prev) => {
            if (!prev || deletedMeterIdsRef.current.has(prev.meterId)) {
              return loadedMeters[0] || null;
            }
            const found = loadedMeters.find((m) => m.meterId === prev.meterId);
            return found ? reconcileMeter(prev, found) : (loadedMeters[0] || null);
          });
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'meters');
        }
      );
    };

    initFirestoreSync();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, purgeMeterFromFirestore]);

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
            setAnomalies(prev => reconcileAnomalies(prev, data.alerts));
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
            setAnomalies(prev => reconcileAnomalies(prev, anomData.alerts));
          }
        }

        // Live update active meter state with fresh voltage, current, active power, etc.
        if (latestMeterData && !deletedMeterIdsRef.current.has(meterId)) {
          setActiveMeter((prev) => {
            if (!prev || prev.meterId !== meterId || deletedMeterIdsRef.current.has(meterId)) return prev;
            return reconcileMeter(prev, latestMeterData);
          });

          setMeters((prevList) =>
            prevList
              .filter((item) => !deletedMeterIdsRef.current.has(item.meterId))
              .map((item) => (item.meterId === meterId ? reconcileMeter(item, latestMeterData) : item))
          );

          // Authenticated Firestore real-time sync (use updateDoc so deleted documents are NEVER re-created)
          if (user && !deletedMeterIdsRef.current.has(meterId)) {
            try {
              await updateDoc(doc(db, 'meters', meterId), {
                voltage: latestMeterData.voltage,
                current: latestMeterData.current,
                activePower: latestMeterData.activePower,
                reactivePower: latestMeterData.reactivePower,
                powerFactor: latestMeterData.powerFactor,
                frequency: latestMeterData.frequency,
                totalEnergy: latestMeterData.totalEnergy,
                relayState: latestMeterData.relayState,
                status: latestMeterData.status,
                lastHeartbeat: latestMeterData.lastHeartbeat,
                hasAnomaly: latestMeterData.hasAnomaly,
                anomalyType: latestMeterData.anomalyType,
                anomalySeverity: latestMeterData.anomalySeverity,
                anomalyDescription: latestMeterData.anomalyDescription,
                updatedAt: latestMeterData.updatedAt || new Date().toISOString(),
              });

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
              // Ignore if document was deleted
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
          setTelemetryLogs(items);
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
          setAnomalies(prev => items.length > 0 ? reconcileAnomalies(prev, items) : []);
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
    meterId?: string;
    name: string;
    apiKey?: string;
    latitude: number;
    longitude: number;
    address: string;
  }): Promise<Meter> => {
    setIsLinkLoading(true);
    const ownerUid = user ? user.uid : 'demo_user';
    const now = new Date().toISOString();

    // Compute sequential Meter ID (MTR-XXXX) ensuring no collision with any currently active meter
    let nextSeq = meters.length + 1;
    meters.forEach((m) => {
      const match = m.meterId?.match(/^MTR-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num >= nextSeq) {
          nextSeq = num + 1;
        }
      }
    });
    const assignedMeterId = meterData.meterId?.trim() || formatMeterId(nextSeq);
    const assignedApiKey = meterData.apiKey?.trim() || generate16CharApiKey();

    // CRITICAL: Unmark deleted BEFORE any network or Firestore calls so onSnapshot never filters or deletes this meter!
    unmarkMeterDeleted(assignedMeterId);

    const newMeter: Meter = {
      id: assignedMeterId,
      meterId: assignedMeterId,
      ownerUid,
      name: meterData.name || `Smart Meter ${assignedMeterId}`,
      relayState: 'ON',
      status: 'OFFLINE',
      apiKey: assignedApiKey,
      lastHeartbeat: null as any,
      latitude: meterData.latitude,
      longitude: meterData.longitude,
      address: meterData.address || 'Smart Grid Connection Point',
      voltage: 0.0,
      current: 0.0,
      activePower: 0.0,
      reactivePower: 0.0,
      powerFactor: 0.0,
      frequency: 0.0,
      totalEnergy: 0.0,
      hasAnomaly: false,
      anomalyType: 'NONE',
      anomalySeverity: 'LOW',
      anomalyDescription: 'Newly configured meter awaiting initial telemetry stream',
      createdAt: now,
      updatedAt: now,
    };

    try {
      // 1. Register on backend API and telemetry ingestion engine
      await Promise.allSettled([
        fetch('/api/meters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...meterData,
            meterId: assignedMeterId,
            apiKey: assignedApiKey,
            ownerUid,
          }),
        }),
        fetch('/api/telemetry/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register_meter',
            meterId: assignedMeterId,
            apiKey: assignedApiKey,
            name: newMeter.name,
            latitude: newMeter.latitude,
            longitude: newMeter.longitude,
            address: newMeter.address,
            ownerUid,
          }),
        }),
      ]);

      // 2. If authenticated, purge any leftover telemetry/anomalies subcollection docs for this ID, then save meter to Firestore
      if (user) {
        try {
          const [oldTel, oldAnom] = await Promise.all([
            getDocs(collection(db, 'meters', newMeter.meterId, 'telemetry')).catch(() => null),
            getDocs(collection(db, 'meters', newMeter.meterId, 'anomalies')).catch(() => null),
          ]);
          const cleanupPromises: Promise<any>[] = [];
          if (oldTel) oldTel.forEach((d) => cleanupPromises.push(deleteDoc(d.ref).catch(() => {})));
          if (oldAnom) oldAnom.forEach((d) => cleanupPromises.push(deleteDoc(d.ref).catch(() => {})));
          if (cleanupPromises.length > 0) {
            await Promise.allSettled(cleanupPromises);
          }

          await setDoc(doc(db, 'meters', newMeter.meterId), {
            ...newMeter,
            ownerUid: user.uid,
          });
        } catch (e) {
          console.warn('Firestore create meter notice:', e);
        }
      }

      // 3. Re-confirm backend registration after Firestore snapshot settles
      await Promise.allSettled([
        fetch('/api/telemetry/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register_meter',
            meterId: assignedMeterId,
            apiKey: assignedApiKey,
            name: newMeter.name,
            latitude: newMeter.latitude,
            longitude: newMeter.longitude,
            address: newMeter.address,
            ownerUid,
          }),
        }),
      ]);

      // 4. Update state & switch to newly linked meter with cleared telemetry history
      setTelemetryLogs([]);
      setAnomalies([]);
      setMeters(prev => [newMeter, ...prev.filter(m => m.meterId !== newMeter.meterId)]);
      setActiveMeter(newMeter);
      setActiveTab('dashboard');

      return newMeter;
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

      if (user) {
        try {
          await updateDoc(doc(db, 'meters', activeMeter.meterId, 'anomalies', alertId), {
            status: 'RESOLVED',
          });
        } catch {}
      }
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

  // Delete Meter Handler (Cascade deletes meter document + all telemetry & anomaly logs in database & backend)
  const handleDeleteMeter = async (meterId: string) => {
    try {
      const targetMeter = meters.find(m => m.meterId === meterId || m.id === meterId);

      // 1. Mark meter as deleted during deletion so no in-flight poll can resurrect it
      markMeterDeleted(meterId);
      if (targetMeter?.id && targetMeter.id !== meterId) {
        markMeterDeleted(targetMeter.id);
      }

      // 2. Immediately update local UI state
      const remainingMeters = meters.filter(
        m => m.meterId !== meterId && m.id !== meterId && !deletedMeterIdsRef.current.has(m.meterId)
      );
      setMeters(remainingMeters);
      if (activeMeter?.meterId === meterId || activeMeter?.id === meterId) {
        const nextMeter = remainingMeters.length > 0 ? remainingMeters[0] : null;
        setActiveMeter(nextMeter);
        setTelemetryLogs([]);
        setAnomalies([]);
        if (!nextMeter) {
          setActiveTab('dashboard');
        }
      }

      // 3. Cascade delete from Firestore (telemetry subcollection + anomalies subcollection + meter doc)
      if (user) {
        await purgeMeterFromFirestore(meterId, targetMeter?.id);
      }

      // 4. Delete from backend memory / disk cache
      const deletedIdsList = Array.from(deletedMeterIdsRef.current);
      await Promise.allSettled([
        fetch(`/api/meters/${encodeURIComponent(meterId)}`, {
          method: 'DELETE',
        }),
        fetch('/api/telemetry/ingest?action=delete_meter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_meter', meterId }),
        }),
        fetch('/api/meters/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meters: remainingMeters, deletedIds: deletedIdsList }),
        }),
      ]);
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
          setAnomalies(prev => reconcileAnomalies(prev, [alertObj]));

          if (user) {
            try {
              setDoc(doc(db, 'meters', activeMeter.meterId, 'anomalies', alertObj.id), {
                ...alertObj,
                ownerUid: user.uid,
              }, { merge: true });
            } catch (fsErr) {
              console.warn('Firestore sync anomaly error:', fsErr);
            }
          }
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
        onDeleteMeter={handleDeleteMeter}
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
        onClose={() => setIsOnboardingOpen(false)}
        isLoading={isLinkLoading}
        existingMetersCount={meters.length}
      />

      {/* Link New Meter Modal */}
      <LinkMeterModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onLinkMeter={handleLinkNewMeter}
        isLoading={isLinkLoading}
        existingMetersCount={meters.length}
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
