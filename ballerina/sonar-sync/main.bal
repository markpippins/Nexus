// sonar-sync — Ballerina moat service that keeps SonarQube findings in the
// nexus `sonar` schema (canonical for agent triage) and writes review
// decisions back to SonarQube.
//
//   PULL (scheduled): SonarQube REST -> nexus Postgres `sonar` schema.
//   WRITEBACK: review actions -> SonarQube (hotspot status / issue transition).
//
// Config from Config.toml (gitignored — see Config.toml.example).

import ballerina/http;
import ballerina/io;
import ballerina/lang.runtime;
import ballerina/sql;
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;

configurable int port = 9096;
configurable string bindHost = "127.0.0.1";
configurable string sonarBase = ?;
configurable string sonarAuthBasic = ?;
configurable string dbHost = ?;
configurable int dbPort = 5432;
configurable string dbDatabase = ?;
configurable string dbUser = ?;
configurable string dbPass = ?;
configurable int syncIntervalSeconds = 600;

const string PROJECT_KEY = "nexus";
const int PAGE_SIZE = 500;

final http:Client sonar = check new (sonarBase);
final postgresql:Client db = check new (dbHost, dbUser, dbPass, dbDatabase, dbPort);

// ── SonarQube REST helpers ──────────────────────────────────────────

function sonarGet(string path) returns json|http:ClientError {
    return sonar->get(path,
        headers = {"Authorization": "Basic " + sonarAuthBasic},
        targetType = json);
}

function sonarPost(string path, map<string> form) returns json|http:ClientError {
    return sonar->post(path, form,
        headers = {"Authorization": "Basic " + sonarAuthBasic},
        mediaType = "application/x-www-form-urlencoded",
        targetType = json);
}

function upstreamFail(string endpointName, string detail) returns http:Response {
    http:Response res = new;
    res.statusCode = 502;
    res.setJsonPayload({
        status: "upstream-failure",
        "upstream": "sonarqube",
        endpoint: endpointName,
        detail: detail
    });
    return res;
}

// ── JSON field helpers ──────────────────────────────────────────────
// `json` as such does not support member access; these helpers read
// fields defensively, returning safe defaults for missing values.

// Read a field out of a json map value (() when not a map / field missing).
function jval(json payload, string col) returns json {
    if payload is map<json> {
        return payload[col];
    }
    return ();
}

// Field -> string ("" when absent/null). JSON strings are returned
// verbatim; numbers/booleans are stringified; other json is serialized.
function jstr(json? v) returns string {
    if v is () {
        return "";
    }
    if v is string {
        return v;
    }
    if v is int|float|decimal|boolean {
        return v.toString();
    }
    return v.toJsonString();
}

// Field -> int? (nil when absent / not an integer).
function jint(json payload, string col) returns int? {
    json v = jval(payload, col);
    if v is int {
        return v;
    }
    return ();
}

// ── Pull: issues ────────────────────────────────────────────────────

type PullResult record {|
    string kind;
    int total = 0;
    int upserted = 0;
    int pages = 0;
    int failures = 0;
    string lastError = "";
|};

type MeasuresResult record {|
    string kind;
    int inserted = 0;
    boolean ok = false;
    string errorMsg = "";
|};

// Mirror SonarQube's own review state onto the local review_status column so
// the DB reflects whatever surface made the decision (SQ UI or our writeback).
function reviewStatusForIssue(json payload) returns string? {
    string resolution = jstr(jval(payload, "resolution"));
    if resolution == "FALSE-POSITIVE" {
        return "false-positive";
    } else if resolution == "WONTFIX" || resolution == "FIXED" {
        return resolution.toLowerAscii();
    }
    return ();
}

function reviewStatusForHotspot(json payload) returns string? {
    string status = jstr(jval(payload, "status"));
    if status == "REVIEWED" {
        string resolution = jstr(jval(payload, "resolution"));
        return resolution == "" ? "reviewed" : resolution.toLowerAscii();
    }
    return ();
}

