package org.nexus.peb.domain.port;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Port for communicating with the Vision/LOSM-IR transition system.
 * 
 * Vision-srv (port 3103/3104) and LOSM-host (Python FastAPI, port 8003)
 * provide the work request orchestration layer. LOSM-IR validates state
 * transitions against the lifecycle state machine.
 * 
 * This port defines the operations peb-kernel needs from LOSM:
 * - Transitioning work requests through lifecycle states
 * - Querying work request status
 */
public interface LosmIrTransitionPort {

    /**
     * Transition a work request to a new state.
     * 
     * Validates the transition against LOSM-IR's state machine rules
     * (NEW -> INTAKE -> PLAN_GENERATION -> PLAN_REVIEW -> ... -> COMPLETION).
     * 
     * @param wrId the work request ID
     * @param toState the target state (e.g., "INTAKE", "PLAN_GENERATION")
     * @param actor the entity performing the transition
     * @param reason human-readable reason for the transition
     * @return the transition result with validation status
     */
    JsonNode transition(String wrId, String toState, String actor, String reason);

    /**
     * Get the current state of a work request from LOSM.
     * 
     * @param wrId the work request ID
     * @return the work request state
     */
    JsonNode getWorkRequest(String wrId);

    /**
     * Orchestrate a work request (kick off the next lifecycle step).
     * 
     * @param wrId the work request ID
     * @return the orchestration result
     */
    JsonNode orchestrate(String wrId);
}
