import React, { useState, useMemo } from 'react';
import { BarChart3, Clock } from 'lucide-react';
import { TelemetryLog } from '../types/energy';

interface HistoricalChartsProps {
  logs: TelemetryLog[];
  meterId: string;
}

type TimeRange = '1h' | '6h' | '24h' | 'all';
type MetricView = 'power_energy' | 'voltage_current';

function evaluateLogAnomalies(log: TelemetryLog): { hasAnomaly: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const v = Number(log.voltage) || 0;
  const i = Number(log.current) || 0;
  const p = Number(log.activePower) || 0;
  const f = Number(log.frequency) || 0;

  if (log.relayState === 'OFF' && (i > 0.8 || Math.abs(p) > 100)) {
    reasons.push('Relay Bypass');
  }
  if (v >= 250) {
    reasons.push(`Over-voltage (${v.toFixed(1)}V)`);
  } else if (v >= 242) {
    reasons.push(`High Voltage (${v.toFixed(1)}V)`);
  } else if (v > 0 && v < 180) {
    reasons.push(`Critical Sag (${v.toFixed(1)}V)`);
  } else if (v >= 180 && v < 207) {
    reasons.push(`Under-voltage (${v.toFixed(1)}V)`);
  }

  if (i > 42 || p > 9500) {
    reasons.push(`Overcurrent (${i.toFixed(1)}A)`);
  }
  if (i < -0.3 || p < -60) {
    reasons.push(`Reverse Flow (${p.toFixed(0)}W)`);
  }
  if (f > 0 && (f < 47.5 || f > 52.5)) {
    reasons.push(`Freq Deviation (${f.toFixed(2)}Hz)`);
  }
  if (v * i > 800 && p < 40 && i > 3.5) {
    reasons.push('Phase/Neutral Tamper');
  }
  if (log.hasAnomaly && reasons.length === 0) {
    reasons.push('Anomaly Flagged');
  }

  return {
    hasAnomaly: Boolean(log.hasAnomaly || reasons.length > 0),
    reasons,
  };
}

