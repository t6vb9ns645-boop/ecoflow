#!/usr/bin/env python3
"""
EcoFlow PowerStream & Delta 3 Datentracker - GitHub Actions Version
Verwendet EcoFlow Open Platform API v2 (iot-open/sign/...)
"""

import requests
import csv
import os
import sys
import time
import hashlib
import hmac
import random
from datetime import datetime

# =============================================================================
# KONFIGURATION
# =============================================================================

ECOFLOW_ACCESS_KEY = os.environ.get("ECOFLOW_ACCESS_KEY", "")
ECOFLOW_SECRET_KEY = os.environ.get("ECOFLOW_SECRET_KEY", "")
POWERSTREAM_SN = os.environ.get("POWERSTREAM_SN", "")
DELTA3_SN = os.environ.get("DELTA3_SN", "")

ECOFLOW_API_BASE = "https://api-e.ecoflow.com"
CSV_FILENAME = "ecoflow_energie_daten.csv"
CSV_FIELDNAMES = [
    "timestamp", "pv1_watt", "pv2_watt", "ac_house_watt",
    "battery_soc_percent", "battery_power_watt", "total_pv_wh_daily"
]

# =============================================================================
# LOGGING
# =============================================================================

def log(level, message):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {level}: {message}")

# =============================================================================
# VALIDIERUNG
# =============================================================================

def validate_config():
    missing = []
    if not ECOFLOW_ACCESS_KEY: missing.append("ECOFLOW_ACCESS_KEY")
    if not ECOFLOW_SECRET_KEY: missing.append("ECOFLOW_SECRET_KEY")
    if not POWERSTREAM_SN:     missing.append("POWERSTREAM_SN")
    if not DELTA3_SN:          missing.append("DELTA3_SN")
    if missing:
        log("ERROR", f"Fehlende GitHub Secrets: {', '.join(missing)}")
        return False
    log("INFO", "✓ Alle Secrets vorhanden")
    return True

# =============================================================================
# AUTHENTIFIZIERUNG (EcoFlow Open Platform v2)
# =============================================================================

def generate_nonce():
    return str(random.randint(100000, 999999))

