-- V040: Operator continuity queue persistence
-- Stores the FIFO continuity queue per session so it survives service restarts.

CREATE TABLE IF NOT EXISTS operator.continuity_queue (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL,
    summary     TEXT NOT NULL,
    user_message TEXT,
    topic       TEXT,
    position    INT NOT NULL,  -- 0 = oldest, 9 = newest
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_continuity_queue_session
    ON operator.continuity_queue (session_id, position);

-- Function: save a queue item (upserts by session + position)
CREATE OR REPLACE FUNCTION operator.save_queue_item(
    p_session_id TEXT,
    p_summary TEXT,
    p_user_message TEXT,
    p_topic TEXT,
    p_position INT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO operator.continuity_queue (session_id, summary, user_message, topic, position)
    VALUES (p_session_id, p_summary, p_user_message, p_topic, p_position)
    ON CONFLICT (session_id, position)
    DO UPDATE SET
        summary = EXCLUDED.summary,
        user_message = EXCLUDED.user_message,
        topic = EXCLUDED.topic,
        created_at = now();
END;
$$ LANGUAGE plpgsql;

-- Function: load queue for a session
CREATE OR REPLACE FUNCTION operator.load_queue(p_session_id TEXT)
RETURNS TABLE(summary TEXT, user_message TEXT, topic TEXT, item_position INT) AS $$
BEGIN
    RETURN QUERY
    SELECT cq.summary, cq.user_message, cq.topic, cq.position
    FROM operator.continuity_queue cq
    WHERE cq.session_id = p_session_id
    ORDER BY cq.position ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: clear queue for a session
CREATE OR REPLACE FUNCTION operator.clear_queue(p_session_id TEXT)
RETURNS VOID AS $$
BEGIN
    DELETE FROM operator.continuity_queue WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;
