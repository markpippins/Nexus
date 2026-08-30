/**
 * W4.06 — Contract admission hardening (fail-closed promotion gate).
 *
 * A single admission surface for contract artifact sets ahead of the
 * Wave 4 promotion ladder (advisory → narrowly blocking). Admission is
 * fail-closed: an artifact set is admitted only when
 *
 *   1. every required artifact (typespec / jsonld / cue) carries a valid
 *      sha256 digest,
 *   2. every required framing dimension is present with a non-empty value,
 *   3. the contract version is strictly greater than any previously
 *      admitted version (monotonicity), and
 *   4. a digest is never rewritten at the same version (immutability).
 *
 * Resolution grammar ownership is untouched — this module only validates
 * artifact identity and framing completeness; it never parses or
 * rewrites grammar content.
 */

export type ContractArtifactKind = "typespec" | "jsonld" | "cue";

export interface ContractArtifact {
  kind: ContractArtifactKind;
  digest: string;
}

export interface ContractAdmissionRequest {
  contractId: string;
  version: number;
  artifacts: ContractArtifact[];
  framingDimensions: Record<string, string>;
}

export interface ContractAdmissionResult {
  status: "admitted" | "refused";
  reason?: string;
  contractId?: string;
  version?: number;
}

export const REQUIRED_ARTIFACT_KINDS: readonly ContractArtifactKind[] = ["typespec", "jsonld", "cue"];

export function isValidSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

export class ContractAdmissionRegistry {
  /** contractId → highest admitted version */
  private readonly versions = new Map<string, number>();
  /** `${contractId}@${version}` → digest by kind (immutability check) */
  private readonly digests = new Map<string, Map<ContractArtifactKind, string>>();

  constructor(private readonly requiredDimensions: readonly string[]) {
    if (!requiredDimensions || requiredDimensions.length === 0) {
      throw new Error("admission_requires_framing_dimensions");
    }
  }

  admit(request: ContractAdmissionRequest): ContractAdmissionResult {
    // 1. Identity present.
    if (!request.contractId || !Number.isInteger(request.version) || request.version < 1) {
      return { status: "refused", reason: "invalid_contract_identity" };
    }
    // 2. Every required artifact kind present with a valid digest.
    const byKind = new Map<ContractArtifactKind, ContractArtifact>();
    for (const artifact of request.artifacts) {
      if (byKind.has(artifact.kind)) {
        return { status: "refused", reason: `duplicate_artifact:${artifact.kind}` };
      }
      byKind.set(artifact.kind, artifact);
    }
    for (const kind of REQUIRED_ARTIFACT_KINDS) {
      const artifact = byKind.get(kind);
      if (!artifact) {
        return { status: "refused", reason: `missing_artifact:${kind}` };
      }
      if (!isValidSha256Digest(artifact.digest)) {
        return { status: "refused", reason: `invalid_digest:${kind}` };
      }
    }
    // 3. Required framing dimensions present and non-empty.
    for (const dimension of this.requiredDimensions) {
      const value = request.framingDimensions[dimension];
      if (typeof value !== "string" || value.trim() === "") {
        return { status: "refused", reason: `missing_framing_dimension:${dimension}` };
      }
    }
    // 4. Version monotonicity.
    const prior = this.versions.get(request.contractId);
    if (prior !== undefined && request.version <= prior) {
      return { status: "refused", reason: `version_not_monotonic:${request.version}<=${prior}` };
    }
    // 5. Digest immutability at a given version.
    const versionKey = `${request.contractId}@${request.version}`;
    const priorDigests = this.digests.get(versionKey);
    if (priorDigests) {
      for (const kind of REQUIRED_ARTIFACT_KINDS) {
        const priorDigest = priorDigests.get(kind);
        if (priorDigest && priorDigest !== byKind.get(kind)!.digest) {
          return { status: "refused", reason: `digest_rewrite:${kind}@v${request.version}` };
        }
      }
    }
    // Commit.
    this.versions.set(request.contractId, request.version);
    this.digests.set(
      versionKey,
      new Map(REQUIRED_ARTIFACT_KINDS.map((kind) => [kind, byKind.get(kind)!.digest] as const)),
    );
    return { status: "admitted", contractId: request.contractId, version: request.version };
  }
}
