import crypto from 'node:crypto';

export interface PebTransaction {
  id: string;
  idempotencyKey: string;
  entityId: string;
  toolName: string;
  input: any;
}

export interface PebStateResponse {
  peb_state_hash: string;
  document_hashes: Record<string, string>;
  last_decision_hash: string;
  thought_context_hash: string;
  cognitive_mode: string;
}

const PEB_URL = process.env.PEB_KERNEL_URL || 'http://localhost:8080/api/v1/peb';

/**
 * PebApiClient handles the communication with the Spring Boot PEB Kernel.
 * Every tool facade invokes `submitTransaction` to enforce admission rules.
 */
export class PebApiClient {
  
  /**
   * Submits a transaction to the PEB Governance Engine.
   *
   * The kernel's {@code AdmissionControllerFacade} returns a
   * {@code ResponseEntity<String>} on success (e.g. `"Mutation processed"`,
   * `"Violation recorded as REJECTED"`); the body is plain text, not JSON.
   * Earlier versions of this client called {@code response.json()} on the
   * success path, which threw on every text body and surfaced a spurious
   * {@code {error:true,admission_result:"error",...}} object even when the
   * call had succeeded server-side. We now read the body as text on the
   * happy path, trimmed, and let callers decide how to surface it.
   */
  static async submitTransaction(
    entityId: string,
    toolName: string,
    input: any
  ): Promise<any> {
    const transaction: PebTransaction = {
      id: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      entityId,
      toolName,
      input
    };

    try {
      const response = await fetch(`${PEB_URL}/transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/plain'
        },
        body: JSON.stringify(transaction)
      });

      if (!response.ok) {
        let errorBody = await response.text();
        throw new Error(`PEB Kernel Error [${response.status}]: ${errorBody}`);
      }

      return (await response.text()).trim();
    } catch (err) {
      if (err instanceof Error) {
        // Normalize connection refused for better tool facade output
        if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
           return {
             error: true,
             admission_result: 'rejected',
             message: 'PEB Kernel is currently offline. Admission denied by default.'
           };
        }
        return {
          error: true,
          admission_result: 'error',
          message: err.message
        };
      }
      throw err;
    }
  }

  /**
   * Reads a resource directly (no transaction required for pure reads).
   */
  static async getResource(path: string): Promise<any> {
    try {
      const response = await fetch(`${PEB_URL}/state/${path}`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`PEB Resource Error [${response.status}]: Resource ${path} not found or inaccessible`);
      }
      return await response.json();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
           return {
             error: true,
             message: 'PEB Kernel is offline.'
           };
        }
      }
      throw err;
    }
  }
}
