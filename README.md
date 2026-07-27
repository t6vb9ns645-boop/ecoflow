# 🌞 EcoFlow BKW Datentracker

Automatische Erfassung, Speicherung und Visualisierung von EcoFlow
PowerStream & Delta 3 Daten via GitHub Actions.

## 📊 Live-Dashboard

👉 **[Dashboard öffnen](https://t6vb9ns645-boop.github.io/ecoflow/dashboard/)** —
auto-aktualisierend, alle 2 Minuten neue Daten.

🔗 Übersichtsseite: https://t6vb9ns645-boop.github.io/ecoflow/

### Aufbau

Oben liegt ein einklappbares **Menü**, das Version, Datenaktualisierung und
Zeitraum-Filter bündelt. Zusammengeklappt zeigt es die aktiven Werte
(Version · Datenalter · Zeitraum), aufgeklappt alle Optionen. Der gewählte
Zeitraum gilt für beide Ansichten.

Darunter zwei Ansichten, umschaltbar über Reiter (Desktop) oder Wischgeste
(Smartphone):

**01 · Leistungsübersicht** — Stromfluss-Diagramm: PV1/PV2 → Wechselrichter →
Speicher bzw. Hausnetz. Der Wechselrichter ist der zentrale Knoten des
Balkonkraftwerks; der Speicher hängt ausschließlich an ihm, nicht am Hausnetz.
Das Hausnetz wird primär über den Wechselrichter versorgt, zusätzlich aber auch
**direkt aus dem Stromnetz** — sichtbar als eigener Knoten „Netz" mit eigener
Kante —, sobald PV und Speicher den Bedarf (z. B. der Smart Plugs) nicht
vollständig decken können (`grid_cons_watt`). Das Hausnetz ist je Smart Plug
einzeln aufgeschlüsselt, zuzüglich des eingestellten Grundbedarfs und des
Netzbezugs. Umschaltbar zwischen Live-Momentaufnahme und Ø über den gewählten
Zeitraum.

**02 · Einzelwerte** — die sieben bekannten Bereiche:

1. **Live-Momentaufnahme** — aktuelle Erzeugung, Verbrauch, Batteriezustand
2. **Energie** — PV-Erzeugung, Batterie, AC-Verbrauch, Leistungsfluss, Tageszähler
3. **Elektrische Spannungen** — PV1/PV2-Eingang & WR-Ausgang (adaptive Achsen)
4. **Thermik** — Temperaturen PV1/PV2/Wechselrichter
5. **System & Konnektivität** — WLAN-Signal, Batterie-Limits
6. **Smart Plugs** — Leistung & Schaltzustand je Steckdose (beliebig viele, siehe unten)
7. **Datenqualität** — Nullwert-Analyse, Datenabdeckung, Aufzeichnungsfenster

### Frühere Versionen

Über das Menü lässt sich eine frühere Dashboard-Fassung aufrufen und normal
benutzen — sie liest dieselbe CSV und liefert dieselben Energie-Kennzahlen.
Jede archivierte Version trägt oben einen Hinweisbalken mit Rückweg zur
aktuellen Fassung. Verfügbar ist derzeit **v3.7.0**; ältere Stände wurden nicht
archiviert und lassen sich nachträglich nicht rekonstruieren.

## ✨ Features

✅ Automatische Abfrage alle 2 Minuten (cron-job.org → GitHub Actions)  
✅ Kostenlos (GitHub Free Plan)  
✅ 19 Messfelder + Tageserzeugung (Wh) automatisch berechnet  
✅ CSV-Export für Excel/Analysen  
✅ Live-Dashboard mit Auto-Refresh (alle 30 s)  
✅ Stromfluss-Diagramm mit animierten Flusslinien  
✅ Zeitraum-Filter mit automatischer Aggregation bei langen Zeiträumen  
✅ Rückfall auf eine frühere Dashboard-Version jederzeit möglich  
✅ Automatische CSV-Schema-Migration  
✅ Automatisierte Tests (Dashboard-Logik + Collector) in der CI  
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
- `.github/workflows/ecoflow-collector.yml` — Datenerfassung
- `.github/workflows/tests.yml` — Testlauf (Node + Python)
- `.github/workflows/deploy-pages.yml` — Veröffentlichung auf GitHub Pages
- `docs/dashboard/index.html` — Live-Dashboard (Chart.js)
- `docs/dashboard/lib/*.mjs` — Berechnungsmodule des Dashboards (siehe unten)
- `docs/dashboard/versions/` — archivierte Dashboard-Versionen + `manifest.json`
- `docs/index.html` — Übersichts-/Landingpage
- `docs/ecoflow_energie_daten.csv` — Messdaten PowerStream/Delta 3
- `docs/ecoflow_smartplugs_daten.csv` — Messdaten Smart Plugs (nur vorhanden, wenn konfiguriert)
- `tests/` — Tests des Collectors (Python) und der Dashboard-Module (Node)
- `requirements.txt` — Python Dependencies
- `package.json` — nur Test-Skripte, keine Laufzeit-Abhängigkeiten
- `CHANGELOG.md` — Versionshistorie

## 🧪 Tests

Zwei getrennte Testsuiten, beide ohne zusätzliche Abhängigkeiten:

```bash
# Dashboard-Module (Node 22, eingebauter Test-Runner)
npm test                 # nur Tests
npm run test:coverage    # mit erzwungener Abdeckung (>= 85 %)

# Collector (Python, stdlib unittest)
python -m unittest discover -s tests
```

Die Berechnungslogik des Dashboards liegt in `docs/dashboard/lib/*.mjs` und wird
sowohl vom Browser (`<script type="module">`) als auch vom Test-Runner
importiert — dadurch ist sie überhaupt testbar:

| Modul | Inhalt |
|-------|--------|
| `csv.mjs` | CSV-Parsing (RFC4180-artig), Nullwert-Erkennung |
| `format.mjs` | Zeit-, Leistungs- und Energieformatierung |
| `energy.mjs` | Energie-Kennzahlen, Batterie-Vorzeichen, Flussmodell |
| `filters.mjs` | Zeitraum-Presets, Aggregation, Datenqualität |
| `plugs.mjs` | Plug-Gruppierung, stabile Farben je Seriennummer |
| `layout.mjs` | Geometrie des Stromfluss-Diagramms |
| `viewmodel.mjs` | Anzeigezustand aus Rohdaten + Filter |

Beide Suiten laufen bei jedem Push und Pull Request; reine Messdaten-Commits
lösen keinen Lauf aus.

## 🔋 Vorzeichen der Batterieleistung

`battery_power_watt` ist **negativ beim Laden** und **positiv beim Entladen**.
An Messdaten verifiziert:

| Situation | Messpunkt | Bilanz |
|-----------|-----------|--------|
| Laden | 24.06., 11:14 | PV 221 W = Ladung 203 W + Haus 18 W |
| Entladen | 23.06., 21:18 | PV 0 W, Batterie +23 W deckt Haus 19 W |

Über einen Zeitraum verrechnet ein Mittelwert beide Richtungen zu einer Zahl.
Kamen beide vor, weist das Dashboard sie im Ø-Modus zusätzlich getrennt aus
(`↓ laden · ↑ entladen`).

## ⚡ Netzbezug im Hausnetz

Das Balkonkraftwerk (PV + Speicher) deckt den Hausverbrauch nicht immer
vollständig — reicht die Leistung nicht aus (z. B. weil die Smart Plugs mehr
ziehen, als PV/Speicher gerade liefern), wird der Rest automatisch aus dem
öffentlichen Stromnetz bezogen. Bis v4.0.0 wurde dieser Anteil zwar erfasst
(`grid_cons_watt`), aber **nirgends in der Leistungsübersicht dargestellt** —
der Diagramm-Knoten „Hausnetz" zeigte nur den vom Wechselrichter gelieferten
Anteil, während die einzeln aufgeschlüsselten Smart Plugs ihre tatsächliche
(ggf. netzgedeckte) Leistung zeigten. Das ergab widersprüchliche Zahlen, z. B.
„Hausnetz 0 W", während die Steckdosen-Kacheln darunter in Summe 68 W auswiesen.

Seit v4.1.0 ist der Netzbezug ein eigener Diagramm-Knoten **„Netz"** mit
eigener Kante direkt ins Hausnetz (parallel zum Wechselrichter, unabhängig
von ihm — genau wie in der Realität: Balkonkraftwerk und Netzanschluss speisen
dieselbe Steckdose/den selben Sicherungskasten). Der Gesamtverbrauch
„Hausnetz — Gesamtverbrauch" ist jetzt `ac_house_watt + grid_cons_watt`, und
die Aufschlüsselung zeigt einen eigenen Posten „Netzbezug (vom
Balkonkraftwerk nicht gedeckt)".

**Warum keine neue CSV?** `grid_cons_watt` steckt bereits seit Schema v2 in
`docs/ecoflow_energie_daten.csv` (siehe Tabelle unten) und durchläuft die
komplette Datenpipeline (Parsing, Aggregation, Nullwert-Prüfung) unverändert.
Der Fehler lag ausschließlich in der Darstellung, nicht in der Datenhaltung —
eine zusätzliche CSV würde denselben Messwert nur duplizieren, ohne einen
Fehler zu beheben. Eine Erweiterung wäre nur dann sinnvoll, wenn EcoFlow den
Netzbezug irgendwann pro Smart Plug (statt nur als Summe des gesamten
Haushalts) melden würde — das ist mit der aktuellen API nicht der Fall.

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
Wide-Format der Haupt-CSV. Das Dashboard zeigt sie in Ansicht 02, Bereich 6 als
Kacheln pro Plug (Watt + An/Aus) plus Gesamtverbrauch und einen
Zeitverlauf-Chart mit einer Linie je Gerät. In Ansicht 01 taucht jeder Plug
zusätzlich als eigener Posten in der Hausnetz-Aufschlüsselung auf. Die Farbe
eines Plugs leitet sich aus seiner Seriennummer ab und bleibt daher stabil,
auch wenn Plugs hinzukommen oder ausfallen.

⚠️ Die Feldnamen/Skalierung der Smart-Plug-API sind bei EcoFlow nicht
offiziell dokumentiert (Quelle: Community-Referenz
[hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud)) — beim
ersten echten Plug lohnt ein Blick ins `DEBUG`-Log des Workflow-Runs, um die
Rohwerte zu verifizieren.

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
- **Python:** 3.11 (Collector), stdlib `unittest` für Tests
- **Node:** 22 — nur für die Tests, eingebauter Test-Runner samt
  Coverage-Schwellen, keine Laufzeit-Abhängigkeiten
- **API:** EcoFlow Open Platform API v2 (`api-e.ecoflow.com`, HMAC-SHA256)
- **Storage:** CSV im Repo, ausgeliefert über GitHub Pages
- **Dashboard:** natives ES-Modul-Setup ohne Build-Schritt
- **Visualisierung:** Chart.js 4.4.1, Schriften Archivo & JetBrains Mono
- **Farben:** Datenfarben gegen Farbfehlsichtigkeit geprüft (paarweise ΔE ≥ 8
  in Deutan/Protan/Tritan, Kontrast ≥ 3:1 gegen den Hintergrund)

## 📄 Lizenz

Dieses Projekt ist für den persönlichen Gebrauch gedacht.

---

**Status:** Production Ready  
**Letzte Aktualisierung:** Juli 2026  
**Version:** 4.1.0 — siehe [CHANGELOG.md](CHANGELOG.md)
