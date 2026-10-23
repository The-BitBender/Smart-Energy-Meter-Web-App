import React, { useState, useMemo } from 'react';
import { BarChart3, Clock } from 'lucide-react';
import { TelemetryLog } from '../types/energy';

interface HistoricalChartsProps {
  logs: TelemetryLog[];
  meterId: string;
}

type TimeRange = '1h' | '6h' | '24h' | 'all';
type MetricView = 'power_energy' | 'voltage_current';

export const HistoricalCharts: React.FC<HistoricalChartsProps> = ({ logs, meterId }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [metricView, setMetricView] = useState<MetricView>('power_energy');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter logs by selected range
  const filteredLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    const now = Date.now();
    let cutoffMs = 24 * 60 * 60 * 1000;
    if (timeRange === '1h') cutoffMs = 60 * 60 * 1000;
    if (timeRange === '6h') cutoffMs = 6 * 60 * 60 * 1000;
    if (timeRange === 'all') cutoffMs = Infinity;

    return logs
      .filter(l => now - new Date(l.timestamp).getTime() <= cutoffMs)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [logs, timeRange]);

  // Compute summary metrics for the window
  const summary = useMemo(() => {
    if (filteredLogs.length === 0) {
      return { peakPower: 0, minVoltage: 0, maxVoltage: 0, energyDelta: 0, avgCurrent: 0, anomaliesCount: 0 };
    }
    let peakPower = 0;
    let minVoltage = 999;
    let maxVoltage = 0;
    let sumCurrent = 0;
    let anomaliesCount = 0;

    for (const log of filteredLogs) {
      if (log.activePower > peakPower) peakPower = log.activePower;
      if (log.voltage < minVoltage) minVoltage = log.voltage;
      if (log.voltage > maxVoltage) maxVoltage = log.voltage;
      sumCurrent += log.current;
      if (log.hasAnomaly) anomaliesCount++;
    }

    const firstEnergy = filteredLogs[0]?.energy || 0;
    const lastEnergy = filteredLogs[filteredLogs.length - 1]?.energy || 0;
    const energyDelta = Math.max(0, lastEnergy - firstEnergy);
    const avgCurrent = sumCurrent / filteredLogs.length;

    return {
      peakPower,
      minVoltage: minVoltage === 999 ? 0 : minVoltage,
      maxVoltage,
      energyDelta,
      avgCurrent,
      anomaliesCount,
    };
  }, [filteredLogs]);

  // Dimensions for responsive SVG chart
  const width = 800;
  const height = 300;
  const padding = { top: 25, right: 35, bottom: 40, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Chart data calculations
  const chartData = useMemo(() => {
    if (filteredLogs.length === 0) return null;

    const count = filteredLogs.length;
    let minP = 0;
    let maxP = Math.max(1000, ...filteredLogs.map(l => l.activePower * 1.15));
    let minE = Math.min(...filteredLogs.map(l => l.energy));
    let maxE = Math.max(minE + 1, ...filteredLogs.map(l => l.energy));

    let minV = Math.min(180, ...filteredLogs.map(l => l.voltage * 0.95));
    let maxV = Math.max(260, ...filteredLogs.map(l => l.voltage * 1.05));
    let minI = 0;
    let maxI = Math.max(10, ...filteredLogs.map(l => l.current * 1.2));

    const points = filteredLogs.map((log, i) => {
      const x = padding.left + (count === 1 ? chartW / 2 : (i / (count - 1)) * chartW);
      const yPower = padding.top + chartH - ((log.activePower - minP) / (maxP - minP || 1)) * chartH;
      const yEnergy = padding.top + chartH - ((log.energy - minE) / (maxE - minE || 1)) * chartH;
      const yVoltage = padding.top + chartH - ((log.voltage - minV) / (maxV - minV || 1)) * chartH;
      const yCurrent = padding.top + chartH - ((log.current - minI) / (maxI - minI || 1)) * chartH;

      return {
        ...log,
        x,
        yPower,
        yEnergy,
        yVoltage,
        yCurrent,
        timeFormatted: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });

    const powerPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yPower.toFixed(1)}`).join(' ');
    const powerArea = `${powerPath} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

    const energyPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yEnergy.toFixed(1)}`).join(' ');
    const voltagePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yVoltage.toFixed(1)}`).join(' ');
    const currentPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yCurrent.toFixed(1)}`).join(' ');

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

  const activePoint = hoverIndex !== null && chartData ? chartData.points[hoverIndex] : null;

  return (
    <div className="rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg mb-6 text-white transition-all hover:border-white/40">
      
      {/* Top Header & Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/15">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-white" />
            <h3 className="text-base font-bold text-white">Historical Telemetry &amp; Analytics</h3>
          </div>
          <p className="text-xs text-teal-200 mt-0.5">
            Real-time time-series logging from ESP32 • Meter <span className="font-mono text-white font-extrabold">{meterId}</span>
          </p>
        </div>

        {/* View & Range Toggle Pill buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Selector */}
          <div className="flex rounded-lg bg-[#003833] p-1 border border-white/20 text-xs font-semibold">
            <button
              onClick={() => setMetricView('power_energy')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                metricView === 'power_energy' ? 'bg-white text-[#005149] font-extrabold shadow-sm' : 'text-teal-200 hover:text-white'
              }`}
            >
              Power &amp; Energy
            </button>
            <button
              onClick={() => setMetricView('voltage_current')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                metricView === 'voltage_current' ? 'bg-white text-[#005149] font-extrabold shadow-sm' : 'text-teal-200 hover:text-white'
              }`}
            >
              Voltage &amp; Current
            </button>
          </div>

          {/* Time range selector */}
          <div className="flex rounded-lg bg-[#003833] p-1 border border-white/20 text-xs font-mono font-bold">
            {(['1h', '6h', '24h', 'all'] as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  timeRange === r ? 'bg-white text-[#005149] font-black shadow-sm' : 'text-teal-200 hover:text-white'
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
        <div className="p-3.5 rounded-xl bg-[#003d37] border border-white/15">
          <div className="text-[11px] text-teal-200 uppercase font-bold">Peak Power Demand</div>
          <div className="text-xl font-extrabold font-mono text-white mt-0.5">
            {(summary.peakPower / 1000).toFixed(2)} <span className="text-xs font-semibold text-teal-200">kW</span>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#003d37] border border-white/15">
          <div className="text-[11px] text-teal-200 uppercase font-bold">Energy In Window</div>
          <div className="text-xl font-extrabold font-mono text-emerald-300 mt-0.5">
            +{summary.energyDelta.toFixed(3)} <span className="text-xs font-semibold text-teal-200">kWh</span>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#003d37] border border-white/15">
          <div className="text-[11px] text-teal-200 uppercase font-bold">Voltage Bounds</div>
          <div className="text-xl font-extrabold font-mono text-teal-100 mt-0.5">
            {summary.minVoltage.toFixed(0)} - {summary.maxVoltage.toFixed(0)} <span className="text-xs font-semibold text-teal-200">V</span>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#003d37] border border-white/15">
          <div className="text-[11px] text-teal-200 uppercase font-bold">Anomaly Flags</div>
          <div className={`text-xl font-extrabold font-mono mt-0.5 ${summary.anomaliesCount > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
            {summary.anomaliesCount} <span className="text-xs font-semibold text-teal-200">events</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative w-full overflow-hidden bg-[#003833] rounded-xl border border-white/15 p-2">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-teal-200 text-xs">
            <Clock className="w-8 h-8 mb-2 opacity-60 text-teal-300" />
            <p className="font-bold text-white">No telemetry recorded yet in this time window.</p>
            <p className="mt-1 text-teal-200/70">Send telemetry from your ESP32 or the built-in Simulator to plot data.</p>
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
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                </linearGradient>
                {/* Area Gradient for Energy */}
                <linearGradient id="energyGradDominant" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
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
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        fill="#99f6e4"
                        fontSize="10"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        {Math.round(chartData.maxP * (1 - ratio))}W
                      </text>
                    ) : (
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        fill="#99f6e4"
                        fontSize="10"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        {Math.round(chartData.maxV - (chartData.maxV - chartData.minV) * ratio)}V
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Metric View 1: Active Power & Energy */}
              {metricView === 'power_energy' && (
                <>
                  {/* Power Area */}
                  <path d={chartData.powerArea} fill="url(#powerGradDominant)" />
                  {/* Power Stroke line in Crisp White */}
                  <path
                    d={chartData.powerPath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Energy Accumulation Stroke */}
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
                  {/* Voltage Stroke */}
                  <path
                    d={chartData.voltagePath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Current Stroke */}
                  <path
                    d={chartData.currentPath}
                    fill="none"
                    stroke="#2dd4bf"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* Anomaly markers plotted on the timeline */}
              {chartData.points.map((p, i) => {
                if (!p.hasAnomaly) return null;
                return (
                  <g key={`anom-${i}`}>
                    <circle
                      cx={p.x}
                      cy={metricView === 'power_energy' ? p.yPower : p.yVoltage}
                      r="6"
                      fill="#f43f5e"
                      className="animate-ping opacity-75"
                    />
                    <circle
                      cx={p.x}
                      cy={metricView === 'power_energy' ? p.yPower : p.yVoltage}
                      r="4"
                      fill="#f43f5e"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </g>
                );
              })}

              {/* Invisible interactive hover bars across points */}
              {chartData.points.map((p, i) => {
                const segW = chartW / chartData.points.length;
                return (
                  <rect
                    key={`hover-bar-${i}`}
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
                    r="5"
                    fill="#ffffff"
                    stroke="#005149"
                    strokeWidth="2"
                  />
                </g>
              )}

              {/* X-axis time labels */}
              {chartData.points.filter((_, i) => i === 0 || i === Math.floor(chartData.points.length / 2) || i === chartData.points.length - 1).map((p, idx) => (
                <text
                  key={`time-${idx}`}
                  x={p.x}
                  y={height - 12}
                  fill="#99f6e4"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor={idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle'}
                >
                  {p.timeFormatted}
                </text>
              ))}
            </svg>

            {/* Floating Tooltip Card in White with Deep Teal Green Typography */}
            {activePoint && (
              <div 
                className="absolute z-20 top-2 left-1/2 -translate-x-1/2 p-3 rounded-xl bg-white text-[#005149] border border-white shadow-2xl backdrop-blur-md flex items-center space-x-4 text-xs font-mono pointer-events-none"
              >
                <div>
                  <span className="text-slate-500">Time:</span>
                  <div className="font-black text-[#005149]">{activePoint.timeFormatted}</div>
                </div>
                <div className="h-6 w-px bg-slate-200" />
                <div>
                  <span className="text-slate-500 font-bold">Power:</span>
                  <div className="font-black text-[#005149]">{activePoint.activePower.toFixed(0)} W</div>
                </div>
                <div>
                  <span className="text-sky-600 font-bold">Energy:</span>
                  <div className="font-black text-sky-800">{activePoint.energy.toFixed(3)} kWh</div>
                </div>
                <div>
                  <span className="text-amber-600 font-bold">Voltage:</span>
                  <div className="font-black text-amber-800">{activePoint.voltage.toFixed(1)} V</div>
                </div>
                <div>
                  <span className="text-emerald-600 font-bold">Current:</span>
                  <div className="font-black text-emerald-800">{activePoint.current.toFixed(2)} A</div>
                </div>
                {activePoint.hasAnomaly && (
                  <div className="px-2 py-0.5 rounded bg-rose-600 text-white font-sans text-[10px] font-black">
                    THEFT / ANOMALY
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-4 text-teal-100">
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
                <span className="w-3.5 h-1 bg-teal-300 rounded-full"></span>
                <span className="text-teal-200 font-semibold">Load Current (Amperes)</span>
              </div>
            </>
          )}
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
            <span className="text-rose-200 font-medium">Anomaly Point</span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-teal-200/70">
          Showing {filteredLogs.length} time-series data points
        </div>
      </div>

    </div>
  );
};
