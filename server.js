const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { Pool } = require("pg");
const { v2: cloudinary } = require("cloudinary");


/* =========================================================
   تحميل .env بدون dotenv
========================================================= */

try {
    const envPath = path.join(__dirname, ".env");

    if (fs.existsSync(envPath)) {
        const lines =
            fs.readFileSync(
                envPath,
                "utf8"
            ).split(/\r?\n/);

        for (const line of lines) {

            const trimmed =
                line.trim();

            if (
                !trimmed ||
                trimmed.startsWith("#")
            ) {
                continue;
            }

            const match =
                trimmed.match(
                    /^([\w.-]+)\s*=\s*(.*)$/
                );

            if (!match) continue;

            const key =
                match[1];

            let value =
                match[2].trim();

            if (
                value.length >= 2 &&
                (
                    (
                        value.startsWith('"') &&
                        value.endsWith('"')
                    ) ||
                    (
                        value.startsWith("'") &&
                        value.endsWith("'")
                    )
                )
            ) {
                value =
                    value.slice(
                        1,
                        -1
                    );
            }

            if (
                process.env[key] ===
                undefined
            ) {
                process.env[key] =
                    value;
            }
        }
    }

} catch (err) {

    console.error(
        "تعذر تحميل .env:",
        err.message
    );

}


/* =========================================================
   إعداد التطبيق
========================================================= */

const app =
    express();

const PORT =
    Number(
        process.env.PORT || 3000
    );

const SITE_PASSWORD =
    process.env.SITE_PASSWORD ||
    "Boss2026";

const DATABASE_URL =
    process.env.DATABASE_URL;


/* =========================================================
   التحقق من DATABASE_URL
========================================================= */

if (!DATABASE_URL) {

    console.error(
        "❌ DATABASE_URL غير موجودة."
    );

}


/* =========================================================
   PostgreSQL
========================================================= */

const pool =
    new Pool({

        connectionString:
            DATABASE_URL,

        ssl:
            DATABASE_URL &&
            !DATABASE_URL.includes(
                "localhost"
            )
                ? {
                    rejectUnauthorized:
                        false
                }
                : false
    });


/* =========================================================
   Cloudinary
========================================================= */

const CLOUDINARY_CLOUD_NAME =
    process.env.CLOUDINARY_CLOUD_NAME;

const CLOUDINARY_API_KEY =
    process.env.CLOUDINARY_API_KEY;

const CLOUDINARY_API_SECRET =
    process.env.CLOUDINARY_API_SECRET;


if (
    CLOUDINARY_CLOUD_NAME &&
    CLOUDINARY_API_KEY &&
    CLOUDINARY_API_SECRET
) {

    cloudinary.config({

        cloud_name:
            CLOUDINARY_CLOUD_NAME,

        api_key:
            CLOUDINARY_API_KEY,

        api_secret:
            CLOUDINARY_API_SECRET

    });

    console.log(
        "✅ Cloudinary جاهز."
    );

} else {

    console.warn(
        "⚠️ بيانات Cloudinary غير موجودة. رفع الصور لن يعمل حتى تضيف متغيرات Cloudinary."
    );

}


/* =========================================================
   Multer
========================================================= */

const storage =
    multer.memoryStorage();

const upload =
    multer({

        storage,

        limits: {

            fileSize:
                5 * 1024 * 1024

        },

        fileFilter:
            (req, file, cb) => {

                const allowed =
                    [
                        "image/jpeg",
                        "image/png",
                        "image/gif",
                        "image/webp"
                    ];

                if (
                    allowed.includes(
                        file.mimetype
                    )
                ) {

                    cb(
                        null,
                        true
                    );

                } else {

                    cb(
                        new Error(
                            "نوع الصورة غير مسموح. استخدم JPG أو PNG أو GIF أو WEBP."
                        )
                    );

                }

            }

    });


/* =========================================================
   Middleware
========================================================= */

app.set(
    "trust proxy",
    1
);


app.use(
    helmet({

        crossOriginResourcePolicy: {
            policy:
                "cross-origin"
        }

    })
);


app.use(
    express.json({
        limit:
            "1mb"
    })
);


app.use(
    express.urlencoded({
        extended:
            true
    })
);


/* =========================================================
   Rate Limit
========================================================= */

const authLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        limit:
            30,

        standardHeaders:
            true,

        legacyHeaders:
            false

    });


const writeLimiter =
    rateLimit({

        windowMs:
            60 * 1000,

        limit:
            120,

        standardHeaders:
            true,

        legacyHeaders:
            false

    });


