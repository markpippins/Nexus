import {
  createError,
  createSuccess,
} from "./errors";
import * as api from "./assembly-client";
import { fetchHarvest, fetchHarvestCandidates, NebulaHarvest, NebulaHarvestCandidate } from "./nebula-proxy";

// ── Type definitions ────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

type ToolHandler = (args: Record<string, any>) => Promise<any>;

// ── Tool registry ───────────────────────────────────────────────────

export const toolDefinitions: MCPToolDefinition[] = [
  // ── Forum tools ─────────────────────────────────────────────────
  {
    name: "assembly_list_forums",
    description: "List all forums in the assembly schema",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "assembly_get_forum",
    description: "Get a forum by slug",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Forum slug (e.g. 'general-discussion')" },
      },
      required: ["slug"],
    },
  },
  {
    name: "assembly_create_forum",
    description: "Create a new forum",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name" },
        slug: { type: "string", description: "URL-friendly slug (auto-generated if omitted)" },
        description: { type: "string", description: "Short description" },
      },
      required: ["name"],
    },
  },
  // ── Moderator tools ────────────────────────────────────────────
  {
    name: "assembly_expire_forum",
    description: "Soft-delete a forum by setting its expiration date to now. The forum disappears from list results but data is preserved.",
    inputSchema: {
      type: "object",
      properties: {
        forum_id: { type: "string", description: "Forum UUID" },
      },
      required: ["forum_id"],
    },
  },
  {
    name: "assembly_move_thread",
    description: "Move a thread (post) from its current forum to a different forum",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post UUID to move" },
        forum_id: { type: "string", description: "Destination forum UUID" },
      },
      required: ["post_id", "forum_id"],
    },
  },
  {
    name: "assembly_find_forum_by_name",
    description: "Search forums by name (case-insensitive partial match). Returns up to 20 results with id, name, slug, and expiration status.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Search pattern (partial match, e.g. 'todo' matches 'To Do')" },
      },
      required: ["name"],
    },
  },
  {
    name: "assembly_find_thread_by_title",
    description: "Search threads by title (case-insensitive partial match). Returns up to 20 results with id, title, forum, and dates.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Search pattern (partial match, e.g. 'magnet' matches 'Investigation: Magnetize button...')" },
      },
      required: ["title"],
    },
  },
  // ── User tools ──────────────────────────────────────────────────
  {
    name: "assembly_list_users",
    description: "List all users in the assembly schema",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "assembly_get_user",
    description: "Get a user by alias or id",
    inputSchema: {
      type: "object",
      properties: {
        alias: { type: "string", description: "Username (alias)" },
        id: { type: "string", description: "User UUID" },
      },
    },
  },
    {
    name: "assembly_create_user",
    description: "Create a new user",
    inputSchema: {
      type: "object",
      properties: {
        alias: { type: "string", description: "Username (must be unique)" },
        email: { type: "string", description: "Email address (must be unique)" },
        password: { type: "string", description: "Optional password (defaults to 'changeme')" },
        avatar_url: { type: "string", description: "Optional avatar URL" },
      },
      required: ["alias", "email"],
    },
  },
  // ── Post / Thread tools ─────────────────────────────────────────
  {
    name: "assembly_list_threads",
    description: "List all threads (posts) in a forum",
    inputSchema: {
      type: "object",
      properties: {
        forum_id: { type: "string", description: "Forum UUID" },
      },
      required: ["forum_id"],
    },
  },
  {
    name: "assembly_get_thread",
    description: "Get a thread (post) by id, including its comments",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post UUID" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "assembly_create_thread",
    description: "Create a new thread (post) in a forum",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Thread title" },
        body: { type: "string", description: "Body content (markdown)" },
        text: { type: "string", description: "Alias for body (deprecated — prefer body)" },
        user_id: { type: "string", description: "Author user UUID" },
        forum_id: { type: "string", description: "Forum UUID" },
        source_url: { type: "string", description: "Optional source URL" },
        role: { type: "string", description: "Posting agent role (e.g. sysadmin, architect)" },
        model: { type: "string", description: "Posting model ID (e.g. opencode/big-pickle)" },
      },
      required: ["title", "user_id", "forum_id", "body"],
    },
  },
  {
    name: "assembly_delete_thread",
    description: "Delete a thread (post) by id",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post UUID" },
      },
      required: ["post_id"],
    },
  },
  // ── Comment tools ───────────────────────────────────────────────
  {
    name: "assembly_create_comment",
    description: "Add a comment to a thread or reply to another comment",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Comment body" },
        user_id: { type: "string", description: "Author user UUID" },
        post_id: { type: "string", description: "Parent post (thread) UUID" },
        parent_id: { type: "string", description: "Parent comment UUID (for replies)" },
        role: { type: "string", description: "Posting agent role (e.g. sysadmin, architect)" },
        model: { type: "string", description: "Posting model ID (e.g. opencode/big-pickle)" },
      },
      required: ["text", "user_id", "post_id"],
    },
  },
  // ── Bridge: forum ↔ agenda ──────────────────────────────────────
  {
    name: "assembly_link_forum_agenda",
    description: "Link a forum to an agenda (mark forum as deliberation space for that agenda)",
    inputSchema: {
      type: "object",
      properties: {
        forum_id: { type: "string", description: "Forum UUID" },
        agenda_id: { type: "string", description: "Nebula agenda UUID" },
        label: { type: "string", description: "Optional label (e.g. 'primary', 'cross-reference')" },
      },
      required: ["forum_id", "agenda_id"],
    },
  },
  {
    name: "assembly_unlink_forum_agenda",
    description: "Remove a forum↔agenda link",
    inputSchema: {
      type: "object",
      properties: {
        forum_id: { type: "string", description: "Forum UUID" },
        agenda_id: { type: "string", description: "Nebula agenda UUID" },
      },
      required: ["forum_id", "agenda_id"],
    },
  },
  {
    name: "assembly_list_forums_by_agenda",
    description: "Get all forums linked to an agenda",
    inputSchema: {
      type: "object",
      properties: {
        agenda_id: { type: "string", description: "Nebula agenda UUID" },
      },
      required: ["agenda_id"],
    },
  },
  {
    name: "assembly_list_agendas_by_forum",
    description: "Get all agendas linked to a forum",
    inputSchema: {
      type: "object",
      properties: {
        forum_id: { type: "string", description: "Forum UUID" },
      },
      required: ["forum_id"],
    },
  },
  // ── Bridge: post ↔ artifact ─────────────────────────────────────
  {
    name: "assembly_link_post_artifact",
    description: "Link a post (thread) to a domain artifact (requirement, agenda_item, spec, implementation_plan)",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post UUID" },
        artifact_type: {
          type: "string",
          enum: ["requirement", "agenda_item", "spec", "implementation_plan"],
          description: "Type of domain artifact",
        },
        artifact_id: { type: "string", description: "Artifact UUID in nebula schema" },
        label: { type: "string", description: "Optional label (e.g. 'proposes', 'discusses', 'resolves')" },
      },
      required: ["post_id", "artifact_type", "artifact_id"],
    },
  },
  {
    name: "assembly_unlink_post_artifact",
    description: "Remove a post↔artifact link",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post UUID" },
        artifact_type: { type: "string", description: "Type of domain artifact" },
        artifact_id: { type: "string", description: "Artifact UUID" },
      },
      required: ["post_id", "artifact_type", "artifact_id"],
    },
  },
  {
    name: "assembly_list_artifact_threads",
    description: "Get all threads (posts) linked to a specific domain artifact",
    inputSchema: {
      type: "object",
      properties: {
        artifact_type: { type: "string", description: "Type of domain artifact" },
        artifact_id: { type: "string", description: "Artifact UUID" },
      },
      required: ["artifact_type", "artifact_id"],
    },
  },
  {
    name: "assembly_list_artifact_refs_by_post",
    description: "Get all artifact refs linked to a specific post",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post UUID" },
      },
      required: ["post_id"],
    },
  },
  // ── Bridge: supporting refs ──────────────────────────────────────
  {
    name: "assembly_add_supporting_ref",
    description: "Add a supporting reference (spec, cross_reference, source_url, evidence, attachment) to a post or comment",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post UUID (omit if attaching to comment)" },
        comment_id: { type: "string", description: "Comment UUID (omit if attaching to post)" },
        ref_type: {
          type: "string",
          enum: ["spec", "cross_reference", "source_url", "evidence", "attachment"],
          description: "Type of supporting reference",
        },
        ref_value: { type: "string", description: "URL, spec ID, or reference value" },
        metadata: { type: "object", description: "Optional JSON metadata" },
      },
      required: ["ref_type", "ref_value"],
    },
  },
  // ── Harvest publishing ───────────────────────────────────────────
  {
    name: "assembly_publish_harvest",
    description: "Publish a harvest transcript as a forum post in Harvest Candidates forum, linking its candidates. Creates post + artifact refs + supporting refs. Author: Rover.",
    inputSchema: {
      type: "object",
      properties: {
        harvest_id: { type: "string", description: "Nebula harvest UUID" },
      },
      required: ["harvest_id"],
    },
  },
];

