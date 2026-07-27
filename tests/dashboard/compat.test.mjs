/**
 * Rueckwaertskompatibilitaet.
 *
 * Die CSV enthaelt Zeilen aus allen bisherigen Schema-Staenden nebeneinander:
 * v1 hatte 7 Spalten, v2 kam auf 20. Die Migration im Collector fuellt alte
 * Zeilen nur mit LEEREN Feldern auf — v4.0.0 muss diesen Mischbestand ohne
 * Fehler lesen und dieselben Zahlen liefern wie zuvor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, isAllZero } from '../../docs/dashboard/lib/csv.mjs';
import { energyTotals, flowModel, houseBreakdown, pvTotal } from '../../docs/dashboard/lib/energy.mjs';
import { buildViewModel, initialState } from '../../docs/dashboard/lib/viewmodel.mjs';
import { dataQuality } from '../../docs/dashboard/lib/filters.mjs';

const V2_HEADER = 'timestamp,pv1_watt,pv2_watt,ac_house_watt,battery_soc_percent,battery_power_watt,'
  + 'total_pv_wh_daily,pv1_temp_c,pv2_temp_c,inv_temp_c,grid_cons_watt,inv_to_plug_watt,permanent_watt,'
  + 'pv_to_inv_watt,pv1_volt,pv2_volt,inv_volt,bat_lower_limit,bat_upper_limit,wifi_rssi';

// Genau die Form, die im Repo steht: migrierte Altzeilen mit leeren v2-Feldern,
// gefolgt von vollstaendigen neuen Zeilen.
const MIXED_CSV = [
  V2_HEADER,
  '2026-06-23T21:00:46,0.0,0.0,17.0,0.0,0.0,0.0,,,,,,,,,,,,,',
  '2026-06-23T21:03:06,0.0,0.0,19.0,0.0,0.0,0.0,,,,,,,,,,,,,',
  '2026-06-23T21:05:06,0.0,0.0,19.0,55.0,23.0,0.0,,,,,,,,,,,,,',
  '2026-07-25T13:48:20+02:00,157,152,19,70,-290,412.42,47,50,34,0,9,10,309,28.0,27.1,236.1,20,100,-50',
  '2026-07-25T13:50:20+02:00,157,152,19,70,-290,422.29,47,50,34,0,9,10,309,28.0,27.1,236.1,20,100,-50',
].join('\n');

test('Zeilen aus dem alten Schema werden ohne Fehler gelesen', () => {
  const rows = parseCsv(MIXED_CSV);
  assert.equal(rows.length, 5);
  // Pflichtfelder aus v1 bleiben Zahlen.
  assert.equal(rows[0].ac_house_watt, 17);
  // v2-Felder, die es damals nicht gab, sind NaN und nicht faelschlich 0.
  assert.ok(Number.isNaN(rows[0].inv_to_plug_watt));
  assert.ok(Number.isNaN(rows[0].pv1_temp_c));
  assert.ok(Number.isNaN(rows[0].wifi_rssi));
});

test('fehlende v2-Felder werden in den Kennzahlen als 0 behandelt, nicht als NaN', () => {
  const rows = parseCsv(MIXED_CSV);
  const e = energyTotals(rows);
  for (const [key, val] of Object.entries(e)) {
    assert.ok(Number.isFinite(val), `${key} ist keine endliche Zahl: ${val}`);
    assert.ok(val >= 0, `${key} darf nicht negativ sein: ${val}`);
  }
});

test('das Flussmodell bleibt auf Altzeilen vollstaendig definiert', () => {
  const rows = parseCsv(MIXED_CSV);
  const f = flowModel(rows[0]);
  for (const [key, val] of Object.entries(f)) {
    if (typeof val === 'number') assert.ok(Number.isFinite(val), `${key} ist NaN`);
  }
  assert.equal(f.toPlugs, 0);
  assert.equal(f.baseLoad, 0);
});

test('die Hausnetz-Aufschluesselung funktioniert ohne die v2-Teilstroeme', () => {
  const rows = parseCsv(MIXED_CSV);
  const b = houseBreakdown(flowModel(rows[0]), []);
  assert.ok(b.items.length >= 1);
  for (const i of b.items) assert.ok(Number.isFinite(i.watts) && Number.isFinite(i.share));
  // Ohne Teilstroeme bleibt der Hausverbrauch als "nicht erfasst" uebrig.
  assert.ok(b.items.some((i) => i.kind === 'residual' && i.watts === 17));
});

test('die Nullwert-Erkennung verhaelt sich wie in v3.7.0', () => {
  const rows = parseCsv(MIXED_CSV);
  // Die aeltesten echten Zeilen tragen ac_house_watt = 17 und gelten deshalb
  // NICHT als Nullwert-Zeilen — genau wie in v3.7.0, wo isAllZero dieselben
  // fuenf Felder prueft. Die Regel bleibt bewusst unveraendert, damit die
  // Datenqualitaets-Anzeige fuer denselben Bestand dasselbe Ergebnis liefert.
  assert.equal(isAllZero(rows[0]), false);
  assert.equal(isAllZero(rows[2]), false);

  const q = dataQuality(rows, isAllZero);
  assert.equal(q.zeroCount, 0);
  assert.equal(q.coverage, 100);
  assert.ok(Number.isFinite(q.durationHours));
});

test('eine echte Nullwert-Phase wird auch im Altbestand erkannt', () => {
  const csv = [
    V2_HEADER,
    '2026-06-23T21:00:46,0.0,0.0,0.0,0.0,0.0,0.0,,,,,,,,,,,,,',
    '2026-06-23T21:02:46,0.0,0.0,0.0,0.0,0.0,0.0,,,,,,,,,,,,,',
    '2026-06-23T21:04:46,0.0,0.0,19.0,55.0,23.0,0.0,,,,,,,,,,,,,',
  ].join('\n');
  const q = dataQuality(parseCsv(csv), isAllZero);
  assert.equal(q.zeroCount, 2);
  assert.equal(q.validFromIdx, 2);
  assert.ok(Math.abs(q.coverage - 100 / 3) < 1e-9);
});

test('das komplette View-Model kommt mit dem Mischbestand zurecht', () => {
  const rows = parseCsv(MIXED_CSV);
  const now = new Date('2026-07-25T14:00:00+02:00');
  const vm = buildViewModel(rows, [], { ...initialState(), preset: 'all' }, now);
  assert.equal(vm.empty, false);
  assert.equal(vm.filtered.length, 5);
  assert.ok(vm.flow !== null);
  assert.ok(Number.isFinite(vm.energy.productionWh));
  assert.ok(Number.isFinite(vm.quality.coverage));
  assert.ok(Number.isFinite(vm.battery.net));
});

test('eine CSV im alten 7-Spalten-Schema bleibt lesbar', () => {
  // Sollte eine Datei je unmigriert bleiben, darf das Dashboard nicht brechen.
  const v1 = [
    'timestamp,pv1_watt,pv2_watt,ac_house_watt,battery_soc_percent,battery_power_watt,total_pv_wh_daily',
    '2026-06-23T21:00:46,0.0,0.0,17.0,50.0,20.0,0.0',
    '2026-06-23T21:02:46,120.0,118.0,19.0,52.0,-180.0,8.0',
    '2026-06-23T21:04:46,120.0,118.0,19.0,54.0,-180.0,16.0',
  ].join('\n');
  const rows = parseCsv(v1);
  assert.equal(rows.length, 3);
  assert.equal(pvTotal(rows[1]), 238);
  assert.equal(flowModel(rows[1]).charging, true);
  const e = energyTotals(rows);
  // Linksregel: nur das zweite Intervall startet mit PV > 0 -> 238 W * 2 min.
  assert.ok(Math.abs(e.productionWh - 238 / 30) < 1e-9);
  // Ohne die v2-Teilstroeme ist der erfasste Verbrauch 0 statt NaN.
  assert.equal(e.consumptionWh, 0);
});

test('unbekannte Zusatzspalten stoeren die Auswertung nicht', () => {
  // Vorwaertskompatibilitaet: ein spaeteres Schema darf v4.0.0 nicht brechen.
  const future = [
    `${V2_HEADER},neues_feld_xyz`,
    '2026-07-25T13:48:20+02:00,157,152,19,70,-290,412.42,47,50,34,0,9,10,309,28.0,27.1,236.1,20,100,-50,999',
  ].join('\n');
  const rows = parseCsv(future);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pv1_watt, 157);
  assert.equal(flowModel(rows[0]).charging, true);
});

/* ── Gleichstand der Berechnung mit v3.7.0 ──────────────────────────────── */

