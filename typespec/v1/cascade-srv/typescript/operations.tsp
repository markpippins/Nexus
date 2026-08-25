/**
 * cascade-srv — TypeSpec Operations
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.cascadesrv {

  @route("/health") @get op health(): HealthResponse;

  // ── Events ────────────────────────────────────────────────────
  @route("/events")            @get op listEvents(): { items: CascadeEvent[] };
  @route("/events/{id}")       @get op getEvent(@path id: string): CascadeEvent | ErrorDetail;
  @route("/events/{id}/lineage") @get op eventLineage(@path id: string): EventLineage | ErrorDetail;
  @route("/events/{id}/children") @get op eventChildren(@path id: string): { items: CascadeEvent[] };

  // ── Subscribers ───────────────────────────────────────────────
  @route("/subscribers")              @get  op listSubscribers(): { items: Subscriber[] };
  @route("/subscribers/{pattern}")    @get  op getSubscriber(@path pattern: string): Subscriber | ErrorDetail;
  @route("/subscribers/{pattern}")    @patch op updateSubscriber(@path pattern: string, @body body: Subscriber): Subscriber;
}