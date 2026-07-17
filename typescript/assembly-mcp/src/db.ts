import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

// ── Schema ──────────────────────────────────────────────────────────
const SCHEMA = process.env.ASSEMBLY_PG_SCHEMA || "assembly";
const NEBULA_SCHEMA = "nebula";

let pool: Pool;

// ── Init ────────────────────────────────────────────────────────────

export async function initDb(): Promise<Pool> {
  const dsn =
    process.env.ASSEMBLY_PG_DSN ||
    "postgresql://pguser:pgpass@localhost:5432/nexus";

  pool = new Pool({
    connectionString: dsn,
    options: `-c search_path=${SCHEMA},public`,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  // Run migration on startup
  await runMigration();

  return pool;
}

export function getDb(): Pool {
  if (!pool) throw new Error("DB not initialised. Call initDb() first.");
  return pool;
}

// ── Migration ───────────────────────────────────────────────────────

async function runMigration(): Promise<void> {
  const client = await pool.connect();
  try {
    const migrationPath = path.resolve(__dirname, "..", "assembly-migration.sql");
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      // Split on semicolons and execute each statement
      const statements = sql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith("--"));
      for (const stmt of statements) {
        await client.query(stmt);
      }
      console.log(`[assembly-mcp] Migration applied from ${migrationPath}`);
    }
  } catch (err: any) {
    // Ignore "already exists" errors; rethrow others
    if (!err.message?.includes("already exists")) {
      console.error("[assembly-mcp] Migration error:", err.message);
    }
  } finally {
    client.release();
  }
}

// ── Type helpers ────────────────────────────────────────────────────

export interface ForumRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  as_of_dt?: Date;
  expiration_dt?: Date;
}

export interface UserRow {
  id: string;
  identifier: string | null;
  admin: boolean;
  alias: string;
  email: string;
  avatar_url: string | null;
}

export interface PostRow {
  id: string;
  created: Date;
  updated: Date | null;
  text: string | null;
  url: string | null;
  rating: number;
  posted_by_id: string;
  posted_to_id: string | null;
  forum_id: number | null;
  forum_uuid: string | null;
  source_url: string | null;
  title: string | null;
}

export interface CommentRow {
  id: string;
  created: Date;
  updated: Date | null;
  text: string | null;
  url: string | null;
  rating: number;
  posted_by_id: string;
  post_id: string | null;
  parent_id: string | null;
}

export interface ForumAgendaRow {
  forum_id: string;
  agenda_id: string;
  label: string | null;
  created_at: Date;
}

export interface PostArtifactRefRow {
  post_id: string;
  artifact_type: string;
  artifact_id: string;
  label: string | null;
  created_at: Date;
}

// ── Forums ──────────────────────────────────────────────────────────

export async function listForums(): Promise<ForumRow[]> {
  const { rows } = await getDb().query(
    `SELECT id, name, slug, description
     FROM ${SCHEMA}.forums
     WHERE expiration_dt = 'infinity'::timestamptz OR expiration_dt > now()
     ORDER BY name ASC`
  );
  return rows;
}

export async function getForumBySlug(slug: string): Promise<ForumRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, name, slug, description FROM ${SCHEMA}.forums WHERE slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

export async function getForumById(id: string): Promise<ForumRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, name, slug, description FROM ${SCHEMA}.forums WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function createForum(name: string, slug?: string, description?: string): Promise<ForumRow> {
  const id = uuidv4();
  const genSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { rows } = await getDb().query(
    `INSERT INTO ${SCHEMA}.forums (id, name, slug, description) VALUES ($1, $2, $3, $4)
     RETURNING id, name, slug, description`,
    [id, name, genSlug, description || null]
  );
  return rows[0];
}

export async function updateForum(id: string, updates: { name?: string; slug?: string; description?: string }): Promise<ForumRow | null> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
  if (updates.slug !== undefined) { sets.push(`slug = $${idx++}`); params.push(updates.slug); }
  if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
  if (sets.length === 0) return getForumById(id);
  params.push(id);
  const { rows } = await getDb().query(
    `UPDATE ${SCHEMA}.forums SET ${sets.join(", ")} WHERE id = $${idx}
     RETURNING id, name, slug, description`,
    params
  );
  return rows[0] || null;
}

