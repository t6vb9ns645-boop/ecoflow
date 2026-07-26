import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESETS, PRESET_LABELS, presetRange, parseDEDate, filterRows,
  pickGranularity, aggregateRows, aggregatePlugRows, averageRow,
  dataQuality, dataFreshness,
} from '../../docs/dashboard/lib/filters.mjs';
import { isAllZero } from '../../docs/dashboard/lib/csv.mjs';

// Fester Bezugszeitpunkt: Sonntag, 26.07.2026, 22:41 Ortszeit.
const NOW = new Date(2026, 6, 26, 22, 41, 0);

test('alle Presets haben ein Label', () => {
  for (const p of PRESETS) assert.ok(PRESET_LABELS[p.key], `Label fehlt fuer ${p.key}`);
});

test('presetRange today beginnt um Mitternacht', () => {
  const { from, to } = presetRange('today', NOW);
  assert.equal(from.getHours(), 0);
  assert.equal(from.getMinutes(), 0);
  assert.equal(from.getDate(), 26);
  assert.equal(to, NOW);
});

test('presetRange yesterday umfasst den kompletten Vortag', () => {
  const { from, to } = presetRange('yesterday', NOW);
  assert.equal(from.getDate(), 25);
  assert.equal(from.getHours(), 0);
  assert.equal(to.getDate(), 25);
  assert.equal(to.getHours(), 23);
});

test('presetRange 7d und 30d liegen entsprechend zurueck', () => {
  assert.equal(presetRange('7d', NOW).from.getDate(), 19);
  assert.equal(presetRange('30d', NOW).from.getMonth(), 5); // Juni
});

test('presetRange month beginnt am Monatsersten', () => {
  const { from } = presetRange('month', NOW);
  assert.equal(from.getDate(), 1);
  assert.equal(from.getMonth(), 6);
});

test('presetRange year beginnt am 1. Januar', () => {
  const { from } = presetRange('year', NOW);
  assert.equal(from.getMonth(), 0);
  assert.equal(from.getDate(), 1);
});

test('presetRange all ist unbegrenzt', () => {
  assert.deepEqual(presetRange('all', NOW), { from: null, to: null });
  assert.deepEqual(presetRange('unbekannt', NOW), { from: null, to: null });
});

test('parseDEDate liest das deutsche Format', () => {
  const d = parseDEDate('26.07.2026 22:41');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 26);
  assert.equal(d.getHours(), 22);
});

test('parseDEDate akzeptiert einstellige Tage und Monate', () => {
  const d = parseDEDate('1.7.2026 9:05');
  assert.equal(d.getDate(), 1);
  assert.equal(d.getMonth(), 6);
});

test('parseDEDate lehnt falsche Formate ab', () => {
  assert.equal(parseDEDate('2026-07-26 22:41'), null);
  assert.equal(parseDEDate('26.07.2026'), null);
  assert.equal(parseDEDate('unsinn'), null);
  assert.equal(parseDEDate(''), null);
});

test('parseDEDate lehnt nicht existierende Kalendertage ab', () => {
  // Ohne Rollover-Pruefung wuerde daraus stillschweigend der 01.02. werden.
  assert.equal(parseDEDate('32.01.2026 10:00'), null);
  assert.equal(parseDEDate('31.02.2026 10:00'), null);
});

const ROWS = [
  { t: '2026-07-24T10:00:00', v: 1 },
  { t: '2026-07-25T10:00:00', v: 2 },
  { t: '2026-07-26T10:00:00', v: 3 },
];

test('filterRows grenzt beidseitig ein', () => {
  const out = filterRows(ROWS, new Date('2026-07-25T00:00:00'), new Date('2026-07-25T23:59:59'));
  assert.equal(out.length, 1);
  assert.equal(out[0].v, 2);
});

test('filterRows erlaubt offene Grenzen', () => {
  assert.equal(filterRows(ROWS, new Date('2026-07-25T00:00:00'), null).length, 2);
  assert.equal(filterRows(ROWS, null, new Date('2026-07-25T00:00:00')).length, 1);
  assert.equal(filterRows(ROWS, null, null).length, 3);
});

test('pickGranularity waehlt roh, stuendlich, taeglich', () => {
  assert.equal(pickGranularity([]), 'raw');
  assert.equal(pickGranularity([{ t: '2026-07-26T10:00:00' }]), 'raw');
  assert.equal(pickGranularity([
    { t: '2026-07-20T10:00:00' }, { t: '2026-07-26T10:00:00' },
  ]), 'raw');
  assert.equal(pickGranularity([
    { t: '2026-07-01T10:00:00' }, { t: '2026-07-26T10:00:00' },
  ]), 'hour');
  assert.equal(pickGranularity([
    { t: '2026-01-01T10:00:00' }, { t: '2026-07-26T10:00:00' },
  ]), 'day');
});

const AGG_ROWS = [
  { t: '2026-07-26T10:05:00', pv1_watt: 100, pv2_watt: 10, pv1_temp_c: 40 },
  { t: '2026-07-26T10:35:00', pv1_watt: 200, pv2_watt: 20, pv1_temp_c: NaN },
  { t: '2026-07-26T11:05:00', pv1_watt: 300, pv2_watt: 30, pv1_temp_c: 50 },
];

test('aggregateRows mittelt je Stunde', () => {
  const out = aggregateRows(AGG_ROWS, 'hour');
  assert.equal(out.length, 2);
  assert.equal(out[0].pv1_watt, 150);
  assert.equal(out[1].pv1_watt, 300);
});

