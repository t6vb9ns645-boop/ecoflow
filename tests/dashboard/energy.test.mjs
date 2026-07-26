import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isCharging, chargePower, dischargePower, batteryState,
  pvTotal, houseLoad, feedInPower, calcEnergyWh, cumulativeEnergyWh,
  energyTotals, flowModel, houseBreakdown, MAX_GAP_HOURS,
} from '../../docs/dashboard/lib/energy.mjs';

/* ── Vorzeichenkonvention (CHANGELOG [3.2.2]) ───────────────────────────── */

test('negative Batterieleistung bedeutet Laden', () => {
  assert.equal(isCharging(-290), true);
  assert.equal(isCharging(16), false);
  assert.equal(isCharging(0), false);
});

test('chargePower liefert nur beim Laden einen Betrag', () => {
  assert.equal(chargePower(-290), 290);
  assert.equal(chargePower(16), 0);
  assert.equal(chargePower(0), 0);
  assert.equal(chargePower(NaN), 0);
});

test('dischargePower liefert nur beim Entladen einen Betrag', () => {
  assert.equal(dischargePower(16), 16);
  assert.equal(dischargePower(-290), 0);
  assert.equal(dischargePower(NaN), 0);
});

test('batteryState benennt den Zustand', () => {
  assert.equal(batteryState(-290), 'lädt');
  assert.equal(batteryState(16), 'entlädt');
  assert.equal(batteryState(0), 'inaktiv');
  assert.equal(batteryState(NaN), 'inaktiv');
});

/* ── Momentanleistungen ─────────────────────────────────────────────────── */

test('pvTotal summiert beide Strings', () => {
  assert.equal(pvTotal({ pv1_watt: 157, pv2_watt: 152 }), 309);
});

test('pvTotal behandelt fehlende Werte als 0', () => {
  assert.equal(pvTotal({ pv1_watt: 157, pv2_watt: NaN }), 157);
  assert.equal(pvTotal({}), 0);
});

test('houseLoad summiert Steckdosen und Grundbedarf', () => {
  assert.equal(houseLoad({ inv_to_plug_watt: 9, permanent_watt: 10 }), 19);
});

test('feedInPower ist der Ueberschuss nach Haus und Ladung', () => {
  // Realer Messpunkt 2026-07-25T13:48: PV 309 = Ladung 290 + Haus 19 -> kein Ueberschuss.
  const row = { pv1_watt: 157, pv2_watt: 152, inv_to_plug_watt: 9, permanent_watt: 10, battery_power_watt: -290 };
  assert.equal(feedInPower(row), 0);
});

test('feedInPower rechnet Ueberschuss korrekt aus', () => {
  const row = { pv1_watt: 300, pv2_watt: 300, inv_to_plug_watt: 50, permanent_watt: 10, battery_power_watt: -100 };
  assert.equal(feedInPower(row), 440);
});

test('feedInPower wird nie negativ', () => {
  const row = { pv1_watt: 5, pv2_watt: 0, inv_to_plug_watt: 50, permanent_watt: 10, battery_power_watt: 0 };
  assert.equal(feedInPower(row), 0);
});

test('feedInPower zieht beim Entladen keine Ladeleistung ab', () => {
  const row = { pv1_watt: 100, pv2_watt: 0, inv_to_plug_watt: 10, permanent_watt: 10, battery_power_watt: 50 };
  assert.equal(feedInPower(row), 80);
});

/* ── Zeitgewichtete Integration ─────────────────────────────────────────── */

const rowsAt = (specs) => specs.map(([t, w]) => ({ t, watt: w }));
const wattOf = (r) => r.watt;

test('calcEnergyWh integriert zeitgewichtet mit der Linksregel', () => {
  // 100 W ueber 2 Minuten (1/30 h) = 3.333 Wh
  const rows = rowsAt([['2026-07-25T12:00:00Z', 100], ['2026-07-25T12:02:00Z', 200]]);
  assert.ok(Math.abs(calcEnergyWh(rows, wattOf) - 100 / 30) < 1e-9);
});

test('calcEnergyWh summiert mehrere Intervalle', () => {
  const rows = rowsAt([
    ['2026-07-25T12:00:00Z', 60],
    ['2026-07-25T12:02:00Z', 120],
    ['2026-07-25T12:04:00Z', 0],
  ]);
  // 60 W * 1/30 h + 120 W * 1/30 h = 6 Wh
  assert.ok(Math.abs(calcEnergyWh(rows, wattOf) - 6) < 1e-9);
});