export async function expireForum(id: string): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `UPDATE ${SCHEMA}.forums SET expiration_dt = now() WHERE id = $1`,
    [id]
  );
  return (rowCount || 0) > 0;
}

export async function moveThread(postId: string, newForumId: string): Promise<PostRow | null> {
  // Verify the target forum exists and is not expired
  const forum = await getForumById(newForumId);
  if (!forum) return null;

  const { rows } = await getDb().query(
    `UPDATE ${SCHEMA}.posts SET forum_uuid = $1, updated = now()
     WHERE id = $2
     RETURNING id, created, updated, text, url, rating, posted_by_id, posted_to_id,
               forum_id, forum_uuid, source_url, title`,
    [newForumId, postId]
  );
  return rows[0] || null;
}

export async function findForumsByName(pattern: string): Promise<ForumRow[]> {
  const { rows } = await getDb().query(
    `SELECT id, name, slug, description, as_of_dt, expiration_dt
     FROM ${SCHEMA}.forums
     WHERE name ILIKE $1
     ORDER BY name ASC
     LIMIT 20`,
    [`%${pattern}%`]
  );
  return rows;
}

export async function findThreadsByTitle(pattern: string): Promise<PostRow[]> {
  const { rows } = await getDb().query(
    `SELECT id, created, updated, text, url, rating, posted_by_id, posted_to_id,
            forum_id, forum_uuid, source_url, title
     FROM ${SCHEMA}.posts
     WHERE title ILIKE $1
     ORDER BY created DESC
     LIMIT 20`,
    [`%${pattern}%`]
  );
  return rows;
}

// ── Users ───────────────────────────────────────────────────────────

