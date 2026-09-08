const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const port = Number(process.env.PORT || 3000);

const SITE_PASSWORD = process.env.SITE_PASSWORD || "Boss2026";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("localhost")
      ? { rejectUnauthorized: false }
      : false
});

/* =========================
   إعدادات أساسية
========================= */

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

const authLimiter = rateLimit({
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

/* =========================
   قاعدة البيانات
========================= */

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS posts (
        id BIGSERIAL PRIMARY KEY,
        author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS post_likes (
        post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (post_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id BIGSERIAL PRIMARY KEY,
        post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

      CREATE INDEX IF NOT EXISTS sessions_expires_idx
      ON sessions(expires_at);
    `);

    console.log("DB Ready");
  } catch (error) {
    console.error("DB initialization error:", error);
  }
}

initDb();

/* =========================
   أدوات الجلسات
========================= */

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function getToken(req) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  return auth.slice(7).trim() || null;
}

async function getSessionUser(req) {
  const token = getToken(req);

  if (!token) {
    return null;
  }

  const { rows } = await pool.query(
    `
    SELECT
      s.token,
      s.user_id,
      s.expires_at,
      u.id,
      u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = $1
      AND s.expires_at > NOW()
    `,
    [token]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    id: rows[0].id,
    name: rows[0].name,
    token
  };
}

async function requireAuth(req, res, next) {
  try {
    const user = await getSessionUser(req);

    if (!user) {
      return res.status(401).json({
        error: "يجب تسجيل الدخول أولاً."
      });
    }

    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
}

/* =========================
   تنظيف الجلسات القديمة
========================= */

async function cleanupSessions() {
  try {
    await pool.query(`
      DELETE FROM sessions
      WHERE expires_at <= NOW()
    `);
  } catch (error) {
    console.error("Session cleanup error:", error);
  }
}

setInterval(cleanupSessions, 60 * 60 * 1000);

/* =========================
   الصفحة الرئيسية
========================= */

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

/* =========================
   تسجيل الدخول
========================= */

app.post("/api/enter", authLimiter, async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "")
      .trim()
      .replace(/\s+/g, " ");

    if (password !== SITE_PASSWORD) {
      return res.status(401).json({
        error: "كلمة المرور غير صحيحة."
      });
    }

    if (name.length < 2 || name.length > 30) {
      return res.status(400).json({
        error: "الاسم يجب أن يكون بين حرفين و30 حرفًا."
      });
    }

    /*
      إذا كان الاسم موجودًا:
      نستعمل نفس المستخدم.
      وبالتالي تبقى منشوراته ورسائله وتعليقاته محفوظة.
    */

    const result = await pool.query(
      `
      INSERT INTO users(name)
      VALUES($1)
      ON CONFLICT(name)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
      `,
      [name]
    );

    const user = result.rows[0];

    /*
      جلسة خاصة بهذا التبويب.
      يتم إرسال الـToken إلى sessionStorage في المتصفح.
    */

    const token = createToken();

    await pool.query(
      `
      INSERT INTO sessions(
        token,
        user_id,
        expires_at
      )
      VALUES(
        $1,
        $2,
        NOW() + INTERVAL '30 days'
      )
      `,
      [token, user.id]
    );

    res.json({
      ok: true,
      token,
      user
    });
  } catch (error) {
    next(error);
  }
});

/* =========================
   تسجيل الخروج
========================= */

app.post("/api/logout", async (req, res, next) => {
  try {
    const token = getToken(req);

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
});

/* =========================
   المستخدم الحالي
========================= */

app.get("/api/me", async (req, res, next) => {
  try {
    const user = await getSessionUser(req);

    if (!user) {
      return res.status(401).json({
        error: "غير مسجل."
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
});

/* =========================
   المستخدمون
========================= */

app.get("/api/users", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT id, name, created_at
      FROM users
      WHERE id <> $1
      ORDER BY name ASC
      `,
      [req.user.id]
    );

    res.json({
      users: rows
    });
  } catch (error) {
    next(error);
  }
});

/* =========================
   المنشورات
========================= */

app.get("/api/posts", requireAuth, async (req, res, next) => {
  try {
    const { rows: posts } = await pool.query(
      `
      SELECT
        p.id,
        p.body,
        p.image_url,
        p.created_at,
        u.name AS author,

        COUNT(DISTINCT pl.user_id)::int AS likes_count,

        EXISTS(
          SELECT 1
          FROM post_likes my_like
          WHERE my_like.post_id = p.id
            AND my_like.user_id = $1
        ) AS liked

      FROM posts p

      JOIN users u
        ON u.id = p.author_id

      LEFT JOIN post_likes pl
        ON pl.post_id = p.id

      GROUP BY
        p.id,
        u.name

      ORDER BY
        p.created_at DESC

      LIMIT 100
      `,
      [req.user.id]
    );

    const postIds = posts.map(post => post.id);

    let comments = [];

    if (postIds.length > 0) {
      const result = await pool.query(
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

        WHERE c.post_id = ANY($1::bigint[])

        ORDER BY c.created_at ASC
        `,
        [postIds]
      );

      comments = result.rows;
    }

    const commentsByPost = {};

    for (const comment of comments) {
      if (!commentsByPost[comment.post_id]) {
        commentsByPost[comment.post_id] = [];
      }

      commentsByPost[comment.post_id].push(comment);
    }

    res.json({
      posts: posts.map(post => ({
        ...post,
        comments: commentsByPost[post.id] || []
      }))
    });
  } catch (error) {
    next(error);
  }
});

/* =========================
   إنشاء منشور
========================= */

app.post(
  "/api/posts",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {
    try {
      const body = String(req.body?.body || "").trim();

      const imageUrl = String(
        req.body?.imageUrl ||
          req.body?.image_url ||
          req.body?.file_url ||
          ""
      ).trim();

      if (!body && !imageUrl) {
        return res.status(400).json({
          error: "يرجى كتابة نص أو وضع رابط صورة."
        });
      }

      if (body.length > 5000) {
        return res.status(400).json({
          error: "المنشور طويل جدًا."
        });
      }

      if (imageUrl.length > 2000) {
        return res.status(400).json({
          error: "رابط الصورة طويل جدًا."
        });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO posts(
          author_id,
          body,
          image_url
        )
        VALUES(
          $1,
          $2,
          $3
        )
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
        id: rows[0].id,
        created_at: rows[0].created_at
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================
   إعجاب
========================= */

app.post(
  "/api/posts/:id/like",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {
    try {
      const postId = Number(req.params.id);

      if (!Number.isInteger(postId)) {
        return res.status(400).json({
          error: "منشور غير صالح."
        });
      }

      const existing = await pool.query(
        `
        SELECT 1
        FROM post_likes
        WHERE post_id = $1
          AND user_id = $2
        `,
        [postId, req.user.id]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `
          DELETE FROM post_likes
          WHERE post_id = $1
            AND user_id = $2
          `,
          [postId, req.user.id]
        );

        return res.json({
          ok: true,
          liked: false
        });
      }

      await pool.query(
        `
        INSERT INTO post_likes(
          post_id,
          user_id
        )
        VALUES(
          $1,
          $2
        )
        ON CONFLICT DO NOTHING
        `,
        [postId, req.user.id]
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

/* =========================
   التعليقات
========================= */

app.post(
  "/api/posts/:id/comments",
  writeLimiter,
  requireAuth,
  async (req, res, next) => {
    try {
      const postId = Number(req.params.id);

      const body = String(
        req.body?.body || ""
      ).trim();

      if (!Number.isInteger(postId)) {
        return res.status(400).json({
          error: "منشور غير صالح."
        });
      }

      if (!body) {
        return res.status(400).json({
          error: "التعليق فارغ."
        });
      }

      if (body.length > 1000) {
        return res.status(400).json({
          error: "التعليق طويل جدًا."
        });
      }

      await pool.query(
        `
        INSERT INTO comments(
          post_id,
          author_id,
          body
        )
        VALUES(
          $1,
          $2,
          $3
        )
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

/* =========================
   حذف منشورات المستخدم
========================= */

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

/* =========================
   الرسائل
========================= */

app.get(
  "/api/messages/:userId",
  requireAuth,
  async (req, res, next) => {
    try {
      const otherUserId = Number(req.params.userId);

      if (
        !Number.isInteger(otherUserId) ||
        otherUserId === req.user.id
      ) {
        return res.status(400).json({
          error: "مستخدم غير صالح."
        });
      }

      const { rows } = await pool.query(
        `
        SELECT
          m.id,
          m.sender_id,
          m.receiver_id,
          m.body,
          m.created_at,
          sender.name AS sender,
          receiver.name AS receiver

        FROM messages m

        JOIN users sender
          ON sender.id = m.sender_id

        JOIN users receiver
          ON receiver.id = m.receiver_id

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

        ORDER BY m.created_at ASC
        `,
        [
          req.user.id,
          otherUserId
        ]
      );

      res.json({
        messages: rows
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
      const receiverId = Number(req.params.userId);

      const body = String(
        req.body?.body || ""
      ).trim();

      if (
        !Number.isInteger(receiverId) ||
        receiverId === req.user.id
      ) {
        return res.status(400).json({
          error: "مستخدم غير صالح."
        });
      }

      if (!body) {
        return res.status(400).json({
          error: "الرسالة فارغة."
        });
      }

      if (body.length > 2000) {
        return res.status(400).json({
          error: "الرسالة طويلة جدًا."
        });
      }

      const receiver = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id = $1
        `,
        [receiverId]
      );

      if (!receiver.rows[0]) {
        return res.status(404).json({
          error: "المستخدم غير موجود."
        });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO messages(
          sender_id,
          receiver_id,
          body
        )
        VALUES(
          $1,
          $2,
          $3
        )
        RETURNING
          id,
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
        message: rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================
   معالجة الأخطاء
========================= */

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);

  res.status(500).json({
    error: "حدث خطأ في الخادم."
  });
});

/* =========================
   الملفات الثابتة
========================= */

app.use(express.static(__dirname));

/* =========================
   تشغيل الخادم
========================= */

app.listen(port, () => {
  console.log(`SocialNet running on port ${port}`);
});
