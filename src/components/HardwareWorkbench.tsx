import React, { useState } from 'react';
import { 
  Cpu, 
  Send, 
  Copy, 
  Check, 
  Terminal, 
  Sliders, 
  Zap, 
  ShieldAlert, 
  Code2, 
  FileCode2 
} from 'lucide-react';
import { Meter } from '../types/energy';
import { generateArduinoEsp32Code, generateMicroPythonCode } from '../utils/firmwareGenerator';

interface HardwareWorkbenchProps {
  meter: Meter;
  onSendTelemetry: (payload: any) => Promise<any>;
}

export const HardwareWorkbench: React.FC<HardwareWorkbenchProps> = ({
  meter,
  onSendTelemetry,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'simulator' | 'firmware'>('simulator');
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [serialLogs, setSerialLogs] = useState<string[]>([
    `[BOOT] ESP32 WROOM-32 initialized. Chip Rev 1.0.`,
    `[SYSTEM] VoltPulse IoT Firmware v2.4 online.`,
    `[WIFI] Connected to local AP. IP: 192.168.1.142`,
    `[SENSOR] PZEM-004T v3.0 hardware serial stream ready on RX2/TX2.`,
    `[METER] Bound to Meter ID: ${meter.meterId}`,
  ]);

  // Simulator controls
  const [simVoltage, setSimVoltage] = useState(231.4);
  const [simCurrent, setSimCurrent] = useState(12.5);
  const [simPF, setSimPF] = useState(0.97);
  const [simFreq, setSimFreq] = useState(50.02);

  // Firmware customizer
  const [wifiSsid, setWifiSsid] = useState('Home_Solar_Grid');
  const [wifiPass, setWifiPass] = useState('SuperSecretPass123');
  const [serverUrl, setServerUrl] = useState(typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.run.app');
  const [codeType, setCodeType] = useState<'arduino' | 'micropython'>('arduino');

  // Trigger quick simulation scenario
  const handlePresetScenario = (scenario: 'normal' | 'heavy' | 'theft_shunt' | 'reverse' | 'voltage_sag') => {
    if (scenario === 'normal') {
      setSimVoltage(230.2);
      setSimCurrent(5.4);
      setSimPF(0.98);
      setSimFreq(50.01);
    } else if (scenario === 'heavy') {
      setSimVoltage(228.0);
      setSimCurrent(26.8);
      setSimPF(0.94);
      setSimFreq(49.98);
    } else if (scenario === 'theft_shunt') {
      setSimVoltage(232.0);
      setSimCurrent(0.0);
      setSimPF(0.12);
      setSimFreq(50.0);
    } else if (scenario === 'reverse') {
      setSimVoltage(234.5);
      setSimCurrent(-8.5);
      setSimPF(0.98);
      setSimFreq(50.15);
    } else if (scenario === 'voltage_sag') {
      setSimVoltage(182.4);
      setSimCurrent(31.2);
      setSimPF(0.89);
      setSimFreq(48.9);
    }
  };

  const handleTransmitSimulation = async () => {
    setIsSending(true);
    const activePower = Math.round(simVoltage * simCurrent * simPF * 10) / 10;
    const apparent = Math.abs(simVoltage * simCurrent);
    const reactivePower = Math.round(Math.sqrt(Math.max(0, apparent * apparent - activePower * activePower)) * 10) / 10;

    const payload = {
      meterId: meter.meterId,
      apiKey: meter.apiKey,
      voltage: simVoltage,
      current: simCurrent,
      activePower,
      reactivePower,
      powerFactor: simPF,
      frequency: simFreq,
      energy: Math.round((meter.totalEnergy + 0.015) * 1000) / 1000,
      relayState: meter.relayState,
      latitude: meter.latitude,
      longitude: meter.longitude,
      address: meter.address,
    };

    const timestamp = new Date().toLocaleTimeString();
    setSerialLogs(prev => [
      `[${timestamp}] TX -> POST /api/telemetry/ingest [V=${simVoltage}V, I=${simCurrent}A, P=${activePower}W, PF=${simPF}]`,
      ...prev.slice(0, 15),
    ]);

    try {
      const res = await onSendTelemetry(payload);
      const isAnomaly = res?.anomalyDetected;
      setSerialLogs(prev => [
        `[${timestamp}] RX <- HTTP 200 OK | RelayCmd: ${res?.relayState || meter.relayState} | ${isAnomaly ? 'ANOMALY FLAGGED: ' + res?.anomaly?.title : 'Status: Normal'}`,
        ...prev.slice(0, 15),
      ]);
    } catch (err: any) {
      setSerialLogs(prev => [
        `[${timestamp}] RX <- Error transmitting: ${err.message}`,
        ...prev.slice(0, 15),
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const generatedCode = codeType === 'arduino'
    ? generateArduinoEsp32Code({
        meterId: meter.meterId,
        apiKey: meter.apiKey,
        wifiSsid,
        wifiPassword: wifiPass,
        serverUrl,
        relayPin: 26,
        reportIntervalSec: 5,
        usePzem: true,
        useGps: true,
      })
    : generateMicroPythonCode({
        meterId: meter.meterId,
        apiKey: meter.apiKey,
        wifiSsid,
        wifiPassword: wifiPass,
        serverUrl,
        relayPin: 26,
        reportIntervalSec: 5,
        usePzem: false,
        useGps: false,
      });

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Selector: Simulator vs Firmware Generator */}
      <div className="flex items-center space-x-2 border-b border-white/15 pb-3">
        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'simulator'
              ? 'bg-white text-[#005149] font-extrabold shadow-md'
              : 'text-teal-200 hover:text-white hover:bg-white/10'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Interactive ESP32 Sensor Simulator</span>
        </button>

        <button
          onClick={() => setActiveSubTab('firmware')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'firmware'
              ? 'bg-white text-[#005149] font-extrabold shadow-md'
              : 'text-teal-200 hover:text-white hover:bg-white/10'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>Firmware Code Generator (Arduino / MicroPython)</span>
        </button>
      </div>

      {activeSubTab === 'simulator' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left: Simulation Controls & Presets */}
          <div className="lg:col-span-7 rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg text-white">
            <div className="flex items-center justify-between pb-3 border-b border-white/15">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-teal-200" />
                  <span>Hardware Telemetry Test Bench</span>
                </h3>
                <p className="text-xs text-teal-200 mt-0.5">
                  Inject live electrical signals into the real backend to test anomaly alerts
                </p>
              </div>

              <span className="text-[11px] font-mono text-white font-extrabold px-2.5 py-0.5 rounded bg-[#003833] border border-white/20">
                Target: {meter.meterId}
              </span>
            </div>

            {/* Quick 1-Click Simulation Scenarios */}
            <div className="my-4">
              <label className="text-xs font-bold text-teal-200 uppercase tracking-wider block mb-2">
                1-Click Preset Ingestion Scenarios:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handlePresetScenario('normal')}
                  className="p-3 rounded-xl bg-[#003d37] hover:bg-[#004841] border border-white/15 text-left transition-colors shadow-xs"
                >
                  <div className="text-xs font-bold text-emerald-300">Normal Household</div>
                  <div className="text-[10px] text-teal-200 font-mono mt-0.5">230V • 5.4A • 1.2 kW</div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetScenario('heavy')}
                  className="p-3 rounded-xl bg-[#003d37] hover:bg-[#004841] border border-white/15 text-left transition-colors shadow-xs"
                >
                  <div className="text-xs font-bold text-white">Industrial HVAC</div>
                  <div className="text-[10px] text-teal-200 font-mono mt-0.5">228V • 26.8A • 5.7 kW</div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetScenario('theft_shunt')}
                  className="p-3 rounded-xl bg-rose-950/70 hover:bg-rose-900/70 border border-rose-400/40 text-left transition-colors shadow-xs"
                >
                  <div className="text-xs font-bold text-rose-300 flex items-center space-x-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>Theft: Shunt Bypass</span>
                  </div>
                  <div className="text-[10px] text-rose-200 font-mono mt-0.5">232V • 0.0A (CT drop)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetScenario('reverse')}
                  className="p-3 rounded-xl bg-purple-950/70 hover:bg-purple-900/70 border border-purple-400/40 text-left transition-colors shadow-xs"
                >
                  <div className="text-xs font-bold text-purple-200">Reverse Grid Inflow</div>
                  <div className="text-[10px] text-purple-300 font-mono mt-0.5">234V • -8.5A (-2 kW)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetScenario('voltage_sag')}
                  className="p-3 rounded-xl bg-amber-950/70 hover:bg-amber-900/70 border border-amber-400/40 text-left transition-colors shadow-xs"
                >
                  <div className="text-xs font-bold text-amber-300">Severe Voltage Sag</div>
                  <div className="text-[10px] text-amber-200 font-mono mt-0.5">182V • 31.2A (High Tap)</div>
                </button>

                <div className="p-3 rounded-xl bg-[#003833] border border-white/15 text-left flex flex-col justify-center">
                  <div className="text-[11px] text-teal-200 font-medium">Relay Output</div>
                  <div className={`text-xs font-bold font-mono ${meter.relayState === 'ON' ? 'text-emerald-300' : 'text-rose-400'}`}>
                    {meter.relayState === 'ON' ? 'ENERGIZED (ON)' : 'TRIPPED (OFF)'}
                  </div>
                </div>
              </div>
            </div>

            {/* Fine Tuning Sliders */}
            <div className="space-y-4 pt-2 border-t border-white/15">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-teal-200 font-semibold">Line Voltage:</span>
                  <span className="font-bold text-white">{simVoltage.toFixed(1)} V</span>
                </div>
                <input
                  type="range"
                  min="160"
                  max="280"
                  step="0.5"
                  value={simVoltage}
                  onChange={e => setSimVoltage(parseFloat(e.target.value))}
                  className="w-full accent-white h-2 bg-[#003833] rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-teal-200 font-semibold">Load Amperage (Current):</span>
                  <span className="font-bold text-white">{simCurrent.toFixed(1)} A</span>
                </div>
                <input
                  type="range"
                  min="-15"
                  max="45"
                  step="0.2"
                  value={simCurrent}
                  onChange={e => setSimCurrent(parseFloat(e.target.value))}
                  className="w-full accent-white h-2 bg-[#003833] rounded-lg cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-teal-200 font-semibold">Power Factor:</span>
                    <span className="font-bold text-white">{simPF.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.01"
                    value={simPF}
                    onChange={e => setSimPF(parseFloat(e.target.value))}
                    className="w-full accent-white h-2 bg-[#003833] rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-teal-200 font-semibold">Frequency:</span>
                    <span className="font-bold text-white">{simFreq.toFixed(2)} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="46"
                    max="54"
                    step="0.05"
                    value={simFreq}
                    onChange={e => setSimFreq(parseFloat(e.target.value))}
                    className="w-full accent-white h-2 bg-[#003833] rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Calculated active power display */}
            <div className="mt-4 p-3 rounded-xl bg-[#003833] border border-white/15 flex items-center justify-between text-xs font-mono">
              <span className="text-teal-200 font-bold">Calculated Active Power:</span>
              <span className="font-black text-white text-base">
                {(simVoltage * simCurrent * simPF).toFixed(0)} Watts
              </span>
            </div>

            {/* Send button */}
            <div className="mt-5">
              <button
                type="button"
                onClick={handleTransmitSimulation}
                disabled={isSending}
                className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-xl bg-white hover:bg-teal-50 text-[#005149] font-black text-xs transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                <Send className={`w-4 h-4 ${isSending ? 'animate-bounce' : ''}`} />
                <span>{isSending ? 'Transmitting to /api/telemetry/ingest...' : 'Transmit Live Telemetry Sample'}</span>
              </button>
            </div>
          </div>

          {/* Right: ESP32 UART Serial Monitor Terminal */}
          <div className="lg:col-span-5 rounded-2xl bg-[#002220] border border-white/20 p-4 shadow-xl flex flex-col h-[480px]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2 text-xs font-mono text-teal-200 font-bold">
                <Terminal className="w-4 h-4 text-emerald-300" />
                <span>ESP32 Virtual Serial Monitor (115200 baud)</span>
              </div>
              <button
                onClick={() => setSerialLogs([])}
                className="text-[11px] text-teal-300 hover:text-white font-mono"
              >
                Clear
              </button>
            </div>

            {/* Terminal Feed */}
            <div className="flex-1 overflow-y-auto mt-3 font-mono text-[11px] space-y-1.5 pr-1">
              {serialLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`leading-relaxed break-all ${
                    log.includes('ANOMALY')
                      ? 'text-rose-300 font-bold'
                      : log.includes('TX ->')
                      ? 'text-teal-200'
                      : log.includes('RX <-')
                      ? 'text-emerald-300 font-semibold'
                      : 'text-teal-400'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-white/10 text-[10px] font-mono text-teal-300 flex justify-between items-center">
              <span>Endpoint: POST /api/telemetry/ingest</span>
              <span className="text-emerald-400 font-bold">READY</span>
            </div>
          </div>

        </div>
      ) : (
        /* Tab 2: Firmware Code Generator */
        <div className="rounded-2xl bg-[#005149] border border-white/20 p-5 shadow-lg text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/15">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <FileCode2 className="w-4 h-4 text-teal-200" />
                <span>Ready-to-Flash ESP32 Firmware Source Code</span>
              </h3>
              <p className="text-xs text-teal-200 mt-0.5">
                Copy and flash directly via Arduino IDE, PlatformIO, or Thonny IDE
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex rounded-lg bg-[#003833] p-1 border border-white/20 text-xs font-semibold">
                <button
                  onClick={() => setCodeType('arduino')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    codeType === 'arduino' ? 'bg-white text-[#005149] font-black shadow-xs' : 'text-teal-200 hover:text-white'
                  }`}
                >
                  Arduino C++ (.ino)
                </button>
                <button
                  onClick={() => setCodeType('micropython')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    codeType === 'micropython' ? 'bg-white text-[#005149] font-black shadow-xs' : 'text-teal-200 hover:text-white'
                  }`}
                >
                  MicroPython (.py)
                </button>
              </div>

              <button
                onClick={handleCopyCode}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-white hover:bg-teal-50 text-[#005149] text-xs font-black transition-all shadow-md"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#005149]" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          {/* Quick Firmware Customizer Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 p-4 rounded-xl bg-[#003d37] border border-white/15 text-xs">
            <div>
              <label className="text-[11px] font-bold text-teal-200 uppercase">WiFi SSID</label>
              <input
                type="text"
                value={wifiSsid}
                onChange={e => setWifiSsid(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#004841] border border-white/30 text-white font-mono text-xs focus:outline-none focus:border-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-teal-200 uppercase">WiFi Password</label>
              <input
                type="text"
                value={wifiPass}
                onChange={e => setWifiPass(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#004841] border border-white/30 text-white font-mono text-xs focus:outline-none focus:border-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-teal-200 uppercase">VoltPulse Server URL</label>
              <input
                type="text"
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#004841] border border-white/30 text-white font-mono text-xs focus:outline-none focus:border-white"
              />
            </div>
          </div>

          {/* Code Viewer Box */}
          <div className="relative rounded-xl overflow-hidden border border-white/20 bg-[#002220]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#002824] border-b border-white/10 text-xs font-mono text-teal-200">
              <span className="text-white font-bold">{codeType === 'arduino' ? 'esp32_smart_meter.ino' : 'main.py'}</span>
              <span>API Key: {meter.apiKey}</span>
            </div>
            <pre className="p-4 text-xs font-mono text-teal-100 overflow-x-auto max-h-[460px] leading-relaxed">
              <code>{generatedCode}</code>
            </pre>
          </div>

          {/* Pinout Guide */}
          <div className="mt-4 p-4 rounded-xl bg-[#003d37] border border-white/15 text-xs text-white">
            <h4 className="font-bold text-white mb-2 flex items-center space-x-1.5">
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Recommended ESP32 Hardware Wiring:</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-[11px]">
              <div className="p-2.5 rounded-lg bg-[#003833] border border-white/15">
                <span className="text-white font-bold">PZEM-004T v3.0:</span> RX &rarr; GPIO 17, TX &rarr; GPIO 16 (Serial2)
              </div>
              <div className="p-2.5 rounded-lg bg-[#003833] border border-white/15">
                <span className="text-emerald-300 font-bold">Relay Module:</span> IN &rarr; GPIO 26 (Optocoupler Breaker)
              </div>
              <div className="p-2.5 rounded-lg bg-[#003833] border border-white/15">
                <span className="text-purple-300 font-bold">NEO-6M GPS:</span> RX &rarr; GPIO 2, TX &rarr; GPIO 4 (Serial1)
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
