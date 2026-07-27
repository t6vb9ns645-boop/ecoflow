/**
 * Energie- und Leistungskennzahlen.
 *
 * ── Vorzeichenkonvention Batterie ───────────────────────────────────────────
 * `battery_power_watt < 0`  =>  Speicher LÄDT   (Energie fliesst WR -> Speicher)
 * `battery_power_watt > 0`  =>  Speicher ENTLÄDT (Energie fliesst Speicher -> WR)
 *
 * Belegt in CHANGELOG.md [3.2.2] und an Messdaten verifiziert, z. B.
 * 2026-07-25T13:48: PV 309 W, Batterie -290 W, AC-Haus 19 W -> 290 + 19 = 309.
 * Diese Konvention gilt projektweit; abweichende Stellen sind Fehler.
 */

/** Maximale Lücke zwischen zwei Messpunkten, die noch integriert wird (6 min). */
export const MAX_GAP_HOURS = 0.1;

/** true, wenn der Speicher bei diesem Leistungswert lädt. */
export function isCharging(batteryPowerWatt) {
  return Number(batteryPowerWatt) < 0;
}

/** Ladeleistung (>= 0). 0, wenn der Speicher gerade nicht lädt. */
export function chargePower(batteryPowerWatt) {
  const v = Number(batteryPowerWatt);
  return Number.isNaN(v) || v >= 0 ? 0 : Math.abs(v);
}

/** Entladeleistung (>= 0). 0, wenn der Speicher gerade nicht entlädt. */
export function dischargePower(batteryPowerWatt) {
  const v = Number(batteryPowerWatt);
  return Number.isNaN(v) || v <= 0 ? 0 : v;
}

/** Zustands-Label für die Anzeige. */
export function batteryState(batteryPowerWatt) {
  const v = Number(batteryPowerWatt);
  if (Number.isNaN(v) || v === 0) return 'inaktiv';
  return v < 0 ? 'lädt' : 'entlädt';
}

/** NaN-sicherer Zahlenwert mit 0 als Ersatz. */
function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/** PV-Gesamtleistung einer Messzeile. */
export function pvTotal(row) {
  return num(row.pv1_watt) + num(row.pv2_watt);
}

/**
 * Hausverbrauch aus den erfassten Teilströmen:
 * Steckdosenausgang + eingestellter Grundbedarf (Dauerleistung).
 */
export function houseLoad(row) {
  return num(row.inv_to_plug_watt) + num(row.permanent_watt);
}

/**
 * Netzeinspeisung als Momentanleistung: der PV-Überschuss, der weder ins Haus
 * noch in den Speicher fliesst. Nie negativ.
 */
export function feedInPower(row) {
  return Math.max(0, pvTotal(row) - houseLoad(row) - chargePower(row.battery_power_watt));
}

/**
 * Zeitgewichtete Integration einer Leistungsgrösse über Messzeilen -> Wh.
 *
 * Verwendet die tatsächlichen Zeitabstände (nicht einen festen Teiler) und
 * überspringt Lücken > MAX_GAP_HOURS, damit Ausfälle die Summe nicht verfälschen.
 * Es wird der Wert des JEWEILS FRÜHEREN Messpunkts über das Intervall gehalten
 * (Linksregel) — konsistent mit calculate_daily_energy() im Collector.
 */
export function calcEnergyWh(rows, wattFn) {
  let wh = 0;
  for (let i = 1; i < rows.length; i++) {
    const dt = (new Date(rows[i].t) - new Date(rows[i - 1].t)) / 3600000;
    if (!(dt > 0) || dt > MAX_GAP_HOURS) continue;
    const w = wattFn(rows[i - 1]);
    if (!Number.isNaN(w) && w > 0) wh += w * dt;
  }
  return wh;
}

/** Kumulativer Verlauf derselben Integration (für den Zähler-Chart). */
export function cumulativeEnergyWh(rows, wattFn) {
  const out = [];
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) {
      const dt = (new Date(rows[i].t) - new Date(rows[i - 1].t)) / 3600000;
      if (dt > 0 && dt <= MAX_GAP_HOURS) {
        const w = wattFn(rows[i - 1]);
        if (!Number.isNaN(w) && w > 0) total += w * dt;
      }
    }
    out.push(Math.round(total * 10) / 10);
  }
  return out;
}

/**
 * Die vier Energie-Kennzahlen für einen Zeitraum.
 * Erwartet ROH-Messzeilen (nicht aggregiert), damit die zeitgewichtete
 * Integration korrekt bleibt.
 */
