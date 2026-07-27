import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCsvLine, headerIndex, numField, numFieldOrZero,
  parseCsv, parseSmartplugsCsv, isAllZero,
} from '../../docs/dashboard/lib/csv.mjs';

test('parseCsvLine trennt einfache Felder', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('parseCsvLine behaelt leere Felder', () => {
  assert.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c']);
  assert.deepEqual(parseCsvLine(''), ['']);
});

test('parseCsvLine respektiert Kommas in Anfuehrungszeichen', () => {
  assert.deepEqual(parseCsvLine('1,"Kueche, links",3'), ['1', 'Kueche, links', '3']);
});

test('parseCsvLine entschluesselt doppelte Anfuehrungszeichen', () => {
  assert.deepEqual(parseCsvLine('"sagt ""hallo""",x'), ['sagt "hallo"', 'x']);
});

test('headerIndex trimmt Spaltennamen', () => {
  assert.deepEqual(headerIndex([' a ', 'b']), { a: 0, b: 1 });
});

test('numField gibt NaN fuer fehlende Spalte', () => {
  assert.ok(Number.isNaN(numField(['1'], { a: 0 }, 'fehlt')));
});

test('numField gibt NaN fuer leeren Wert', () => {
  assert.ok(Number.isNaN(numField(['', '2'], { a: 0, b: 1 }, 'a')));
});

test('numFieldOrZero ersetzt fehlende Werte durch 0', () => {
  assert.equal(numFieldOrZero(['', '2'], { a: 0, b: 1 }, 'a'), 0);
  assert.equal(numFieldOrZero(['5'], { a: 0 }, 'a'), 5);
});

const MAIN_CSV = [
  'timestamp,pv1_watt,pv2_watt,ac_house_watt,battery_soc_percent,battery_power_watt,total_pv_wh_daily,pv1_temp_c,inv_to_plug_watt,permanent_watt',
  '2026-07-25T13:48:20+02:00,157,152,19,70,-290,412.42,47,9,10',
  '2026-07-25T13:50:37+02:00,157,152,19,70,-290,422.29,,9,10',
].join('\n');

test('parseCsv liest Zeilen und Zahlenfelder', () => {
  const rows = parseCsv(MAIN_CSV);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pv1_watt, 157);
  assert.equal(rows[0].battery_power_watt, -290);
  assert.equal(rows[0].t, '2026-07-25T13:48:20+02:00');
});

test('parseCsv unterscheidet fehlenden Messwert von 0', () => {
  const rows = parseCsv(MAIN_CSV);
  assert.equal(rows[0].pv1_temp_c, 47);
  // Leeres optionales Feld bleibt NaN, damit Diagramme dort eine Luecke zeigen.
  assert.ok(Number.isNaN(rows[1].pv1_temp_c));
});

test('parseCsv gibt bei leerem Text ein leeres Array zurueck', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('   '), []);
});

test('parseCsv ueberspringt Leerzeilen und Zeilen ohne Zeitstempel', () => {
  const csv = 'timestamp,pv1_watt\n2026-07-25T13:00:00,5\n\n,9\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1);
});

test('parseCsv setzt fehlende Pflichtfelder auf 0', () => {
  const rows = parseCsv('timestamp,pv1_watt\n2026-07-25T13:00:00,5\n');
  assert.equal(rows[0].ac_house_watt, 0);
  assert.equal(rows[0].battery_power_watt, 0);
});

const PLUG_CSV = [
  'timestamp,plug_sn,plug_name,watts,switch_sta,volt,current_a,temp_c,led_brightness',
  '2026-07-25T13:48:20+02:00,HW52A,"Kuehlschrank, gross",18.5,1,230.1,0.08,24,50',
  '2026-07-25T13:48:20+02:00,HW52B,Router,7,1,230.1,0.03,22,50',
].join('\n');

test('parseSmartplugsCsv liest Long-Format inkl. Namen mit Komma', () => {
  const rows = parseSmartplugsCsv(PLUG_CSV);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plug_name, 'Kuehlschrank, gross');
  assert.equal(rows[0].watts, 18.5);
  assert.equal(rows[1].plug_sn, 'HW52B');
});

test('parseSmartplugsCsv nutzt die Seriennummer als Namensersatz', () => {
  const csv = 'timestamp,plug_sn,plug_name,watts\n2026-07-25T13:00:00,SN1,,4\n';
  assert.equal(parseSmartplugsCsv(csv)[0].plug_name, 'SN1');
});

test('parseSmartplugsCsv ueberspringt Zeilen ohne Seriennummer', () => {
  const csv = 'timestamp,plug_sn,plug_name,watts\n2026-07-25T13:00:00,,X,4\n2026-07-25T13:02:00,SN1,Y,4\n';
  assert.equal(parseSmartplugsCsv(csv).length, 1);
});

test('parseSmartplugsCsv gibt bei leerem Text ein leeres Array zurueck', () => {
  assert.deepEqual(parseSmartplugsCsv(''), []);
});

test('isAllZero erkennt die leere API-Antwort', () => {
  const zero = {
    pv1_watt: 0, pv2_watt: 0, ac_house_watt: 0,
    battery_soc_percent: 0, battery_power_watt: 0,
  };
  assert.equal(isAllZero(zero), true);
  assert.equal(isAllZero({ ...zero, ac_house_watt: 17 }), false);
});
