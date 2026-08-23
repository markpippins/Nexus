// Parity runner — config-driven dual-target conformance checks.
//
// Targets are read from Config.toml (gitignored):
//   [parity]
//   legacyBase    = "http://192.168.1.82:3107"
//   candidateBase = "http://localhost:3107"
//
// Pattern per check (read-only GETs only in phase 1):
//   1. call both targets with identical request
//   2. compare status code + envelope shape (top-level keys & value types)
//   3. report divergence as parity failure
//
// Values themselves may legitimately differ between stacks (live data);
// SHAPE must not. That distinction is the whole point of the envelope check.

import ballerina/http;
import ballerina/io;
import ballerina/lang.runtime;

configurable string legacyBase = ?;
configurable string candidateBase = ?;
// Endpoint set is per-run config — different target pairs share
// different contract surfaces (see Config.toml).
configurable string[] endpoints = ?;

public type ParityResult record {|
    string endpoint;
    int legacyStatus;
    int candidateStatus;
    boolean statusMatch;
    boolean shapeMatch;
    string detail;
|};

public function compareGet(string path, http:Client legacy,
        http:Client candidate) returns ParityResult {
    ParityResult res = {
        endpoint: path,
        legacyStatus: -1,
        candidateStatus: -1,
        statusMatch: false,
        shapeMatch: false,
        detail: ""
    };

    map<json> legacyEnvelope = {};
    map<json> candidateEnvelope = {};

    runtime:sleep(0.05); // gentle pacing; one target shares a LAN Pi

    // Plain get() defaults to a full http:Response (status codes included).
    http:Response|http:ClientError lResp = legacy->get(path);
    if lResp is http:Response {
        res.legacyStatus = lResp.statusCode;
        json|http:ClientError lj = lResp.getJsonPayload();
        if lj is map<json> {
            legacyEnvelope = lj;
        }
    } else {
        res.detail = "legacy: " + lResp.toString() + " ";
    }

    http:Response|http:ClientError cResp = candidate->get(path);
    if cResp is http:Response {
        res.candidateStatus = cResp.statusCode;
        json|http:ClientError cj = cResp.getJsonPayload();
        if cj is map<json> {
            candidateEnvelope = cj;
        }
    } else {
        res.detail += "candidate: " + cResp.toString();
    }

    res.statusMatch = res.legacyStatus == res.candidateStatus;
    string diffs = diffShape(legacyEnvelope, candidateEnvelope);
    res.shapeMatch = diffs == "";
    if !res.shapeMatch {
        res.detail = diffs;
    } else if !res.statusMatch {
        res.detail = "status " + res.legacyStatus.toString()
            + " vs " + res.candidateStatus.toString();
    }
    return res;
}

// Coarse JSON kind tag — envelope shape only cares about these buckets.
function jsonKind(json v) returns string =>
    v is string ? "string" :
    v is boolean ? "boolean" :
    v is int || v is float || v is decimal ? "number" :
    v is map<json> ? "object" :
    v is json[] ? "array" : "other";

function diffShape(map<json> a, map<json> b) returns string {
    string[] diffs = [];
    foreach var [k, av] in a.entries() {
        if b.hasKey(k) {
            json bv = b.get(k);
            if jsonKind(av) != jsonKind(bv) {
                diffs.push("key '" + k + "' type mismatch");
            }
        } else {
            diffs.push("missing on candidate: '" + k + "'");
        }
    }
    foreach var [k, _] in b.entries() {
        if !(a.hasKey(k)) {
            diffs.push("extra on candidate: '" + k + "'");
        }
    }
    string out = "";
    foreach string d in diffs {
        out += d + "; ";
    }
    return out.trim();
}



// langlib has no padding; tiny helper for report alignment.
function pad(string s, int width) returns string {
    if s.length() >= width { return s; }
    string sp = "";
    foreach int _ in 0 ..< (width - s.length()) {
        sp += " ";
    }
    return s + sp;
}

// ------------------------------------------------------------- runner ----

public function main() returns error? {
    http:Client legacy = check new (legacyBase);
    http:Client candidate = check new (candidateBase);

    io:println("parity baseline: legacy=" + legacyBase + "  candidate=" + candidateBase);
    io:println(pad("endpoint", 38) + pad("status", 14) + "shape  detail");
    int nPass = 0; int nFail = 0;

    foreach string ep in endpoints {
        ParityResult r = compareGet(ep, legacy, candidate);
        boolean ok = r.statusMatch && r.shapeMatch
            && r.legacyStatus >= 0 && r.candidateStatus >= 0;
        if ok { nPass += 1; } else { nFail += 1; }
        io:println(pad(ep, 38)
            + pad(r.legacyStatus.toString() + "/" + r.candidateStatus.toString(), 14)
            + pad((ok ? "PASS" : "FAIL"), 7) + r.detail);
    }
    string summary = "result: " + nPass.toString() + " pass, "
        + nFail.toString() + " fail";
    io:println(summary);
}
