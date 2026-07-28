# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt grob [Semantic Versioning](https://semver.org/lang/de/).

🔗 **Live-Dashboard:** https://t6vb9ns645-boop.github.io/ecoflow/dashboard/

---

## [4.3.1] — 2026-07-28

### Fixed
- **Kommandoleiste in mobiler Ansicht: nur die Versionsliste war klickbar**:
  Die Kommandoleiste (`.command`) ist `position:sticky`, damit sie beim
  Scrollen sichtbar bleibt. Solange der geöffnete Menübereich (Version +
  Datenaktualisierung + Zeitraum zusammen) höher war als das Viewport,
  blieb der über die Versionsliste hinausragende Rest (Datenaktualisierung,
  Zeitraum) unerreichbar: ein gestickytes Element zeigt beim Scrollen immer
  nur das eigene obere Ende, nicht den überschüssigen Inhalt darunter — auf
  kurzen Mobil-Viewports betraf das praktisch die gesamte Versionsliste
  (bislang eine ausgeschriebene Liste mit Titel + Datum je Version).
  `.command-body-inner` bekommt jetzt ein `max-height` (`min(64vh,560px)`)
  mit `overflow-y:auto` — der offene Menübereich bleibt dadurch verlässlich
  unterhalb der Viewporthöhe und ist bei Bedarf zusätzlich intern
  scrollbar, unabhängig vom Sticky-Verhalten der Leiste.
- Die Versionsliste ist jetzt ein kompaktes `<select>`-Dropdown
  (`#versionSelect`) statt einer ausgeschriebenen Liste — reduziert die
  Höhe der „Version"-Gruppe deutlich und macht „Datenaktualisierung" und
  „Zeitraum" auf den meisten Geräten schon ohne Scrollen sichtbar. Auswahl
  einer archivierten Version navigiert wie zuvor per Link dorthin; die
  aktuelle sowie (noch) nicht archivierte Versionen bleiben als
  deaktivierte Einträge rein informativ (unverändert gegenüber der
  bisherigen Liste).

### Rückwärtskompatibilität
- Rein clientseitige Markup-/CSS-/JS-Änderung an `docs/dashboard/index.html`
  (Kommandoleiste); `versions/manifest.json`-Schema und die Berechnungs-
  module (`lib/*.mjs`) sind unverändert.

## [4.3.0] — 2026-07-28

### Added
- **Netz-Knoten zeigt jetzt Netzbezug UND Einspeisung, analog zum Speicher**:
  Bisher stellte der „Netz"-Knoten im Leistungsfluss-Diagramm (Tab 01) nur
  den Netzbezug dar (`grid_cons_watt`); die unabhängig berechnete
  Netzeinspeisung (`feedInPower()`) tauchte nur als Text-Hinweis unter
  „Hausnetz — Gesamtverbrauch" auf, nicht am Netz-Knoten selbst. Der Knoten
  zeigt jetzt — wie die Speicher-Karte beim Laden/Entladen — einen
  vorzeichenbehafteten Saldo, ein Zustands-Pill („bezieht"/„speist ein") und,
  wenn im gewählten Zeitraum beide Richtungen vorkamen, beide Anteile
  getrennt (`↓ Einspeisung · ↑ Netzbezug`). Die Netz-Kante im Diagramm dreht
  dafür ihre Richtung mit dem Saldo um (Netz → Hausnetz bzw. Hausnetz →
  Netz), genau wie die Speicher-Kante mit dem Vorzeichen der
  Batterieleistung.
- `energy.mjs`: neue Funktionen `isGridExporting()` und `gridState()` sowie
  die abgeleiteten Felder `gridNet`, `gridExporting`, `gridMagnitude`,
  `gridState` in `flowModel()` und `flowCumulative()` — spiegeln die
  bestehende Batterie-Vorzeichenkonvention (`charging`, `batteryMagnitude`,
  `batteryState`) für das Netz.
- `layout.mjs`: `buildEdges()` dreht die Netz-Kante jetzt analog zur
  Speicher-Kante, wenn die Einspeisung den Netzbezug übersteigt.