function pullIssues() returns PullResult {
    int total = 0;
    int upserted = 0;
    int page = 1;
    int failures = 0;
    string lastError = "";

    while true {
        string endpoint = string `/api/issues/search?projectKeys=${PROJECT_KEY}&ps=${PAGE_SIZE}&p=${page}&additionalFields=transitions`;
        json|http:ClientError res = sonarGet(endpoint);
        if res is http:ClientError {
            failures += 1;
            lastError = res.message();
            break;
        }
        json payload = <json>res;
        json[] items = <json[]>jval(payload, "issues");
        map<json> paging = <map<json>>jval(payload, "paging");
        int pageSize = <int>paging["pageSize"];
        foreach json item in items {
            sql:Error? e = upsertIssue(item);
            if e is sql:Error {
                failures += 1;
                lastError = e.message();
            } else {
                upserted += 1;
            }
        }
        total = <int>paging["total"];
        if page * pageSize >= total || items.length() == 0 {
            break;
        }
        page += 1;
        runtime:sleep(0.2);
    }
    return {kind: "issues", total, upserted, pages: page, failures, lastError};
}

function upsertIssue(json payload) returns sql:Error? {
    string? reviewStatus = reviewStatusForIssue(payload);
    sql:ParameterizedQuery q = `INSERT INTO sonar.issues
        (key, sonar_type, severity, status, resolution, project_key, component_key,
         line, rule_key, message, effort, author, review_status, raw_json)
        VALUES (${jstr(jval(payload, "key"))}, ${jstr(jval(payload, "type"))},
                ${jstr(jval(payload, "severity"))}, ${jstr(jval(payload, "status"))},
                ${jstr(jval(payload, "resolution"))},
                ${jstr(jval(payload, "project"))}, ${jstr(jval(payload, "component"))},
                ${jint(payload, "line")}, ${jstr(jval(payload, "rule"))},
                ${jstr(jval(payload, "message"))}, ${jstr(jval(payload, "effort"))},
                ${jstr(jval(payload, "author"))}, ${reviewStatus},
                ${payload.toJsonString()}::jsonb)
        ON CONFLICT (key) DO UPDATE SET
            sonar_type = EXCLUDED.sonar_type, severity = EXCLUDED.severity,
            status = EXCLUDED.status, resolution = EXCLUDED.resolution,
            project_key = EXCLUDED.project_key, component_key = EXCLUDED.component_key,
            line = EXCLUDED.line, rule_key = EXCLUDED.rule_key,
            message = EXCLUDED.message, effort = EXCLUDED.effort,
            author = EXCLUDED.author, review_status = EXCLUDED.review_status,
            raw_json = EXCLUDED.raw_json,
            updated_at = now()`;
    sql:ExecutionResult|sql:Error r = db->execute(q);
    if r is sql:Error {
        return r;
    }
    return ();
}

// ── Pull: hotspots ──────────────────────────────────────────────────

function pullHotspots() returns PullResult {
    int total = 0;
    int upserted = 0;
    int page = 1;
    int failures = 0;
    string lastError = "";

    while true {
        string endpoint = string `/api/hotspots/search?projectKey=${PROJECT_KEY}&ps=${PAGE_SIZE}&p=${page}`;
        json|http:ClientError res = sonarGet(endpoint);
        if res is http:ClientError {
            failures += 1;
            lastError = res.message();
            break;
        }
        json payload = <json>res;
        json[] items = <json[]>jval(payload, "hotspots");
        map<json> paging = <map<json>>jval(payload, "paging");
        int pageSize = <int>paging["pageSize"];
        foreach json item in items {
            sql:Error? e = upsertHotspot(item);
            if e is sql:Error {
                failures += 1;
                lastError = e.message();
            } else {
                upserted += 1;
            }
        }
        total = <int>paging["total"];
        if page * pageSize >= total || items.length() == 0 {
            break;
        }
        page += 1;
        runtime:sleep(0.2);
    }
    return {kind: "hotspots", total, upserted, pages: page, failures, lastError};
}

