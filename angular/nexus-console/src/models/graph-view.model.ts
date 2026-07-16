/** Graph View — a saved camera + node position preset. */
export interface GraphView {
    id?: number;
    name: string;
    description?: string;
    cameraPositionX: number;
    cameraPositionY: number;
    cameraPositionZ: number;
    cameraTargetX: number;
    cameraTargetY: number;
    cameraTargetZ: number;
    isDefault?: boolean;
    positions?: GraphViewPosition[];
    createdAt?: string;
    updatedAt?: string;
}

/** A single node's position within a graph view. */
export interface GraphViewPosition {
    id?: number;
    nodeId: string;
    positionX: number;
    positionY: number;
    positionZ: number;
}
