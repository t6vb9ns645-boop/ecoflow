#!/usr/bin/env python3
"""
=============================================================================
EcoFlow PowerStream & Delta 3 Datentracker - GitHub Actions Version
=============================================================================

Purpose:
    - Abfrage von EcoFlow Geräten via offizielle Cloud REST-API
    - Speicherung in CSV mit Zeitstempel
    - Automatische Energieerzeugung-Berechnung (Wh aus W)
    - Optimiert für GitHub Actions (Environment Variables für Keys)

Author: KI-Assistent
Version: 1.0 GitHub Actions Edition
Environment: GitHub Actions Ubuntu
=============================================================================
"""

import requests
import csv
import os
import sys
import time
import hashlib
import hmac
from datetime import datetime
from pathlib import Path

# =============================================================================
# KONFIGURATION: KEYS AUS ENVIRONMENT VARIABLES (GitHub Secrets)
# =============================================================================

# Diese Werte werden als GitHub Secrets gespeichert und hier ausgelesen
ECOFLOW_ACCESS_KEY = os.environ.get("ECOFLOW_ACCESS_KEY", "")
ECOFLOW_SECRET_KEY = os.environ.get("ECOFLOW_SECRET_KEY", "")
POWERSTREAM_SN = os.environ.get("POWERSTREAM_SN", "")
DELTA3_SN = os.environ.get("DELTA3_SN", "")

# API Endpoints
ECOFLOW_API_BASE = "https://api.ecoflow.com/api"
POWERSTREAM_ENDPOINT = f"{ECOFLOW_API_BASE}/device/QueryDeviceStatus?sn={POWERSTREAM_SN}"
DELTA3_ENDPOINT = f"{ECOFLOW_API_BASE}/device/QueryDeviceStatus?sn={DELTA3_SN}"

# Datei-Konfiguration
CSV_FILENAME = "ecoflow_energie_daten.csv"
CSV_FIELDNAMES = [
    "timestamp",
    "pv1_watt",
    "pv2_watt",
    "ac_house_watt",
    "battery_soc_percent",
    "battery_power_watt",
    "total_pv_wh_daily"
]

# =============================================================================
# LOGGING (für GitHub Actions Console Output)
# =============================================================================

