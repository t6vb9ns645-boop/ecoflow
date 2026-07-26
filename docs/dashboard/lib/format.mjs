/** Formatierung von Zeitstempeln, Leistungs- und Energiewerten. */

/** ISO-Zeitstempel -> "DD.MM. HH:MM" (Label für Diagramm-Achsen). */
export function fmtLabel(t) {
  const [datePart, timePart] = String(t).split('T');
  const d = datePart.split('-');
  if (d.length < 3 || !timePart) return String(t);
  return `${d[2]}.${d[1]}. ${timePart.slice(0, 5)}`;
}

/** ISO-Zeitstempel -> "HH:MM". */
export function fmtClock(t) {
  const timePart = String(t).split('T')[1];
  return timePart ? timePart.slice(0, 5) : '';
}

/** Watt-Wert als ganze Zahl. */
export function fmtW(w) {
  if (w === null || w === undefined || Number.isNaN(w)) return '—';
  return String(Math.round(w));
}

/**
 * Energie in Wh, ab 1000 Wh automatisch als kWh.
 * Gibt Wert und Einheit getrennt zurück, damit die Einheit im UI
 * eigenständig gestylt werden kann (kein HTML in dieser Funktion).
 */
export function fmtEnergy(wh) {
  if (wh === null || wh === undefined || Number.isNaN(wh)) return { value: '—', unit: '' };
  const v = Math.round(wh);
  if (Math.abs(v) >= 1000) return { value: (v / 1000).toFixed(2), unit: 'kWh' };
  return { value: String(v), unit: 'Wh' };
}

/** Messwert mit Einheit, "—" wenn kein Wert vorliegt. */
export function fmtMeasure(v, unit) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v} ${unit}`;
}

/** Deutsche Tausendertrennung. */
export function fmtCount(n) {
  return Number(n).toLocaleString('de-DE');
}

/** WLAN-Signalstärke (RSSI, dBm) als Klartext-Bewertung. */
export function rssiQuality(rssi) {
  if (rssi === null || rssi === undefined || Number.isNaN(rssi) || rssi >= 0) return '—';
  if (rssi >= -60) return 'sehr gut';
  if (rssi >= -70) return 'gut';
  if (rssi >= -80) return 'mittel';
  return 'schwach';
}
