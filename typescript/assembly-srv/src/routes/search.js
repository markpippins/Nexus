import { Router } from 'express';
import { pool } from '../db.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ query: q, results: [] });
    }

    const escapeLike = (value) => value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
    const pattern = `%${escapeLike(q)}%`;
    const limit = 20;

    const [
      forumResult,
      threadResult,
      postResult,
      workRequestResult,
      requirementResult,
      agendaResult,
      candidateResult,
      harvestResult,
      conversationResult,
      openQuestionResult,
      intentResult,
      assessmentResult,
      observationResult,
      agentRecordResult,
      specificationResult,
      specResult,
      planResult,
      userResult,
    ] = await Promise.all([
      pool.query(
        `SELECT id, name, slug, description
         FROM assembly.forums
         WHERE name ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' OR slug ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT p.id, p.title, p.text AS body, f.slug AS forum_slug
         FROM assembly.posts p
         JOIN assembly.forums f ON f.id = p.forum_uuid
         WHERE p.title ILIKE $1 ESCAPE '\\' OR p.text ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT c.id, c.text AS body, p.id AS thread_id, p.title AS thread_title, f.slug AS forum_slug
         FROM assembly.comments c
         JOIN assembly.posts p ON p.id = c.post_id
         JOIN assembly.forums f ON f.id = p.forum_uuid
         WHERE c.text ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, description, business_status AS status
         FROM nebula.work_requests
         WHERE title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' OR business_status ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, description, status
         FROM nebula.requirements
         WHERE title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, scope, planner_analysis, status
         FROM nebula.agendas
         WHERE title ILIKE $1 ESCAPE '\\' OR scope ILIKE $1 ESCAPE '\\' OR planner_analysis ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, intent_description, implementation_notes, status
         FROM nebula.harvest_candidates
         WHERE title ILIKE $1 ESCAPE '\\' OR intent_description ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, source_filename, source_text, model
         FROM nebula.harvests
         WHERE source_filename ILIKE $1 ESCAPE '\\' OR source_text ILIKE $1 ESCAPE '\\' OR model ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT cs.id, h.source_filename, cs.capture_mode
         FROM nebula.conversation_snapshots cs
         JOIN nebula.harvests h ON h.id = cs.conversation_id
         WHERE h.source_filename ILIKE $1 ESCAPE '\\' OR cs.capture_mode ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, description, status
         FROM nebula.open_questions
         WHERE title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, description, source_ref, tags, status
         FROM nebula.intent_records
         WHERE title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' OR source_ref ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, outcome, analysis_detail, agenda_id
         FROM nebula.assessments
         WHERE outcome ILIKE $1 ESCAPE '\\' OR analysis_detail ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, trigger_type, payload::text
         FROM nebula.observations
         WHERE trigger_type ILIKE $1 ESCAPE '\\' OR payload::text ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, record_type, role, title, content
         FROM nebula.agent_records
         WHERE title ILIKE $1 ESCAPE '\\' OR content ILIKE $1 ESCAPE '\\' OR role ILIKE $1 ESCAPE '\\' OR record_type ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, change_summary, agenda_id, revision_type
         FROM nebula.specifications
         WHERE change_summary ILIKE $1 ESCAPE '\\' OR revision_type ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, body, source_type, source_id, planner_note
         FROM nebula.specs
         WHERE title ILIKE $1 ESCAPE '\\' OR body ILIKE $1 ESCAPE '\\' OR planner_note ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, project, goal, content, derived_status
         FROM conduit.plan_status
         WHERE id IS NOT NULL AND id != ''
           AND (title ILIKE $1 ESCAPE '\\' OR project ILIKE $1 ESCAPE '\\' OR goal ILIKE $1 ESCAPE '\\' OR content ILIKE $1 ESCAPE '\\' OR derived_status ILIKE $1 ESCAPE '\\')
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, alias AS name, email, avatar_url
         FROM assembly.users
         WHERE alias ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\'
         LIMIT $2`,
        [pattern, limit]
      ),
    ]);

    const results = [
      ...forumResult.rows.map(row => ({
        type: 'forum',
        id: row.id,
        title: row.name,
        description: row.description || '',
        href: `/forums/${row.slug}`,
      })),
      ...threadResult.rows.map(row => ({
        type: 'thread',
        id: row.id,
        title: row.title,
        description: row.body ? row.body.slice(0, 200) : '',
        href: `/forums/${row.forum_slug}/${row.id}`,
      })),
      ...postResult.rows.map(row => ({
        type: 'post',
        id: row.id,
        title: row.thread_title,
        description: row.body ? row.body.slice(0, 200) : '',
        href: `/forums/${row.forum_slug}/${row.thread_id}`,
      })),
      ...workRequestResult.rows.map(row => ({
        type: 'work-request',
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        href: `/work-requests/${row.id}`,
      })),
      ...requirementResult.rows.map(row => ({
        type: 'requirement',
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        href: `/requirements/${row.id}`,
      })),
      ...agendaResult.rows.map(row => ({
        type: 'agenda',
        id: row.id,
        title: row.title,
        description: row.planner_analysis || `Scope: ${row.scope || '—'}`,
        status: row.status,
        href: `/agendas/${row.id}`,
      })),
      ...candidateResult.rows.map(row => ({
        type: 'candidate',
        id: row.id,
        title: row.title,
        description: row.intent_description || '',
        status: row.status,
        href: `/candidates/${row.id}`,
      })),
      ...harvestResult.rows.map(row => ({
        type: 'harvest',
        id: row.id,
        title: row.source_filename || `Harvest ${row.id}`,
        description: row.source_text ? row.source_text.slice(0, 200) : '',
        href: `/harvests/${row.id}`,
      })),
      ...conversationResult.rows.map(row => ({
        type: 'conversation',
        id: row.id,
        title: row.source_filename || `Conversation ${row.id}`,
        description: row.capture_mode || '',
        href: `/conversations/${row.id}`,
      })),
      ...openQuestionResult.rows.map(row => ({
        type: 'open-question',
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        href: `/open-questions/${row.id}`,
      })),
      ...intentResult.rows.map(row => ({
        type: 'intent',
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        href: `/intents/${row.id}`,
      })),
      ...assessmentResult.rows.map(row => ({
        type: 'assessment',
        id: row.id,
        title: `Assessment: ${row.outcome}`,
        description: row.analysis_detail || '',
        href: `/assessments/${row.id}`,
      })),
      ...observationResult.rows.map(row => ({
        type: 'observation',
        id: row.id,
        title: `Observation: ${row.trigger_type}`,
        description: row.payload ? JSON.stringify(row.payload).slice(0, 200) : '',
        href: `/observations/${row.id}`,
      })),
      ...agentRecordResult.rows.map(row => ({
        type: 'agent-record',
        id: row.id,
        title: row.title,
        description: row.content ? row.content.slice(0, 200) : '',
        role: row.role,
        recordType: row.record_type,
        href: `/agent-records/${row.id}`,
      })),
      ...specificationResult.rows.map(row => ({
        type: 'specification',
        id: row.id,
        title: `Specification (Agenda ${row.agenda_id})`,
        description: row.change_summary || '',
        href: `/specifications/${row.id}`,
      })),
      ...specResult.rows.map(row => ({
        type: 'spec',
        id: row.id,
        title: row.title,
        description: row.body ? row.body.slice(0, 200) : '',
        href: `/specs/${row.id}`,
      })),
      ...planResult.rows.map(row => ({
        type: 'plan',
        id: row.id,
        title: row.title,
        description: row.goal || `Project: ${row.project || '—'}`,
        status: row.derived_status,
        href: `/plans/${row.id}`,
      })),
      ...userResult.rows.map(row => ({
        type: 'user',
        id: row.id,
        title: row.name,
        description: row.email || '',
        href: `/profile/${row.id}`,
      })),
    ];

    const MAX_TOTAL_RESULTS = 100;
    const cappedResults = results.slice(0, MAX_TOTAL_RESULTS);

    res.json({ query: q, results: cappedResults, total: results.length });
  } catch (err) {
    next(err);
  }
});
