// Shrapnel type registry mirror of shrapnel.field_type.
// Codes are authoritative (see migrations/0001_init.sql).
export const TYPE_CODES = {
  Long:      1,
  String:    2,
  Double:    3,
  Boolean:   4,
  Timestamp: 5,
  JSONB:     6,
  UUID:      7,
};

export const TYPE_NAMES = {
  1: 'Long',
  2: 'String',
  3: 'Double',
  4: 'Boolean',
  5: 'Timestamp',
  6: 'JSONB',
  7: 'UUID',
};

// Shrapnel value extension tables by type code.
export const EXTENSION_TABLES = {
  1: 'value_long',
  2: 'value_string',
  3: 'value_double',
  4: 'value_boolean',
  5: 'value_timestamp',
  6: 'value_jsonb',
  7: 'value_uuid',
};

export function isValidTypeCode(code) {
  return Object.prototype.hasOwnProperty.call(TYPE_CODES, TYPE_NAMES[code]);
}

export function isKnownTypeName(name) {
  return Object.prototype.hasOwnProperty.call(TYPE_CODES, name);
}

export function assertKnownTypeName(name) {
  if (!isKnownTypeName(name)) {
    const valid = Object.keys(TYPE_CODES).join(', ');
    const err = new Error(`unknown type '${name}'. Valid: ${valid}`);
    err.status = 400;
    throw err;
  }
  return TYPE_CODES[name];
}

// Infer a shrapnel type name from a JS value.
export function inferTypeName(value) {
  if (value === null || value === undefined) {
    throw Object.assign(new Error('cannot infer type from null/undefined'), { status: 400 });
  }
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'Long' : 'Double';
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value))) return 'Timestamp';
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) return 'UUID';
    return 'String';
  }
  if (value instanceof Date) return 'Timestamp';
  if (typeof value === 'object') return 'JSONB';
  throw Object.assign(new Error(`cannot infer shrapnel type for ${typeof value}`), { status: 400 });
}

// Coerce a JSON-decoded value into the storage form for the extension table.
export function coerceForStorage(value, typeCode) {
  switch (typeCode) {
    case TYPE_CODES.Long:      return Number.isInteger(value) ? value : parseInt(value, 10);
    case TYPE_CODES.String:    return typeof value === 'string' ? value : String(value);
    case TYPE_CODES.Double:   return typeof value === 'number' ? value : parseFloat(value);
    case TYPE_CODES.Boolean:  return Boolean(value);
    case TYPE_CODES.Timestamp: {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string' || typeof value === 'number') return new Date(value).toISOString();
      return value;
    }
    case TYPE_CODES.JSONB:    return value;
    case TYPE_CODES.UUID:     return typeof value === 'string' ? value : String(value);
    default:
      throw Object.assign(new Error(`unknown type code ${typeCode}`), { status: 400 });
  }
}

// Reverse-direction coercion: take a raw value pulled from an extension
// table (or a raw text::text from a UNION query) and convert to a
// JSON-serialisable JS value for decode. Strings handled as text ties for
// the case where the SQL layer casts everything to ::text.
export function coerceFromStorage(raw, typeCode) {
  switch (typeCode) {
    case TYPE_CODES.Long: {
      if (raw == null) return null;
      return typeof raw === 'number' ? raw : parseInt(raw, 10);
    }
    case TYPE_CODES.Double: {
      if (raw == null) return null;
      return typeof raw === 'number' ? raw : parseFloat(raw);
    }
    case TYPE_CODES.Boolean: {
      if (raw === true || raw === 'true' || raw === 't') return true;
      if (raw === false || raw === 'false' || raw === 'f') return false;
      if (raw == null) return null;
      return Boolean(raw);
    }
    case TYPE_CODES.Timestamp: {
      // pg returns JS Date when querying into JS; honour that. When the value
      // arrives as a text cast (e.g. "...::text"), PG outputs
      // "YYYY-MM-DD HH:MM:SS[.ms]+TZ" — normalise to ISO-8601 UTC for JSON.
      if (raw == null) return null;
      if (raw instanceof Date) return raw.toISOString();
      if (typeof raw === 'string') {
        // ISO-shaped already
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw)) return raw;
        try { return new Date(raw).toISOString(); } catch { return raw; }
      }
      return raw;
    }
    case TYPE_CODES.JSONB:
      // pg returns the parsed JSON object/array when parsing jsonb directly.
      if (raw == null) return null;
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(raw); } catch { return raw; }
    case TYPE_CODES.UUID:
    case TYPE_CODES.String:
    default:
      return raw;
  }
}
