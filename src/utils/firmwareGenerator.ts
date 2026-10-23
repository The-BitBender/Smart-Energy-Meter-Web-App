export interface FirmwareConfig {
  meterId: string;
  apiKey: string;
  wifiSsid: string;
  wifiPassword: string;
  serverUrl: string;
  relayPin: number;
  reportIntervalSec: number;
  usePzem: boolean;
  useGps: boolean;
}

export function generateArduinoEsp32Code(config: FirmwareConfig): string {
  const {
    meterId,
    apiKey,
    wifiSsid,
    wifiPassword,
    serverUrl,
    relayPin,
    reportIntervalSec,
    usePzem,
    useGps,
  } = config;

  return `/*
 * VoltPulse ESP32 Smart Energy Meter & Remote Relay Controller
 * Target: ESP32 Dev Module / ESP32-WROOM-32 / ESP32-S3
 * Meter ID: ${meterId}
 * 
 * Dependencies (install via Arduino Library Manager):
 * 1. ArduinoJson (by Benoit Blanchon, v6.x or v7.x)
 * 2. PZEM004Tv30 (by Mandar Joshi) - Optional if using PZEM sensor
 * 3. TinyGPS++ (by Mikal Hart) - Optional if using GPS module
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

${usePzem ? `// PZEM-004T v3.0 AC Energy Sensor
#include <PZEM004Tv30.h>
// Hardware Serial 2 pins: RX2 = GPIO 16, TX2 = GPIO 17
PZEM004Tv30 pzem(Serial2, 16, 17);
` : `// Simulated/ADC Sampling Configuration
const int VOLTAGE_ADC_PIN = 34; // ZMPT101B AC Voltage Sensor
const int CURRENT_ADC_PIN = 35; // ACS712 / CT Sensor
`}
${useGps ? `// GPS Module (NEO-6M / NEO-M8N) on Serial1
#include <TinyGPS++.h>
TinyGPSPlus gps;
HardwareSerial gpsSerial(1); // RX = GPIO 4, TX = GPIO 2
` : ''}
// Configuration & Credentials
const char* WIFI_SSID     = "${wifiSsid || 'YOUR_WIFI_SSID'}";
const char* WIFI_PASSWORD = "${wifiPassword || 'YOUR_WIFI_PASSWORD'}";
const char* SERVER_URL    = "${serverUrl || 'https://your-app-domain.run.app'}/api/telemetry/ingest";
const char* METER_ID      = "${meterId}";
const char* API_KEY       = "${apiKey}";

// Hardware Pins
const int RELAY_PIN       = ${relayPin}; // Active HIGH relay or Optocoupler
const int STATUS_LED_PIN  = 2;  // Onboard Blue LED

// Timing
unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL_MS = ${reportIntervalSec * 1000};

// State Variables
bool relayState = true;
float cumulativeEnergyKWh = 12.45; // Stored accumulation

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\\n==========================================");
  Serial.println("  VoltPulse IoT ESP32 Smart Energy Meter  ");
  Serial.println("==========================================");
  Serial.print("Device Meter ID: ");
  Serial.println(METER_ID);

  // Configure Output Pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // Default ON
  digitalWrite(STATUS_LED_PIN, LOW);

  ${useGps ? `gpsSerial.begin(9600, SERIAL_8N1, 4, 2); // GPS baud rate\n` : ''}
  // Connect to WiFi
  connectWiFi();
}

void loop() {
  // Maintain WiFi
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  ${useGps ? `// Read GPS stream
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
` : ''}
  // Transmit telemetry periodically
  if (millis() - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = millis();
    sendTelemetry();
  }

  delay(20);
}

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\n[WiFi] Connected! IP address: " + WiFi.localIP().toString());
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    Serial.println("\\n[WiFi] Connection timeout. Retrying next cycle...");
  }
}