def log_message(level: str, message: str):
    """
    Gibt Log-Meldung in Console aus (für GitHub Actions sichtbar)
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {level}: {message}"
    print(log_entry)

# =============================================================================
# VALIDIERUNG: SIND ALLE ENVIRONMENT VARIABLES GESETZT?
# =============================================================================

def validate_config():
    """Prüft ob alle benötigten Umgebungsvariablen gesetzt sind"""
    
    errors = []
    
    if not ECOFLOW_ACCESS_KEY:
        errors.append("❌ ECOFLOW_ACCESS_KEY nicht gesetzt (GitHub Secret fehlt)")
    
    if not ECOFLOW_SECRET_KEY:
        errors.append("❌ ECOFLOW_SECRET_KEY nicht gesetzt (GitHub Secret fehlt)")
    
    if not POWERSTREAM_SN:
        errors.append("❌ POWERSTREAM_SN nicht gesetzt (GitHub Secret fehlt)")
    
    if not DELTA3_SN:
        errors.append("❌ DELTA3_SN nicht gesetzt (GitHub Secret fehlt)")
    
    if errors:
        log_message("ERROR", "Konfigurationsfehler:")
        for error in errors:
            log_message("ERROR", error)
        log_message("ERROR", "\nBitte GitHub Secrets überprüfen:")
        log_message("ERROR", "Settings → Secrets and variables → Actions")
        return False
    
    log_message("INFO", "✓ Alle Konfigurationswerte vorhanden")
    return True

# =============================================================================
# EcoFlow API - AUTHENTIFIZIERUNG
# =============================================================================

def generate_signature(access_key: str, secret_key: str, timestamp: str) -> str:
    """
    Generiert HMAC-SHA256 Signatur für EcoFlow API
    """
    message = f"{access_key}{timestamp}"
    signature = hmac.new(
        secret_key.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature

# =============================================================================
# EcoFlow API - DATEN ABRUFEN
# =============================================================================

def query_ecoflow_device(endpoint: str, device_name: str) -> dict:
    """
    Fragt EcoFlow API ab
    """
    try:
        timestamp = str(int(time.time() * 1000))
        signature = generate_signature(ECOFLOW_ACCESS_KEY, ECOFLOW_SECRET_KEY, timestamp)
        
        headers = {
            "Authorization": f"{ECOFLOW_ACCESS_KEY}:{signature}",
            "X-Request-Timestamp": timestamp,
            "Content-Type": "application/json"
        }
        
        log_message("INFO", f"→ Frage {device_name} ab...")
        response = requests.get(endpoint, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == 0:
                log_message("INFO", f"✓ {device_name} erfolgreich abgefragt")
                return data.get("data", {})
            else:
                error_msg = data.get("msg", "Unknown API Error")
                log_message("ERROR", f"{device_name} API Error: {error_msg}")
                return {}
        
        elif response.status_code == 429:
            log_message("ERROR", "⚠️ Rate Limit überschritten (HTTP 429)")
            return {}
        
        else:
            log_message("ERROR", f"{device_name} HTTP {response.status_code}")
            return {}
    
    except requests.exceptions.Timeout:
        log_message("ERROR", f"{device_name} Timeout")
        return {}
    
    except requests.exceptions.ConnectionError:
        log_message("ERROR", f"{device_name} Verbindungsfehler")
        return {}
    
    except Exception as e:
        log_message("ERROR", f"{device_name} Fehler: {str(e)}")
        return {}

# =============================================================================
# DATENEXTRAKTION
# =============================================================================

def extract_powerstream_data(ps_data: dict) -> dict:
    """Extrahiert PowerStream Daten"""
    try:
        pv1 = ps_data.get("inv", {}).get("pv1Power", 0)
        pv2 = ps_data.get("inv", {}).get("pv2Power", 0)
        ac_out = ps_data.get("inv", {}).get("acPower", 0)
        
        return {
            "pv1_watt": float(pv1) if pv1 else 0,
            "pv2_watt": float(pv2) if pv2 else 0,
            "ac_house_watt": float(ac_out) if ac_out else 0,
        }
    except Exception as e:
        log_message("ERROR", f"PowerStream Parse Fehler: {str(e)}")
        return {"pv1_watt": 0, "pv2_watt": 0, "ac_house_watt": 0}

def extract_delta3_data(d3_data: dict) -> dict:
    """Extrahiert Delta 3 Daten"""
    try:
        soc = d3_data.get("bms", {}).get("soc", 0)
        power = d3_data.get("bms", {}).get("power", 0)
        
        return {
            "battery_soc_percent": float(soc) if soc else 0,
            "battery_power_watt": float(power) if power else 0,
        }
    except Exception as e:
        log_message("ERROR", f"Delta 3 Parse Fehler: {str(e)}")
        return {"battery_soc_percent": 0, "battery_power_watt": 0}

# =============================================================================
# ENERGIEERZEUGUNG BERECHNUNG
# =============================================================================

def calculate_daily_energy(csv_file: str) -> float:
    """
    Berechnet Tageserzeugung aus allen Einträgen
    Formel: (PV1 + PV2) [W] × (1/60) [h] = Wh
    """
    if not os.path.exists(csv_file):
        return 0.0
    
    total_pv_wh = 0.0
    
    try:
        with open(csv_file, "r") as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                try:
                    pv1 = float(row.get("pv1_watt", 0))
                    pv2 = float(row.get("pv2_watt", 0))
                    total_pv_w = pv1 + pv2
                    pv_wh = total_pv_w / 60  # 1 Minute = 1/60 Stunde
                    total_pv_wh += pv_wh
                except ValueError:
                    continue
        
        return total_pv_wh
    
    except Exception as e:
        log_message("ERROR", f"Energieberechnung Fehler: {str(e)}")
        return 0.0

# =============================================================================
# CSV SPEICHERN
# =============================================================================

def append_to_csv(data: dict, csv_file: str):
    """Fügt Daten zur CSV hinzu (oder erstellt sie)"""
    file_exists = os.path.isfile(csv_file)
    
    try:
        with open(csv_file, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            
            if not file_exists:
                writer.writeheader()
                log_message("INFO", f"📄 CSV erstellt: {csv_file}")
            
            writer.writerow(data)
            log_message("INFO", f"💾 Daten gespeichert: {data['timestamp']}")
    
    except Exception as e:
        log_message("ERROR", f"CSV Speicher-Fehler: {str(e)}")

# =============================================================================
# MAIN
# =============================================================================

def main():
    """Hauptfunktion"""
    
    log_message("INFO", "=" * 70)
    log_message("INFO", "EcoFlow Datentracker (GitHub Actions Version)")
    log_message("INFO", "=" * 70)
    
    # Validierung
    if not validate_config():
        sys.exit(1)
    
    # Abfrage
    ps_data = query_ecoflow_device(POWERSTREAM_ENDPOINT, "PowerStream")
    d3_data = query_ecoflow_device(DELTA3_ENDPOINT, "Delta 3")
    
    # Extraktion
    ps_extracted = extract_powerstream_data(ps_data)
    d3_extracted = extract_delta3_data(d3_data)
    
    # Energieberechnung
    timestamp = datetime.now().isoformat(timespec="seconds")
    daily_energy = calculate_daily_energy(CSV_FILENAME)
    
    # Zusammenstellung
    row_data = {
        "timestamp": timestamp,
        "pv1_watt": ps_extracted["pv1_watt"],
        "pv2_watt": ps_extracted["pv2_watt"],
        "ac_house_watt": ps_extracted["ac_house_watt"],
        "battery_soc_percent": d3_extracted["battery_soc_percent"],
        "battery_power_watt": d3_extracted["battery_power_watt"],
        "total_pv_wh_daily": round(daily_energy, 2)
    }
    
    # Speichern
    append_to_csv(row_data, CSV_FILENAME)
    
    # Zusammenfassung
    log_message("INFO", f"""
╔════════════════════════════════════════════════════════════╗
║ 📊 GEMESSENE DATEN                                         ║
╠════════════════════════════════════════════════════════════╣
║ Zeitstempel:      {timestamp}
║ PV1 Leistung:     {ps_extracted['pv1_watt']:>7.1f} W
║ PV2 Leistung:     {ps_extracted['pv2_watt']:>7.1f} W
║ AC-Einspeisung:   {ps_extracted['ac_house_watt']:>7.1f} W
║ Batterie SoC:     {d3_extracted['battery_soc_percent']:>7.1f} %
║ Batterie Leistung:{d3_extracted['battery_power_watt']:>7.1f} W
╠════════════════════════════════════════════════════════════╣
║ 📈 TAGESSUMME                                              ║
╠════════════════════════════════════════════════════════════╣
║ Tageserzeugung:   {daily_energy:>7.2f} Wh ({daily_energy/1000:>6.3f} kWh)
╚════════════════════════════════════════════════════════════╝
""")
    
    log_message("INFO", "✅ Datenabfrage erfolgreich abgeschlossen")

# =============================================================================
# AUSFÜHRUNG
# =============================================================================

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log_message("INFO", "⏸️  Skript unterbrochen")
        sys.exit(0)
    except Exception as e:
        log_message("ERROR", f"🔴 Kritischer Fehler: {str(e)}")
        sys.exit(1)
