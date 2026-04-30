import machine
import network
import time
import urequests


# -----------------------------
# TAASA IoT Config
# -----------------------------
WIFI_SSID = "Wokwi-GUEST"
WIFI_PASSWORD = ""


# Render deployment base URL
BASE_URL = "https://tassa-web-version.onrender.com"

LOGIN_ENDPOINT = BASE_URL + "/login"
IOT_INGEST_ENDPOINT = BASE_URL + "/iot/ingest"

# Use an EXISTING rider account from your web system (do not auto-register here).
RIDER_LOGIN_NAME = "Godwin Ofwono"
RIDER_LOGIN_PASSWORD = "#Ofwono23##"
RIDER_ID = None
DEVICE_ID = "esp32-wokwi-01"
# Must match TAASA_IOT_DEVICE_TOKEN in your backend environment variables.
IOT_DEVICE_TOKEN = "tassa-iot-device-token123"
POST_INTERVAL_MS = 5000
SOS_DEBOUNCE_MS = 350
SOS_RETRY_COUNT = 3
SOS_RETRY_DELAY_MS = 600
LED_ON_AFTER_SOS_MS = 120000  # 2 minutes

# If no GPS fix yet, use a Kampala default so SOS still reaches dashboard.
DEFAULT_LAT = 0.3476
DEFAULT_LON = 32.5825


# -----------------------------
# Hardware
# -----------------------------
# Red LED: GPIO2 -> LED Anode, LED Cathode -> 220R -> GND
led = machine.Pin(2, machine.Pin.OUT)

# Green SOS button: one side GPIO4, other side GND (active low, internal pull-up)
button = machine.Pin(4, machine.Pin.IN, machine.Pin.PULL_UP)

# GPS on UART2: RX2=GPIO16, TX2=GPIO17
gps_uart = machine.UART(2, baudrate=9600, tx=17, rx=16)


# -----------------------------
# Runtime state
# -----------------------------
latest_lat = None
latest_lon = None
last_sos_ms = 0
sos_pending = False
led_on_until_ms = 0


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if wlan.isconnected():
        return wlan

    print("Connecting to WiFi:", WIFI_SSID)
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)
    while not wlan.isconnected():
        time.sleep_ms(200)
    print("WiFi connected:", wlan.ifconfig())
    return wlan


