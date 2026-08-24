/**
 * Atlas Graph View Models
 *
 * Graph-view persistence entities (registry schema): GraphView,
 * GraphViewPosition, GraphViewConnection. Maps to JVM package
 * com.aibizarchitect.nexus.v1.spring.atlas.entity.
 */

namespace com.aibizarchitect.nexus.v1.spring.atlas {

  /** Direction of a graph edge connection. */
  enum ConnectionDirection {
    OUTBOUND,
    BIDIRECTIONAL,
  }

  /** A node's saved position within a graph view. */
  model GraphViewPosition {
    id?: int64;
    /** Node identifier the position applies to. */
    nodeId: string;
    positionX?: float64 = 0.0;
    positionY?: float64 = 0.0;
    positionZ?: float64 = 0.0;
    label?: string;
    description?: string;
    color?: string;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  /** An edge connection between two nodes within a graph view. */
  model GraphViewConnection {
    id?: int64;
    sourceNodeId: string;
    targetNodeId: string;
    direction: ConnectionDirection;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  /** A persisted graph view (camera state + node positions/connections). */
  model GraphView {
    id?: int64;
    name: string;
    description?: string;

    // Primary camera
    cameraPositionX?: float64 = 0.0;
    cameraPositionY?: float64 = 40.0;
    cameraPositionZ?: float64 = 120.0;
    cameraTargetX?: float64 = 0.0;
    cameraTargetY?: float64 = 15.0;
    cameraTargetZ?: float64 = 0.0;

    // Secondary camera
    camera2PositionX?: float64 = 0.0;
    camera2PositionY?: float64 = 40.0;
    camera2PositionZ?: float64 = 120.0;
    camera2TargetX?: float64 = 0.0;
    camera2TargetY?: float64 = 15.0;
    camera2TargetZ?: float64 = 0.0;

    isDefault?: boolean = false;
    positions?: GraphViewPosition[];
    connections?: GraphViewConnection[];
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }
}
