# ISO 27001 & SOC 2 — Bewertung des EcoFlow BKW Datentrackers

**Stand:** 2026-08-16 · **Bewertete Version:** 4.3.2 · **Prüfumfang:** Repository
`t6vb9ns645-boop/ecoflow` (Collector, GitHub-Actions-Pipeline, Dashboard,
Datenhaltung)

---

## 0. Einordnung: Was hier überhaupt prüfbar ist

ISO/IEC 27001 und SOC 2 zertifizieren **Organisationen und deren
Managementsysteme**, nicht Anwendungen. Es gibt kein „ISO-27001-konformes
Python-Skript". Eine ISO-27001-Zertifizierung setzt ein vollständiges ISMS
voraus (Kontext, Führung, Risikomanagement, Anwendbarkeitserklärung, interne
Audits, Management-Review); ein SOC-2-Type-II-Bericht setzt einen
Wirtschaftsprüfer und einen Nachweiszeitraum von 3–12 Monaten voraus.

Für ein privat betriebenes Ein-Personen-Projekt ist beides weder erreichbar
noch verhältnismäßig — das ist **kein Mangel des Projekts**, sondern eine
Frage des Anwendungsbereichs.

Sinnvoll und hier durchgeführt ist deshalb die zweite Frage: **Welche der
technischen Controls aus ISO 27001:2022 Annex A und der SOC-2 Trust Services
Criteria erfüllt das Setup, und wo verletzt es sie?** Diese Controls sind auch
ohne Zertifizierung ein brauchbarer Maßstab für ein System, das
Haushalts-Verbrauchsdaten erhebt und veröffentlicht.

### Gesamtbild

Das Projekt ist technisch sauber gebaut — getrennte Berechnungsmodule,
Testabdeckung mit 85-%-Schwelle in der CI, idempotente Schema-Migrationen,
dokumentierte Datenherkunft, gepflegter Changelog. Das ist mehr Sorgfalt, als
Projekte dieser Größe üblicherweise zeigen, und deckt Teile von A.8.25–A.8.34
(sichere Entwicklung, Test) sowie SOC 2 CC8.1 auf der Handwerksebene ab.

Die Lücken liegen fast vollständig in einer anderen Dimension: **Das System
behandelt personenbezogene Verbrauchsdaten wie öffentliche Daten.** Der
Schutzmechanismus, der das verhindern soll (Passwort-Gate), ist wirkungslos.
Aus Sicht beider Rahmenwerke ist das der zentrale Befund; alles andere ist
nachgelagert.

**Reifegrad je Domäne** (0 = nicht vorhanden, 5 = gesteuert und überwacht):

| Domäne | Reife | Kommentar |
|---|---|---|
| Sichere Entwicklung & Test | 3 | Tests, Coverage-Schwelle, Modularisierung vorhanden |
| Änderungsmanagement | 1 | Auto-Merge ohne Review, `main` ungeschützt |
| Zugriffssteuerung | 0 | Client-seitiges Scheingatter, Daten faktisch öffentlich |
| Kryptographie / Secrets | 2 | Secrets korrekt in GitHub Secrets, aber keine Rotation |
| Lieferkette / Schwachstellen | 1 | Ungepinnte Actions, veraltete Abhängigkeit, kein Dependabot |
| Protokollierung & Monitoring | 1 | Nur Actions-Logs, kein Alerting, keine Zugriffsprotokolle |
| Datenschutz & Aufbewahrung | 0 | Keine Löschregel, keine Klassifizierung, keine Rechtsgrundlage |
| Betriebskontinuität | 2 | Git-inhärente Redundanz, aber kein RPO/RTO, kein Restore-Test |
| Governance (ISMS/Policies) | 0 | Nicht vorhanden — für den Scope aber vertretbar |

---

## 1. Kritische Befunde

### C-1 · Personenbezogene Haushaltsdaten sind öffentlich abrufbar

