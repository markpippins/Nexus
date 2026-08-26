/**
 * assembly-srv — TypeSpec Models
 */
namespace org.nexus.assemblysrv {

  model Forum {
    id: string;
    slug: string;
    name: string;
    description?: string;
    sortOrder?: int32;
    createdAt?: string;
  }

  model ForumThread {
    id: string;
    forumId: string;
    title: string;
    body?: string;
    statusRating?: int32;
    postedById?: string;
    role?: string;
    modelId?: string;
    createdAt?: string;
  }

  model ThreadComment {
    id: string;
    threadId: string;
    body: string;
    postedById?: string;
    parentId?: string;
    role?: string;
    modelId?: string;
    statusRating?: int32;
    createdAt?: string;
  }

  model ThreadDetail is ForumThread {
    author?: { id: string; name: string };
    comments: ThreadComment[];
    commentCount?: int32;
  }

  model Agenda {
    id: string;
    title: string;
    body?: string;
    forumId?: string;
    sortOrder?: int32;
    createdAt?: string;
  }

  model AgendaItem {
    id: string;
    agendaId: string;
    title: string;
    body?: string;
    sortOrder?: int32;
    createdAt?: string;
  }

  model BridgeArtifactRef {
    id: string;
    postId: string;
    artifactType: string;
    artifactId: string;
  }

  model MoveThreadRequest {
    threadId: string;
    fromForumId: string;
    toForumId: string;
  }

  model ErrorDetail {
    error: string;
  }

  model HealthResponse {
    status: string;
    timestamp: string;
  }
}