import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isCharging, chargePower, dischargePower, batteryState,
  isGridExporting, gridState,
  pvTotal, houseLoad, feedInPower, calcEnergyWh, cumulativeEnergyWh,
  energyTotals, flowModel, flowCumulative, houseBreakdown, houseTotalWatt, batteryFlows, MAX_GAP_HOURS,
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

/* ── Vorzeichenkonvention Netz (analog zur Batterie) ────────────────────── */

test('isGridExporting ist wahr, wenn die Einspeisung den Netzbezug uebersteigt', () => {
  assert.equal(isGridExporting(0, 67), true);
  assert.equal(isGridExporting(67, 0), false);
  assert.equal(isGridExporting(30, 30), false); // gleichauf zaehlt als Bezug, nicht Einspeisung
});

test('gridState benennt den Zustand', () => {
  assert.equal(gridState(67, 0), 'bezieht');
  assert.equal(gridState(0, 67), 'speist ein');
  assert.equal(gridState(0, 0), 'inaktiv');
  assert.equal(gridState(NaN, NaN), 'inaktiv');
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

test('flowModel bildet den Netzbezug-Fall korrekt ab (Balkonkraftwerk deckt Bedarf nicht)', () => {
  // Realer Fall (s. houseBreakdown-Tests): keine PV, kein Speicherumsatz,
  // WR liefert 0 W ans Hausnetz, Netz deckt 67 W -> keine Einspeisung moeglich.
  const row = {
    pv1_watt: 0, pv2_watt: 0, ac_house_watt: 0, battery_power_watt: 0,
    inv_to_plug_watt: 0, permanent_watt: 0, grid_cons_watt: 67, battery_soc_percent: 70,
  };
  const f = flowModel(row);
  assert.equal(f.gridConsumption, 67);
  assert.equal(f.feedIn, 0);
  assert.equal(f.gridExporting, false);
  assert.equal(f.gridMagnitude, 67);
  assert.equal(f.gridState, 'bezieht');
  assert.equal(f.gridNet, 67);
});

test('flowModel bildet den Einspeisung-Fall korrekt ab (PV-Ueberschuss)', () => {
  const row = { pv1_watt: 300, pv2_watt: 300, inv_to_plug_watt: 50, permanent_watt: 10, battery_power_watt: -100, grid_cons_watt: 0 };
  const f = flowModel(row);
  assert.equal(f.feedIn, 440);
  assert.equal(f.gridConsumption, 0);
  assert.equal(f.gridExporting, true);
  assert.equal(f.gridMagnitude, 440);
  assert.equal(f.gridState, 'speist ein');
  assert.equal(f.gridNet, -440);
});

/* ── Kumuliertes Flussmodell (Σ-Zeitraum-Modus) ─────────────────────────── */

const H = 1 / 30; // 2 Minuten in Stunden

function periodRows(specs) {
  // specs: [t, pv1, pv2, ac_house, batt, toPlugs, base, grid, soc]
  return specs.map(([t, pv1, pv2, house, batt, toPlugs, base, grid, soc]) => ({
    t, pv1_watt: pv1, pv2_watt: pv2, ac_house_watt: house, battery_power_watt: batt,
    inv_to_plug_watt: toPlugs, permanent_watt: base, grid_cons_watt: grid, battery_soc_percent: soc,
  }));
}

test('flowCumulative summiert PV zeitgewichtet statt zu mitteln', () => {
  // 3 Zeilen -> 2 Intervalle, Linksregel haelt je den frueheren Wert:
  // Intervall 1 mit 100 W, Intervall 2 mit 300 W (der letzte Messwert 0 W
  // startet kein weiteres Intervall mehr).
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 100, 100, 0, 0, 0, 0, 0, 50],
    ['2026-07-25T12:02:00Z', 300, 300, 0, 0, 0, 0, 0, 50],
    ['2026-07-25T12:04:00Z', 0, 0, 0, 0, 0, 0, 0, 50],
  ]);
  const f = flowCumulative(rows);
  assert.ok(Math.abs(f.pv1 - (100 + 300) * H) < 1e-9);
  assert.ok(Math.abs(f.pv2 - (100 + 300) * H) < 1e-9);
  assert.ok(Math.abs(f.pvTotal - (200 + 600) * H) < 1e-9);
});

