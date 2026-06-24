# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt grob [Semantic Versioning](https://semver.org/lang/de/).

🔗 **Live-Dashboard:** https://t6vb9ns645-boop.github.io/ecoflow/dashboard/

---

## [3.5.2] — 2026-06-24

### Changed
- **Graph X-Achsen-Labels zweizeilig**: Datum (`DD.MM.`) und Uhrzeit (`HH:MM`) werden
  jetzt untereinander dargestellt. Dadurch passen mehr Ticks auf die Achse und es wird
  weniger horizontaler Platz verschwendet.
- Dashboard-Version auf `v3.5.2` aktualisiert.

---

## [3.5.1] — 2026-06-24

---

## [3.5.0] — 2026-06-24

### Added
- **Auto-PR-Merge-Workflow** (`.github/workflows/auto-pr-merge.yml`):
  Pushes auf `claude/**`-Branches erstellen automatisch einen PR gegen `main`.
  Wird ein PR von einem `claude/**`-Branch geöffnet oder aktualisiert,
  mergt der Workflow ihn sofort ohne manuellen Review-Schritt.
  Anschließend greift der bestehende `deploy-pages.yml` und veröffentlicht
  das Dashboard automatisch auf GitHub Pages.
- Dashboard-Version auf `v3.5.0` aktualisiert.

---

## [3.4.0] — 2026-06-24

### Added
- **Passwortschutz (Login-Overlay)**: Das Dashboard ist nun durch ein Passwort
  geschützt. Beim Laden erscheint ein vollflächiger Login-Overlay im bestehenden
  Dark-Theme. Das eingegebene Passwort wird clientseitig mit der Browser-API
  `crypto.subtle` (SHA-256) gehasht und mit dem gespeicherten Hash verglichen —
  kein Klartext im Code oder in der Übertragung.
  Erfolgreiche Authentifizierung wird in `sessionStorage` gehalten (kein erneuter
  Login innerhalb derselben Browser-Session; neues Fenster/Tab erfordert erneute
  Eingabe).
  Passwort ändern: `echo -n "neuespasswort" | sha256sum` → Hash in
  `docs/dashboard/index.html` bei `PW_HASH` eintragen.
- Dashboard-Version auf `v3.4.0` aktualisiert.

---

## [3.3.1] — 2026-06-24

### Fixed
- **Daten immer aktuell (Pages-Deploy-Pipeline)**: Der Data Collector triggert nach jedem
  erfolgreichen Datenpush explizit den `deploy-pages.yml`-Workflow via `workflow_dispatch`.
  Zuvor wurden Collector-Commits mit `[skip ci]` und Pfad-Filter vom Pages-Deploy
  ausgeschlossen — GitHub Pages servierte daher das CSV eingefroren auf dem Stand des
  letzten manuellen Deploys, nicht des letzten Daten-Commits.
- **Staleness-Warnung im Dashboard**: Sind die neuesten Daten älter als 6 Minuten
  (= 3 verpasste Abholungen), wechselt die Statusleiste auf Rot mit Meldung
  „Daten sind X Minuten alt (3+ verpasste Abholungen)".
  Bei aktuellen Daten zeigt die Statuszeile das Alter in Minuten.

---

## [3.3.0] — 2026-06-24

### Added
- **Zeitraum-Filterleiste** im Dashboard zwischen Statusbar und Forecast-Panel:
  - **Schnellauswahl-Buttons**: `Heute | Gestern | 7 Tage | 30 Tage | Diesen Monat | Dieses Jahr | Alle`
  - **Individueller Datepicker**: Zwei Textfelder im Format `tt.mm.jjjj hh:mm` für „von" und „bis"
    mit „Anwenden"-Schaltfläche.
  - Aktiver Filter wird durch goldene Hervorhebung des Buttons angezeigt.
  - Statuszeile der Filterleiste zeigt Anzahl Messwerte und genaue Zeitspanne.
- **Automatische Datenaggregation** für große Zeiträume:
  - Bereiche > 7 Tage → stündliche Durchschnittswerte für die Diagramme.
  - Bereiche > 90 Tage → tägliche Durchschnittswerte für die Diagramme.
- **Zeitraum-adaptive Energie-KPI-Kacheln**: Die vier Kennzahlen in Sektion „02 Energie"
  berechnen sich nun für den gewählten Zeitraum statt fest für „heute".
  Beschriftungen passen sich an: „Energieproduktion heute", „… gestern", „… (7 Tage)" usw.
  Energieberechnungen verwenden stets die Roh-Messdaten (nicht aggregiert), damit die
  zeitgewichtete Integration korrekt bleibt.
