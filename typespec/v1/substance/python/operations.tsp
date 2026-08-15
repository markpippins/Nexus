/**
 * substance — TypeSpec Operations
 *
 * Reverse-engineered from python/substance/main.py + routers/*.py (FastAPI).
 * The segment-sets router carries prefix /segment-sets; the domain-links
 * router has no prefix (mounted at root).
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.substance {

  @route("/healthz")
  @get
  @doc("Liveness probe.")
  op healthz(): unknown;

  // ========================================================================
  // Segment sets (/segment-sets)
  // ========================================================================

  @route("/segment-sets")
  @post
  @doc("Create a segment set.")
  op createSegmentSet(@body body: unknown): SegmentSetOut | unknown;

  @route("/segment-sets/{segment_set_id}")
  @get
  @doc("Get a segment set.")
  op getSegmentSet(@path segment_set_id: string): SegmentSetOut | unknown;

  @route("/segment-sets/{segment_set_id}")
  @patch
  @doc("Update a segment set.")
  op updateSegmentSet(@path segment_set_id: string, @body body: unknown): SegmentSetOut | unknown;

  @route("/segment-sets/{segment_set_id}/members")
  @post
  @doc("Add members to a segment set.")
  op addMembers(@path segment_set_id: string, @body body: unknown): SegmentSetOut | unknown;

  @route("/segment-sets/{segment_set_id}/members/{segment_id}")
  @delete
  @doc("Remove a member from a segment set.")
  op removeMember(@path segment_set_id: string, @path segment_id: string): SegmentSetOut | unknown;

  // ========================================================================
  // Domain links
  // ========================================================================

  @route("/{domain_type}/{domain_id}/segment-sets")
  @post
  @doc("Link a segment set to a domain entity.")
  op linkSegmentSet(@path domain_type: string, @path domain_id: string, @body body: DomainLinkIn): DomainLinkOut | unknown;

  @route("/{domain_type}/{domain_id}/segment-sets")
  @get
  @doc("List segment sets linked to a domain entity.")
  op listDomainLinks(@path domain_type: string, @path domain_id: string): DomainLinkOut[] | unknown;

  @route("/{domain_type}/{domain_id}/segment-sets/{segment_set_id}")
  @delete
  @doc("Unlink a segment set from a domain entity.")
  op unlinkSegmentSet(@path domain_type: string, @path domain_id: string, @path segment_set_id: string): unknown;
}