void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  float voltage = 0.0;
  float current = 0.0;
  float activePower = 0.0;
  float reactivePower = 0.0;
  float powerFactor = 0.98;
  float frequency = 50.0;
  float energy = cumulativeEnergyKWh;

  ${usePzem ? `// Read from physical PZEM-004T v3.0 module
  voltage = pzem.voltage();
  current = pzem.current();
  activePower = pzem.power();
  energy = pzem.energy();
  frequency = pzem.frequency();
  powerFactor = pzem.pf();

  if (isnan(voltage)) {
    Serial.println("[PZEM] Error reading sensor. Using fallback values.");
    voltage = 230.0;
    current = 0.0;
    activePower = 0.0;
  }
` : `// Reading from ADC / simulated sample
  // Replace with your calibrated ADC conversion logic:
  voltage = 228.5 + (random(-30, 30) / 10.0);
  current = (relayState) ? (4.2 + (random(-8, 8) / 10.0)) : 0.0;
  powerFactor = 0.96;
  activePower = voltage * current * powerFactor;
  frequency = 50.01 + (random(-5, 5) / 100.0);
  
  // Apparent Power S = V * I; Reactive Power Q = sqrt(S^2 - P^2)
  float apparentPower = voltage * current;
  if (apparentPower >= activePower) {
    reactivePower = sqrt((apparentPower * apparentPower) - (activePower * activePower));
  }
  
  // Accumulate energy (kWh): Power(W) * dt(h) / 1000
  if (relayState) {
    cumulativeEnergyKWh += (activePower * (${reportIntervalSec}.0 / 3600.0)) / 1000.0;
  }
  energy = cumulativeEnergyKWh;
`}
  // GPS Coordinates
  float lat = 6.5244;
  float lng = 3.3792;
  ${useGps ? `if (gps.location.isValid()) {
    lat = gps.location.lat();
    lng = gps.location.lng();
  }
` : ''}
  // Construct JSON Payload
  StaticJsonDocument<512> doc;
  doc["meterId"] = METER_ID;
  doc["apiKey"] = API_KEY;
  doc["voltage"] = round(voltage * 100.0) / 100.0;
  doc["current"] = round(current * 100.0) / 100.0;
  doc["activePower"] = round(activePower * 10.0) / 10.0;
  doc["reactivePower"] = round(reactivePower * 10.0) / 10.0;
  doc["powerFactor"] = round(powerFactor * 100.0) / 100.0;
  doc["frequency"] = round(frequency * 100.0) / 100.0;
  doc["energy"] = round(energy * 1000.0) / 1000.0;
  doc["relayState"] = relayState ? "ON" : "OFF";
  doc["latitude"] = lat;
  doc["longitude"] = lng;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // Send HTTP POST to VoltPulse Server
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  Serial.println("[HTTP] Sending Telemetry payload: " + jsonPayload);
  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Code %d | Response: %s\\n", httpResponseCode, response.c_str());

    // Parse remote commands from server (e.g., remote relay trip)
    StaticJsonDocument<256> respDoc;
    DeserializationError error = deserializeJson(respDoc, response);
    if (!error) {
      if (respDoc.containsKey("relayState")) {
        const char* cmdRelay = respDoc["relayState"];
        bool desiredRelay = (strcmp(cmdRelay, "ON") == 0);
        if (desiredRelay != relayState) {
          relayState = desiredRelay;
          digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
          Serial.printf(">> [RELAY] Remote state changed to: %s\\n", relayState ? "ON (LIVE)" : "OFF (TRIPPED)");
        }
      }
    }
  } else {
    Serial.printf("[HTTP] Error sending telemetry: %s\\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}
`;
}

export function generateMicroPythonCode(config: FirmwareConfig): string {
  return `# VoltPulse MicroPython Firmware for ESP32
import urequests, ujson, utime, machine, network

METER_ID = "${config.meterId}"
API_KEY = "${config.apiKey}"
SERVER_URL = "${config.serverUrl || 'https://your-domain.run.app'}/api/telemetry/ingest"
WIFI_SSID = "${config.wifiSsid || 'YOUR_WIFI_SSID'}"
WIFI_PASSWORD = "${config.wifiPassword || 'YOUR_WIFI_PASSWORD'}"

relay_pin = machine.Pin(${config.relayPin}, machine.Pin.OUT)
relay_pin.value(1) # Default ON
relay_state = "ON"
energy_acc = 14.2

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print("Connecting to WiFi...")
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        while not wlan.isconnected():
            utime.sleep_ms(300)
    print("WiFi connected! IP:", wlan.ifconfig()[0])

connect_wifi()

while True:
    payload = {
        "meterId": METER_ID,
        "apiKey": API_KEY,
        "voltage": 231.2,
        "current": 5.4 if relay_state == "ON" else 0.0,
        "activePower": 1220.0 if relay_state == "ON" else 0.0,
        "reactivePower": 180.0,
        "powerFactor": 0.98,
        "frequency": 50.0,
        "energy": energy_acc,
        "relayState": relay_state,
        "latitude": 6.5244,
        "longitude": 3.3792
    }
    try:
        res = urequests.post(SERVER_URL, json=payload, headers={"Content-Type": "application/json", "X-API-Key": API_KEY})
        print("Response:", res.status_code, res.text)
        data = res.json()
        if "relayState" in data:
            relay_state = data["relayState"]
            relay_pin.value(1 if relay_state == "ON" else 0)
        res.close()
    except Exception as e:
        print("Telemetry error:", e)
    
    utime.sleep(${config.reportIntervalSec})
`;
}
