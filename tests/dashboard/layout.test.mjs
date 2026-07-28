import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WIDE_BREAKPOINT, ACTIVE_MIN_WATT, NODE_SIZES, strokeWidthFor, isEdgeActive,
  computeLayout, pickAnchorSides, arrowGlyph, pointOnCubic, edgeControlPoints, buildEdges,
} from '../../docs/dashboard/lib/layout.mjs';

/** Prueft, ob sich zwei achsenparallele Rechtecke ueberlappen. */
function overlaps(a, b) {
  return Math.abs(a.x - b.x) * 2 < (a.w + b.w) && Math.abs(a.y - b.y) * 2 < (a.h + b.h);
}
const box = (pos, w, h) => ({ x: pos.x, y: pos.y, w, h });

// Breiten quer durch alle realistischen Geraete, inkl. der Extremfaelle,
// bei denen zuvor Karten uebereinander lagen.
const WIDTHS = [280, 320, 360, 390, 420, 480, 520, 559, 560, 620, 768, 900, 1020, 1400];

test('strokeWidthFor bleibt im schmalen, lesbaren Band', () => {
  for (const w of [0, 1, 19, 157, 309, 5000]) {
    const s = strokeWidthFor(w);
    assert.ok(s >= 1.3 && s <= 3.4, `Stroke ${s} ausserhalb des Bandes bei ${w} W`);
  }
});

test('strokeWidthFor waechst monoton mit der Leistung', () => {
  assert.ok(strokeWidthFor(10) < strokeWidthFor(100));
  assert.ok(strokeWidthFor(100) <= strokeWidthFor(1000));
});

test('strokeWidthFor nutzt den Betrag der Leistung', () => {
  assert.equal(strokeWidthFor(-290), strokeWidthFor(290));
});

test('isEdgeActive trennt Fluss von Stillstand', () => {
  assert.equal(isEdgeActive(0), false);
  assert.equal(isEdgeActive(ACTIVE_MIN_WATT), false);
  assert.equal(isEdgeActive(1), true);
  assert.equal(isEdgeActive(-290), true);
  assert.equal(isEdgeActive(NaN), false);
});

test('computeLayout waehlt die Stufe am Breakpoint', () => {
  assert.equal(computeLayout(WIDE_BREAKPOINT - 1).tier, 'narrow');
  assert.equal(computeLayout(WIDE_BREAKPOINT).tier, 'wide');
  assert.equal(computeLayout(1020).sizes, NODE_SIZES.wide);
});

test('PV1 und PV2 stehen bei jeder Breite nebeneinander, nie uebereinander', () => {
  for (const w of WIDTHS) {
    const l = computeLayout(w);
    assert.equal(l.pv1.y, l.pv2.y, `PV-Karten nicht auf gleicher Hoehe bei ${w}px`);
    assert.ok(l.pv1.x < l.pv2.x, `PV-Reihenfolge vertauscht bei ${w}px`);
    assert.ok(
      !overlaps(box(l.pv1, 104, 92), box(l.pv2, 104, 92)),
      `PV-Karten ueberlappen bei ${w}px`,
    );
  }
});

test('Wechselrichter und Speicher ueberlappen bei keiner Breite', () => {
  for (const w of WIDTHS) {
    const l = computeLayout(w);
    const hub = box(l.hub, l.sizes.hub, l.sizes.hub);
    const batt = box(l.batt, l.sizes.batt, 120);
    assert.ok(!overlaps(hub, batt), `Hub und Speicher ueberlappen bei ${w}px`);
  }
});

test('PV-Karten ueberlappen den Wechselrichter nicht', () => {
  for (const w of WIDTHS) {
    const l = computeLayout(w);
    const hub = box(l.hub, l.sizes.hub, l.sizes.hub);
    assert.ok(!overlaps(box(l.pv1, 104, 92), hub), `PV1 ueberlappt Hub bei ${w}px`);
    assert.ok(!overlaps(box(l.pv2, 104, 92), hub), `PV2 ueberlappt Hub bei ${w}px`);
  }
});

test('der Speicher blockiert nie die mittige Linie zum Hausnetz', () => {
  // Die Kante Wechselrichter -> Hausnetz laeuft senkrecht durch centerX.
  for (const w of WIDTHS) {
    const l = computeLayout(w);
    if (l.tier !== 'narrow') continue;
    const battLeftEdge = l.batt.x - l.sizes.batt / 2;
    assert.ok(
      battLeftEdge > l.centerX,
      `Speicher ragt bei ${w}px in die Mittellinie (${battLeftEdge} <= ${l.centerX})`,
    );
  }
});

test('der Netz-Knoten steht dem Speicher-Knoten symmetrisch gegenueber', () => {
  for (const w of WIDTHS) {
    const l = computeLayout(w);
    assert.equal(l.grid.y, l.batt.y, `Netz und Speicher nicht auf gleicher Hoehe bei ${w}px`);
    assert.ok(
      Math.abs(l.grid.x - (2 * l.centerX - l.batt.x)) < 1e-6,
      `Netz nicht spiegelsymmetrisch zum Speicher bei ${w}px`,
    );
    assert.ok(l.grid.x < l.hub.x, `Netz-Knoten liegt bei ${w}px nicht links vom Hub`);
  }
});

