-- nebula-harvest-blocks-function.sql
-- Creates nebula.harvest_blocks() — flattens docklang discourse_units blocks
-- into a queryable tabular format without a physical migration.
--
-- Usage:
--   SELECT * FROM nebula.harvest_blocks();                    -- all blocks (~33k)
--   SELECT * FROM nebula.harvest_blocks('uuid-here');         -- one harvest
--   SELECT * FROM nebula.harvest_blocks(NULL);                 -- all blocks
--
-- See also:
--   The harvest_candidates table (already extracted) for work-item candidates.
--   This function extracts the conversational content from docklang instead.

CREATE OR REPLACE FUNCTION nebula.harvest_blocks(p_harvest_id uuid DEFAULT NULL)
RETURNS TABLE(
    harvest_id       uuid,
    harvest_title    text,
    conversation_id  uuid,
    turn_index       integer,
    heading          text,
    role             text,
    block_index      integer,
    block_type       text,
    content          text,
    items            text[]
)
LANGUAGE sql STABLE
AS $$
    SELECT
        h.id                                                       AS harvest_id,
        h.docklang #>> '{meta,title}'                              AS harvest_title,
        NULLIF(h.docklang #>> '{meta,provenance,conversation_id}', '')::uuid
                                                                    AS conversation_id,
        (du #>> '{provenance,turn_index}')::integer                 AS turn_index,
        du #>> '{heading}'                                          AS heading,
        du #>> '{provenance,role}'                                  AS role,
        (b #>> '{provenance,block_index}')::integer                 AS block_index,
        b #>> '{type}'                                              AS block_type,
        CASE
            WHEN b ? 'content' THEN b #>> '{content}'
            ELSE NULL::text
        END                                                         AS content,
        CASE
            WHEN b ? 'items' THEN ARRAY(
                SELECT elem
                FROM jsonb_array_elements_text(b -> 'items') AS elem
            )
            ELSE NULL::text[]
        END                                                         AS items
    FROM nebula.harvests h
    CROSS JOIN LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') AS du
    CROSS JOIN LATERAL jsonb_array_elements(du -> 'blocks') AS b
    WHERE h.docklang IS NOT NULL
      AND h.docklang != '{}'::jsonb
      AND (p_harvest_id IS NULL OR h.id = p_harvest_id);
$$;

COMMENT ON FUNCTION nebula.harvest_blocks(uuid) IS
    'Flattens docklang discourse_units blocks into a queryable table.
     Returns one row per block with harvest context.
     Block types: paragraph (content), list (items[]), quote (content),
     code (content), diagram (content), separator (no content/items).

     Usage:
       SELECT * FROM nebula.harvest_blocks();               -- all blocks
       SELECT * FROM nebula.harvest_blocks(''some-uuid'');  -- one harvest';