### Rückwärtskompatibilität
- Bestehende Felder (`gridConsumption`, `feedIn`) bleiben unverändert; nur
  neue Felder kamen hinzu. `houseBreakdown()`/`houseTotalWatt()` sind nicht
  betroffen.

## [4.2.2] — 2026-07-27

### Fixed
- **Smart-Plug-Spannung und -Temperatur waren um Faktor 10 zu klein**: Seit
  Einführung der Smart-Plug-Erfassung (v3.7.0) ging `extract_smartplug()` in
  `ecoflow_tracker_github.py` — auf Basis der undokumentierten Community-
  Referenz [hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud)
  — davon aus, dass `volt` und `temp` wie bei PowerStream Integer×10 kodiert
  sind, und teilte beide Werte durch 10. Anhand der `DEBUG`-Rohdaten der
  ersten produktiven Plugs (GitHub-Actions-Log, 27.07.) verifiziert: Beide
  Felder liefern bereits Endwerte (z. B. `volt=235` → 235 V, `temp=34` →
  34 °C). Dashboard und CSV zeigten dadurch bislang ca. 23 V statt ~230 V
  (deutsche Netzspannung) und ca. 3 °C statt ~30 °C (Gerätetemperatur) — beides
  physikalisch nicht plausibel und im Live-Modus der Smart-Plug-Kacheln (Tab
  02, siehe v4.2.0) sichtbar.
- `volt`/`temp_c` werden jetzt unskaliert übernommen; `watts` (×10, Dezi-Watt)
  und `current_a` (÷1000, Milliampere) waren bereits korrekt und bleiben
  unverändert.
- **Bestehende Messwerte werden automatisch geheilt**: Neue Funktion
  `fix_smartplug_scale_if_needed()`, läuft wie `migrate_csv_if_needed()` bei
  jedem Collector-Start mit und korrigiert `volt`/`temp_c` ×10 in Zeilen, die
  noch die alte Skalierung tragen (erkannt an `volt < 100` — physikalisch
  unmöglich für ein am 230-V-Netz betriebenes Gerät). Idempotent, daher
  gefahrlos dauerhaft aktiv; bereits korrekte Zeilen bleiben unangetastet.
  Bewusst keine manuelle Einmal-Migration der CSV: Die Datei wächst im
  selben Repository weiterhin automatisiert alle ~2 Minuten, ein direkter
  Rewrite hätte mit jedem parallelen Collector-Lauf einen Merge-Konflikt
  riskiert. Die Selbstheilung korrigiert stattdessen alle bis zum ersten
  Lauf nach diesem Fix aufgelaufenen Zeilen automatisch in einem Rutsch
  (anders als beim WR-Temperatur-Fix in v3.6.1, der nur zukünftige Werte
  betraf, aber ohne dessen Merge-Konflikt-Risiko).

### Changed
- `tests/test_ecoflow_tracker.py`: Testdaten für `extract_smartplug()` auf
  reale, plausible Rohwerte umgestellt (volt/temp ohne ×10-Annahme); neue
  Tests für `fix_smartplug_scale_if_needed()` (Korrektur, Idempotenz,
  gemischte Alt-/Neu-Zeilen, Null-/Leerwerte).
- README: Hinweis zur Smart-Plug-Skalierung aktualisiert — als verifiziert
  markiert statt als offene Prüfung.

### Rückwärtskompatibilität
- **Kein Schema-Wechsel**: Spalten und `SMARTPLUG_SCHEMA_VERSION` bleiben
  unverändert, nur die Werte in `volt`/`temp_c` wurden korrigiert.
- Dashboard-seitig war keine Code-Änderung nötig — `csv.mjs` übernimmt die
  Spalten ungeprüft, die Korrektur wirkt allein über die Werte in der CSV.

## [4.2.1] — 2026-07-27