- **Filterzustand bleibt bei Auto-Refresh erhalten**: Beim automatischen Nachladen der CSV
  (alle 2 Minuten) wird der zuletzt aktive Filter wiederholt; bei Presets werden die
  Zeitgrenzen aktuell berechnet (sodass „Heute" nach Mitternacht automatisch den neuen Tag zeigt).
- Dashboard-Version auf `v3.3.0` aktualisiert.

---

## [3.2.2] — 2026-06-24

### Fixed
- **Batterie-Vorzeichen korrigiert** (betrifft KPIs + Diagramme):
  `battery_power_watt < 0` bedeutet **Laden** (nicht Entladen).
  Während Hochsolar (11–16 Uhr) zeigt die Batterie −400 W →
  Batterie lädt aus PV-Überschuss (physikalisch korrekt).
  - `energyBattWh` („Energie aus Batterie heute") zählt jetzt korrekt
    nur positive Werte (= Entladung).
  - `energyFeedWh` („Netzeinspeisung") zieht jetzt negative Batterie-
    werte als Ladeleistung ab (statt irrtümlich positive).
- **Netzverbrauch (`grid_cons_watt`) auf ≥ 0 geclippt**: negative Werte
  (physikalisch unmöglich für Verbrauch) werden auf 0 gesetzt.
- **Zweite Y-Achse rechts** mit synchroner Skala zur linken Achse
  in zwei Diagrammen eingeführt:
  - „Leistungsfluss": Netzverbrauch auf rechter Achse (gleiche Skala).
  - „Systemleistung": Batterie-Leistung auf rechter Achse (gleiche
    Skala), damit Lade-/Entladeleistung direkt mit PV verglichen
    werden kann ohne die linke Skala zu verzerren.

---

## [3.2.1] — 2026-06-24

### Fixed
- **Energieproduktion heute** zeigte ~50 % zu niedrigen Wert, weil
  `total_pv_wh_daily` in der CSV mit `/60` (Annahme: 1-Minuten-Intervall)
  berechnet wurde, die Daten aber alle 2 Minuten eintreffen.
  Die KPI-Kachel nutzt jetzt `calcEnergyWh()` mit echten Zeitstempeln —
  dieselbe Methode wie alle anderen drei KPIs.
- `calculate_daily_energy` in `ecoflow_tracker_github.py` nutzt jetzt echte
  Δt-Zeitdifferenzen zwischen Messpunkten statt des festen Teilers `/60`,
  sodass auch das kumulative Liniendiagramm in Sektion 02 korrekte Werte zeigt.

---

## [3.2.0] — 2026-06-24

### Added
- **Tagesenergie-KPIs in Sektion „02 Energie"**: Vier neue Kennzahlen werden
  oberhalb der Graphen als Hero-Kacheln (identische Darstellung wie
  „01 Live-Momentaufnahme") angezeigt:
  - **Energieproduktion heute** — kumulierte PV-Erzeugung (PV1 + PV2) seit
    Mitternacht in Wh/kWh, direkt aus dem bereits berechneten
    `total_pv_wh_daily`-Feld.
  - **Energieverbrauch heute** — Energie aus Smart Plugs + Grundlast
    (`inv_to_plug_watt + permanent_watt` × Δt), in Wh/kWh.
  - **Energie aus Batterie heute** — kumulierte Entladeleistung
    (`battery_power_watt < 0`) seit Mitternacht, in Wh/kWh.
  - **Netzeinspeisung heute** — berechneter Überschuss, der ins Stromnetz
    eingespeist wird (PV − Verbrauch − Batterieladung), in Wh/kWh.
- Werte ≥ 1000 Wh werden automatisch als kWh (zweistellig) dargestellt.
- Dashboard-Version auf `v3.2.0` aktualisiert.

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
- **Dedizierter Bereich „Datenqualität"** (Sektion 06): bündelt sämtliche
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
- Achsen mit `beginAtZero` für Leistungswerte, fester 0–100 %-Achse für SOC.
- Maximale Inhaltsbreite auf 1000 px erhöht.

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
  aus den tatsächlichen Messwerten berechnet (±2 V / ±3 °C), damit kleine
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

[3.5.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.5.0
[3.4.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.4.0
[3.3.1]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.3.1
[3.3.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.3.0
[3.2.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.2.0
[3.1.2]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.1.2
[3.1.1]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.1.1
[3.1.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.1.0
[3.0.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.0.0
[2.0.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v2.0.0
[1.0.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v1.0.0
