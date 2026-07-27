import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initialState, resolveRange, describeRange, buildViewModel,
} from '../../docs/dashboard/lib/viewmodel.mjs';

const NOW = new Date(2026, 6, 26, 22, 41, 0);

/** Erzeugt Messzeilen im 2-Minuten-Takt ab einem Startzeitpunkt. */
function makeRows(start, count, fn) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + i * 2 * 60000);
    return {
      t: d.toISOString().slice(0, 19),
      pv1_watt: 0, pv2_watt: 0, ac_house_watt: 19,
      battery_soc_percent: 60, battery_power_watt: 0,
      inv_to_plug_watt: 9, permanent_watt: 10, grid_cons_watt: 0,
      pv1_volt: 28, pv2_volt: 29, inv_volt: 237,
      pv1_temp_c: 40, pv2_temp_c: 41, inv_temp_c: 34,
      bat_lower_limit: 20, bat_upper_limit: 100, wifi_rssi: -50,
      total_pv_wh_daily: 0,
      ...(fn ? fn(i, d) : {}),
    };
  });
}

const TODAY_START = new Date(2026, 6, 26, 8, 0, 0);
const ROWS = makeRows(TODAY_START, 60, (i) => ({
  pv1_watt: i < 30 ? 100 : 0,
  pv2_watt: i < 30 ? 100 : 0,
  battery_power_watt: i < 30 ? -150 : 40,
}));

const PLUG_ROWS = ROWS.flatMap((r) => ([
  { t: r.t, plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 6, switch_sta: 1 },
  { t: r.t, plug_sn: 'B', plug_name: 'Router', watts: 3, switch_sta: 1 },
]));

test('initialState startet mit Leistungsuebersicht und Live-Modus', () => {
  const s = initialState();
  assert.equal(s.tab, 0);
  assert.equal(s.preset, 'today');
  assert.equal(s.flowMode, 'live');
});

test('resolveRange nutzt bei custom die gesetzten Grenzen', () => {
  const from = new Date(2026, 6, 20), to = new Date(2026, 6, 22);
  const r = resolveRange({ preset: 'custom', from, to }, NOW);
  assert.equal(r.from, from);
  assert.equal(r.to, to);
});

test('resolveRange berechnet Presets relativ zum Bezugszeitpunkt', () => {
  const r = resolveRange({ preset: 'today' }, NOW);
  assert.equal(r.from.getDate(), 26);
  assert.equal(r.from.getHours(), 0);
});

test('describeRange beschreibt Presets und eigene Zeitraeume', () => {
  assert.match(describeRange({ preset: 'today' }, NOW), /^Heute · /);
  assert.match(describeRange({ preset: 'yesterday' }, NOW), /^Gestern · /);
  assert.equal(describeRange({ preset: 'all' }, NOW), 'Alle Daten');
  assert.equal(describeRange({ preset: '7d' }, NOW), '7 Tage');
  const custom = describeRange({ preset: 'custom', from: new Date(2026, 6, 20, 8, 0), to: null }, NOW);
  assert.match(custom, /– jetzt$/);
});

test('buildViewModel filtert auf den gewaehlten Zeitraum', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, { ...initialState() }, NOW);
  assert.equal(vm.empty, false);
  assert.equal(vm.filtered.length, ROWS.length);
  assert.equal(vm.granularity, 'raw');
});

test('buildViewModel liefert bei leerem Zeitraum einen definierten Zustand', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, { preset: 'yesterday', tab: 0, flowMode: 'live' }, NOW);
  assert.equal(vm.empty, true);
  assert.equal(vm.flow, null);
  assert.equal(vm.houseBreakdown, null);
  assert.equal(vm.energy.productionWh, 0);
});

