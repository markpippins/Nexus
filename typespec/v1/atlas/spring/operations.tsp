/**
 * Atlas Graph View Operations
 *
 * CRUD for graph views via GraphViewController
 * (com.aibizarchitect.nexus.v1.spring.atlas.controller). List is paginated
 * and returns a plain array (repository.findAll(pageable).getContent()).
 */
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../../core/main.tsp";
import "./models.tsp";

using Http;
using Rest;

namespace com.aibizarchitect.nexus.v1.spring.atlas {

  /** Pagination parameters for list operations */
  model PaginationParameters {
    @query page?: int32 = 0;
    @query size?: int32 = 200;
    @query sort?: string;
  }

  @route("/api/v1/graph-views")
  @tag("Graph Views")
  interface GraphViews {
    @doc("List all graph views (positions/connections lazy — loaded on demand)")
    @get list(...PaginationParameters): GraphView[];

    @doc("Get a single graph view with positions and connections loaded")
    @get get(@path id: int64): GraphView;

    @doc("Create a graph view with optional positions and connections")
    @post create(@body resource: GraphView): GraphView;

    @doc("Update a graph view (replaces positions/connections when provided)")
    @put update(@path id: int64, @body resource: GraphView): GraphView;

    @doc("Delete a graph view (cascades to positions)")
    @delete delete(@path id: int64): void;

    @doc("Set a graph view as the default (clears other defaults first)")
    @put
    @route("/{id}/set-default")
    setDefault(@path id: int64): GraphView;
  }
}
