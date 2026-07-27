/**
 * CSV-Parsing für die EcoFlow-Datendateien.
 *
 * Beide Dateien werden vom Collector (ecoflow_tracker_github.py) geschrieben:
 *   - Haupt-CSV (Wide-Format): eine Zeile pro Messzeitpunkt
 *   - Smart-Plug-CSV (Long-/Tidy-Format): eine Zeile pro Plug pro Messzeitpunkt
 */

/**
 * Zerlegt eine CSV-Zeile RFC4180-artig, d. h. Anführungszeichen-bewusst.
 * Nötig, weil frei vergebene Smart-Plug-Namen Kommas enthalten können.
 */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Baut aus der Headerzeile eine Zuordnung Spaltenname -> Index. */
export function headerIndex(headerCols) {
  const idx = {};
  headerCols.forEach((h, i) => { idx[h.trim()] = i; });
  return idx;
}

/**
 * Liest ein Zahlenfeld, das fehlen darf.
 * Gibt NaN zurück, wenn die Spalte fehlt oder leer ist — bewusst verschieden
 * von 0, damit "kein Messwert" und "gemessene 0" unterscheidbar bleiben.
 */
export function numField(cols, idx, key) {
  const i = idx[key];
  if (i === undefined) return NaN;
  return parseFloat(cols[i]);
}

/**
 * Liest ein Zahlenfeld, das im Schema garantiert ist.
 * Fehlende/leere Werte werden zu 0 — entspricht dem Verhalten des Collectors,
 * der diese Felder immer mit safe_float() schreibt.
 */
export function numFieldOrZero(cols, idx, key) {
  const v = numField(cols, idx, key);
  return Number.isNaN(v) ? 0 : v;
}

/** Parst die Haupt-CSV in ein Array von Messzeilen. */
export function parseCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (!lines.length || !lines[0]) return [];
  const idx = headerIndex(parseCsvLine(lines[0]));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const t = cols[idx['timestamp']];
    if (!t) continue;
    rows.push({
      t,
      pv1_watt: numFieldOrZero(cols, idx, 'pv1_watt'),
      pv2_watt: numFieldOrZero(cols, idx, 'pv2_watt'),
      ac_house_watt: numFieldOrZero(cols, idx, 'ac_house_watt'),
      battery_soc_percent: numFieldOrZero(cols, idx, 'battery_soc_percent'),
      battery_power_watt: numFieldOrZero(cols, idx, 'battery_power_watt'),
      total_pv_wh_daily: numFieldOrZero(cols, idx, 'total_pv_wh_daily'),
      pv1_temp_c: numField(cols, idx, 'pv1_temp_c'),
      pv2_temp_c: numField(cols, idx, 'pv2_temp_c'),
      inv_temp_c: numField(cols, idx, 'inv_temp_c'),
      grid_cons_watt: numField(cols, idx, 'grid_cons_watt'),
      inv_to_plug_watt: numField(cols, idx, 'inv_to_plug_watt'),
      permanent_watt: numField(cols, idx, 'permanent_watt'),
      pv_to_inv_watt: numField(cols, idx, 'pv_to_inv_watt'),
      pv1_volt: numField(cols, idx, 'pv1_volt'),
      pv2_volt: numField(cols, idx, 'pv2_volt'),
      inv_volt: numField(cols, idx, 'inv_volt'),
      bat_lower_limit: numField(cols, idx, 'bat_lower_limit'),
      bat_upper_limit: numField(cols, idx, 'bat_upper_limit'),
      wifi_rssi: numField(cols, idx, 'wifi_rssi'),
    });
  }
  return rows;
}

/** Parst die Smart-Plug-CSV (Long-Format) in ein Array von Plug-Messungen. */
export function parseSmartplugsCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (!lines.length || !lines[0]) return [];
  const idx = headerIndex(parseCsvLine(lines[0]));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const sn = cols[idx['plug_sn']];
    if (!sn) continue;
    rows.push({
      t: cols[idx['timestamp']],
      plug_sn: sn,
      plug_name: cols[idx['plug_name']] || sn,
      watts: numFieldOrZero(cols, idx, 'watts'),
      switch_sta: numFieldOrZero(cols, idx, 'switch_sta'),
      volt: numField(cols, idx, 'volt'),
      current_a: numField(cols, idx, 'current_a'),
      temp_c: numField(cols, idx, 'temp_c'),
      led_brightness: numField(cols, idx, 'led_brightness'),
    });
  }
  return rows;
}

/**
 * Erkennt Zeilen, in denen die API nur Nullen geliefert hat (leere Antwort).
 * Solche Zeilen stehen typischerweise am Anfang der Aufzeichnung.
 */
export function isAllZero(r) {
  return r.pv1_watt === 0 && r.pv2_watt === 0 && r.ac_house_watt === 0 &&
    r.battery_soc_percent === 0 && r.battery_power_watt === 0;
}
