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
        "Impossible de charger .env :",
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
        "❌ DATABASE_URL est manquante."
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
        "⚠️ Les variables Cloudinary sont absentes. Le téléversement des images ne fonctionnera pas tant qu’elles ne seront pas ajoutées."
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
                            "Type d’image non autorisé. Utilisez JPG, PNG, GIF ou WEBP."
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
        // السماح بعرض صور Cloudinary والصور المرفوعة من مصادر HTTPS.
        // بدون هذا الإعداد قد يمنع Helmet المتصفح من تحميل صور publications
        // وصور الحساب رغم أن رابط Cloudinary صحيح.
        contentSecurityPolicy: {
            directives: {
                "img-src": [
                    "'self'",
                    "data:",
                    "blob:",
                    "https:"
                ]
            }
        },
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
           FRIENDS
        ================================================= */
        await pool.query(`
            CREATE TABLE IF NOT EXISTS friendships (
                id BIGSERIAL PRIMARY KEY,
                requester_id BIGINT,
                addressee_id BIGINT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // ترقية جدول friendships القديم إن كان موجودًا من نسخة سابقة.
        // CREATE TABLE IF NOT EXISTS لا يضيف أعمدة إلى جدول موجود، لذلك نستخدم
        // ALTER TABLE IF NOT EXISTS قبل إنشاء الفهارس والقيود الجديدة.
        await pool.query(`ALTER TABLE friendships ADD COLUMN IF NOT EXISTS requester_id BIGINT`);
        await pool.query(`ALTER TABLE friendships ADD COLUMN IF NOT EXISTS addressee_id BIGINT`);
        await pool.query(`ALTER TABLE friendships ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
        await pool.query(`ALTER TABLE friendships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
        await pool.query(`ALTER TABLE friendships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

        // توافق شامل مع جداول friendships القديمة.
        // بعض النسخ القديمة كانت تستخدم: sender_id/receiver_id أو user1_id/user2_id
        // أو user_id/friend_id. ننقل البيانات القديمة إلى requester_id/addressee_id.
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='sender_id')
                   AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='receiver_id') THEN
                    UPDATE friendships
                    SET requester_id = COALESCE(requester_id, sender_id),
                        addressee_id = COALESCE(addressee_id, receiver_id)
                    WHERE requester_id IS NULL OR addressee_id IS NULL;
                END IF;

                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='user1_id')
                   AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='user2_id') THEN
                    UPDATE friendships
                    SET requester_id = COALESCE(requester_id, user1_id),
                        addressee_id = COALESCE(addressee_id, user2_id)
                    WHERE requester_id IS NULL OR addressee_id IS NULL;
                END IF;

                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='user_id')
                   AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='friend_id') THEN
                    UPDATE friendships
                    SET requester_id = COALESCE(requester_id, user_id),
                        addressee_id = COALESCE(addressee_id, friend_id)
                    WHERE requester_id IS NULL OR addressee_id IS NULL;
                END IF;

                -- الأعمدة القديمة user_id/friend_id قد تكون NOT NULL،
                -- لذلك نجعلها اختيارية بعد نقل البيانات حتى لا تمنع INSERT الجديد.
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='user_id') THEN
                    ALTER TABLE friendships ALTER COLUMN user_id DROP NOT NULL;
                END IF;
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='friend_id') THEN
                    ALTER TABLE friendships ALTER COLUMN friend_id DROP NOT NULL;
                END IF;
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='user1_id') THEN
                    ALTER TABLE friendships ALTER COLUMN user1_id DROP NOT NULL;
                END IF;
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='friendships' AND column_name='user2_id') THEN
                    ALTER TABLE friendships ALTER COLUMN user2_id DROP NOT NULL;
                END IF;
            END $$;
        `);

        // حذف الصفوف القديمة غير الصالحة فقط؛ لا نحذف الصداقات الصحيحة.
        await pool.query(`DELETE FROM friendships WHERE requester_id IS NULL OR addressee_id IS NULL OR requester_id = addressee_id`);
        await pool.query(`ALTER TABLE friendships ALTER COLUMN requester_id SET NOT NULL`);
        await pool.query(`ALTER TABLE friendships ALTER COLUMN addressee_id SET NOT NULL`);
        await pool.query(`ALTER TABLE friendships ALTER COLUMN status SET DEFAULT 'pending'`);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique
            ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships(requester_id, status);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships(addressee_id, status);
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

        /* =================================================
           GROUP CHATS
        ================================================= */
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_chats (
                id BIGSERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                group_id BIGINT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
                user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL DEFAULT 'member',
                joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (group_id, user_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_messages (
                id BIGSERIAL PRIMARY KEY,
                group_id BIGINT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
                sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                body TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await pool.query(`CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members(user_id, group_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS group_messages_group_idx ON group_messages(group_id, created_at);`);



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
            "❌ Erreur de base de données :",
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
   التحقق من تسجيل الConnexion
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
                        "Vous devez d’abord vous connecter."

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
                        "Session invalide."

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
                        "La session a expiré. Reconnectez-vous."

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
   الصفحة Accueil
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
   تسجيل الConnexion
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
                            "Mot de passe incorrect."

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
                            "Le nom doit contenir entre 2 et 30 caractères."

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
                            "Utilisateur introuvable."

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
   تسجيل الDéconnexion
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
                            "Aucune image sélectionnée."

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
                            "Le stockage des images n’est pas configuré. Ajoutez les variables Cloudinary à Render."

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
    uploadLimiter,
    requireAuth,
    upload.single("image"),
    async (req, res, next) => {
        try {
            let imageUrl = String(req.body?.imageUrl || req.body?.image_url || "").trim();

            if (req.file) {
                if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
                    return res.status(500).json({ error: "Le stockage des images n’est pas configuré. Ajoutez les variables Cloudinary à Render." });
                }
                const publicId = crypto.randomBytes(16).toString("hex");
                const result = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({
                        folder: "socialnet/avatars",
                        public_id: publicId,
                        resource_type: "image",
                        overwrite: false,
                        transformation: [{ quality: "auto" }, { fetch_format: "auto" }]
                    }, (error, result) => error ? reject(error) : resolve(result));
                    stream.end(req.file.buffer);
                });
                imageUrl = result.secure_url;
            }

            if (!imageUrl || imageUrl.length > 2000) {
                return res.status(400).json({ error: "Choisissez une image valide." });
            }

            const result = await pool.query(`
                UPDATE users SET avatar_url = $1
                WHERE id = $2
                RETURNING id, name, avatar_url, created_at
            `, [imageUrl, req.user.id]);

            res.json({ ok: true, user: result.rows[0] });
        } catch (err) { next(err); }
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
                            "ID utilisateur invalide."

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
                            "Utilisateur introuvable."

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
   publications Accueil
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
   Créer une publication
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
                            "Veuillez écrire un texte ou choisir une image."

                    });

            }


            if (
                body.length > 5000
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "La publication est trop longue."

                    });

            }


            if (
                imageUrl.length > 2000
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Le lien de l’image est trop long."

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
                            "ID de publication invalide."

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
                            "Publication introuvable."

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
                            "ID de publication invalide."

                    });

            }


            if (!body) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Le commentaire est vide."

                    });

            }


            if (
                body.length > 500
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Le commentaire est trop long."

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
                            "Publication introuvable."

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



async function areFriends(userA, userB) {
    const r = await pool.query(`
        SELECT 1 FROM friendships
        WHERE status='accepted'
          AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))
        LIMIT 1
    `, [userA, userB]);
    return r.rows.length > 0;
}

/* =========================================================
   Messages
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
                            "ID utilisateur invalide."

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
                            "Vous ne pouvez pas vous envoyer de message."

                    });

            }

            if (!(await areFriends(req.user.id, otherUserId))) {
                return res.status(403).json({ error: "Vous pouvez uniquement envoyer des messages à vos amis." });
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
                            "Utilisateur introuvable."

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
   Envoyer رسالة
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
                            "ID utilisateur invalide."

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
                            "Vous ne pouvez pas vous envoyer un message."

                    });

            }


            if (!body) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Le message est vide."

                    });

            }


            if (
                body.length > 2000
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Le message est trop long."

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
                            "Utilisateur introuvable."

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
   نظام Amis
========================================================= */

app.get("/api/friends", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.avatar_url, u.created_at
            FROM users u
            JOIN friendships f ON (
                (f.requester_id = $1 AND f.addressee_id = u.id) OR
                (f.addressee_id = $1 AND f.requester_id = u.id)
            )
            WHERE f.status = 'accepted'
            ORDER BY u.name ASC
        `, [req.user.id]);
        res.json({ friends: result.rows });
    } catch (err) { next(err); }
});