// ── Markdown formatter for harvest transcripts ───────────────────────

function formatHarvestPostBody(
  harvest: NebulaHarvest,
  candidates: NebulaHarvestCandidate[],
): string {
  const lines: string[] = [];

  const title = (harvest as any).docklang?.meta?.title || harvest.source_filename;
  lines.push(`# ${title}`);
  lines.push("");

  // Metadata block
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Source | \`${harvest.source_path}\` |`);
  lines.push(`| Model | ${harvest.model} |`);
  const stats = (harvest as any).docklang?.stats;
  if (stats) {
    lines.push(`| Turns | ${stats.total_units ?? "?"} |`);
    lines.push(`| Blocks | ${stats.total_blocks ?? "?"} |`);
  }
  lines.push(`| Harvested | ${new Date(harvest.created_at).toISOString().slice(0, 10)} |`);
  lines.push("");

  // Candidates section
  if (candidates.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push(`## Candidates (${candidates.length})`);
    lines.push("");
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const statusBadge = c.status ? ` [\`${c.status}\`]` : "";
      lines.push(`### ${i + 1}. ${c.title}${statusBadge}`);
      lines.push("");
      if (c.intent_description) {
        lines.push(c.intent_description);
        lines.push("");
      }
      if (c.system_id || c.subsystem_id || c.feature_id) {
        const parts: string[] = [];
        if (c.system_id) parts.push(`system: \`${c.system_id.slice(0, 8)}\``);
        if (c.subsystem_id) parts.push(`subsystem: \`${c.subsystem_id.slice(0, 8)}\``);
        if (c.feature_id) parts.push(`feature: \`${c.feature_id.slice(0, 8)}\``);
        lines.push(`*Mapped to: ${parts.join(", ")}*`);
        lines.push("");
      }
    }
  } else {
    lines.push("---");
    lines.push("");
    lines.push("*No candidates extracted from this harvest.*");
    lines.push("");
  }

  // Links
  lines.push("---");
  lines.push("");
  lines.push(`🔗 **View formatted transcript:** [${title}](/harvests/${harvest.id})`);
  lines.push("");
  lines.push(`📄 **Open original chat:** [${harvest.source_path}](/chats/${encodeURIComponent(harvest.source_path)})`);
  lines.push("");

  return lines.join("\n");
}

