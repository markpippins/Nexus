/**
 * assembly-srv — TypeSpec Operations
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.assemblysrv {

  @route("/health") @get op health(): HealthResponse;

  // ── Users ─────────────────────────────────────────────────────
  @route("/users")     @get op listUsers(): { items: { id: string; name: string }[] };
  @route("/users/{id}") @get op getUser(@path id: string): { id: string; name: string };

  // ── Forums ────────────────────────────────────────────────────
  @route("/forums")                    @get  op listForums(): { items: Forum[] };
  @route("/forums/{slug}/threads")     @get  op listForumThreads(@path slug: string): { items: ForumThread[]; total?: int32 };
  @route("/forums/{slug}/threads")     @post op createThread(@path slug: string, @body body: ForumThread): ForumThread;
  @route("/forums/by-id/{forumId}/threads") @get op listThreadsById(@path forumId: string): { items: ForumThread[] };
  @route("/forums")                    @post op createForum(@body body: Forum): Forum;
  @route("/forums/{id}")               @put  op updateForum(@path id: string, @body body: Forum): Forum;
  @route("/forums/{id}")               @delete op deleteForum(@path id: string): { deleted: string };
  @route("/forums/move-thread")        @post op moveThread(@body body: MoveThreadRequest): { moved: string };
  @route("/forums/reorder")            @put  op reorderForums(@body body: { ids: string[] }): { reordered: boolean };

  // ── Threads ───────────────────────────────────────────────────
  @route("/forums/threads/{threadId}")          @get  op getThread(@path threadId: string): ThreadDetail;
  @route("/forums/threads/{threadId}/comments") @post op postComment(@path threadId: string, @body body: ThreadComment): ThreadComment;
  @route("/forums/threads/{threadId}/status")   @put  op updateThreadStatus(@path threadId: string, @body body: ThreadComment): ThreadDetail;
  @route("/forums/threads/{threadId}")          @delete op deleteThread(@path threadId: string): { deleted: string };

  // ── Search ────────────────────────────────────────────────────
  @route("/forums/search/by-name")        @get op searchForumsByName(): { items: Forum[] };
  @route("/forums/search/by-thread-title") @get op searchThreads(): { items: ForumThread[] };

  // ── Agendas ───────────────────────────────────────────────────
  @route("/agendas")                 @get op listAgendas(): { items: Agenda[] };
  @route("/agendas/{id}")            @get op getAgenda(@path id: string): Agenda;
  @route("/agendas/{id}/items")      @get op listAgendaItems(@path id: string): { items: AgendaItem[] };

  // ── Bridges ───────────────────────────────────────────────────
  @route("/bridges/agendas-by-forum/{forumId}")  @get op agendasByForum(@path forumId: string): { items: Agenda[] };
  @route("/bridges/artifact-refs/{postId}")      @get op artifactRefs(@path postId: string): { items: BridgeArtifactRef[] };
  @route("/bridges/artifact-threads/{type}/{id}") @get op artifactThreads(@path type: string, @path id: string): { items: ForumThread[] };
}