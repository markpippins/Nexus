export type ThemeMode = 'steel' | 'dark' | 'light';

export interface Provider {
  id: string;
  name: string;
  type: 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'vllm' | 'bedrock' | 'huggingface' | 'custom';
  endpoint_url?: string;
  api_key?: string;
  config_json?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Harness {
  id: string;
  name: string;
  invocation_semantics?: {
    supports_streaming?: boolean;
    supports_function_calling?: boolean;
    supports_vision?: boolean;
    timeout_default_ms?: number;
    max_tokens_limit?: number;
    protocol?: string;
    extra_headers?: Record<string, string>;
  };
  created_at?: string;
  updated_at?: string;
}

export interface AIModel {
  id: string;
  name: string;
  harness_id: string;
  provider_id?: string;
  model_identifier: string; // e.g. gemini-3.6-flash, gpt-4o, claude-3-7-sonnet
  created_at?: string;
  updated_at?: string;
}

export interface ConfigBundle {
  id: string;
  name: string;
  role: string;
  model_id: string;
  provider_id?: string;
  harness_id?: string;
  priority: number; // lower number = higher priority
  invocation_mode: 'direct' | 'stream' | 'batch' | 'fallback';
  command?: string;
  endpoint_url?: string;
  timeout_ms?: number;
  valid_from?: string;
  valid_to?: string;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface RoleConfig {
  id: string;
  role: string;
  provider_id: string;
  harness_id: string;
  model_id: string;
  extra_params?: Record<string, any>;
  bundles?: ConfigBundle[];
  created_at?: string;
  updated_at?: string;
}

export interface SystemRole {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PromptTemplate {
  id: string;
  role: string;
  slug: string;
  version: number;
  title: string;
  body_md: string;
  parameter_schema?: Record<string, any>;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface TaskDefinition {
  id: string;
  role: string;
  task_slug: string;
  scope: string;
  acceptance_criteria: string[];
  prompt_id: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InspectorTaskDispatch {
  id: string;
  role: string;
  task_slug: string;
  scope: string;
  acceptance_criteria: string[];
  prompt_id: string;
  active: boolean;
  prompt_role: string;
  prompt_slug: string;
  prompt_version: number;
  prompt_body_md: string;
  prompt_title: string;
  prompt_parameter_schema?: Record<string, any>;
  prompt_tags?: string[];
}

export interface ProcedureCard {
  role: string;
  slug: string;
  title: string;
  category: string;
  steps: string[];
  recovery_action?: string;
  as_of_dt: string;
  prerequisites?: string[];
  owner?: string;
}

export interface FailureRecoveryConfig {
  max_retries_per_model: number;
  retry_delay_seconds: number;
  max_fallbacks: number;
  push_back_to_pending: boolean;
  circuit_breaker_retry_after: number;
}

export interface AgentScheduleEntry {
  id: string;
  role: string;
  model_id?: string;
  harness?: string;
  agent_config?: Record<string, any>;
  schedule_type: 'cron' | 'interval' | 'manual';
  schedule_value: string; // e.g., '0 */2 * * *' or '15m'
  project_dir?: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at?: string;
}

export interface SessionLedgerEntry {
  sessionId: string;
  agent_role: string;
  model_id: string;
  status: 'running' | 'completed' | 'failed' | 'killed';
  pid?: number;
  started_at: string;
  ended_at?: string;
  latency_ms?: number;
  tokens_used?: { input: number; output: number };
  error?: string;
  logs?: string[];
}

export type SessionLedger = SessionLedgerEntry;

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: 'API_ROUTER' | 'CIRCUIT_BREAKER' | 'RESOLVER' | 'GEMINI_PROXY' | 'SCHEDULER' | 'MEMORY_CACHE' | 'SESSION_DRIVER' | 'SYSTEM';
  message: string;
  source?: string;
  details?: Record<string, any> | string;
}

export interface AISnapshot {
  providers: Provider[];
  harnesses: Harness[];
  models: AIModel[];
  roles: RoleConfig[];
  bundles: ConfigBundle[];
}

export interface ValidationWarning {
  role: string;
  field?: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
}

export interface ValidationReport {
  valid: boolean;
  warnings: ValidationWarning[];
  errors?: string[];
  check_timestamp?: string;
}

export interface SystemMetricPoint {
  timestamp: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  active_requests: number;
  latency_avg_ms: number;
}

export interface SystemHealthStatus {
  status: 'ok' | 'degraded' | 'error';
  port: number;
  pid: number;
  timestamp: string;
  uptime_seconds: number;
  cpu: {
    usage_percent: number;
    cores: number;
    load_average: number[];
  };
  memory: {
    used_mb: number;
    total_mb: number;
    usage_percent: number;
    free_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
  };
  history: SystemMetricPoint[];
}
