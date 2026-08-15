/**
 * vision-srv — TypeSpec Models
 *
 * Reverse-engineered from python/vision-srv/src/vision_srv (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.visionsrv {

  /** A work request. */
  model WorkRequestResponse {
    wrId: string;
    state?: string;
    spec?: Record<unknown>;
  }

  /** A branch. */
  model BranchResponse {
    branchId: string;
    wrId?: string;
    state?: string;
  }

  /** An artifact. */
  model ArtifactResponse {
    artifactId: string;
    wrId?: string;
    kind?: string;
  }
}
