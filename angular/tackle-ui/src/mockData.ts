import {
  Provider,
  Harness,
  AIModel,
  SystemRole,
  RoleConfig,
  ConfigBundle,
  PromptTemplate,
  TaskDefinition,
  ProcedureCard,
  FailureRecoveryConfig,
  AgentScheduleEntry,
  SessionLedgerEntry,
  SystemLogEntry
} from './types';

export const INITIAL_PROVIDERS: Provider[] = [
  {
    id: 'prov-google-gemini',
    name: 'Google Gemini (Native)',
    type: 'gemini',
    endpoint_url: 'https://generativelanguage.googleapis.com',
    api_key: 'sk-gemini-********-prod-01',
    config_json: {
      temperature: 0.7,
      topP: 0.95,
      thinkingLevel: 'HIGH',
      user_agent: 'aistudio-build'
    },
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'prov-openai-primary',
    name: 'OpenAI Direct API',
    type: 'openai',
    endpoint_url: 'https://api.openai.com/v1',
    api_key: 'sk-proj-********-prod-02',
    config_json: {
      organization: 'org-tackle-infra',
      max_retries: 3
    },
    created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'prov-anthropic-cloud',
    name: 'Anthropic Cloud',
    type: 'anthropic',
    endpoint_url: 'https://api.anthropic.com',
    api_key: 'sk-ant-api03-********-03',
    config_json: {
      anthropic_version: '2023-06-01',
      max_tokens_default: 4096
    },
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'prov-ollama-cluster',
    name: 'Ollama Internal Cluster',
    type: 'ollama',
    endpoint_url: 'http://10.240.12.80:11434',
    config_json: {
      keep_alive: '10m',
      num_ctx: 16384
    },
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'prov-vllm-gpu-farm',
    name: 'vLLM GPU Farm',
    type: 'vllm',
    endpoint_url: 'http://vllm-node-01.nexus.internal:8000/v1',
    config_json: {
      gpu_memory_utilization: 0.9,
      tensor_parallel_size: 2
    },
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const INITIAL_HARNESSES: Harness[] = [
  {
    id: 'harn-gemini-driver',
    name: 'Gemini Driver (Native SDK)',
    invocation_semantics: {
      supports_streaming: true,
      supports_function_calling: true,
      supports_vision: true,
      timeout_default_ms: 30000,
      max_tokens_limit: 8192,
      protocol: 'HTTPS REST + gRPC',
      extra_headers: { 'X-Tackle-Harness': 'Gemini-Native-v2' }
    },
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'harn-openai-direct',
    name: 'OpenAI Direct Harness',
    invocation_semantics: {
      supports_streaming: true,
      supports_function_calling: true,
      supports_vision: true,
      timeout_default_ms: 45000,
      max_tokens_limit: 16384,
      protocol: 'HTTP REST'
    },
    created_at: new Date(Date.now() - 86400000 * 25).toISOString()
  },
  {
    id: 'harn-anthropic-sdk',
    name: 'Anthropic Messages Harness',
    invocation_semantics: {
      supports_streaming: true,
      supports_function_calling: true,
      supports_vision: true,
      timeout_default_ms: 60000,
      max_tokens_limit: 8192,
      protocol: 'HTTPS REST'
    },
    created_at: new Date(Date.now() - 86400000 * 20).toISOString()
  },
  {
    id: 'harn-vllm-openai-compat',
    name: 'vLLM OpenAI-Compatible Bridge',
    invocation_semantics: {
      supports_streaming: true,
      supports_function_calling: false,
      supports_vision: false,
      timeout_default_ms: 120000,
      max_tokens_limit: 32768,
      protocol: 'HTTP OpenAI API'
    },
    created_at: new Date(Date.now() - 86400000 * 10).toISOString()
  }
];

export const INITIAL_MODELS: AIModel[] = [
  {
    id: 'mod-gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    harness_id: 'harn-gemini-driver',
    provider_id: 'prov-google-gemini',
    model_identifier: 'gemini-3.6-flash',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'mod-gemini-3.1-pro',
    name: 'Gemini 3.1 Pro Preview',
    harness_id: 'harn-gemini-driver',
    provider_id: 'prov-google-gemini',
    model_identifier: 'gemini-3.1-pro-preview',
    created_at: new Date(Date.now() - 86400000 * 25).toISOString()
  },
  {
    id: 'mod-gpt-4o',
    name: 'GPT-4o Omnimodal',
    harness_id: 'harn-openai-direct',
    provider_id: 'prov-openai-primary',
    model_identifier: 'gpt-4o',
    created_at: new Date(Date.now() - 86400000 * 20).toISOString()
  },
  {
    id: 'mod-claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    harness_id: 'harn-anthropic-sdk',
    provider_id: 'prov-anthropic-cloud',
    model_identifier: 'claude-3-7-sonnet-20250219',
    created_at: new Date(Date.now() - 86400000 * 15).toISOString()
  },
  {
    id: 'mod-llama-3-3-70b',
    name: 'Llama 3.3 70B Instruct',
    harness_id: 'harn-vllm-openai-compat',
    provider_id: 'prov-vllm-gpu-farm',
    model_identifier: 'meta-llama/Llama-3.3-70B-Instruct',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: 'mod-deepseek-r1-vllm',
    name: 'DeepSeek R1 Reasoning',
    harness_id: 'harn-vllm-openai-compat',
    provider_id: 'prov-vllm-gpu-farm',
    model_identifier: 'deepseek-ai/DeepSeek-R1',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

export const INITIAL_SYSTEM_ROLES: SystemRole[] = [
  {
    id: 'role-operator',
    name: 'operator',
    description: 'System orchestrator managing turn dispatch, route planning, and human operator communication.',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'role-engineer',
    name: 'engineer',
    description: 'Autonomous coding, refactoring, code execution, and architectural debugging agent.',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'role-inspector',
    name: 'inspector',
    description: 'System verification, schema auditing, compliance checker, and quality acceptance tester.',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'role-builder-fallback',
    name: 'builder-fallback',
    description: 'High-resilience fallback role for builds when primary models fail circuit breaker thresholds.',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'role-analyst',
    name: 'analyst',
    description: 'Data analytics, log aggregation, and system telemetry summarization agent.',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString()
  }
];

export const INITIAL_ROLE_CONFIGS: RoleConfig[] = [
  {
    id: 'rc-operator',
    role: 'operator',
    provider_id: 'prov-google-gemini',
    harness_id: 'harn-gemini-driver',
    model_id: 'mod-gemini-3.6-flash',
    extra_params: { max_turn_tokens: 4096, stream: true }
  },
  {
    id: 'rc-engineer',
    role: 'engineer',
    provider_id: 'prov-google-gemini',
    harness_id: 'harn-gemini-driver',
    model_id: 'mod-gemini-3.1-pro',
    extra_params: { thinking_level: 'HIGH', code_execution: true }
  },
  {
    id: 'rc-inspector',
    role: 'inspector',
    provider_id: 'prov-anthropic-cloud',
    harness_id: 'harn-anthropic-sdk',
    model_id: 'mod-claude-3-7-sonnet',
    extra_params: { strict_json: true }
  },
  {
    id: 'rc-builder-fallback',
    role: 'builder-fallback',
    provider_id: 'prov-vllm-gpu-farm',
    harness_id: 'harn-vllm-openai-compat',
    model_id: 'mod-llama-3-3-70b',
    extra_params: { max_retries: 5 }
  }
];

export const INITIAL_BUNDLES: ConfigBundle[] = [
  {
    id: 'bundle-op-01',
    name: 'Operator Primary Flash Bundle',
    role: 'operator',
    model_id: 'mod-gemini-3.6-flash',
    provider_id: 'prov-google-gemini',
    harness_id: 'harn-gemini-driver',
    priority: 1,
    invocation_mode: 'stream',
    timeout_ms: 15000,
    is_active: true,
    metadata: { environment: 'production', tier: 'primary' },
    created_at: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: 'bundle-op-02',
    name: 'Operator Secondary GPT-4o Fallback',
    role: 'operator',
    model_id: 'mod-gpt-4o',
    provider_id: 'prov-openai-primary',
    harness_id: 'harn-openai-direct',
    priority: 2,
    invocation_mode: 'fallback',
    timeout_ms: 25000,
    is_active: true,
    metadata: { tier: 'secondary' },
    created_at: new Date(Date.now() - 86400000 * 8).toISOString()
  },
  {
    id: 'bundle-eng-01',
    name: 'Engineer Gemini Pro Reasoning Bundle',
    role: 'engineer',
    model_id: 'mod-gemini-3.1-pro',
    provider_id: 'prov-google-gemini',
    harness_id: 'harn-gemini-driver',
    priority: 1,
    invocation_mode: 'direct',
    timeout_ms: 60000,
    is_active: true,
    metadata: { reasoning: 'enabled', sandbox_access: true },
    created_at: new Date(Date.now() - 86400000 * 12).toISOString()
  },
  {
    id: 'bundle-eng-02',
    name: 'Engineer DeepSeek R1 Local Cluster',
    role: 'engineer',
    model_id: 'mod-deepseek-r1-vllm',
    provider_id: 'prov-vllm-gpu-farm',
    harness_id: 'harn-vllm-openai-compat',
    priority: 2,
    invocation_mode: 'fallback',
    timeout_ms: 90000,
    is_active: true,
    metadata: { local_gpu: true },
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    id: 'bundle-insp-01',
    name: 'Inspector Claude Sonnet Audit Bundle',
    role: 'inspector',
    model_id: 'mod-claude-3-7-sonnet',
    provider_id: 'prov-anthropic-cloud',
    harness_id: 'harn-anthropic-sdk',
    priority: 1,
    invocation_mode: 'stream',
    timeout_ms: 30000,
    is_active: true,
    metadata: { validation_level: 'strict' },
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'bundle-fb-01',
    name: 'Builder Fallback Llama-70B Local Bundle',
    role: 'builder-fallback',
    model_id: 'mod-llama-3-3-70b',
    provider_id: 'prov-vllm-gpu-farm',
    harness_id: 'harn-vllm-openai-compat',
    priority: 1,
    invocation_mode: 'direct',
    timeout_ms: 45000,
    is_active: true,
    metadata: { resilience_mode: true },
    created_at: new Date(Date.now() - 86400000 * 14).toISOString()
  }
];

export const INITIAL_PROMPTS: PromptTemplate[] = [
  {
    id: 'p-op-base',
    role: 'operator',
    slug: 'opencode-persona',
    version: 2,
    title: 'Operator Base System Prompt',
    body_md: `# Operator Role Instructions (v2)

You are the central **Operator** agent for the Tackle AI orchestration engine.

## Core Directives
1. Triaging incoming turn requests to the optimal agent role (\`engineer\`, \`inspector\`, or \`analyst\`).
2. Maintaining system ledger continuity across user session turns.
3. Formulating concise, actionable plans before executing multi-step tasks.
4. Monitoring circuit-breaker pushbacks and routing gracefully to fallback models.`,
    parameter_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Active session UUID' },
        user_intent: { type: 'string', description: 'Parsed turn intent' }
      }
    },
    tags: ['operator', 'system-prompt', 'canonical'],
    created_at: new Date(Date.now() - 86400000 * 20).toISOString()
  },
  {
    id: 'p-eng-base',
    role: 'engineer',
    slug: 'opencode-persona',
    version: 2,
    title: 'Engineer Persona Prompt',
    body_md: `# Engineer System Prompt (v2)

You are the **Engineer** agent specializing in code craftsmanship, refactoring, and automated diagnostics.

## Scope & Constraints
- Write type-safe TypeScript / React code with zero lint errors.
- Read files before editing (\`view_file\` rule).
- Never introduce breaking API contract changes without updating specifications.`,
    parameter_schema: {
      type: 'object',
      properties: {
        target_file: { type: 'string' },
        refactor_goal: { type: 'string' }
      }
    },
    tags: ['engineer', 'coding'],
    created_at: new Date(Date.now() - 86400000 * 18).toISOString()
  },
  {
    id: 'p-insp-base',
    role: 'inspector',
    slug: 'schema-compliance-checker',
    version: 1,
    title: 'Inspector Task Template',
    body_md: `# Inspector System Prompt

Evaluate the incoming JSON configuration payload against the Tackle PostgreSQL schema constraints and report validation warnings.`,
    parameter_schema: {
      type: 'object',
      properties: {
        schema_version: { type: 'number' }
      }
    },
    tags: ['inspector', 'audit'],
    created_at: new Date(Date.now() - 86400000 * 15).toISOString()
  }
];

export const INITIAL_TASKS: TaskDefinition[] = [
  {
    id: 'task-insp-01',
    role: 'inspector',
    task_slug: 'verify-ai-bundle-integrity',
    scope: 'Validate priority resolution and active date ranges across active bundles',
    acceptance_criteria: [
      'Each role must have at least one active bundle with priority 1',
      'No overlapping valid_from/valid_to date ranges with identical priority',
      'Model ID exists in models registry'
    ],
    prompt_id: 'p-insp-base',
    active: true,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: 'task-eng-01',
    role: 'engineer',
    task_slug: 'refactor-harness-adapter',
    scope: 'Maintain backward compatibility while introducing gRPC protocol headers',
    acceptance_criteria: [
      'Passes typescript build verification',
      'Responds with <20ms latency overhead'
    ],
    prompt_id: 'p-eng-base',
    active: true,
    created_at: new Date(Date.now() - 86400000 * 8).toISOString()
  }
];

export const INITIAL_PROCEDURES: ProcedureCard[] = [
  {
    role: 'operator',
    slug: 'circuit-breaker-recovery',
    title: 'Circuit Breaker Failover & Fallback Procedure',
    category: 'Resilience',
    steps: [
      'Detect 3 consecutive 5xx or rate-limit HTTP errors from primary model.',
      'Mark primary bundle status as degraded in memory registry.',
      'Automatically promote priority #2 bundle (e.g. GPT-4o or DeepSeek R1).',
      'Log event to session ledger and notify operator dashboard.',
      'Trigger automatic retry health check after circuit_breaker_retry_after window.'
    ],
    recovery_action: 'Invoke POST /config/failure-recovery with updated retry_delay_seconds',
    as_of_dt: new Date().toISOString(),
    prerequisites: ['Active secondary fallback bundle registered for role'],
    owner: 'infra-reliability-team'
  },
  {
    role: 'engineer',
    slug: 'model-migration-protocol',
    title: 'Model Version Upgrade & Zero-Downtime Rollout',
    category: 'Deployment',
    steps: [
      'Register new model in /config/ai/model.',
      'Create new ConfigBundle for target role with priority #2 and is_active=true.',
      'Run test invocation via POST /config/ai/test.',
      'Upon successful response validation, set new bundle priority #1 and adjust valid_from.'
    ],
    recovery_action: 'Roll back priority #1 to previous bundle ID',
    as_of_dt: new Date().toISOString(),
    prerequisites: ['Test prompt verified in sandbox'],
    owner: 'ai-ops'
  }
];

export const INITIAL_FAILURE_RECOVERY: FailureRecoveryConfig = {
  max_retries_per_model: 3,
  retry_delay_seconds: 5,
  max_fallbacks: 2,
  push_back_to_pending: true,
  circuit_breaker_retry_after: 60
};

export const INITIAL_SCHEDULER_ENTRIES: AgentScheduleEntry[] = [
  {
    id: 'sched-01',
    role: 'inspector',
    model_id: 'mod-claude-3-7-sonnet',
    harness: 'harn-anthropic-sdk',
    agent_config: { task_slug: 'verify-ai-bundle-integrity', full_audit: true },
    schedule_type: 'cron',
    schedule_value: '0 */4 * * *',
    project_dir: '/nexus/tackle',
    enabled: true,
    last_run_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    next_run_at: new Date(Date.now() + 3600000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: 'sched-02',
    role: 'operator',
    model_id: 'mod-gemini-3.6-flash',
    harness: 'harn-gemini-driver',
    agent_config: { check_deadlocks: true },
    schedule_type: 'interval',
    schedule_value: '15m',
    project_dir: '/nexus/tackle',
    enabled: true,
    last_run_at: new Date(Date.now() - 60000 * 10).toISOString(),
    next_run_at: new Date(Date.now() + 60000 * 5).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

export const INITIAL_SESSIONS: SessionLedgerEntry[] = [
  {
    sessionId: 'sess-89a1f2-op',
    agent_role: 'operator',
    model_id: 'mod-gemini-3.6-flash',
    status: 'completed',
    pid: 84102,
    started_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    ended_at: new Date(Date.now() - 3600000 * 3 + 1240).toISOString(),
    latency_ms: 1240,
    tokens_used: { input: 840, output: 210 },
    logs: [
      '[14:20:01.102] Init operator session sess-89a1f2-op',
      '[14:20:01.450] Resolved active bundle: bundle-op-01 (Gemini 3.6 Flash)',
      '[14:20:02.342] Generation stream completed. 210 tokens emitted.'
    ]
  },
  {
    sessionId: 'sess-34b791-eng',
    agent_role: 'engineer',
    model_id: 'mod-gemini-3.1-pro',
    status: 'running',
    pid: 84319,
    started_at: new Date(Date.now() - 60000 * 12).toISOString(),
    tokens_used: { input: 1520, output: 480 },
    logs: [
      '[14:40:15.004] Spawning engineer task refactor-harness-adapter',
      '[14:40:15.210] Thinking level: HIGH activated on gemini-3.1-pro-preview',
      '[14:40:18.990] Executing type checking verification pass...'
    ]
  },
  {
    sessionId: 'sess-91c012-insp',
    agent_role: 'inspector',
    model_id: 'mod-claude-3-7-sonnet',
    status: 'failed',
    pid: 83910,
    started_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    ended_at: new Date(Date.now() - 3600000 * 6 + 4500).toISOString(),
    latency_ms: 4500,
    tokens_used: { input: 410, output: 50 },
    error: 'CircuitBreakerError: Timeout exceeding 4500ms on primary endpoint.',
    logs: [
      '[11:15:00.001] Starting automated compliance sweep...',
      '[11:15:04.501] Timeout reached. Triggering circuit breaker fallback.'
    ]
  }
];

export const INITIAL_SYSTEM_LOGS: SystemLogEntry[] = [
  {
    id: 'log-101',
    timestamp: new Date(Date.now() - 60000 * 1).toISOString(),
    level: 'INFO',
    category: 'API_ROUTER',
    message: 'GET /config/ai/resolve/engineer completed (200 OK)',
    source: 'tackle-srv :3410',
    details: { role: 'engineer', latency_ms: 12, resolved_bundle: 'bundle-eng-01', model: 'mod-gemini-3.1-pro' }
  },
  {
    id: 'log-102',
    timestamp: new Date(Date.now() - 60000 * 3).toISOString(),
    level: 'DEBUG',
    category: 'GEMINI_PROXY',
    message: 'Gemini SDK client initialized with proxy header [aistudio-build]',
    source: 'gemini-client',
    details: { model: 'gemini-3.6-flash', thinkingLevel: 'HIGH', endpoint: 'generativelanguage.googleapis.com' }
  },
  {
    id: 'log-103',
    timestamp: new Date(Date.now() - 60000 * 8).toISOString(),
    level: 'WARN',
    category: 'CIRCUIT_BREAKER',
    message: 'Endpoint prov-anthropic-cloud latency spike observed (4200ms)',
    source: 'circuit-monitor',
    details: { provider_id: 'prov-anthropic-cloud', consecutive_failures: 1, max_retries: 3 }
  },
  {
    id: 'log-104',
    timestamp: new Date(Date.now() - 60000 * 15).toISOString(),
    level: 'INFO',
    category: 'SCHEDULER',
    message: 'Cron job sched-02 triggered: operator compliance health check',
    source: 'scheduler-daemon',
    details: { schedule_id: 'sched-02', next_run_in: '15m', agent_role: 'operator' }
  },
  {
    id: 'log-105',
    timestamp: new Date(Date.now() - 60000 * 25).toISOString(),
    level: 'INFO',
    category: 'MEMORY_CACHE',
    message: 'Redis warm cache synchronized for 5 procedure cards',
    source: 'redis-mem :3500',
    details: { roleIndices: ['operator', 'engineer', 'architect', 'inspector'], keys_updated: 5 }
  },
  {
    id: 'log-106',
    timestamp: new Date(Date.now() - 60000 * 42).toISOString(),
    level: 'ERROR',
    category: 'SESSION_DRIVER',
    message: 'Session sess-91c012-insp failed with timeout error',
    source: 'session-runner',
    details: { sessionId: 'sess-91c012-insp', pid: 83910, error: 'CircuitBreakerError: Timeout exceeding 4500ms' }
  },
  {
    id: 'log-107',
    timestamp: new Date(Date.now() - 60000 * 60).toISOString(),
    level: 'INFO',
    category: 'SYSTEM',
    message: 'Tackle Subsystem REST Server booted on port 3410',
    source: 'tackle-srv :3410',
    details: { pid: process.pid || 14820, node_env: 'development', version: '3.4.10' }
  }
];