const uploadLimiter =
    rateLimit({

        windowMs:
            60 * 1000,

        limit:
            30,

        standardHeaders:
            true,

        legacyHeaders:
            false

    });


/* =========================================================
   قاعدة البيانات
========================================================= */

async function initDb() {

    try {

        /* =================================================
           توافق مع النسخ القديمة
        ================================================= */

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
                    RENAME COLUMN file_url
                    TO image_url;

                END IF;


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

            END
            $$;
        `);


        /* =================================================
           USERS
        ================================================= */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (

                id BIGSERIAL PRIMARY KEY,

                name TEXT NOT NULL UNIQUE,

                avatar_url TEXT,

                created_at TIMESTAMPTZ
                    NOT NULL DEFAULT NOW()

            );
        `);


        /* =================================================
           إضافة avatar_url للنسخ القديمة
        ================================================= */

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        `);


        /* =================================================
           POSTS
        ================================================= */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS posts (

                id BIGSERIAL PRIMARY KEY,

                author_id BIGINT NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                body TEXT NOT NULL DEFAULT '',

                image_url TEXT,

                created_at TIMESTAMPTZ
                    NOT NULL DEFAULT NOW()

            );
        `);


        /* =================================================
           LIKES
        ================================================= */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS post_likes (

                post_id BIGINT NOT NULL
                    REFERENCES posts(id)
                    ON DELETE CASCADE,

                user_id BIGINT NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                created_at TIMESTAMPTZ
                    NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    post_id,
                    user_id
                )

            );
        `);


        /* =================================================
           COMMENTS
        ================================================= */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (

                id BIGSERIAL PRIMARY KEY,

                post_id BIGINT NOT NULL
                    REFERENCES posts(id)
                    ON DELETE CASCADE,

                author_id BIGINT NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                body TEXT NOT NULL,

                created_at TIMESTAMPTZ
                    NOT NULL DEFAULT NOW()

            );
        `);


        /* =================================================
           MESSAGES
        ================================================= */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (

                id BIGSERIAL PRIMARY KEY,

                sender_id BIGINT NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                receiver_id BIGINT NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                body TEXT NOT NULL,

                created_at TIMESTAMPTZ
                    NOT NULL DEFAULT NOW()

            );
        `);


        /* =================================================
           SESSIONS
           
           لا نحذف الجلسات عند تشغيل السيرفر.
        ================================================= */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (

                token_hash TEXT PRIMARY KEY,

                user_id BIGINT NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                expires_at TIMESTAMPTZ
                    NOT NULL,

                created_at TIMESTAMPTZ
                    NOT NULL DEFAULT NOW()

            );
        `);


        /* =================================================
           INDEXES
        ================================================= */

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            posts_created_idx
            ON posts(created_at DESC);
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            posts_author_idx
            ON posts(author_id);
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            comments_post_idx
            ON comments(
                post_id,
                created_at
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            comments_author_idx
            ON comments(author_id);
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            messages_pair_idx
            ON messages(
                sender_id,
                receiver_id,
                created_at
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            sessions_user_idx
            ON sessions(user_id);
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            sessions_expiry_idx
            ON sessions(expires_at);
        `);


        console.log(
            "✅ PostgreSQL جاهزة."
        );

    } catch (err) {

        console.error(
            "❌ خطأ في قاعدة البيانات:",
            err
        );

        throw err;

    }

}


/* =========================================================
   أدوات الجلسة
========================================================= */

function createToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


function hashToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


/* =========================================================
   التحقق من تسجيل الدخول
========================================================= */

async function requireAuth(
    req,
    res,
    next
) {

    try {

        const header =
            req.headers.authorization ||
            "";


        if (
            !header.startsWith(
                "Bearer "
            )
        ) {

            return res
                .status(401)
                .json({

                    error:
                        "يجب تسجيل الدخول أولاً."

                });

        }


        const token =
            header
                .slice(7)
                .trim();


        if (!token) {

            return res
                .status(401)
                .json({

                    error:
                        "جلسة غير صالحة."

                });

        }


        const tokenHash =
            hashToken(token);


        const result =
            await pool.query(
                `
                SELECT
                    s.user_id,
                    u.name,
                    u.avatar_url,
                    u.created_at

                FROM sessions s

                JOIN users u
                    ON u.id = s.user_id

                WHERE
                    s.token_hash = $1

                    AND s.expires_at > NOW()

                LIMIT 1
                `,
                [tokenHash]
            );


        if (
            !result.rows.length
        ) {

            return res
                .status(401)
                .json({

                    error:
                        "انتهت الجلسة. سجل الدخول من جديد."

                });

        }


        req.user = {

            id:
                result.rows[0].user_id,

            name:
                result.rows[0].name,

            avatar_url:
                result.rows[0].avatar_url,

            created_at:
                result.rows[0].created_at

        };


        next();

    } catch (err) {

        next(err);

    }

}


/* =========================================================
   الصفحة الرئيسية
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.redirect(
            "/login.html"
        );

    }
);


/* =========================================================
   تسجيل الدخول
========================================================= */

app.post(
    "/api/enter",
    authLimiter,
    async (
        req,
        res,
        next
    ) => {

        try {

            const password =
                String(
                    req.body?.password ||
                    ""
                );


            const name =
                String(
                    req.body?.name ||
                    ""
                )
                    .trim()
                    .replace(
                        /\s+/g,
                        " "
                    );


            if (
                password !==
                SITE_PASSWORD
            ) {

                return res
                    .status(401)
                    .json({

                        error:
                            "كلمة المرور غير صحيحة."

                    });

            }


            if (
                name.length < 2 ||
                name.length > 30
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "الاسم يجب أن يكون بين حرفين و30 حرفًا."

                    });

            }


            const userResult =
                await pool.query(
                    `
                    INSERT INTO users(
                        name
                    )

                    VALUES($1)

                    ON CONFLICT(name)
                    DO UPDATE SET
                        name =
                            EXCLUDED.name

                    RETURNING
                        id,
                        name,
                        avatar_url,
                        created_at
                    `,
                    [name]
                );


            const user =
                userResult.rows[0];


            const token =
                createToken();


            const tokenHash =
                hashToken(token);


            await pool.query(
                `
                INSERT INTO sessions(
                    token_hash,
                    user_id,
                    expires_at
                )

                VALUES(
                    $1,
                    $2,
                    NOW() +
                    INTERVAL '30 days'
                )
                `,
                [
                    tokenHash,
                    user.id
                ]
            );


            await pool.query(
                `
                DELETE FROM sessions

                WHERE expires_at <= NOW()
                `
            );


            res.json({

                ok:
                    true,

                token,

                user

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   المستخدم الحالي
========================================================= */

app.get(
    "/api/me",
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        avatar_url,
                        created_at

                    FROM users

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [req.user.id]
                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        error:
                            "المستخدم غير موجود."

                    });

            }


            res.json({

                user:
                    result.rows[0]

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   تسجيل الخروج
========================================================= */

app.post(
    "/api/logout",
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const header =
                req.headers.authorization ||
                "";


            const token =
                header.startsWith(
                    "Bearer "
                )
                    ? header
                        .slice(7)
                        .trim()
                    : null;


            if (token) {

                await pool.query(
                    `
                    DELETE FROM sessions

                    WHERE token_hash = $1
                    `,
                    [
                        hashToken(token)
                    ]
                );

            }


            res.json({

                ok:
                    true

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   رفع صورة من الجهاز
========================================================= */

app.post(
    "/api/upload/image",
    uploadLimiter,
    requireAuth,
    upload.single("image"),
    async (
        req,
        res,
        next
    ) => {

        try {

            if (!req.file) {

                return res
                    .status(400)
                    .json({

                        error:
                            "لم يتم اختيار صورة."

                    });

            }


            if (
                !CLOUDINARY_CLOUD_NAME ||
                !CLOUDINARY_API_KEY ||
                !CLOUDINARY_API_SECRET
            ) {

                return res
                    .status(500)
                    .json({

                        error:
                            "تخزين الصور غير مُعدّ بعد. أضف بيانات Cloudinary إلى Render."

                    });

            }


            /*
             مهم جدًا:

             لا نستخدم اسم الملف الذي اختاره المستخدم.

             يتم إنشاء اسم عشوائي جديد.
            */

            const publicId =
                crypto
                    .randomBytes(16)
                    .toString("hex");


            const result =
                await new Promise(
                    (
                        resolve,
                        reject
                    ) => {

                        const stream =
                            cloudinary.uploader.upload_stream(
                                {

                                    folder:
                                        "socialnet/images",

                                    public_id:
                                        publicId,

                                    resource_type:
                                        "image",

                                    overwrite:
                                        false,

                                    transformation: [
                                        {
                                            quality:
                                                "auto"
                                        },
                                        {
                                            fetch_format:
                                                "auto"
                                        }
                                    ]

                                },

                                (
                                    error,
                                    uploaded
                                ) => {

                                    if (error) {

                                        reject(
                                            error
                                        );

                                    } else {

                                        resolve(
                                            uploaded
                                        );

                                    }

                                }
                            );


                        stream.end(
                            req.file.buffer
                        );

                    }
                );


            res.json({

                ok:
                    true,

                image: {

                    url:
                        result.secure_url,

                    public_id:
                        result.public_id,

                    width:
                        result.width,

                    height:
                        result.height,

                    format:
                        result.format

                }

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   تغيير صورة الملف الشخصي
========================================================= */

app.post(
    "/api/profile/avatar",
    writeLimiter,
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const imageUrl =
                String(
                    req.body?.imageUrl ||
                    req.body?.image_url ||
                    ""
                ).trim();


            if (!imageUrl) {

                return res
                    .status(400)
                    .json({

                        error:
                            "رابط الصورة غير موجود."

                    });

            }


            if (
                imageUrl.length > 2000
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "رابط الصورة طويل جدًا."

                    });

            }


            const result =
                await pool.query(
                    `
                    UPDATE users

                    SET avatar_url = $1

                    WHERE id = $2

                    RETURNING
                        id,
                        name,
                        avatar_url,
                        created_at
                    `,
                    [
                        imageUrl,
                        req.user.id
                    ]
                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        error:
                            "المستخدم غير موجود."

                    });

            }


            res.json({

                ok:
                    true,

                user:
                    result.rows[0]

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   جميع المستخدمين
========================================================= */

app.get(
    "/api/users",
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        avatar_url,
                        created_at

                    FROM users

                    WHERE id <> $1

                    ORDER BY
                        name ASC
                    `,
                    [req.user.id]
                );


            res.json({

                users:
                    result.rows

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   ملف شخصي لأي مستخدم
========================================================= */

app.get(
    "/api/users/:userId",
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "معرف المستخدم غير صالح."

                    });

            }


            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        avatar_url,
                        created_at

                    FROM users

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [userId]
                );


            if (
                !userResult.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        error:
                            "المستخدم غير موجود."

                    });

            }


            const postsResult =
                await pool.query(
                    `
                    SELECT

                        p.id,
                        p.body,
                        p.image_url,
                        p.created_at,

                        u.id AS author_id,
                        u.name AS author,
                        u.avatar_url AS author_avatar,

                        COUNT(
                            DISTINCT l.user_id
                        )::int AS likes_count,

                        EXISTS(
                            SELECT 1

                            FROM post_likes pl

                            WHERE
                                pl.post_id =
                                    p.id

                                AND
                                pl.user_id =
                                    $2
                        ) AS liked

                    FROM posts p

                    JOIN users u
                        ON u.id =
                            p.author_id

                    LEFT JOIN post_likes l
                        ON l.post_id =
                            p.id

                    WHERE
                        p.author_id =
                            $1

                    GROUP BY
                        p.id,
                        u.id,
                        u.name,
                        u.avatar_url

                    ORDER BY
                        p.created_at DESC

                    LIMIT 100
                    `,
                    [
                        userId,
                        req.user.id
                    ]
                );


            const posts =
                postsResult.rows;


            if (!posts.length) {

                return res.json({

                    user:
                        userResult.rows[0],

                    posts:
                        []

                });

            }


            const postIds =
                posts.map(
                    post =>
                        post.id
                );


            const commentsResult =
                await pool.query(
                    `
                    SELECT

                        c.id,
                        c.post_id,
                        c.author_id,
                        c.body,
                        c.created_at,

                        u.name AS author,

                        u.avatar_url
                            AS author_avatar

                    FROM comments c

                    JOIN users u
                        ON u.id =
                            c.author_id

                    WHERE
                        c.post_id =
                            ANY($1::bigint[])

                    ORDER BY
                        c.created_at ASC
                    `,
                    [postIds]
                );


            const commentsByPost =
                {};


            for (
                const comment
                of commentsResult.rows
            ) {

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
                ].push(
                    comment
                );

            }


            res.json({

                user:
                    userResult.rows[0],

                posts:
                    posts.map(
                        post => ({

                            ...post,

                            comments:
                                commentsByPost[
                                    post.id
                                ] || []

                        })
                    )

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   المنشورات الرئيسية
========================================================= */

app.get(
    "/api/posts",
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const postsResult =
                await pool.query(
                    `
                    SELECT

                        p.id,
                        p.body,
                        p.image_url,
                        p.created_at,

                        u.id AS author_id,
                        u.name AS author,
                        u.avatar_url
                            AS author_avatar,

                        COUNT(
                            DISTINCT l.user_id
                        )::int AS likes_count,

                        EXISTS(
                            SELECT 1

                            FROM post_likes pl

                            WHERE
                                pl.post_id =
                                    p.id

                                AND
                                pl.user_id =
                                    $1
                        ) AS liked

                    FROM posts p

                    JOIN users u
                        ON u.id =
                            p.author_id

                    LEFT JOIN post_likes l
                        ON l.post_id =
                            p.id

                    GROUP BY
                        p.id,
                        u.id,
                        u.name,
                        u.avatar_url

                    ORDER BY
                        p.created_at DESC

                    LIMIT 100
                    `,
                    [req.user.id]
                );


            const posts =
                postsResult.rows;


            if (!posts.length) {

                return res.json({

                    posts:
                        []

                });

            }


            const postIds =
                posts.map(
                    post =>
                        post.id
                );


            const commentsResult =
                await pool.query(
                    `
                    SELECT

                        c.id,
                        c.post_id,
                        c.author_id,
                        c.body,
                        c.created_at,

                        u.name AS author,

                        u.avatar_url
                            AS author_avatar

                    FROM comments c

                    JOIN users u
                        ON u.id =
                            c.author_id

                    WHERE
                        c.post_id =
                            ANY($1::bigint[])

                    ORDER BY
                        c.created_at ASC
                    `,
                    [postIds]
                );


            const commentsByPost =
                {};


            for (
                const comment
                of commentsResult.rows
            ) {

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
                ].push(
                    comment
                );

            }


            res.json({

                posts:
                    posts.map(
                        post => ({

                            ...post,

                            comments:
                                commentsByPost[
                                    post.id
                                ] || []

                        })
                    )

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   إنشاء منشور
========================================================= */

app.post(
    "/api/posts",
    writeLimiter,
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const body =
                String(
                    req.body?.body ||
                    ""
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

                return res
                    .status(400)
                    .json({

                        error:
                            "يرجى كتابة نص أو اختيار صورة."

                    });

            }


            if (
                body.length > 5000
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "المنشور طويل جدًا."

                    });

            }


            if (
                imageUrl.length > 2000
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "رابط الصورة طويل جدًا."

                    });

            }


            const result =
                await pool.query(
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

                    RETURNING
                        id,
                        author_id,
                        body,
                        image_url,
                        created_at
                    `,
                    [
                        req.user.id,
                        body,
                        imageUrl ||
                            null
                    ]
                );


            res.json({

                ok:
                    true,

                post:
                    result.rows[0]

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   Like / Unlike
========================================================= */

app.post(
    "/api/posts/:id/like",
    writeLimiter,
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const postId =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(
                    postId
                ) ||
                postId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "معرف المنشور غير صالح."

                    });

            }


            const postCheck =
                await pool.query(
                    `
                    SELECT id

                    FROM posts

                    WHERE id = $1
                    `,
                    [postId]
                );


            if (
                !postCheck.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        error:
                            "المنشور غير موجود."

                    });

            }


            const existing =
                await pool.query(
                    `
                    SELECT 1

                    FROM post_likes

                    WHERE
                        post_id = $1

                        AND
                        user_id = $2
                    `,
                    [
                        postId,
                        req.user.id
                    ]
                );


            if (
                existing.rows.length
            ) {

                await pool.query(
                    `
                    DELETE FROM post_likes

                    WHERE
                        post_id = $1

                        AND
                        user_id = $2
                    `,
                    [
                        postId,
                        req.user.id
                    ]
                );


                return res.json({

                    ok:
                        true,

                    liked:
                        false

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
                [
                    postId,
                    req.user.id
                ]
            );


            res.json({

                ok:
                    true,

                liked:
                    true

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   تعليق
========================================================= */

app.post(
    "/api/posts/:id/comments",
    writeLimiter,
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const postId =
                Number(
                    req.params.id
                );


            const body =
                String(
                    req.body?.body ||
                    ""
                ).trim();


            if (
                !Number.isInteger(
                    postId
                ) ||
                postId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "معرف المنشور غير صالح."

                    });

            }


            if (!body) {

                return res
                    .status(400)
                    .json({

                        error:
                            "التعليق فارغ."

                    });

            }


            if (
                body.length > 500
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "التعليق طويل جدًا."

                    });

            }


            const post =
                await pool.query(
                    `
                    SELECT id

                    FROM posts

                    WHERE id = $1
                    `,
                    [postId]
                );


            if (
                !post.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        error:
                            "المنشور غير موجود."

                    });

            }


            const result =
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

                    RETURNING
                        id,
                        post_id,
                        author_id,
                        body,
                        created_at
                    `,
                    [
                        postId,
                        req.user.id,
                        body
                    ]
                );


            res.json({

                ok:
                    true,

                comment:
                    result.rows[0]

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   حذف جميع منشورات المستخدم
========================================================= */

app.delete(
    "/api/my-posts",
    writeLimiter,
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            await pool.query(
                `
                DELETE FROM posts

                WHERE author_id = $1
                `,
                [req.user.id]
            );


            res.json({

                ok:
                    true

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   الرسائل
========================================================= */

app.get(
    "/api/messages/:userId",
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const otherUserId =
                Number(
                    req.params.userId
                );


            if (
                !Number.isInteger(
                    otherUserId
                ) ||
                otherUserId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "معرف المستخدم غير صالح."

                    });

            }


            if (
                otherUserId ===
                req.user.id
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "لا يمكنك مراسلة نفسك."

                    });

            }


            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        avatar_url,
                        created_at

                    FROM users

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [otherUserId]
                );


            if (
                !userResult.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        error:
                            "المستخدم غير موجود."

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

                        sender.name
                            AS sender,

                        sender.avatar_url
                            AS sender_avatar

                    FROM messages m

                    JOIN users sender
                        ON sender.id =
                            m.sender_id

                    WHERE

                        (
                            m.sender_id = $1
                            AND
                            m.receiver_id = $2
                        )

                        OR

                        (
                            m.sender_id = $2
                            AND
                            m.receiver_id = $1
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

                user:
                    userResult.rows[0],

                messages:
                    result.rows

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   إرسال رسالة
========================================================= */

app.post(
    "/api/messages/:userId",
    writeLimiter,
    requireAuth,
    async (
        req,
        res,
        next
    ) => {

        try {

            const receiverId =
                Number(
                    req.params.userId
                );


            const body =
                String(
                    req.body?.body ||
                    ""
                ).trim();


            if (
                !Number.isInteger(
                    receiverId
                ) ||
                receiverId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "معرف المستخدم غير صالح."

                    });

            }


            if (
                receiverId ===
                req.user.id
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "لا يمكنك إرسال رسالة لنفسك."

                    });

            }


            if (!body) {

                return res
                    .status(400)
                    .json({

                        error:
                            "الرسالة فارغة."

                    });

            }


            if (
                body.length > 2000
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "الرسالة طويلة جدًا."

                    });

            }


            const receiver =
                await pool.query(
                    `
                    SELECT id

                    FROM users

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [receiverId]
                );


            if (
                !receiver.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        error:
                            "المستخدم غير موجود."

                    });

            }


            const result =
                await pool.query(
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

                ok:
                    true,

                message:
                    result.rows[0]

            });

        } catch (err) {

            next(err);

        }

    }
);


/* =========================================================
   الملفات الثابتة
========================================================= */

app.use(
    express.static(
        __dirname
    )
);


/* =========================================================
   أخطاء Multer
========================================================= */

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        if (
            err instanceof
            multer.MulterError
        ) {

            if (
                err.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "حجم الصورة يجب ألا يتجاوز 5 ميغابايت."

                    });

            }


            return res
                .status(400)
                .json({

                    error:
                        "حدث خطأ أثناء رفع الصورة."

                });

        }


        if (
            err &&
            err.message &&
            err.message.includes(
                "نوع الصورة غير مسموح"
            )
        ) {

            return res
                .status(400)
                .json({

                    error:
                        err.message

                });

        }


        next(err);

    }
);


/* =========================================================
   معالجة الأخطاء العامة
========================================================= */

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            "Unhandled Error:",
            err
        );


        if (
            res.headersSent
        ) {

            return next(err);

        }


        res
            .status(500)
            .json({

                error:
                    "حدث خطأ في الخادم."

            });

    }
);


/* =========================================================
   تشغيل الخادم
========================================================= */

async function startServer() {

    try {

        await initDb();


        app.listen(
            PORT,
            () => {

                console.log(
                    `🚀 SocialNet يعمل على المنفذ ${PORT}`
                );

            }
        );

    } catch (err) {

        console.error(
            "❌ تعذر تشغيل الخادم:",
            err
        );

        process.exit(1);

    }

}


startServer();
