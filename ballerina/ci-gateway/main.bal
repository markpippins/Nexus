// ci-gateway — the single stable REST surface over vanadium's CI stack.
//
// Doctrine: third-party integrations (Jenkins, SonarQube) live behind a
// Ballerina moat. Upstreams move/auth-change; consumers only ever see
// this surface. Read-only GETs in phase 1; webhook listener later.
//
// Config comes from Config.toml (gitignored — see Config.toml.example):
//   [ci]
//   port         = 9095
//   jenkinsBase  = "http://192.168.1.82:8080"
//   jenkinsUser  = "admin"
//   jenkinsToken = "<token>"
//   sonarBase    = "http://192.168.1.82:9000"
//   sonarToken   = "<token>"

import ballerina/http;
import ballerina/io;

configurable int port = 9095;
// G4 edge-monopoly convention: gateway binds loopback by default; LAN
// exposure must come from the control-edge (:8082), not this listener.
configurable string bindHost = "127.0.0.1";
configurable string jenkinsBase = ?;
configurable string jenkinsUser = ?;
configurable string jenkinsToken = ?;
configurable string sonarBase = ?;
// Sonar token-as-username requires EMPTY-password basic auth ("token:").
// Ballerina's auth config rejects empty passwords, so the pre-encoded
// header value (base64("<token>:")) is configured directly instead.
configurable string sonarAuthBasic = ?;
// ── GitHub bridge (increment #3, proposal 13890307) ─────────────────
// Read-only phase: status / repos / open PR search. Webhook listener +
// outbound write actions are a later, separately-ruled increment.
configurable string githubBase = "https://api.github.com";
configurable string githubToken = ?;
configurable string githubOwner = "markpippins";

// Upstream failure → HTTP 502 with a normalized envelope (bad gateway is
// more honest than 500: this service answered, the upstream didn't).
function upstreamFail(string upstreamName, string endpointName,
        http:ClientError cause) returns http:Response {
    http:Response res = new;
    res.statusCode = 502;
    res.setJsonPayload({
        status: "upstream-failure",
        "upstream": upstreamName,
        "endpoint": endpointName,
        detail: cause.message()
    });
    return res;
}

// Sonar GET with manually-attached token auth header (see sonarAuthBasic
// note — Ballerina basic-auth can't do empty-password; the headers-map
// overload of get() carries the credential instead).
function sonarGet(http:Client upstream, string path) returns json|http:ClientError {
    return upstream->get(path, { "Authorization": "Basic " + sonarAuthBasic });
}

final http:Client githubClient = check new (githubBase);

// GitHub GET with bearer token; normalized envelope like the others.
function githubGet(string path) returns json|http:Response {
    json|http:ClientError out =
        githubClient->get(path, {
            "Authorization": "Bearer " + githubToken,
            "Accept": "application/vnd.github+json",
            "User-Agent": "nexus-ci-gateway"
        });
    if out is http:ClientError {
        return upstreamFail("github", path, out);
    }
    return {upstream: "github", endpoint: path, data: out};
}

service /gateway on new http:Listener(port, { host: bindHost }) {

    private final http:Client jenkins;
    private final http:Client sonar;

    function init() returns error? {
        self.jenkins = check new (
            jenkinsBase,
            auth = { username: jenkinsUser, password: jenkinsToken }
        );
        self.sonar = check new (sonarBase);
        io:println("ci-gateway: jenkins=" + jenkinsBase + " sonar=" + sonarBase);
    }

    // Gateway self-check — does not touch upstreams.
    resource function get health() returns json {
        return {
            status: "ok",
            "service": "ci-gateway",
            upstreams: { jenkins: jenkinsBase, sonar: sonarBase }
        };
    }

    // Jenkins root API doc (executors, mode, quietingDown, ...).
    resource function get jenkins/status() returns json|http:Response {
        json|http:ClientError res = self.jenkins->get("/api/json");
        if res is http:ClientError {
            return upstreamFail("jenkins", "/api/json", res);
        }
        return {
            "upstream": "jenkins",
            "endpoint": "/api/json",
            data: res
        };
    }

    // Job list with color-coded build state.
    resource function get jenkins/jobs() returns json|http:Response {
        string endpoint = "/api/json?tree=jobs[name,color,url]";
        json|http:ClientError res = self.jenkins->get(endpoint);
        if res is http:ClientError {
            return upstreamFail("jenkins", endpoint, res);
        }
        return {
            "upstream": "jenkins",
            "endpoint": endpoint,
            data: res
        };
    }

    // Sonar system status (UP/STARTING/DOWN + version).
    resource function get sonar/status() returns json|http:Response {
        json|http:ClientError res = sonarGet(self.sonar, "/api/system/status");
        if res is http:ClientError {
            return upstreamFail("sonarqube", "/api/system/status", res);
        }
        return {
            "upstream": "sonarqube",
            "endpoint": "/api/system/status",
            data: res
        };
    }

    // Onboarded Sonar projects (TRK components).
    resource function get sonar/projects() returns json|http:Response {
        string endpoint = "/api/components/search?qualifiers=TRK";
        json|http:ClientError res = sonarGet(self.sonar, endpoint);
        if res is http:ClientError {
            return upstreamFail("sonarqube", endpoint, res);
        }
        return {
            "upstream": "sonarqube",
            "endpoint": endpoint,
            data: res
        };
    }

    // ---- Drift sentinel (helpers in drift.bal) ----

    // Probe all configured targets now and return the full report.
    // ── GitHub bridge (read-only) ────────────────────────────────
    resource function get github/status() returns json|http:Response {
        return githubGet("/user");
    }

    resource function get github/repos() returns json|http:Response {
        return githubGet(string `/users/${githubOwner}/repos?per_page=100&sort=pushed`);
    }

    // All open PRs across the owner's repos in ONE call (search API).
    resource function get github/pulls() returns json|http:Response {
        // GitHub search 'q': owner names are [A-Za-z0-9-], no encoding needed;
        // spaces/colons in the fixed query parts are pre-encoded.
        string q = githubOwner;
        return githubGet(string `/search/issues?q=is%3Apr%20is%3Aopen%20user%3A${q}&per_page=100`);
    }

    resource function get driftCheck() returns json {
        return reportToJson(runDriftCheck());
    }

    // Last cached report (from the most recent drift/check call).
    resource function get driftStatus() returns json {
        DriftReport? r = lastDriftReport();
        if r is () {
            return { status: "never-run", hint: "GET /gateway/driftStatus" };
        }
        return reportToJson(r);
    }
}
