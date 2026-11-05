#include <Arduino.h>

// =============================================================================
//  User settings
// =============================================================================
#define DEVICE_ID         "MTR-0001"
#define API_KEY           "VP-FN5WFCBV7E58V"

// Cellular
#define GSM_APN          "web.gprs.mtnnigeria.net"       // your carrier's APN
#define GSM_USER         ""
#define GSM_PASS         ""

// Full HTTPS URL (must start with https:// so Vercel/Cloud Run does not return 308)
#define SERVER_URL       "https://smart-energy-meter-mu.vercel.app/api/telemetry/ingest"

#define SEND_INTERVAL_MS 30000UL          // how often to upload (cellular data is costly)

// Modem UART (ESP32 pin names: RX = receives from modem TX)
#define MODEM_RX         12
#define MODEM_TX         13
#define MODEM_BAUD       115200

// TinyGSM modem family. SIM7600 and A7670 (LilyGO T-A7670) use SIM7600.
#define TINY_GSM_MODEM_SIM7600
// Give the ESP32 idle task time to run while TinyGSM waits for modem responses.
#define TINY_GSM_YIELD_MS 1
#define TINY_GSM_RX_BUFFER 1024

#include <TinyGsmClient.h>
#include "EnergyMeter.h"

// =============================================================================
//  Globals
// =============================================================================
EnergyMeter meter;

HardwareSerial SerialAT(2);
TinyGsm modem(SerialAT);

static QueueHandle_t readingsQ;           // length 1, always holds the latest snapshot

// =============================================================================
//  Meter calibration data
// =============================================================================
static void loadCalibration(EnergyMeterCalibration& cal) {
  cal.meter_constant = 3200;      // imp/kWh
  cal.mmode          = 0x9422;    // MMode: [15:13] = L line current PGA gain (x24)
  cal.pl_const_h     = 0x0015;    // PL_Constant high word
  cal.pl_const_l     = 0xD174;    // PL_Constant low word
  cal.lgain          = 0x0000;    // L line power gain
  cal.lphi           = 0x0000;    // L line phase angle
  cal.ugain          = 0x6720;    // voltage rms gain
  cal.igain_l        = 0x7A13;    // L line current rms gain
  cal.sag_th         = 0x1D6A;    // voltage sag threshold
}

// =============================================================================
//  Helpers
// =============================================================================
static int buildJson(const EnergyReadings& r, int csq, char* buf, size_t n) {
  return snprintf(buf, n,
      "{\"meterId\":\"%s\",\"apiKey\":\"%s\","
      "\"voltage\":%.2f,\"current\":%.3f,\"activePower\":%.2f,"
      "\"apparentPower\":%.2f,\"reactivePower\":%.2f,"
      "\"powerFactor\":%.3f,\"phaseAngle\":%.1f,\"frequency\":%.2f,"
      "\"energy\":%.3f,\"relayState\":\"%s\"}",
      DEVICE_ID,
      API_KEY,
      r.voltage_V,
      r.current_A,
      r.active_power_W,
      r.apparent_power_VA,
      r.reactive_power_var,
      r.power_factor,
      r.phase_angle_deg,
      r.frequency_Hz,
      r.energy_import_Wh / 1000.0f, // Wh -> kWh
      "ON");
}

// =============================================================================
//  GSM / HTTPS via SIM7600 / A7670 Native HTTP(S) AT Engine
// =============================================================================
static bool gsmConnect(bool restartModem) {
  if (restartModem) {
    Serial.println("[gsm] restarting modem...");
    if (!modem.restart()) {
      Serial.println("[gsm] modem not responding (check power, wiring, baud)");
      return false;
    }
  }
  Serial.println("[gsm] waiting for network...");
  if (!modem.waitForNetwork(60000L)) {
    Serial.println("[gsm] no network (check SIM, antenna, coverage)");
    return false;
  }
  Serial.println("[gsm] attaching data session...");
  if (!modem.gprsConnect(GSM_APN, GSM_USER, GSM_PASS)) {
    Serial.println("[gsm] data connect failed (check APN)");
    return false;
  }
  return modem.isGprsConnected();
}

