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

// Server (plain HTTP)
#define SERVER_HOST      "smart-energy-meter-mu.vercel.app"
// #define SERVER_HOST      "vsh.pp.ua"
#define SERVER_PORT      443
#define SERVER_PATH      "/api/telemetry/ingest"
// #define SERVER_PATH      "/TinyGSM/logo.txt"
#define HMAC_SECRET      ""               // non-empty -> adds X-Signature (HMAC-SHA256 hex of body)

#define SEND_INTERVAL_MS 30000UL          // how often to upload (cellular data is costly)

// Modem UART (ESP32 pin names: RX = receives from modem TX)
#define MODEM_RX         12
#define MODEM_TX         13
#define MODEM_BAUD       115200

// TinyGSM modem family. SIM7600 and A7670 (LilyGO T-A7670) use SIM7600.
// Others: TINY_GSM_MODEM_SIM800, TINY_GSM_MODEM_SIM7000, TINY_GSM_MODEM_BG96, ...
#define TINY_GSM_MODEM_SIM7600
#define TINY_GSM_RX_BUFFER 1024

#include <TinyGsmClient.h>
#include <ArduinoHttpClient.h>
#include "mbedtls/md.h"
#include "EnergyMeter.h"

// =============================================================================
//  Globals
// =============================================================================
EnergyMeter meter;

HardwareSerial SerialAT(2);
TinyGsm modem(SerialAT);
TinyGsmClient gsmClient(modem);
HttpClient http(gsmClient, SERVER_HOST, SERVER_PORT);

static QueueHandle_t readingsQ;           // length 1, always holds the latest snapshot

// =============================================================================
//  Meter calibration data  (fill this in after running the calibration wizard)
// =============================================================================
// 1. Flash with the template values below and open the serial monitor (115200).
// 2. Type "cal" and follow the prompts (reference voltmeter / ammeter / wattmeter).
// 3. The wizard prints a block between "copy from here" and "copy to here".
//    Paste those lines over the body of loadCalibration() below and re-flash.
// Nothing is stored in flash by the wizard, so nothing here can be overwritten by
// other storage code. Until you paste real values, readings are NOT accurate.
static void loadCalibration(EnergyMeterCalibration& cal) {
  // ---- TEMPLATE (neutral starting values, not calibrated for your hardware) ----
  // Un=___ V  Ib=___ A  MC=3200 imp/kWh  GL=x24  Vi=___ mV  Vu=___ mV
  cal.meter_constant = 3200;      // imp/kWh
  cal.mmode          = 0x9422;    // MMode: [15:13] = L line current PGA gain (x24)
  cal.pl_const_h     = 0x0015;    // PL_Constant high word
  cal.pl_const_l     = 0xD174;    // PL_Constant low word
  cal.lgain          = 0x0000;    // L line power gain
  cal.lphi           = 0x0000;    // L line phase angle
  cal.ugain          = 0x6720;    // voltage rms gain
  cal.igain_l        = 0x7A13;    // L line current rms gain
  cal.sag_th         = 0x1D6A;    // voltage sag threshold
  // ---- END TEMPLATE ----
}

// =============================================================================
//  Helpers
// =============================================================================
// static void hmacSha256Hex(const char* key, const uint8_t* data, size_t len, char out[65]) {
//   uint8_t mac[32];
//   mbedtls_md_context_t ctx;
//   mbedtls_md_init(&ctx);
//   mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
//   mbedtls_md_hmac_starts(&ctx, (const uint8_t*)key, strlen(key));
//   mbedtls_md_hmac_update(&ctx, data, len);
//   mbedtls_md_hmac_finish(&ctx, mac);
//   mbedtls_md_free(&ctx);
//   for (int i = 0; i < 32; i++) sprintf(out + 2 * i, "%02x", mac[i]);
//   out[64] = '\0';
// }

// static int buildJson(const EnergyReadings& r, int csq, char* buf, size_t n) {
//   return snprintf(buf, n,
//       "{\"device_id\":\"%s\",\"uptime_s\":%lu,"
//       "\"voltage_v\":%.2f,\"current_a\":%.3f,\"active_power_w\":%.1f,"
//       "\"reactive_power_var\":%.1f,\"apparent_power_va\":%.1f,\"power_factor\":%.3f,"
//       "\"phase_angle_deg\":%.1f,\"frequency_hz\":%.2f,"
//       "\"energy_import_wh\":%.3f,\"energy_export_wh\":%.3f,"
//       "\"reactive_fwd_varh\":%.3f,\"reactive_rev_varh\":%.3f,"
//       "\"signal_csq\":%d}",
//       DEVICE_ID, (unsigned long)(millis() / 1000UL),
//       r.voltage_V, r.current_A, r.active_power_W,
//       r.reactive_power_var, r.apparent_power_VA, r.power_factor,
//       r.phase_angle_deg, r.frequency_Hz,
//       r.energy_import_Wh, r.energy_export_Wh,
//       r.reactive_fwd_varh, r.reactive_rev_varh,
//       csq);
// }

