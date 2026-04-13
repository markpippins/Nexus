/**
 * Nexus Lookup Service Operations
 * 
 * Standard CRUD operations for lookup entities.
 * All lookups follow the same pattern: list, get by ID, create, update, delete.
 */
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./models.tsp";

using Http;
using Rest;

namespace Nexus.ServiceRegistry.V1 {

  // ========================================================================
  // Framework Vendor Operations
  // ========================================================================

  @route("/api/v1/framework-vendors")
  @tag("Framework Vendors")
  interface FrameworkVendors {
    @doc("Get all framework vendors")
    @get
    list(...PaginationParameters): PagedResponse<FrameworkVendor>;

    @doc("Get a framework vendor by ID")
    @get
    get(@path id: int64): FrameworkVendor;

    @doc("Create a new framework vendor")
    @post
    create(@body vendor: FrameworkVendorCreate): FrameworkVendor;

    @doc("Update a framework vendor")
    @put
    update(@path id: int64, @body vendor: FrameworkVendorUpdate): FrameworkVendor;

    @doc("Delete a framework vendor")
    @delete
    delete(@path id: int64): void;
  }

  // ========================================================================
  // Framework Category Operations
  // ========================================================================

  @route("/api/v1/framework-categories")
  @tag("Framework Categories")
  interface FrameworkCategories {
    @doc("Get all framework categories")
    @get
    list(...PaginationParameters): PagedResponse<FrameworkCategory>;

    @doc("Get a framework category by ID")
    @get
    get(@path id: int64): FrameworkCategory;

    @doc("Create a new framework category")
    @post
    create(@body category: FrameworkCategoryCreate): FrameworkCategory;

    @doc("Update a framework category")
    @put
    update(@path id: int64, @body category: FrameworkCategoryUpdate): FrameworkCategory;

    @doc("Delete a framework category")
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
    list(...PaginationParameters): PagedResponse<FrameworkLanguage>;

    @doc("Get a framework language by ID")
    @get
    get(@path id: int64): FrameworkLanguage;

    @doc("Create a new framework language")
    @post
    create(@body language: FrameworkLanguageCreate): FrameworkLanguage;

    @doc("Update a framework language")
    @put
    update(@path id: int64, @body language: FrameworkLanguageUpdate): FrameworkLanguage;

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

  // Framework Vendor CRUD models
  model FrameworkVendorCreate {
    name: string;
    description?: string;
    url?: string;
    activeFlag?: boolean;
  }

  model FrameworkVendorUpdate {
    name: string;
    description?: string;
    url?: string;
    activeFlag?: boolean;
  }

  // Framework Category CRUD models
  model FrameworkCategoryCreate {
    name: string;
    activeFlag?: boolean;
  }

  model FrameworkCategoryUpdate {
    name: string;
    activeFlag?: boolean;
  }

  // Framework Language CRUD models
  model FrameworkLanguageCreate {
    name: string;
    description?: string;
    url?: string;
    currentVersion?: string;
    ltsVersion?: string;
    activeFlag?: boolean;
  }

  model FrameworkLanguageUpdate {
    name: string;
    description?: string;
    url?: string;
    currentVersion?: string;
    ltsVersion?: string;
    activeFlag?: boolean;
  }

}