function upsertHotspot(json payload) returns sql:Error? {
    string? reviewStatus = reviewStatusForHotspot(payload);
    sql:ParameterizedQuery q = `INSERT INTO sonar.hotspots
        (key, security_category, vulnerability_probability, status, resolution,
         project_key, component_key, line, rule_key, message, author, review_status, raw_json)
        VALUES (${jstr(jval(payload, "key"))}, ${jstr(jval(payload, "securityCategory"))},
                ${jstr(jval(payload, "vulnerabilityProbability"))}, ${jstr(jval(payload, "status"))},
                ${jstr(jval(payload, "resolution"))},
                ${jstr(jval(payload, "project"))}, ${jstr(jval(payload, "component"))},
                ${jint(payload, "line")}, ${jstr(jval(payload, "ruleKey"))},
                ${jstr(jval(payload, "message"))}, ${jstr(jval(payload, "author"))},
                ${reviewStatus}, ${payload.toJsonString()}::jsonb)
        ON CONFLICT (key) DO UPDATE SET
            security_category = EXCLUDED.security_category,
            vulnerability_probability = EXCLUDED.vulnerability_probability,
            status = EXCLUDED.status, resolution = EXCLUDED.resolution,
            project_key = EXCLUDED.project_key, component_key = EXCLUDED.component_key,
            line = EXCLUDED.line, rule_key = EXCLUDED.rule_key,
            message = EXCLUDED.message, author = EXCLUDED.author,
            review_status = EXCLUDED.review_status,
            raw_json = EXCLUDED.raw_json, updated_at = now()`;
    sql:ExecutionResult|sql:Error r = db->execute(q);
    if r is sql:Error {
        return r;
    }
    return ();
}

// ── Pull: measures ──────────────────────────────────────────────────

function pullMeasures() returns MeasuresResult {
    string endpoint = string `/api/measures/component?component=${PROJECT_KEY}&metricKeys=coverage,duplicated_lines_density,reliability_rating,security_rating,sqale_rating,ncloc,bugs,vulnerabilities,code_smells,alert_status`;
    json|http:ClientError res = sonarGet(endpoint);
    if res is http:ClientError {
        return {kind: "measures", ok: false, errorMsg: res.message()};
    }
    json payload = <json>res;
    int inserted = 0;
    string gateStatus = "";
    map<json> comp = <map<json>>jval(payload, "component");
    json[] measures = <json[]>jval(comp, "measures");
    string projectKey = jstr(jval(comp, "key"));
    foreach json m in measures {
        string metricKey = jstr(jval(m, "metric"));
        string metricValue = jstr(jval(m, "value"));
        if metricKey == "alert_status" {
            gateStatus = metricValue;
        }
        sql:ParameterizedQuery q = `INSERT INTO sonar.measures
            (project_key, metric_key, metric_value, quality_gate_status, captured_at)
            VALUES (${projectKey}, ${metricKey}, ${metricValue}, ${gateStatus}, now())`;
        sql:ExecutionResult|sql:Error r = db->execute(q);
        if r is sql:Error {
            return {kind: "measures", ok: false, errorMsg: r.message()};
        }
        inserted += 1;
    }
    return {kind: "measures", inserted, ok: true};
}

// ── Sync runner ─────────────────────────────────────────────────────

function runSync() returns json {
    PullResult issues = pullIssues();
    PullResult hotspots = pullHotspots();
    MeasuresResult measures = pullMeasures();

    int totalFails = issues.failures + hotspots.failures;
    string status = "ok";
    if (totalFails > 0 || !measures.ok) {
        status = "partial";
    }

    sql:ParameterizedQuery q = `UPDATE sonar.sync_state SET
        last_issues_sync = now(), last_hotspots_sync = now(), last_measures_sync = now(),
        issues_total = ${issues.total}, hotspots_total = ${hotspots.total},
        last_sync_status = ${status},
        last_sync_count = ${issues.upserted + hotspots.upserted},
        updated_at = now()`;
    sql:ExecutionResult|sql:Error r = db->execute(q);
    if r is sql:Error {
        return {status: "failed", "error": r.message(), issues, hotspots, measures};
    }
    return {status, issues, hotspots, measures};
}

// ── Writeback ───────────────────────────────────────────────────────

function writebackHotspot(string hotspotKey, string action) returns json|http:Response {
    map<string> form = {hotspot: hotspotKey, status: "REVIEWED"};
    if action == "safe" {
        form["resolution"] = "SAFE";
    } else if action == "fixed" {
        form["resolution"] = "FIXED";
    } else if action == "accept-risk" {
        form["resolution"] = "ACCEPTED_RISK";
    } else {
        http:Response bad = new;
        bad.statusCode = 400;
        bad.setJsonPayload({"error": "unknown hotspot action", allowed: ["safe", "fixed", "accept-risk"]});
        return bad;
    }
    json|http:ClientError res = sonarPost("/api/hotspots/change_status", form);
    if res is http:ClientError {
        return upstreamFail("/api/hotspots/change_status", res.message());
    }
    return {ok: true, key: hotspotKey, action};
}

