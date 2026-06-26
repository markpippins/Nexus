/**
 * Integration test: hierarchy harvest-candidate lookups
 * (GET /api/systems/:id/harvest-candidates, /api/subsystems/:id/harvest-candidates,
 *  /api/features/:id/harvest-candidates).
 *
 * Test flow:
 *  1. Create system → subsystem → feature hierarchy
 *  2. Create harvest + three candidates (one per level)
 *  3. PATCH-link each candidate to its level
 *  4. GET /api/systems/:id/harvest-candidates → verify system candidate
 *  5. GET /api/subsystems/:id/harvest-candidates → verify subsystem candidate
 *  6. GET /api/features/:id/harvest-candidates → verify feature candidate
 *  7. Clean up
 *
 * Usage: npx ts-node tests/hierarchy-harvest-candidate-lookup.test.ts
 */

import * as http from "http";

const BASE = "http://localhost:3101";

function httpReq(method: string, path: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const url = new URL(path, BASE);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: bodyStr
        ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(bodyStr)) }
        : {},
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function httpGet(path: string) { return httpReq("GET", path); }
function httpPost(path: string, body?: any) { return httpReq("POST", path, body); }
function httpPatch(path: string, body?: any) { return httpReq("PATCH", path, body); }
function httpDelete(path: string) { return httpReq("DELETE", path); }

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log("=== hierarchy harvest-candidate lookup integration test ===\n");

  // 1. Create system → subsystem → feature
  console.log("1. Creating system hierarchy...");
  const sysRes = await httpPost("/api/systems", { name: "Lookup Test System" });
  assert(sysRes.status === 201, `Created system → ${sysRes.status}`);
  const systemId: string = sysRes.body.id;

  const subRes = await httpPost("/api/subsystems", { systemId, name: "Lookup Test Subsystem" });
  assert(subRes.status === 201, `Created subsystem → ${subRes.status}`);
  const subsystemId: string = subRes.body.id;

  const featRes = await httpPost("/api/features", { subsystemId, name: "Lookup Test Feature" });
  assert(featRes.status === 201, `Created feature → ${featRes.status}`);
  const featureId: string = featRes.body.id;
  console.log(`   system: ${systemId}, subsystem: ${subsystemId}, feature: ${featureId}`);

  // 2. Create harvest
  console.log("2. Creating harvest...");
  const harvRes = await httpPost("/api/harvests", {
    sourcePath: "tests/hierarchy-lookup.test.ts",
    sourceFilename: "hierarchy-lookup.test.ts",
    model: "test",
    totalCandidates: 0,
    candidates: [],
  });
  assert(harvRes.status === 201, `Created harvest → ${harvRes.status}`);
  const harvestId: string = harvRes.body.id;

  // 3. Create three candidates (one for each hierarchy level)
  console.log("3. Creating candidates...");

  const sysCand = await httpPost("/api/harvest-candidates", {
    harvestId, title: "System-Level Candidate",
    intentDescription: "Linked to system only.",
  });
  assert(sysCand.status === 201, "Created system candidate");
  const sysCandId: string = sysCand.body.id;

  const subCand = await httpPost("/api/harvest-candidates", {
    harvestId, title: "Subsystem-Level Candidate",
    intentDescription: "Linked to subsystem.",
  });
  assert(subCand.status === 201, "Created subsystem candidate");
  const subCandId: string = subCand.body.id;

  const featCand = await httpPost("/api/harvest-candidates", {
    harvestId, title: "Feature-Level Candidate",
    intentDescription: "Linked to feature.",
  });
  assert(featCand.status === 201, "Created feature candidate");
  const featCandId: string = featCand.body.id;

  // 4. Link each candidate to its respective hierarchy level
  console.log("4. Linking candidates to hierarchy levels...");
  await httpPatch(`/api/harvest-candidates/${sysCandId}`, { systemId });
  await httpPatch(`/api/harvest-candidates/${subCandId}`, { systemId, subsystemId });
  await httpPatch(`/api/harvest-candidates/${featCandId}`, { systemId, subsystemId, featureId });
  console.log("   All candidates linked.");

  // ════════════════════════════════════════════════════════════
  //  TEST A: System → candidates
  // ════════════════════════════════════════════════════════════
  console.log("\n--- TEST A: GET /api/systems/:id/harvest-candidates ---\n");

  console.log("5. Querying system candidates...");
  const sysLookup = await httpGet(`/api/systems/${systemId}/harvest-candidates`);
  assert(sysLookup.status === 200, `System lookup → ${sysLookup.status}`);
  assert(sysLookup.body.systemId === systemId, "Response includes correct systemId");
  assert(sysLookup.body.count >= 3, `All 3 candidates visible at system level (count: ${sysLookup.body.count})`);

  const sysCands: any[] = sysLookup.body.candidates;
  assert(sysCands.some((c: any) => c.id === sysCandId), "System-level candidate found");
  assert(sysCands.some((c: any) => c.id === subCandId), "Subsystem-level candidate found");
  assert(sysCands.some((c: any) => c.id === featCandId), "Feature-level candidate found");

  // 6. Subsystem → candidates
  console.log("6. Querying subsystem candidates...");
  const subLookup = await httpGet(`/api/subsystems/${subsystemId}/harvest-candidates`);
  assert(subLookup.status === 200, `Subsystem lookup → ${subLookup.status}`);
  assert(subLookup.body.subsystemId === subsystemId, "Response includes correct subsystemId");
  assert(subLookup.body.count >= 2, `2 candidates with subsystem_id set (count: ${subLookup.body.count})`);

  const subCands: any[] = subLookup.body.candidates;
  assert(subCands.some((c: any) => c.id === subCandId), "Subsystem-level candidate found");
  assert(subCands.some((c: any) => c.id === featCandId), "Feature-level candidate found (has subsystem_id)");
  assert(!subCands.some((c: any) => c.id === sysCandId), "System-only candidate NOT in subsystem results");

  // 7. Feature → candidates
  console.log("7. Querying feature candidates...");
  const featLookup = await httpGet(`/api/features/${featureId}/harvest-candidates`);
  assert(featLookup.status === 200, `Feature lookup → ${featLookup.status}`);
  assert(featLookup.body.featureId === featureId, "Response includes correct featureId");
  assert(featLookup.body.count >= 1, `1 candidate with feature_id set (count: ${featLookup.body.count})`);

  const featCands: any[] = featLookup.body.candidates;
  assert(featCands.some((c: any) => c.id === featCandId), "Feature-level candidate found");
  assert(!featCands.some((c: any) => c.id === subCandId), "Subsystem-only candidate NOT in feature results");
  assert(!featCands.some((c: any) => c.id === sysCandId), "System-only candidate NOT in feature results");

  // ════════════════════════════════════════════════════════════
  //  TEST B: Empty results for unrelated IDs
  // ════════════════════════════════════════════════════════════
  console.log("\n--- TEST B: Empty results for unrelated IDs ---\n");

  console.log("8. Querying with unrelated IDs...");
  const emptySys = await httpGet("/api/systems/00000000-0000-0000-0000-000000000000/harvest-candidates");
  assert(emptySys.status === 200, "Unrelated system query succeeds");
  assert(emptySys.body.count === 0, "Empty results for unrelated system");

  const emptySub = await httpGet("/api/subsystems/00000000-0000-0000-0000-000000000000/harvest-candidates");
  assert(emptySub.status === 200, "Unrelated subsystem query succeeds");
  assert(emptySub.body.count === 0, "Empty results for unrelated subsystem");

  const emptyFeat = await httpGet("/api/features/00000000-0000-0000-0000-000000000000/harvest-candidates");
  assert(emptyFeat.status === 200, "Unrelated feature query succeeds");
  assert(emptyFeat.body.count === 0, "Empty results for unrelated feature");

  // ════════════════════════════════════════════════════════════
  //  CLEANUP
  // ════════════════════════════════════════════════════════════
  console.log("\n--- CLEANUP ---\n");
  console.log("9. Cleaning up...");

  await httpDelete(`/api/harvest-candidates/${sysCandId}`);
  await httpDelete(`/api/harvest-candidates/${subCandId}`);
  await httpDelete(`/api/harvest-candidates/${featCandId}`);
  await httpDelete(`/api/harvests/${harvestId}`);
  await httpDelete(`/api/features/${featureId}`);
  await httpDelete(`/api/subsystems/${subsystemId}`);
  await httpDelete(`/api/systems/${systemId}`);
  console.log("    Test data cleaned up.");

  console.log("\n✅ All tests passed!");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});