test('die Energie-Kennzahlen sind unabhaengig vom aktiven Tab', () => {
  const base = initialState();
  const tab0 = buildViewModel(ROWS, PLUG_ROWS, { ...base, tab: 0 }, NOW);
  const tab1 = buildViewModel(ROWS, PLUG_ROWS, { ...base, tab: 1 }, NOW);
  assert.deepEqual(tab0.energy, tab1.energy);
  assert.equal(tab0.rangeLabel, tab1.rangeLabel);
  assert.equal(tab0.filtered.length, tab1.filtered.length);
});

test('der Ansichtsmodus aendert nur das Flussmodell, nicht die Kennzahlen', () => {
  const base = initialState();
  const live = buildViewModel(ROWS, PLUG_ROWS, { ...base, flowMode: 'live' }, NOW);
  const cumulative = buildViewModel(ROWS, PLUG_ROWS, { ...base, flowMode: 'period' }, NOW);
  assert.deepEqual(live.energy, cumulative.energy);
  // Live zeigt die letzte Messung (PV aus), Σ die ueber den Zeitraum
  // kumulierte Energie (PV war 30 Messwerte lang an -> > 0 Wh).
  assert.equal(live.flow.pvTotal, 0);
  assert.ok(cumulative.flow.pvTotal > 0);
});

test('der Σ-Modus kumuliert die Batterieleistung vorzeichenrichtig zu Energie (Wh)', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, { ...initialState(), flowMode: 'period' }, NOW);
  // 30x -150 W (laden, Linksregel haelt den 30. Wert ueber das 30. Intervall)
  // -> 30 Intervalle laden, 29 Intervalle entladen mit +40 W, je 1/30 h.
  const h = 1 / 30;
  const chargeWh = 30 * 150 * h;
  const dischargeWh = 29 * 40 * h;
  assert.ok(Math.abs(vm.flow.chargeWh - chargeWh) < 1e-9);
  assert.ok(Math.abs(vm.flow.dischargeWh - dischargeWh) < 1e-9);
  assert.ok(Math.abs(vm.flow.batteryWatt - (dischargeWh - chargeWh)) < 1e-9);
  assert.equal(vm.flow.charging, true);
});

test('der Σ-Modus zeigt kumulierte Energie statt eines Leistungsmittelwerts', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, { ...initialState(), flowMode: 'period' }, NOW);
  // PV lief 30 Messwerte lang mit 200 W (100+100) -> 30 Intervalle * 200 W * 1/30 h = 200 Wh.
  assert.ok(Math.abs(vm.flow.pvTotal - 200) < 1e-9);
  assert.ok(Math.abs(vm.flow.pv1 - 100) < 1e-9);
  assert.ok(Math.abs(vm.flow.pv2 - 100) < 1e-9);
});

test('der Σ-Modus zeigt den letzten bekannten Ladezustand statt eines Mittelwerts', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, { ...initialState(), flowMode: 'period' }, NOW);
  assert.equal(vm.flow.soc, 60);
});

test('die Plug-Aufschluesselung ist im Σ-Modus kumulierte Energie je Plug', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, { ...initialState(), flowMode: 'period' }, NOW);
  const kuehlschrank = vm.houseBreakdown.items.find((i) => i.name === 'Kuehlschrank');
  // Kuehlschrank laeuft konstant mit 6 W ueber 59 Intervalle a 1/30 h.
  assert.ok(Math.abs(kuehlschrank.watts - 6 * 59 * (1 / 30)) < 1e-9);
});

test('die Plug-Aufschluesselung zeigt im Live-Modus weiterhin die letzte Messung', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, initialState(), NOW);
  const kuehlschrank = vm.houseBreakdown.items.find((i) => i.name === 'Kuehlschrank');
  assert.equal(kuehlschrank.watts, 6);
});