test('der Netz-Knoten ueberlappt den Wechselrichter nicht', () => {
  for (const w of WIDTHS) {
    const l = computeLayout(w);
    const hub = box(l.hub, l.sizes.hub, l.sizes.hub);
    assert.ok(!overlaps(box(l.grid, l.sizes.batt, 120), hub), `Netz ueberlappt Hub bei ${w}px`);
  }
});

test('alle Knoten bleiben innerhalb des Containers', () => {
  for (const w of WIDTHS) {
    const l = computeLayout(w);
    assert.ok(l.pv1.x - 52 >= -1, `PV1 ragt links heraus bei ${w}px`);
    assert.ok(l.pv2.x + 52 <= w + 1, `PV2 ragt rechts heraus bei ${w}px`);
    assert.ok(l.batt.x + l.sizes.batt / 2 <= w + 1, `Speicher ragt rechts heraus bei ${w}px`);
    assert.ok(l.hub.y + l.sizes.hub / 2 <= l.height, `Hub ragt unten heraus bei ${w}px`);
  }
});

test('computeLayout vertraegt Breite 0 ohne NaN', () => {
  const l = computeLayout(0);
  assert.ok(Number.isFinite(l.pv1.x) && Number.isFinite(l.height));
  assert.equal(computeLayout(undefined).tier, 'narrow');
});

test('die Container-Hoehe waechst, wenn der Speicher nach unten rueckt', () => {
  assert.ok(computeLayout(360).height > computeLayout(900).height);
});

test('pickAnchorSides dockt bei nebeneinanderliegenden Boxen seitlich an', () => {
  const a = { left: 0, right: 100, top: 0, bottom: 100, height: 100 };
  const b = { left: 200, right: 300, top: 10, bottom: 110, height: 100 };
  assert.deepEqual(pickAnchorSides(a, b), ['right', 'left']);
  assert.deepEqual(pickAnchorSides(b, a), ['left', 'right']);
});

test('pickAnchorSides dockt bei uebereinanderliegenden Boxen oben/unten an', () => {
  const a = { left: 0, right: 100, top: 0, bottom: 100, height: 100 };
  const b = { left: 0, right: 100, top: 200, bottom: 300, height: 100 };
  assert.deepEqual(pickAnchorSides(a, b), ['bottom', 'top']);
  assert.deepEqual(pickAnchorSides(b, a), ['top', 'bottom']);
});

test('arrowGlyph zeigt in die Flussrichtung', () => {
  assert.equal(arrowGlyph({ x: 0, y: 0 }, { x: 10, y: 0 }), '→');
  assert.equal(arrowGlyph({ x: 10, y: 0 }, { x: 0, y: 0 }), '←');
  assert.equal(arrowGlyph({ x: 0, y: 0 }, { x: 0, y: 10 }), '↓');
  assert.equal(arrowGlyph({ x: 0, y: 10 }, { x: 0, y: 0 }), '↑');
});

test('pointOnCubic trifft Anfang, Ende und Mitte', () => {
  const a = { x: 0, y: 0 }, c1 = { x: 0, y: 10 }, c2 = { x: 10, y: 10 }, b = { x: 10, y: 20 };
  assert.deepEqual(pointOnCubic(a, c1, c2, b, 0), a);
  assert.deepEqual(pointOnCubic(a, c1, c2, b, 1), b);
  const mid = pointOnCubic(a, c1, c2, b, 0.5);
  assert.ok(mid.x > 0 && mid.x < 10 && mid.y > 0 && mid.y < 20);
});

test('edgeControlPoints halten die Austrittsrichtung', () => {
  const hz = edgeControlPoints({ x: 0, y: 50 }, { x: 100, y: 50 });
  assert.equal(hz[0].y, 50);
  const vt = edgeControlPoints({ x: 50, y: 0 }, { x: 50, y: 100 });
  assert.equal(vt[0].x, 50);
});

test('buildEdges dreht die Speicherkante beim Laden zum Speicher hin', () => {
  const edges = buildEdges({ pv1: 157, pv2: 152, batteryWatt: -290, batteryMagnitude: 290, charging: true, house: 19 });
  const batt = edges.find((e) => e.id === 'battery');
  assert.equal(batt.from, 'hub');
  assert.equal(batt.to, 'batt');
  assert.equal(batt.active, true);
});

test('buildEdges dreht die Speicherkante beim Entladen zum Wechselrichter', () => {
  const edges = buildEdges({ pv1: 0, pv2: 0, batteryWatt: 16, batteryMagnitude: 16, charging: false, house: 35 });
  const batt = edges.find((e) => e.id === 'battery');
  assert.equal(batt.from, 'batt');
  assert.equal(batt.to, 'hub');
});

