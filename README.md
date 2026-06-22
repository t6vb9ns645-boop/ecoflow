# 🌞 EcoFlow BKW Datentracker

Automatische Erfassung und Speicherung von EcoFlow PowerStream & Delta 3 Daten via GitHub Actions.

## 📊 Features

✅ Automatische Abfrage alle 1 Minute  
✅ Kostenlos (GitHub Free Plan)  
✅ Energieerzeugung (Wh) automatisch berechnet  
✅ CSV-Export für Excel/Analysen  
✅ Keine lokale Hardware nötig  
✅ Sicher der API-Rate Limits  

## 🚀 Quickstart

1. **GitHub Secrets erstellen** (Settings → Secrets and variables → Actions):
   - `ECOFLOW_ACCESS_KEY`
   - `ECOFLOW_SECRET_KEY`
   - `POWERSTREAM_SN`
   - `DELTA3_SN`

2. **Workflow testen** (Actions → Run workflow)

3. **Daten herunterladen** (Actions → Artifacts)

## 📋 Dateien

- `ecoflow_tracker_github.py` - Hauptskript für Datenabfrage
- `.github/workflows/ecoflow-collector.yml` - GitHub Actions Workflow
- `requirements.txt` - Python Dependencies

## 📈 Erfasste Daten

| Feld | Quelle | Einheit |
|------|--------|--------|
| timestamp | System | ISO 8601 |
| pv1_watt | PowerStream | Watt |
| pv2_watt | PowerStream | Watt |
| ac_house_watt | PowerStream | Watt |
| battery_soc_percent | Delta 3 | % |
| battery_power_watt | Delta 3 | Watt |
| total_pv_wh_daily | Berechnet | Wh |

## ⏱️ Schedule

Standard: **Alle 1 Minute** (UTC)

Im `.github/workflows/ecoflow-collector.yml` anpassbar mit Cron-Syntax.

## 🔧 Technisch

- **Runtime:** GitHub Actions Ubuntu Latest
- **Python:** 3.11
- **API:** EcoFlow Cloud REST API
- **Storage:** GitHub Artifacts (90 Tage)

## 📞 Support

Bugs oder Fragen?
- Prüfe die Log-Ausgabe im Workflow
- Siehe Troubleshooting in der Dokumentation

## 📄 Lizenz

Dieses Projekt ist für den persönlichen Gebrauch gedacht.

---

**Status:** Production Ready  
**Letzte Aktualisierung:** Juni 2026  
**Version:** 1.0 GitHub Actions Edition
