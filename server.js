const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);

const SITE_PASSWORD = process.env.SITE_PASSWORD || "Boss2026";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "CHANGE_THIS_SECRET";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false
});

// إنشاء الجداول تلقائياً
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
        file_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    `);
    console.log("Database schema ready.");
  } catch (err) {
    console.error("DB init error:", err);
  }
}
initDb();

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use(express.static(__dirname));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120 });

function sign(value) {
  return crypto.createHmac("sha256", COOKIE_SECRET).update(value).digest("base64url");
}

function setAuthCookie(res, userId) {
  const value = String(userId);
  res.cookie("sn_auth", `${value}.${sign(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/"
  });
}

function getUserId(req) {
  const raw = req.headers.cookie || "";
  const match = raw.match(/(?:^|;\s*)sn_auth=([^;]+)/);
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  const dot = decoded.lastIndexOf(".");
  if (dot < 1) return null;
  const id = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = sign(id);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return /^\d+$/.test(id) ? Number(id) : null;
}

async function requireAuth(req, res, next) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول." });
  try {
    const { rows } = await pool.query("SELECT id, name FROM users WHERE id=$1", [userId]);
    if (!rows[0]) return res.status(401).json({ error: "انتهت الجلسة." });
    req.user = rows[0];
    next();
  } catch (e) { next(e); }
}

app.get("/", (req, res) => res.redirect("/login.html"));

app.post("/api/enter", authLimiter, async (req, res, next) => {
  try {
    const { password, name } = req.body || {};
    if (password !== SITE_PASSWORD) return res.status(401).json({ error: "كلمة المرور غير صحيحة." });
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 30) return res.status(400).json({ error: "الاسم يجب أن يكون بين حرفين و30 حرفًا." });
    const { rows } = await pool.query(
      `INSERT INTO users(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name`,
      [clean]
    );
    setAuthCookie(res, rows[0].id);
    res.json({ user: rows[0] });
  } catch (e) { next(e); }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("sn_auth", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "غير مسجل." });
    const { rows } = await pool.query("SELECT id,name FROM users WHERE id=$1", [userId]);
    if (!rows[0]) return res.status(401).json({ error: "غير مسجل." });
    res.json({ user: rows[0] });
  } catch (e) { next(e); }
});

app.get("/api/posts", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.body, p.file_url, p.created_at, u.name AS author
      FROM posts p
      JOIN users u ON u.id=p.author_id
      ORDER BY p.created_at DESC LIMIT 100
    `);

    const ids = rows.map(x => x.id);
    let comments = [];
    if (ids.length) {
      const result = await pool.query(`
        SELECT c.id, c.post_id, c.body, c.created_at, u.name AS author
        FROM comments c JOIN users u ON u.id=c.author_id
        WHERE c.post_id = ANY($1::bigint[])
        ORDER BY c.created_at ASC
      `, [ids]);
      comments = result.rows;
    }
    const byPost = {};
    for (const c of comments) (byPost[c.post_id] ||= []).push(c);
    res.json({ posts: rows.map(p => ({ ...p, comments: byPost[p.id] || [] })) });
  } catch (e) { next(e); }
});

// نشر منشور مع صورة/ملف عبر JSON بدون أخطاء السيرفر
app.post("/api/posts", writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body?.body || "").trim();
    const fileData = req.body?.fileData || null;

    if (!body && !fileData) return res.status(400).json({ error: "اكتب منشورًا أو أضف صورة." });

    const { rows } = await pool.query(
      "INSERT INTO posts(author_id, body, file_url) VALUES($1, $2, $3) RETURNING id",
      [req.user.id, body, fileData]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) { next(e); }
});

// إرسال تعليق
app.post("/api/posts/:id/comments", writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body?.body || "").trim();
    if (!body || body.length > 300) return res.status(400).json({ error: "التعليق غير صالح." });
    await pool.query(
      "INSERT INTO comments(post_id, author_id, body) VALUES($1, $2, $3)",
      [Number(req.params.id), req.user.id, body]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "حدث خطأ في الخادم." });
});

app.listen(port, () => console.log(`Server running on port ${port}`));