function writebackIssue(string issueKey, string transition) returns json|http:Response {
    json|http:ClientError res = sonarPost("/api/issues/do_transition", {
        issue: issueKey,
        transition: transition
    });
    if res is http:ClientError {
        return upstreamFail("/api/issues/do_transition", res.message());
    }
    return {ok: true, key: issueKey, transition};
}

function recordReview(string kind, string key, string action, string? owner, string? note) returns json|http:Response {
    json|http:Response wb = kind == "issues"
        ? writebackIssue(key, action)
        : writebackHotspot(key, action);
    if wb is http:Response && wb.statusCode >= 400 {
        return wb;
    }

    sql:ParameterizedQuery q;
    if kind == "issues" {
        q = `UPDATE sonar.issues SET review_status = ${action}, review_owner = ${owner},
             review_note = ${note}, reviewed_at = now(), synced_to_sonar = true,
             updated_at = now() WHERE key = ${key}`;
    } else {
        q = `UPDATE sonar.hotspots SET review_status = ${action}, review_owner = ${owner},
             review_note = ${note}, reviewed_at = now(), synced_to_sonar = true,
             updated_at = now() WHERE key = ${key}`;
    }
    sql:ExecutionResult|sql:Error r = db->execute(q);
    if r is sql:Error {
        return {ok: true, warning: "sonar updated but local record failed: " + r.message()};
    }
    return {ok: true, key: key, kind: kind, action: action};
}

// ── Read helpers (used by list endpoints) ───────────────────────────

// Run a parameterized read query, draining the whole stream into a json
// array of rows (column name -> value).
function queryJson(sql:ParameterizedQuery qry) returns json|sql:Error {
    stream<record {}, sql:Error?> rs = db->query(qry);
    json[] out = [];
    while true {
        record {}|sql:Error? row = rs.next();
        if row is () {
            break;
        }
        if row is sql:Error {
            return row;
        }
        map<json> rowJson = {};
        map<anydata> cols = rowMap(row);
        foreach string col in cols.keys() {
            anydata? value = cols[col];
            if value is () {
                rowJson[col] = ();
            } else if value is string {
                rowJson[col] = value;
            } else if value is int|float|decimal|boolean {
                rowJson[col] = value;
            } else {
                rowJson[col] = value.toJsonString();
            }
        }
        out.push(rowJson);
    }
    return {items: out, count: out.length()};
}

// The sql driver (1.19) returns open-typed rows packed as {"value": {...}};
// unwrap to the actual column map.
function rowMap(record {} row) returns map<anydata> {
    anydata v = row["value"];
    if v is map<anydata> {
        return v;
    }
    return {};
}

// anydata -> json (used for the sync-state row).
function toJson(anydata v) returns json {
    json|error converted = v.cloneWithType(json);
    if converted is error {
        return v.toJsonString();
    }
    return converted;
}

// ── Service ─────────────────────────────────────────────────────────

