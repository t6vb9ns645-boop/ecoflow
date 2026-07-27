/**
 * Gruppierung und Einfärbung der Smart Plugs.
 *
 * Farben werden aus der Seriennummer abgeleitet, NICHT aus der Listenposition.
 * Dadurch behält ein Plug seine Farbe, auch wenn andere Plugs hinzukommen,
 * wegfallen oder die Sortierung sich ändert (in v3.7.0 war das noch anders).
 */

import { calcEnergyWh } from './energy.mjs';

export const PLUG_PALETTE = [
  '#2DD4BF', '#8B93FF', '#FF5D8F', '#FFB020',
  '#4ADE80', '#38BDF8', '#C084FC', '#FB923C',
];

/** Stabiler, kollisionsarmer 32-Bit-Hash über einen String. */
export function hashString(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** Feste Farbe für eine Plug-Seriennummer. */
export function plugColor(sn) {
  return PLUG_PALETTE[hashString(sn) % PLUG_PALETTE.length];
}

/**
 * Gruppiert Plug-Messungen nach Seriennummer.
 * Jede Gruppe ist zeitlich sortiert; `last` ist die jüngste Messung.
 * Sortierung der Gruppen nach Anzeigename (deutsche Collation).
 */
export function groupPlugs(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.plug_sn)) groups.set(r.plug_sn, []);
    groups.get(r.plug_sn).push(r);
  }
  return [...groups.entries()]
    .map(([sn, grp]) => {
      const sorted = [...grp].sort((a, b) => new Date(a.t) - new Date(b.t));
      const last = sorted[sorted.length - 1];
      return { sn, name: last.plug_name, color: plugColor(sn), rows: sorted, last };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Kennzahlen über alle Plugs zum jeweils letzten Messwert. */
export function plugSummary(groups) {
  const totalWatts = groups.reduce((s, g) => s + (Number(g.last.watts) || 0), 0);
  const onCount = groups.filter((g) => Number(g.last.switch_sta) > 0).length;
  return { totalWatts, onCount, offCount: groups.length - onCount, count: groups.length };
}

/** Die jeweils letzte Messung je Plug — Eingabe für houseBreakdown() im Live-Modus. */
export function latestPlugMeasurements(groups) {
  return groups.map((g) => ({
    plug_sn: g.sn,
    plug_name: g.name,
    watts: Number(g.last.watts) || 0,
    switch_sta: Number(g.last.switch_sta) || 0,
    color: g.color,
  }));
}

/**
 * Kumulierte Energie (Wh) je Plug über den Zeitraum der gruppierten
 * Rohmessungen — Eingabe für houseBreakdown() im Σ-Zeitraum-Modus.
 * `groups` muss aus ROH-Zeilen stammen (nicht aggregiert), damit die
 * zeitgewichtete Integration korrekt bleibt (siehe calcEnergyWh()).
 */
export function cumulativePlugMeasurements(groups) {
  return groups.map((g) => ({
    plug_sn: g.sn,
    plug_name: g.name,
    watts: calcEnergyWh(g.rows, (r) => Number(r.watts) || 0),
    switch_sta: Number(g.last.switch_sta) || 0,
    color: g.color,
  }));
}

/** Kennzahlen ueber alle Plugs im Σ-Zeitraum-Modus (kumulierte Energie, Wh). */
export function cumulativePlugSummary(cumulativePlugs) {
  const totalWh = cumulativePlugs.reduce((s, p) => s + (Number(p.watts) || 0), 0);
  return { totalWh, count: cumulativePlugs.length };
}