def nmea_to_decimal(raw_value, hemisphere):
    if not raw_value:
        return None
    try:
        value = float(raw_value)
    except Exception:
        return None
    degrees = int(value // 100)
    minutes = value - (degrees * 100)
    decimal = degrees + (minutes / 60.0)
    if hemisphere in ("S", "W"):
        decimal = -decimal
    return decimal


def parse_nmea_line(line):
    global latest_lat, latest_lon

    # Recommended Minimum Navigation Information
    if line.startswith("$GPRMC") or line.startswith("$GNRMC"):
        parts = line.split(",")
        if len(parts) > 6 and parts[2] == "A":
            lat = nmea_to_decimal(parts[3], parts[4])
            lon = nmea_to_decimal(parts[5], parts[6])
            if lat is not None and lon is not None:
                latest_lat, latest_lon = lat, lon
                return

    # Global Positioning Fix Data
    if line.startswith("$GPGGA") or line.startswith("$GNGGA"):
        parts = line.split(",")
        if len(parts) > 6 and parts[6] and parts[6] != "0":
            lat = nmea_to_decimal(parts[2], parts[3])
            lon = nmea_to_decimal(parts[4], parts[5])
            if lat is not None and lon is not None:
                latest_lat, latest_lon = lat, lon


def read_gps():
    while gps_uart.any():
        data = gps_uart.readline()
        if not data:
            break
        try:
            line = data.decode("utf-8").strip()
            if line:
                parse_nmea_line(line)
        except Exception:
            # Skip malformed UART frames
            pass


def current_coords():
    if latest_lat is None or latest_lon is None:
        return DEFAULT_LAT, DEFAULT_LON
    return latest_lat, latest_lon


def do_post(url, payload, headers=None):
    try:
        response = urequests.post(url, json=payload, headers=headers)
        code = response.status_code
        body = response.text
        response.close()
        print("POST", url, code, body)
        return 200 <= code < 300
    except Exception as exc:
        print("POST failed:", url, exc)
        return False


def login_existing_rider():
    global RIDER_ID

    if RIDER_LOGIN_NAME.startswith("set-") or RIDER_LOGIN_PASSWORD.startswith("set-"):
        print("Set RIDER_LOGIN_NAME and RIDER_LOGIN_PASSWORD to an existing rider account.")
        return False

    login_payload = {"name": RIDER_LOGIN_NAME, "password": RIDER_LOGIN_PASSWORD}
    try:
        response = urequests.post(LOGIN_ENDPOINT, json=login_payload)
        code = response.status_code
        body_text = response.text
        login_data = response.json() if code == 200 else None
        response.close()
        print("LOGIN", code, body_text)

        if login_data and login_data.get("success") and login_data.get("rider"):
            RIDER_ID = int(login_data["rider"]["id"])
            print("Connected to rider account. rider_id:", RIDER_ID)
            return True
    except Exception as exc:
        print("LOGIN failed:", exc)

    print("Could not login existing rider account.")
    return False


def post_iot_event(lat, lon, event_name):
    if RIDER_ID is None:
        print("Skipping IoT post: rider is not connected.")
        return False

    return do_post(
        IOT_INGEST_ENDPOINT,
        {
            "rider_id": RIDER_ID,
            "latitude": lat,
            "longitude": lon,
            "event": event_name,
            "device_id": DEVICE_ID,
        },
        headers={"x-device-token": IOT_DEVICE_TOKEN},
    )


def extend_led_window():
    global led_on_until_ms
    now = time.ticks_ms()
    led_on_until_ms = time.ticks_add(now, LED_ON_AFTER_SOS_MS)
    led.on()


def refresh_led_state():
    # Keep LED on for the configured SOS window without blocking loop/network.
    if time.ticks_diff(led_on_until_ms, time.ticks_ms()) > 0:
        led.on()
    else:
        led.off()


def trigger_sos_request():
    global last_sos_ms, sos_pending
    now = time.ticks_ms()
    if time.ticks_diff(now, last_sos_ms) < SOS_DEBOUNCE_MS:
        return
    last_sos_ms = now
    sos_pending = True
    extend_led_window()


def button_irq_handler(pin):
    # Active-low button, only trigger when physically pressed.
    if pin.value() == 0:
        trigger_sos_request()


def setup_button_interrupt():
    button.irq(trigger=machine.Pin.IRQ_FALLING, handler=button_irq_handler)


def send_sos_with_retry(lat, lon):
    for attempt in range(1, SOS_RETRY_COUNT + 1):
        ok = post_iot_event(lat, lon, "sos")
        if ok:
            print("SOS sent successfully (attempt %d)" % attempt)
            return True
        print("SOS send failed (attempt %d/%d)" % (attempt, SOS_RETRY_COUNT))
        time.sleep_ms(SOS_RETRY_DELAY_MS)
    return False


def main():
    global sos_pending
    wlan = connect_wifi()
    while not login_existing_rider():
        time.sleep_ms(3000)
    setup_button_interrupt()
    last_periodic_ms = time.ticks_ms()
    prev_pressed = False

    while True:
        if not wlan.isconnected():
            wlan = connect_wifi()

        read_gps()
        refresh_led_state()

        # Backup polling path (in addition to IRQ), for maximum reliability in simulation.
        pressed = (button.value() == 0)
        if pressed and not prev_pressed:
            trigger_sos_request()
        prev_pressed = pressed

        if sos_pending:
            lat, lon = current_coords()
            sos_pending = False
            send_sos_with_retry(lat, lon)
            # Avoid immediate periodic send right after SOS
            last_periodic_ms = time.ticks_ms()

        periodic_due = time.ticks_diff(time.ticks_ms(), last_periodic_ms) >= POST_INTERVAL_MS
        if periodic_due:
            lat, lon = current_coords()
            post_iot_event(lat, lon, "location")
            last_periodic_ms = time.ticks_ms()

        time.sleep_ms(100)


main()
