/**
 * tackle-registry — TypeSpec Models
 *
 * Covers the JVM Spring service `jvm/spring/service-broker/tackle-registry-service`
 * (renamed from losm-host-service, D-2026-08-23-C). This is the v1 contract for
 * the IMPLEMENTED surface only: registry reads, role resolution, and HTTP
 * inference. Write operations and tackle-srv's other routers are future scope
 * and deliberately absent here.
 *
 * Wire-shape notes (documented divergences from tackle-srv's de facto API,
 * tracked under D-C step 2):
 *  - Paths are /config/* here; tackle-srv mounts at /config/ai/*. A
 *    compatibility alias is planned but NOT part of this v1 contract.
 *  - Response payloads are camelCase (Jackson records). tackle-srv returns
 *    raw snake_case rows. Consumers must not assume the two are interchangeable.
 *  - Errors are {"error": "<message>"} with mapped status codes
 *    (400/404/415/502); tackle-srv uses {error:{code,message,details,requestId}}.
 */
namespace org.nexus.tackleregistry {

  /** An AI provider registered in the tackle schema. */
  model Provider {
    id: string;
    name: string;
    /** Controlled vocabulary incl. openai|anthropic|google|ollama|opencode|codex|spring_ai|lm_server|custom */
    type: string;
    endpointUrl?: string;
    apiKey?: string;
    configJson: Record<unknown>;
  }

  /** An invocation harness (CLI/HTTP wrapper description). */
  model Harness {
    id: string;
    name: string;
    invocationSemantics: Record<unknown>;
  }

  /** A model row joined to its harness/provider. */
  model ModelRow {
    id: string;
    name: string;
    harnessId: string;
    providerId?: string;
    modelIdentifier: string;
    verified: boolean;
  }

  /** A governance role entry. */
  model RoleRow {
    id: string;
    name: string;
    description: string;
  }

  /** A priority-ordered configuration bundle binding a role to a model. */
  model ConfigBundle {
    id: string;
    name: string;
    role: string;
    modelId: string;
    providerId?: string;
    harnessId?: string;
    priority: int32;
    invocationMode: string;
    command?: string;
    endpointUrl?: string;
    timeoutMs?: int32;
    isActive?: boolean;
  }

  /** Winning bundle resolution — mirrors tackle-srv getResolvedRoleConfig. */
  model ResolvedFallback {
    priority: int32;
    modelIdentifier: string;
    providerType: string;
    providerName: string;
  }

  model ResolvedRoleConfig {
    role: string;
    modelIdentifier: string;
    providerId: string;
    providerName: string;
    providerType: string;
    apiKey?: string;
    endpointUrl?: string;
    harnessName: string;
    fallbacks: ResolvedFallback[];
  }

  /** Request body for POST /ai/invoke. Field names accept snake_case on the wire. */
  model InvokeRequest {
    /** Role-resolved mode: resolve active bundle via /config/resolve/{role}. */
    role?: string;
    /** Direct mode fields. */
    providerType?: string;
    endpointUrl?: string;
    apiKey?: string;
    modelIdentifier?: string;
    prompt: string;
  }

  model InvokeResponse {
    reply: string;
  }

  model ErrorResponse {
    error: string;
  }

  model PingResponse {
    service: string;
    status: string;
    modelsAvailable: int32;
  }

  model HelloResponse {
    reply: string;
    model?: string;
  }

  model ModelsResponse {
    count: int32;
    models: string[];
  }

  model CapabilitiesResponse {
    httpInvocable: string[];
    note: string;
  }
}