app.get("/api/friends/requests", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT f.id, f.requester_id, f.created_at,
                   u.name, u.avatar_url
            FROM friendships f JOIN users u ON u.id = f.requester_id
            WHERE f.addressee_id = $1 AND f.status = 'pending'
            ORDER BY f.created_at DESC
        `, [req.user.id]);
        const sent = await pool.query(`
            SELECT f.id, f.addressee_id, f.created_at,
                   u.name, u.avatar_url
            FROM friendships f JOIN users u ON u.id = f.addressee_id
            WHERE f.requester_id = $1 AND f.status = 'pending'
            ORDER BY f.created_at DESC
        `, [req.user.id]);
        res.json({ incoming: result.rows, outgoing: sent.rows });
    } catch (err) { next(err); }
});

app.post("/api/friends/request/:userId", requireAuth, async (req, res, next) => {
    try {
        const me = Number(req.user.id);
        const other = Number(req.params.userId);

        if (!Number.isInteger(other) || other <= 0 || other === me) {
            return res.status(400).json({ error: "Demande d’amitié invalide." });
        }

        const user = await pool.query("SELECT id FROM users WHERE id=$1", [other]);
        if (!user.rows.length) {
            return res.status(404).json({ error: "Utilisateur introuvable." });
        }

        // إذا كان هناك طلب من الطرف الآخر إلى المستخدم الحالي، يتم Accepter la demande
        // مباشرة عند الضغط على «Ajouter comme ami». هذا يجعل الإضافة تعمل في الاتجاهين.
        const reversePending = await pool.query(`
            SELECT id, requester_id, addressee_id, status
            FROM friendships
            WHERE requester_id=$1 AND addressee_id=$2 AND status='pending'
            LIMIT 1
        `, [other, me]);

        if (reversePending.rows.length) {
            const accepted = await pool.query(`
                UPDATE friendships
                SET status='accepted', updated_at=NOW()
                WHERE id=$1
                RETURNING *
            `, [reversePending.rows[0].id]);
            return res.json({ ok: true, accepted: true, friendship: accepted.rows[0] });
        }

        const existing = await pool.query(`
            SELECT id, requester_id, addressee_id, status
            FROM friendships
            WHERE (requester_id=$1 AND addressee_id=$2)
               OR (requester_id=$2 AND addressee_id=$1)
            ORDER BY id DESC
            LIMIT 1
        `, [me, other]);

        if (existing.rows.length) {
            const f = existing.rows[0];
            if (f.status === "accepted") {
                return res.status(400).json({ error: "Vous êtes déjà amis." });
            }
            if (f.status === "pending") {
                return res.status(400).json({ error: "La demande d’amitié a déjà été envoyée." });
            }
            await pool.query("DELETE FROM friendships WHERE id=$1", [f.id]);
        }

        const r = await pool.query(`
            INSERT INTO friendships(requester_id, addressee_id, status)
            VALUES($1,$2,'pending')
            RETURNING *
        `, [me, other]);

        res.json({ ok: true, sent: true, friendship: r.rows[0] });
    } catch (err) {
        console.error("Friend request error:", err);
        next(err);
    }
});

app.post("/api/friends/accept/:id", requireAuth, async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "ID de demande d’amitié invalide." });
        }

        const r = await pool.query(`
            UPDATE friendships
            SET status='accepted', updated_at=NOW()
            WHERE id=$1 AND addressee_id=$2 AND status='pending'
            RETURNING id, requester_id, addressee_id, status, created_at, updated_at
        `, [id, Number(req.user.id)]);

        if (!r.rows.length) {
            return res.status(404).json({ error: "La demande d’amitié est introuvable ou a déjà été traitée." });
        }

        res.json({ ok: true, friendship: r.rows[0] });
    } catch (err) {
        console.error("Friend accept error:", err);
        next(err);
    }
});

app.delete("/api/friends/:userId", requireAuth, async (req, res, next) => {
    try {
        const other = Number(req.params.userId);
        await pool.query(`
            DELETE FROM friendships
            WHERE ((requester_id=$1 AND addressee_id=$2)
                OR (requester_id=$2 AND addressee_id=$1))
              AND status='accepted'
        `, [req.user.id, other]);
        res.json({ ok: true });
    } catch (err) { next(err); }
});

/* =========================================================
   مجموعات الدردشة
========================================================= */

app.get("/api/groups", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT
                g.id,
                g.name,
                g.owner_id,
                g.created_at,
                COUNT(DISTINCT gm2.user_id)::int AS member_count,
                COALESCE(MAX(gmsg.created_at), g.created_at) AS last_activity
            FROM group_chats g
            JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
            LEFT JOIN group_members gm2 ON gm2.group_id = g.id
            LEFT JOIN group_messages gmsg ON gmsg.group_id = g.id
            GROUP BY g.id
            ORDER BY last_activity DESC, g.id DESC
        `, [Number(req.user.id)]);
        res.json({ groups: result.rows });
    } catch (err) { next(err); }
});

