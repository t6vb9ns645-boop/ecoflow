import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fmtLabel, fmtClock, fmtW, fmtEnergy, fmtMeasure, fmtCount, rssiQuality,
} from '../../docs/dashboard/lib/format.mjs';

test('fmtLabel formatiert ISO-Zeitstempel deutsch', () => {
  assert.equal(fmtLabel('2026-07-25T13:48:20+02:00'), '25.07. 13:48');
});

test('fmtLabel gibt unbrauchbare Eingaben unveraendert zurueck', () => {
  assert.equal(fmtLabel('kaputt'), 'kaputt');
  assert.equal(fmtLabel('2026-07-25'), '2026-07-25');
});

test('fmtClock liefert nur die Uhrzeit', () => {
  assert.equal(fmtClock('2026-07-25T13:48:20+02:00'), '13:48');
  assert.equal(fmtClock('2026-07-25'), '');
});

test('fmtW rundet auf ganze Watt', () => {
  assert.equal(fmtW(156.7), '157');
  assert.equal(fmtW(0), '0');
  assert.equal(fmtW(-290.4), '-290');
});

test('fmtW zeigt fehlende Werte als Gedankenstrich', () => {
  assert.equal(fmtW(NaN), '—');
  assert.equal(fmtW(null), '—');
  assert.equal(fmtW(undefined), '—');
});

test('fmtEnergy nutzt Wh unterhalb von 1000', () => {
  assert.deepEqual(fmtEnergy(462.26), { value: '462', unit: 'Wh' });
  assert.deepEqual(fmtEnergy(0), { value: '0', unit: 'Wh' });
});

test('fmtEnergy wechselt ab 1000 Wh auf kWh', () => {
  assert.deepEqual(fmtEnergy(2380), { value: '2.38', unit: 'kWh' });
  assert.deepEqual(fmtEnergy(1000), { value: '1.00', unit: 'kWh' });
});

test('fmtEnergy behandelt fehlende Werte', () => {
  assert.deepEqual(fmtEnergy(NaN), { value: '—', unit: '' });
  assert.deepEqual(fmtEnergy(null), { value: '—', unit: '' });
});

test('fmtMeasure haengt die Einheit an', () => {
  assert.equal(fmtMeasure(28.7, 'V'), '28.7 V');
  assert.equal(fmtMeasure(NaN, 'V'), '—');
});

test('fmtCount nutzt deutsche Tausendertrennung', () => {
  assert.equal(fmtCount(171000), '171.000');
  assert.equal(fmtCount(5), '5');
});

test('rssiQuality stuft die Signalstaerke ein', () => {
  assert.equal(rssiQuality(-50), 'sehr gut');
  assert.equal(rssiQuality(-65), 'gut');
  assert.equal(rssiQuality(-75), 'mittel');
  assert.equal(rssiQuality(-90), 'schwach');
});

test('rssiQuality lehnt unplausible Werte ab', () => {
  assert.equal(rssiQuality(NaN), '—');
  assert.equal(rssiQuality(0), '—');
  assert.equal(rssiQuality(null), '—');
});
