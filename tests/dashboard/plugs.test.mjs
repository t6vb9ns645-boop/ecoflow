import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLUG_PALETTE, hashString, plugColor, groupPlugs, plugSummary, latestPlugMeasurements,
} from '../../docs/dashboard/lib/plugs.mjs';

test('hashString ist deterministisch und unterscheidet Eingaben', () => {
  assert.equal(hashString('HW52A'), hashString('HW52A'));
  assert.notEqual(hashString('HW52A'), hashString('HW52B'));
});

test('plugColor liefert eine Farbe aus der Palette', () => {
  assert.ok(PLUG_PALETTE.includes(plugColor('HW52A')));
});

test('plugColor bleibt an die Seriennummer gebunden, nicht an die Position', () => {
  // Kern der Verbesserung gegenueber v3.7.0: dort kam die Farbe aus dem
  // Listenindex und wechselte, sobald sich Reihenfolge oder Anzahl aenderte.
  const before = groupPlugs([
    { t: '2026-07-26T10:00:00', plug_sn: 'B', plug_name: 'Router', watts: 3, switch_sta: 1 },
    { t: '2026-07-26T10:00:00', plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 6, switch_sta: 1 },
  ]);
  const after = groupPlugs([
    { t: '2026-07-26T10:00:00', plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 6, switch_sta: 1 },
    { t: '2026-07-26T10:00:00', plug_sn: 'C', plug_name: 'Aquarium', watts: 4, switch_sta: 1 },
    { t: '2026-07-26T10:00:00', plug_sn: 'B', plug_name: 'Router', watts: 3, switch_sta: 1 },
  ]);
  const colorOf = (list, sn) => list.find((g) => g.sn === sn).color;
  assert.equal(colorOf(before, 'A'), colorOf(after, 'A'));
  assert.equal(colorOf(before, 'B'), colorOf(after, 'B'));
});

const PLUG_ROWS = [
  { t: '2026-07-26T10:00:00', plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 6, switch_sta: 1 },
  { t: '2026-07-26T10:02:00', plug_sn: 'A', plug_name: 'Kuehlschrank', watts: 18, switch_sta: 1 },
  { t: '2026-07-26T10:00:00', plug_sn: 'B', plug_name: 'Router', watts: 3, switch_sta: 0 },
];

test('groupPlugs buendelt je Seriennummer und sortiert zeitlich', () => {
  const groups = groupPlugs(PLUG_ROWS);
  assert.equal(groups.length, 2);
  const a = groups.find((g) => g.sn === 'A');
  assert.equal(a.rows.length, 2);
  assert.equal(a.last.watts, 18);
});

test('groupPlugs sortiert die Gruppen nach Anzeigename', () => {
  const groups = groupPlugs(PLUG_ROWS);
  assert.deepEqual(groups.map((g) => g.name), ['Kuehlschrank', 'Router']);
});

test('groupPlugs nutzt den zuletzt gemeldeten Namen', () => {
  const groups = groupPlugs([
    { t: '2026-07-26T10:00:00', plug_sn: 'A', plug_name: 'Alt', watts: 1, switch_sta: 1 },
    { t: '2026-07-26T10:02:00', plug_sn: 'A', plug_name: 'Umbenannt', watts: 1, switch_sta: 1 },
  ]);
  assert.equal(groups[0].name, 'Umbenannt');
});

test('groupPlugs sortiert auch bei unsortierter Eingabe korrekt', () => {
  const groups = groupPlugs([
    { t: '2026-07-26T10:04:00', plug_sn: 'A', plug_name: 'A', watts: 30, switch_sta: 1 },
    { t: '2026-07-26T10:00:00', plug_sn: 'A', plug_name: 'A', watts: 10, switch_sta: 1 },
  ]);
  assert.equal(groups[0].last.watts, 30);
});

test('groupPlugs liefert bei leerer Eingabe eine leere Liste', () => {
  assert.deepEqual(groupPlugs([]), []);
});

test('plugSummary zaehlt Gesamtleistung und Schaltzustaende', () => {
  const s = plugSummary(groupPlugs(PLUG_ROWS));
  assert.equal(s.count, 2);
  assert.equal(s.totalWatts, 21);
  assert.equal(s.onCount, 1);
  assert.equal(s.offCount, 1);
});

test('plugSummary ist ohne Plugs bei null', () => {
  const s = plugSummary([]);
  assert.deepEqual(s, { totalWatts: 0, onCount: 0, offCount: 0, count: 0 });
});

test('latestPlugMeasurements liefert je Plug den letzten Messwert mit Farbe', () => {
  const latest = latestPlugMeasurements(groupPlugs(PLUG_ROWS));
  assert.equal(latest.length, 2);
  const a = latest.find((p) => p.plug_sn === 'A');
  assert.equal(a.watts, 18);
  assert.equal(a.color, plugColor('A'));
});
