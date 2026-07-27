/**
 * Zeitraum-Filter, Aggregation und Datenqualitäts-Analyse.
 *
 * Der Filterzustand ist die EINE Quelle der Wahrheit für beide Tabs
 * (Leistungsübersicht + Einzelwerte). Er wird nie pro Tab gehalten.
 */

export const PRESETS = [
  { key: 'today', label: 'Heute' },
  { key: 'yesterday', label: 'Gestern' },
  { key: '7d', label: '7 Tage' },
  { key: '30d', label: '30 Tage' },
  { key: 'month', label: 'Diesen Monat' },
  { key: 'year', label: 'Dieses Jahr' },
  { key: 'all', label: 'Alle' },
];

export const PRESET_LABELS = {
  today: 'heute',
  yesterday: 'gestern',
  '7d': '7 Tage',
  '30d': '30 Tage',
  month: 'Monat',
  year: 'Jahr',
  all: 'Gesamt',
  custom: 'Zeitraum',
};

const DAY_MS = 24 * 3600000;

/**
 * Berechnet {from, to} für ein Preset. `now` ist injizierbar, damit die
 * Grenzen testbar sind (und "Heute" nach Mitternacht automatisch stimmt).
 * `null` bedeutet "unbegrenzt".
 */
export function presetRange(preset, now = new Date()) {
  switch (preset) {
    case 'today':
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
    case 'yesterday': {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { from: y, to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59) };
    }
    case '7d':
      return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
    case '30d':
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

/** Parst "tt.mm.jjjj hh:mm". Gibt null zurück, wenn das Format nicht passt. */
export function parseDEDate(s) {
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  const d = new Date(+yyyy, +mm - 1, +dd, +hh, +min);
  // Rollover erkennen (z. B. 32.01. -> 01.02.) und als ungültig ablehnen.
  if (d.getDate() !== +dd || d.getMonth() !== +mm - 1) return null;
  return d;
}

/** Filtert Messzeilen auf einen Zeitraum. Offene Grenzen sind erlaubt. */
export function filterRows(rows, from, to) {
  if (!from && !to) return rows;
  return rows.filter((r) => {
    const d = new Date(r.t);
    return (!from || d >= from) && (!to || d <= to);
  });
}

/**
 * Wählt die Darstellungs-Granularität nach Spannweite der gefilterten Daten:
 * bis 7 Tage roh, bis 90 Tage Stundenmittel, darüber Tagesmittel.
 * Verhindert, dass Diagramme bei langen Zeiträumen unlesbar/langsam werden.
 */
export function pickGranularity(rows) {
  if (rows.length < 2) return 'raw';
  const rangeMs = new Date(rows[rows.length - 1].t) - new Date(rows[0].t);
  if (rangeMs > 90 * DAY_MS) return 'day';
  if (rangeMs > 7 * DAY_MS) return 'hour';
  return 'raw';
}

const NUMERIC_FIELDS = [
  'pv1_watt', 'pv2_watt', 'ac_house_watt', 'battery_soc_percent', 'battery_power_watt',
  'total_pv_wh_daily', 'pv1_temp_c', 'pv2_temp_c', 'inv_temp_c', 'grid_cons_watt',
  'inv_to_plug_watt', 'permanent_watt', 'pv_to_inv_watt', 'pv1_volt', 'pv2_volt',
  'inv_volt', 'bat_lower_limit', 'bat_upper_limit', 'wifi_rssi',
];

function bucketKey(t, gran) {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (gran === 'hour') return `${y}-${m}-${day}T${String(d.getHours()).padStart(2, '0')}:00:00`;
  return `${y}-${m}-${day}T12:00:00`;
}

/** Mittelt Messzeilen je Stunden-/Tages-Bucket. NaN-Werte werden ausgelassen. */
export function aggregateRows(rows, gran) {
  const map = new Map();
  for (const r of rows) {
    const k = bucketKey(r.t, gran);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, grp]) => {
      const out = { t: k };
      for (const f of NUMERIC_FIELDS) {
        const vals = grp.map((r) => r[f]).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
        out[f] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
      }
      return out;
    });
}

/** Mittelt Smart-Plug-Zeilen je Plug und Bucket. */
export function aggregatePlugRows(rows, gran) {
  const byPlug = new Map();
  for (const r of rows) {
    if (!byPlug.has(r.plug_sn)) byPlug.set(r.plug_sn, new Map());
    const tmap = byPlug.get(r.plug_sn);
    const k = bucketKey(r.t, gran);
    if (!tmap.has(k)) tmap.set(k, []);
    tmap.get(k).push(r);
  }
  const out = [];
  for (const tmap of byPlug.values()) {
    for (const [k, grp] of tmap.entries()) {
      const watts = grp.map((r) => r.watts).filter((v) => !Number.isNaN(v));
      out.push({
        t: k,
        plug_sn: grp[0].plug_sn,
        plug_name: grp[grp.length - 1].plug_name,
        watts: watts.length ? watts.reduce((a, b) => a + b, 0) / watts.length : 0,
        switch_sta: grp[grp.length - 1].switch_sta,
      });
    }
  }
  return out.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
}

/**
 * Mittelt eine Auswahl von Zeilen zu EINER Pseudo-Zeile.
 * Basis für den Ø-Modus des Stromfluss-Diagramms.
 */
export function averageRow(rows) {
  if (!rows.length) return null;
  const out = { t: rows[rows.length - 1].t };
  for (const f of NUMERIC_FIELDS) {
    const vals = rows.map((r) => r[f]).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    out[f] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  }
  return out;
}

/**
 * Datenqualität: erkennt die Nullwert-Phase am Anfang und berechnet Abdeckung.
 * `isAllZero` wird injiziert, damit dieses Modul unabhängig von csv.mjs bleibt.
 */
export function dataQuality(rows, isAllZero) {
  if (!rows.length) {
    return { total: 0, zeroCount: 0, coverage: 0, validFromIdx: 0, durationHours: 0, deadHours: 0 };
  }
  let lastZeroIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (isAllZero(rows[i])) lastZeroIdx = i; else break;
  }
  const zeroCount = lastZeroIdx + 1;
  const start = new Date(rows[0].t);
  const end = new Date(rows[rows.length - 1].t);
  const deadEnd = lastZeroIdx >= 0 ? new Date(rows[lastZeroIdx].t) : start;
  return {
    total: rows.length,
    zeroCount,
    coverage: ((rows.length - zeroCount) / rows.length) * 100,
    validFromIdx: lastZeroIdx + 1 < rows.length ? lastZeroIdx + 1 : 0,
    durationHours: (end - start) / 3600000,
    deadHours: (deadEnd - start) / 3600000,
  };
}

/**
 * Alter der letzten Messung in Minuten und Staleness-Bewertung.
 * Ab 6 Minuten gelten 3+ Abholungen (alle 2 min) als verpasst.
 */
export function dataFreshness(rows, now = new Date()) {
  if (!rows.length) return { ageMinutes: null, stale: true };
  const last = new Date(rows[rows.length - 1].t);
  const ageMinutes = (now.getTime() - last.getTime()) / 60000;
  return { ageMinutes, stale: ageMinutes > 6 };
}