test('calcEnergyWh ueberspringt Luecken groesser als 6 Minuten', () => {
  const rows = rowsAt([['2026-07-25T12:00:00Z', 100], ['2026-07-25T12:30:00Z', 100]]);
  assert.equal(calcEnergyWh(rows, wattOf), 0);
});

test('calcEnergyWh akzeptiert eine Luecke von genau 6 Minuten', () => {
  const rows = rowsAt([['2026-07-25T12:00:00Z', 100], ['2026-07-25T12:06:00Z', 100]]);
  assert.ok(Math.abs(calcEnergyWh(rows, wattOf) - 100 * MAX_GAP_HOURS) < 1e-9);
});

test('calcEnergyWh ignoriert negative und ungueltige Leistungen', () => {
  const rows = rowsAt([['2026-07-25T12:00:00Z', -100], ['2026-07-25T12:02:00Z', 100]]);
  assert.equal(calcEnergyWh(rows, wattOf), 0);
  const nanRows = rowsAt([['2026-07-25T12:00:00Z', NaN], ['2026-07-25T12:02:00Z', 100]]);
  assert.equal(calcEnergyWh(nanRows, wattOf), 0);
});

test('calcEnergyWh ist bei weniger als zwei Zeilen 0', () => {
  assert.equal(calcEnergyWh([], wattOf), 0);
  assert.equal(calcEnergyWh(rowsAt([['2026-07-25T12:00:00Z', 100]]), wattOf), 0);
});

test('calcEnergyWh ignoriert rueckwaerts laufende Zeitstempel', () => {
  const rows = rowsAt([['2026-07-25T12:05:00Z', 100], ['2026-07-25T12:00:00Z', 100]]);
  assert.equal(calcEnergyWh(rows, wattOf), 0);
});

test('cumulativeEnergyWh waechst monoton und endet auf der Gesamtsumme', () => {
  const rows = rowsAt([
    ['2026-07-25T12:00:00Z', 60],
    ['2026-07-25T12:02:00Z', 120],
    ['2026-07-25T12:04:00Z', 0],
  ]);
  const cum = cumulativeEnergyWh(rows, wattOf);
  assert.equal(cum.length, 3);
  assert.equal(cum[0], 0);
  assert.ok(cum[1] <= cum[2]);
  assert.ok(Math.abs(cum[2] - calcEnergyWh(rows, wattOf)) < 0.1);
});

test('cumulativeEnergyWh haelt den Wert ueber eine Luecke konstant', () => {
  const rows = rowsAt([
    ['2026-07-25T12:00:00Z', 60],
    ['2026-07-25T12:02:00Z', 60],
    ['2026-07-25T13:00:00Z', 60],
  ]);
  const cum = cumulativeEnergyWh(rows, wattOf);
  assert.equal(cum[1], cum[2]);
});

/* ── Kennzahlen-Paket ───────────────────────────────────────────────────── */

test('energyTotals liefert alle vier Kennzahlen konsistent', () => {
  const rows = [
    { t: '2026-07-25T12:00:00Z', pv1_watt: 300, pv2_watt: 300, inv_to_plug_watt: 50, permanent_watt: 10, battery_power_watt: -100 },
    { t: '2026-07-25T12:02:00Z', pv1_watt: 300, pv2_watt: 300, inv_to_plug_watt: 50, permanent_watt: 10, battery_power_watt: 40 },
    { t: '2026-07-25T12:04:00Z', pv1_watt: 0, pv2_watt: 0, inv_to_plug_watt: 50, permanent_watt: 10, battery_power_watt: 40 },
  ];
  const e = energyTotals(rows);
  const h = 1 / 30; // 2 Minuten in Stunden
  assert.ok(Math.abs(e.productionWh - (600 + 600) * h) < 1e-9);
  assert.ok(Math.abs(e.consumptionWh - (60 + 60) * h) < 1e-9);
  // Nur das zweite Intervall entlaedt (40 W); das erste laedt und zaehlt nicht.
  assert.ok(Math.abs(e.batteryOutWh - 40 * h) < 1e-9);
  // Intervall 1: 600-60-100 = 440, Intervall 2: 600-60-0 = 540
  assert.ok(Math.abs(e.feedInWh - (440 + 540) * h) < 1e-9);
});