### Fixed
- **PV-Überschuss, der ins öffentliche Netz eingespeist wird, zählte fälschlich
  als Hausnetz-Verbrauch**: Die „Hausnetz — Gesamtverbrauch"-Aufschlüsselung
  (Tab 01, Leistungsfluss) bildete die Lücke zwischen dem gemessenen
  Wechselrichter-Ausgang (`ac_house_watt`) und den erfassten Teilströmen
  (Smart Plugs + Grundbedarf) vollständig als Posten „Sonstiges / nicht
  erfasst" ab — also als (unbekannten) Verbraucher im Haus. Tatsächlich
  entsteht diese Lücke typischerweise, wenn die Smart Plugs wenig
  verbrauchen UND der Speicher voll ist (nicht mehr lädt): Der
  Wechselrichter gibt dann weiterhin die volle PV-Leistung aus, die vom
  Haus nicht abgenommene Restleistung fließt aber ins öffentliche Netz statt
  irgendwo im Haus verbraucht zu werden. Betraf reale Messwerte im
  Datensatz (z. B. 25.07. 19:20 Uhr: 107 W Wechselrichter-Ausgang bei nur
  84 W erfasstem Verbrauch und vollem, nicht ladendem Speicher).
- Die bereits vorhandene, unabhängig aus PV/Speicher/Hausverbrauch berechnete
  Einspeise-Schätzung (`feedInPower()`, bisher nur für die Energie-Kennzahl
  „Einspeisung" in Sektion 02 genutzt) wird jetzt auch in der
  Leistungsfluss-Aufschlüsselung berücksichtigt: Der dadurch erklärte Anteil
  der Lücke zählt nicht mehr zum Hausnetz-Verbrauch (weder im Gesamtwert
  noch im „Sonstiges / nicht erfasst"-Posten). Ein durch Einspeisung nicht
  erklärter Rest bleibt weiterhin als „Sonstiges / nicht erfasst" sichtbar.
  Ein neuer Hinweistext unter „Hausnetz — Gesamtverbrauch" macht die
  ausgeschlossene Einspeisemenge transparent, sobald sie auftritt. Gilt für
  Live- und Σ-Zeitraum-Modus sowie jeden gewählten Zeitraum-Filter
  gleichermaßen.

### Added
- `flowModel()`/`flowCumulative()` liefern jetzt zusätzlich `feedIn`
  (W bzw. Wh, dieselbe Berechnung wie `feedInPower()`/`energyTotals()`).
- `houseBreakdown()` gibt zusätzlich `feedIn` zurück (die vom Hausnetz-Total
  ausgeschlossene Einspeisemenge).
- 7 neue Tests (`energy.test.mjs`) für die Reklassifizierung, inkl.
  Regressionsfall ohne Einspeisung und Σ-Zeitraum-Fall.

### Rückwärtskompatibilität
- **Ohne Einspeisung unverändert**: Ist `feedInPower()` 0 (z. B. weil der
  Speicher den gesamten PV-Überschuss lädt), bleiben Aufschlüsselung und
  Gesamtverbrauch exakt wie zuvor — bestehende Tests dafür bleiben grün.

## [4.2.0] — 2026-07-27

### Added
- **Smart-Plug-Kacheln (Tab 02 → 06) zeigen jetzt strukturierte Messdaten,
  passend zum gewählten Ansichtsmodus**: Bisher zeigte jede Kachel unabhängig
  vom Modus stets nur die letzte Momentanleistung (W) und den Schaltzustand.
  - **Live-Modus**: weiterhin die Leistung groß, zusätzlich einheitlich für
    alle Kacheln Spannung (V), Strom (A), Temperatur (°C) und
    LED-Helligkeit als kleines, strukturiertes Detailraster.
  - **Σ-Zeitraum-Modus**: die Kacheln zeigen ausschließlich die über den
    Menü-Filter kumulierte Energie (Wh/kWh) je Steckdose — Momentanwerte wie
    Spannung/Strom/Temperatur haben über einen Zeitraum keine sinnvolle
    Summe und entfallen dort bewusst.
- `cumulativePlugSummary()` in `plugs.mjs`: Gesamtenergie (Wh) über alle
  Smart Plugs im Σ-Zeitraum-Modus, Pendant zu `plugSummary()`.
- `vm.plugs.cumulative` / `vm.plugs.cumulativeSummary` im View-Model: nutzen
  dieselbe zeitgewichtete Integration wie die bereits bestehende
  Hausnetz-Aufschlüsselung im Σ-Modus (`cumulativePlugMeasurements()`,
  siehe v4.1.1), jetzt auch für Tab 02 verfügbar.
- 4 neue Tests (`plugs.test.mjs`, `viewmodel.test.mjs`) für die kumulierte
  Gesamtenergie über alle Plugs.

### Rückwärtskompatibilität
- **Live-Modus-Kennzahlen unverändert**, nur um zusätzliche Felder ergänzt.
  Der Σ-Zeitraum-Modus für Tab 02 ist neu; frühere Versionen zeigten dort
  weiterhin die letzte Momentanmessung statt kumulierter Energie.

## [4.1.1] — 2026-07-27

### Fixed
- **„Ø Zeitraum" zeigte einen Leistungsmittelwert statt kumulierter Energie**:
  Die Leistungsübersicht bot neben der Live-Momentaufnahme (W) einen zweiten
  Modus „Ø Zeitraum" an, der aber lediglich alle Rohfelder im gewählten
  Menü-Filter arithmetisch mittelte (`averageRow()`) und daraus wie im
  Live-Modus eine Momentanleistung berechnete — irreführend neben einer
  echten Momentaufnahme und ohne Bezug zur tatsächlich geflossenen Energie
  über den Zeitraum. Betroffen waren PV1/PV2/Wechselrichter, Speicher
  (inkl. Lade-/Entladeanteil), Netz, Hausnetz-Gesamtverbrauch und jeder
  Posten der Hausnetz-Aufschlüsselung (Smart Plugs, Grundbedarf, Rest,
  Netzbezug) — dort wurde zusätzlich nur der letzte Messwert je Plug
  gezeigt, nicht dessen Verbrauch über den Zeitraum.
- Der Modus heißt jetzt **„Σ Zeitraum"** und zeigt die über den eingestellten
  Menü-Filter **kumulierte Energie** (Wh/kWh) — zeitgewichtet aus den
  Rohmessungen aufsummiert (`calcEnergyWh()`), exakt wie die bereits
  bestehenden Energie-Kennzahlen in Sektion 02. Der Ladezustand (SOC) ist
  davon ausgenommen, da ein Prozentwert sich nicht aufsummieren lässt; er
  zeigt weiterhin den letzten bekannten Stand im Zeitraum.

### Added
- `flowCumulative()` in `energy.mjs`: kumuliertes Pendant zu `flowModel()`
  mit denselben Feldnamen (Wh statt W), inkl. getrennter Lade-/Entladeenergie
  für den Speicher.
- `cumulativePlugMeasurements()` in `plugs.mjs`: kumulierte Energie je Smart
  Plug über den Zeitraum, als Pendant zu `latestPlugMeasurements()`.
- 20 neue Tests (`energy.test.mjs`, `plugs.test.mjs`, `viewmodel.test.mjs`)
  für die kumulierten Kennzahlen, inkl. Regressionsfall für die
  zeitgewichtete Linksregel bei wechselndem Lade-/Entladevorzeichen.

### Fixed (Versionsarchiv)
- **v4.0.0 fehlte im Versionsarchiv**: Beim Bump auf v4.1.0 wurde der
  vorherige Stand entgegen dem in `manifest.json` dokumentierten Prozess nie
  nach `versions/v4.0.0/` kopiert — der Eintrag wurde einfach auf v4.1.0
  umgeschrieben. v4.0.0 war dadurch nicht mehr aufrufbar. Aus dem Commit-Stand
  unmittelbar vor dem Versions-Bump rekonstruiert (inkl. der zu dieser Version
  gehörenden `lib/*.mjs`) und nachträglich archiviert.
- **Archivierte Versionen ab v4.0.0 (Modul-Struktur) verlinkten die
  Versionsliste falsch**: Der Link-Aufbau im Menü nutzt Pfade relativ zu
  `docs/dashboard/` (z. B. `versions/v3.7.0/index.html`); aus einer
  Archiv-Kopie heraus (zwei Verzeichnisebenen tiefer) zeigten diese Links
  daher ins Leere. Betrifft v4.0.0 und v4.1.0 gleichermaßen, da beide
  bereits die Versionsliste besitzen (v3.7.0 ist noch das alte
  Einzeldatei-Dashboard ohne dieses Menü und war nicht betroffen). Für beide
  Archiv-Kopien um `../../` ergänzt.

### Rückwärtskompatibilität
- **Live-Modus unverändert.** Nur der Zeitraum-Modus der Leistungsübersicht
  ändert sich; die Energie-Kennzahlen in Sektion 02 waren von diesem Fehler
  nie betroffen (sie nutzten schon vorher `calcEnergyWh()`).
- **v4.0.0 und v4.1.0 bleiben über das Versionsmenü erreichbar**, mit den
  bekannten Verhalten dokumentiert und Rückweg zur aktuellen Fassung; beide
  wurden per Browser-Test (Datenladen, Zeitraum-Filter, Leistungsfluss-Toggle,
  Rückweg-Link) verifiziert.

### Hinweis zur Versionierung
PATCH-Bump: Korrektur fehlerhaft dargestellter/beschrifteter Messwerte,
keine neue Fähigkeit, keine Breaking Changes an CSV-Schema oder den
bestehenden Energie-Kennzahlen.

---

## [4.1.0] — 2026-07-27

### Fixed
- **Netzbezug im Hausnetz war in der Leistungsübersicht unsichtbar**: Reicht das
  Balkonkraftwerk (PV/Speicher) nicht aus, um den Hausbedarf zu decken — z. B.
  weil die Smart Plugs mehr Leistung ziehen, als gerade erzeugt wird —, bezieht
  die Anlage automatisch den Rest aus dem Stromnetz (`grid_cons_watt`). Dieser
  Wert wurde zwar seit Schema v2 erfasst und in `flowModel()` sogar schon
  berechnet (`gridConsumption`), aber nirgends dargestellt: Der Knoten
  „Hausnetz" zeigte nur den vom Wechselrichter gelieferten Anteil
  (`ac_house_watt`), während die darunter einzeln aufgeschlüsselten Smart Plugs
  ihre tatsächliche — ggf. netzgedeckte — Leistung zeigten. An echten
  Messdaten (27.07., 08:xx Uhr) ließ sich das Auseinanderlaufen konkret
  nachweisen: „Hausnetz 0 W" bei gleichzeitig ca. 58–89 W Smart-Plug-Verbrauch,
  gedeckt aus dem Netz (`grid_cons_watt` 59–171 W je Messpunkt), während die
  komplette PV-Leistung in den Speicher lief.

### Added
- **Diagramm-Knoten „Netz"** in der Leistungsübersicht, symmetrisch zum
  Speicher-Knoten positioniert. Er speist das Hausnetz über eine eigene Kante
  **direkt und unabhängig vom Wechselrichter** — genau wie in der Realität:
  Balkonkraftwerk und Netzanschluss speisen denselben Sicherungskasten. Aktiv
  (bewegte Kante) nur, wenn tatsächlich Netzstrom fließt; sonst blass/gepunktet
  wie die übrigen inaktiven Kanten.
- **Posten „Netzbezug (vom Balkonkraftwerk nicht gedeckt)"** in der
  Hausnetz-Aufschlüsselung, wenn `grid_cons_watt > 0`.
- **„Hausnetz — Gesamtverbrauch"** ersetzt „Hausnetz — AC-Verbrauch" als
  Kopfzeile: der Gesamtwert ist jetzt `ac_house_watt + grid_cons_watt` statt nur
  des Wechselrichter-Anteils, passend zu den beiden jetzt sichtbaren Quellen.
- `houseTotalWatt(flow)` in `energy.mjs` als Hilfsfunktion für diesen
  kombinierten Gesamtwert.
- 12 neue Tests (`energy.test.mjs`, `layout.test.mjs`) für Netzbezug-Posten,
  Diagramm-Kante und Knoten-Geometrie, u. a. mit den oben genannten echten
  Messwerten als Regressionsfall.

### Geprüft, nicht umgesetzt
- **Neue CSV für Stromverbrauch**: nicht sinnvoll. `grid_cons_watt` liegt
  bereits seit Schema v2 in `docs/ecoflow_energie_daten.csv` und durchläuft
  Parsing, Aggregation und Nullwert-Prüfung unverändert — der Fehler lag
  ausschließlich in der Darstellung, nicht in der Datenhaltung. Eine eigene CSV
  würde denselben Messwert nur duplizieren. Sinnvoll wäre das erst, wenn
  EcoFlow Netzbezug pro Smart Plug statt nur als Haushaltssumme melden würde —
  das gibt die aktuelle API nicht her.

### Hinweis zur Versionierung
MINOR-Bump: neue, sichtbare Fähigkeit (Netz-Knoten/-Kante, neuer
Aufschlüsselungsposten) auf Basis bereits vorhandener Daten, keine
Breaking Changes an CSV-Schema, Collector oder bestehenden Berechnungen.

---

## [4.0.0] — 2026-07-27

Neustrukturierung der Oberfläche und erstmals testbare Dashboard-Logik.

### Added
- **Stromfluss-Diagramm („Leistungsübersicht")**: Zeigt den Energiefluss von
  den beiden Solarpanels in den Wechselrichter, zwischen Wechselrichter und
  Speicher sowie vom Wechselrichter ins Hausnetz. Der Wechselrichter ist dabei
  der einzige zentrale Knoten — der Speicher hängt ausschließlich an ihm, und
  das Hausnetz wird ausschließlich über ihn versorgt.
  - Das Hausnetz ist **je Smart Plug einzeln** aufgeschlüsselt, zuzüglich des
    eingestellten Grundbedarfs (`permanent_watt`). Die Anzahl der Posten passt
    sich automatisch an die Zahl der verbundenen Plugs an.
  - Umschaltbar zwischen **Live-Momentaufnahme** (letzte Messung) und
    **Ø Zeitraum** (Durchschnitt über den gewählten Filter).
  - Aktiver Fluss wird durch bewegte Striche dargestellt, fehlender Fluss durch
    eine blasse Punktlinie. Der Zustand steckt in Muster *und* Farbe und bleibt
    dadurch bei `prefers-reduced-motion`, im Screenshot und bei
    Farbfehlsichtigkeit lesbar.
- **Zwei Ansichten als Tabs**: „01 Leistungsübersicht" und „02 Einzelwerte"
  (alle bisherigen Kennzahlen und Diagramme). Wechsel über sichtbare Reiter am
  Desktop und über **Wischgesten** auf dem Smartphone. Der gewählte Zeitraum
  gilt für beide Ansichten und wird aus einer gemeinsamen Quelle berechnet, ein
  Tabwechsel kann die Werte daher nicht verändern.
- **Vereinheitlichtes Kommandomenü**: Version, Datenaktualisierung und
  Zeitraum-Filter liegen in einem einklappbaren Menü. Zusammengeklappt zeigt es
  die aktiven Werte (Version, Datenalter, Zeitraum), aufgeklappt alle Optionen.
- **Versionsarchiv als echter Rückfallweg**: Frühere Dashboard-Stände sind über
  das Menü aufrufbar und voll benutzbar — sie lesen dieselbe CSV und liefern
  dieselben Energie-Kennzahlen. `docs/dashboard/versions/vX.Y.Z/index.html` hält
  den Snapshot, `versions/manifest.json` dient als Index. Jede archivierte
  Version trägt oben einen Hinweisbalken mit **Rückweg zur aktuellen Fassung**,
  damit der Wechsel in beide Richtungen möglich ist.
  - Nachgewiesen: derselbe 7-Tage-Zeitraum ergibt in v3.7.0 und v4.0.0
    identische Werte (13,07 / 7,90 / 4,65 / 4,30 kWh).
  - Ein Test hält den Gleichstand dauerhaft fest: Er rechnet die
    Energieformeln aus v3.7.0 als Referenz nach und vergleicht sie mit den
    v4-Modulen — auf synthetischen Tagesverläufen und auf dem gemischten
    Altbestand.
- **Getrennte Lade-/Entladeanzeige im Ø-Modus**: Ein Zeitraum-Mittelwert
  verrechnet beide Richtungen zu einer Zahl — lädt der Speicher zeitweise mit
  34 W und entlädt mit 29 W, bleiben netto nur −5 W übrig, was wie Stillstand
  aussieht. Kamen beide Richtungen vor, weist das Speicher-Feld sie jetzt
  zusätzlich getrennt aus (`↓ laden · ↑ entladen`).
- **Automatische Tests für die Dashboard-Logik**: 138 Tests mit dem in Node 22
  eingebauten Test-Runner — keine neue Abhängigkeit, konsistent zu den
  bestehenden Python-Tests (stdlib `unittest`). Abdeckung der Berechnungsmodule:
  100 % Lines, 96,6 % Branches, 100 % Functions; die Schwelle von 85 % wird im
  Testlauf erzwungen (`npm run test:coverage`).
- **CI-Workflow `tests.yml`**: Führt Node- und Python-Tests bei Push und Pull
  Request aus. Reine Messdaten-Commits lösen keinen Lauf aus.

### Changed
- **Berechnungslogik aus `index.html` ausgelagert** nach
  `docs/dashboard/lib/*.mjs` (CSV-Parsing, Energie-Kennzahlen, Filter und
  Aggregation, Plug-Gruppierung, Diagramm-Geometrie, View-Model). Die Module
  werden vom Browser per `<script type="module">` und vom Test-Runner
  gleichermaßen importiert — Voraussetzung dafür, die Logik überhaupt testen
  zu können.
- **Neues Interface**: kontrastreiche Darstellung auf nahezu schwarzem Grund,
  Archivo für Text und JetBrains Mono für alle Zahlen (Tabellenziffern). Die
  Datenfarben (Amber, Teal, Periwinkle, Rose) sind gegen Farbfehlsichtigkeit
  geprüft — paarweise ΔE ≥ 8 in Deutan-, Protan- und Tritan-Simulation, Kontrast
  ≥ 3:1 gegen den Hintergrund.
- **Auto-Merge-Workflow respektiert Entwürfe**: PRs von `claude/**`-Branches
  werden als Entwurf angelegt und nicht mehr ungefragt gemergt. Der bestehende
  Automatismus greift, sobald ein PR über „Ready for review" freigegeben wird.

### Fixed
- **Batterie-Vorzeichen in der Live-Momentaufnahme**: Die Kachel zeigte Laden
  und Entladen vertauscht an (`lädt` bei `battery_power_watt > 0`). Sie folgt
  jetzt der bereits in [3.2.2] dokumentierten und an Messdaten verifizierten
  Konvention `< 0 = laden`, wie der Rest der Auswertung. Betroffen waren die
  Beschriftung der Kachel und der Untertitel des Batterie-Diagramms; die
  Energie-Kennzahlen waren bereits korrekt.
- **Smart-Plug-Farben bleiben stabil**: Die Farbe wurde bisher über die
  Listenposition vergeben und wechselte, sobald Plugs hinzukamen, ausfielen oder
  sich die Sortierung änderte. Sie leitet sich jetzt aus der Seriennummer ab.
- **Ausfall der Diagrammbibliothek reißt nicht mehr die ganze Seite mit**: Ein
  fehlgeschlagener Chart.js-Abruf ließ zuvor das komplette Rendering scheitern,
  inklusive Kennzahlen und Stromflussdiagramm. Diagramme fallen jetzt einzeln
  auf einen Hinweis zurück. Abruf- und Darstellungsfehler werden getrennt
  gemeldet statt beide als „Netzwerkfehler".
- **`.gitignore` schloss Dashboard-Code aus**: Das Python-Muster `lib/` griff
  auf jedes Verzeichnis dieses Namens und hätte `docs/dashboard/lib/`
  stillschweigend von der Versionierung ausgenommen. Das Muster ist jetzt auf
  das Wurzelverzeichnis begrenzt.

### Rückwärtskompatibilität
- **Datenformat unverändert.** v4.0.0 liest denselben CSV-Bestand wie alle
  Vorgänger: Zeilen aus dem alten 7-Spalten-Schema, migrierte Zeilen mit leeren
  v2-Feldern und vollständige neue Zeilen — auch gemischt in einer Datei.
  Fehlende Felder bleiben als „kein Messwert" erkennbar und werden nicht
  fälschlich als 0 gewertet. Auch Spalten in abweichender Reihenfolge oder
  zusätzliche, unbekannte Spalten stören die Auswertung nicht.
- **Berechnungen unverändert.** Die Energieformeln liefern dieselben Zahlen wie
  v3.7.0; ein Test vergleicht beide Implementierungen direkt. Auch die
  Nullwert-Erkennung der Datenqualität arbeitet nach derselben Regel.
- **Rückfall jederzeit möglich.** v3.7.0 bleibt über das Versionsmenü erreichbar
  und voll benutzbar, mit Rückweg zur aktuellen Fassung.

### Hinweis zur Versionierung
MAJOR-Sprung, weil die Oberfläche neu strukturiert ist (Tabs statt einer
durchgehenden Seite, Filter im Menü statt in einer eigenen Leiste) und die
Dashboard-Logik in eigene Module umgezogen ist. Datenformat und Collector
bleiben unverändert — bestehende CSV-Dateien werden ohne Migration gelesen.

---

## [3.7.0] — 2026-07-26

### Added
- **Smart-Plug-Erfassung (9+ Steckdosen)**: Beliebig viele EcoFlow Smart Plugs
  können jetzt zusätzlich zu PowerStream/Delta 3 erfasst werden, konfiguriert
  über das neue optionale Secret `SMARTPLUGS_JSON` (JSON-Liste aus
  Seriennummer + Name). Neue Plugs hinzufügen erfordert keinen Code- oder
  Workflow-Change.
- Neue Datei `docs/ecoflow_smartplugs_daten.csv` im **Long-/Tidy-Format**
  (eine Zeile pro Plug pro Messzeitpunkt: `timestamp, plug_sn, plug_name,
  watts, switch_sta, volt, current_a, temp_c, led_brightness`) — bewusst
  getrennt von der Haupt-CSV, damit die Spaltenzahl nicht mit jeder
  Plug-Änderung wächst (Wide-Format wäre bei 9+ Geräten unpraktikabel).
  Eigene Schema-Versionierung (`SMARTPLUG_SCHEMA_VERSION`) mit derselben
  automatischen Migration wie die Haupt-CSV.
- Dashboard: neuer Bereich **„06 Smart Plugs"** — KPI-Kachel für den
  Gesamtverbrauch, eine Kachel je Plug (Watt + An/Aus) und ein
  Zeitverlauf-Chart mit einer Linie pro Gerät. Der bisherige Bereich
  „Datenqualität" ist entsprechend zu „07" gerückt. Der Bereich bleibt
  ausgeblendet, solange keine Smart Plugs konfiguriert sind.
- `tests/test_ecoflow_tracker.py`: erste Unit-Tests des Projekts (stdlib
  `unittest`, kein neues Dependency) für Smart-Plug-Extraktion,
  `SMARTPLUGS_JSON`-Parsing und die generalisierte CSV-Migration.

### Changed
- `migrate_csv_if_needed()` generalisiert (Dateiname/Feldliste/Schema-Version
  als Parameter statt fest verdrahteter Konstanten), damit sie für beide
  CSV-Dateien wiederverwendbar ist.
- Dashboard-CSV-Parser liest Felder jetzt Anführungszeichen-bewusst
  (RFC4180-artig) statt naivem `split(',')` — nötig, da frei vergebene
  Plug-Namen Kommas enthalten können.

### Hinweis
Die Feldnamen und die Skalierung der EcoFlow-Smart-Plug-API sind nicht
offiziell dokumentiert; sie stammen aus der Community-Referenz
[hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud). Beim
ersten produktiven Plug empfiehlt sich ein Blick ins `DEBUG`-Log des
Workflow-Runs zur Verifikation der Rohwerte.

---

## [3.6.1] — 2026-06-25

### Fixed
- **WR-Temperatur korrigiert**: Die Wechselrichter-Temperatur (WR) wurde fälschlich
  aus dem API-Feld `llcTemp` gelesen, das exakt denselben Wert wie `pv1Temp` liefert.
  Dadurch zeigten PV1 und WR im Dashboard stets dieselbe Temperatur, während PV2
  abwich. Der WR liest jetzt primär das korrekte Feld `invTemp` (mit `llcTemp` als
  Fallback). Bestehende Messwerte in der CSV bleiben unverändert; ab sofort erfasste
  Werte zeigen die tatsächliche WR-Temperatur.
- Dashboard-Version auf `v3.6.1` aktualisiert.

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

[4.0.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v4.0.0
[3.7.0]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.7.0
[3.6.1]: https://github.com/t6vb9ns645-boop/ecoflow/releases/tag/v3.6.1
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
