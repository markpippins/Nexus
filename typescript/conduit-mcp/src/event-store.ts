export const LEDGER_EVENT_TYPES = [
  "WORKREQUEST.CREATED",
  "VISION.IR_PRODUCED",
  "STATE.TRANSITION_PROPOSED",
  "STATE.TRANSITION_APPROVED",
  "STATE.TRANSITION_COMMITTED",
  "EXECUTION.STARTED",
  "EXECUTION.COMPLETED",
  "EXECUTION.FAILED",
  "SYSTEM.CRON_TRIGGERED",
] as const;

export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

export const WORK_REQUEST_STATES = [
  "PROPOSED",
  "PLANNING",
  "PENDING",
  "IMPLEMENTING",
  "REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type WorkRequestLedgerState = (typeof WORK_REQUEST_STATES)[number];

export const VISION_IR_STAGES = [
  "PLAN_IR",
  "SPEC_IR",
  "EXECUTION_IR",
  "VALIDATION_IR",
] as const;

export type VisionIRStage = (typeof VISION_IR_STAGES)[number];

export const TRANSITION_MATRIX: Record<WorkRequestLedgerState, WorkRequestLedgerState[]> = {
  PROPOSED: ["PLANNING", "CANCELLED"],
  PLANNING: ["PENDING", "CANCELLED"],
  PENDING: ["IMPLEMENTING", "CANCELLED"],
  IMPLEMENTING: ["REVIEW", "FAILED", "CANCELLED"],
  REVIEW: ["COMPLETED", "IMPLEMENTING", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const TERMINAL_STATES: WorkRequestLedgerState[] = ["COMPLETED", "FAILED", "CANCELLED"];

export function isTerminalState(state: WorkRequestLedgerState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function validateLedgerTransition(
  from: WorkRequestLedgerState,
  to: WorkRequestLedgerState,
): boolean {
  const allowed = TRANSITION_MATRIX[from];
  if (!allowed || allowed.length === 0) return false;
  return allowed.includes(to);
}

export interface LedgerEvent {
  eventId: string;
  workRequestId: string;
  eventType: LedgerEventType;
  eventVersion: number;
  correlationId?: string;
  causationId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  actorType: string;
  actorId: string;
  sequenceNumber: number;
}

export interface LedgerState {
  workRequestId: string;
  currentState: WorkRequestLedgerState;
  visionStage: VisionIRStage | null;
  visionIrVersion: number;
  lastEventId: string | null;
  version: number;
}

export function createInitialLedgerState(workRequestId: string): LedgerState {
  return {
    workRequestId,
    currentState: "PROPOSED",
    visionStage: null,
    visionIrVersion: 0,
    lastEventId: null,
    version: 0,
  };
}

export function reduceLedgerEvent(state: LedgerState, event: LedgerEvent): LedgerState {
  const next: LedgerState = {
    ...state,
    lastEventId: event.eventId,
    version: state.version + 1,
  };

  if (event.eventType === "WORKREQUEST.CREATED") {
    next.currentState = "PROPOSED";
  }

  if (event.eventType === "STATE.TRANSITION_COMMITTED") {
    const newState = event.payload.new_state as WorkRequestLedgerState | undefined;
    if (newState && WORK_REQUEST_STATES.includes(newState)) {
      next.currentState = newState;
    }
  }

  if (event.eventType === "VISION.IR_PRODUCED") {
    const stage = event.payload.ir_stage as VisionIRStage | undefined;
    const version = event.payload.ir_version as number | undefined;
    if (stage && VISION_IR_STAGES.includes(stage)) {
      next.visionStage = stage;
    }
    if (typeof version === "number") {
      next.visionIrVersion = version;
    }
  }

  return next;
}

export function foldLedgerEvents(workRequestId: string, events: LedgerEvent[]): LedgerState {
  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const initial = createInitialLedgerState(workRequestId);
  return sorted.reduce((state, event) => reduceLedgerEvent(state, event), initial);
}