app.post("/api/groups", writeLimiter, requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
        const name = String(req.body?.name || "").trim();
        let memberIds = Array.isArray(req.body?.member_ids) ? req.body.member_ids : [];
        memberIds = [...new Set(memberIds.map(Number).filter(Number.isInteger).filter(id => id > 0))];
        const me = Number(req.user.id);

        if (name.length < 2 || name.length > 80) {
            return res.status(400).json({ error: "Le nom du groupe doit contenir entre 2 et 80 caractères." });
        }
        memberIds = memberIds.filter(id => id !== me);
        if (memberIds.length < 2) {
            return res.status(400).json({ error: "Choisissez au moins deux amis pour créer un groupe." });
        }
        if (memberIds.length > 49) {
            return res.status(400).json({ error: "Vous pouvez ajouter au maximum 49 amis en plus du créateur du groupe." });
        }

        const friends = await pool.query(`
            SELECT u.id
            FROM users u
            JOIN friendships f ON (
                (f.requester_id=$1 AND f.addressee_id=u.id) OR
                (f.addressee_id=$1 AND f.requester_id=u.id)
            )
            WHERE f.status='accepted' AND u.id = ANY($2::bigint[])
        `, [me, memberIds]);

        if (friends.rows.length !== memberIds.length) {
            return res.status(400).json({ error: "Vous pouvez uniquement ajouter vos amis au groupe." });
        }

        await client.query("BEGIN");
        const group = await client.query(`
            INSERT INTO group_chats(name, owner_id)
            VALUES($1,$2)
            RETURNING id, name, owner_id, created_at
        `, [name, me]);

        await client.query(`
            INSERT INTO group_members(group_id, user_id, role)
            VALUES($1,$2,'owner')
        `, [group.rows[0].id, me]);

        for (const id of memberIds) {
            await client.query(`
                INSERT INTO group_members(group_id, user_id, role)
                VALUES($1,$2,'member')
            `, [group.rows[0].id, id]);
        }

        await client.query("COMMIT");
        res.status(201).json({ ok: true, group: { ...group.rows[0], member_count: memberIds.length + 1 } });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

app.get("/api/groups/:groupId", requireAuth, async (req, res, next) => {
    try {
        const groupId = Number(req.params.groupId);
        if (!Number.isInteger(groupId) || groupId <= 0) return res.status(400).json({ error: "ID de groupe invalide." });

        const group = await pool.query(`
            SELECT g.id, g.name, g.owner_id, g.created_at,
                   COUNT(gm.user_id)::int AS member_count
            FROM group_chats g
            JOIN group_members mine ON mine.group_id=g.id AND mine.user_id=$2
            LEFT JOIN group_members gm ON gm.group_id=g.id
            WHERE g.id=$1
            GROUP BY g.id
        `, [groupId, Number(req.user.id)]);
        if (!group.rows.length) return res.status(404).json({ error: "Le groupe est introuvable ou vous n’en êtes pas membre." });

        const members = await pool.query(`
            SELECT u.id, u.name, u.avatar_url, gm.role, gm.joined_at
            FROM group_members gm JOIN users u ON u.id=gm.user_id
            WHERE gm.group_id=$1
            ORDER BY CASE WHEN gm.role='owner' THEN 0 ELSE 1 END, u.name ASC
        `, [groupId]);

        res.json({ group: group.rows[0], members: members.rows });
    } catch (err) { next(err); }
});

app.get("/api/groups/:groupId/messages", requireAuth, async (req, res, next) => {
    try {
        const groupId = Number(req.params.groupId);
        if (!Number.isInteger(groupId) || groupId <= 0) return res.status(400).json({ error: "ID de groupe invalide." });
        const member = await pool.query(`SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2`, [groupId, Number(req.user.id)]);
        if (!member.rows.length) return res.status(403).json({ error: "Seuls les membres du groupe peuvent voir les messages." });

        const result = await pool.query(`
            SELECT gm.id, gm.group_id, gm.sender_id, gm.body, gm.created_at,
                   u.name AS sender, u.avatar_url AS sender_avatar
            FROM group_messages gm
            JOIN users u ON u.id=gm.sender_id
            WHERE gm.group_id=$1
            ORDER BY gm.created_at ASC
            LIMIT 1000
        `, [groupId]);
        res.json({ messages: result.rows });
    } catch (err) { next(err); }
});

app.post("/api/groups/:groupId/messages", writeLimiter, requireAuth, async (req, res, next) => {
    try {
        const groupId = Number(req.params.groupId);
        const body = String(req.body?.body || "").trim();
        if (!Number.isInteger(groupId) || groupId <= 0) return res.status(400).json({ error: "ID de groupe invalide." });
        if (!body) return res.status(400).json({ error: "Le message est vide." });
        if (body.length > 2000) return res.status(400).json({ error: "Le message est trop long." });
        const member = await pool.query(`SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2`, [groupId, Number(req.user.id)]);
        if (!member.rows.length) return res.status(403).json({ error: "Seuls les membres du groupe peuvent envoyer des messages." });

        const result = await pool.query(`
            INSERT INTO group_messages(group_id, sender_id, body)
            VALUES($1,$2,$3)
            RETURNING id, group_id, sender_id, body, created_at
        `, [groupId, Number(req.user.id), body]);
        res.json({ ok: true, message: result.rows[0] });
    } catch (err) { next(err); }
});

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
                            "La taille de l’image ne doit pas dépasser 5 Mo."

                    });

            }


            return res
                .status(400)
                .json({

                    error:
                        "Une erreur est survenue lors du téléversement de l’image."

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
                    "Une erreur est survenue sur le serveur."

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
                    `🚀 SocialNet fonctionne sur le port ${PORT}`
                );

            }
        );

    } catch (err) {

        console.error(
            "❌ Impossible de démarrer le serveur :",
            err
        );

        process.exit(1);

    }

}


startServer();