test('aggregateRows laesst NaN bei der Mittelung aus', () => {
  const out = aggregateRows(AGG_ROWS, 'hour');
  assert.equal(out[0].pv1_temp_c, 40);
});

test('aggregateRows setzt NaN, wenn kein Wert im Bucket liegt', () => {
  const out = aggregateRows([{ t: '2026-07-26T10:00:00', pv1_watt: 5, inv_volt: NaN }], 'hour');
  assert.ok(Number.isNaN(out[0].inv_volt));
});

test('aggregateRows mittelt je Tag', () => {
  const out = aggregateRows([
    { t: '2026-07-25T10:00:00', pv1_watt: 100 },
    { t: '2026-07-25T18:00:00', pv1_watt: 200 },
    { t: '2026-07-26T10:00:00', pv1_watt: 60 },
  ], 'day');
  assert.equal(out.length, 2);
  assert.equal(out[0].pv1_watt, 150);
});

test('aggregateRows liefert zeitlich sortierte Buckets', () => {
  const out = aggregateRows([
    { t: '2026-07-26T11:00:00', pv1_watt: 1 },
    { t: '2026-07-26T09:00:00', pv1_watt: 2 },
  ], 'hour');
  assert.ok(out[0].t < out[1].t);
});

test('aggregatePlugRows mittelt je Plug und Bucket', () => {
  const out = aggregatePlugRows([
    { t: '2026-07-26T10:05:00', plug_sn: 'A', plug_name: 'A1', watts: 10, switch_sta: 1 },
    { t: '2026-07-26T10:35:00', plug_sn: 'A', plug_name: 'A1', watts: 20, switch_sta: 1 },
    { t: '2026-07-26T10:05:00', plug_sn: 'B', plug_name: 'B1', watts: 5, switch_sta: 0 },
  ], 'hour');
  assert.equal(out.length, 2);
  const a = out.find((r) => r.plug_sn === 'A');
  assert.equal(a.watts, 15);
});

test('aggregatePlugRows uebernimmt den zuletzt bekannten Namen', () => {
  const out = aggregatePlugRows([
    { t: '2026-07-26T10:05:00', plug_sn: 'A', plug_name: 'Alt', watts: 10, switch_sta: 1 },
    { t: '2026-07-26T10:35:00', plug_sn: 'A', plug_name: 'Neu', watts: 20, switch_sta: 0 },
  ], 'hour');
  assert.equal(out[0].plug_name, 'Neu');
  assert.equal(out[0].switch_sta, 0);
});

test('aggregatePlugRows setzt Watt auf 0, wenn kein Messwert vorliegt', () => {
  const out = aggregatePlugRows([
    { t: '2026-07-26T10:05:00', plug_sn: 'A', plug_name: 'A', watts: NaN, switch_sta: 1 },
  ], 'hour');
  assert.equal(out[0].watts, 0);
});

test('averageRow mittelt alle Zahlenfelder', () => {
  const avg = averageRow([
    { t: '2026-07-26T10:00:00', pv1_watt: 100, battery_power_watt: -100 },
    { t: '2026-07-26T10:02:00', pv1_watt: 200, battery_power_watt: 0 },
  ]);
  assert.equal(avg.pv1_watt, 150);
  assert.equal(avg.battery_power_watt, -50);
  assert.equal(avg.t, '2026-07-26T10:02:00');
});

test('averageRow gibt null bei leerer Eingabe', () => {
  assert.equal(averageRow([]), null);
});

test('dataQuality erkennt die Nullwert-Phase am Anfang', () => {
  const zero = { pv1_watt: 0, pv2_watt: 0, ac_house_watt: 0, battery_soc_percent: 0, battery_power_watt: 0 };
  const rows = [
    { t: '2026-07-26T10:00:00', ...zero },
    { t: '2026-07-26T10:30:00', ...zero },
    { t: '2026-07-26T11:00:00', ...zero, ac_house_watt: 19 },
    { t: '2026-07-26T11:30:00', ...zero, ac_house_watt: 20 },
  ];
  const q = dataQuality(rows, isAllZero);
  assert.equal(q.total, 4);
  assert.equal(q.zeroCount, 2);
  assert.equal(q.validFromIdx, 2);
  assert.equal(q.coverage, 50);
  assert.equal(q.durationHours, 1.5);
  assert.equal(q.deadHours, 0.5);
});

test('dataQuality meldet volle Abdeckung ohne Nullphase', () => {
  const rows = [
    { t: '2026-07-26T10:00:00', pv1_watt: 1, pv2_watt: 0, ac_house_watt: 19, battery_soc_percent: 50, battery_power_watt: 1 },
  ];
  const q = dataQuality(rows, isAllZero);
  assert.equal(q.zeroCount, 0);
  assert.equal(q.coverage, 100);
});

test('dataQuality ist bei leerer Eingabe definiert', () => {
  const q = dataQuality([], isAllZero);
  assert.equal(q.total, 0);
  assert.equal(q.coverage, 0);
});

test('dataFreshness erkennt veraltete Daten ab 6 Minuten', () => {
  const now = new Date('2026-07-26T12:00:00Z');
  const fresh = dataFreshness([{ t: '2026-07-26T11:58:00Z' }], now);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.ageMinutes, 2);

  const stale = dataFreshness([{ t: '2026-07-26T11:50:00Z' }], now);
  assert.equal(stale.stale, true);
  assert.equal(stale.ageMinutes, 10);
});

test('dataFreshness gilt ohne Daten als veraltet', () => {
  const f = dataFreshness([], new Date());
  assert.equal(f.ageMinutes, null);
  assert.equal(f.stale, true);
});