static int buildJson(const EnergyReadings& r, int csq, char* buf, size_t n) {
  return snprintf(buf, n,
      "{\"meterId\":\"%s\",\"apiKey\":\"%s\","
      "\"voltage\":%.2f,\"current\":%.3f,\"activePower\":%.2f,"
      "\"powerFactor\":%.3f,\"phaseAngle\":%.1f,\"frequency\":%.2f,"
      "\"relayState\":\"%s\"}",
      DEVICE_ID,
      API_KEY,
      r.voltage_V,
      r.current_A,
      r.active_power_W,
      r.power_factor,
      r.phase_angle_deg,
      r.frequency_Hz,
      "ON");
}

// =============================================================================
//  GSM / HTTP (runs only inside telemetryTask, so blocking calls are fine here)
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

// Returns HTTP status code, or negative on transport failure.
static int postReadings(const char* body, int len) {
  http.beginRequest();
  int err = http.post(SERVER_PATH);
  if (err != 0) {
    http.stop();
    return -1;
  }
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("Content-Length", len);
  http.sendHeader("X-Device-Id", DEVICE_ID);
  // if (HMAC_SECRET[0] != '\0') {
  //   char sig[65];
  //   hmacSha256Hex(HMAC_SECRET, (const uint8_t*)body, (size_t)len, sig);
  //   http.sendHeader("X-Signature", sig);
  // }
  http.beginBody();
  http.write((const uint8_t*)body, (size_t)len);
  http.endRequest();
 
  int status = http.responseStatusCode();
  if (status > 0) http.responseBody();     // drain the response
  http.stop();
  return status;
}

static void telemetryTask(void*) {
  EnergyReadings snap;
  bool have = false;
  uint8_t fails = 0;
  uint32_t lastSend = millis() - SEND_INTERVAL_MS;   // send first snapshot immediately

  http.setHttpResponseTimeout(15000);

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
        lastSend = millis() - (SEND_INTERVAL_MS - 5000UL);   // retry in 5 s
        continue;
      }
    }

    char body[640];
    int n = buildJson(snap, modem.getSignalQuality(), body, sizeof(body));
    if (n <= 0 || n >= (int)sizeof(body)) continue;

    Serial.printf("[HTTP] Body -> %s\n", body);

    int status = postReadings(body, n);
    if (status >= 200 && status < 300) {
      fails = 0;
      lastSend = millis();
      Serial.printf("[http] POST ok (%d)\n", status);
    } else {
      fails++;
      lastSend = millis() - (SEND_INTERVAL_MS - 5000UL);     // retry in 5 s
      Serial.printf("[http] POST failed (%d), fail count %u\n", status, fails);
      if (fails == 3) gsmConnect(false);                     // refresh data session
      if (fails >= 6) { gsmConnect(true); fails = 0; }       // full modem restart
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
  EnergyMeterConfig cfg;                 // defaults; adjust for your hardware
  cfg.pins = {18, 19, 23, 5};            // SCK, MISO, MOSI, CS
  cfg.poll_interval_ms = 1000;
  loadCalibration(cfg.cal);              // calibration values from the template above

  if (!meter.begin(cfg)) {
    Serial.printf("EnergyMeter begin failed: %s\n", meter.lastError());
  }

  meter.enableCalibration(Serial);       // type "cal" in the serial monitor to calibrate

  // ---- Cellular uploader on its own task ----
  SerialAT.begin(MODEM_BAUD, SERIAL_8N1, MODEM_RX, MODEM_TX);
  readingsQ = xQueueCreate(1, sizeof(EnergyReadings));
  xTaskCreatePinnedToCore(telemetryTask, "telemetry", 10240, nullptr, 1, nullptr, tskNO_AFFINITY);
}

void loop() {
  meter.update();                        // never blocks; the modem can't stall it

  if (!meter.calibrating() && meter.state() != lastState) {
    lastState = meter.state();
    // Serial.printf("[meter] state -> %s\n", meter.stateName());
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
    xQueueOverwrite(readingsQ, &r);      // hand the latest snapshot to the uploader
  }
}