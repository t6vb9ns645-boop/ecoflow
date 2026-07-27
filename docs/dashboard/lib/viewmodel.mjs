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
  dataQuality, dataFreshness, PRESET_LABELS,
} from './filters.mjs';
import {
  energyTotals, flowModel, flowCumulative, houseBreakdown, batteryFlows,
} from './energy.mjs';
import {
  groupPlugs, plugSummary, latestPlugMeasurements, cumulativePlugMeasurements,
  cumulativePlugSummary,
} from './plugs.mjs';

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

  // `plugGroups`/`latestPlugs` basieren auf den (ggf. aggregierten) Anzeige-
  // zeilen und dienen Tab 02 sowie dem Live-Modus der Leistungsübersicht.
  const plugGroups = groupPlugs(displayPlugs);
  const latestPlugs = latestPlugMeasurements(plugGroups);
  // Für die kumulierte Energie je Plug werden dagegen die ROH-Zeilen
  // gebraucht (zeitgewichtete Integration, s. calcEnergyWh()).
  const rawPlugGroups = groupPlugs(filteredPlugs);
  const cumulativePlugs = cumulativePlugMeasurements(rawPlugGroups);

  // Live-Modus zeigt die letzte Messung (W), Σ-Modus die über den gesamten
  // Zeitraum kumulierte Energie (Wh) — beide rechnen auf den Rohzeilen.
  const flow = state.flowMode === 'live'
    ? (lastRow ? flowModel(lastRow) : null)
    : (empty ? null : flowCumulative(filtered));
  const flowPlugs = state.flowMode === 'live' ? latestPlugs : cumulativePlugs;

  return {
    range: { from, to },
    granularity: gran,
    empty,
    filtered,
    display,
    displayPlugs,
    lastRow,
    rangeLabel: describeRange(state, now),
    presetLabel: PRESET_LABELS[state.preset] || 'Zeitraum',
    energy: energyTotals(filtered),
    flow,
    // Lade-/Entladeanteil getrennt — im Σ-Modus zeigt der Netto-Pfeil allein
    // nicht, dass beide Richtungen vorkamen.
    battery: batteryFlows(filtered),
    houseBreakdown: flow ? houseBreakdown(flow, flowPlugs) : null,
    plugs: {
      groups: plugGroups,
      summary: plugSummary(plugGroups),
      latest: latestPlugs,
      // Σ-Zeitraum-Pendant fuer Tab 02: kumulierte Energie je Plug ueber den
      // Filter, dieselbe Grundlage wie flowPlugs im Σ-Modus der Leistungs-
      // uebersicht (rechnet auf den ROH-Zeilen, s. cumulativePlugMeasurements()).
      cumulative: cumulativePlugs,
      cumulativeSummary: cumulativePlugSummary(cumulativePlugs),
    },
    quality: dataQuality(display, isAllZero),
    freshness: dataFreshness(allRows, now),
  };
}