export async function listUsers(): Promise<UserRow[]> {
  const { rows } = await getDb().query(
    `SELECT id, identifier, admin, alias, email, avatar_url FROM ${SCHEMA}.users ORDER BY alias ASC`
  );
  return rows;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, identifier, admin, alias, email, avatar_url FROM ${SCHEMA}.users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getUserByAlias(alias: string): Promise<UserRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, identifier, admin, alias, email, avatar_url FROM ${SCHEMA}.users WHERE alias = $1`,
    [alias]
  );
  return rows[0] || null;
}

export async function createUser(alias: string, email: string, password?: string, avatar_url?: string, admin?: boolean): Promise<UserRow> {
  const id = uuidv4();
  const pwd = password || "changeme"; // default password for agent-created users
  const { rows } = await getDb().query(
    `INSERT INTO ${SCHEMA}.users (id, alias, email, password, avatar_url, admin) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, identifier, admin, alias, email, avatar_url`,
    [id, alias, email, pwd, avatar_url || null, admin || false]
  );
  return rows[0];
}

// ── Posts (Threads) ────────────────────────────────────────────────

export async function listPostsInForum(forumUuid: string): Promise<PostRow[]> {
  const { rows } = await getDb().query(
    `SELECT id, created, updated, text, url, rating, posted_by_id, posted_to_id,
            forum_id, forum_uuid, source_url, title
     FROM ${SCHEMA}.posts
     WHERE forum_uuid = $1
     ORDER BY created DESC`,
    [forumUuid]
  );
  return rows;
}

export async function getPostById(id: string): Promise<PostRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, created, updated, text, url, rating, posted_by_id, posted_to_id,
            forum_id, forum_uuid, source_url, title
     FROM ${SCHEMA}.posts WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function createPost(
  title: string,
  text: string | null,
  userId: string,
  forumUuid: string,
  sourceUrl?: string,
): Promise<PostRow> {
  const id = uuidv4();
  const { rows } = await getDb().query(
    `INSERT INTO ${SCHEMA}.posts (id, title, text, posted_by_id, forum_uuid, source_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created, updated, text, url, rating, posted_by_id, posted_to_id,
               forum_id, forum_uuid, source_url, title`,
    [id, title, text || null, userId, forumUuid, sourceUrl || null]
  );
  return rows[0];
}

export async function deletePost(id: string): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `DELETE FROM ${SCHEMA}.posts WHERE id = $1`,
    [id]
  );
  return (rowCount || 0) > 0;
}

// ── Comments ───────────────────────────────────────────────────────

export async function listCommentsByPost(postId: string): Promise<CommentRow[]> {
  const { rows } = await getDb().query(
    `SELECT id, created, updated, text, url, rating, posted_by_id, post_id, parent_id
     FROM ${SCHEMA}.comments
     WHERE post_id = $1
     ORDER BY created ASC`,
    [postId]
  );
  return rows;
}

export async function getCommentById(id: string): Promise<CommentRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, created, updated, text, url, rating, posted_by_id, post_id, parent_id
     FROM ${SCHEMA}.comments WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function createComment(
  text: string,
  userId: string,
  postId: string,
  parentId?: string,
): Promise<CommentRow> {
  const id = uuidv4();
  // If parentId is given, this is a reply to another comment (post_id = null, parent_id = parentId)
  // If no parentId, this is a top-level comment on the post (post_id = postId, parent_id = null)
  const actualPostId = parentId ? null : postId;
  const actualParentId = parentId || null;
  const { rows } = await getDb().query(
    `INSERT INTO ${SCHEMA}.comments (id, text, posted_by_id, post_id, parent_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created, updated, text, url, rating, posted_by_id, post_id, parent_id`,
    [id, text, userId, actualPostId, actualParentId]
  );
  return rows[0];
}

export async function deleteComment(id: string): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `DELETE FROM ${SCHEMA}.comments WHERE id = $1`,
    [id]
  );
  return (rowCount || 0) > 0;
}

// ── Bridge: forum ↔ agenda ─────────────────────────────────────────

export async function linkForumAgenda(forumId: string, agendaId: string, label?: string): Promise<ForumAgendaRow> {
  const { rows } = await getDb().query(
    `INSERT INTO ${SCHEMA}.forum_agendas (forum_id, agenda_id, label)
     VALUES ($1, $2, $3)
     ON CONFLICT (forum_id, agenda_id) DO UPDATE SET label = EXCLUDED.label
     RETURNING forum_id, agenda_id, label, created_at`,
    [forumId, agendaId, label || null]
  );
  return rows[0];
}

export async function unlinkForumAgenda(forumId: string, agendaId: string): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `DELETE FROM ${SCHEMA}.forum_agendas WHERE forum_id = $1 AND agenda_id = $2`,
    [forumId, agendaId]
  );
  return (rowCount || 0) > 0;
}

export async function listForumsByAgenda(agendaId: string): Promise<ForumRow[]> {
  const { rows } = await getDb().query(
    `SELECT f.id, f.name, f.slug, f.description
     FROM ${SCHEMA}.forums f
     JOIN ${SCHEMA}.forum_agendas fa ON fa.forum_id = f.id
     WHERE fa.agenda_id = $1
     ORDER BY f.name ASC`,
    [agendaId]
  );
  return rows;
}

export async function listAgendasByForum(forumId: string): Promise<{ agenda_id: string; label: string | null }[]> {
  const { rows } = await getDb().query(
    `SELECT agenda_id, label FROM ${SCHEMA}.forum_agendas WHERE forum_id = $1 ORDER BY created_at DESC`,
    [forumId]
  );
  return rows;
}

// ── Bridge: post ↔ artifact ────────────────────────────────────────

export async function linkPostArtifact(
  postId: string,
  artifactType: string,
  artifactId: string,
  label?: string,
): Promise<PostArtifactRefRow> {
  const { rows } = await getDb().query(
    `INSERT INTO ${SCHEMA}.post_artifact_refs (post_id, artifact_type, artifact_id, label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (post_id, artifact_type, artifact_id) DO UPDATE SET label = EXCLUDED.label
     RETURNING post_id, artifact_type, artifact_id, label, created_at`,
    [postId, artifactType, artifactId, label || null]
  );
  return rows[0];
}

export async function unlinkPostArtifact(postId: string, artifactType: string, artifactId: string): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `DELETE FROM ${SCHEMA}.post_artifact_refs WHERE post_id = $1 AND artifact_type = $2 AND artifact_id = $3`,
    [postId, artifactType, artifactId]
  );
  return (rowCount || 0) > 0;
}

export async function listArtifactThreads(artifactType: string, artifactId: string): Promise<PostRow[]> {
  const { rows } = await getDb().query(
    `SELECT p.id, p.created, p.updated, p.text, p.url, p.rating, p.posted_by_id, p.posted_to_id,
            p.forum_id, p.forum_uuid, p.source_url, p.title
     FROM ${SCHEMA}.posts p
     JOIN ${SCHEMA}.post_artifact_refs par ON par.post_id = p.id
     WHERE par.artifact_type = $1 AND par.artifact_id = $2
     ORDER BY p.created DESC`,
    [artifactType, artifactId]
  );
  return rows;
}

export async function listArtifactRefsByPost(postId: string): Promise<PostArtifactRefRow[]> {
  const { rows } = await getDb().query(
    `SELECT post_id, artifact_type, artifact_id, label, created_at
     FROM ${SCHEMA}.post_artifact_refs WHERE post_id = $1 ORDER BY created_at DESC`,
    [postId]
  );
  return rows;
}

// ── Bridge: post/comment ↔ supporting refs ─────────────────────────

export async function addPostSupportingRef(
  postId: string,
  refType: string,
  refValue: string,
  metadata?: Record<string, any>,
): Promise<void> {
  await getDb().query(
    `INSERT INTO ${SCHEMA}.post_supporting_refs (post_id, ref_type, ref_value, metadata)
     VALUES ($1, $2, $3, $4)`,
    [postId, refType, refValue, JSON.stringify(metadata || {})]
  );
}

export async function addCommentSupportingRef(
  commentId: string,
  refType: string,
  refValue: string,
  metadata?: Record<string, any>,
): Promise<void> {
  await getDb().query(
    `INSERT INTO ${SCHEMA}.post_supporting_refs (comment_id, ref_type, ref_value, metadata)
     VALUES ($1, $2, $3, $4)`,
    [commentId, refType, refValue, JSON.stringify(metadata || {})]
  );
}

export async function listSupportingRefsByPost(postId: string): Promise<any[]> {
  const { rows } = await getDb().query(
    `SELECT id, ref_type, ref_value, metadata, created_at
     FROM ${SCHEMA}.post_supporting_refs WHERE post_id = $1 ORDER BY created_at DESC`,
    [postId]
  );
  return rows;
}

export async function listSupportingRefsByComment(commentId: string): Promise<any[]> {
  const { rows } = await getDb().query(
    `SELECT id, ref_type, ref_value, metadata, created_at
     FROM ${SCHEMA}.post_supporting_refs WHERE comment_id = $1 ORDER BY created_at DESC`,
    [commentId]
  );
  return rows;
}

// ══════════════════════════════════════════════════════════════════
//  Cross-schema: harvest transcript → forum post
// ══════════════════════════════════════════════════════════════════

export interface HarvestRow {
  id: string;
  source_path: string;
  source_filename: string;
  model: string;
  total_candidates: number;
  docklang: any;
  created_at: Date;
}

export interface HarvestCandidateRow {
  id: string;
  title: string;
  intent_description: string | null;
  status: string | null;
  system_id: string | null;
  subsystem_id: string | null;
  feature_id: string | null;
}

export async function getHarvestById(harvestId: string): Promise<HarvestRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, source_path, source_filename, model, total_candidates, docklang, created_at
     FROM ${NEBULA_SCHEMA}.harvests WHERE id = $1`,
    [harvestId]
  );
  return rows[0] || null;
}

export async function getHarvestCandidatesByHarvestId(harvestId: string): Promise<HarvestCandidateRow[]> {
  const { rows } = await getDb().query(
    `SELECT id, title, intent_description, status, system_id, subsystem_id, feature_id
     FROM ${NEBULA_SCHEMA}.harvest_candidates WHERE harvest_id = $1
     ORDER BY created_at ASC`,
    [harvestId]
  );
  return rows;
}

export interface SystemRow {
  id: string;
  name: string;
}

export async function getSystemById(systemId: string): Promise<SystemRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, name FROM systems WHERE id = $1`,
    [systemId]
  );
  return rows[0] || null;
}

export async function getSubsystemById(subsystemId: string): Promise<SystemRow | null> {
  const { rows } = await getDb().query(
    `SELECT id, name FROM subsystems WHERE id = $1`,
    [subsystemId]
  );
  return rows[0] || null;
}
