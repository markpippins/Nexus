import { Router } from 'express';
import { pool } from '../db.js';

export const countsRouter = Router();

countsRouter.get('/', async (_req, res, next) => {
  try {
    const [
      forumsResult,
      postsResult,
      commentsResult,
      workRequestsResult,
      requirementsResult,
      agendasResult,
      candidatesResult,
      harvestsResult,
      openQuestionsResult,
      intentsResult,
      assessmentsResult,
      observationsResult,
      agentRecordsResult,
      specificationsResult,
      plansResult,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM assembly.forums WHERE expiration_dt = \'infinity\'::timestamptz OR expiration_dt > now()'),
      pool.query('SELECT COUNT(*)::int AS total FROM assembly.posts'),
      pool.query('SELECT COUNT(*)::int AS total FROM assembly.comments'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.work_requests'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.requirements'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.agendas'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.harvest_candidates'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.harvests'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.open_questions'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.intent_records'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.assessments'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.observations'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.agent_records'),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.specifications'),
      pool.query('SELECT COUNT(*)::int AS total FROM conduit.plan_status'),
    ]);

    res.json({
      forums: forumsResult.rows[0].total,
      posts: postsResult.rows[0].total,
      threads: postsResult.rows[0].total,
      comments: commentsResult.rows[0].total,
      workRequests: workRequestsResult.rows[0].total,
      requirements: requirementsResult.rows[0].total,
      agendas: agendasResult.rows[0].total,
      candidates: candidatesResult.rows[0].total,
      harvests: harvestsResult.rows[0].total,
      openQuestions: openQuestionsResult.rows[0].total,
      intents: intentsResult.rows[0].total,
      assessments: assessmentsResult.rows[0].total,
      observations: observationsResult.rows[0].total,
      agentRecords: agentRecordsResult.rows[0].total,
      specifications: specificationsResult.rows[0].total,
      plans: plansResult.rows[0].total,
    });
  } catch (err) {
    next(err);
  }
});