test('die Energie rechnet auf Rohdaten, auch wenn die Anzeige aggregiert', () => {
  // Ab 7 Tagen Spannweite greift die Stundenaggregation fuer die Diagramme.
  // 6000 Zeilen a 2 min entsprechen rund 8,3 Tagen.
  const COUNT = 6000;
  const start = new Date(2026, 6, 1, 8, 0, 0);
  const many = makeRows(start, COUNT, () => ({ pv1_watt: 100, pv2_watt: 100, battery_power_watt: 20 }));
  const vm = buildViewModel(many, [], { preset: 'month', tab: 0, flowMode: 'live' }, NOW);
  assert.equal(vm.granularity, 'hour');
  assert.ok(vm.display.length < vm.filtered.length, 'Anzeige sollte aggregiert sein');
  // Entscheidend: die Integration nutzt die Rohzeilen. Bei Aggregation auf
  // Stundenmittel waeren die 2-Minuten-Abstaende zu 1-h-Luecken geworden und
  // calcEnergyWh haette sie komplett verworfen (Ergebnis 0).
  assert.ok(Math.abs(vm.energy.productionWh - ((COUNT - 1) * 200 / 30)) < 0.5);
});

test('buildViewModel schluesselt das Hausnetz je Plug auf', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, initialState(), NOW);
  const plugItems = vm.houseBreakdown.items.filter((i) => i.kind === 'plug');
  assert.equal(plugItems.length, 2);
  assert.ok(vm.houseBreakdown.items.some((i) => i.kind === 'base'));
});

test('buildViewModel kommt ohne Smart-Plug-Daten aus', () => {
  const vm = buildViewModel(ROWS, [], initialState(), NOW);
  assert.equal(vm.plugs.groups.length, 0);
  assert.equal(vm.plugs.summary.count, 0);
  assert.equal(vm.plugs.cumulativeSummary.count, 0);
  const rest = vm.houseBreakdown.items.find((i) => i.kind === 'unassigned');
  assert.equal(rest.name, 'Steckdosen gesamt');
});

test('vm.plugs.cumulative liefert die kumulierte Energie je Plug fuer Tab 02', () => {
  // Kuehlschrank laeuft konstant mit 6 W ueber 59 Intervalle a 1/30 h
  // (dieselbe Rechnung wie fuer die Hausnetz-Aufschluesselung im Σ-Modus).
  const vm = buildViewModel(ROWS, PLUG_ROWS, initialState(), NOW);
  const kuehlschrank = vm.plugs.cumulative.find((p) => p.plug_name === 'Kuehlschrank');
  assert.ok(Math.abs(kuehlschrank.watts - 6 * 59 * (1 / 30)) < 1e-9);
  assert.ok(Math.abs(vm.plugs.cumulativeSummary.totalWh - kuehlschrank.watts - vm.plugs.cumulative
    .find((p) => p.plug_name === 'Router').watts) < 1e-9);
});

test('buildViewModel liefert Datenqualitaet und Aktualitaet mit', () => {
  const vm = buildViewModel(ROWS, PLUG_ROWS, initialState(), NOW);
  assert.equal(vm.quality.total, ROWS.length);
  assert.ok(vm.quality.coverage > 0);
  assert.equal(typeof vm.freshness.stale, 'boolean');
});

test('die Aktualitaetspruefung nutzt alle Daten, nicht nur den Filter', () => {
  // "Gestern" filtert alles weg, die Staleness-Warnung muss trotzdem greifen.
  const vm = buildViewModel(ROWS, PLUG_ROWS, { preset: 'yesterday', tab: 0, flowMode: 'live' }, NOW);
  assert.notEqual(vm.freshness.ageMinutes, null);
});

test('ein Preset-Wechsel aendert die Kennzahlen nachvollziehbar', () => {
  const today = buildViewModel(ROWS, PLUG_ROWS, { preset: 'today', tab: 0, flowMode: 'live' }, NOW);
  const all = buildViewModel(ROWS, PLUG_ROWS, { preset: 'all', tab: 0, flowMode: 'live' }, NOW);
  assert.equal(today.filtered.length, all.filtered.length);
  assert.equal(all.range.from, null);
});
