#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ---- Configure these ----
const char* WIFI_SSID     = "anshul";
const char* WIFI_PASSWORD = "Rask@d802";
const char* API_HOST      = "172.16.1.2";   // your PC's LAN IP, not "localhost"
const uint16_t API_PORT   = 3000;
const char* DEVICE_TOKEN  = "a8Rj289dpLesiLTADuWV4klzjQQYY0Fu";

const unsigned long POST_INTERVAL_MS = 10000; // send every 10s
unsigned long lastPostAt = 0;

void connectWifi() {
  Serial.printf("Connecting to WiFi '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nConnected. IP: %s\n", WiFi.localIP().toString().c_str());
}

// Replace this with a real sensor read (DHT22, BMP280, etc.) when ready.
float readTemperature() { return 20.0 + (float)random(0, 100) / 10.0; }
float readHumidity()    { return 40.0 + (float)random(0, 200) / 10.0; }

bool postTelemetry() {
  HTTPClient http;
  String url = String("http://") + API_HOST + ":" + API_PORT + "/api/v1/device/telemetry";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  char body[160];
  snprintf(body, sizeof(body),
    "{\"values\":{\"temp\":%.1f,\"humidity\":%.1f,\"online\":true}}",
    readTemperature(), readHumidity());

  int status = http.POST(body);

  // status < 0 means the request itself failed (couldn't connect, timed out, etc.)
  if (status < 0) {
    Serial.printf("POST %s failed: %s\n", url.c_str(), http.errorToString(status).c_str());
    http.end();
    return false;
  }

  if (status != 204) {
    Serial.printf("POST %s -> %d\n", url.c_str(), status);
    Serial.println(http.getString()); // print the error body if something's wrong
    http.end();
    return false;
  }

  Serial.printf("POST %s -> %d, sent: %s\n", url.c_str(), status, body);
  http.end();
  return true;
}

void setup() {
  Serial.begin(115200);
  Serial.println("\nDeviceESPS3 starting...");
  delay(300);
  connectWifi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  if (millis() - lastPostAt >= POST_INTERVAL_MS) {
    lastPostAt = millis();
    postTelemetry();
  }
}