**Nachweis:** Das Repository ist öffentlich (`visibility: public`). Ein
unauthentifizierter Abruf von
`https://raw.githubusercontent.com/t6vb9ns645-boop/ecoflow/main/docs/ecoflow_smartplugs_daten.csv`
liefert **HTTP 200** — 12,9 MB Messdaten, ohne jede Zugangshürde. Gleiches gilt
für `docs/ecoflow_energie_daten.csv` (4,8 MB, 38.704 Zeilen) und für die
gesamte Git-Historie.

**Warum das gravierend ist:** Die Smart-Plug-CSV enthält raumbezogene Klarnamen
im 2-Minuten-Raster:

```
Schlafzimmer · Arbeitszimmer Schreibtisch · Arbeitszimmer Luftreiniger ·
Wohnzimmer Sideboard · Küche Waschmaschine & Spülmaschine · Kühlschrank ·
Ninja Siebträger
```

Aus dieser Auflösung lassen sich unmittelbar ableiten: Schlaf- und
Aufstehzeiten, Arbeitszeiten am Schreibtisch, Kochgewohnheiten und — sicher —
**Anwesenheit und Abwesenheit der Bewohner**. Eine mehrtägige Abwesenheit
(Urlaub) ist im Verlauf trivial erkennbar. Das ist ein direkt verwertbares
Einbruchsrisiko und zugleich ein Profil des Privatlebens.

Verbrauchsdaten mit Raumbezug sind personenbezogene Daten im Sinne von
Art. 4 Nr. 1 DSGVO. Zusätzlich stehen die Geräteseriennummern
(`HW52ZDH4SF6K1832` u. a.) im Klartext — bei EcoFlow der Identifier für
API-Zugriffe.

**Controls:** ISO A.5.9 (Inventar), A.5.12 (Klassifizierung), A.5.13
(Kennzeichnung), A.5.34 (Schutz von PII), A.8.3 (Zugriffsbeschränkung) ·
SOC 2 CC6.1, CC6.3, C1.1, P1–P8

**Empfehlung** (in absteigender Wirksamkeit):

1. **Repository auf privat umstellen.** Die Konsequenz: GitHub Pages wird bei
   privatem Repo nur im Bezahlplan öffentlich ausgeliefert. Alternative:
   Dashboard zu einem Host mit echter Zugangskontrolle verlagern (Cloudflare
   Pages + Access, Netlify mit Passwortschutz, Vercel Protection).
2. **Falls öffentlich bleiben muss:** Raumnamen entfernen (nur
   pseudonyme Plug-IDs), Auflösung auf 15–60 Minuten aggregieren,
   Seriennummern maskieren. Das reduziert den Personenbezug erheblich, ohne
   die Auswertbarkeit für den Eigengebrauch zu zerstören.
3. **In jedem Fall:** Die Git-Historie enthält den vollständigen
   Klartextbestand. Ein bloßes Überschreiben der aktuellen CSV genügt nicht —
   siehe M-1.

---

### C-2 · Der Passwortschutz des Dashboards ist wirkungslos

**Nachweis:** `docs/dashboard/index.html:1676–1703`

```js
// Passwort-Hash ändern: echo -n "neuespasswort" | sha256sum
const PW_HASH = '08ac8d7a13b3413d6b87e3c74185c8699437acabd4509c76002a037fd7d4138b';
...
if (await sha256hex(pw) === PW_HASH) { sessionStorage.setItem(AUTH_KEY, '1'); ... }
```

Die Prüfung findet vollständig im Browser des Clients statt. Sie ist auf
mindestens drei Wegen zu umgehen:

1. **Trivial:** `sessionStorage.setItem('ecoflow_auth','1')` in der Konsole —
   oder schlicht `$('gate').style.display='none'`. Das Overlay ist ein
   CSS-Zustand, keine Kontrolle.
2. **Gar nicht nötig:** Die CSV-Dateien sind direkt abrufbar (C-1). Das
   Dashboard ist nur eine Darstellungsschicht über frei zugänglichen Daten.
3. **Offline:** Der Hash steht im öffentlichen Quelltext, ist **ungesalzen**
   und ohne Key-Derivation-Function. SHA-256 ist auf Geschwindigkeit
   ausgelegt; handelsübliche GPUs erreichen Milliarden Versuche pro Sekunde.
   Ein Passwort aus dem üblichen menschlichen Repertoire fällt in Minuten.

