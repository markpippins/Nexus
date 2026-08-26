/**
 * wind-srv — TypeSpec Models
 */
namespace org.nexus.windsrv {

  model Ticket {
    id: string;
    nodeId: string;
    instanceId: string;
    status: string;
    assignedTo?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  model WorkflowInstance {
    id: string;
    workflowId: string;
    status: string;
    currentNodeId?: string;
    startedAt?: string;
    completedAt?: string;
    createdAt?: string;
  }

  model Workflow {
    id: string;
    title: string;
    version?: string;
    description?: string;
    createdAt?: string;
  }

  model WorkflowNode {
    id: string;
    workflowId: string;
    name: string;
    officeId?: string;
    eventType: string;
    nextNodeId?: string;
  }

  model EventType {
    eventType: string;
    label?: string;
    createdAt?: string;
  }

  model Edge {
    id: string;
    sourceEventId: string;
    targetNodeId: string;
    condition?: string;
  }

  model Office {
    id: string;
    name: string;
    description?: string;
  }

  model Title {
    id: string;
    name: string;
    officeId?: string;
  }

  model Version {
    id: string;
    workflowId: string;
    version: string;
    status?: string;
    createdAt?: string;
  }

  model RoleDef {
    id: string;
    name: string;
    officeId?: string;
    titleId?: string;
  }

  model PollRequest {
    since?: string;
    limit?: int32;
  }

  model ErrorDetail { error: string; }
  model HealthResponse { status: string; timestamp: string; }
}