// Performs an HTTPS POST using the SIM7600/A7670 internal SSL/HTTP stack.
// Returns HTTP status code (e.g., 200), or negative on failure.
static int postReadingsHttps(const char* body, int len) {
  // Ensure any previous HTTP session is cleanly closed
  modem.sendAT("+HTTPTERM");
  modem.waitResponse(1000);

  // Initialize HTTP service
  modem.sendAT("+HTTPINIT");
  if (modem.waitResponse(5000) != 1) {
    Serial.println("[https] AT+HTTPINIT failed");
    return -1;
  }
  Serial.println("[https] HTTP session initialized");

  // Set target HTTPS URL (SIM7600/A7670 automatically enables TLS when URL starts with https://)
  modem.sendAT("+HTTPPARA=\"URL\",\"", SERVER_URL, "\"");
  if (modem.waitResponse(5000) != 1) {
    Serial.println("[https] AT+HTTPPARA URL failed");
    modem.sendAT("+HTTPTERM");
    modem.waitResponse(1000);
    return -2;
  }
  Serial.printf("[https] URL set to %s\n", SERVER_URL);

  // Set Content-Type header
  modem.sendAT("+HTTPPARA=\"CONTENT\",\"application/json\"");
  if (modem.waitResponse(5000) != 1) {
    Serial.println("[https] AT+HTTPPARA CONTENT failed");
    modem.sendAT("+HTTPTERM");
    modem.waitResponse(1000);
    return -3;
  }

  // Pass X-API-Key custom header
  modem.sendAT("+HTTPPARA=\"USERDATA\",\"X-API-Key: ", API_KEY, "\\r\\nX-Device-Id: ", DEVICE_ID, "\"");
  modem.waitResponse(2000);
  Serial.println("[https] Custom headers set");

  // Load POST body into modem buffer
  modem.sendAT("+HTTPDATA=", len, ",10000");
  if (modem.waitResponse(5000, "DOWNLOAD") != 1) {
    Serial.println("[https] AT+HTTPDATA did not prompt DOWNLOAD");
    modem.sendAT("+HTTPTERM");
    modem.waitResponse(1000);
    return -4;
  }

  SerialAT.write((const uint8_t*)body, len);
  if (modem.waitResponse(10000) != 1) {
    Serial.println("[https] Payload upload timed out");
    modem.sendAT("+HTTPTERM");
    modem.waitResponse(1000);
    return -5;
  }
  Serial.printf("[https] Payload uploaded (%d bytes)\n", len);

  // Trigger HTTP POST (1 = POST)
  modem.sendAT("+HTTPACTION=1");
  if (modem.waitResponse(3000) != 1) {
    Serial.println("[https] AT+HTTPACTION=1 failed to start");
    modem.sendAT("+HTTPTERM");
    modem.waitResponse(1000);
    return -6;
  }
  Serial.println("[https] HTTP POST started, waiting for response...");

  // Wait for unsolicited result code: +HTTPACTION: 1,<status>,<datalen>
  int status = -7;
  if (modem.waitResponse(30000L, "+HTTPACTION:") == 1) {
    String actionLine = SerialAT.readStringUntil('\n');
    int firstComma = actionLine.indexOf(',');
    int secondComma = actionLine.indexOf(',', firstComma + 1);

    if (firstComma > 0 && secondComma > firstComma) {
      status = actionLine.substring(firstComma + 1, secondComma).toInt();
      int respLen = actionLine.substring(secondComma + 1).toInt();

      if (respLen > 0) {
        modem.sendAT("+HTTPREAD=0,", respLen);
        if (modem.waitResponse(5000, "+HTTPREAD:") == 1) {
          String resp = SerialAT.readStringUntil('\n');
          String payload = SerialAT.readStringUntil('\n');
          Serial.printf("[https] Server response: %s\n", payload.c_str());
        }
      }
    }
  } else {
    Serial.println("[https] Timed out waiting for +HTTPACTION response");
  }

  // Terminate HTTP session
  modem.sendAT("+HTTPTERM");
  modem.waitResponse(1000);

  return status;
}

