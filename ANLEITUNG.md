# 🚀 EcoFlow Datenabfrage mit GitHub Actions - Vollständige Anleitung

**Status:** Ready to Deploy (warten auf EcoFlow Dev-Account)  
**Version:** 1.0  
**Datum:** Juni 2026

---

## 📋 Inhaltsverzeichnis

1. [Übersicht & Voraussetzungen](#übersicht--voraussetzungen)
2. [Schritt 1: GitHub Repository Setup](#schritt-1-github-repository-setup)
3. [Schritt 2: Dateien sind schon da!](#schritt-2-dateien-sind-schon-da)
4. [Schritt 3: API-Keys konfigurieren](#schritt-3-api-keys-konfigurieren)
5. [Schritt 4: Workflow testen & aktivieren](#schritt-4-workflow-testen--aktivieren)
6. [Schritt 5: Daten runterladen](#schritt-5-daten-runterladen)
7. [Troubleshooting](#troubleshooting)

---

## 📌 Übersicht & Voraussetzungen

### Was dich erwartet:
- ✅ Automatische Abfrage der EcoFlow API alle **1 Minute**
- ✅ CSV-Datei mit Energieerzeugung, Batteriestand, etc.
- ✅ Kostenlos (GitHub Free Plan)
- ✅ Speichern der Daten als **GitHub Artifacts** (downloadbar)
- ✅ Keine eigene Hardware nötig

### Voraussetzungen:
- ✅ GitHub Account (kostenlos auf github.com)
- ⏳ EcoFlow Developer Account + API-Keys (noch ausstehend)
- ✅ Dieses Repository geklont/geforkt

---

## 🎯 Schritt 1: GitHub Repository Setup

### 1.1 Dieses Repository verwenden

Du hast 2 Optionen:

**Option A: Forken** (empfohlen)
1. Klick "Fork" oben rechts
2. Gib einen Namen ein (z.B. "ecoflow-data-tracker")
3. Fertig! 🎉

**Option B: Als Template** (auch gut)
1. Klick "Use this template"
2. Gib einen Repository-Namen ein
3. Fertig! 🎉

### 1.2 Lokal klonen (optional)

```bash
git clone https://github.com/YOUR_USERNAME/ecoflow-data-tracker.git
cd ecoflow-data-tracker
```

---

## 📂 Schritt 2: Dateien sind schon da!

✅ Die Repository-Struktur ist bereits korrekt:

```
ecoflow-data-tracker/
├── .github/
│   └── workflows/
│       └── ecoflow-collector.yml     ← WORKFLOW
├── ecoflow_tracker_github.py         ← HAUPTSKRIPT
├── requirements.txt                   ← DEPENDENCIES
└── README.md                          ← DOKUMENTATION
```

**Du brauchst NICHTS hochzuladen!** Alles ist schon im Repository. ✅

---

## 🔐 Schritt 3: API-Keys konfigurieren

### 3.1 EcoFlow Developer Keys beschaffen

Sobald dein Dev-Account freigegeben ist:

1. Gehe zu https://developer.ecoflow.com
2. Login mit deinem EcoFlow Account
3. Navigiere zu **"API Keys"** oder **"Credentials"**
4. Generiere einen neuen API-Key:
   - **Access Key** kopieren
   - **Secret Key** kopieren

### 3.2 Geräte-Seriennummern auslesen

1. Öffne die **EcoFlow App** auf deinem Handy
2. Gehe zu **Geräteeinstellungen** (⚙️)
3. Suche nach **"Serial Number"** oder **"SN"**:
   - **PowerStream SN** notieren (z.B. "PS2301A1234567")
   - **Delta 3 SN** notieren (z.B. "DT3301A9876543")

### 3.3 GitHub Secrets erstellen

1. Gehe zu: **Settings** → **Secrets and variables** → **Actions**
2. Klick **"New repository secret"** und erstelle diese 4 Secrets:

| Secret Name | Wert | Quelle |
|-------------|------|--------|
| `ECOFLOW_ACCESS_KEY` | abc123... | EcoFlow Developer Portal |
| `ECOFLOW_SECRET_KEY` | xyz789... | EcoFlow Developer Portal |
| `POWERSTREAM_SN` | PS2301A1234567 | EcoFlow App |
| `DELTA3_SN` | DT3301A9876543 | EcoFlow App |

**⚠️ WICHTIG:** 
- Keine Anführungszeichen!
- Copy-Paste direkt aus der Quelle
- Geheim halten (nicht in Dateien speichern)

---

## ▶️ Schritt 4: Workflow testen & aktivieren

### 4.1 Manueller Test (empfohlen ZUERST!)

1. Gehe zu **Actions** (im Repository)
2. Klick auf **"EcoFlow Data Collector"** (linke Seite)
3. Klick **"Run workflow"** → **"Run workflow"**
4. Warte ~30 Sekunden bis der Workflow fertig ist

**Erwartetes Ergebnis:**
- ✅ Green checkmark = Erfolg
- ❌ Red X = Fehler (siehe Troubleshooting)

### 4.2 Logs prüfen

Wenn was schiefgeht:
1. Klick auf die durchgelaufene Workflow-Run
2. Klick auf **"collect-data"** Job
3. Prüfe die Log-Ausgabe auf Fehler

---

## 📥 Schritt 5: Daten runterladen

### 5.1 Artifacts herunterladen

Nach jedem erfolgreichen Workflow-Run:

1. Gehe zu **Actions** → letzter Workflow-Run
2. Scrolle nach unten zu **"Artifacts"**
3. Klick auf **"ecoflow-data"** → Download
4. Entpacke die ZIP und öffne die CSV mit Excel

### 5.2 Automatische Schedules

Der Workflow läuft **automatisch**:

| Event | Schedule |
|-------|----------|
| Täglich um 00:00 UTC | Automatisch |
| Stündlich alle x Minuten | Automatisch |
| Manuell | Buttons in Actions |

**Hinweis zu UTC:** Der Workflow läuft in UTC-Zeit. Wenn du CEST bist (UTC+2), laufen die geplanten Zeiten 2 Stunden früher.

### 5.3 CSV-Datei verwenden

Die CSV enthält diese Spalten:
```
timestamp,pv1_watt,pv2_watt,ac_house_watt,battery_soc_percent,battery_power_watt,total_pv_wh_daily
2026-06-21T10:00:00,500,480,150,85,-50,8.33
2026-06-21T10:01:00,510,490,140,84,-40,16.83
```

**Tägliches Backup:**
- Download die CSV regelmäßig
- Speichere sie lokal oder in der Cloud
- Importiere in Excel/Google Sheets für Analysen

---

## 🐛 Troubleshooting

### ❌ Fehler: "Authorization failed"

**Ursache:** Falsche oder leere API-Keys

**Lösung:**
1. Gehe zu Settings → Secrets
2. Prüfe ob die 4 Secrets gespeichert sind
3. Kopiere die Keys nochmal von EcoFlow Developer Portal
4. Testen mit "Run workflow"

---

### ❌ Fehler: "Device not found"

**Ursache:** Falsche Seriennummern oder Geräte nicht in API freigegeben

**Lösung:**
1. Prüfe die SNs nochmal in der EcoFlow App
2. Stelle sicher, dass die Geräte im Developer Portal registriert sind
3. Warte ggf. auf API-Freischaltung

---

### ❌ CSV ist leer oder hat nur Header

**Ursache:** API antwortet mit ungültigem Format

**Lösung:**
1. Prüfe die Logs des Workflow-Runs
2. Eventuell: API-Struktur hat sich geändert → JSON-Pfade anpassen

---

### ⏸️ Workflows laufen nicht automatisch

**Ursache:** Repository hatte 60 Tage keine Aktivität

**Lösung:**
1. Pushe einen Dummy-Commit
2. Oder: Mache eine kleine Edit im Repository
3. Workflows sollten dann wieder laufen

---

## 📈 Nächste Schritte (Optional)

### Phase 2: Git Commit Speicherung (statt Artifacts)

Statt Artifacts jede Minute zu generieren, könntest du die CSV direkt in Git committen und pushen. Das würde eine Git-Historie ermöglichen.

### Phase 3: Erweiterte Daten (Home Assistant)

Später: Upgrade auf Home Assistant + Raspberry Pi für Echtzeitdaten und erweiterte Sensoren.

### Phase 4: Web-Dashboard

Visualisiertes Dashboard mit Grafana oder ähnliches.

---

## 📞 Support & Ressourcen

**GitHub Actions Dokumentation:**
https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions

**Cron Syntax Tester:**
https://crontab.guru

**EcoFlow API Dokumentation:**
https://developer.ecoflow.com/docs (Nach Freischaltung)

---

## ✅ Checkliste vor dem Start

- [ ] GitHub Account vorhanden
- [ ] Dieses Repository geforkt/geklont
- [ ] EcoFlow Dev-Account beantragt
- [ ] Keys & SNs notiert (sobald verfügbar)
- [ ] 4 GitHub Secrets erstellt
- [ ] Manueller Test mit "Run workflow" durchgeführt
- [ ] CSV heruntergeladen und geöffnet

---

**Du bist bereit!** 🚀 Sobald die EcoFlow API-Keys da sind, kannst du sofort starten.

---

*Erstellt: 21. Juni 2026*  
*Projekt: EcoFlow BKW Datentracker*  
*Status: Production Ready*
