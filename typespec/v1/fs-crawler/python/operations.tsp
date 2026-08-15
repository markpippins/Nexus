/**
 * fs-crawler — TypeSpec Operations
 *
 * Reverse-engineered from python/fs/fs-crawler/app/main.py +
 * app/api/routes.py (FastAPI). The API router is mounted at /api/v1.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.fscrawler {

  // ========================================================================
  // Root / health
  // ========================================================================

  @route("/")
  @get
  @doc("Service root.")
  op root(): unknown;

  @route("/health")
  @get
  @doc("Liveness probe.")
  op health(): unknown;

  @route("/system/status")
  @get
  @doc("System status snapshot.")
  op systemStatus(): SystemStatus | unknown;

  // ========================================================================
  // Libraries (/api/v1/libraries)
  // ========================================================================

  @route("/api/v1/libraries")
  @get
  @doc("List libraries.")
  op listLibraries(): Library[] | unknown;

  @route("/api/v1/libraries")
  @post
  @doc("Create a library.")
  op createLibrary(@body body: unknown): Library | unknown;

  @route("/api/v1/libraries/{library_id}")
  @put
  @doc("Update a library.")
  op updateLibrary(@path library_id: string, @body body: unknown): Library | unknown;

  @route("/api/v1/libraries/{library_id}")
  @delete
  @doc("Delete a library.")
  op deleteLibrary(@path library_id: string): unknown;

  // ========================================================================
  // Scan (/api/v1/scan)
  // ========================================================================

  @route("/api/v1/scan/start")
  @post
  @doc("Start a scan.")
  op startScan(@body body: unknown): ScanStatus | unknown;

  @route("/api/v1/scan/status")
  @get
  @doc("Get scan status.")
  op scanStatus(): ScanStatus | unknown;

  @route("/api/v1/scan/stop")
  @post
  @doc("Stop a scan.")
  op stopScan(): ScanStatus | unknown;

  // ========================================================================
  // Search / files / stats
  // ========================================================================

  @route("/api/v1/search")
  @get
  @doc("Search indexed files.")
  op search(@query q?: string): unknown;

  @route("/api/v1/files/{file_id}")
  @get
  @doc("Get a file's metadata.")
  op getFile(@path file_id: string): unknown;

  @route("/api/v1/stats")
  @get
  @doc("Index statistics.")
  op stats(): unknown;

  // ========================================================================
  // Duplicates (/api/v1/duplicates)
  // ========================================================================

  @route("/api/v1/duplicates/stats")
  @get
  @doc("Duplicate statistics.")
  op duplicateStats(): DuplicateStats | unknown;

  @route("/api/v1/duplicates/detect")
  @post
  @doc("Detect duplicates.")
  op detectDuplicates(@body body: unknown): unknown;

  @route("/api/v1/duplicates/candidates")
  @get
  @doc("List duplicate candidates.")
  op duplicateCandidates(): unknown;

  @route("/api/v1/duplicates/groups")
  @get
  @doc("List duplicate groups.")
  op duplicateGroups(): unknown;

  @route("/api/v1/duplicates/resolve")
  @post
  @doc("Resolve a duplicate group.")
  op resolveDuplicates(@body body: unknown): unknown;

  @route("/api/v1/duplicates/resolution-stats")
  @get
  @doc("Duplicate resolution statistics.")
  op resolutionStats(): unknown;

  @route("/api/v1/duplicates/preview")
  @get
  @doc("Preview duplicate resolution.")
  op duplicatePreview(): unknown;

  // ========================================================================
  // Rules (/api/v1/rules)
  // ========================================================================

  @route("/api/v1/rules")
  @get
  @doc("List rules.")
  op listRules(): CrawlRule[] | unknown;

  @route("/api/v1/rules")
  @post
  @doc("Create a rule.")
  op createRule(@body body: unknown): CrawlRule | unknown;

  @route("/api/v1/rules/{rule_id}")
  @put
  @doc("Update a rule.")
  op updateRule(@path rule_id: string, @body body: unknown): CrawlRule | unknown;

  @route("/api/v1/rules/{rule_id}")
  @delete
  @doc("Delete a rule.")
  op deleteRule(@path rule_id: string): unknown;

  @route("/api/v1/rules/defaults")
  @post
  @doc("Create default rules.")
  op createDefaultRules(@body body: unknown): unknown;

  @route("/api/v1/rules/templates")
  @post
  @doc("Create rule templates.")
  op createRuleTemplates(@body body: unknown): unknown;

  @route("/api/v1/rules/templates")
  @get
  @doc("List rule templates.")
  op listRuleTemplates(): unknown;

  // ========================================================================
  // Config (/api/v1/config)
  // ========================================================================

  @route("/api/v1/config/file-types")
  @get
  @doc("List configured file types.")
  op configFileTypes(): unknown;

  @route("/api/v1/config/handlers")
  @get
  @doc("List configured handlers.")
  op configHandlers(): unknown;
}