/**
 * Die Energieformeln aus v3.7.0, woertlich uebernommen aus dem Inline-Skript
 * (docs/dashboard/versions/v3.7.0/index.html). Sie dienen als Referenz: v4.0.0
 * muss auf denselben Eingaben dieselben Zahlen liefern, damit ein Wechsel
 * zwischen den Versionen keine abweichenden Kennzahlen zeigt.
 */
function v37Energy(rows) {
  const calc = (wattFn) => {
    let wh = 0;
    for (let i = 1; i < rows.length; i++) {
      const dt = (new Date(rows[i].t) - new Date(rows[i - 1].t)) / 3600000;
      if (dt <= 0 || dt > 0.1) continue;
      const w = wattFn(rows[i - 1]);
      if (!Number.isNaN(w) && w > 0) wh += w * dt;
    }
    return wh;
  };
  const plugOf = (r) => (Number.isNaN(r.inv_to_plug_watt) ? 0 : r.inv_to_plug_watt);
  const permOf = (r) => (Number.isNaN(r.permanent_watt) ? 0 : r.permanent_watt);
  return {
    productionWh: calc((r) => (r.pv1_watt || 0) + (r.pv2_watt || 0)),
    consumptionWh: calc((r) => plugOf(r) + permOf(r)),
    batteryOutWh: calc((r) => ((!Number.isNaN(r.battery_power_watt) && r.battery_power_watt > 0) ? r.battery_power_watt : 0)),
    feedInWh: calc((r) => {
      const pv = (r.pv1_watt || 0) + (r.pv2_watt || 0);
      const charge = (!Number.isNaN(r.battery_power_watt) && r.battery_power_watt < 0)
        ? Math.abs(r.battery_power_watt) : 0;
      return Math.max(0, pv - plugOf(r) - permOf(r) - charge);
    }),
  };
}

