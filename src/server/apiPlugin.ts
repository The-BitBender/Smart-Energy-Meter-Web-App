import type { Plugin, ViteDevServer } from 'vite';
import { IncomingMessage, ServerResponse } from 'http';
import { activeMeters, anomalyStore, processTelemetryIngest, telemetryStore, userPreferencesStore } from './telemetryHandler';
import { Meter, NotificationPreferences } from '../types/energy';

// Helper to seed realistic demo data on initialization
function ensureDemoMeters() {
  if (activeMeters.size > 0) return;

  const demoMeterId = 'ESP32-MTR-8842';
  const now = Date.now();

  const demoMeter: Meter = {
    id: demoMeterId,
    meterId: demoMeterId,
    ownerUid: 'demo_user',
    name: 'Main Feeder Panel - Workshop A',
    relayState: 'ON',
    status: 'ONLINE',
    apiKey: 'VP-8842-SECURE-KEY',
    lastHeartbeat: new Date(now).toISOString(),
    latitude: 6.5244,
    longitude: 3.3792,
    address: 'Plot 12 Commercial Way, Industrial Estate, Lagos',
    voltage: 231.8,
    current: 14.6,
    activePower: 3315.0,
    reactivePower: 410.0,
    powerFactor: 0.98,
    frequency: 50.02,
    totalEnergy: 148.62,
    hasAnomaly: false,
    anomalyType: 'NONE',
    anomalySeverity: 'LOW',
    anomalyDescription: 'Operating normally',
    createdAt: new Date(now - 86400000 * 7).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  activeMeters.set(demoMeterId, demoMeter);

  // Generate 24 hours of realistic telemetry logs (every 30 mins)
  const logs = [];
  let cumulativeEnergy = 132.0;

  for (let i = 48; i >= 0; i--) {
    const time = new Date(now - i * 30 * 60 * 1000).toISOString();
    // Simulate typical diurnal load curve
    const hour = (new Date(time)).getHours();
    let baseCurrent = 5.0;
    if (hour >= 8 && hour <= 18) {
      baseCurrent = 12.0 + Math.sin(hour / 3) * 6.0;
    } else if (hour >= 19 && hour <= 23) {
      baseCurrent = 9.0;
    } else {
      baseCurrent = 3.5;
    }
    const noise = (Math.random() - 0.5) * 1.5;
    const current = Math.max(0.5, Math.round((baseCurrent + noise) * 10) / 10);
    const voltage = Math.round((229.0 + (Math.random() - 0.5) * 4) * 10) / 10;
    const pf = 0.96 + (Math.random() - 0.5) * 0.04;
    const activePower = Math.round(voltage * current * pf * 10) / 10;
    const apparent = voltage * current;
    const reactivePower = Math.round(Math.sqrt(Math.max(0, apparent * apparent - activePower * activePower)) * 10) / 10;
    cumulativeEnergy += (activePower * 0.5) / 1000.0;

    logs.push({
      id: `TL-HIST-${i}`,
      meterId: demoMeterId,
      ownerUid: 'demo_user',
      voltage,
      current,
      activePower,
      reactivePower,
      powerFactor: Math.round(pf * 100) / 100,
      frequency: 50.01,
      energy: Math.round(cumulativeEnergy * 1000) / 1000,
      relayState: 'ON' as const,
      hasAnomaly: false,
      timestamp: time,
    });
  }

  telemetryStore.set(demoMeterId, logs);
}

// Read body helper with fallback
function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    if ((req as any).body && typeof (req as any).body === 'object') {
      return resolve((req as any).body);
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

export function apiMiddlewarePlugin(): Plugin {
  return {
    name: 'iot-energy-api-plugin',
    configureServer(server: ViteDevServer) {
      ensureDemoMeters();

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const [pathname] = rawUrl.split('?');
        const cleanPath = pathname.replace(/\/$/, '') || '/';

        // CORS Preflight
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
          res.statusCode = 204;
          return res.end();
        }

        // Only handle /api routes
        if (!cleanPath.startsWith('/api')) {
          return next();
        }

        try {
          // 1. Health check
          if (cleanPath === '/api/health' && req.method === 'GET') {
            return sendJson(res, 200, {
              status: 'online',
              system: 'VoltPulse IoT Ingestion Engine',
              activeMetersCount: activeMeters.size,
              timestamp: new Date().toISOString(),
            });
          }

          // 2. Ingest telemetry from physical ESP32 or Simulator
          if (cleanPath === '/api/telemetry/ingest' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const apiKeyHeader = req.headers['x-api-key'] as string;
            if (apiKeyHeader && !body.apiKey) {
              body.apiKey = apiKeyHeader;
            }

            const result = processTelemetryIngest(body);
            return sendJson(res, 200, result);
          }

          // 3. Fast relay polling for ESP32 (GET /api/meters/:id/relay-status)
          const relayStatusMatch = cleanPath.match(/^\/api\/meters\/([^\/]+)\/relay-status$/);
          if (relayStatusMatch && req.method === 'GET') {
            const meterId = decodeURIComponent(relayStatusMatch[1]);
            const meter = activeMeters.get(meterId);
            return sendJson(res, 200, {
              meterId,
              relayState: meter ? meter.relayState : 'ON',
              status: meter ? meter.status : 'UNKNOWN',
            });
          }

          // 4. Remote Relay Command (POST /api/meters/:id/relay)
          const relayCmdMatch = cleanPath.match(/^\/api\/meters\/([^\/]+)\/relay$/);
          if (relayCmdMatch && req.method === 'POST') {
            const meterId = decodeURIComponent(relayCmdMatch[1]);
            const body = await readJsonBody(req);
            const meter = activeMeters.get(meterId);
            if (!meter) {
              return sendJson(res, 404, { error: 'Meter not found' });
            }
            if (body.relayState !== 'ON' && body.relayState !== 'OFF') {
              return sendJson(res, 400, { error: 'relayState must be ON or OFF' });
            }
            meter.relayState = body.relayState;
            meter.updatedAt = new Date().toISOString();
            activeMeters.set(meterId, meter);
            return sendJson(res, 200, { success: true, meterId, relayState: meter.relayState });
          }

          // 5. Get all meters (GET /api/meters)
          if (cleanPath === '/api/meters' && req.method === 'GET') {
            const list = Array.from(activeMeters.values());
            return sendJson(res, 200, { meters: list });
          }

          // 6. Register or Link New Meter (POST /api/meters)
          if (cleanPath === '/api/meters' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const meterId = body.meterId?.trim();
            if (!meterId) {
              return sendJson(res, 400, { error: 'meterId is required' });
            }
            const now = new Date().toISOString();
            const newMeter: Meter = {
              id: meterId,
              meterId,
              ownerUid: body.ownerUid || 'demo_user',
              name: body.name?.trim() || `ESP32 Meter ${meterId}`,
              relayState: 'ON',
              status: 'ONLINE',
              apiKey: body.apiKey || `VP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
              lastHeartbeat: now,
              latitude: Number(body.latitude) || 6.5244,
              longitude: Number(body.longitude) || 3.3792,
              address: body.address || 'Smart Grid Connection Point',
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
              anomalyDescription: 'Newly linked meter awaiting stream',
              createdAt: now,
              updatedAt: now,
            };
            activeMeters.set(meterId, newMeter);
            return sendJson(res, 201, { success: true, meter: newMeter });
          }

          // 7. Get single meter (GET /api/meters/:id)
          const meterDetailMatch = cleanPath.match(/^\/api\/meters\/([^\/]+)$/);
          if (meterDetailMatch && req.method === 'GET') {
            const meterId = decodeURIComponent(meterDetailMatch[1]);
            const meter = activeMeters.get(meterId);
            if (!meter) {
              return sendJson(res, 404, { error: 'Meter not found' });
            }
            return sendJson(res, 200, { meter });
          }

          // 8. Get telemetry history (GET /api/meters/:id/telemetry)
          const meterTelemetryMatch = cleanPath.match(/^\/api\/meters\/([^\/]+)\/telemetry$/);
          if (meterTelemetryMatch && req.method === 'GET') {
            const meterId = decodeURIComponent(meterTelemetryMatch[1]);
            const logs = telemetryStore.get(meterId) || [];
            return sendJson(res, 200, { logs });
          }

          // 9. Get anomalies (GET /api/meters/:id/anomalies)
          const meterAnomaliesMatch = cleanPath.match(/^\/api\/meters\/([^\/]+)\/anomalies$/);
          if (meterAnomaliesMatch && req.method === 'GET') {
            const meterId = decodeURIComponent(meterAnomaliesMatch[1]);
            const alerts = anomalyStore.get(meterId) || [];
            return sendJson(res, 200, { alerts });
          }

          // 10. Resolve anomaly alert (POST /api/meters/:id/anomalies/:alertId/resolve)
          const alertResolveMatch = cleanPath.match(/^\/api\/meters\/([^\/]+)\/anomalies\/([^\/]+)\/resolve$/);
          if (alertResolveMatch && req.method === 'POST') {
            const meterId = decodeURIComponent(alertResolveMatch[1]);
            const alertId = decodeURIComponent(alertResolveMatch[2]);
            const alerts = anomalyStore.get(meterId) || [];
            const alert = alerts.find(a => a.id === alertId);
            if (alert) {
              alert.status = 'RESOLVED';
            }
            const meter = activeMeters.get(meterId);
            if (meter && alerts.filter(a => a.status === 'ACTIVE').length === 0) {
              meter.hasAnomaly = false;
              meter.anomalyType = 'NONE';
              meter.anomalySeverity = 'LOW';
              meter.anomalyDescription = 'Operating normally';
            }
            return sendJson(res, 200, { success: true, alert });
          }

          // 11. Get User Notification Settings (GET /api/users/:userId/settings)
          const userSettingsGetMatch = cleanPath.match(/^\/api\/users\/([^\/]+)\/settings$/);
          if (userSettingsGetMatch && req.method === 'GET') {
            const userId = decodeURIComponent(userSettingsGetMatch[1]);
            const preferences = userPreferencesStore.get(userId) || userPreferencesStore.get('demo_user') || {
              userId,
              emailAlertsEnabled: true,
              alertEmail: 'yinkusben4sure@gmail.com',
              notifyCriticalTheft: true,
              notifyOvercurrentSurge: true,
              notifyVoltageSag: true,
              notifyOfflineHeartbeat: false,
              minimumSeverity: 'HIGH',
              updatedAt: new Date().toISOString(),
            };
            return sendJson(res, 200, { preferences });
          }

          // 12. Save User Notification Settings (POST /api/users/:userId/settings)
          const userSettingsPostMatch = cleanPath.match(/^\/api\/users\/([^\/]+)\/settings$/);
          if (userSettingsPostMatch && req.method === 'POST') {
            const userId = decodeURIComponent(userSettingsPostMatch[1]);
            const body = await readJsonBody(req);
            const preferences: NotificationPreferences = {
              userId,
              emailAlertsEnabled: body.emailAlertsEnabled !== undefined ? Boolean(body.emailAlertsEnabled) : true,
              alertEmail: body.alertEmail || 'yinkusben4sure@gmail.com',
              notifyCriticalTheft: body.notifyCriticalTheft !== undefined ? Boolean(body.notifyCriticalTheft) : true,
              notifyOvercurrentSurge: body.notifyOvercurrentSurge !== undefined ? Boolean(body.notifyOvercurrentSurge) : true,
              notifyVoltageSag: body.notifyVoltageSag !== undefined ? Boolean(body.notifyVoltageSag) : true,
              notifyOfflineHeartbeat: body.notifyOfflineHeartbeat !== undefined ? Boolean(body.notifyOfflineHeartbeat) : false,
              minimumSeverity: body.minimumSeverity || 'HIGH',
              updatedAt: new Date().toISOString(),
            };
            userPreferencesStore.set(userId, preferences);
            return sendJson(res, 200, { success: true, preferences });
          }

          // Any unmatched /api route must return JSON 404, never fallback to index.html
          return sendJson(res, 404, { error: `Endpoint not found: ${req.method} ${cleanPath}` });
        } catch (err: any) {
          console.error('[API Server Error]', err);
          return sendJson(res, 500, { error: err.message || 'Internal server error' });
        }
      });
    },
  };
}