test('flowCumulative trennt Lade- und Entladeenergie und bildet das Netto', () => {
  // 5 Zeilen -> 4 Intervalle. Die Linksregel haelt je den FRUEHEREN Wert:
  // Intervalle 1+2 laden mit -100 W, Intervalle 3+4 entladen mit 40 W
  // (der letzte Messwert selbst startet kein weiteres Intervall mehr).
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 0, 0, 0, -100, 0, 0, 0, 50],
    ['2026-07-25T12:02:00Z', 0, 0, 0, -100, 0, 0, 0, 50],
    ['2026-07-25T12:04:00Z', 0, 0, 0, 40, 0, 0, 0, 50],
    ['2026-07-25T12:06:00Z', 0, 0, 0, 40, 0, 0, 0, 50],
    ['2026-07-25T12:08:00Z', 0, 0, 0, 40, 0, 0, 0, 50],
  ]);
  const f = flowCumulative(rows);
  assert.ok(Math.abs(f.chargeWh - 2 * 100 * H) < 1e-9);
  assert.ok(Math.abs(f.dischargeWh - 2 * 40 * H) < 1e-9);
  assert.ok(Math.abs(f.batteryWatt - (2 * 40 * H - 2 * 100 * H)) < 1e-9);
  assert.equal(f.charging, true);
  assert.equal(f.batteryState, 'lädt');
});

test('flowCumulative zeigt den letzten bekannten Ladezustand, nicht den Mittelwert', () => {
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 0, 0, 0, 0, 0, 0, 0, 40],
    ['2026-07-25T12:02:00Z', 0, 0, 0, 0, 0, 0, 0, 80],
  ]);
  assert.equal(flowCumulative(rows).soc, 80);
});

test('flowCumulative ignoriert einen fehlenden SOC-Wert am Ende und faellt auf den letzten gueltigen zurueck', () => {
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 0, 0, 0, 0, 0, 0, 0, 40],
    ['2026-07-25T12:02:00Z', 0, 0, 0, 0, 0, 0, 0, NaN],
  ]);
  assert.equal(flowCumulative(rows).soc, 40);
});

test('flowCumulative kumuliert Hausnetz-Teilstroeme und Netzbezug getrennt', () => {
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 0, 0, 60, 0, 20, 10, 30, 50],
    ['2026-07-25T12:02:00Z', 0, 0, 60, 0, 20, 10, 30, 50],
  ]);
  const f = flowCumulative(rows);
  assert.ok(Math.abs(f.house - 60 * H) < 1e-9);
  assert.ok(Math.abs(f.toPlugs - 20 * H) < 1e-9);
  assert.ok(Math.abs(f.baseLoad - 10 * H) < 1e-9);
  assert.ok(Math.abs(f.gridConsumption - 30 * H) < 1e-9);
});

test('flowCumulative klemmt negativen Netzverbrauch auf 0', () => {
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 0, 0, 0, 0, 0, 0, -5, 50],
    ['2026-07-25T12:02:00Z', 0, 0, 0, 0, 0, 0, -5, 50],
  ]);
  assert.equal(flowCumulative(rows).gridConsumption, 0);
});

test('flowCumulative verrechnet Netzbezug und Einspeisung ueber den Zeitraum zum Saldo', () => {
  // Intervall 1 bezieht 60 W vom Netz (kein PV-Ueberschuss), Intervall 2
  // speist 360 W ein (PV-Ueberschuss, kein Netzbezug mehr).
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 0, 0, 0, 0, 10, 10, 60, 50],
    ['2026-07-25T12:02:00Z', 200, 200, 0, 0, 30, 10, 0, 50],
    ['2026-07-25T12:04:00Z', 200, 200, 0, 0, 30, 10, 0, 50],
  ]);
  const f = flowCumulative(rows);
  assert.ok(Math.abs(f.gridConsumption - 60 * H) < 1e-9);
  assert.ok(Math.abs(f.feedIn - 360 * H) < 1e-9);
  assert.equal(f.gridExporting, true, 'Einspeisung ueberwiegt ueber den Gesamtzeitraum');
  assert.ok(Math.abs(f.gridMagnitude - (360 - 60) * H) < 1e-9);
  assert.equal(f.gridState, 'speist ein');
});