Der CHANGELOG-Eintrag zu 3.4.0 beschreibt dies als „Passwortschutz … kein
Klartext im Code oder in der Übertragung". Das ist technisch richtig und
sicherheitstechnisch irreführend: Nicht der Klartext ist das Problem, sondern
dass die Entscheidung über den Zugang beim Angreifer liegt. Diese Diskrepanz
zwischen dokumentierter und tatsächlicher Schutzwirkung ist aus Auditsicht
eigenständig relevant — eine Kontrolle, auf die man sich verlässt, ohne dass
sie wirkt, ist schlechter als eine erkannt fehlende Kontrolle.

**Controls:** ISO A.5.15 (Zugangssteuerung), A.5.17 (Authentifizierungs­
informationen), A.8.5 (sichere Authentifizierung), A.8.24 (Kryptographie) ·
SOC 2 CC6.1, CC6.6, CC6.7

**Empfehlung:** Eine der beiden Optionen wählen, keine dritte:

- **Ehrlich abrüsten:** Das Gatter als „kosmetischer Sichtschutz gegen
  zufällige Besucher, keine Sicherheitsmaßnahme" in README und CHANGELOG
  kennzeichnen — dann ist die Erwartungshaltung korrekt.
- **Echt absichern:** Authentifizierung serverseitig, vor der Auslieferung der
  Daten (Cloudflare Access mit Identity-Provider und MFA, oder ein
  Basic-Auth-Reverse-Proxy vor statischen Dateien). Nur das schützt auch die
  CSVs, nicht nur die HTML-Seite.

---

### C-3 · Kein Änderungsmanagement — Auto-Merge ohne Review auf ungeschütztem `main`

**Nachweis:**

- `main` ist **nicht** geschützt (`protected: false`; das gilt für alle 13
  Branches des Repos). Keine Required Reviews, keine Required Status Checks,
  kein Force-Push-Schutz.
- `.github/workflows/auto-pr-merge.yml` merged jeden PR aus `claude/**`
  automatisch, sobald er den Draft-Status verlässt — `gh pr merge --merge
  --delete-branch`, ohne Prüfung, ob die Tests grün sind.
- `.github/workflows/tests.yml` läuft zwar bei jedem PR, hat aber keine
  blockierende Wirkung.
- Der Collector pusht mit `[skip ci]` alle 5 Minuten direkt auf `main`.