/** Erzeugt einen realistischen Tagesverlauf mit Lade- und Entladephasen. */
function syntheticDay(count = 300) {
  const rows = [];
  const start = new Date('2026-07-20T06:00:00+02:00').getTime();
  for (let i = 0; i < count; i++) {
    const t = new Date(start + i * 2 * 60000);
    const sun = Math.max(0, Math.sin((i / count) * Math.PI));
    const pv = Math.round(sun * 320);
    // Tagsueber laden (negativ), nachts entladen (positiv).
    const batt = pv > 60 ? -Math.round(sun * 240) : Math.round(18 + (i % 7));
    rows.push({
      t: t.toISOString().replace('Z', ''),
      pv1_watt: Math.round(pv / 2), pv2_watt: pv - Math.round(pv / 2),
      ac_house_watt: 19, battery_soc_percent: 40 + Math.round(sun * 50),
      battery_power_watt: batt,
      inv_to_plug_watt: 9 + (i % 4), permanent_watt: 10,
      total_pv_wh_daily: 0, grid_cons_watt: 0,
      pv1_temp_c: 40, pv2_temp_c: 41, inv_temp_c: 34,
      pv1_volt: 28, pv2_volt: 29, inv_volt: 237,
      bat_lower_limit: 20, bat_upper_limit: 100, wifi_rssi: -50,
    });
  }
  return rows;
}

test('v4.0.0 liefert dieselben Energie-Kennzahlen wie v3.7.0', () => {
  const rows = syntheticDay();
  const neu = energyTotals(rows);
  const alt = v37Energy(rows);
  for (const key of ['productionWh', 'consumptionWh', 'batteryOutWh', 'feedInWh']) {
    assert.ok(Math.abs(neu[key] - alt[key]) < 1e-9,
      `${key} weicht ab: v4 ${neu[key]} vs. v3.7.0 ${alt[key]}`);
  }
  // Der Datensatz muss beide Batterierichtungen enthalten, sonst prueft der
  // Vergleich die Vorzeichenbehandlung gar nicht mit.
  assert.ok(neu.batteryOutWh > 0, 'Testdaten enthalten keine Entladephase');
  assert.ok(rows.some((r) => r.battery_power_watt < 0), 'Testdaten enthalten keine Ladephase');
});

test('der Gleichstand haelt auch auf dem gemischten Altbestand', () => {
  const rows = parseCsv(MIXED_CSV);
  const neu = energyTotals(rows);
  const alt = v37Energy(rows);
  for (const key of ['productionWh', 'consumptionWh', 'batteryOutWh', 'feedInWh']) {
    assert.ok(Math.abs(neu[key] - alt[key]) < 1e-9, `${key} weicht ab`);
  }
});

test('Spalten in abweichender Reihenfolge werden ueber den Namen aufgeloest', () => {
  const reordered = [
    'battery_power_watt,timestamp,ac_house_watt,pv2_watt,pv1_watt',
    '-290,2026-07-25T13:48:20+02:00,19,152,157',
  ].join('\n');
  const rows = parseCsv(reordered);
  assert.equal(rows[0].pv1_watt, 157);
  assert.equal(rows[0].pv2_watt, 152);
  assert.equal(rows[0].battery_power_watt, -290);
  assert.equal(flowModel(rows[0]).charging, true);
});
