import { pool } from '../db.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const beforeCandidateResult = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM nebula.open_questions oq
       LEFT JOIN nebula.open_question_entities qe
         ON qe.open_question_id = oq.id
         AND qe.entity_type = 'candidate'
       WHERE qe.open_question_id IS NULL
         AND oq.candidate_id IS NOT NULL`
    );
    const beforeCandidateCount = parseInt(beforeCandidateResult.rows[0].cnt, 10);

    const beforeRequirementResult = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM nebula.open_questions oq
       LEFT JOIN nebula.open_question_entities qe
         ON qe.open_question_id = oq.id
         AND qe.entity_type = 'requirement'
       WHERE qe.open_question_id IS NULL
         AND oq.requirement_id IS NOT NULL`
    );
    const beforeRequirementCount = parseInt(beforeRequirementResult.rows[0].cnt, 10);

    console.log(`Open questions missing candidate link but with candidate_id: ${beforeCandidateCount}`);
    console.log(`Open questions missing requirement link but with requirement_id: ${beforeRequirementCount}`);

    const candidateInsertResult = await client.query(
      `INSERT INTO nebula.open_question_entities (open_question_id, entity_type, entity_id)
       SELECT oq.id, 'candidate', oq.candidate_id
       FROM nebula.open_questions oq
       LEFT JOIN nebula.open_question_entities qe
         ON qe.open_question_id = oq.id
         AND qe.entity_type = 'candidate'
       WHERE qe.open_question_id IS NULL
         AND oq.candidate_id IS NOT NULL
       ON CONFLICT DO NOTHING`
    );
    console.log(`Backfilled ${candidateInsertResult.rowCount} open_question_entities rows for candidates.`);

    const requirementInsertResult = await client.query(
      `INSERT INTO nebula.open_question_entities (open_question_id, entity_type, entity_id)
       SELECT oq.id, 'requirement', oq.requirement_id
       FROM nebula.open_questions oq
       LEFT JOIN nebula.open_question_entities qe
         ON qe.open_question_id = oq.id
         AND qe.entity_type = 'requirement'
       WHERE qe.open_question_id IS NULL
         AND oq.requirement_id IS NOT NULL
       ON CONFLICT DO NOTHING`
    );
    console.log(`Backfilled ${requirementInsertResult.rowCount} open_question_entities rows for requirements.`);

    const afterCandidateResult = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM nebula.open_questions oq
       LEFT JOIN nebula.open_question_entities qe
         ON qe.open_question_id = oq.id
         AND qe.entity_type = 'candidate'
       WHERE oq.candidate_id IS NOT NULL
         AND qe.open_question_id IS NULL`
    );
    const afterCandidateCount = parseInt(afterCandidateResult.rows[0].cnt, 10);

    const afterRequirementResult = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM nebula.open_questions oq
       LEFT JOIN nebula.open_question_entities qe
         ON qe.open_question_id = oq.id
         AND qe.entity_type = 'requirement'
       WHERE oq.requirement_id IS NOT NULL
         AND qe.open_question_id IS NULL`
    );
    const afterRequirementCount = parseInt(afterRequirementResult.rows[0].cnt, 10);

    console.log(`Open questions with candidate_id but still missing candidate junction row: ${afterCandidateCount}`);
    console.log(`Open questions with requirement_id but still missing requirement junction row: ${afterRequirementCount}`);

    const noLegacyLinkResult = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM nebula.open_questions oq
       LEFT JOIN nebula.open_question_entities qe ON qe.open_question_id = oq.id
       WHERE oq.candidate_id IS NULL
         AND oq.requirement_id IS NULL
         AND qe.open_question_id IS NULL`
    );
    const noLegacyLinkCount = parseInt(noLegacyLinkResult.rows[0].cnt, 10);
    console.log(`Open questions with no legacy link and still unlinked: ${noLegacyLinkCount}`);

    await client.query('COMMIT');
    console.log('Backfill committed.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