test('flowCumulative ist bei leeren/einzelnen Zeilen ueberall 0 bzw. 0 SOC', () => {
  assert.deepEqual(flowCumulative([]).soc, 0);
  const f = flowCumulative(periodRows([['2026-07-25T12:00:00Z', 100, 100, 0, 0, 0, 0, 0, 0]]));
  assert.equal(f.pvTotal, 0);
  assert.equal(f.chargeWh, 0);
  assert.equal(f.dischargeWh, 0);
});

test('houseBreakdown funktioniert unveraendert mit einem kumulierten (Wh-)Flussmodell', () => {
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 0, 0, 60, 0, 20, 10, 0, 50],
    ['2026-07-25T12:02:00Z', 0, 0, 60, 0, 20, 10, 0, 50],
  ]);
  const f = flowCumulative(rows);
  const plugsWh = [{ plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 20 * H }];
  const b = houseBreakdown(f, plugsWh);
  const plug = b.items.find((i) => i.kind === 'plug');
  assert.ok(Math.abs(plug.watts - 20 * H) < 1e-9);
  const base = b.items.find((i) => i.kind === 'base');
  assert.ok(Math.abs(base.watts - 10 * H) < 1e-9);
});

/* ── Vorzeichen an echten Messpunkten (beide Richtungen) ────────────────── */

test('Ladefall aus den Messdaten geht in der Bilanz exakt auf', () => {
  // 2026-06-24T11:14:19: PV 221 W, Batterie -203 W, Haus 18 W -> 203 + 18 = 221
  const row = { pv1_watt: 110, pv2_watt: 111, ac_house_watt: 18, battery_power_watt: -203, battery_soc_percent: 55 };
  const f = flowModel(row);
  assert.equal(f.charging, true);
  assert.equal(f.batteryState, 'lädt');
  assert.equal(chargePower(row.battery_power_watt) + f.house, f.pvTotal);
});

test('Entladefall aus den Messdaten deckt den Hausverbrauch', () => {
  // 2026-06-23T21:18:22: PV 0 W, Batterie +23 W, Haus 19 W -> Entladung speist das Haus
  const row = { pv1_watt: 0, pv2_watt: 0, ac_house_watt: 19, battery_power_watt: 23, battery_soc_percent: 60 };
  const f = flowModel(row);
  assert.equal(f.charging, false);
  assert.equal(f.batteryState, 'entlädt');
  assert.equal(f.pvTotal, 0);
  assert.ok(dischargePower(row.battery_power_watt) >= f.house);
});

test('das Vorzeichen kehrt sich mit der Flussrichtung um, nicht mit dem Betrag', () => {
  for (const w of [1, 40, 203, 290]) {
    assert.equal(flowModel({ battery_power_watt: -w }).charging, true, `-${w} muss laden sein`);
    assert.equal(flowModel({ battery_power_watt: w }).charging, false, `+${w} muss entladen sein`);
    assert.equal(flowModel({ battery_power_watt: -w }).batteryMagnitude,
      flowModel({ battery_power_watt: w }).batteryMagnitude, 'Betrag muss richtungsunabhaengig sein');
  }
});

test('Speicher ohne Leistung gilt weder als ladend noch als entladend', () => {
  const f = flowModel({ battery_power_watt: 0 });
  assert.equal(f.charging, false);
  assert.equal(f.batteryState, 'inaktiv');
  assert.equal(f.batteryMagnitude, 0);
});

/* ── Lade-/Entladeanteil ueber einen Zeitraum ───────────────────────────── */

const battRows = (values) => values.map((v) => ({ battery_power_watt: v }));

test('batteryFlows trennt Laden und Entladen', () => {
  const f = batteryFlows(battRows([-150, -150, 40, 40]));
  assert.equal(f.meanCharge, 75);
  assert.equal(f.meanDischarge, 20);
  assert.equal(f.chargeSamples, 2);
  assert.equal(f.dischargeSamples, 2);
  assert.equal(f.bidirectional, true);
});

test('das Netto aus batteryFlows entspricht dem Mittelwert', () => {
  const values = [-150, -150, -150, 40, 40, 40];
  const f = batteryFlows(battRows(values));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(f.net - mean) < 1e-9, `net ${f.net} != Mittelwert ${mean}`);
});

