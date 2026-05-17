use serde_json::Value;
use crate::contract::normalization::normalize_string;

pub fn canonicalize_fields(m: Value) -> Value {
    let m = normalize_strings_recursive(m);
    let m = convert_timestamps(m);
    normalize_absent_fields(m)
}

fn normalize_strings_recursive(v: Value) -> Value {
    match v {
        Value::String(s) => Value::String(normalize_string(&s)),
        Value::Object(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (k, v) in map {
                let k = normalize_string(&k);
                out.insert(k, normalize_strings_recursive(v));
            }
            Value::Object(out)
        }
        Value::Array(arr) => {
            Value::Array(arr.into_iter().map(normalize_strings_recursive).collect())
        }
        other => other,
    }
}

fn convert_timestamps(v: Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (k, v) in map {
                if k == "timestamp" {
                    match &v {
                        Value::String(s) => {
                            if let Ok(epoch) = s.parse::<i64>() {
                                out.insert(k, Value::Number(epoch.into()));
                            } else if let Some(epoch) = parse_rfc3339(s) {
                                out.insert(k, Value::Number(epoch.into()));
                            } else {
                                out.insert(k, v);
                            }
                        }
                        Value::Number(n) => {
                            if let Some(f) = n.as_f64() {
                                out.insert(k, Value::Number((f as i64).into()));
                            } else if let Some(i) = n.as_i64() {
                                out.insert(k, Value::Number(i.into()));
                            } else {
                                out.insert(k, v);
                            }
                        }
                        _ => { out.insert(k, convert_timestamps(v)); }
                    }
                } else {
                    out.insert(k, convert_timestamps(v));
                }
            }
            Value::Object(out)
        }
        Value::Array(arr) => {
            Value::Array(arr.into_iter().map(convert_timestamps).collect())
        }
        other => other,
    }
}

fn parse_rfc3339(s: &str) -> Option<i64> {
    if s.len() < 20 || !s.is_ascii() {
        return None;
    }
    let year = s[0..4].parse::<i64>().ok()?;
    let month = s[5..7].parse::<u32>().ok()?;
    let day = s[8..10].parse::<u32>().ok()?;
    let hour = s[11..13].parse::<u32>().ok()?;
    let min = s[14..16].parse::<u32>().ok()?;
    let sec = s[17..19].parse::<u32>().ok()?;

    if month < 1 || month > 12 || day < 1 || day > 31
        || hour > 23 || min > 59 || sec > 59
    {
        return None;
    }

    let month_days: [i64; 13] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut days = (year - 1970) * 365 + (year - 1969) / 4;
    for m in 1..month {
        days += month_days[m as usize];
    }
    days += (day - 1) as i64;
    if month > 2 && year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
        days += 1;
    }

    Some(days * 86400 + hour as i64 * 3600 + min as i64 * 60 + sec as i64)
}

fn normalize_absent_fields(v: Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (k, v) in map {
                // Convert empty string collapse_key to null
                if k == "collapse_key" {
                    if let Value::String(s) = &v {
                        if s.is_empty() {
                            out.insert(k, Value::Null);
                            continue;
                        }
                    }
                }
                out.insert(k, normalize_absent_fields(v));
            }
            Value::Object(out)
        }
        Value::Array(arr) => {
            Value::Array(arr.into_iter().map(normalize_absent_fields).collect())
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn timestamp_string_to_epoch() {
        let v = json!({"timestamp": "2026-05-16T00:00:00Z"});
        let result = convert_timestamps(v);
        let ts = result.as_object().unwrap().get("timestamp").unwrap().as_i64().unwrap();
        assert_eq!(ts, 1778889600);
    }

    #[test]
    fn timestamp_float_to_int() {
        let v = json!({"timestamp": 1778889600.0});
        let result = convert_timestamps(v);
        let ts = result.as_object().unwrap().get("timestamp").unwrap().as_i64().unwrap();
        assert_eq!(ts, 1778889600);
    }

    #[test]
    fn collapse_key_empty_to_null() {
        let v = json!({"collapse_key": ""});
        let result = normalize_absent_fields(v);
        let val = result.as_object().unwrap().get("collapse_key").unwrap();
        assert!(val.is_null());
    }
}