test('buildEdges markiert PV nachts als inaktiv', () => {
  const edges = buildEdges({ pv1: 0, pv2: 0, batteryWatt: 16, batteryMagnitude: 16, charging: false, house: 35 });
  assert.equal(edges.find((e) => e.id === 'pv1').active, false);
  assert.equal(edges.find((e) => e.id === 'pv2').active, false);
  assert.equal(edges.find((e) => e.id === 'house').active, true);
});

test('buildEdges fuehrt genau die vier erlaubten Verbindungen', () => {
  const edges = buildEdges({
    pv1: 1, pv2: 1, batteryWatt: -1, batteryMagnitude: 1, charging: true, house: 1, gridConsumption: 1,
  });
  // Kein Pfad darf Speicher und Hausnetz direkt verbinden: der Speicher haengt
  // ausschliesslich am Wechselrichter.
  for (const e of edges) {
    assert.ok(
      !((e.from === 'batt' && e.to === 'house') || (e.from === 'house' && e.to === 'batt')),
      'unerlaubte Direktverbindung Speicher <-> Hausnetz',
    );
  }
  // Jede Kante ausser der Netz-Kante beruehrt den Hub — das Netz versorgt
  // das Hausnetz direkt, unter Umgehung des Wechselrichters.
  const nonGrid = edges.filter((e) => e.id !== 'grid');
  assert.ok(nonGrid.every((e) => e.from === 'hub' || e.to === 'hub'));
  const grid = edges.find((e) => e.id === 'grid');
  assert.equal(grid.from, 'grid');
  assert.equal(grid.to, 'house');
  assert.notEqual(grid.from, 'hub');
  assert.notEqual(grid.to, 'hub');
});

test('buildEdges markiert Netzbezug als inaktiv, wenn PV/Speicher genuegen', () => {
  const edges = buildEdges({ pv1: 100, pv2: 0, batteryWatt: 0, batteryMagnitude: 0, charging: false, house: 20, gridConsumption: 0 });
  const grid = edges.find((e) => e.id === 'grid');
  assert.equal(grid.watt, 0);
  assert.equal(grid.active, false);
});

test('buildEdges markiert Netzbezug als aktiv, wenn das Balkonkraftwerk den Bedarf nicht deckt', () => {
  // Realer Fall (2026-07-27, siehe CHANGELOG): WR liefert 0 W ans Hausnetz,
  // Smart Plugs verbrauchen dennoch ~58 W -> aus dem Netz gedeckt.
  const edges = buildEdges({ pv1: 30, pv2: 30, batteryWatt: -60, batteryMagnitude: 60, charging: true, house: 0, gridConsumption: 67 });
  const grid = edges.find((e) => e.id === 'grid');
  assert.equal(grid.watt, 67);
  assert.equal(grid.active, true);
});

test('buildEdges behandelt fehlenden gridConsumption-Wert als 0', () => {
  const edges = buildEdges({ pv1: 0, pv2: 0, batteryWatt: 0, batteryMagnitude: 0, charging: false, house: 0 });
  const grid = edges.find((e) => e.id === 'grid');
  assert.equal(grid.watt, 0);
  assert.equal(grid.active, false);
});

test('buildEdges dreht die Netzkante zum Netz hin, wenn die Einspeisung ueberwiegt', () => {
  // PV-Ueberschuss (kein Netzbezug) -> die Kante muss vom Hausnetz zum Netz
  // laufen statt umgekehrt, genau wie die Speicherkante beim Laden.
  const edges = buildEdges({
    pv1: 400, pv2: 0, batteryWatt: 0, batteryMagnitude: 0, charging: false, house: 40,
    gridConsumption: 0, feedIn: 360,
  });
  const grid = edges.find((e) => e.id === 'grid');
  assert.equal(grid.from, 'house');
  assert.equal(grid.to, 'grid');
  assert.equal(grid.watt, 360);
  assert.equal(grid.active, true);
  assert.notEqual(grid.from, 'hub');
  assert.notEqual(grid.to, 'hub');
});

test('buildEdges laesst die Netzkante beim Netzbezug unveraendert, auch wenn Einspeisung vorliegt', () => {
  // Netzbezug ueberwiegt (67 W) trotz kleiner Einspeisung (10 W) -> Kante zeigt weiterhin zum Hausnetz.
  const edges = buildEdges({
    pv1: 0, pv2: 0, batteryWatt: 0, batteryMagnitude: 0, charging: false, house: 0,
    gridConsumption: 67, feedIn: 10,
  });
  const grid = edges.find((e) => e.id === 'grid');
  assert.equal(grid.from, 'grid');
  assert.equal(grid.to, 'house');
  assert.equal(grid.watt, 67);
});

test('buildEdges wertet Netzbezug bei Gleichstand nicht als Einspeisung', () => {
  const edges = buildEdges({
    pv1: 0, pv2: 0, batteryWatt: 0, batteryMagnitude: 0, charging: false, house: 0,
    gridConsumption: 30, feedIn: 30,
  });
  const grid = edges.find((e) => e.id === 'grid');
  assert.equal(grid.from, 'grid');
  assert.equal(grid.to, 'house');
  assert.equal(grid.watt, 30);
});
