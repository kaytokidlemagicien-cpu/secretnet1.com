// ===============================
// SocialNet - Server
// ===============================

try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(".env");
  }
} catch (_) {
  // إذا لم يوجد .env لا توجد مشكلة في بيئة الإنتاج
}

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 3000);

const SITE_PASSWORD =
  process.env.SITE_PASSWORD || "Boss2026";

const SESSION_DAYS = 30;

if (!process.env.DATABASE_URL) {
  console.warn(
    "WARNING: DATABASE_URL غير موجود."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl:
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("localhost")
      ? { rejectUnauthorized: false }
      : false
});


// ======================================
// Middleware
// ======================================

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));


// ======================================
// Rate limits
// ======================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
});


// ======================================
// Database
// ======================================

async function initDb() {

  await pool.query(`
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
      ON messages(sender_id, receiver_id, created_at);

    CREATE INDEX IF NOT EXISTS sessions_user_idx
      ON sessions(user_id);

    CREATE INDEX IF NOT EXISTS sessions_expiry_idx
      ON sessions(expires_at);
  `);

  // ======================================
  // Migration from old version
  // ======================================

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'posts'
          AND column_name = 'file_url'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'posts'
          AND column_name = 'image_url'
        )
        THEN
          ALTER TABLE posts
          RENAME COLUMN file_url TO image_url;
        END IF;

      END $$;
    `);

  } catch (e) {
    console.log(
      "Migration posts:",
      e.message
    );
  }

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'likes'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'post_likes'
        )
        THEN
          ALTER TABLE likes
          RENAME TO post_likes;
        END IF;

      END $$;
    `);

  } catch (e) {
    console.log(
      "Migration likes:",
      e.message
    );
  }

  console.log("Database ready.");
}


// ======================================
// Sessions
// ======================================

function createToken() {

  return crypto
    .randomBytes(32)
    .toString("base64url");
}


async function createSession(userId) {

  const token = createToken();

  const expiresAt =
    new Date(
      Date.now() +
      SESSION_DAYS *
      24 *
      60 *
      60 *
      1000
    );

  await pool.query(
    `
      INSERT INTO sessions
      (token, user_id, expires_at)
      VALUES ($1, $2, $3)
    `,
    [
      token,
      userId,
      expiresAt
    ]
  );

  return token;
}


function getToken(req) {

  const header =
    req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim() || null;
}


async function getUserFromToken(token) {

  if (!token) {
    return null;
  }

  const result =
    await pool.query(
      `
      SELECT
        u.id,
        u.name,
        s.token

      FROM sessions s

      JOIN users u
        ON u.id = s.user_id

      WHERE s.token = $1
      AND s.expires_at > NOW()

      LIMIT 1
      `,
      [token]
    );

  return result.rows[0] || null;
}


async function requireAuth(req, res, next) {

  try {

    const token =
      getToken(req);

    const user =
      await getUserFromToken(token);

    if (!user) {

      return res.status(401).json({
        error:
          "يجب تسجيل الدخول أولاً."
      });

    }

    req.user = user;
    req.token = token;

    next();

  } catch (error) {

    next(error);

  }
}


// ======================================
// Login
// ======================================

