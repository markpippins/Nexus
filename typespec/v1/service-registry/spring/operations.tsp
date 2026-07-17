/**
 * Nexus Lookup Service Operations
 * 
 * Standard CRUD operations for lookup entities.
 * All lookups follow the same pattern: list, get by ID, create, update, delete.
 */
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../../core/main.tsp";
import "./models.tsp";

using Http;
using Rest;

alias Core = com.aibizarchitect.nexus.v1.core;
alias Registry = com.aibizarchitect.nexus.v1.serviceregistry;

namespace com.aibizarchitect.nexus.v1.serviceregistry {

  // ========================================================================
  // Framework Vendor Operations
  // ========================================================================

  @route("/api/v1/framework-vendors")
  @tag("Framework Vendors")
  interface FrameworkVendors {
    @doc("Get all framework vendors")
    @get
    list(...PaginationParameters): Core.PagedResponse<Registry.FrameworkVendor>;

    @doc("Get a framework vendor by ID")
    @get
    get(@path id: int64): Registry.FrameworkVendor;

    @doc("Create a new framework vendor")
    @post
    create(@body vendor: FrameworkVendorCreate): Registry.FrameworkVendor;

    @doc("Update a framework vendor")
    @put
    update(@path id: int64, @body vendor: FrameworkVendorUpdate): Registry.FrameworkVendor;

    @doc("Delete a framework vendor")
    @delete
    delete(@path id: int64): void;
  }

  // ========================================================================
  // Framework Type Operations
  // ========================================================================

  @route("/api/v1/framework-categories")
  @tag("Framework Types")
  interface FrameworkTypes {
    @doc("Get all framework types")
    @get
    list(...PaginationParameters): Core.PagedResponse<Registry.FrameworkType>;

    @doc("Get a framework type by ID")
    @get
    get(@path id: int64): Registry.FrameworkType;

    @doc("Create a new framework type")
    @post
    create(@body category: FrameworkTypeCreate): Registry.FrameworkType;

    @doc("Update a framework type")
    @put
    update(@path id: int64, @body category: FrameworkTypeUpdate): Registry.FrameworkType;

    @doc("Delete a framework type")
    @delete
    delete(@path id: int64): void;
  }

  // ========================================================================
  // Framework Language Operations
  // ========================================================================

  @route("/api/v1/framework-languages")
  @tag("Framework Languages")
  interface FrameworkLanguages {
    @doc("Get all framework languages")
    @get
    list(...PaginationParameters): Core.PagedResponse<Registry.FrameworkLanguage>;

    @doc("Get a framework language by ID")
    @get
    get(@path id: int64): Registry.FrameworkLanguage;

    @doc("Create a new framework language")
    @post
    create(@body language: FrameworkLanguageCreate): Registry.FrameworkLanguage;

    @doc("Update a framework language")
    @put
    update(@path id: int64, @body language: FrameworkLanguageUpdate): Registry.FrameworkLanguage;

    @doc("Delete a framework language")
    @delete
    delete(@path id: int64): void;
  }

  // ========================================================================
  // Request/Response Models
  // ========================================================================

  /** Pagination parameters for list operations */
  model PaginationParameters {
    @query page?: int32 = 0;
    @query size?: int32 = 20;
    @query sort?: string;
  }

}
