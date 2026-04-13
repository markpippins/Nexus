/**
 * Nexus Lookup Service Models
 * 
 * Simple lookup entities for the service registry.
 * These are reference data entities with standard CRUD patterns.
 */

/**
 * Base model for all lookup entities.
 * Provides common fields and consistency across lookups.
 */
namespace Nexus.ServiceRegistry.V1;

model LookupBase {
  /** Unique identifier */
  @visibility(Lifecycle.Read)
  id: int64;

  /** Display name - unique within the lookup type */
  @minLength(1)
  @maxLength(255)
  name: string;

  /** Whether this lookup value is active/available */
  activeFlag?: boolean = true;
}

/**
 * Extended lookup with description support.
 */
model DescribedLookup extends LookupBase {
  /** Detailed description of the lookup value */
  @maxLength(1000)
  description?: string;
}

/**
 * Extended lookup with URL support.
 */
model LinkedLookup extends DescribedLookup {
  /** External URL for reference (documentation, vendor site, etc.) */
  @format("url")
  url?: string;
}

/**
 * Framework vendor lookup.
 * Vendors provide frameworks (Spring, Quarkus, etc.)
 */
model FrameworkVendor extends LinkedLookup {
  /** Vendor name (e.g., "VMware", "Red Hat") */
  name: string;
}

/**
 * Framework category lookup.
 * Categorizes frameworks by their general type.
 */
model FrameworkCategory extends LookupBase {
  /** Category name (e.g., "Web Framework", "Micro Framework") */
  name: string;
  
  // Note: description field removed but kept in model for backward compat
  // Actual value will be null
  @visibility(Lifecycle.Read)
  description?: string;
}

/**
 * Framework language lookup.
 * Programming languages supported by the platform.
 */
model FrameworkLanguage extends LinkedLookup {
  /** Language name (e.g., "Java", "TypeScript") */
  name: string;

  /** Current stable version of the language */
  currentVersion?: string;

  /** Long-term support version of the language */
  ltsVersion?: string;
}

// ============================================================================
// Response Models
// ============================================================================

/**
 * Standard paginated response wrapper.
 */
model PagedResponse<T> {
  /** Response data */
  data: T[];

  /** Total number of items across all pages */
  totalElements: int64;

  /** Total number of pages */
  totalPages: int32;

  /** Current page number (0-indexed) */
  number: int32;

  /** Number of items in current page */
  numberOfElements: int32;

  /** Size of each page */
  size: int32;
}

/**
 * Error response structure.
 */
model ErrorResponse {
  /** Error message */
  message: string;

  /** HTTP status code */
  status: int32;

  /** Timestamp when error occurred */
  timestamp: utcDateTime;

  /** Request path that caused the error */
  path?: string;

  /** Detailed error details */
  details?: string[];
}