Damit gibt es keinen Punkt in der Pipeline, an dem eine fehlerhafte oder
bösartige Änderung aufgehalten wird. Der Kommentar im Workflow („so bleibt die
Freigabe beim Menschen") beschreibt eine Absicht, die technisch nur durch den
Draft-Status abgesichert ist — ein einzelner Klick, kein Kontrollpunkt.

**Controls:** ISO A.8.32 (Änderungsmanagement), A.8.31 (Trennung der
Umgebungen), A.5.3 (Aufgabentrennung) · SOC 2 **CC8.1** — das ist das Kriterium,
an dem ein SOC-2-Audit diesen Punkt unmittelbar als Ausnahme feststellen würde

**Empfehlung:**

1. Ruleset auf `main`: Pull Request erforderlich, mindestens 1 Review,
   Required Status Checks = `Dashboard-Module (Node)` + `Collector (Python)`,
   keine Force-Pushes, lineare Historie.
2. Auto-Merge auf `gh pr merge --auto --squash` umstellen — GitHub merged dann
   erst, wenn alle Pflicht-Checks bestanden sind.
3. Für den Collector-Bot eine explizite Bypass-Regel eintragen (oder besser:
   Messdaten in einen eigenen Branch schreiben, siehe M-1) — statt die
   Schutzregel für alle offen zu lassen.

---

## 2. Hohe Priorität

### H-1 · Rohdaten und Geräte-Identifier in öffentlichen Actions-Logs

`ecoflow_tracker_github.py:query_device()` schreibt bei jedem Lauf sämtliche
API-Rohfelder ins Log:

```python
log("DEBUG", f"--- {device_name} ROHDATEN ---")
for key in sorted(result.keys()):
    log("DEBUG", f"  {key} = {result[key]}")
```

Zusätzlich: `log("INFO", f"→ Frage {device_name} ab ({sn})")` gibt die
Seriennummer aus. Actions-Logs eines öffentlichen Repositories sind öffentlich
lesbar. Positiv: `generate_signature()` maskiert den Access Key korrekt
(`accessKey=***`), und die Secrets selbst werden von GitHub maskiert.

**Controls:** ISO A.8.15 (Protokollierung), A.5.10 (zulässige Nutzung von
Informationen) · SOC 2 CC6.1, CC7.2

**Empfehlung:** DEBUG-Ausgabe hinter ein Env-Flag legen
(`if os.environ.get("ECOFLOW_DEBUG"):`), Seriennummern in Logs maskieren
(`HW52****1832`), Rohdaten-Dumps nicht im Normalbetrieb.

---

### H-2 · Keine Secret-Rotation, zu weit gefasste Workflow-Rechte

- Die EcoFlow-Zugangsdaten (`ECOFLOW_ACCESS_KEY`, `ECOFLOW_SECRET_KEY`) sind
  statisch; es gibt keinen dokumentierten Rotationsrhythmus und kein Verzeichnis,
  wer sie kennt. ISO A.5.17 verlangt einen definierten Lebenszyklus für
  Authentifizierungsinformationen.
- `ecoflow-collector.yml` deklariert workflow-weit
  `contents: write, actions: write, pages: write, id-token: write`.
  **`actions: write` wird nicht mehr gebraucht** — der frühere
  `workflow_dispatch`-Aufruf von `deploy-pages.yml` ist entfallen, seit der
  Deploy-Job im selben Workflow läuft. Das Recht erlaubt, beliebige Workflows
  zu starten und Läufe zu löschen.
- Die Rechte gelten workflow-weit statt job-spezifisch: Der `collect-data`-Job
  bekommt `pages: write` und `id-token: write`, obwohl nur `deploy-pages` sie
  braucht.

**Controls:** ISO A.5.15–A.5.18, A.8.2 (privilegierte Zugriffsrechte) ·
SOC 2 CC6.1, CC6.2, CC6.3

**Empfehlung:** `actions: write` streichen; Permissions auf Job-Ebene
verschieben; Rotationsintervall festlegen (z. B. halbjährlich) und als
Kalendereintrag verankern — ohne Termin passiert Rotation nie.

---

### H-3 · Lieferkette: ungepinnte Actions, veraltete Abhängigkeit, CDN ohne Integritätsprüfung

| Fundstelle | Problem |
|---|---|
| Alle 4 Workflows | `actions/checkout@v4`, `setup-python@v5`, `setup-node@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4` — verschiebbare Tags statt Commit-SHA. Wird ein Tag umgehängt (kompromittiertes Maintainer-Konto), läuft fremder Code mit `contents: write` und Zugriff auf alle Secrets. |
| `requirements.txt` | `requests==2.31.0` ist veraltet: **CVE-2024-35195** (ein `verify=False` bleibt für die gesamte Session bestehen, nachfolgende Requests prüfen das Zertifikat nicht mehr) und **CVE-2024-47081** (`.netrc`-Zugangsdaten können an einen fremden Host geraten). Behoben in 2.32.0 bzw. 2.32.4. |
| `requirements.txt` | Transitive Abhängigkeiten (`urllib3`, `certifi`, `idna`, `charset-normalizer`) sind gar nicht gepinnt; `pip install` läuft ohne `--require-hashes`. |
| `dashboard/index.html:12` | `Chart.js 4.4.1` von `cdnjs.cloudflare.com` **ohne `integrity`-Attribut (SRI)**. Ein manipuliertes CDN-Skript läuft im Kontext der Seite. |
| `dashboard/index.html:9–11`, `docs/index.html:7` | Google Fonts direkt von Google — siehe M-7. |

**Controls:** ISO A.5.19–A.5.21 (Lieferanten, IKT-Lieferkette), A.8.8
(technische Schwachstellen), A.8.29 (Sicherheitstests) · SOC 2 CC7.1, CC9.2

**Empfehlung:** Actions auf vollständige Commit-SHAs pinnen (Dependabot hält
sie danach automatisch aktuell); `requests>=2.32.4`; Lockfile mit Hashes
(`pip-compile --generate-hashes`); Chart.js und die Schriften **lokal
einbinden** — das löst Integrität und Datenschutz in einem Schritt und ist bei
einem Projekt ohne Build-Schritt der einfachere Weg als SRI.

---

### H-4 · Kein Schwachstellenmanagement

Es existieren weder `.github/dependabot.yml`, noch ein CodeQL-Workflow, noch
`SECURITY.md`. Ob Secret Scanning und Push Protection aktiv sind, ist nicht
dokumentiert. Damit gibt es keinen Prozess, der eine neu bekannt werdende
Schwachstelle (wie H-3) überhaupt sichtbar machen würde — die veraltete
`requests`-Version steht seit über zwei Jahren unbemerkt in der Datei.

**Controls:** ISO A.8.8, A.5.7 (Threat Intelligence) · SOC 2 CC3.2, CC4.1, CC7.1

**Empfehlung:** `dependabot.yml` für `pip` und `github-actions` (wöchentlich);
CodeQL-Workflow für JavaScript und Python; Secret Scanning + Push Protection in
den Repo-Einstellungen aktivieren (bei öffentlichen Repos kostenlos).

---

### H-5 · Keine Content-Security-Policy, ungeprüfte `innerHTML`-Pfade

Das Dashboard nutzt an rund 40 Stellen `innerHTML`. Der überwiegende Teil
verarbeitet selbst formatierte Zahlen und ist unkritisch. Eine Kette ist es
nicht: **`plug_name` stammt aus dem Secret `SMARTPLUGS_JSON`**, wandert
ungeprüft in die CSV und von dort über `plugs.mjs` in

```js
$('plugTiles').innerHTML = groups.map((g) => ` ... ${g.name} ... `)
```

Der Wert ist derzeit selbst kontrolliert — die Konstruktion „Konfigurationswert
→ CSV → HTML ohne Escaping" ist trotzdem ein latenter DOM-XSS-Pfad und
verletzt A.8.28 (sichere Codierung) unabhängig davon, ob sie heute ausnutzbar
ist. GitHub Pages kann keine HTTP-Header setzen, ein
`<meta http-equiv="Content-Security-Policy">` ist aber möglich und fehlt.

**Controls:** ISO A.8.26 (Sicherheitsanforderungen an Anwendungen), A.8.28
(sichere Programmierung) · SOC 2 CC6.6, CC8.1

**Empfehlung:** `plug_name` beim Rendern escapen oder per `textContent`
setzen; nach Wegfall des CDN (H-3) eine restriktive CSP-Meta ergänzen
(`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`).

---

## 3. Mittlere Priorität

### M-1 · Keine Aufbewahrungs- und Löschregel — Löschen ist faktisch unmöglich

Die CSVs wachsen unbegrenzt (aktuell 4,8 MB + 12,9 MB). Schwerwiegender: **jede
einzelne Messung liegt zusätzlich als eigener Git-Commit dauerhaft in der
Historie.** Bei einem Lauf alle 2–5 Minuten summiert sich das auf zehntausende
Commits, jeder mit einer vollständigen Kopie des damaligen Datenstands.

Eine Löschung personenbezogener Daten (Art. 17 DSGVO, ISO A.8.10) ist damit nur
noch durch Umschreiben der gesamten Historie möglich — und bei einem
öffentlichen Repo mit Forks/Caches praktisch nicht mehr vollständig. Nebenbei
ist es ein Performance-Problem: Jeder Dashboard-Aufruf lädt beide CSVs
vollständig.

**Controls:** ISO A.5.33 (Schutz von Aufzeichnungen), A.8.10 (Löschung von
Informationen), A.5.34 · SOC 2 P4.1–P4.3, A1.1

**Empfehlung:** Aufbewahrungsfrist definieren (z. B. Rohdaten 90 Tage, danach
Stunden-Aggregate unbegrenzt); Rotation in Jahres- oder Monatsdateien; die
Messdaten in einen eigenen, regelmäßig neu aufgesetzten Branch schreiben
(Orphan-Branch) statt in die Haupthistorie — das entkoppelt Datenwachstum vom
Quellcode-Verlauf und macht Löschen wieder möglich.

---

### M-2 · Kein Monitoring, kein Alerting

Fällt die EcoFlow-API aus, liefert `query_device()` ein leeres Dict, und
`extract_powerstream()` schreibt eine vollständige Zeile aus lauter `0.0` in die
CSV — **ununterscheidbar von einer echten Nachtmessung ohne PV-Ertrag.** Es gibt
keine Benachrichtigung bei fehlgeschlagenen Läufen, keinen Heartbeat, keine
Schwellwertüberwachung. Das Dashboard zeigt zwar ein Datenalter an, aber nur,
wenn jemand hinsieht.

**Controls:** ISO A.8.16 (Überwachungsaktivitäten), A.8.6 (Kapazitätssteuerung)
· SOC 2 CC7.2, CC7.3, A1.1

**Empfehlung:** Bei API-Fehler die Zeile mit leeren Feldern statt `0.0`
schreiben (die CSV unterstützt leere Werte bereits — die Migration
hinterlässt sie so); Benachrichtigung bei Workflow-Fehlern aktivieren;
optional externer Heartbeat (healthchecks.io o. ä.).

---

### M-3 · Fehler werden verschluckt statt gemeldet

An drei Stellen wird `Exception` breit gefangen und der Lauf fortgesetzt:

- `query_device()` → `return {}` (siehe M-2)
- `migrate_csv_if_needed()` → nur `log("ERROR", ...)`, danach schreibt der
  Collector weiter an eine möglicherweise inkonsistente CSV
- `fix_smartplug_scale_if_needed()` → ebenso

Der Prozess endet in allen Fällen mit Exit-Code 0; der Workflow gilt als
erfolgreich. Damit ist die Integrität der Aufzeichnungen nicht zugesichert.

**Controls:** ISO A.5.33, A.8.15 · SOC 2 PI1.1 (Verarbeitungsintegrität),
CC7.3

**Empfehlung:** Bei fehlgeschlagener Migration mit `sys.exit(1)` abbrechen —
lieber ein sichtbar roter Lauf als still korrumpierte Daten.

---

### M-4 · Keine dokumentierte Backup- und Wiederherstellungsstrategie

Der einzige Datenbestand liegt im GitHub-Repo. Git bringt inhärente Redundanz
mit (jeder Clone ist eine Kopie), aber es gibt keinen definierten RPO/RTO,
keinen Off-Site-Klon und keinen dokumentierten Wiederherstellungstest. Bei
Kontosperrung oder versehentlichem Löschen des Repos ist der Bestand weg.

**Controls:** ISO A.8.13 (Backup), A.5.29/A.5.30 (Betriebskontinuität,
IKT-Bereitschaft) · SOC 2 A1.2, A1.3

**Empfehlung:** RPO/RTO festhalten (naheliegend: RPO = 5 min = ein
Collector-Lauf, RTO = 1 h); regelmäßiger automatischer Klon auf ein zweites
Medium; einmal jährlich Restore testen **und das Ergebnis notieren** — ein
ungetestetes Backup ist aus Auditsicht kein Backup.

---

### M-5 · Keine Zugriffsprotokollierung

Es ist nicht nachvollziehbar, wer wann auf das Dashboard oder die CSVs
zugegriffen hat. GitHub Pages stellt Betreibern keine Zugriffslogs zur
Verfügung. Solange C-1 besteht, ist das doppelt relevant: Ein Datenabfluss
wäre nicht einmal im Nachhinein feststellbar.

**Controls:** ISO A.8.15, A.8.16 · SOC 2 CC6.1, CC7.2 — nur durch einen
Hostingwechsel (siehe C-1, Option 1) lösbar.

---

### M-6 · Kryptographie ruhender Daten ohne eigene Schlüsselkontrolle

Die Daten liegen im Klartext bei GitHub. GitHub verschlüsselt at rest, aber die
Schlüsselhoheit liegt beim Anbieter. Für den privaten Anwendungsfall ist das
vertretbar; in einem SOC-2-Kontext wäre GitHub eine Sub-Service-Organisation,
die im Bericht als Carve-out oder Inclusive behandelt und deren eigener
SOC-2-Bericht eingeholt werden müsste.

**Controls:** ISO A.5.19–A.5.22, A.8.24 · SOC 2 CC9.2

---

### M-7 · Google Fonts von Google-Servern (DSGVO)

`docs/dashboard/index.html:9–11` und `docs/index.html:7` binden Schriften direkt
über `fonts.googleapis.com` / `fonts.gstatic.com` ein. Dabei wird die
IP-Adresse jedes Besuchers an Google in die USA übermittelt — ohne
Einwilligung. Das LG München I hat genau diese Konstellation für
rechtswidrig erklärt (Urteil vom 20.01.2022, Az. 3 O 17493/20) und
Schadensersatz zugesprochen; seither ist sie ein verbreitetes Abmahnziel.

**Controls:** ISO A.5.31 (rechtliche Anforderungen), A.5.34 · DSGVO Art. 44 ff.

**Empfehlung:** Schriftdateien lokal ablegen und per `@font-face` einbinden.
Das erledigt gleichzeitig einen Teil von H-3.

---

### M-8 · Keine Datenschutzerklärung, kein Impressum

Die öffentlich erreichbare Seite bindet Drittanbieter ein (Google, Cloudflare)
und verarbeitet Besucherdaten, ohne darüber zu informieren.

**Controls:** ISO A.5.31, A.5.34 · SOC 2 P1.1 (Notice)

---

## 4. Niedrige Priorität / Hygiene

| Nr. | Befund | Control |
|---|---|---|
| N-1 | Keine `LICENSE`-Datei. Das README sagt „für den persönlichen Gebrauch gedacht", was bei einem öffentlichen Repo rechtlich unbestimmt ist — ohne Lizenz gilt striktes Urheberrecht, was vermutlich nicht die Absicht ist. | A.5.32 |
| N-2 | Keine `SECURITY.md`, kein Meldeweg für Schwachstellen, kein definierter Incident-Prozess. | A.5.24–A.5.26, A.6.8 · CC2.3, CC7.4 |
| N-3 | 12 verwaiste Branches (u. a. `claude/dashboard-access-control-t7vw9k`, `feat/v3.1.0`, `fix/metrics-pipeline`) mit veraltetem Code. Das `--delete-branch` des Auto-Merge greift offensichtlich nicht durchgängig. | A.8.9 (Konfigurationsmanagement) |
| N-4 | Keine `CODEOWNERS`, keine Vier-Augen-Regel — bei einem Ein-Personen-Projekt naturgemäß schwierig, aber für jede Zertifizierung eine harte Anforderung. | A.5.3 |
| N-5 | Kein Asset- und Datenflussinventar: Welche Daten werden erhoben, wo liegen sie, wie lange, wer greift zu? Ohne dieses Dokument ist keine der beiden Zertifizierungen möglich — es ist der Startpunkt, nicht das Ergebnis. | A.5.9, A.5.12 · CC3.2 |
| N-6 | Kein Risikoregister, keine Schutzbedarfsfeststellung, keine Anwendbarkeitserklärung (SoA). Bei ISO 27001 sind Risikobeurteilung (6.1.2), Risikobehandlung (6.1.3) und SoA **zwingend**. | ISO 27001 Kap. 6 |
| N-7 | `generate_nonce()` verwendet `random.randint()` statt `secrets`. Für einen API-Nonce praktisch unkritisch, aber `secrets.randbelow()` kostet nichts und vermeidet die Diskussion im Audit. | A.8.24 |
| N-8 | Kein Retry/Backoff gegenüber der EcoFlow-API (nur `timeout=15`). Ein einzelner Netzwerkfehler kostet einen kompletten Messpunkt. | A.5.30 · A1.1 |

---

## 5. Priorisierte Maßnahmenliste

**Sofort (Tage, hoher Wirkungsgrad):**

1. **C-1/C-2 entscheiden:** Repo privat + Hosting mit echter Auth — *oder*
   Raumnamen entfernen, Daten aggregieren und das Gatter ehrlich als
   Sichtschutz deklarieren. Ein Mittelweg existiert nicht.
2. **C-3:** Branch-Protection-Ruleset auf `main`, Auto-Merge auf `--auto`
   umstellen. *(≈ 30 Minuten)*
3. **H-3:** `requests>=2.32.4`, Actions auf SHA pinnen. *(≈ 1 Stunde)*
4. **H-2:** `actions: write` entfernen, Permissions auf Job-Ebene.
   *(≈ 15 Minuten)*
5. **H-1:** DEBUG-Logging hinter Env-Flag, Seriennummern maskieren.
   *(≈ 30 Minuten)*

**Kurzfristig (Wochen):**

6. **H-4:** Dependabot, CodeQL, Secret Scanning aktivieren, `SECURITY.md`.
7. **M-7/H-3:** Chart.js und Schriften lokal einbinden.
8. **M-2/M-3:** API-Fehler als leere Werte schreiben statt `0.0`,
   Migrationsfehler mit Exit-Code 1, Fehlerbenachrichtigung aktivieren.
9. **H-5:** `plug_name` escapen, CSP-Meta ergänzen.
10. **M-8/N-1:** Datenschutzerklärung, Impressum, `LICENSE`.

**Mittelfristig (Monate):**

11. **M-1:** Aufbewahrungskonzept, Datenrotation, Messdaten aus der
    Haupthistorie herauslösen.
12. **M-4:** RPO/RTO festlegen, Off-Site-Backup, dokumentierter Restore-Test.
13. **N-3:** Branches aufräumen.
14. **N-5/N-6:** Asset- und Datenflussinventar, einfache Risikoliste — auch ohne
    Zertifizierungsabsicht die beste Investition, weil sie Befunde wie C-1 künftig
    von selbst sichtbar macht.

---

## 6. Was für eine echte Zertifizierung zusätzlich fehlt

Der Vollständigkeit halber, falls die Frage über die technische Härtung
hinausgeht — folgende Elemente sind bei ISO 27001 verpflichtend und hier
sämtlich nicht vorhanden: Anwendungsbereich und Kontext (Kap. 4),
Leitungsverantwortung und Informationssicherheitsleitlinie (Kap. 5),
Risikobeurteilungs- und -behandlungsprozess samt Anwendbarkeitserklärung
(Kap. 6), Ressourcen, Kompetenz und Bewusstsein (Kap. 7), Überwachung und
internes Audit (Kap. 9), Management-Review und kontinuierliche Verbesserung
(Kap. 10). SOC 2 verlangt darüber hinaus eine geprüfte Systembeschreibung, die
Zuordnung von Kontrollen zu den COSO-Prinzipien und — bei Type II — lückenlose
Wirksamkeitsnachweise über den gesamten Berichtszeitraum.

**Einschätzung:** Beides ist für dieses Projekt nicht anzustreben. Der
sinnvolle Anspruch ist, die Controls aus Abschnitt 1–4 abzuarbeiten. Die
kritischen Befunde C-1 bis C-3 sind dabei nicht „Compliance-Formalismus",
sondern reale Risiken: öffentlich einsehbare Anwesenheitsprofile eines
bewohnten Haushalts und eine Deployment-Pipeline ohne jeden Kontrollpunkt.

---

*Diese Bewertung ist eine technische Selbsteinschätzung anhand der genannten
Rahmenwerke. Sie ersetzt weder ein Zertifizierungsaudit noch eine
Rechtsberatung.*
