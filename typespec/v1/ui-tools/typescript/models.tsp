/**
 * ui-tools — TypeSpec Models
 *
 * Reverse-engineered from typescript/ui-tools/src/routes.ts.
 * Domain models for navigation-link CRUD. No route or verb decorators live
 * here; the reconciler scans this file and must find none.
 */
namespace org.nexus.uitools {

  /** The type of a navigation entry. */
  enum LinkType {
    /** A clickable link with address + imagename. */
    link,
    /** A visual separator (no address/imagename). */
    separator,
  }

  /** A navigation link (throttler.links row). */
  model Link {
    /** Row id. */
    @format("uuid")
    id: string;
    /** Link address (empty for separators). */
    address: string;
    /** Icon image name (empty for separators). */
    imagename: string;
    /** Display text, or null. */
    text: string | null;
    /** Entry type. */
    type: LinkType;
    /** Display order. */
    sortOrder: int32;
    /** Creation timestamp. */
    createdAt: utcDateTime;
    /** Last-update timestamp. */
    updatedAt: utcDateTime;
  }

  /** Request body for POST /api/links. */
  model LinkCreateRequest {
    /** Link address (required when type=link). */
    address?: string;
    /** Icon image name (required when type=link). */
    imagename?: string;
    /** Display text. */
    text?: string | null;
    /** Entry type (default: link). */
    type?: LinkType;
    /** Display order (default: appended at end). */
    sortOrder?: int32;
  }

  /** A single re-order entry. */
  model ReorderItem {
    /** Row id. */
    @format("uuid")
    id: string;
    /** New display order. */
    sortOrder: int32;
  }

  /** Request body for PATCH /api/links/reorder. */
  model ReorderRequest {
    /** Ordered list of { id, sortOrder } updates. */
    items: ReorderItem[];
  }

  /** Request body for PATCH /api/links/{id} (all fields optional). */
  model LinkUpdateRequest {
    /** New link address. */
    address?: string;
    /** New icon image name. */
    imagename?: string;
    /** New display text. */
    text?: string | null;
    /** New entry type. */
    type?: LinkType;
    /** New display order. */
    sortOrder?: int32;
  }

  /** Empty-success response (PATCH no-op or DELETE success). */
  model OkResponse {
    /** Always true on success. */
    ok: boolean;
  }

  /** Response body for GET /health. */
  model HealthResponse {
    /** Database reachability (true when SELECT 1 succeeds). */
    ok: boolean;
    /** Service name. */
    service: string;
  }

  /** Error body returned for malformed requests or unknown rows. */
  model ErrorResponse {
    /** Human-readable error message. */
    error: string;
  }
}
