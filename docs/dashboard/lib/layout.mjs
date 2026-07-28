/**
 * Geometrie des Stromfluss-Diagramms (Hub-und-Speiche).
 *
 * Topologie — der Wechselrichter ist der zentrale Knoten fürs Balkonkraftwerk,
 * das Netz hängt aber DIREKT und unabhaengig davon am Hausnetz:
 *     PV1 ─┐
 *          ├─> Wechselrichter <──> Speicher
 *     PV2 ─┘         │
 *                    v
 *     Netz <────> Hausnetz
 *
 * Der Speicher hängt ausschliesslich am Wechselrichter (nicht am Hausnetz).
 * Das Hausnetz wird primär vom Wechselrichter versorgt, zusätzlich aber auch
 * direkt aus dem Stromnetz — immer dann, wenn PV/Speicher den Bedarf (z. B.
 * der Smart Plugs) nicht vollständig decken können (`grid_cons_watt`).
 * Umgekehrt kann Ueberschuss auch vom Hausnetz zurueck ins Netz fliessen
 * (Einspeisung, s. `feedInPower()`) — die Netz-Kante ist daher wie die
 * Speicher-Kante bidirektional, s. `buildEdges()`.
 *
 * Positionen sind Mittelpunkte in Pixeln relativ zum Container. Die Abstände
 * werden aus den TATSÄCHLICHEN halben Kantenlängen der Karten berechnet, damit
 * sich bei keiner Breite zwei Karten überlappen und keine Verbindungslinie
 * durch eine fremde Karte läuft.
 */

/** Ab dieser Containerbreite steht der Speicher neben statt unter dem Hub. */
export const WIDE_BREAKPOINT = 560;

/** Unterhalb dieser Leistung gilt eine Kante als "kein Fluss". */
export const ACTIVE_MIN_WATT = 0.5;

export const NODE_SIZES = {
  wide: { hub: 170, batt: 132 },
  narrow: { hub: 150, batt: 112 },
};

/** Halbe Höhe der Speicher-Karte (Inhalt ist fix: Label, SOC, Watt, Pill). */
const BATT_HALF_HEIGHT = 60;

/**
 * Linienstärke aus der Leistung: Wurzel-Skalierung, hart gedeckelt.
 * Bewusst schmal gehalten — dicke Bänder machten den Verlauf unlesbar.
 */
export function strokeWidthFor(watt) {
  return Math.max(1.3, Math.min(3.4, 1.3 + Math.sqrt(Math.abs(Number(watt) || 0)) * 0.16));
}

/** Eine Kante ist aktiv, wenn nennenswert Leistung fliesst. */
export function isEdgeActive(watt) {
  return Math.abs(Number(watt) || 0) > ACTIVE_MIN_WATT;
}

/**
 * Berechnet die Knotenpositionen für eine gegebene Containerbreite.
 *
 * Zwei Stufen — PV1/PV2 stehen in BEIDEN nebeneinander, nie übereinander:
 * gestapelte PV-Karten würden zwangsläufig eine Verbindungslinie durch die
 * jeweils andere Karte schicken.
 *
 * Der Netz-Knoten steht dem Speicher-Knoten symmetrisch gegenüber (gleicher
 * Abstand zum Wechselrichter, gespiegelte Seite) — er speist aber, anders als
 * der Speicher, nicht den Wechselrichter, sondern direkt das Hausnetz.
 */
export function computeLayout(width) {
  const w = Number(width) || 0;
  const cx = w / 2;
  const wide = w >= WIDE_BREAKPOINT;
  const sizes = wide ? NODE_SIZES.wide : NODE_SIZES.narrow;
  const hubHalf = sizes.hub / 2;
  const battHalfW = sizes.batt / 2;

  const pvGap = Math.max(60, Math.min(w * 0.23, 230));
  const pv1 = { x: cx - pvGap, y: 50 };
  const pv2 = { x: cx + pvGap, y: 50 };

  let hub, batt, grid, height;
  if (wide) {
    // Nebeneinander: Mindestabstand = beide Halbbreiten + Luftraum.
    const minGap = hubHalf + battHalfW + 34;
    const battGap = Math.max(minGap, Math.min(w * 0.34, 260));
    hub = { x: cx, y: 232 };
    batt = { x: cx + battGap, y: 232 };
    grid = { x: cx - battGap, y: 232 };
    height = 380;
  } else {
    // Untereinander, aber seitlich versetzt: der Versatz muss grösser sein als
    // die halbe Speicher-Breite, sonst ragt die Karte in die mittige
    // Wechselrichter->Hausnetz-Linie hinein.
    const clearFloor = battHalfW + 18;
    const maxGap = Math.max(clearFloor, w / 2 - battHalfW - 10);
    const battGap = Math.max(clearFloor, Math.min(w * 0.22, 95, maxGap));
    hub = { x: cx, y: 205 };
    batt = { x: cx + battGap, y: hub.y + hubHalf + BATT_HALF_HEIGHT + 55 };
    grid = { x: cx - battGap, y: batt.y };
    height = batt.y + BATT_HALF_HEIGHT + 40;
  }

  return { tier: wide ? 'wide' : 'narrow', sizes, pv1, pv2, hub, batt, grid, height, centerX: cx };
}