def generate_signature(access_key, secret_key, nonce, timestamp, query_params=None):
    # GET requests: sign only auth params (no URL query params)
    sign_str = f"accessKey={access_key}&nonce={nonce}&timestamp={timestamp}"
    log("DEBUG", f"Sign string: accessKey=***&nonce={nonce}&timestamp={timestamp}")
    return hmac.new(
        secret_key.encode("utf-8"),
        sign_str.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

# =============================================================================
# API ABFRAGE
# =============================================================================

def query_device(sn, device_name):
    """Fragt alle Gerätewerte über EcoFlow Open Platform ab."""
    try:
        timestamp = str(int(time.time() * 1000))
        nonce = generate_nonce()
        sign = generate_signature(ECOFLOW_ACCESS_KEY, ECOFLOW_SECRET_KEY, nonce, timestamp)

        headers = {
            "accessKey": ECOFLOW_ACCESS_KEY,
            "timestamp": timestamp,
            "nonce": nonce,
            "sign": sign,
            "Content-Type": "application/json",
        }

        url = f"{ECOFLOW_API_BASE}/iot-open/sign/device/quota/all?sn={sn}"
        log("INFO", f"→ Frage {device_name} ab ({sn})")

        response = requests.get(url, headers=headers, timeout=15)
        log("INFO", f"HTTP Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            code = str(data.get("code", ""))
            log("INFO", f"API Code: {code} | Message: {data.get('message', 'n/a')}")

            if code == "0":
                result = data.get("data", {})
                log("INFO", f"✓ {device_name}: {len(result)} Felder empfangen")

                # Debug: alle Felder ausgeben (wichtig für Feldnamen-Diagnose)
                log("DEBUG", f"--- {device_name} ROHDATEN ---")
                for key in sorted(result.keys()):
                    log("DEBUG", f"  {key} = {result[key]}")
                log("DEBUG", f"--- ENDE {device_name} ---")

                return result
            else:
                log("ERROR", f"API Fehler: {data}")
                return {}
        else:
            log("ERROR", f"HTTP {response.status_code}: {response.text[:300]}")
            return {}

    except requests.exceptions.Timeout:
        log("ERROR", f"{device_name} Timeout")
        return {}
    except Exception as e:
        log("ERROR", f"{device_name} Fehler: {e}")
        return {}

# =============================================================================
# DATENEXTRAKTION
# =============================================================================

def safe_float(value, divisor=1):
    """Konvertiert Wert sicher zu float, mit optionalem Divisor."""
    try:
        return round(float(value) / divisor, 1)
    except (TypeError, ValueError):
        return 0.0

def extract_powerstream(data):
    """
    Extrahiert PowerStream-Werte.
    Feldnamen der EcoFlow Open Platform für PowerStream (HMI):
      20_1.pv1InputWatts  - PV1 Eingangsleistung (W)
      20_1.pv2InputWatts  - PV2 Eingangsleistung (W)
      20_1.invOutputWatts - Wechselrichter Ausgang zum Hausnetz (W)
    Fallback auf alternative Schreibweisen falls API-Version abweicht.
    """
    pv1 = (data.get("20_1.pv1InputWatts")
            or data.get("pv1InputWatts")
            or data.get("inv.pv1Power")
            or 0)

    pv2 = (data.get("20_1.pv2InputWatts")
            or data.get("pv2InputWatts")
            or data.get("inv.pv2Power")
            or 0)

    ac = (data.get("20_1.invOutputWatts")
          or data.get("invOutputWatts")
          or data.get("20_1.outputWatts")
          or data.get("inv.acPower")
          or 0)

    log("INFO", f"PowerStream Rohwerte: pv1={pv1}, pv2={pv2}, ac={ac}")
    return {
        "pv1_watt": safe_float(pv1, divisor=10),
        "pv2_watt": safe_float(pv2, divisor=10),
        "ac_house_watt": safe_float(ac, divisor=10),
    }

def extract_delta3(data):
    """
    Extrahiert Delta 3 / Delta 3 Plus Batteriewerte.
    Feldnamen je nach Gerätegeneration:
      bmsMaster.soc        - Ladestand (%)
      pd.wattsInSum        - Ladeleistung (W)
      pd.wattsOutSum       - Entladeleistung (W)
    """
    soc = (data.get("bmsMaster.soc")
           or data.get("bms_bmsStatus.soc")
           or data.get("bms.soc")
           or 0)

    power_in  = safe_float(data.get("pd.wattsInSum") or data.get("bmsMaster.inputWatts") or 0)
    power_out = safe_float(data.get("pd.wattsOutSum") or data.get("bmsMaster.outputWatts") or 0)
    # Netto: positiv = laden, negativ = entladen
    battery_power = power_in - power_out if (power_in or power_out) else safe_float(data.get("bms.power") or 0)

    log("INFO", f"Delta 3 Rohwerte: soc={soc}, power_in={power_in}, power_out={power_out}")
    return {
        "battery_soc_percent": safe_float(soc),
        "battery_power_watt": battery_power,
    }

# =============================================================================
# TAGESERZEUGUNG
# =============================================================================

def calculate_daily_energy(csv_file):
    """Berechnet Tageserzeugung aus CSV (PV-Wh seit Mitternacht)."""
    if not os.path.exists(csv_file):
        return 0.0
    today = datetime.now().strftime("%Y-%m-%d")
    total = 0.0
    try:
        with open(csv_file, "r") as f:
            for row in csv.DictReader(f):
                if row.get("timestamp", "").startswith(today):
                    try:
                        total += (float(row.get("pv1_watt", 0)) + float(row.get("pv2_watt", 0))) / 60
                    except ValueError:
                        pass
    except Exception as e:
        log("ERROR", f"Energieberechnung Fehler: {e}")
    return round(total, 2)

# =============================================================================
# CSV
# =============================================================================

def append_to_csv(data, csv_file):
    file_exists = os.path.isfile(csv_file)
    try:
        with open(csv_file, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            if not file_exists:
                writer.writeheader()
            writer.writerow(data)
        log("INFO", f"💾 Gespeichert: {data}")
    except Exception as e:
        log("ERROR", f"CSV Fehler: {e}")

# =============================================================================
# MAIN
# =============================================================================

def main():
    log("INFO", "=" * 60)
    log("INFO", "EcoFlow Datentracker - GitHub Actions")
    log("INFO", "=" * 60)

    if not validate_config():
        sys.exit(1)

    ps_data = query_device(POWERSTREAM_SN, "PowerStream")
    d3_data = query_device(DELTA3_SN, "Delta 3")

    ps = extract_powerstream(ps_data)
    d3 = extract_delta3(d3_data)

    timestamp = datetime.now().isoformat(timespec="seconds")
    daily_wh = calculate_daily_energy(CSV_FILENAME)

    row = {
        "timestamp": timestamp,
        "pv1_watt": ps["pv1_watt"],
        "pv2_watt": ps["pv2_watt"],
        "ac_house_watt": ps["ac_house_watt"],
        "battery_soc_percent": d3["battery_soc_percent"],
        "battery_power_watt": d3["battery_power_watt"],
        "total_pv_wh_daily": daily_wh,
    }

    append_to_csv(row, CSV_FILENAME)

    log("INFO", "")
    log("INFO", f"PV1: {ps['pv1_watt']} W | PV2: {ps['pv2_watt']} W | AC-Haus: {ps['ac_house_watt']} W")
    log("INFO", f"Batterie: {d3['battery_soc_percent']} % | {d3['battery_power_watt']} W")
    log("INFO", f"Tageserzeugung: {daily_wh} Wh")
    log("INFO", "✅ Fertig")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        log("ERROR", f"Kritischer Fehler: {e}")
        sys.exit(1)