test('energyTotals ist bei leerer Eingabe ueberall 0', () => {
  const e = energyTotals([]);
  assert.deepEqual(e, { productionWh: 0, consumptionWh: 0, batteryOutWh: 0, feedInWh: 0 });
});

/* ── Flussmodell ────────────────────────────────────────────────────────── */

const LIVE_ROW = {
  t: '2026-07-25T13:48:20+02:00',
  pv1_watt: 157, pv2_watt: 152, ac_house_watt: 19,
  battery_soc_percent: 70, battery_power_watt: -290,
  inv_to_plug_watt: 9, permanent_watt: 10, grid_cons_watt: 0,
};

test('flowModel bildet den Ladefall korrekt ab', () => {
  const f = flowModel(LIVE_ROW);
  assert.equal(f.pvTotal, 309);
  assert.equal(f.charging, true);
  assert.equal(f.batteryMagnitude, 290);
  assert.equal(f.batteryState, 'lädt');
  assert.equal(f.soc, 70);
  assert.equal(f.house, 19);
});

test('flowModel bildet den Entladefall korrekt ab', () => {
  const f = flowModel({ ...LIVE_ROW, battery_power_watt: 16 });
  assert.equal(f.charging, false);
  assert.equal(f.batteryMagnitude, 16);
  assert.equal(f.batteryState, 'entlädt');
});

test('flowModel klemmt negativen Netzverbrauch auf 0', () => {
  assert.equal(flowModel({ ...LIVE_ROW, grid_cons_watt: -5 }).gridConsumption, 0);
});

/* ── Aufschluesselung des Hausnetzes ────────────────────────────────────── */

test('houseBreakdown listet jeden Plug einzeln plus Grundbedarf', () => {
  const flow = flowModel(LIVE_ROW);
  const plugs = [
    { plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 6 },
    { plug_sn: 'B', plug_name: 'Router', watts: 3 },
  ];
  const b = houseBreakdown(flow, plugs);
  const names = b.items.map((i) => i.name);
  assert.deepEqual(names, ['Kuehlschrank', 'Router', 'Grundbedarf (Dauerleistung)']);
  assert.equal(b.total, 19);
});

test('houseBreakdown skaliert mit beliebig vielen Plugs', () => {
  const flow = flowModel({ ...LIVE_ROW, inv_to_plug_watt: 80, ac_house_watt: 90 });
  const plugs = Array.from({ length: 8 }, (_, i) => ({ plug_sn: `S${i}`, plug_name: `Plug ${i}`, watts: 10 }));
  const b = houseBreakdown(flow, plugs);
  assert.equal(b.items.filter((i) => i.kind === 'plug').length, 8);
});

test('houseBreakdown weist nicht erfasste Steckdosenleistung aus', () => {
  const flow = flowModel({ ...LIVE_ROW, inv_to_plug_watt: 20 });
  const b = houseBreakdown(flow, [{ plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 6 }]);
  const rest = b.items.find((i) => i.kind === 'unassigned');
  assert.equal(rest.watts, 14);
});

test('houseBreakdown zeigt ohne Plugs die Steckdosensumme als Sammelposten', () => {
  const flow = flowModel(LIVE_ROW);
  const b = houseBreakdown(flow, []);
  const rest = b.items.find((i) => i.kind === 'unassigned');
  assert.equal(rest.name, 'Steckdosen gesamt');
  assert.equal(rest.watts, 9);
});

test('houseBreakdown ergaenzt den nicht erfassten Rest des Hausverbrauchs', () => {
  const flow = flowModel({ ...LIVE_ROW, ac_house_watt: 40 });
  const b = houseBreakdown(flow, []);
  const residual = b.items.find((i) => i.kind === 'residual');
  assert.equal(residual.watts, 21);
});

test('houseBreakdown-Anteile summieren sich auf 1', () => {
  const flow = flowModel(LIVE_ROW);
  const b = houseBreakdown(flow, [{ plug_sn: 'A', plug_name: 'K', watts: 9 }]);
  const sum = b.items.reduce((s, i) => s + i.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('houseBreakdown ohne Verbrauch hat Anteil 0 statt Division durch 0', () => {
  const flow = flowModel({ ...LIVE_ROW, ac_house_watt: 0, inv_to_plug_watt: 0, permanent_watt: 0 });
  const b = houseBreakdown(flow, []);
  assert.equal(b.total, 0);
  assert.ok(b.items.every((i) => i.share === 0));
});