/**
 * Wählt die Ankerseiten einer Kante aus der tatsächlichen Lage zweier Boxen.
 * Überlappen sie sich vertikal deutlich, wird seitlich angedockt, sonst
 * oben/unten — so bleibt die Linie in jeder Layout-Stufe sauber.
 */
export function pickAnchorSides(rectA, rectB) {
  const overlapY = Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top);
  const sideBySide = overlapY > Math.min(rectA.height, rectB.height) * 0.3;
  if (sideBySide) return rectA.left < rectB.left ? ['right', 'left'] : ['left', 'right'];
  return rectA.top < rectB.top ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Richtungspfeil für ein Kanten-Label. */
export function arrowGlyph(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? '→' : '←';
  return dy >= 0 ? '↓' : '↑';
}

/** Punkt auf einer kubischen Bézierkurve (für die Label-Platzierung). */
export function pointOnCubic(a, c1, c2, b, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
  };
}

/**
 * Kontrollpunkte für eine Kante. Die Kurve verlässt den Startknoten in
 * Verlaufsrichtung, damit sie nicht diagonal durch die Fläche schneidet.
 */
export function edgeControlPoints(a, b) {
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (horizontal) {
    return [
      { x: a.x + (b.x - a.x) * 0.33, y: a.y },
      { x: a.x + (b.x - a.x) * 0.66, y: b.y },
    ];
  }
  return [
    { x: a.x, y: a.y + (b.y - a.y) * 0.33 },
    { x: b.x, y: a.y + (b.y - a.y) * 0.66 },
  ];
}

/**
 * Die fünf Kanten des Diagramms mit Richtung und Aktivitätszustand.
 * Die Speicher-Kante dreht ihre Richtung mit dem Vorzeichen:
 * lädt -> Wechselrichter zum Speicher, entlädt -> Speicher zum Wechselrichter.
 *
 * Die Netz-Kante ist die einzige, die nicht am Wechselrichter hängt — sie
 * verbindet das Netz direkt mit dem Hausnetz. Sie dreht ihre Richtung
 * analog zur Speicher-Kante mit dem Saldo aus Netzbezug (`flow.gridConsumption`,
 * Feld `grid_cons_watt`) und Einspeisung (`flow.feedIn`, s. `feedInPower()`):
 * überwiegt die Einspeisung, läuft sie vom Hausnetz zum Netz statt umgekehrt.
 */
export function buildEdges(flow) {
  const gridConsumption = Number(flow.gridConsumption) || 0;
  const feedIn = Number(flow.feedIn) || 0;
  const exporting = feedIn > gridConsumption;
  const gridWatt = exporting ? feedIn : gridConsumption;
  return [
    { id: 'pv1', from: 'pv1', to: 'hub', watt: flow.pv1, active: isEdgeActive(flow.pv1), color: 'solar' },
    { id: 'pv2', from: 'pv2', to: 'hub', watt: flow.pv2, active: isEdgeActive(flow.pv2), color: 'solar' },
    {
      id: 'battery',
      from: flow.charging ? 'hub' : 'batt',
      to: flow.charging ? 'batt' : 'hub',
      watt: flow.batteryMagnitude,
      active: isEdgeActive(flow.batteryWatt),
      color: 'battery',
    },
    { id: 'house', from: 'hub', to: 'house', watt: flow.house, active: isEdgeActive(flow.house), color: 'house' },
    {
      id: 'grid',
      from: exporting ? 'house' : 'grid',
      to: exporting ? 'grid' : 'house',
      watt: gridWatt,
      active: isEdgeActive(gridWatt),
      color: 'grid',
    },
  ];
}