static void telemetryTask(void*) {
  EnergyReadings snap;
  bool have = false;
  uint8_t fails = 0;
  uint32_t lastSend = millis() - SEND_INTERVAL_MS;

  while (!gsmConnect(true)) {
    Serial.println("[gsm] retrying in 10 s");
    vTaskDelay(pdMS_TO_TICKS(10000));
  }
  Serial.println("[gsm] online");

  for (;;) {
    if (xQueueReceive(readingsQ, &snap, pdMS_TO_TICKS(1000)) == pdTRUE) have = true;
    if (!have) continue;
    if ((uint32_t)(millis() - lastSend) < SEND_INTERVAL_MS) continue;

    if (!modem.isGprsConnected()) {
      Serial.println("[gsm] data session lost, reconnecting");
      if (!gsmConnect(false)) {
        lastSend = millis() - (SEND_INTERVAL_MS - 5000UL);
        continue;
      }
    }

    char body[640];
    int n = buildJson(snap, modem.getSignalQuality(), body, sizeof(body));
    if (n <= 0 || n >= (int)sizeof(body)) continue;

    Serial.printf("[HTTPS] Body -> %s\n", body);

    int status = postReadingsHttps(body, n);
    if (status >= 200 && status < 300) {
      fails = 0;
      lastSend = millis();
      Serial.printf("[https] POST ok (%d)\n", status);
    } else {
      fails++;
      lastSend = millis() - (SEND_INTERVAL_MS - 5000UL);
      Serial.printf("[https] POST failed (%d), fail count %u\n", status, fails);
      if (fails == 3) gsmConnect(false);
      if (fails >= 6) { gsmConnect(true); fails = 0; }
    }
  }
}

// =============================================================================
//  Arduino entry points
// =============================================================================
static uint32_t lastErrCount = 0;
static EnergyMeter::State lastState = EnergyMeter::State::Off;

void setup() {
  Serial.begin(115200);
  delay(200);

  // ---- Meter ----
  EnergyMeterConfig cfg;
  cfg.pins = {18, 19, 23, 5};            // SCK, MISO, MOSI, CS
  cfg.poll_interval_ms = 1000;
  loadCalibration(cfg.cal);

  if (!meter.begin(cfg)) {
    Serial.printf("EnergyMeter begin failed: %s\n", meter.lastError());
  }

  meter.enableCalibration(Serial);

  // ---- Cellular uploader on its own task ----
  SerialAT.begin(MODEM_BAUD, SERIAL_8N1, MODEM_RX, MODEM_TX);
  readingsQ = xQueueCreate(1, sizeof(EnergyReadings));
  xTaskCreatePinnedToCore(telemetryTask, "telemetry", 10240, nullptr, 1, nullptr, tskNO_AFFINITY);
}

void loop() {
  meter.update();

  if (!meter.calibrating() && meter.state() != lastState) {
    lastState = meter.state();
  }
  if (!meter.calibrating() && meter.errorCount() != lastErrCount) {
    lastErrCount = meter.errorCount();
    Serial.printf("[meter] error #%lu: %s\n", (unsigned long)lastErrCount, meter.lastError());
  }

  if (meter.newData() && !meter.calibrating()) {
    const EnergyReadings& r = meter.readings();
    Serial.printf("V=%.2f I=%.3f P=%.0fW PF=%.3f f=%.2fHz E+=%.3fWh\n",
                  r.voltage_V, r.current_A, r.active_power_W,
                  r.power_factor, r.frequency_Hz, r.energy_import_Wh);
    xQueueOverwrite(readingsQ, &r);
  }
}