export function energyTotals(rows) {
  return {
    productionWh: calcEnergyWh(rows, pvTotal),
    consumptionWh: calcEnergyWh(rows, houseLoad),
    batteryOutWh: calcEnergyWh(rows, (r) => dischargePower(r.battery_power_watt)),
    feedInWh: calcEnergyWh(rows, feedInPower),
  };
}

/**
 * Trennt Lade- und Entladeanteil über einen Zeitraum.
 *
 * Nötig, weil ein Zeitraum-Mittelwert beide Richtungen zu EINER Zahl verrechnet:
 * lädt der Speicher die Hälfte der Zeit mit -150 W und entlädt die andere Hälfte
 * mit +40 W, ergibt das netto -55 W. Der Pfeil zeigt dann korrekt "lädt", aber
 * dass ebenso viel Energie zurückgeflossen ist, bliebe unsichtbar.
 *
 * `meanCharge`/`meanDischarge` sind über den GESAMTEN Zeitraum gemittelt (nicht
 * nur über die jeweiligen Phasen), damit `meanDischarge - meanCharge === net`
 * gilt und die Zahlen zum Netto-Pfeil passen.
 */
export function batteryFlows(rows) {
  const vals = rows
    .map((r) => Number(r.battery_power_watt))
    .filter((v) => !Number.isNaN(v));
  if (!vals.length) {
    return { meanCharge: 0, meanDischarge: 0, net: 0, chargeSamples: 0, dischargeSamples: 0, bidirectional: false };
  }
  let chargeSum = 0, dischargeSum = 0, chargeSamples = 0, dischargeSamples = 0;
  for (const v of vals) {
    if (v < 0) { chargeSum += -v; chargeSamples++; } else if (v > 0) { dischargeSum += v; dischargeSamples++; }
  }
  const meanCharge = chargeSum / vals.length;
  const meanDischarge = dischargeSum / vals.length;
  return {
    meanCharge,
    meanDischarge,
    net: meanDischarge - meanCharge,
    chargeSamples,
    dischargeSamples,
    // Beide Richtungen kamen im Zeitraum tatsaechlich vor.
    bidirectional: chargeSamples > 0 && dischargeSamples > 0,
  };
}

/**
 * Modell des Stromflusses für das Übersichts-Diagramm.
 * `row` ist entweder die letzte Messzeile (Live) oder ein Durchschnitt (Zeitraum).
 */
export function flowModel(row) {
  const batt = num(row.battery_power_watt);
  return {
    pv1: num(row.pv1_watt),
    pv2: num(row.pv2_watt),
    pvTotal: pvTotal(row),
    batteryWatt: batt,
    charging: isCharging(batt),
    batteryMagnitude: Math.abs(batt),
    batteryState: batteryState(batt),
    soc: num(row.battery_soc_percent),
    house: num(row.ac_house_watt),
    toPlugs: num(row.inv_to_plug_watt),
    baseLoad: num(row.permanent_watt),
    gridConsumption: Math.max(0, num(row.grid_cons_watt)),
  };
}

/**
 * Aufschlüsselung des Hausnetzes in Einzelposten.
 * `plugs` sind die zuletzt gemessenen Smart Plugs (kann leer sein).
 *
 * - `unassigned`: Steckdosenleistung, die keinem konfigurierten Plug zugeordnet ist
 * - `residual`:   Rest zwischen AC-Hausverbrauch und den erfassten Teilströmen
 */
export function houseBreakdown(flow, plugs = []) {
  const plugSum = plugs.reduce((s, p) => s + num(p.watts), 0);
  const unassigned = Math.max(0, flow.toPlugs - plugSum);
  const residual = Math.max(0, flow.house - flow.toPlugs - flow.baseLoad);
  const items = [
    ...plugs.map((p) => ({ key: `plug:${p.plug_sn}`, name: p.plug_name, watts: num(p.watts), kind: 'plug' })),
  ];
  if (unassigned > 0) {
    items.push({
      key: 'unassigned',
      name: plugs.length ? 'Steckdosen (nicht einzeln erfasst)' : 'Steckdosen gesamt',
      watts: unassigned,
      kind: 'unassigned',
    });
  }
  items.push({ key: 'base', name: 'Grundbedarf (Dauerleistung)', watts: flow.baseLoad, kind: 'base' });
  if (residual > 0) {
    items.push({ key: 'residual', name: 'Sonstiges / nicht erfasst', watts: residual, kind: 'residual' });
  }
  const total = items.reduce((s, i) => s + i.watts, 0);
  return {
    items: items.map((i) => ({ ...i, share: total > 0 ? i.watts / total : 0 })),
    total,
  };
}
