-- =====================================================================
-- Nexus Social Media — `assembly` schema (PostgreSQL)
-- Replaces the previous MongoDB collections.
-- Loaded by Spring Boot on startup via spring.sql.init.mode=always.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS assembly;
SET search_path TO assembly;

-- ---------------------------------------------------------------------
-- 1. Users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly.users (
    id          UUID PRIMARY KEY,
    identifier  VARCHAR(255),
    admin       BOOLEAN NOT NULL DEFAULT FALSE,
    alias       VARCHAR(255) UNIQUE NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    avatar_url  VARCHAR(1024)
);

-- Self-referencing M:N joins for the social graph
CREATE TABLE IF NOT EXISTS assembly.user_followers (
    user_id     UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    follower_id UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, follower_id)
);

CREATE TABLE IF NOT EXISTS assembly.user_following (
    user_id     UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, following_id)
);

CREATE TABLE IF NOT EXISTS assembly.user_friends (
    user_id     UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    friend_id   UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, friend_id)
);

-- ---------------------------------------------------------------------
-- 2. Forums
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly.forums (
    id   UUID PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS assembly.forum_members (
    forum_id UUID NOT NULL REFERENCES assembly.forums(id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    PRIMARY KEY (forum_id, user_id)
);

-- ---------------------------------------------------------------------
-- 3. Profiles & Interests
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly.interests (
    id   UUID PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS assembly.profiles (
    id                 UUID PRIMARY KEY,
    first_name         VARCHAR(255),
    last_name          VARCHAR(255),
    city               VARCHAR(255),
    state              VARCHAR(255),
    profile_image_url  VARCHAR(1024),
    user_id            UUID UNIQUE REFERENCES assembly.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assembly.profile_interests (
    profile_id  UUID NOT NULL REFERENCES assembly.profiles(id) ON DELETE CASCADE,
    interest_id UUID NOT NULL REFERENCES assembly.interests(id) ON DELETE CASCADE,
    PRIMARY KEY (profile_id, interest_id)
);

-- ---------------------------------------------------------------------
-- 4. Posts  (AbstractContent fields inlined; @MappedSuperclass)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly.posts (
    id            UUID PRIMARY KEY,
    created       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated       TIMESTAMP,
    text          TEXT,
    url           VARCHAR(1024),
    rating        BIGINT DEFAULT 0,
    posted_by_id  UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    posted_to_id  UUID         REFERENCES assembly.users(id) ON DELETE SET NULL,
    forum_id      BIGINT,
    source_url    VARCHAR(1024),
    title         VARCHAR(512)
);

-- ---------------------------------------------------------------------
-- 5. Comments  (AbstractContent fields inlined; @MappedSuperclass)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly.comments (
    id            UUID PRIMARY KEY,
    created       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated       TIMESTAMP,
    text          TEXT,
    url           VARCHAR(1024),
    rating        BIGINT DEFAULT 0,
    posted_by_id  UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    post_id       UUID         REFERENCES assembly.posts(id) ON DELETE CASCADE,
    parent_id     UUID         REFERENCES assembly.comments(id) ON DELETE CASCADE,
    CONSTRAINT chk_comment_attachment CHECK (
        (post_id IS NOT NULL AND parent_id IS NULL) OR
        (post_id IS NULL AND parent_id IS NOT NULL)
    )
);

-- ---------------------------------------------------------------------
-- 6. Reactions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly.reactions (
    id            UUID PRIMARY KEY,
    created       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reaction_type VARCHAR(50) NOT NULL,
    user_id       UUID NOT NULL REFERENCES assembly.users(id) ON DELETE CASCADE,
    post_id       UUID         REFERENCES assembly.posts(id) ON DELETE CASCADE,
    comment_id    UUID         REFERENCES assembly.comments(id) ON DELETE CASCADE,
    CONSTRAINT chk_reaction_target CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL) OR
        (post_id IS NULL AND comment_id IS NOT NULL)
    ),
    CONSTRAINT chk_reaction_type CHECK (
        reaction_type IN ('LIKE', 'LOVE', 'ANGER', 'SADNESS', 'SURPRISE')
    )
);

-- ---------------------------------------------------------------------
-- 7. Edits
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly.edits (
    id         UUID PRIMARY KEY,
    created    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated    TIMESTAMP,
    text       TEXT NOT NULL,
    post_id    UUID REFERENCES assembly.posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES assembly.comments(id) ON DELETE CASCADE,
    CONSTRAINT chk_edit_target CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL) OR
        (post_id IS NULL AND comment_id IS NOT NULL)
    )
);

-- ---------------------------------------------------------------------
-- Indexes for FK lookups
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_posted_by     ON assembly.posts(posted_by_id);
CREATE INDEX IF NOT EXISTS idx_posts_forum_id      ON assembly.posts(forum_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id    ON assembly.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id  ON assembly.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_reactions_post_id   ON assembly.reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_comment_id ON assembly.reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_edits_post_id       ON assembly.edits(post_id);
CREATE INDEX IF NOT EXISTS idx_edits_comment_id    ON assembly.edits(comment_id);
