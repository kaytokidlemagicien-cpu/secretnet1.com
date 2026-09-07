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

if (process.env.NODE_ENV === "production" &&
    (!process.env.DATABASE_URL || COOKIE_SECRET === "CHANGE_THIS_SECRET")) {
  console.warn("WARNING: Set DATABASE_URL and a strong COOKIE_SECRET in production.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false
});

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

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
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
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
  } catch (e) {
    next(e);
  }
}

function sameOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const host = req.get("host");
  if (origin && !origin.endsWith(`://${host}`)) {
    return res.status(403).json({ error: "طلب غير مسموح." });
  }
  next();
}

app.use(sameOrigin);
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/enter", authLimiter, async (req, res, next) => {
  try {
    const { password, name } = req.body || {};
    if (password !== SITE_PASSWORD) return res.status(401).json({ error: "كلمة المرور غير صحيحة." });
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 30) {
      return res.status(400).json({ error: "الاسم يجب أن يكون بين حرفين و30 حرفًا." });
    }
    const { rows } = await pool.query(
      `INSERT INTO users(name) VALUES($1)
       ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name
       RETURNING id,name`,
      [clean]
    );
    setAuthCookie(res, rows[0].id);
    res.json({ user: rows[0] });
  } catch (e) { next(e); }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("sn_auth", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
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

app.get("/api/users", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,name,created_at FROM users WHERE id<>$1 ORDER BY name",
      [req.user.id]
    );
    res.json({ users: rows });
  } catch (e) { next(e); }
});

app.get("/api/posts", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id,p.body,p.image_url,p.created_at,u.name AS author,
             COUNT(DISTINCT l.user_id)::int AS likes,
             EXISTS(SELECT 1 FROM post_likes x WHERE x.post_id=p.id AND x.user_id=$1) AS liked
      FROM posts p
      JOIN users u ON u.id=p.author_id
      LEFT JOIN post_likes l ON l.post_id=p.id
      GROUP BY p.id,u.name
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [req.user.id]);

    const ids = rows.map(x => x.id);
    let comments = [];
    if (ids.length) {
      const result = await pool.query(`
        SELECT c.id,c.post_id,c.body,c.created_at,u.name AS author
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

app.post("/api/posts", writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body?.body || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim() || null;
    if (!body && !imageUrl) return res.status(400).json({ error: "اكتب منشورًا أو أضف صورة." });
    if (body.length > 500) return res.status(400).json({ error: "المنشور طويل جدًا." });
    if (imageUrl && imageUrl.length > 1000) return res.status(400).json({ error: "رابط الصورة طويل جدًا." });
    const { rows } = await pool.query(
      "INSERT INTO posts(author_id,body,image_url) VALUES($1,$2,$3) RETURNING id",
      [req.user.id, body, imageUrl]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) { next(e); }
});

app.post("/api/posts/:id/like", writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const exists = await pool.query(
      "SELECT 1 FROM post_likes WHERE post_id=$1 AND user_id=$2",
      [postId, req.user.id]
    );
    if (exists.rowCount) {
      await pool.query("DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2", [postId, req.user.id]);
    } else {
      await pool.query("INSERT INTO post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [postId, req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/posts/:id/comments", writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body?.body || "").trim();
    if (!body || body.length > 250) return res.status(400).json({ error: "التعليق غير صالح." });
    await pool.query(
      "INSERT INTO comments(post_id,author_id,body) VALUES($1,$2,$3)",
      [Number(req.params.id), req.user.id, body]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/messages/:otherId", requireAuth, async (req, res, next) => {
  try {
    const otherId = Number(req.params.otherId);
    const { rows } = await pool.query(`
      SELECT m.id,m.sender_id,m.receiver_id,m.body,m.created_at,u.name AS sender
      FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE (m.sender_id=$1 AND m.receiver_id=$2)
         OR (m.sender_id=$2 AND m.receiver_id=$1)
      ORDER BY m.created_at ASC
      LIMIT 200
    `, [req.user.id, otherId]);
    res.json({ messages: rows });
  } catch (e) { next(e); }
});

app.post("/api/messages/:otherId", writeLimiter, requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body?.body || "").trim();
    const otherId = Number(req.params.otherId);
    if (!body || body.length > 500) return res.status(400).json({ error: "الرسالة غير صالحة." });
    if (!Number.isInteger(otherId) || otherId === req.user.id) return res.status(400).json({ error: "المستخدم غير صالح." });
    await pool.query(
      "INSERT INTO messages(sender_id,receiver_id,body) VALUES($1,$2,$3)",
      [req.user.id, otherId, body]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete("/api/my-posts", writeLimiter, requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM posts WHERE author_id=$1", [req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "حدث خطأ في الخادم." });
});

app.listen(port, () => {
  console.log(`SocialNet running on port ${port}`);
});
