# 🌞 EcoFlow BKW Datentracker

Automatische Erfassung, Speicherung und Visualisierung von EcoFlow
PowerStream & Delta 3 Daten via GitHub Actions.

## 📊 Live-Dashboard

👉 **[Dashboard öffnen](https://t6vb9ns645-boop.github.io/ecoflow/dashboard/)** —
auto-aktualisierend, alle 2 Minuten neue Daten.

🔗 Übersichtsseite: https://t6vb9ns645-boop.github.io/ecoflow/

Das Dashboard ist in sieben Bereiche gegliedert:

1. **Live-Momentaufnahme** — aktuelle Erzeugung, Verbrauch, Batteriezustand
2. **Energie** — PV-Erzeugung, Batterie, AC-Verbrauch, Leistungsfluss, Tageszähler
3. **Elektrische Spannungen** — PV1/PV2-Eingang & WR-Ausgang (adaptive Achsen)
4. **Thermik** — Temperaturen PV1/PV2/Wechselrichter
5. **System & Konnektivität** — WLAN-Signal, Batterie-Limits
6. **Smart Plugs** — Leistung & Schaltzustand je Steckdose (beliebig viele, siehe unten)
7. **Datenqualität** — Nullwert-Analyse, Datenabdeckung, Aufzeichnungsfenster

## ✨ Features

✅ Automatische Abfrage alle 2 Minuten (cron-job.org → GitHub Actions)  
✅ Kostenlos (GitHub Free Plan)  
✅ 19 Messfelder + Tageserzeugung (Wh) automatisch berechnet  
✅ CSV-Export für Excel/Analysen  
✅ Live-Dashboard mit Auto-Refresh & Abholungs-Forecast  
✅ Automatische CSV-Schema-Migration  
✅ Keine lokale Hardware nötig  

## 🚀 Quickstart

1. **GitHub Secrets erstellen** (Settings → Secrets and variables → Actions):
   - `ECOFLOW_ACCESS_KEY`
   - `ECOFLOW_SECRET_KEY`
   - `POWERSTREAM_SN`
   - `DELTA3_SN` *(optional)*
   - `SMARTPLUGS_JSON` *(optional, siehe unten)*

2. **Workflow testen** (Actions → Run workflow)

3. **Dashboard aufrufen** (Link oben) oder CSV herunterladen
   (`docs/ecoflow_energie_daten.csv`)

## 📋 Dateien

- `ecoflow_tracker_github.py` — Hauptskript für Datenabfrage & CSV-Migration
- `.github/workflows/ecoflow-collector.yml` — GitHub Actions Workflow
- `docs/dashboard/index.html` — Live-Dashboard (Chart.js)
- `docs/index.html` — Übersichts-/Landingpage
- `docs/ecoflow_energie_daten.csv` — Messdaten PowerStream/Delta 3
- `docs/ecoflow_smartplugs_daten.csv` — Messdaten Smart Plugs (nur vorhanden, wenn konfiguriert)
- `tests/` — Unit-Tests (`python -m unittest discover -s tests`)
- `requirements.txt` — Python Dependencies

## 🔌 Smart Plugs (9+ Steckdosen)

Beliebig viele EcoFlow Smart Plugs können zusätzlich erfasst werden — ohne
Code-Änderung, allein über das Secret `SMARTPLUGS_JSON`. Jeder Plug muss im
selben EcoFlow-Account registriert und im
[Developer Portal](https://developer.ecoflow.com) freigeschaltet sein.

**Secret-Format** (JSON-Liste, beliebig viele Einträge):

```json
[
  { "sn": "HW52ZCH5SF4E0135", "name": "Kühlschrank" },
  { "sn": "HW52ZCH5SF4E0136", "name": "Waschmaschine" },
  { "sn": "HW52ZCH5SF4E0137", "name": "Router" }
]
```

`name` ist optional (Fallback: Seriennummer). Ist `SMARTPLUGS_JSON` leer oder
nicht gesetzt, wird die Smart-Plug-Abfrage vollständig übersprungen — die
bestehende PowerStream/Delta-3-Erfassung ist davon unberührt.

Die Daten landen im **Long-/Tidy-Format** in `docs/ecoflow_smartplugs_daten.csv`
(eine Zeile pro Plug pro Messzeitpunkt: `timestamp, plug_sn, plug_name, watts,
switch_sta, volt, current_a, temp_c, led_brightness`) — dadurch skaliert die
Struktur ohne Schema-Änderung auf beliebig viele Plugs, im Gegensatz zum
Wide-Format der Haupt-CSV. Das Dashboard zeigt sie in Bereich 6 als
KPI-Kacheln pro Plug (Watt + An/Aus) plus Gesamtverbrauch und einen
Zeitverlauf-Chart mit einer Linie je Gerät.

⚠️ Die Feldnamen/Skalierung der Smart-Plug-API sind bei EcoFlow nicht
offiziell dokumentiert (Quelle: Community-Referenz
[hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud)) — beim
ersten echten Plug lohnt ein Blick ins `DEBUG`-Log des Workflow-Runs, um die
Rohwerte zu verifizieren.
- `CHANGELOG.md` — Versionshistorie

## 📈 Erfasste Daten (Schema v2 · 20 Spalten)

| Feld | Quelle | Einheit |
|------|--------|---------|
| timestamp | System | ISO 8601 |
| pv1_watt | PowerStream | W |
| pv2_watt | PowerStream | W |
| ac_house_watt | PowerStream | W |
| battery_soc_percent | PowerStream | % |
| battery_power_watt | PowerStream | W |
| total_pv_wh_daily | berechnet | Wh |
| pv1_temp_c · pv2_temp_c · inv_temp_c | PowerStream | °C |
| grid_cons_watt | PowerStream | W |
| inv_to_plug_watt | PowerStream | W |
| permanent_watt | PowerStream | W |
| pv_to_inv_watt | PowerStream | W |
| pv1_volt · pv2_volt · inv_volt | PowerStream | V |
| bat_lower_limit · bat_upper_limit | PowerStream | % |
| wifi_rssi | PowerStream | dBm |

## ⏱️ Schedule

**Alle 2 Minuten** — ausgelöst extern durch [cron-job.org](https://cron-job.org)
via `workflow_dispatch` (zuverlässiger als der GitHub-`schedule`-Cron).

## 🔧 Technisch

- **Runtime:** GitHub Actions Ubuntu Latest
- **Python:** 3.11
- **API:** EcoFlow Open Platform API v2 (`api-e.ecoflow.com`, HMAC-SHA256)
- **Storage:** CSV im Repo, ausgeliefert über GitHub Pages
- **Visualisierung:** Chart.js 4.4.1

## 📄 Lizenz

Dieses Projekt ist für den persönlichen Gebrauch gedacht.

---

**Status:** Production Ready  
**Letzte Aktualisierung:** Juli 2026  
**Version:** 3.7.0 — siehe [CHANGELOG.md](CHANGELOG.md)
