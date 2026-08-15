import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { q, qT, camelCaseRow, parsePagination, isUuid } from '../services/nebula_helpers.js'

/**
 * nebula-srv (Wave 3.1) — meta domain.
 * Ported from nexus/typescript/nebula-srv/src/routes.ts sections:
 * OPEN QUESTIONS, ROLES, INTENT RECORDS, ASSESSMENTS, OBSERVATIONS,
 * CANDIDATE DEPENDENCIES, SEARCH, COUNTS, ARCHITECT SPECS,
 * ARTIFACT PROVENANCE, SEMANTIC SEARCH, CPF, REFRESH-STATS,
 * SYSTEM INVENTORY, SYSTEM EXTERNAL IDS.
 */

const VALID_CATEGORIES = ['AMBIGUITY', 'MISSING_INFO', 'CONFLICT', 'SCOPE', 'DEPENDENCY', 'DUPLICATE_CANDIDATE', 'WORK_COMPLETED']
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default class NebulaMetaController {
  // ── OPEN QUESTIONS ──────────────────────────────────────────────────

  /** GET /api/open-questions */
  async listOpenQuestions({ request, response }: HttpContext) {
    try {
      const { requirementId, candidateId, status, entityType, entityId } = request.qs()
      const clauses: string[] = []
      const vals: any[] = []
      let i = 1
      if (requirementId) { clauses.push(`requirement_id = $${i++}`); vals.push(requirementId) }
      if (candidateId) { clauses.push(`candidate_id = $${i++}`); vals.push(candidateId) }
      if (entityType && entityId) {
        if (entityType !== 'candidate' && entityType !== 'requirement') {
          return response.status(400).json({ error: 'entityType must be candidate or requirement' })
        }
        if (typeof entityId !== 'string' || !isUuid(entityId)) {
          return response.status(400).json({ error: 'entityId must be a UUID' })
        }
        const directColumn = entityType === 'candidate' ? 'candidate_id' : 'requirement_id'
        clauses.push(`oq.${directColumn} = $${i++}`)
        vals.push(entityId)
      }
      if (status) { clauses.push(`status = $${i++}`); vals.push(status) }
      else { clauses.push(`status = 'OPEN'`) }
      const where = 'WHERE ' + clauses.join(' AND ')
      const { rows } = await q(
        `SELECT oq.id, oq.requirement_id, oq.candidate_id, oq.title, oq.description, oq.category,
                oq.status, oq.blocking,
                oq.answered_by, oq.answered_at, oq.created_by, oq.created_at,
                COALESCE(ac.answer_count, 0) AS answer_count,
                COALESCE(ac.role_count, 0) AS role_count
         FROM nebula.open_questions oq
         LEFT JOIN nebula.v_question_answer_counts ac ON ac.question_id = oq.id
         ${where}
         ORDER BY oq.created_at DESC`,
        vals
      )
      return response.json({ questions: rows, count: rows.length })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/open-questions/:id/answers */
  async listOpenQuestionAnswers({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { rows } = await q(
        `SELECT id, question_id, role, answer, confidence, reasoning,
                version, answered_at
         FROM nebula.open_question_answers
         WHERE question_id = $1
         ORDER BY version DESC, answered_at DESC`,
        [id]
      )
      return response.json({ answers: rows, count: rows.length })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/open-questions/:id/answers */
  async recordOpenQuestionAnswer({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { answer, role, confidence, reasoning } = request.body()
      if (!answer || !role) {
        return response.status(400).json({ error: 'answer and role are required' })
      }
      const qCheck = await q(
        `SELECT id, status FROM nebula.open_questions WHERE id = $1`, [id]
      )
      if (qCheck.rows.length === 0) {
        return response.status(404).json({ error: 'Question not found' })
      }
      const { rows } = await q(
        `SELECT out_id AS id, out_question_id AS question_id, out_role AS role,
                out_answer AS answer, out_confidence AS confidence, out_reasoning AS reasoning,
                out_version AS version, out_answered_at AS answered_at
         FROM nebula.record_answer($1, $2, $3, $4, $5)`,
        [id, role, answer, confidence || 'MEDIUM', reasoning || null]
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/open-questions */
  async createOpenQuestion({ request, response }: HttpContext) {
    try {
      const { title, description, category, requirementId, candidateId, blocking, entityType, entityId, createdBy } = request.body()
      if (!title || !VALID_CATEGORIES.includes(category)) {
        return response.status(400).json({ error: 'title and valid category are required' })
      }
      if ((entityType && !entityId) || (!entityType && entityId)) {
        return response.status(400).json({ error: 'Both entityType and entityId are required' })
      }
      if (entityType && !['candidate', 'requirement'].includes(entityType)) {
        return response.status(400).json({ error: 'entityType must be candidate or requirement' })
      }
      if (entityId && !isUuid(entityId)) {
        return response.status(400).json({ error: 'entityId must be a UUID' })
      }
      if (requirementId && !isUuid(requirementId)) {
        return response.status(400).json({ error: 'requirementId must be a UUID' })
      }
      if (candidateId && !isUuid(candidateId)) {
        return response.status(400).json({ error: 'candidateId must be a UUID' })
      }

      let linkEntityType = entityType || null
      let linkEntityId = entityId || null
      if (!linkEntityType && requirementId) { linkEntityType = 'requirement'; linkEntityId = requirementId }
      if (!linkEntityType && candidateId) { linkEntityType = 'candidate'; linkEntityId = candidateId }

      const trx = await db.transaction()
      try {
        const result = await qT(
          trx,
          `INSERT INTO nebula.open_questions
           (id, requirement_id, candidate_id, title, description, category, status, blocking, created_by, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'OPEN', $6, $7, NOW())
           RETURNING id`,
          [
            linkEntityType === 'requirement' ? linkEntityId : (requirementId || null),
            linkEntityType === 'candidate' ? linkEntityId : (candidateId || null),
            title,
            description || null,
            category,
            blocking || false,
            createdBy || null,
          ]
        )
        await trx.commit()
        return response.status(201).json({ id: result.rows[0].id })
      } catch (err: any) {
        await trx.rollback()
        throw err
      }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** PUT /api/open-questions/:id/answer */
  async answerOpenQuestionLegacy({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { answer, answeredBy } = request.body()
      if (!answer || !answeredBy) {
        return response.status(400).json({ error: 'answer and answeredBy are required' })
      }
      const versionResult = await q(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM nebula.open_question_answers
         WHERE question_id = $1 AND role = $2`,
        [id, answeredBy]
      )
      const nextVersion = versionResult.rows[0].next_version

      await q(
        `INSERT INTO nebula.open_question_answers (question_id, role, answer, confidence, reasoning, version)
         VALUES ($1, $2, $3, 'MEDIUM', NULL, $4)`,
        [id, answeredBy, answer, nextVersion]
      )
      const { rows } = await q(
        `UPDATE nebula.open_questions
         SET updated_at = now()
         WHERE id = $1 AND status = 'OPEN'
         RETURNING id, title, status`,
        [id]
      )
      if (rows.length === 0) {
        return response.status(404).json({ error: 'Question not found or already closed' })
      }
      return response.json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** PUT /api/open-questions/:id/resolve */
  async resolveOpenQuestion({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { resolvedBy } = request.body()
      if (!resolvedBy) {
        return response.status(400).json({ error: 'resolvedBy is required' })
      }
      const { rows } = await q(
        `UPDATE nebula.open_questions
         SET status = 'RESOLVED',
             answered_by = $1,
             answered_at = now(),
             updated_at = now()
         WHERE id = $2 AND status = 'OPEN'
           AND EXISTS (SELECT 1 FROM nebula.open_question_answers WHERE question_id = $2)
         RETURNING id, title, status, answered_by, answered_at`,
        [resolvedBy, id]
      )
      if (rows.length === 0) {
        return response.status(404).json({ error: 'Question not found, already closed, or has no answer' })
      }
      return response.json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/open-questions/:id */
  async showOpenQuestion({ request, response }: HttpContext) {
    try {
      const { rows: [r] } = await q(
        `SELECT oq.id, oq.requirement_id, oq.candidate_id, oq.title, oq.description,
                oq.category, oq.status, oq.blocking,
                oq.created_by, oq.created_at, oq.updated_at,
                oq.answered_by, oq.answered_at,
                link.entity_type, link.entity_id, link.entity_title
         FROM nebula.open_questions oq
         LEFT JOIN LATERAL (
           SELECT entity_type, entity_id, entity_title
           FROM (
             SELECT 'candidate'::text AS entity_type,
                    oq.candidate_id AS entity_id,
                    (SELECT title FROM nebula.harvest_candidates WHERE id = oq.candidate_id) AS entity_title
             WHERE oq.candidate_id IS NOT NULL
             UNION ALL
             SELECT 'requirement'::text AS entity_type,
                    oq.requirement_id AS entity_id,
                    (SELECT title FROM nebula.requirements WHERE id = oq.requirement_id) AS entity_title
             WHERE oq.requirement_id IS NOT NULL
           ) direct_link
           ORDER BY entity_type
           LIMIT 1
         ) link ON true
         WHERE oq.id = $1`,
        [request.params().id]
      )
      if (!r) { return response.status(404).json({ error: 'Open question not found' }) }
      return response.json({
        id: r.id,
        requirementId: r.requirement_id,
        candidateId: r.candidate_id,
        title: r.title,
        description: r.description,
        category: r.category,
        status: r.status,
        blocking: r.blocking,
        createdBy: r.created_by,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
        answeredBy: r.answered_by,
        answeredAt: r.answered_at ? new Date(r.answered_at).toISOString() : null,
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityTitle: r.entity_title,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/open-questions/:id/timeline */
  async openQuestionTimeline({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const qResult = await q(
        `SELECT id, title, status, blocking, created_by, created_at FROM nebula.open_questions WHERE id = $1`,
        [id]
      )
      if (qResult.rows.length === 0) {
        return response.status(404).json({ error: 'Question not found' })
      }
      const qRow = qResult.rows[0]
      const events: any[] = []

      events.push({
        type: 'created', label: 'Question created', description: qRow.title,
        timestamp: new Date(qRow.created_at).toISOString(), actor: qRow.created_by, icon: 'Circle',
      })
      events.push({
        type: 'status_change', label: `Status: ${qRow.status}`,
        description: qRow.blocking ? 'Blocking' : 'Non-blocking',
        timestamp: new Date(qRow.created_at).toISOString(), actor: null, icon: 'RefreshCw',
      })

      if (qRow.status === 'RESOLVED') {
        events.push({
          type: 'resolved', label: 'Question resolved', description: null,
          timestamp: new Date(qRow.created_at).toISOString(), actor: null, icon: 'CheckCircle2',
        })
      }

      const { rows: agentRows } = await q(
        `SELECT record_type, role, title, created_at FROM nebula.agent_records
         WHERE content ILIKE $1 OR title ILIKE $1 ORDER BY created_at DESC LIMIT 20`,
        [`%${id}%`]
      )
      for (const row of agentRows) {
        events.push({
          type: 'note', label: `${row.record_type} by ${row.role}`, description: row.title,
          timestamp: new Date(row.created_at).toISOString(), actor: row.role, icon: 'FileText',
        })
      }

      events.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      return response.json(events)
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/open-questions/:id/participants */
  async listOpenQuestionParticipants({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT id, open_question_id, role, participated_at, contribution
         FROM nebula.deliberation_participants
         WHERE open_question_id = $1 AND valid_until > now()
         ORDER BY participated_at ASC`,
        [request.params().id]
      )
      return response.json({
        openQuestionId: request.params().id,
        participants: rows.map((r: any) => ({
          id: r.id,
          openQuestionId: r.open_question_id,
          role: r.role,
          participatedAt: r.participated_at ? new Date(r.participated_at).toISOString() : null,
          contribution: r.contribution,
        })),
        count: rows.length,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/open-questions/:id/participants */
  async addOpenQuestionParticipant({ request, response }: HttpContext) {
    try {
      const { role, contribution } = request.body()
      if (!role) { return response.status(400).json({ error: 'role is required' }) }
      const { rows: [p] } = await q(
        `INSERT INTO nebula.deliberation_participants
         (open_question_id, role, contribution, participated_at)
         VALUES ($1, $2, $3, now())
         RETURNING id, open_question_id, role, contribution, participated_at`,
        [request.params().id, role, contribution || null]
      )
      return response.status(201).json({
        id: p.id,
        openQuestionId: p.open_question_id,
        role: p.role,
        contribution: p.contribution,
        participatedAt: p.participated_at ? new Date(p.participated_at).toISOString() : null,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── CANDIDATE DEPENDENCIES ──────────────────────────────────────────

  /** GET /api/harvest-candidates/:id/dependencies */
  async candidateDependencies({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT id, candidate_id, depends_on_id, created_at
         FROM nebula.candidate_dependencies
         WHERE candidate_id = $1 AND valid_until > now()
         ORDER BY created_at ASC`,
        [request.params().id]
      )
      return response.json({
        candidateId: request.params().id,
        dependencies: rows.map((r: any) => ({
          id: r.id,
          candidateId: r.candidate_id,
          dependsOnId: r.depends_on_id,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        })),
        count: rows.length,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── ROLES ───────────────────────────────────────────────────────────

  roleShape(r: any) {
    return {
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      ownsDomains: r.owns_domains,
      canGreenlight: r.can_greenlight,
      canCreateQuestions: r.can_create_questions,
      canCreateAgendas: r.can_create_agendas,
      canResolveQuestions: r.can_resolve_questions,
      canVerifyWorkRequests: r.can_verify_work_requests,
      maxOpenQuestions: r.max_open_questions,
      requiresApprovalFrom: r.requires_approval_from,
      cronEnabled: r.cron_enabled,
      cronExpression: r.cron_expression,
      cronDescription: r.cron_description,
      escalatesTo: r.escalates_to,
      escalationTriggers: r.escalation_triggers,
      levelFilterPrimary: r.level_filter_primary,
      levelFilterAllowed: r.level_filter_allowed,
      visibilityScope: r.visibility_scope,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    }
  }

  /** GET /api/roles */
  async listRoles({ request, response }: HttpContext) {
    try {
      const { offset, page, pageSize } = parsePagination(request.qs())
      const [dataResult, countResult] = await Promise.all([
        q('SELECT * FROM nebula.roles ORDER BY name ASC LIMIT $1 OFFSET $2', [pageSize, offset]),
        q('SELECT COUNT(*)::int AS total FROM nebula.roles'),
      ])
      return response.json({
        items: dataResult.rows.map((r: any) => this.roleShape(r)),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/roles/:id */
  async showRole({ request, response }: HttpContext) {
    try {
      const { rows: [role] } = await q(
        'SELECT * FROM nebula.roles WHERE id = $1',
        [request.params().id]
      )
      if (!role) { return response.status(404).json({ error: 'Role not found' }) }
      return response.json(this.roleShape(role))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── INTENT RECORDS ──────────────────────────────────────────────────

  intentShape(r: any) {
    return {
      id: r.id,
      candidateId: r.candidate_id,
      parentId: r.parent_id,
      title: r.title,
      description: r.description,
      sourceType: r.source_type,
      sourceRef: r.source_ref,
      tags: r.tags,
      status: r.status,
      metadata: r.metadata,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    }
  }

  /** GET /api/intents */
  async listIntents({ request, response }: HttpContext) {
    try {
      const { offset, limit, page, pageSize } = parsePagination(request.qs())
      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT id, candidate_id, parent_id, title, description,
                  source_type, source_ref, tags, status, metadata,
                  created_at, updated_at
           FROM nebula.intent_records
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2`,
          [pageSize, offset]
        ),
        q('SELECT COUNT(*)::int AS total FROM nebula.intent_records'),
      ])
      return response.json({
        items: dataResult.rows.map((r: any) => this.intentShape(r)),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
        limit,
        offset,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/intents/:id */
  async showIntent({ request, response }: HttpContext) {
    try {
      const { rows: [r] } = await q(
        `SELECT id, candidate_id, parent_id, title, description,
                source_type, source_ref, tags, status, metadata,
                created_at, updated_at
         FROM nebula.intent_records WHERE id = $1`,
        [request.params().id]
      )
      if (!r) { return response.status(404).json({ error: 'Intent not found' }) }
      return response.json(this.intentShape(r))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── ASSESSMENTS ─────────────────────────────────────────────────────

  assessmentShape(r: any) {
    return {
      id: r.id,
      observationId: r.observation_id,
      outcome: r.outcome,
      confidence: r.confidence != null ? parseFloat(r.confidence) : null,
      impactScope: r.impact_scope,
      openQuestions: r.open_questions,
      agendaId: r.agenda_id,
      autoResolvePlanId: r.auto_resolve_plan_id,
      forumPostId: r.forum_post_id,
      analysisDetail: r.analysis_detail,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }
  }

  /** GET /api/assessments */
  async listAssessments({ request, response }: HttpContext) {
    try {
      const { offset, limit, page, pageSize } = parsePagination(request.qs())
      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT id, observation_id, outcome, confidence, impact_scope,
                  open_questions, agenda_id, auto_resolve_plan_id,
                  forum_post_id, analysis_detail, created_at
           FROM nebula.assessments
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2`,
          [pageSize, offset]
        ),
        q('SELECT COUNT(*)::int AS total FROM nebula.assessments'),
      ])
      return response.json({
        items: dataResult.rows.map((r: any) => this.assessmentShape(r)),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
        limit,
        offset,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/assessments/:id */
  async showAssessment({ request, response }: HttpContext) {
    try {
      const { rows: [r] } = await q(
        `SELECT id, observation_id, outcome, confidence, impact_scope,
                open_questions, agenda_id, auto_resolve_plan_id,
                forum_post_id, analysis_detail, created_at
         FROM nebula.assessments WHERE id = $1`,
        [request.params().id]
      )
      if (!r) { return response.status(404).json({ error: 'Assessment not found' }) }
      return response.json(this.assessmentShape(r))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── OBSERVATIONS ────────────────────────────────────────────────────

  observationShape(r: any) {
    return {
      id: r.id,
      triggerType: r.trigger_type,
      sourceArtifactType: r.source_artifact_type,
      sourceArtifactId: r.source_artifact_id,
      payload: r.payload,
      assessed: r.assessed,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }
  }

  /** GET /api/observations */
  async listObservations({ request, response }: HttpContext) {
    try {
      const { offset, limit, page, pageSize } = parsePagination(request.qs())
      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT id, trigger_type, source_artifact_type, source_artifact_id,
                  payload, assessed, created_at
           FROM nebula.observations
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2`,
          [pageSize, offset]
        ),
        q('SELECT COUNT(*)::int AS total FROM nebula.observations'),
      ])
      return response.json({
        items: dataResult.rows.map((r: any) => this.observationShape(r)),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
        limit,
        offset,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/observations/:id */
  async showObservation({ request, response }: HttpContext) {
    try {
      const { rows: [r] } = await q(
        `SELECT id, trigger_type, source_artifact_type, source_artifact_id,
                payload, assessed, created_at
         FROM nebula.observations WHERE id = $1`,
        [request.params().id]
      )
      if (!r) { return response.status(404).json({ error: 'Observation not found' }) }
      return response.json(this.observationShape(r))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── SEARCH ──────────────────────────────────────────────────────────

  /** GET /api/search?q=... */
  async search({ request, response }: HttpContext) {
    try {
      const qText = String(request.qs().q || '').trim()
      if (!qText || qText.length < 2) {
        return response.json({ query: qText, results: [] })
      }

      const escapeLike = (value: string) => value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')
      const pattern = `%${escapeLike(qText)}%`
      const limit = 20

      const [
        threadResult, requirementResult, agendaResult, candidateResult,
        harvestResult, oqResult, intentResult, assessmentResult,
        observationResult, agentRecordResult, specificationResult, planResult,
        userResult, forumResult, commentResult,
      ] = await Promise.all([
        q(
          `SELECT id, title, text AS body, 'thread' AS result_type FROM assembly.posts
           WHERE title ILIKE $1 ESCAPE '\\' OR text ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, title, description, status, 'requirement' AS result_type FROM nebula.requirements
           WHERE title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, title, planner_analysis AS description, status, 'agenda' AS result_type FROM nebula.agendas
           WHERE title ILIKE $1 ESCAPE '\\' OR planner_analysis ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, title, intent_description AS description, status, 'candidate' AS result_type FROM nebula.harvest_candidates
           WHERE title ILIKE $1 ESCAPE '\\' OR intent_description ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, source_filename AS title, source_text AS description, model AS status, 'harvest' AS result_type FROM nebula.harvests
           WHERE source_filename ILIKE $1 ESCAPE '\\' OR source_text ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, title, description, status, 'open_question' AS result_type FROM nebula.open_questions
           WHERE title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, title, description, status, 'intent' AS result_type FROM nebula.intent_records
           WHERE title ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, outcome AS title, analysis_detail AS description, outcome AS status, 'assessment' AS result_type FROM nebula.assessments
           WHERE outcome ILIKE $1 ESCAPE '\\' OR analysis_detail ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, trigger_type AS title, payload::text AS description, 'observed' AS status, 'observation' AS result_type FROM nebula.observations
           WHERE trigger_type ILIKE $1 ESCAPE '\\' OR payload::text ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, title, content AS description, role AS status, 'agent_record' AS result_type FROM nebula.agent_records
           WHERE title ILIKE $1 ESCAPE '\\' OR content ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, change_summary AS title, revision_type AS description, 'spec' AS status, 'specification' AS result_type FROM nebula.specifications
           WHERE change_summary ILIKE $1 ESCAPE '\\' OR revision_type ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, title, goal AS description, COALESCE(derived_status, 'PLAN_CREATE') AS status, 'plan' AS result_type FROM nebula.plan_status
           WHERE id IS NOT NULL AND id != ''
             AND (title ILIKE $1 ESCAPE '\\' OR goal ILIKE $1 ESCAPE '\\' OR content ILIKE $1 ESCAPE '\\')
           LIMIT $2`,
          [pattern, limit]
        ),
        q(
          `SELECT id, alias AS title, email AS description, 'user' AS status, 'user' AS result_type FROM assembly.users
           WHERE alias ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\' LIMIT $2`,
          [pattern, limit]
        ),
        // Wave 3.2: assembly-srv merged forum-by-name + comment search into the
        // nebula search surface (assembly.search_forums / search_comments procs).
        q(
          `SELECT * FROM assembly.search_forums($1, $2)`,
          [qText, limit]
        ),
        q(
          `SELECT * FROM assembly.search_comments($1, $2)`,
          [qText, limit]
        ),
      ])

      let results = [
        ...threadResult.rows,
        ...requirementResult.rows,
        ...agendaResult.rows,
        ...candidateResult.rows,
        ...harvestResult.rows,
        ...oqResult.rows,
        ...intentResult.rows,
        ...assessmentResult.rows,
        ...observationResult.rows,
        ...agentRecordResult.rows,
        ...specificationResult.rows,
        ...planResult.rows,
        ...userResult.rows,
      ].slice(0, 100).map((r: any) => {
        const routePaths: Record<string, string> = {
          open_question: 'open-questions',
          agent_record: 'agent-records',
        }
        const routePath = routePaths[r.result_type] || `${r.result_type}s`
        return {
          type: r.result_type,
          id: r.id,
          title: r.title || '',
          description: r.description ? r.description.slice(0, 200) : '',
          status: r.status || null,
          href: `/${routePath}/${r.id}`,
        }
      })

      // Wave 3.2: assembly-srv merged forum-by-name + comment search (assembly
      // procs) into the nebula search surface. Appended AFTER the primary map
      // so their dedicated hrefs survive (the primary map rewrites hrefs from
      // result_type).
      const assemblyLocal = [
        ...forumResult.rows.map((r: any) => ({
          type: 'forum',
          id: r.id,
          title: r.name || '',
          description: (r.description || '').slice(0, 200),
          status: null,
          href: `/forums/${r.slug}`,
        })),
        ...commentResult.rows.map((r: any) => ({
          type: 'post',
          id: r.id,
          title: r.thread_title || '',
          description: (r.body || '').slice(0, 200),
          status: null,
          href: `/forums/${r.forum_slug}/${r.thread_id}`,
        })),
      ]
      results.push(...assemblyLocal)
      results = results.slice(0, 100)

      return response.json({ query: qText, results, total: results.length })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/search/semantic */
  async semanticSearch({ request, response }: HttpContext) {
    try {
      const { queryEmbedding, limit = 10, targetSection } = request.body()
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
        return response.status(400).json({ error: 'queryEmbedding (array of 768 floats) is required' })
      }
      if (queryEmbedding.length !== 768) {
        return response.status(400).json({ error: 'queryEmbedding must be a 768-dimensional vector' })
      }
      const resultLimit = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100)
      const vectorStr = '[' + queryEmbedding.join(',') + ']'
      const { rows } = await q(
        `SELECT section, entity_id, name, description, similarity
         FROM knowledge.semantic_search($1::vector, $2, $3)`,
        [vectorStr, resultLimit, targetSection || null]
      )
      return response.json({
        query: { limit: resultLimit, targetSection: targetSection || null },
        results: rows,
        total: rows.length,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── COUNTS ──────────────────────────────────────────────────────────

  /** GET /api/counts */
  async counts(_ctx: HttpContext) {
    const [
      postsResult, requirementsResult, agendasResult, candidatesResult,
      harvestsResult, oqResult, intentsResult, assessmentsResult,
      observationsResult, agentRecordsResult, specificationsResult, plansResult,
      usersResult, toDoThreadsResult, forumsResult,
    ] = await Promise.all([
      q('SELECT COUNT(*)::int AS total FROM assembly.posts'),
      q("SELECT COUNT(*)::int AS total FROM assembly.forums WHERE expiration_dt = 'infinity'::timestamptz OR expiration_dt > now()"),
      q('SELECT COUNT(*)::int AS total FROM nebula.requirements'),
      q('SELECT COUNT(*)::int AS total FROM nebula.agendas'),
      q('SELECT COUNT(*)::int AS total FROM nebula.harvest_candidates'),
      q('SELECT COUNT(*)::int AS total FROM nebula.harvests'),
      q('SELECT COUNT(*)::int AS total FROM nebula.open_questions'),
      q('SELECT COUNT(*)::int AS total FROM nebula.intent_records'),
      q('SELECT COUNT(*)::int AS total FROM nebula.assessments'),
      q('SELECT COUNT(*)::int AS total FROM nebula.observations'),
      q('SELECT COUNT(*)::int AS total FROM nebula.agent_records'),
      q('SELECT COUNT(*)::int AS total FROM nebula.specifications'),
      q(`SELECT COUNT(*)::int AS total FROM nebula.plan_status WHERE id IS NOT NULL AND id != ''`),
      q('SELECT COUNT(*)::int AS total FROM assembly.users'),
      q("SELECT COUNT(*)::int AS total FROM assembly.thread_list_v WHERE forum_slug = 'to-do'"),
    ])
    return {
      threads: postsResult.rows[0].total,
      requirements: requirementsResult.rows[0].total,
      agendas: agendasResult.rows[0].total,
      candidates: candidatesResult.rows[0].total,
      harvests: harvestsResult.rows[0].total,
      openQuestions: oqResult.rows[0].total,
      intents: intentsResult.rows[0].total,
      assessments: assessmentsResult.rows[0].total,
      observations: observationsResult.rows[0].total,
      agentRecords: agentRecordsResult.rows[0].total,
      specifications: specificationsResult.rows[0].total,
      plans: plansResult.rows[0].total,
      users: usersResult.rows[0].total,
      toDoThreads: toDoThreadsResult.rows[0].total,
      forums: forumsResult.rows[0].total,
      posts: postsResult.rows[0].total,
    }
  }

  // ── ARCHITECT SPECS ─────────────────────────────────────────────────

  /** GET /api/architect-specs */
  async listArchitectSpecs({ request, response }: HttpContext) {
    try {
      const { requirement_id } = request.qs()
      const { offset, page, pageSize } = parsePagination(request.qs())

      const conditions: string[] = []
      const params: any[] = []
      let i = 1
      if (requirement_id) { conditions.push(`requirement_id = $${i++}`); params.push(requirement_id) }
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT * FROM nebula.architect_specs ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
          [...params, pageSize, offset]
        ),
        q(`SELECT COUNT(*)::int AS total FROM nebula.architect_specs ${where}`, params),
      ])
      return response.json({
        items: dataResult.rows.map(camelCaseRow),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/architect-specs/:id */
  async showArchitectSpec({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { rows: [row] } = await q(
        'SELECT * FROM nebula.architect_specs WHERE id = $1',
        [id]
      )
      if (!row) return response.status(404).json({ error: 'Architect spec not found' })
      return response.json(camelCaseRow(row))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/architect-specs */
  async createArchitectSpec({ request, response }: HttpContext) {
    try {
      const { title, requirementId, workRequestId, content, metadata } = request.body()
      if (!title || !requirementId) return response.status(400).json({ error: 'title and requirementId are required' })
      const { rows: [row] } = await q(
        `INSERT INTO nebula.architect_specs (title, requirement_id, work_request_id, content, metadata)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [title, requirementId, workRequestId || null, JSON.stringify(content || {}), JSON.stringify(metadata || {})]
      )
      return response.status(201).json(camelCaseRow(row))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** DELETE /api/architect-specs/:id */
  async deleteArchitectSpec({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { rowCount } = await q(
        'UPDATE nebula.architect_specs SET valid_until = now() WHERE id = $1 AND valid_until > now()',
        [id]
      )
      if (rowCount === 0) return response.status(404).json({ error: 'Architect spec not found' })
      return response.json({ ok: true })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── ARTIFACT PROVENANCE ─────────────────────────────────────────────

  /** GET /api/artifact-provenance */
  async listArtifactProvenance({ request, response }: HttpContext) {
    try {
      const { subject_type, subject_id, source_type, source_id } = request.qs()
      const { offset, page, pageSize } = parsePagination(request.qs())

      const conditions: string[] = []
      const params: any[] = []
      let i = 1
      if (subject_type) { conditions.push(`subject_type = $${i++}`); params.push(subject_type) }
      if (subject_id) { conditions.push(`subject_id = $${i++}`); params.push(subject_id) }
      if (source_type) { conditions.push(`source_type = $${i++}`); params.push(source_type) }
      if (source_id) { conditions.push(`source_id = $${i++}`); params.push(source_id) }
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT * FROM nebula.artifact_provenance ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
          [...params, pageSize, offset]
        ),
        q(`SELECT COUNT(*)::int AS total FROM nebula.artifact_provenance ${where}`, params),
      ])
      return response.json({
        items: dataResult.rows.map(camelCaseRow),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/artifact-provenance/:id */
  async showArtifactProvenance({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { rows: [row] } = await q(
        'SELECT * FROM nebula.artifact_provenance WHERE id = $1',
        [id]
      )
      if (!row) return response.status(404).json({ error: 'Provenance record not found' })
      return response.json(camelCaseRow(row))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/artifact-provenance */
  async createArtifactProvenance({ request, response }: HttpContext) {
    try {
      const { subjectType, subjectId, sourceType, sourceId, sourceVersion, relationship, metadata } = request.body()
      if (!subjectType || !subjectId || !sourceType || !sourceId) {
        return response.status(400).json({ error: 'subjectType, subjectId, sourceType, and sourceId are required' })
      }
      const { rows: [row] } = await q(
        `INSERT INTO nebula.artifact_provenance
         (subject_type, subject_id, source_type, source_id, source_version, relationship, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ON CONSTRAINT uq_artifact_provenance_pair
         DO UPDATE SET metadata = EXCLUDED.metadata, source_version = EXCLUDED.source_version
         RETURNING *`,
        [subjectType, subjectId, sourceType, sourceId, sourceVersion || null, relationship || 'derived_from', JSON.stringify(metadata || {})]
      )
      return response.status(201).json(camelCaseRow(row))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** DELETE /api/artifact-provenance/:id */
  async deleteArtifactProvenance({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { rowCount } = await q(
        'UPDATE nebula.artifact_provenance SET valid_until = now() WHERE id = $1 AND valid_until > now()',
        [id]
      )
      if (rowCount === 0) return response.status(404).json({ error: 'Provenance record not found' })
      return response.json({ expired: true })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── CPF — COMPILATION READINESS FUNNEL ──────────────────────────────

  /** GET /api/cpf */
  async cpf({ request, response }: HttpContext) {
    try {
      const threshold = parseFloat(String(request.qs().threshold || '0.7'))
      const candidateId = request.qs().candidate as string | undefined
      const showAll = request.qs().all === '1' || request.qs().all === 'true'
      const system = request.qs().system as string | undefined
      const subsystem = request.qs().subsystem as string | undefined
      const limit = Math.max(0, parseInt(String(request.qs().limit || '0'), 10))
      const offset = Math.max(0, parseInt(String(request.qs().offset || '0'), 10))

      const clauses: string[] = []
      const vals: any[] = []
      let i = 1
      if (candidateId) {
        clauses.push(`hc.id = $${i++}`)
        vals.push(candidateId)
      } else if (!showAll) {
        clauses.push(`hc.compilation_readiness >= $${i++}`)
        vals.push(threshold)
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const { rows } = await q(
        `SELECT hc.id, hc.title, hc.intent_description, hc.status,
                hc.compilation_readiness, hc.completed, hc.tags,
                COALESCE(sys.name, '(none)') AS system_name,
                COALESCE(sub.name, '(none)') AS subsystem_name,
                (SELECT count(*)::int FROM nebula.candidate_dependencies cd WHERE cd.candidate_id = hc.id AND cd.valid_until > now()) AS dep_count
         FROM nebula.harvest_candidates hc
         LEFT JOIN nebula.systems sys ON sys.id = hc.system_id
         LEFT JOIN nebula.subsystems sub ON sub.id = hc.subsystem_id
         ${where}
         ORDER BY hc.compilation_readiness DESC NULLS LAST, hc.created_at DESC`,
        vals
      )

      let data = rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        intent_description: r.intent_description,
        status: r.status,
        compilation_readiness: r.compilation_readiness,
        completed: r.completed,
        tags: r.tags || [],
        system_name: r.system_name,
        subsystem_name: r.subsystem_name,
        dep_count: r.dep_count,
        promotable: r.compilation_readiness != null && r.compilation_readiness >= 0.7,
      }))

      if (system) data = data.filter((d: any) => d.system_name?.toLowerCase() === system.toLowerCase())
      if (subsystem) data = data.filter((d: any) => d.subsystem_name?.toLowerCase() === subsystem.toLowerCase())

      const total = data.length
      if (limit > 0) {
        data = data.slice(offset, offset + limit)
      }

      return response.json({ data, count: total, limit: limit || undefined, offset: offset || undefined })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/cpf/count */
  async cpfCount({ request, response }: HttpContext) {
    try {
      const system = request.qs().system as string | undefined
      const subsystem = request.qs().subsystem as string | undefined

      const clauses: string[] = []
      const vals: any[] = []
      let i = 1
      if (system) { clauses.push(`sys.name = $${i++}`); vals.push(system) }
      if (subsystem) { clauses.push(`sub.name = $${i++}`); vals.push(subsystem) }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const { rows } = await q(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE hc.compilation_readiness >= 0.7)::int AS ready,
           COUNT(*) FILTER (WHERE hc.status = 'promoted')::int AS promoted,
           COUNT(*) FILTER (WHERE hc.compilation_readiness >= 0.5 AND hc.compilation_readiness < 0.7)::int AS near_miss,
           COUNT(*) FILTER (WHERE hc.compilation_readiness < 0.5 OR hc.compilation_readiness IS NULL)::int AS low
         FROM nebula.harvest_candidates hc
         LEFT JOIN nebula.systems sys ON sys.id = hc.system_id
         LEFT JOIN nebula.subsystems sub ON sub.id = hc.subsystem_id
         ${where}`,
        vals
      )
      return response.json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/cpf/promote */
  async cpfPromote({ request, response }: HttpContext) {
    try {
      const candidateId = request.body().candidate_id || request.body().id
      if (!candidateId) {
        return response.status(400).json({ error: 'candidate_id is required' })
      }
      const { rows } = await q(
        `SELECT id, title, compilation_readiness, status
         FROM nebula.harvest_candidates WHERE id = $1`,
        [candidateId]
      )
      if (rows.length === 0) {
        return response.status(404).json({ error: 'Candidate not found' })
      }
      const c = rows[0]
      if (c.compilation_readiness == null || c.compilation_readiness < 0.7) {
        return response.status(400).json({ error: 'Candidate is not promotable (CPF < 0.7)', compilation_readiness: c.compilation_readiness })
      }
      await q(
        `UPDATE nebula.harvest_candidates SET status = 'promoted', updated_at = now() WHERE id = $1`,
        [candidateId]
      )
      return response.json({ success: true, message: `Candidate ${candidateId} promoted`, title: c.title })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── REFRESH STATS ───────────────────────────────────────────────────

  /** POST /api/refresh-stats */
  async refreshStats({ response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT matviewname FROM pg_matviews WHERE schemaname = 'nebula'`
      )
      const refreshed: string[] = []
      const skipped: string[] = []
      const errors: string[] = []
      for (const row of rows) {
        const name = String(row.matviewname)
        if (!SAFE_IDENT.test(name)) {
          skipped.push(name)
          continue
        }
        let success = false
        try {
          await q(`REFRESH MATERIALIZED VIEW CONCURRENTLY nebula.${name}`)
          success = true
        } catch {
          try {
            await q(`REFRESH MATERIALIZED VIEW nebula.${name}`)
            success = true
          } catch (fallbackErr: any) {
            errors.push(`${name}: ${fallbackErr.message}`)
          }
        }
        if (success) refreshed.push(name)
      }
      return response.json({ ok: true, refreshed, skipped, errors })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── SYSTEM INVENTORY ────────────────────────────────────────────────

  /** GET /api/systems/:id/inventory */
  async systemInventory({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      if (!UUID_RE.test(id)) {
        return response.status(400).json({ error: 'invalid_id', message: `'${id}' is not a valid UUID` })
      }
      const { rows: [sys] } = await q(
        'SELECT id, name, description, path, asset_id FROM systems WHERE id = $1',
        [id]
      )
      if (!sys) return response.status(404).json({ error: 'System not found' })

      let services: any[] = []
      try {
        const { rows } = await q(
          `SELECT ar.id AS "relationId", ar.relation_type AS "relationType",
                  ar.effective_at AS "effectiveAt",
                  ca.id AS "assetId", ca.canonical_asset_id AS "canonicalAssetId",
                  ca.asset_kind AS "assetKind",
                  trs.id AS "terrainId", trs.name AS "terrainName",
                  trs.port AS "terrainPort", trs.status AS "terrainStatus",
                  trs.health_check_url AS "terrainHealthCheckUrl",
                  trs.workspace_path AS "terrainWorkspacePath",
                  trs.is_internal AS "terrainIsInternal",
                  rs.id AS "registryId", rs.name AS "registryName",
                  rs.default_port AS "registryPort", rs.status AS "registryStatus",
                  rs.description AS "registryDescription",
                  rs.version AS "registryVersion",
                  rs.repository_url AS "registryRepositoryUrl"
           FROM semantics.asset_relation ar
           JOIN semantics.canonical_asset ca
             ON ca.id = ar.to_asset_id AND ca.expired_at IS NULL
           LEFT JOIN terrain.runnable_services trs
             ON trs.asset_id = ca.id
           LEFT JOIN registry.services rs
             ON rs.asset_id = trs.asset_id AND rs.asset_id IS NOT NULL
           WHERE ar.from_asset_id = $1
             AND ar.expired_at IS NULL
             AND ar.relation_type = 'owns'
           ORDER BY trs.name NULLS LAST`,
          [sys.asset_id]
        )
        services = rows
      } catch {
        // semantics schema may not be accessible — graceful degrade
      }

      const externalIds = services.map((r: any) => {
        const entry: any = {
          id: r.relationId,
          relationType: r.relationType,
          effectiveAt: r.effectiveAt,
          asset: {
            id: r.assetId,
            canonicalAssetId: r.canonicalAssetId,
            assetKind: r.assetKind,
          },
        }
        if (r.terrainId !== null) {
          entry.terrain = {
            id: r.terrainId, name: r.terrainName, port: r.terrainPort,
            status: r.terrainStatus, healthCheckUrl: r.terrainHealthCheckUrl,
            workspacePath: r.terrainWorkspacePath, isInternal: r.terrainIsInternal,
          }
        }
        if (r.registryId !== null) {
          entry.registry = {
            id: r.registryId, name: r.registryName, port: r.registryPort,
            status: r.registryStatus, description: r.registryDescription,
            version: r.registryVersion, repositoryUrl: r.registryRepositoryUrl,
          }
        }
        return entry
      })

      const counts = {
        totalServices: externalIds.length,
        terrainServices: externalIds.filter((e: any) => e.terrain).length,
        registryServices: externalIds.filter((e: any) => e.registry).length,
      }

      return response.json({
        system: { id: sys.id, name: sys.name, description: sys.description, path: sys.path },
        externalIds,
        counts,
      })
    } catch (err: any) {
      return response.status(500).json({ error: 'inventory_failed', message: err.message })
    }
  }

  /** GET /api/inventory */
  async inventory({ response }: HttpContext) {
    try {
      const { rows: sysRows } = await q(
        `SELECT s.id AS "systemId", s.name AS "systemName",
                COUNT(DISTINCT sub.id)::int AS "subsystemCount",
                COUNT(DISTINCT feat.id)::int AS "featureCount",
                COUNT(DISTINCT f.id)::int AS "folderCount",
                COUNT(DISTINCT req.id)::int AS "reqCount",
                COUNT(DISTINCT ip.id)::int AS "planCount",
                COUNT(DISTINCT hc.id)::int AS "candidateCount",
                COUNT(DISTINCT ar.id)::int AS "extLinkCount"
         FROM systems s
         LEFT JOIN subsystems sub ON sub.system_id = s.id
         LEFT JOIN features feat ON feat.subsystem_id = sub.id
         LEFT JOIN system_folders f ON f.system_id = s.id
         LEFT JOIN requirements req ON req.system_id = s.id
         LEFT JOIN nebula.implementation_plans ip ON ip.requirement_id = req.id
         LEFT JOIN nebula.harvest_candidates hc ON hc.system_id = s.id
         LEFT JOIN semantics.asset_relation ar ON ar.from_asset_id = s.asset_id AND ar.expired_at IS NULL
         GROUP BY s.id, s.name
         ORDER BY s.name`
      )
      const { rows: subRows } = await q(
        `SELECT sub.id AS "subsystemId", sub.name AS "subsystemName",
                sub.system_id AS "systemId",
                COUNT(DISTINCT feat.id)::int AS "featureCount",
                COUNT(DISTINCT req.id)::int AS "reqCount",
                COUNT(DISTINCT ip.id)::int AS "planCount",
                COUNT(DISTINCT hc.id)::int AS "candidateCount"
         FROM subsystems sub
         LEFT JOIN features feat ON feat.subsystem_id = sub.id
         LEFT JOIN requirements req ON req.subsystem_id = sub.id
         LEFT JOIN nebula.implementation_plans ip ON ip.requirement_id = req.id
         LEFT JOIN nebula.harvest_candidates hc ON hc.subsystem_id = sub.id
         GROUP BY sub.id, sub.name, sub.system_id
         ORDER BY sub.name`
      )
      const { rows: featRows } = await q(
        `SELECT feat.id AS "featureId", feat.name AS "featureName",
                feat.subsystem_id AS "subsystemId",
                COUNT(DISTINCT req.id)::int AS "reqCount",
                COUNT(DISTINCT ip.id)::int AS "planCount",
                COUNT(DISTINCT hc.id)::int AS "candidateCount"
         FROM features feat
         LEFT JOIN requirements req ON req.feature_id = feat.id
         LEFT JOIN nebula.implementation_plans ip ON ip.requirement_id = req.id
         LEFT JOIN nebula.harvest_candidates hc ON hc.feature_id = feat.id
         GROUP BY feat.id, feat.name, feat.subsystem_id
         ORDER BY feat.name`
      )
      const totals = {
        systems: sysRows.length,
        subsystems: subRows.length,
        features: featRows.length,
        requirements: sysRows.reduce((sum: number, r: any) => sum + (r.reqCount || 0), 0),
        plans: sysRows.reduce((sum: number, r: any) => sum + (r.planCount || 0), 0),
        candidates: sysRows.reduce((sum: number, r: any) => sum + (r.candidateCount || 0), 0),
      }
      return response.json({ systems: sysRows, subsystems: subRows, features: featRows, totals })
    } catch (err: any) {
      return response.status(500).json({ error: 'inventory_failed', message: err.message })
    }
  }

  // ── SYSTEM EXTERNAL IDS (deprecated — asset_relation-backed) ────────

  /** GET /api/systems/:id/external-ids */
  async systemExternalIds({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { offset, page, pageSize } = parsePagination(request.qs())
      const { rows: [sys] } = await q(
        'SELECT asset_id FROM systems WHERE id = $1', [id]
      )
      if (!sys) return response.status(404).json({ error: 'System not found' })

      let items: any[] = []
      let total = 0
      try {
        const [dataResult, countResult] = await Promise.all([
          q(
            `SELECT ar.id, ar.relation_type AS "relationType",
                    ar.effective_at AS "effectiveAt",
                    json_build_object('id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                      'assetKind', ca.asset_kind) AS "relatedAsset"
             FROM semantics.asset_relation ar
             JOIN semantics.canonical_asset ca ON ca.id = ar.to_asset_id AND ca.expired_at IS NULL
             WHERE ar.from_asset_id = $1 AND ar.expired_at IS NULL
             ORDER BY ar.relation_type, ar.effective_at DESC
             LIMIT $2 OFFSET $3`,
            [sys.asset_id, pageSize, offset]
          ),
          q(
            'SELECT COUNT(*)::int AS total FROM semantics.asset_relation WHERE from_asset_id = $1 AND expired_at IS NULL',
            [sys.asset_id]
          ),
        ])
        items = dataResult.rows
        total = parseInt(countResult.rows[0].total, 10)
      } catch {
        // semantics not available — return empty
      }
      return response.json({ items, total, page, pageSize })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/systems/:id/external-ids — deprecated */
  async createSystemExternalId({ response }: HttpContext) {
    return response.status(410).json({
      error: 'deprecated',
      message: 'system_external_ids has been replaced by asset_relation. Use POST /api/canonical_asset/:id/external-ids on semantics-srv (port 3160) instead.',
    })
  }

  /** DELETE /api/systems/:id/external-ids/:eid — deprecated */
  async deleteSystemExternalId({ response }: HttpContext) {
    return response.status(410).json({
      error: 'deprecated',
      message: 'system_external_ids has been replaced by asset_relation. Use DELETE /api/canonical_asset/:id/external-ids/:eid on semantics-srv (port 3160) instead.',
    })
  }

  /** GET /api/external-ids — reverse lookup via asset_relation */
  async externalIds({ request, response }: HttpContext) {
    try {
      const { assetId } = request.qs()
      if (!assetId) {
        return response.status(400).json({ error: 'assetId query param is required (migration from sourceSchema/sourceTable/sourceId)' })
      }
      let items: any[] = []
      try {
        const { rows } = await q(
          `SELECT ar.id, ar.relation_type AS "relationType",
                  ar.effective_at AS "effectiveAt",
                  json_build_object('id', ns.id, 'name', ns.name) AS "system"
           FROM semantics.asset_relation ar
           JOIN nebula.systems ns ON ns.asset_id = ar.from_asset_id
           WHERE ar.to_asset_id = $1 AND ar.expired_at IS NULL`,
          [assetId]
        )
        items = rows
      } catch {
        // semantics not available
      }
      return response.json({ items, total: items.length })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** PATCH /api/external-ids/:id — deprecated */
  async patchExternalId({ response }: HttpContext) {
    return response.status(410).json({
      error: 'deprecated',
      message: 'system_external_ids has been replaced by asset_relation. Use PATCH on semantics-srv (port 3160) for asset_relation updates.',
    })
  }
}
