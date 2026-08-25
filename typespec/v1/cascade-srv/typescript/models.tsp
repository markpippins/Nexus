/**
 * cascade-srv — TypeSpec Models
 */
namespace org.nexus.cascadesrv {

  model CascadeEvent {
    id: string;
    eventType: string;
    sourceService: string;
    sourceId?: string;
    payload?: unknown;
    correlationId?: string;
    parentEventId?: string;
    createdAt: string;
  }

  model EventLineage {
    event: CascadeEvent;
    parent?: CascadeEvent;
    children: CascadeEvent[];
  }

  model Subscriber {
    id: string;
    pattern: string;
    role?: string;
    channel?: string;
    status?: string;
    lastRunAt?: string;
    nextRunAfter?: string;
    config?: unknown;
    createdAt?: string;
  }

  model ErrorDetail {
    error: string;
  }

  model HealthResponse {
    status: string;
    timestamp: string;
  }
}