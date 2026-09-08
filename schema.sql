-- ==========================================
-- SocialNet Database
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,

    author_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    body TEXT NOT NULL DEFAULT '',

    image_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS post_likes (
    post_id BIGINT NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (post_id, user_id)
);


CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,

    post_id BIGINT NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,

    author_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    body TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,

    sender_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    receiver_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    body TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL
);


CREATE INDEX IF NOT EXISTS posts_created_idx
ON posts(created_at DESC);


CREATE INDEX IF NOT EXISTS comments_post_idx
ON comments(post_id, created_at);


CREATE INDEX IF NOT EXISTS messages_pair_idx
ON messages(
    sender_id,
    receiver_id,
    created_at
);


CREATE INDEX IF NOT EXISTS sessions_user_idx
ON sessions(user_id);


CREATE INDEX IF NOT EXISTS sessions_expiry_idx
ON sessions(expires_at);