service "/sonar-sync" on new http:Listener(port, { host: bindHost }) {

    // Liveness — upstream reachable, db connected.
    resource function get health() returns json {
        json|http:ClientError s = sonarGet("/api/system/status");
        return {
            status: "ok",
            "service": "sonar-sync",
            sonar: s is http:ClientError ? "unreachable" : "reachable",
            db: "connected"
        };
    }

    // Trigger one sync pass now; returns the summary.
    resource function get trigger() returns json {
        return runSync();
    }

    // Issues from the canonical DB with filters.
    // Query params: issueType, severity, status, query (free text), page, pageSize.
    resource function get issues(string? issueType, string? severity, string? status, string? query,
                                 int? page, int? pageSize) returns json|http:Response {
        string t = issueType is string && issueType != "" ? issueType : "";
        string sev = severity is string && severity != "" ? severity : "";
        string st = status is string && status != "" ? status : "";
        string q = query is string ? query : "";
        int p = page is int && page > 0 ? page : 1;
        int ps = pageSize is int && pageSize > 0 && pageSize <= 500 ? pageSize : 200;
        sql:ParameterizedQuery qry = `SELECT key, sonar_type, severity, status, resolution,
                component_key, line, rule_key, message, review_status, review_owner,
                first_seen_at, updated_at
            FROM sonar.issues
            WHERE (${t} = '' OR sonar_type = ${t})
              AND (${sev} = '' OR severity = ${sev})
              AND (${st} = '' OR status = ${st})
              AND (${q} = '' OR message ILIKE '%' || ${q} || '%' OR component_key ILIKE '%' || ${q} || '%')
            ORDER BY (severity = 'BLOCKER') DESC, (severity = 'CRITICAL') DESC,
                     (severity = 'MAJOR') DESC, updated_at DESC
            LIMIT ${ps} OFFSET ${(p - 1) * ps}`;
        json|sql:Error rows = queryJson(qry);
        if rows is sql:Error {
            http:Response err = new;
            err.statusCode = 500;
            err.setJsonPayload({"error": rows.message()});
            return err;
        }
        return rows;
    }

    // Hotspots from the canonical DB with filters.
    // Query params: category, status, query (free text), page, pageSize.
    resource function get hotspots(string? category, string? status, string? query,
                                   int? page, int? pageSize) returns json|http:Response {
        string cat = category is string && category != "" ? category : "";
        string st = status is string && status != "" ? status : "";
        string q = query is string ? query : "";
        int p = page is int && page > 0 ? page : 1;
        int ps = pageSize is int && pageSize > 0 && pageSize <= 500 ? pageSize : 200;
        sql:ParameterizedQuery qry = `SELECT key, security_category, vulnerability_probability,
                status, resolution, component_key, line, rule_key, message,
                review_status, review_owner, first_seen_at, updated_at
            FROM sonar.hotspots
            WHERE (${cat} = '' OR security_category = ${cat})
              AND (${st} = '' OR status = ${st})
              AND (${q} = '' OR message ILIKE '%' || ${q} || '%' OR component_key ILIKE '%' || ${q} || '%')
            ORDER BY (vulnerability_probability = 'HIGH') DESC,
                     (vulnerability_probability = 'MEDIUM') DESC, updated_at DESC
            LIMIT ${ps} OFFSET ${(p - 1) * ps}`;
        json|sql:Error rows = queryJson(qry);
        if rows is sql:Error {
            http:Response err = new;
            err.statusCode = 500;
            err.setJsonPayload({"error": rows.message()});
            return err;
        }
        return rows;
    }

    // Review a hotspot: action = safe | fixed | accept-risk
    resource function post hotspotReview(string hotspotKey, string action, string? owner, string? note)
            returns json|http:Response {
        return recordReview("hotspots", hotspotKey, action, owner, note);
    }

    // Review an issue: transition = confirm | unconfirm | reopen | resolve | falsepositive | wontfix
    resource function post issueReview(string issueKey, string transition, string? owner, string? note)
            returns json|http:Response {
        return recordReview("issues", issueKey, transition, owner, note);
    }

    // Last sync bookkeeping.
    resource function get state() returns json {
        sql:ParameterizedQuery qry = `UPDATE sonar.sync_state SET updated_at = updated_at WHERE
            last_issues_sync IS NOT NULL RETURNING last_issues_sync, last_hotspots_sync,
            issues_total, hotspots_total, last_sync_status, last_sync_count, updated_at`;
        stream<record {}, sql:Error?> rs = db->query(qry);
        record {}|sql:Error? row = rs.next();
        if row is () || row is sql:Error {
            return {status: "no-sync-yet"};
        }
        map<anydata> cols = rowMap(row);
        return {
            status: toJson(cols["last_sync_status"]),
            issuesTotal: toJson(cols["issues_total"]),
            hotspotsTotal: toJson(cols["hotspots_total"]),
            lastSyncCount: toJson(cols["last_sync_count"]),
            lastIssuesSync: toJson(cols["last_issues_sync"]),
            lastHotspotsSync: toJson(cols["last_hotspots_sync"]),
            updatedAt: toJson(cols["updated_at"])
        };
    }
}

// ── Scheduled sync loop ─────────────────────────────────────────────
// NOTE: the sync loop runs on its own strand so that main() returns
// immediately — Ballerina does not start service listeners until the
// entry function returns. With a blocking loop here the HTTP service
// would never bind its port.

public function main() {
    _ = start syncLoop();
}

function syncLoop() {
    while true {
        runtime:sleep(<decimal>syncIntervalSeconds);
        json result = runSync();
        io:println("sync: " + result.toJsonString());
    }
}