app.post(
  "/api/enter",
  loginLimiter,
  async (req, res, next) => {

    try {

      const password =
        String(
          req.body?.password || ""
        );

      const cleanName =
        String(
          req.body?.name || ""
        )
          .trim()
          .replace(/\s+/g, " ");

      if (
        password !== SITE_PASSWORD
      ) {

        return res.status(401).json({
          error:
            "كلمة المرور غير صحيحة."
        });

      }

      if (
        cleanName.length < 2 ||
        cleanName.length > 30
      ) {

        return res.status(400).json({
          error:
            "الاسم يجب أن يكون بين حرفين و30 حرفًا."
        });

      }

      const result =
        await pool.query(
          `
          INSERT INTO users(name)
          VALUES($1)

          ON CONFLICT(name)
          DO UPDATE SET name = EXCLUDED.name

          RETURNING id, name
          `,
          [cleanName]
        );

      const user =
        result.rows[0];

      const token =
        await createSession(user.id);

      res.json({
        ok: true,
        token,
        user
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Current user
// ======================================

app.get(
  "/api/me",
  async (req, res, next) => {

    try {

      const token =
        getToken(req);

      const user =
        await getUserFromToken(token);

      if (!user) {

        return res.status(401).json({
          error:
            "غير مسجل الدخول."
        });

      }

      res.json({
        user: {
          id: user.id,
          name: user.name
        }
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Logout
// ======================================

app.post(
  "/api/logout",
  async (req, res, next) => {

    try {

      const token =
        getToken(req);

      if (token) {

        await pool.query(
          `
          DELETE FROM sessions
          WHERE token = $1
          `,
          [token]
        );

      }

      res.json({
        ok: true
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Users / Friends
// ======================================

app.get(
  "/api/users",
  requireAuth,
  async (req, res, next) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            name,
            created_at

          FROM users

          WHERE id <> $1

          ORDER BY name ASC
          `,
          [req.user.id]
        );

      res.json({
        users: result.rows
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Posts
// ======================================

app.get(
  "/api/posts",
  requireAuth,
  async (req, res, next) => {

    try {

      const postsResult =
        await pool.query(
          `
          SELECT
            p.id,
            p.body,
            p.image_url,
            p.created_at,

            u.name AS author,

            COUNT(
              DISTINCT l.user_id
            )::int AS likes_count,

            EXISTS (
              SELECT 1

              FROM post_likes my_like

              WHERE my_like.post_id = p.id
              AND my_like.user_id = $1

            ) AS liked

          FROM posts p

          JOIN users u
            ON u.id = p.author_id

          LEFT JOIN post_likes l
            ON l.post_id = p.id

          GROUP BY
            p.id,
            u.name

          ORDER BY
            p.created_at DESC

          LIMIT 100
          `,
          [req.user.id]
        );

      const posts =
        postsResult.rows;

      const postIds =
        posts.map(
          post => post.id
        );

      let comments = [];

      if (postIds.length) {

        const commentsResult =
          await pool.query(
            `
            SELECT
              c.id,
              c.post_id,
              c.body,
              c.created_at,
              u.name AS author

            FROM comments c

            JOIN users u
              ON u.id = c.author_id

            WHERE c.post_id =
              ANY($1::bigint[])

            ORDER BY
              c.created_at ASC
            `,
            [postIds]
          );

        comments =
          commentsResult.rows;
      }

      const commentsByPost = {};

      for (const comment of comments) {

        if (
          !commentsByPost[
            comment.post_id
          ]
        ) {

          commentsByPost[
            comment.post_id
          ] = [];

        }

        commentsByPost[
          comment.post_id
        ].push(comment);
      }

      res.json({
        posts: posts.map(post => ({
          ...post,

          comments:
            commentsByPost[
              post.id
            ] || []
        }))
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Create post
// ======================================

app.post(
  "/api/posts",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {

    try {

      const body =
        String(
          req.body?.body || ""
        ).trim();

      const imageUrl =
        String(
          req.body?.imageUrl ||
          req.body?.image_url ||
          req.body?.file_url ||
          ""
        ).trim();

      if (
        !body &&
        !imageUrl
      ) {

        return res.status(400).json({
          error:
            "يرجى كتابة نص أو وضع رابط صورة."
        });

      }

      if (
        body.length > 5000
      ) {

        return res.status(400).json({
          error:
            "المنشور طويل جدًا."
        });

      }

      const result =
        await pool.query(
          `
          INSERT INTO posts
          (author_id, body, image_url)

          VALUES($1, $2, $3)

          RETURNING id, created_at
          `,
          [
            req.user.id,
            body,
            imageUrl || null
          ]
        );

      res.json({
        ok: true,
        post: result.rows[0]
      });

    } catch (error) {

      console.error(
        "Create post error:",
        error
      );

      next(error);

    }

  }
);


// ======================================
// Like / Unlike
// ======================================

app.post(
  "/api/posts/:id/like",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {

    try {

      const postId =
        Number(req.params.id);

      if (!Number.isInteger(postId)) {

        return res.status(400).json({
          error:
            "رقم المنشور غير صحيح."
        });

      }

      const existing =
        await pool.query(
          `
          SELECT 1
          FROM post_likes

          WHERE post_id = $1
          AND user_id = $2

          LIMIT 1
          `,
          [
            postId,
            req.user.id
          ]
        );

      if (existing.rows.length) {

        await pool.query(
          `
          DELETE FROM post_likes

          WHERE post_id = $1
          AND user_id = $2
          `,
          [
            postId,
            req.user.id
          ]
        );

        return res.json({
          ok: true,
          liked: false
        });

      }

      await pool.query(
        `
        INSERT INTO post_likes
        (post_id, user_id)

        VALUES($1, $2)

        ON CONFLICT DO NOTHING
        `,
        [
          postId,
          req.user.id
        ]
      );

      res.json({
        ok: true,
        liked: true
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Comments
// ======================================

app.post(
  "/api/posts/:id/comments",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {

    try {

      const postId =
        Number(req.params.id);

      const body =
        String(
          req.body?.body || ""
        ).trim();

      if (!Number.isInteger(postId)) {

        return res.status(400).json({
          error:
            "رقم المنشور غير صحيح."
        });

      }

      if (!body) {

        return res.status(400).json({
          error:
            "التعليق فارغ."
        });

      }

      if (body.length > 500) {

        return res.status(400).json({
          error:
            "التعليق طويل جدًا."
        });

      }

      await pool.query(
        `
        INSERT INTO comments
        (post_id, author_id, body)

        VALUES($1, $2, $3)
        `,
        [
          postId,
          req.user.id,
          body
        ]
      );

      res.json({
        ok: true
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Delete my posts
// ======================================

app.delete(
  "/api/my-posts",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {

    try {

      await pool.query(
        `
        DELETE FROM posts
        WHERE author_id = $1
        `,
        [req.user.id]
      );

      res.json({
        ok: true
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Messages
// ======================================

app.get(
  "/api/messages/:userId",
  requireAuth,
  async (req, res, next) => {

    try {

      const otherUserId =
        Number(req.params.userId);

      if (
        !Number.isInteger(
          otherUserId
        )
      ) {

        return res.status(400).json({
          error:
            "المستخدم غير صحيح."
        });

      }

      const result =
        await pool.query(
          `
          SELECT
            m.id,
            m.sender_id,
            m.receiver_id,
            m.body,
            m.created_at,

            sender.name AS sender

          FROM messages m

          JOIN users sender
            ON sender.id = m.sender_id

          WHERE
            (
              m.sender_id = $1
              AND m.receiver_id = $2
            )

            OR

            (
              m.sender_id = $2
              AND m.receiver_id = $1
            )

          ORDER BY
            m.created_at ASC

          LIMIT 500
          `,
          [
            req.user.id,
            otherUserId
          ]
        );

      res.json({
        messages:
          result.rows
      });

    } catch (error) {

      next(error);

    }

  }
);


app.post(
  "/api/messages/:userId",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {

    try {

      const receiverId =
        Number(req.params.userId);

      const body =
        String(
          req.body?.body || ""
        ).trim();

      if (
        !Number.isInteger(
          receiverId
        )
      ) {

        return res.status(400).json({
          error:
            "المستخدم غير صحيح."
        });

      }

      if (
        receiverId ===
        Number(req.user.id)
      ) {

        return res.status(400).json({
          error:
            "لا يمكنك إرسال رسالة إلى نفسك."
        });

      }

      if (!body) {

        return res.status(400).json({
          error:
            "الرسالة فارغة."
        });

      }

      if (body.length > 1000) {

        return res.status(400).json({
          error:
            "الرسالة طويلة جدًا."
        });

      }

      const userExists =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          `,
          [receiverId]
        );

      if (!userExists.rows.length) {

        return res.status(404).json({
          error:
            "المستخدم غير موجود."
        });

      }

      const result =
        await pool.query(
          `
          INSERT INTO messages
          (sender_id, receiver_id, body)

          VALUES($1, $2, $3)

          RETURNING
            id,
            sender_id,
            receiver_id,
            body,
            created_at
          `,
          [
            req.user.id,
            receiverId,
            body
          ]
        );

      res.json({
        ok: true,
        message:
          result.rows[0]
      });

    } catch (error) {

      next(error);

    }

  }
);


// ======================================
// Clean expired sessions
// ======================================

setInterval(
  async () => {

    try {

      await pool.query(
        `
        DELETE FROM sessions
        WHERE expires_at <= NOW()
        `
      );

    } catch (error) {

      console.error(
        "Session cleanup error:",
        error
      );

    }

  },
  60 * 60 * 1000
);


// ======================================
// Static files
// ======================================

app.use(
  express.static(__dirname)
);


// ======================================
// Error handler
// ======================================

app.use(
  (error, req, res, next) => {

    console.error(
      "Unhandled error:",
      error
    );

    res.status(500).json({
      error:
        "حدث خطأ في الخادم."
    });

  }
);


// ======================================
// Start
// ======================================

initDb()
  .then(() => {

    app.listen(
      PORT,
      () => {

        console.log(
          `SocialNet running on port ${PORT}`
        );

      }
    );

  })
  .catch(error => {

    console.error(
      "Database initialization failed:",
      error
    );

    process.exit(1);

  });
