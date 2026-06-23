// Tackle MCP — AI Configuration Registry types

export interface AIProviderRow {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "google" | "ollama" | "opencode" | "codex" | "spring_ai" | "lm_server" | "custom";
  endpoint_url: string | null;
  api_key: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface AIHarnessRow {
  id: string;
  name: string;
  invocation_semantics: string;
  created_at: string;
  updated_at: string;
}

export interface AIModelRow {
  id: string;
  name: string;
  harness_id: string;
  provider_id: string | null;
  model_identifier: string;
  created_at: string;
  updated_at: string;
}

export interface AIRoleConfigRow {
  id: string;
  role: string;
  provider_id: string;
  harness_id: string;
  model_id: string;
  extra_params: string;
  created_at: string;
  updated_at: string;
}

export interface AIRoleModelRow {
  id: string;
  role: string;
  model_id: string;
  priority: number;
  provider_id: string | null;
  harness_id: string | null;
}

export interface AIConfigSnapshot {
  providers: AIProviderRow[];
  harnesses: AIHarnessRow[];
  models: AIModelRow[];
  roles: AIRoleConfigRow[];
}

export interface ConfigValidationWarning {
  role: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}
