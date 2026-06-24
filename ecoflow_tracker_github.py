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
DELTA3_SN = os.environ.get("DELTA3_SN", "")  # optional

ECOFLOW_API_BASE = "https://api-e.ecoflow.com"
CSV_FILENAME = "docs/ecoflow_energie_daten.csv"

# Bump this whenever CSV_FIELDNAMES changes — triggers automatic migration.
CSV_SCHEMA_VERSION = 2

CSV_FIELDNAMES = [
    "timestamp", "pv1_watt", "pv2_watt", "ac_house_watt",
    "battery_soc_percent", "battery_power_watt", "total_pv_wh_daily",
    # v2: extended metrics
    "pv1_temp_c", "pv2_temp_c", "inv_temp_c",
    "grid_cons_watt", "inv_to_plug_watt", "permanent_watt", "pv_to_inv_watt",
    "pv1_volt", "pv2_volt", "inv_volt",
    "bat_lower_limit", "bat_upper_limit", "wifi_rssi",
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
    # DELTA3_SN is optional — no check here
    if missing:
        log("ERROR", f"Fehlende GitHub Secrets: {', '.join(missing)}")
        return False
    log("INFO", f"✓ Konfiguration OK (DELTA3_SN: {'gesetzt' if DELTA3_SN else 'nicht gesetzt, wird übersprungen'})")
    return True

# =============================================================================
# AUTHENTIFIZIERUNG (EcoFlow Open Platform v2)
# =============================================================================

def generate_nonce():
    return str(random.randint(100000, 999999))

def generate_signature(access_key, secret_key, nonce, timestamp):
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

def get_field(data, *keys, default=0):
    """
    Gibt den Wert des ersten Schlüssels zurück, der in data vorhanden und
    nicht None ist. Unterscheidet explizit zwischen fehlendem Schlüssel und
    gültigem 0-Wert (anders als 'or'-Verkettung, die 0 als falsy behandelt).
    """
    for key in keys:
        v = data.get(key)
        if v is not None:
            return v
    return default

def extract_powerstream(data):
    """
    Extrahiert PowerStream-Werte aus der EcoFlow Open Platform API.

    Alle Leistungs-, Spannungs- und Temperaturwerte sind als Integer×10
    kodiert (z. B. 250 → 25.0 W / V / °C), daher divisor=10.
    Batterie-SOC und Limits sind direkte Prozentwerte.
    """
    pv1      = get_field(data, "20_1.pv1InputWatts",  "pv1InputWatts")
    pv2      = get_field(data, "20_1.pv2InputWatts",  "pv2InputWatts")
    ac       = get_field(data, "20_1.invOutputWatts",  "invOutputWatts")
    bat_soc  = get_field(data, "20_1.batSoc",          "batSoc")
    bat_w    = get_field(data, "20_1.batInputWatts",   "batInputWatts")

    pv1_t    = get_field(data, "20_1.pv1Temp",         "pv1Temp")
    pv2_t    = get_field(data, "20_1.pv2Temp",         "pv2Temp")
    inv_t    = get_field(data, "20_1.llcTemp",          "llcTemp")
    grid_w   = get_field(data, "20_1.gridConsWatts",   "gridConsWatts")
    plug_w   = get_field(data, "20_1.invToPlugWatts",  "invToPlugWatts")
    perm_w   = get_field(data, "20_1.permanentWatts",  "permanentWatts")
    pv2inv_w = get_field(data, "20_1.pvToInvWatts",    "pvToInvWatts")
    pv1_v    = get_field(data, "20_1.pv1InputVolt",    "pv1InputVolt")
    pv2_v    = get_field(data, "20_1.pv2InputVolt",    "pv2InputVolt")
    inv_v    = get_field(data, "20_1.invOpVolt",        "invOpVolt")
    bat_lo   = get_field(data, "20_1.lowerLimit",       "lowerLimit")
    bat_hi   = get_field(data, "20_1.upperLimit",       "upperLimit")
    wifi     = get_field(data, "20_1.wifiRssi",         "wifiRssi")

    log("INFO", f"PowerStream: pv1={pv1}, pv2={pv2}, ac={ac}, soc={bat_soc}, bat={bat_w}")
    log("INFO", f"  temps: pv1={pv1_t}, pv2={pv2_t}, inv={inv_t}")
    log("INFO", f"  volts: pv1={pv1_v}, pv2={pv2_v}, inv={inv_v}")
    log("INFO", f"  flow:  grid={grid_w}, plug={plug_w}, perm={perm_w}, pv2inv={pv2inv_w}")
    log("INFO", f"  limits: lo={bat_lo}%, hi={bat_hi}% | rssi={wifi} dBm")

    return {
        "pv1_watt":          safe_float(pv1,      divisor=10),
        "pv2_watt":          safe_float(pv2,      divisor=10),
        "ac_house_watt":     safe_float(ac,       divisor=10),
        "battery_soc_percent": safe_float(bat_soc),
        "battery_power_watt":  safe_float(bat_w,  divisor=10),
        "pv1_temp_c":        safe_float(pv1_t,    divisor=10),
        "pv2_temp_c":        safe_float(pv2_t,    divisor=10),
        "inv_temp_c":        safe_float(inv_t,    divisor=10),
        "grid_cons_watt":    safe_float(grid_w,   divisor=10),
        "inv_to_plug_watt":  safe_float(plug_w,   divisor=10),
        "permanent_watt":    safe_float(perm_w,   divisor=10),
        "pv_to_inv_watt":    safe_float(pv2inv_w, divisor=10),
        "pv1_volt":          safe_float(pv1_v,    divisor=10),
        "pv2_volt":          safe_float(pv2_v,    divisor=10),
        "inv_volt":          safe_float(inv_v,    divisor=10),
        "bat_lower_limit":   safe_float(bat_lo),
        "bat_upper_limit":   safe_float(bat_hi),
        "wifi_rssi":         safe_float(wifi),
    }

def extract_delta3(data):
    """
    Extrahiert Delta 3 / Delta 3 Plus Batteriewerte.
    pd.wattsInSum / pd.wattsOutSum sind direkte Wattwerte (kein ÷10).
    """
    soc = get_field(data, "bmsMaster.soc", "bms_bmsStatus.soc", "bms.soc")
    power_in  = safe_float(get_field(data, "pd.wattsInSum",  "bmsMaster.inputWatts"))
    power_out = safe_float(get_field(data, "pd.wattsOutSum", "bmsMaster.outputWatts"))
    battery_power = power_in - power_out if (power_in or power_out) else safe_float(get_field(data, "bms.power"))

    log("INFO", f"Delta 3: soc={soc}, in={power_in}W, out={power_out}W → netto={battery_power}W")
    return {
        "battery_soc_percent": safe_float(soc),
        "battery_power_watt":  battery_power,
    }

# =============================================================================
# CSV-MIGRATION
# =============================================================================

def migrate_csv_if_needed(csv_file):
    """
    Prüft ob der CSV-Header mit CSV_FIELDNAMES übereinstimmt.
    Falls nicht (Schema-Änderung), wird die CSV neu geschrieben:
    - Neuer Header mit allen aktuellen Feldern
    - Alte Zeilen behalten ihre Werte; neue Spalten bleiben leer
    Dies stellt sicher, dass das Dashboard neue Spalten per Index finden kann.
    """
    if not os.path.exists(csv_file):
        return
    try:
        with open(csv_file, "r", newline="") as f:
            reader = csv.DictReader(f)
            old_fields = list(reader.fieldnames or [])
            if old_fields == CSV_FIELDNAMES:
                log("INFO", f"✓ CSV-Schema v{CSV_SCHEMA_VERSION} aktuell ({len(CSV_FIELDNAMES)} Felder)")
                return
            rows = list(reader)

        added = [f for f in CSV_FIELDNAMES if f not in old_fields]
        removed = [f for f in old_fields if f not in CSV_FIELDNAMES]
        log("INFO", f"CSV-Schema veraltet: {len(old_fields)} → {len(CSV_FIELDNAMES)} Felder")
        if added:   log("INFO", f"  + neu:     {added}")
        if removed: log("INFO", f"  - entfernt: {removed}")
        log("INFO", f"  Migriere {len(rows)} bestehende Zeilen …")

        with open(csv_file, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

        log("INFO", f"✓ CSV-Migration abgeschlossen (v{CSV_SCHEMA_VERSION})")
    except Exception as e:
        log("ERROR", f"CSV-Migration fehlgeschlagen: {e}")

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
                        total += (float(row.get("pv1_watt", 0) or 0) +
                                  float(row.get("pv2_watt", 0) or 0)) / 60
                    except ValueError:
                        pass
    except Exception as e:
        log("ERROR", f"Energieberechnung Fehler: {e}")
    return round(total, 2)

# =============================================================================
# CSV SCHREIBEN
# =============================================================================

def append_to_csv(data, csv_file):
    """Hängt eine neue Zeile an die CSV an. Header nur bei neuer Datei."""
    file_exists = os.path.isfile(csv_file)
    try:
        with open(csv_file, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            if not file_exists:
                writer.writeheader()
            writer.writerow(data)
        log("INFO", f"💾 Zeile gespeichert: {data['timestamp']}")
    except Exception as e:
        log("ERROR", f"CSV Fehler: {e}")

# =============================================================================
# MAIN
# =============================================================================

def main():
    log("INFO", "=" * 60)
    log("INFO", f"EcoFlow Datentracker v{CSV_SCHEMA_VERSION} - GitHub Actions")
    log("INFO", "=" * 60)

    if not validate_config():
        sys.exit(1)

    # Schema-Migration vor jedem Lauf — idempotent und schnell
    migrate_csv_if_needed(CSV_FILENAME)

    ps_data = query_device(POWERSTREAM_SN, "PowerStream")
    ps = extract_powerstream(ps_data)

    if DELTA3_SN:
        d3_data = query_device(DELTA3_SN, "Delta 3")
        d3 = extract_delta3(d3_data)
        if d3["battery_soc_percent"]:
            ps["battery_soc_percent"] = d3["battery_soc_percent"]
            ps["battery_power_watt"]  = d3["battery_power_watt"]

    timestamp = datetime.now().isoformat(timespec="seconds")
    daily_wh  = calculate_daily_energy(CSV_FILENAME)

    row = {
        "timestamp":           timestamp,
        "pv1_watt":            ps["pv1_watt"],
        "pv2_watt":            ps["pv2_watt"],
        "ac_house_watt":       ps["ac_house_watt"],
        "battery_soc_percent": ps["battery_soc_percent"],
        "battery_power_watt":  ps["battery_power_watt"],
        "total_pv_wh_daily":   daily_wh,
        "pv1_temp_c":          ps["pv1_temp_c"],
        "pv2_temp_c":          ps["pv2_temp_c"],
        "inv_temp_c":          ps["inv_temp_c"],
        "grid_cons_watt":      ps["grid_cons_watt"],
        "inv_to_plug_watt":    ps["inv_to_plug_watt"],
        "permanent_watt":      ps["permanent_watt"],
        "pv_to_inv_watt":      ps["pv_to_inv_watt"],
        "pv1_volt":            ps["pv1_volt"],
        "pv2_volt":            ps["pv2_volt"],
        "inv_volt":            ps["inv_volt"],
        "bat_lower_limit":     ps["bat_lower_limit"],
        "bat_upper_limit":     ps["bat_upper_limit"],
        "wifi_rssi":           ps["wifi_rssi"],
    }

    append_to_csv(row, CSV_FILENAME)

    log("INFO", "")
    log("INFO", f"PV1: {ps['pv1_watt']} W | PV2: {ps['pv2_watt']} W | AC-Haus: {ps['ac_house_watt']} W")
    log("INFO", f"Batterie: {ps['battery_soc_percent']} % | {ps['battery_power_watt']} W")
    log("INFO", f"Temp: PV1={ps['pv1_temp_c']}°C  PV2={ps['pv2_temp_c']}°C  WR={ps['inv_temp_c']}°C")
    log("INFO", f"Volt: PV1={ps['pv1_volt']}V  PV2={ps['pv2_volt']}V  WR={ps['inv_volt']}V")
    log("INFO", f"Netz: {ps['grid_cons_watt']} W | Stecker: {ps['inv_to_plug_watt']} W | PV→WR: {ps['pv_to_inv_watt']} W")
    log("INFO", f"Batterie-Limits: {ps['bat_lower_limit']}% – {ps['bat_upper_limit']}% | RSSI: {ps['wifi_rssi']} dBm")
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