// ── Handler registry ────────────────────────────────────────────────

const handlers: Record<string, ToolHandler> = {
  // ── Forums ──────────────────────────────────────────────────────
  assembly_list_forums: async () => {
    const forums = await api.listForums();
    return createSuccess(forums);
  },

  assembly_get_forum: async (args) => {
    const { slug } = args;
    if (!slug) return createError("INVALID_ARGUMENTS", "slug is required");
    const forum = await api.getForumBySlug(slug);
    if (!forum) return createError("FORUM_NOT_FOUND", `Forum not found: ${slug}`);
    return createSuccess(forum);
  },

  assembly_create_forum: async (args) => {
    const { name, slug, description } = args;
    if (!name) return createError("INVALID_ARGUMENTS", "name is required");
    try {
      const forum = await api.createForum(name, slug, description);
      return createSuccess(forum);
    } catch (err: any) {
      if (err.message?.includes("23505")) return createError("DUPLICATE", `Forum already exists: ${err.message}`);
      throw err;
    }
  },

  // ── Moderator ──────────────────────────────────────────────────
  assembly_expire_forum: async (args) => {
    const { forum_id } = args;
    if (!forum_id) return createError("INVALID_ARGUMENTS", "forum_id is required");
    try {
      const result = await api.expireForum(forum_id);
      if (!result) return createError("FORUM_NOT_FOUND", `Forum not found: ${forum_id}`);
      return createSuccess(result);
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("FORUM_NOT_FOUND", `Forum not found: ${forum_id}`);
      throw err;
    }
  },

  assembly_move_thread: async (args) => {
    const { post_id, forum_id } = args;
    if (!post_id || !forum_id) return createError("INVALID_ARGUMENTS", "post_id and forum_id are required");
    try {
      const moved = await api.moveThread(post_id, forum_id);
      if (!moved) return createError("POST_NOT_FOUND", `Post not found: ${post_id}`);
      return createSuccess({
        moved: true,
        post_id,
        title: moved.title,
        from_forum_id: moved.forum_uuid,
        to_forum_id: forum_id,
      });
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("FORUM_NOT_FOUND", `Destination forum not found: ${forum_id}`);
      throw err;
    }
  },

  assembly_find_forum_by_name: async (args) => {
    const { name } = args;
    if (!name) return createError("INVALID_ARGUMENTS", "name is required");
    const forums = await api.findForumsByName(name);
    return createSuccess(forums);
  },

  assembly_find_thread_by_title: async (args) => {
    const { title } = args;
    if (!title) return createError("INVALID_ARGUMENTS", "title is required");
    const threads = await api.findThreadsByTitle(title);
    return createSuccess(threads);
  },

  // ── Users ────────────────────────────────────────────────────────
  assembly_list_users: async () => {
    const users = await api.listUsers();
    return createSuccess(users);
  },

  assembly_get_user: async (args) => {
    const { alias, id } = args;
    try {
      if (id) {
        const user = await api.getUserById(id);
        if (!user) return createError("USER_NOT_FOUND", `User not found: ${id}`);
        return createSuccess(user);
      }
      if (alias) {
        const user = await api.getUserByAlias(alias);
        if (!user) return createError("USER_NOT_FOUND", `User not found: ${alias}`);
        return createSuccess(user);
      }
      return createError("INVALID_ARGUMENTS", "Provide either alias or id");
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("USER_NOT_FOUND", "User not found");
      throw err;
    }
  },

  assembly_create_user: async (args) => {
    const { alias, email, password, avatar_url } = args;
    if (!alias || !email) return createError("INVALID_ARGUMENTS", "alias and email are required");
    try {
      const user = await api.createUser(alias, email, password, avatar_url);
      return createSuccess(user);
    } catch (err: any) {
      if (err.message?.includes("23505")) return createError("DUPLICATE", `User already exists: ${err.message}`);
      throw err;
    }
  },

  // ── Posts / Threads ─────────────────────────────────────────────
  assembly_list_threads: async (args) => {
    const { forum_id } = args;
    if (!forum_id) return createError("INVALID_ARGUMENTS", "forum_id is required");
    try {
      const threads = await api.listThreadsInForumById(forum_id);
      return createSuccess(threads);
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("FORUM_NOT_FOUND", `Forum not found: ${forum_id}`);
      throw err;
    }
  },

  assembly_get_thread: async (args) => {
    const { post_id } = args;
    if (!post_id) return createError("INVALID_ARGUMENTS", "post_id is required");
    try {
      const data = await api.getThreadById(post_id);
      if (!data) return createError("POST_NOT_FOUND", `Post not found: ${post_id}`);
      const artifactRefs = await api.listArtifactRefsByPost(post_id).catch(() => []);
      return createSuccess({ post: data.thread, comments: data.comments, artifactRefs });
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("POST_NOT_FOUND", `Post not found: ${post_id}`);
      throw err;
    }
  },

  assembly_create_thread: async (args) => {
    const { title, text, body, user_id, forum_id, source_url, role, model } = args;
    const threadBody = body || text || "";
    if (!title || !user_id || !forum_id) {
      return createError("INVALID_ARGUMENTS", "title, user_id, and forum_id are required");
    }
    if (!threadBody) {
      return createError("INVALID_ARGUMENTS", "body (or text) is required");
    }
    try {
      const post = await api.createThreadById(forum_id, title, threadBody, user_id, source_url, role, model);
      return createSuccess(post);
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("FORUM_NOT_FOUND", `Forum not found: ${forum_id}`);
      throw err;
    }
  },

  assembly_delete_thread: async (args) => {
    const { post_id } = args;
    if (!post_id) return createError("INVALID_ARGUMENTS", "post_id is required");
    try {
      await api.deleteThread(post_id);
      return createSuccess({ deleted: true });
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("POST_NOT_FOUND", `Post not found: ${post_id}`);
      throw err;
    }
  },

  // ── Comments ────────────────────────────────────────────────────
  assembly_create_comment: async (args) => {
    const { text, user_id, post_id, parent_id, role, model } = args;
    if (!text || !user_id || !post_id) {
      return createError("INVALID_ARGUMENTS", "text, user_id, and post_id are required");
    }
    try {
      const comment = await api.createComment(post_id, text, user_id, parent_id, role, model);
      return createSuccess(comment);
    } catch (err: any) {
      if (err.message?.includes("404")) return createError("POST_NOT_FOUND", `Post not found: ${post_id}`);
      throw err;
    }
  },

  // ── Bridge: forum ↔ agenda ──────────────────────────────────────
  assembly_link_forum_agenda: async (args) => {
    const { forum_id, agenda_id, label } = args;
    if (!forum_id || !agenda_id) return createError("INVALID_ARGUMENTS", "forum_id and agenda_id are required");
    const link = await api.linkForumAgenda(forum_id, agenda_id, label);
    return createSuccess(link);
  },

  assembly_unlink_forum_agenda: async (args) => {
    const { forum_id, agenda_id } = args;
    if (!forum_id || !agenda_id) return createError("INVALID_ARGUMENTS", "forum_id and agenda_id are required");
    await api.unlinkForumAgenda(forum_id, agenda_id);
    return createSuccess({ unlinked: true });
  },

  assembly_list_forums_by_agenda: async (args) => {
    const { agenda_id } = args;
    if (!agenda_id) return createError("INVALID_ARGUMENTS", "agenda_id is required");
    const forums = await api.listForumsByAgenda(agenda_id);
    return createSuccess(forums);
  },

  assembly_list_agendas_by_forum: async (args) => {
    const { forum_id } = args;
    if (!forum_id) return createError("INVALID_ARGUMENTS", "forum_id is required");
    const agendas = await api.listAgendasByForum(forum_id);
    return createSuccess(agendas);
  },

  // ── Bridge: post ↔ artifact ─────────────────────────────────────
  assembly_link_post_artifact: async (args) => {
    const { post_id, artifact_type, artifact_id, label } = args;
    if (!post_id || !artifact_type || !artifact_id) {
      return createError("INVALID_ARGUMENTS", "post_id, artifact_type, and artifact_id are required");
    }
    const validTypes = ["requirement", "agenda_item", "spec", "implementation_plan"];
    if (!validTypes.includes(artifact_type)) {
      return createError("VALIDATION_ERROR", `artifact_type must be one of: ${validTypes.join(", ")}`);
    }
    const link = await api.linkPostArtifact(post_id, artifact_type, artifact_id, label);
    return createSuccess(link);
  },

  assembly_unlink_post_artifact: async (args) => {
    const { post_id, artifact_type, artifact_id } = args;
    if (!post_id || !artifact_type || !artifact_id) {
      return createError("INVALID_ARGUMENTS", "post_id, artifact_type, and artifact_id are required");
    }
    await api.unlinkPostArtifact(post_id, artifact_type, artifact_id);
    return createSuccess({ unlinked: true });
  },

  assembly_list_artifact_threads: async (args) => {
    const { artifact_type, artifact_id } = args;
    if (!artifact_type || !artifact_id) {
      return createError("INVALID_ARGUMENTS", "artifact_type and artifact_id are required");
    }
    const posts = await api.listArtifactThreads(artifact_type, artifact_id);
    return createSuccess(posts);
  },

  assembly_list_artifact_refs_by_post: async (args) => {
    const { post_id } = args;
    if (!post_id) return createError("INVALID_ARGUMENTS", "post_id is required");
    const refs = await api.listArtifactRefsByPost(post_id);
    return createSuccess(refs);
  },

  // ── Harvest publishing ───────────────────────────────────────────
  assembly_publish_harvest: async (args) => {
    const { harvest_id } = args;
    if (!harvest_id) return createError("INVALID_ARGUMENTS", "harvest_id is required");

    // 1. Fetch harvest + its candidates from nebula-srv (already REST-based)
    const harvest = await fetchHarvest(harvest_id);
    if (!harvest) return createError("NOT_FOUND", `Harvest not found: ${harvest_id}`);

    const candidates = await fetchHarvestCandidates(harvest_id);

    // 2. Resolve forum + author via assembly-srv
    const forum = await api.getForumBySlug("harvest-candidates");
    if (!forum) return createError("FORUM_NOT_FOUND", "Harvest Candidates forum not found — run migration first");

    const rover = await api.getUserByAlias("Rover");
    if (!rover) return createError("USER_NOT_FOUND", "Rover user not found — run migration first");

    // 3. Format the post body
    const title = (harvest as any).docklang?.meta?.title || harvest.source_filename;
    const body = formatHarvestPostBody(harvest, candidates);

    // 4. Create post via assembly-srv
    const postResult = await api.createThread(forum.slug, title, body, rover.id, harvest.source_path);
    const postId = postResult.id;

    // 5. Link post → harvest artifact
    await api.linkPostArtifact(postId, "harvest", harvest.id, "source");

    // 6. Link post → each candidate
    for (const c of candidates) {
      await api.linkPostArtifact(postId, "harvest_candidate", c.id, undefined);
    }

    // 7. Add supporting refs
    await api.addPostSupportingRef(postId, "source_url", `/harvests/${harvest.id}`, { harvest_id: harvest.id, label: "transcript_viewer" });
    await api.addPostSupportingRef(postId, "source_url", `http://localhost:3101/api/harvests/${harvest.id}/transcript`, { harvest_id: harvest.id, label: "transcript_api" });
    await api.addPostSupportingRef(postId, "source_url", `/chats/${encodeURIComponent(harvest.source_path)}`, { harvest_id: harvest.id, source_filename: harvest.source_filename, label: "original_chat" });

    return createSuccess({
      post_id: postId,
      forum_id: forum.id,
      candidate_count: candidates.length,
    });
  },

  // ── Bridge: supporting refs ─────────────────────────────────────
  assembly_add_supporting_ref: async (args) => {
    const { post_id, comment_id, ref_type, ref_value, metadata } = args;
    if (!post_id && !comment_id) {
      return createError("INVALID_ARGUMENTS", "Either post_id or comment_id is required");
    }
    if (!ref_type || !ref_value) {
      return createError("INVALID_ARGUMENTS", "ref_type and ref_value are required");
    }
    if (post_id) {
      await api.addPostSupportingRef(post_id, ref_type, ref_value, metadata);
    } else {
      await api.addCommentSupportingRef(comment_id, ref_type, ref_value, metadata);
    }
    return createSuccess({ added: true });
  },
};

// ── Dispatch ────────────────────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, any>,
): Promise<any> {
  const handler = handlers[toolName];
  if (!handler) {
    return createError("TOOL_NOT_FOUND", `Unknown tool: ${toolName}`);
  }
  try {
    return await handler(args);
  } catch (err: any) {
    console.error(`[assembly-mcp] Error in ${toolName}:`, err);
    return createError("INTERNAL_ERROR", err.message || "Internal server error");
  }
}
