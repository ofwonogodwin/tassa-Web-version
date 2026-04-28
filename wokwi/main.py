import machine
import network
import time
import urequests
import ujson


# -----------------------------
# TAASA IoT Config
# -----------------------------
WIFI_SSID = "Wokwi-GUEST"
WIFI_PASSWORD = ""

# Render deployment base URL
BASE_URL = "https://tassa-web-version.onrender.com"

REGISTER_ENDPOINT = BASE_URL + "/register"
RIDERS_ENDPOINT = BASE_URL + "/riders"
LOCATION_ENDPOINT = BASE_URL + "/location"
SOS_ENDPOINT = BASE_URL + "/sos"

RIDER_ID = 1
RIDER_NAME = "wokwi-rider-01"
RIDER_PLATE = "WKW 001"
RIDER_AREA = "Kampala"
RIDER_PASSWORD = "1234"
POST_INTERVAL_MS = 5000
SOS_DEBOUNCE_MS = 350
SOS_RETRY_COUNT = 3
SOS_RETRY_DELAY_MS = 600

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


def do_post(url, payload):
    try:
        response = urequests.post(url, json=payload)
        code = response.status_code
        body = response.text
        response.close()
        print("POST", url, code, body)
        return 200 <= code < 300
    except Exception as exc:
        print("POST failed:", url, exc)
        return False


def do_get(url):
    try:
        response = urequests.get(url)
        code = response.status_code
        body = response.text
        response.close()
        print("GET", url, code, body)
        return code, body
    except Exception as exc:
        print("GET failed:", url, exc)
        return 0, ""


def ensure_rider():
    global RIDER_ID

    register_payload = {
        "name": RIDER_NAME,
        "plate_number": RIDER_PLATE,
        "area": RIDER_AREA,
        "password": RIDER_PASSWORD,
    }
    try:
        response = urequests.post(REGISTER_ENDPOINT, json=register_payload)
        code = response.status_code
        body_text = response.text
        rider_data = response.json() if code == 200 else None
        response.close()
        print("REGISTER", code, body_text)
        if rider_data and "id" in rider_data:
            RIDER_ID = int(rider_data["id"])
            print("Using rider_id:", RIDER_ID)
            return True
    except Exception as exc:
        print("REGISTER failed:", exc)

    # Rider might already exist. Try lookup by name.
    code, body = do_get(RIDERS_ENDPOINT)
    if code == 200:
        riders = ujson.loads(body)
        for rider in riders:
            if rider.get("name") == RIDER_NAME:
                RIDER_ID = int(rider.get("id", RIDER_ID))
                print("Found existing rider_id:", RIDER_ID)
                return True

    print("Could not auto-resolve rider. Using configured RIDER_ID:", RIDER_ID)
    return False


def post_location_and_status(lat, lon, sos_pressed):
    led.on()
    try:
        if sos_pressed:
            return do_post(
                SOS_ENDPOINT,
                {"rider_id": RIDER_ID, "latitude": lat, "longitude": lon},
            )
        return do_post(
            LOCATION_ENDPOINT,
            {"rider_id": RIDER_ID, "latitude": lat, "longitude": lon},
        )
    finally:
        led.off()


def trigger_sos_request():
    global last_sos_ms, sos_pending
    now = time.ticks_ms()
    if time.ticks_diff(now, last_sos_ms) < SOS_DEBOUNCE_MS:
        return
    last_sos_ms = now
    sos_pending = True


def button_irq_handler(pin):
    # Active-low button, only trigger when physically pressed.
    if pin.value() == 0:
        trigger_sos_request()


def setup_button_interrupt():
    button.irq(trigger=machine.Pin.IRQ_FALLING, handler=button_irq_handler)


def send_sos_with_retry(lat, lon):
    for attempt in range(1, SOS_RETRY_COUNT + 1):
        ok = post_location_and_status(lat, lon, True)
        if ok:
            print("SOS sent successfully (attempt %d)" % attempt)
            return True
        print("SOS send failed (attempt %d/%d)" % (attempt, SOS_RETRY_COUNT))
        time.sleep_ms(SOS_RETRY_DELAY_MS)
    return False


def main():
    global sos_pending
    wlan = connect_wifi()
    ensure_rider()
    setup_button_interrupt()
    last_periodic_ms = time.ticks_ms()
    prev_pressed = False

    while True:
        if not wlan.isconnected():
            wlan = connect_wifi()

        read_gps()

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
            post_location_and_status(lat, lon, False)
            last_periodic_ms = time.ticks_ms()

        time.sleep_ms(100)


main()
