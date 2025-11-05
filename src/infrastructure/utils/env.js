// Centralized helpers to read and parse environment variables safely.
// These functions keep defaults intact when values are missing or invalid,
// and normalize common boolean representations.

export function envString(name, defaultValue = undefined) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return defaultValue;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : defaultValue;
}

export function envInt(name, defaultValue = undefined) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

export function envArray(name, defaultValue = [], separator = ',') {
  const raw = process.env[name];
  if (typeof raw !== 'string') return defaultValue;
  return raw
    .split(separator)
    .map(s => s.trim())
    .filter(Boolean);
}

// Parse durations from env in a human-friendly way.
// Accepts numeric (milliseconds) or strings like '30s', '5m', '1h'.
export function envDurationMs(name, defaultValueMs = undefined) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !raw.trim()) return defaultValueMs;
  const v = raw.trim().toLowerCase();
  // If numeric, interpret as milliseconds
  if (/^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : defaultValueMs;
  }
  // Match value with unit
  const m = v.match(/^(\d+)\s*(ms|s|m|h)$/);
  if (!m) return defaultValueMs;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return defaultValueMs;
  const unit = m[2];
  switch (unit) {
    case 'ms': return n;
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    default: return defaultValueMs;
  }
}