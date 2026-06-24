# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt grob [Semantic Versioning](https://semver.org/lang/de/).

🔗 **Live-Dashboard:** https://t6vb9ns645-boop.github.io/ecoflow/dashboard/

---

## [3.1.2] — 2026-06-24

### Fixed
- **CSV-Migrations-Bugfix**: Alle 418 historischen Timestamps von UTC auf
  Hamburger Ortszeit (CEST = UTC+2) umgerechnet. Einträge lagen bisher
  2 Stunden hinter der tatsächlichen Lokalzeit.
- Timestamps mit bereits vorhandenem Offset (`+02:00`) werden unverändert
  übernommen — keine Doppelkorrektur möglich.
- `total_pv_wh_daily`-Werte bleiben unverändert; die Zähler wurden nun
  beim nächsten Run (v3.1.1-Fix) korrekt von Mitternacht Hamburger Zeit ab
  akkumuliert.

---

## [3.1.1] — 2026-06-24

### Fixed
- **Timezone-Bug**: Timestamps wurden in UTC gespeichert statt in Hamburger
  Ortszeit (CEST = UTC+2). Alle Einträge lagen 2 Stunden hinter der
  tatsächlichen Lokalzeit.
- **Tageszähler-Reset**: `total_pv_wh_daily` wurde bisher um 02:00 Uhr CEST
  (= Mitternacht UTC) auf 0 zurückgesetzt, nicht um Mitternacht Hamburger Zeit.
- Verwendung von `zoneinfo.ZoneInfo("Europe/Berlin")` (Python-3.9-stdlib,
  kein extra Package) — berücksichtigt automatisch CET/CEST-Wechsel.
- Neue Timestamps tragen expliziten Offset, z. B. `2026-06-24T13:54:20+02:00`;
  das Dashboard-Label (`fmtLabel`) verarbeitet dieses Format korrekt.

---

## [3.1.0] — 2026-06-24

### Added
- **Systemleistung-Diagramm** (Sektion 02, vor dem Tageszähler): zeigt PV-Gesamt,
  AC-Hausverbrauch und Batterie-Leistung als Kurven im Zeitverlauf — gibt auf
  einen Blick einen Überblick über die wichtigsten Leistungsflüsse.

### Changed
- Dashboard-Version auf `v3.1` aktualisiert.

---

## [3.0.0] — 2026-06-24

Vollständige Neustrukturierung des Dashboards aus Profi-Perspektive.

### Added
- **Live-Momentaufnahme** als eigene Hero-Sektion ganz oben: PV-Erzeugung,
  AC-Hausverbrauch, Batterie-Ladezustand und Batterie-Leistung als große
  Kennzahlen mit Stand-Zeitstempel.
- **Dedizierter Bereich „Datenqualität“** (Sektion 06): bündelt sämtliche
  Hinweise zu Nullwerten, Datenabdeckung, Aufzeichnungsfenster und
  Diagnose-Callout an einer Stelle — vorher über vier Bereiche verstreut.
- **Nach Domäne gruppierte Kennzahlen**: eigene KPI-Reihen für Spannungen,
  Temperaturen sowie System & Konnektivität (statt einer gemischten Reihe).
- **WLAN-Signalqualität** als Klartext-Bewertung (sehr gut / gut / mittel /
  schwach) abgeleitet aus dem RSSI-Wert.
- **Versions-Badge** `v3.0` im Header sowie Versions- und Schema-Angabe im Footer.
- Nummerierte Sektionsüberschriften (01–06) mit konsistentem Stil.
- Verbesserte Chart-Tooltips (einheitliches Theme, Hover-Punkte).

### Changed
- Diagramme inhaltlich sortiert: **Energie → Spannungen → Thermik → System →
  Datenqualität**; PV-Erzeugung als wichtigster Graph nach oben gezogen.
- Diagnose-Callout in nutzerfreundliche Sprache übersetzt (kein
  Entwickler-Jargon wie `query_device()` mehr).
- Achsen mit `beginAtZero` für Leistungswerte, fester 0–100 %-Achse für SOC.
- Maximale Inhaltsbreite auf 1000 px erhöht.

### Fixed
- **`.section-label`-CSS wiederhergestellt** — die Abschnittsüberschriften
  waren seit Einbau des Forecast-Panels ohne Styling (versehentlich
  überschrieben).

---

## [2.0.0] — 2026-06-24

Erweiterung um alle verfügbaren API-Kennzahlen und Stabilisierung der Pipeline.

### Added
- **13 zusätzliche Messfelder** in CSV und Dashboard: PV1/PV2/WR-Temperaturen,
  PV1/PV2-Eingangsspannungen, WR-Ausgangsspannung, Netzverbrauch,
  Steckdosen-Ausgang, Dauerleistung, PV→WR-Leistung, Batterie-Lade-Limits
  (unten/oben) und WLAN-RSSI.
- **Forecast-Panel**: Live-Zeitstrahl der nächsten Datenabholungen (cron-job.org,
  alle 2 min) für die kommenden 60 Minuten mit Sekunden-Countdown.
- **Diagramme** für Spannungen, Temperaturen und Leistungsfluss.
- **Automatische CSV-Schema-Migration** (`migrate_csv_if_needed`): erweitert
  den Header bei Schema-Änderungen und füllt Altzeilen verlustfrei auf.
- `CSV_SCHEMA_VERSION`-Konstante zur gezielten Migrationsauslösung.

### Changed
- Adaptive Y-Achsen für Spannungs- und Temperatur-Diagramme: Grenzen werden
  aus den tatsächlichen Messwerten berechnet (±2 V / ±3 °C), damit kleine
  Schwankungen sichtbar bleiben.
- `extract_powerstream()` nutzt `get_field()` statt `or 0`-Verkettung —
  unterscheidet korrekt zwischen fehlendem Feld und gültiger 0.

### Fixed
- **CSV-Header-Migration**: neue Felder erschienen nicht im Dashboard, weil der
  Header bei 7 Spalten blieb, während Zeilen 20 Werte hatten.
- **`DELTA3_SN`** fälschlicherweise als Pflicht-Secret behandelt — ist optional.
- 0-Watt-Messungen wurden im Chart als Lücke statt als Wert dargestellt.
- Zwei JS-Syntaxfehler im Dashboard (doppelte `lastRow`-Deklaration; durch eine
  Cron-Notation `*/2` vorzeitig geschlossener Blockkommentar).

---

## [1.0.0] — 2026-06

Erste produktive Version (GitHub Actions Edition).

### Added
- EcoFlow PowerStream & Delta 3 Datentracker auf Basis der EcoFlow Open
  Platform API v2 (HMAC-SHA256-Signatur).
- Automatische Datenerfassung via GitHub Actions, ausgelöst durch cron-job.org.
- CSV-Export mit 7 Basisfeldern (PV1/PV2, AC-Haus, Batterie SOC/Leistung,
  Tageszähler).
- Erstes Chart.js-Dashboard auf GitHub Pages mit Auto-Refresh.
- Berechnung der Tageserzeugung (Wh seit Mitternacht).

[3.1.2]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.1.2
[3.1.1]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.1.1
[3.1.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.1.0
[3.0.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.0.0
[2.0.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v2.0.0
[1.0.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v1.0.0