export const HistoricalCharts: React.FC<HistoricalChartsProps> = ({ logs, meterId }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [metricView, setMetricView] = useState<MetricView>('power_energy');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter and deterministically sort logs in ascending chronological order
  const filteredLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    // Deduplicate by ID and sort chronologically (oldest -> newest from left to right)
    const uniqueMap = new Map<string, TelemetryLog>();
    for (const l of logs) {
      if (l && l.id) {
        uniqueMap.set(l.id, l);
      }
    }
    const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
      const tA = new Date(a.timestamp).getTime() || 0;
      const tB = new Date(b.timestamp).getTime() || 0;
      return tA !== tB ? tA - tB : a.id.localeCompare(b.id);
    });

    if (sorted.length === 0 || timeRange === 'all') {
      return sorted;
    }

    const latestTimestamp = new Date(sorted[sorted.length - 1].timestamp).getTime() || Date.now();
    const referenceNow = Math.max(Date.now(), latestTimestamp);

    let cutoffMs = 24 * 60 * 60 * 1000;
    if (timeRange === '1h') cutoffMs = 60 * 60 * 1000;
    if (timeRange === '6h') cutoffMs = 6 * 60 * 60 * 1000;

    const inWindow = sorted.filter((l) => {
      const t = new Date(l.timestamp).getTime();
      return !isNaN(t) && referenceNow - t <= cutoffMs;
    });

    return inWindow.length > 0 ? inWindow : sorted;
  }, [logs, timeRange]);

  // Compute summary metrics for the window
  const summary = useMemo(() => {
    if (filteredLogs.length === 0) {
      return { peakPower: 0, minVoltage: 0, maxVoltage: 0, energyDelta: 0, avgCurrent: 0, anomaliesCount: 0 };
    }
    let peakPower = 0;
    let minVoltage = Infinity;
    let maxVoltage = 0;
    let sumCurrent = 0;
    let anomaliesCount = 0;

    for (const log of filteredLogs) {
      const p = Number(log.activePower) || 0;
      const v = Number(log.voltage) || 0;
      const c = Number(log.current) || 0;
      if (p > peakPower) peakPower = p;
      if (v < minVoltage) minVoltage = v;
      if (v > maxVoltage) maxVoltage = v;
      sumCurrent += c;
      if (evaluateLogAnomalies(log).hasAnomaly) {
        anomaliesCount++;
      }
    }

    const firstEnergy = Number(filteredLogs[0]?.energy) || 0;
    const lastEnergy = Number(filteredLogs[filteredLogs.length - 1]?.energy) || 0;
    const energyDelta = Math.max(0, lastEnergy - firstEnergy);
    const avgCurrent = sumCurrent / filteredLogs.length;

    return {
      peakPower,
      minVoltage: minVoltage === Infinity ? 0 : minVoltage,
      maxVoltage,
      energyDelta,
      avgCurrent,
      anomaliesCount,
    };
  }, [filteredLogs]);

  // Dimensions for responsive SVG chart
  const width = 800;
  const height = 300;
  const padding = { top: 28, right: 52, bottom: 42, left: 58 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Chart data calculations
  const chartData = useMemo(() => {
    if (filteredLogs.length === 0) return null;

    const count = filteredLogs.length;
    const powers = filteredLogs.map((l) => Number(l.activePower) || 0);
    const energies = filteredLogs.map((l) => Number(l.energy) || 0);
    const voltages = filteredLogs.map((l) => Number(l.voltage) || 0);
    const currents = filteredLogs.map((l) => Number(l.current) || 0);

    const minP = Math.min(0, ...powers);
    const maxP = Math.max(500, Math.max(...powers) * 1.15);

    const minE = Math.min(...energies);
    const maxE = Math.max(minE + 0.05, Math.max(...energies) + (Math.max(...energies) - minE) * 0.15);

    const minV = Math.max(0, Math.min(160, Math.min(...voltages) - 15));
    const maxV = Math.max(270, Math.max(...voltages) + 15);

    const minI = Math.min(0, ...currents);
    const maxI = Math.max(10, Math.max(...currents) * 1.2);

    const clampY = (val: number, minVal: number, maxVal: number) => {
      const ratio = (val - minVal) / (maxVal - minVal || 1);
      const clampedRatio = Math.min(1, Math.max(0, ratio));
      return padding.top + chartH - clampedRatio * chartH;
    };

    const points = filteredLogs.map((log, i) => {
      const x = padding.left + (count === 1 ? chartW / 2 : (i / (count - 1)) * chartW);
      const yPower = clampY(Number(log.activePower) || 0, minP, maxP);
      const yEnergy = clampY(Number(log.energy) || 0, minE, maxE);
      const yVoltage = clampY(Number(log.voltage) || 0, minV, maxV);
      const yCurrent = clampY(Number(log.current) || 0, minI, maxI);
      const anomEval = evaluateLogAnomalies(log);

      return {
        ...log,
        hasAnomaly: anomEval.hasAnomaly,
        anomalyReasons: anomEval.reasons,
        x,
        yPower,
        yEnergy,
        yVoltage,
        yCurrent,
        timeFormatted: new Date(log.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
    });

    const buildLinePath = (key: 'yPower' | 'yEnergy' | 'yVoltage' | 'yCurrent') => {
      if (points.length === 1) {
        const y = points[0][key].toFixed(1);
        return `M ${padding.left.toFixed(1)} ${y} L ${(padding.left + chartW).toFixed(1)} ${y}`;
      }
      return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p[key].toFixed(1)}`).join(' ');
    };

    const powerPath = buildLinePath('yPower');
    const firstX = points.length === 1 ? padding.left : points[0].x;
    const lastX = points.length === 1 ? padding.left + chartW : points[points.length - 1].x;
    const powerArea = `${powerPath} L ${lastX.toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${firstX.toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

    const energyPath = buildLinePath('yEnergy');
    const voltagePath = buildLinePath('yVoltage');
    const currentPath = buildLinePath('yCurrent');

    return {
      points,
      powerPath,
      powerArea,
      energyPath,
      voltagePath,
      currentPath,
      maxP,
      minP,
      maxE,
      minE,
      maxV,
      minV,
      maxI,
      minI,
    };
  }, [filteredLogs, chartW, chartH]);

  const activePoint = hoverIndex !== null && chartData && chartData.points[hoverIndex]
    ? chartData.points[hoverIndex]
    : null;

  return (
    <div className="rounded-2xl bg-[#1e373e] border border-white/20 p-5 shadow-lg mb-6 text-white transition-all hover:border-white/40">
      
      {/* Top Header & Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/15">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-white" />
            <h3 className="text-base font-bold text-white">Historical Telemetry &amp; Analytics</h3>
          </div>
          <p className="text-xs text-white/75 mt-0.5">
            Real-time time-series logging from ESP32 • Meter <span className="font-mono text-white font-extrabold">{meterId}</span>
          </p>
        </div>

        {/* View & Range Toggle Pill buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Selector */}
          <div className="flex rounded-lg bg-[#112327] p-1 border border-white/20 text-xs font-semibold">
            <button
              onClick={() => setMetricView('power_energy')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                metricView === 'power_energy' ? 'bg-white text-[#112327] font-extrabold shadow-sm' : 'text-white/75 hover:text-white'
              }`}
            >
              Power &amp; Energy
            </button>
            <button
              onClick={() => setMetricView('voltage_current')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                metricView === 'voltage_current' ? 'bg-white text-[#112327] font-extrabold shadow-sm' : 'text-white/75 hover:text-white'
              }`}
            >
              Voltage &amp; Current
            </button>
          </div>

          {/* Time range selector */}
          <div className="flex rounded-lg bg-[#112327] p-1 border border-white/20 text-xs font-mono font-bold">
            {(['1h', '6h', '24h', 'all'] as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === r ? 'bg-white text-[#112327] font-black shadow-sm' : 'text-white/75 hover:text-white'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <div className="p-3.5 rounded-xl bg-[#1a2d31] border border-white/15">
          <div className="text-[11px] text-white/75 uppercase font-bold">Peak Power Demand</div>
          <div className="text-xl font-extrabold font-mono text-white mt-0.5">
            {(summary.peakPower / 1000).toFixed(2)} <span className="text-xs font-semibold text-white/70">kW</span>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#1a2d31] border border-white/15">
          <div className="text-[11px] text-white/75 uppercase font-bold">Energy In Window</div>
          <div className="text-xl font-extrabold font-mono text-emerald-300 mt-0.5">
            +{summary.energyDelta.toFixed(3)} <span className="text-xs font-semibold text-white/70">kWh</span>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#1a2d31] border border-white/15">
          <div className="text-[11px] text-white/75 uppercase font-bold">Voltage Bounds</div>
          <div className="text-xl font-extrabold font-mono text-white mt-0.5">
            {summary.minVoltage.toFixed(0)} - {summary.maxVoltage.toFixed(0)} <span className="text-xs font-semibold text-white/70">V</span>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#1a2d31] border border-white/15">
          <div className="text-[11px] text-white/75 uppercase font-bold">Anomaly Flags</div>
          <div className={`text-xl font-extrabold font-mono mt-0.5 ${summary.anomaliesCount > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
            {summary.anomaliesCount} <span className="text-xs font-semibold text-white/70">events</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative w-full overflow-hidden bg-[#112327] rounded-xl border border-white/15 p-2">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/75 text-xs">
            <Clock className="w-8 h-8 mb-2 opacity-60 text-white/80" />
            <p className="font-bold text-white">No telemetry recorded yet in this time window.</p>
            <p className="mt-1 text-white/60">Send telemetry from your ESP32 or the built-in Simulator to plot data.</p>
          </div>
        ) : chartData ? (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto select-none"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                {/* Area Gradient for Active Power */}
                <linearGradient id="powerGradDominant" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines & Dual Y-Axis Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padding.top + chartH * ratio;
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={width - padding.right}
                      y2={y}
                      stroke="rgba(255, 255, 255, 0.12)"
                      strokeDasharray="4 4"
                    />
                    {metricView === 'power_energy' ? (
                      <>
                        <text
                          x={padding.left - 8}
                          y={y + 4}
                          fill="#ffffff"
                          fillOpacity="0.75"
                          fontSize="10"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {Math.round(chartData.maxP - (chartData.maxP - chartData.minP) * ratio)}W
                        </text>
                        <text
                          x={width - padding.right + 6}
                          y={y + 4}
                          fill="#38bdf8"
                          fillOpacity="0.8"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="start"
                        >
                          {(chartData.maxE - (chartData.maxE - chartData.minE) * ratio).toFixed(2)}
                        </text>
                      </>
                    ) : (
                      <>
                        <text
                          x={padding.left - 8}
                          y={y + 4}
                          fill="#ffffff"
                          fillOpacity="0.75"
                          fontSize="10"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {Math.round(chartData.maxV - (chartData.maxV - chartData.minV) * ratio)}V
                        </text>
                        <text
                          x={width - padding.right + 6}
                          y={y + 4}
                          fill="#38bdf8"
                          fillOpacity="0.8"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="start"
                        >
                          {(chartData.maxI - (chartData.maxI - chartData.minI) * ratio).toFixed(1)}A
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* Metric View 1: Active Power & Energy */}
              {metricView === 'power_energy' && (
                <>
                  <path d={chartData.powerArea} fill="url(#powerGradDominant)" />
                  <path
                    d={chartData.powerPath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={chartData.energyPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Metric View 2: Voltage & Current */}
              {metricView === 'voltage_current' && (
                <>
                  <path
                    d={chartData.voltagePath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={chartData.currentPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* Standard & Anomaly Data Point Nodes */}
              {chartData.points.map((p, i) => {
                const primaryY = metricView === 'power_energy' ? p.yPower : p.yVoltage;
                const secondaryY = metricView === 'power_energy' ? p.yEnergy : p.yCurrent;

                if (p.hasAnomaly) {
                  return (
                    <g key={`pt-anom-${p.id}-${i}`}>
                      {/* Vertical anomaly indicator line */}
                      <line
                        x1={p.x}
                        y1={padding.top}
                        x2={p.x}
                        y2={padding.top + chartH}
                        stroke="rgba(244, 63, 94, 0.35)"
                        strokeWidth="1.5"
                        strokeDasharray="2 3"
                      />
                      {/* Secondary curve anomaly marker */}
                      <circle
                        cx={p.x}
                        cy={secondaryY}
                        r="4"
                        fill="#f43f5e"
                        stroke="#ffffff"
                        strokeWidth="1.2"
                      />
                      {/* Primary curve pulsing anomaly marker */}
                      <circle
                        cx={p.x}
                        cy={primaryY}
                        r="7"
                        fill="#f43f5e"
                        fillOpacity="0.35"
                      />
                      <circle
                        cx={p.x}
                        cy={primaryY}
                        r="5"
                        fill="#f43f5e"
                        stroke="#ffffff"
                        strokeWidth="1.8"
                      />
                    </g>
                  );
                }

                return (
                  <g key={`pt-norm-${p.id}-${i}`}>
                    <circle
                      cx={p.x}
                      cy={primaryY}
                      r="3"
                      fill="#ffffff"
                      stroke="#112327"
                      strokeWidth="1.2"
                    />
                  </g>
                );
              })}

              {/* Invisible interactive hover bars across points */}
              {chartData.points.map((p, i) => {
                const segW = Math.max(16, chartW / Math.max(1, chartData.points.length));
                return (
                  <rect
                    key={`hover-bar-${p.id}-${i}`}
                    x={p.x - segW / 2}
                    y={padding.top}
                    width={segW}
                    height={chartH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoverIndex(i)}
                  />
                );
              })}

              {/* Active hover crosshair */}
              {activePoint && (
                <g pointerEvents="none">
                  <line
                    x1={activePoint.x}
                    y1={padding.top}
                    x2={activePoint.x}
                    y2={padding.top + chartH}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={activePoint.x}
                    cy={metricView === 'power_energy' ? activePoint.yPower : activePoint.yVoltage}
                    r="6"
                    fill={activePoint.hasAnomaly ? '#f43f5e' : '#ffffff'}
                    stroke="#112327"
                    strokeWidth="2"
                  />
                </g>
              )}

              {/* X-axis time labels */}
              {(() => {
                const pts = chartData.points;
                if (pts.length === 1) {
                  return (
                    <text
                      x={pts[0].x}
                      y={height - 12}
                      fill="#ffffff"
                      fillOpacity="0.85"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {pts[0].timeFormatted}
                    </text>
                  );
                }
                const indices = Array.from(
                  new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])
                );
                return indices.map((idxPos, labelIdx) => {
                  const p = pts[idxPos];
                  if (!p) return null;
                  return (
                    <text
                      key={`time-${idxPos}`}
                      x={p.x}
                      y={height - 12}
                      fill="#ffffff"
                      fillOpacity="0.75"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor={
                        idxPos === 0
                          ? 'start'
                          : idxPos === pts.length - 1
                          ? 'end'
                          : labelIdx === 1
                          ? 'middle'
                          : 'middle'
                      }
                    >
                      {p.timeFormatted}
                    </text>
                  );
                });
              })()}
            </svg>

            {/* Floating Tooltip Card in White */}
            {activePoint && (
              <div
                className="absolute z-20 top-2 left-1/2 -translate-x-1/2 px-3.5 py-2.5 rounded-xl bg-white text-[#112327] border border-white shadow-2xl flex flex-wrap items-center gap-3 text-xs font-mono pointer-events-none max-w-[95%]"
              >
                <div>
                  <span className="text-slate-500">Time:</span>
                  <div className="font-black text-[#112327]">{activePoint.timeFormatted}</div>
                </div>
                <div className="h-6 w-px bg-slate-200" />
                <div>
                  <span className="text-slate-500 font-bold">Power:</span>
                  <div className="font-black text-[#112327]">{Number(activePoint.activePower).toFixed(0)} W</div>
                </div>
                <div>
                  <span className="text-sky-600 font-bold">Energy:</span>
                  <div className="font-black text-sky-800">{Number(activePoint.energy).toFixed(3)} kWh</div>
                </div>
                <div>
                  <span className="text-amber-600 font-bold">Voltage:</span>
                  <div className="font-black text-amber-800">{Number(activePoint.voltage).toFixed(1)} V</div>
                </div>
                <div>
                  <span className="text-emerald-600 font-bold">Current:</span>
                  <div className="font-black text-emerald-800">{Number(activePoint.current).toFixed(2)} A</div>
                </div>
                <div>
                  <span className="text-purple-600 font-bold">Freq:</span>
                  <div className="font-black text-purple-800">{Number(activePoint.frequency || 50).toFixed(2)} Hz</div>
                </div>
                {activePoint.hasAnomaly && (
                  <div className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-sans text-[10px] font-black tracking-wide">
                    {activePoint.anomalyReasons && activePoint.anomalyReasons.length > 0
                      ? `ANOMALY: ${activePoint.anomalyReasons.join(' + ')}`
                      : 'THEFT / ANOMALY'}
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-4 text-white/90">
          {metricView === 'power_energy' ? (
            <>
              <div className="flex items-center space-x-1.5">
                <span className="w-3.5 h-1 bg-white rounded-full"></span>
                <span className="text-white font-bold">Active Real Power (Watts)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-3.5 h-1 bg-sky-300 border-b border-dashed border-sky-300"></span>
                <span className="text-sky-200 font-semibold">Accumulated Energy (kWh)</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center space-x-1.5">
                <span className="w-3.5 h-1 bg-white rounded-full"></span>
                <span className="text-white font-bold">Line Voltage (Volts RMS)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-3.5 h-1 bg-sky-300 rounded-full"></span>
                <span className="text-white/80 font-semibold">Load Current (Amperes)</span>
              </div>
            </>
          )}
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 border border-white"></span>
            <span className="text-rose-200 font-bold">Anomaly Point ({summary.anomaliesCount})</span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-white/60">
          Showing {filteredLogs.length} time-series data {filteredLogs.length === 1 ? 'point' : 'points'}
        </div>
      </div>

    </div>
  );
};
