/**
 * assembly-client.ts — HTTP client for delegating assembly operations to assembly-srv
 * REST API (default port 3107), replacing direct SQL access in assembly-mcp.
 *
 * This follows the same pattern as nebula-proxy.ts: the MCP server calls the REST
 * service instead of owning SQL. After this migration, assembly-mcp has ZERO
 * direct pg dependencies.
 */

const ASSEMBLY_BASE = process.env.ASSEMBLY_SRV_URL || "http://localhost:3107";

async function get(path: string): Promise<any> {
  const res = await fetch(`${ASSEMBLY_BASE}/api/${path}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`assembly-srv GET /api/${path} → ${res.status}`);
  return res.json();
}

async function post(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${ASSEMBLY_BASE}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`assembly-srv POST /api/${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

async function put(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${ASSEMBLY_BASE}/api/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`assembly-srv PUT /api/${path} → ${res.status}`);
  return res.json();
}

async function del(path: string): Promise<any> {
  const res = await fetch(`${ASSEMBLY_BASE}/api/${path}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`assembly-srv DELETE /api/${path} → ${res.status}`);
  return res.json();
}

// ── Forums ──────────────────────────────────────────────────────────

export async function listForums() { return get("forums"); }

export async function getForumBySlug(slug: string) { return get(`forums/by-slug/${encodeURIComponent(slug)}`); }

export async function getForumById(id: string) { return get(`forums/by-id/${id}`); }

export async function createForum(name: string, slug?: string, description?: string) {
  return post("forums", { name, slug, description });
}

export async function updateForum(id: string, updates: { name?: string; slug?: string; description?: string }) {
  return put(`forums/${id}`, updates);
}

export async function expireForum(id: string) {
  return del(`forums/${id}`);
}

export async function moveThread(postId: string, forumId: string) {
  return post("forums/move-thread", { post_id: postId, forum_id: forumId });
}

export async function findForumsByName(pattern: string) {
  return get(`forums/search/by-name?name=${encodeURIComponent(pattern)}`);
}

export async function findThreadsByTitle(pattern: string) {
  return get(`forums/search/by-thread-title?title=${encodeURIComponent(pattern)}`);
}

// ── Threads ─────────────────────────────────────────────────────────

export async function listThreadsInForum(forumSlug: string) {
  return get(`forums/${encodeURIComponent(forumSlug)}/threads`);
}

// UUID-based (avoids forum ID → slug resolution round-trip)
export async function listThreadsInForumById(forumId: string) {
  return get(`forums/by-id/${forumId}/threads`);
}

export async function createThreadById(
  forumId: string,
  title: string,
  body: string,
  postedById: string,
  sourceUrl?: string,
  role?: string,
  model?: string,
) {
  return post(`forums/by-id/${forumId}/threads`, {
    title,
    body,
    postedById,
    source_url: sourceUrl || null,
    role: role || null,
    model: model || null,
  });
}

export async function getThreadById(threadId: string) {
  return get(`forums/threads/${threadId}`);
}

export async function createThread(
  forumSlug: string,
  title: string,
  body: string,
  postedById: string,
  sourceUrl?: string,
  role?: string,
  model?: string,
) {
  return post(`forums/${encodeURIComponent(forumSlug)}/threads`, {
    title,
    body,
    postedById,
    source_url: sourceUrl || null,
    role: role || null,
    model: model || null,
  });
}

export async function deleteThread(threadId: string) {
  return del(`forums/threads/${threadId}`);
}

// ── Comments ────────────────────────────────────────────────────────

export async function getCommentById(id: string) {
  return get(`forums/comments/${id}`);
}

export async function createComment(
  threadId: string,
  text: string,
  postedById: string,
  parentId?: string,
  role?: string,
  model?: string,
) {
  return post(`forums/threads/${threadId}/comments`, {
    body: text,
    postedById,
    parentId: parentId || undefined,
    role: role || null,
    model: model || null,
  });
}

export async function deleteComment(id: string) {
  return del(`forums/comments/${id}`);
}

// ── Users ───────────────────────────────────────────────────────────

export async function listUsers() { return get("users"); }

export async function getUserById(id: string) { return get(`users/${id}`); }

export async function getUserByAlias(alias: string) {
  return get(`users/by-alias/${encodeURIComponent(alias)}`);
}

export async function createUser(
  alias: string,
  email: string,
  password?: string,
  avatar_url?: string,
  admin?: boolean,
) {
  return post("users", { alias, email, password, avatar_url, admin });
}

// ── Bridges: forum ↔ agenda ─────────────────────────────────────────

export async function linkForumAgenda(forumId: string, agendaId: string, label?: string) {
  return post("bridges/forum-agenda", { forum_id: forumId, agenda_id: agendaId, label });
}

// Special: DELETE with body (Express DELETE routes don't parse body by default,
// but our bridges DELETE handlers use req.body).
async function delWithBody(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${ASSEMBLY_BASE}/api/${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`assembly-srv DELETE /api/${path} → ${res.status}`);
  return res.json();
}

export async function unlinkForumAgenda(forumId: string, agendaId: string) {
  return delWithBody("bridges/forum-agenda", { forum_id: forumId, agenda_id: agendaId });
}

export async function listForumsByAgenda(agendaId: string) {
  return get(`bridges/forums-by-agenda/${agendaId}`);
}

export async function listAgendasByForum(forumId: string) {
  return get(`bridges/agendas-by-forum/${forumId}`);
}

// ── Bridges: post ↔ artifact ────────────────────────────────────────

export async function linkPostArtifact(postId: string, artifactType: string, artifactId: string, label?: string) {
  return post("bridges/post-artifact", { post_id: postId, artifact_type: artifactType, artifact_id: artifactId, label });
}

export async function unlinkPostArtifact(postId: string, artifactType: string, artifactId: string) {
  return delWithBody("bridges/post-artifact", { post_id: postId, artifact_type: artifactType, artifact_id: artifactId });
}

export async function listArtifactThreads(artifactType: string, artifactId: string) {
  return get(`bridges/artifact-threads/${encodeURIComponent(artifactType)}/${encodeURIComponent(artifactId)}`);
}

export async function listArtifactRefsByPost(postId: string) {
  return get(`bridges/artifact-refs/${postId}`);
}

// ── Bridges: supporting refs ─────────────────────────────────────────

export async function addPostSupportingRef(postId: string, refType: string, refValue: string, metadata?: Record<string, any>) {
  return post("bridges/supporting-refs", { post_id: postId, ref_type: refType, ref_value: refValue, metadata });
}

export async function addCommentSupportingRef(commentId: string, refType: string, refValue: string, metadata?: Record<string, any>) {
  return post("bridges/supporting-refs", { comment_id: commentId, ref_type: refType, ref_value: refValue, metadata });
}

export async function listSupportingRefsByPost(postId: string) {
  return get(`bridges/supporting-refs/post/${postId}`);
}

export async function listSupportingRefsByComment(commentId: string) {
  return get(`bridges/supporting-refs/comment/${commentId}`);
}