test('ein Netto nahe null verdeckt keine echten Fluesse mehr', () => {
  // Gleich viel geladen wie entladen: der Pfeil zeigt fast nichts an,
  // die getrennten Anteile machen den tatsaechlichen Umsatz sichtbar.
  const f = batteryFlows(battRows([-100, 100, -100, 100]));
  assert.equal(f.net, 0);
  assert.equal(f.meanCharge, 50);
  assert.equal(f.meanDischarge, 50);
  assert.equal(f.bidirectional, true);
});

test('batteryFlows meldet eine reine Laderichtung als nicht bidirektional', () => {
  const f = batteryFlows(battRows([-100, -200, 0]));
  assert.equal(f.bidirectional, false);
  assert.equal(f.meanDischarge, 0);
  assert.ok(f.net < 0);
});

test('batteryFlows ignoriert fehlende Messwerte', () => {
  const f = batteryFlows(battRows([NaN, -60, NaN, 20]));
  assert.equal(f.chargeSamples, 1);
  assert.equal(f.dischargeSamples, 1);
  assert.equal(f.meanCharge, 30);
});

test('batteryFlows ist bei leerer Eingabe definiert', () => {
  const f = batteryFlows([]);
  assert.equal(f.net, 0);
  assert.equal(f.bidirectional, false);
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

/* ── Netzbezug im Hausnetz (Balkonkraftwerk deckt Bedarf nicht vollstaendig) ── */

test('houseBreakdown zeigt keinen Netzbezug-Posten ohne Netzverbrauch', () => {
  const flow = flowModel(LIVE_ROW); // grid_cons_watt: 0
  const b = houseBreakdown(flow, []);
  assert.equal(b.items.find((i) => i.kind === 'grid'), undefined);
});

test('houseBreakdown weist Netzbezug aus, wenn PV/Speicher den Bedarf nicht decken', () => {
  // Realer Fall (2026-07-27): WR liefert 0 W ans Hausnetz (PV laedt komplett
  // die Batterie), die Smart Plugs verbrauchen dennoch ~58 W -> aus dem Netz.
  const row = {
    ...LIVE_ROW, ac_house_watt: 0, inv_to_plug_watt: 0, permanent_watt: 10, grid_cons_watt: 67,
  };
  const flow = flowModel(row);
  const plugs = [{ plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 58 }];
  const b = houseBreakdown(flow, plugs);
  const grid = b.items.find((i) => i.kind === 'grid');
  assert.ok(grid, 'Netzbezug-Posten fehlt');
  assert.equal(grid.watts, 67);
  assert.ok(b.total >= 67 + 58 + 10 - 1e-9, 'Netzbezug muss im Gesamttotal enthalten sein');
});

test('houseBreakdown-Anteile summieren sich mit Netzbezug weiterhin auf 1', () => {
  const row = { ...LIVE_ROW, ac_house_watt: 0, inv_to_plug_watt: 0, grid_cons_watt: 67 };
  const flow = flowModel(row);
  const b = houseBreakdown(flow, [{ plug_sn: 'A', plug_name: 'K', watts: 58 }]);
  const sum = b.items.reduce((s, i) => s + i.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('houseTotalWatt addiert Wechselrichter- und Netzanteil', () => {
  const flow = flowModel({ ...LIVE_ROW, ac_house_watt: 19, grid_cons_watt: 67 });
  assert.equal(houseTotalWatt(flow), 19 + 67);
});

test('houseTotalWatt ist ohne Netzbezug identisch zum Wechselrichter-Anteil', () => {
  const flow = flowModel(LIVE_ROW); // grid_cons_watt: 0
  assert.equal(houseTotalWatt(flow), flow.house);
});

/* ── Netzeinspeisung darf nicht als Hausnetz-Verbrauch gefuehrt werden ──── */

test('flowModel enthaelt die berechnete Netzeinspeisung', () => {
  const row = { pv1_watt: 300, pv2_watt: 300, inv_to_plug_watt: 50, permanent_watt: 10, battery_power_watt: -100 };
  assert.equal(flowModel(row).feedIn, 440);
});

test('flowCumulative kumuliert die Netzeinspeisung zeitgewichtet', () => {
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 200, 200, 0, 0, 30, 10, 0, 50],
    ['2026-07-25T12:02:00Z', 200, 200, 0, 0, 30, 10, 0, 50],
  ]);
  // PV 400 W, Haus 40 W, keine Ladung -> 360 W Ueberschuss ueber 1 Intervall (H).
  assert.ok(Math.abs(flowCumulative(rows).feedIn - 360 * H) < 1e-9);
});

test('houseBreakdown zaehlt vollstaendig durch Einspeisung erklaerte Luecke nicht als Sonstiges', () => {
  // Smart Plugs verbrauchen wenig (30+10 W), Speicher voll (laedt nicht) ->
  // der PV-Ueberschuss (360 W) erklaert die komplette Luecke zum gemessenen
  // Wechselrichter-Ausgang (380 W) -> kein "Sonstiges/nicht erfasst" mehr.
  const row = {
    pv1_watt: 200, pv2_watt: 200, ac_house_watt: 380, battery_power_watt: 0,
    inv_to_plug_watt: 30, permanent_watt: 10, grid_cons_watt: 0,
  };
  const flow = flowModel(row);
  const b = houseBreakdown(flow, []);
  assert.equal(b.items.find((i) => i.kind === 'residual'), undefined);
  assert.ok(Math.abs(b.feedIn - 340) < 1e-9, 'Einspeisung wird auf die beobachtete Luecke gedeckelt');
  assert.ok(Math.abs(b.total - 40) < 1e-9, 'Hausnetz-Gesamt darf die Einspeisung nicht enthalten');
});

test('houseBreakdown weist den durch Einspeisung nicht erklaerten Rest weiterhin als Sonstiges aus', () => {
  // Luecke (180 W) ist groesser als die berechnete Einspeisung (130 W) ->
  // 130 W gelten als Einspeisung, 50 W bleiben unerklaert (Sonstiges).
  const row = {
    pv1_watt: 100, pv2_watt: 100, ac_house_watt: 200, battery_power_watt: -50,
    inv_to_plug_watt: 10, permanent_watt: 10, grid_cons_watt: 0,
  };
  const flow = flowModel(row);
  const b = houseBreakdown(flow, []);
  const residual = b.items.find((i) => i.kind === 'residual');
  assert.ok(residual, 'Sonstiges-Posten fehlt');
  assert.equal(residual.watts, 50);
  assert.equal(b.feedIn, 130);
});

test('houseBreakdown veraendert bekannte Faelle ohne Einspeisung nicht (Regression)', () => {
  // Deckungsgleich mit dem Fall "ergaenzt den nicht erfassten Rest": Speicher
  // laedt mit dem gesamten PV-Ueberschuss -> feedInPower ist 0, Sonstiges
  // bleibt unveraendert bei 21 W.
  const flow = flowModel({ ...LIVE_ROW, ac_house_watt: 40 });
  const b = houseBreakdown(flow, []);
  assert.equal(flow.feedIn, 0);
  assert.equal(b.feedIn, 0);
  assert.equal(b.items.find((i) => i.kind === 'residual').watts, 21);
});

test('houseTotalWatt zieht die Netzeinspeisung vom Hausnetz-Gesamt ab', () => {
  const row = {
    pv1_watt: 200, pv2_watt: 200, ac_house_watt: 380, battery_power_watt: 0,
    inv_to_plug_watt: 30, permanent_watt: 10, grid_cons_watt: 0,
  };
  const flow = flowModel(row);
  assert.ok(Math.abs(houseTotalWatt(flow) - 40) < 1e-9);
});

test('houseBreakdown zaehlt Netzeinspeisung auch im Σ-Zeitraum-Modus nicht als Hausnetz-Verbrauch', () => {
  const rows = periodRows([
    ['2026-07-25T12:00:00Z', 200, 200, 380, 0, 30, 10, 0, 50],
    ['2026-07-25T12:02:00Z', 200, 200, 380, 0, 30, 10, 0, 50],
  ]);
  const f = flowCumulative(rows);
  const b = houseBreakdown(f, []);
  assert.equal(b.items.find((i) => i.kind === 'residual'), undefined);
  assert.ok(b.feedIn > 0);
  assert.ok(Math.abs(b.total - (f.toPlugs + f.baseLoad)) < 1e-9);
});
