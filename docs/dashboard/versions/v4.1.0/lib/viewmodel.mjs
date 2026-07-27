/**
 * Ableitung des kompletten Anzeige-Zustands aus Rohdaten + Filter.
 *
 * Das ist die einzige Stelle, an der aus dem Filterzustand Zahlen werden.
 * Beide Tabs (Leistungsübersicht, Einzelwerte) konsumieren dasselbe Ergebnis —
 * dadurch kann ein Tabwechsel die Werte gar nicht verändern.
 */

import { isAllZero } from './csv.mjs';
import {
  presetRange, filterRows, pickGranularity, aggregateRows, aggregatePlugRows,
  averageRow, dataQuality, dataFreshness, PRESET_LABELS,
} from './filters.mjs';
import { energyTotals, flowModel, houseBreakdown, batteryFlows } from './energy.mjs';
import { groupPlugs, plugSummary, latestPlugMeasurements } from './plugs.mjs';

/** Anfangszustand: heute, Leistungsübersicht zuerst, Live-Momentaufnahme. */
export function initialState() {
  return { preset: 'today', from: null, to: null, tab: 0, flowMode: 'live' };
}

/** Grenzen des aktiven Filters. Presets werden bei jedem Aufruf neu berechnet. */
export function resolveRange(state, now = new Date()) {
  if (state.preset === 'custom') return { from: state.from, to: state.to };
  return presetRange(state.preset, now);
}

/** Kurzbeschreibung des Zeitraums für die eingeklappte Menüzeile. */
export function describeRange(state, now = new Date()) {
  const label = PRESET_LABELS[state.preset] || 'Zeitraum';
  if (state.preset === 'custom') {
    const f = state.from ? state.from.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '?';
    const t = state.to ? state.to.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'jetzt';
    return `${f} – ${t}`;
  }
  if (state.preset === 'today') return `Heute · ${now.toLocaleDateString('de-DE')}`;
  if (state.preset === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return `Gestern · ${y.toLocaleDateString('de-DE')}`;
  }
  if (state.preset === 'all') return 'Alle Daten';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Baut das komplette View-Model.
 *
 * Wichtig: Energie-Kennzahlen rechnen IMMER auf den Rohzeilen (`filtered`),
 * niemals auf den aggregierten Zeilen (`display`) — sonst würde die
 * zeitgewichtete Integration durch die Mittelung verfälscht.
 */
export function buildViewModel(allRows, allPlugRows, state, now = new Date()) {
  const { from, to } = resolveRange(state, now);
  const filtered = filterRows(allRows, from, to);
  const gran = pickGranularity(filtered);
  const display = gran === 'raw' ? filtered : aggregateRows(filtered, gran);

  const filteredPlugs = filterRows(allPlugRows, from, to);
  const displayPlugs = gran === 'raw' ? filteredPlugs : aggregatePlugRows(filteredPlugs, gran);

  const empty = filtered.length === 0;
  const lastRow = empty ? null : filtered[filtered.length - 1];
  const avgRow = averageRow(filtered);

  const plugGroups = groupPlugs(displayPlugs);
  const latestPlugs = latestPlugMeasurements(plugGroups);

  // Live-Modus zeigt die letzte Messung, Ø-Modus den Zeitraum-Durchschnitt.
  const flowSource = state.flowMode === 'live' ? lastRow : avgRow;
  const flow = flowSource ? flowModel(flowSource) : null;

  return {
    range: { from, to },
    granularity: gran,
    empty,
    filtered,
    display,
    displayPlugs,
    lastRow,
    averageRow: avgRow,
    rangeLabel: describeRange(state, now),
    presetLabel: PRESET_LABELS[state.preset] || 'Zeitraum',
    energy: energyTotals(filtered),
    flow,
    // Lade-/Entladeanteil getrennt — im Ø-Modus zeigt der Netto-Pfeil allein
    // nicht, dass beide Richtungen vorkamen.
    battery: batteryFlows(filtered),
    houseBreakdown: flow ? houseBreakdown(flow, latestPlugs) : null,
    plugs: { groups: plugGroups, summary: plugSummary(plugGroups), latest: latestPlugs },
    quality: dataQuality(display, isAllZero),
    freshness: dataFreshness(allRows, now),
  };
}
