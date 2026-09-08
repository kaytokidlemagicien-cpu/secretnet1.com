"use strict";

/* =========================================================
   التحقق من تسجيل الConnexion
========================================================= */

if (!SocialNet.requireLogin()) {
    throw new Error("Non connecté");
}


/* =========================================================
   عناصر الصفحة
========================================================= */

const feed = document.getElementById("feed");

const body = document.getElementById("postBody");

const imageInput =
    document.getElementById("postImageFile");

const chooseImage =
    document.getElementById("choosePostImage");

const removeImage =
    document.getElementById("removePostImage");

const imagePreviewBox =
    document.getElementById("postImagePreviewBox");

const imagePreview =
    document.getElementById("postImagePreview");

const selectedImageName =
    document.getElementById("selectedImageName");

const uploadStatus =
    document.getElementById("uploadStatus");

const pub =
    document.getElementById("publish");

const refresh =
    document.getElementById("refresh");

const clearMine =
    document.getElementById("clearMine");


/* =========================================================
   بيانات المستخدم
========================================================= */

async function loadCurrentUser() {

    try {

        const data =
            await SocialNet.me();

        const user =
            data.user;

        if (!user) return;

        sessionStorage.setItem(
            "sn_user",
            JSON.stringify(user)
        );

        updateUserInterface(user);

    } catch (error) {

        console.error(
            "Erreur lors du chargement de l’utilisateur :",
            error
        );

    }

}


/* =========================================================
   تحديث اسم وصورة المستخدم
========================================================= */

function updateUserInterface(user) {

    const name =
        user.name || "...";

    const avatar =
        user.avatar_url || "";

    const topName =
        document.getElementById("topName");

    const sideName =
        document.getElementById("sideName");

    const composerName =
        document.getElementById("composerName");


    if (topName) {
        topName.textContent = name;
    }

    if (sideName) {
        sideName.textContent = name;
    }

    if (composerName) {
        composerName.textContent = name;
    }


    /* =====================================================
       الصورة العلوية
    ===================================================== */

    const topAvatar =
        document.getElementById("topAvatar");

    const topFallback =
        document.getElementById(
            "topAvatarFallback"
        );

    if (topAvatar && topFallback) {

        if (avatar) {

            topAvatar.src = avatar;
            topAvatar.hidden = false;

            topFallback.hidden = true;

        } else {

            topAvatar.hidden = true;
            topFallback.hidden = false;

        }

    }


    /* =====================================================
       صورة barre latérale
    ===================================================== */

    const sideAvatar =
        document.getElementById("sideAvatar");

    const sideFallback =
        document.getElementById(
            "sideAvatarFallback"
        );

    if (sideAvatar && sideFallback) {

        if (avatar) {

            sideAvatar.src = avatar;
            sideAvatar.hidden = false;

            sideFallback.hidden = true;

        } else {

            sideAvatar.hidden = true;
            sideFallback.hidden = false;

        }

    }


    /* =====================================================
       صورة إنشاء المنشور
    ===================================================== */

    const composerAvatar =
        document.getElementById(
            "composerAvatar"
        );

    const composerFallback =
        document.getElementById(
            "composerAvatarFallback"
        );

    if (
        composerAvatar &&
        composerFallback
    ) {

        if (avatar) {

            composerAvatar.src = avatar;
            composerAvatar.hidden = false;

            composerFallback.hidden = true;

        } else {

            composerAvatar.hidden = true;
            composerFallback.hidden = false;

        }

    }

}


/* =========================================================
   تحميل publications
========================================================= */

async function load() {

    feed.innerHTML =
        '<div class="card loading">Chargement des publications...</div>';

    try {

        const data =
            await SocialNet.api(
                "/api/posts"
            );

        const posts =
            data.posts || [];

        if (!posts.length) {

            feed.innerHTML =
                '<div class="card empty">Aucune publication pour le moment. Soyez le premier à publier ! ✨</div>';

            return;
        }

        feed.innerHTML =
            posts.map(render).join("");

    } catch (error) {

        console.error(
            "Erreur lors du chargement des publications :",
            error
        );

        feed.innerHTML =
            '<div class="card empty">' +
            SocialNet.escape(
                error.message
            ) +
            "</div>";

    }

}


/* =========================================================
   إنشاء HTML لصورة المستخدم
========================================================= */

function avatarHTML(
    url,
    name
) {

    if (url) {

        return `
            <img
                class="avatar"
                src="${SocialNet.escapeAttr(url)}"
                alt="${SocialNet.escapeAttr(name)}"
                loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
            >
            <span
                class="avatar avatar-fallback"
                style="display:none"
            >👤</span>
        `;

    }

    return `
        <span class="avatar avatar-fallback">
            👤
        </span>
    `;

}


/* =========================================================
   عرض المنشور
========================================================= */

function render(p) {

    const comments =
        (p.comments || [])
            .map(comment => {

                const commentAvatar =
                    comment.author_avatar ||
                    "";

                return `
                    <div class="comment">

                        <div class="comment-user">

                            ${avatarHTML(
                                commentAvatar,
                                comment.author || ""
                            )}

                            <div>
                                <strong>
                                    ${SocialNet.escape(
                                        comment.author
                                    )}
                                </strong>

                                <small>
                                    ${SocialNet.date(
                                        comment.created_at
                                    )}
                                </small>
                            </div>

                        </div>

                        <div class="comment-text">
                            ${SocialNet.escape(
                                comment.body
                            )}
                        </div>

                    </div>
                `;

            })
            .join("");


    const authorAvatar =
        p.author_avatar || "";


    const image =
        p.image_url
            ? `
                <div class="post-image-container">

                    <img
                        class="post-image"
                        src="${SocialNet.escapeAttr(
                            p.image_url
                        )}"
                        loading="lazy"
                        alt="Image de la publication"
                        onerror="this.style.display='none'"
                    >

                </div>
            `
            : "";


    return `
        <article
            class="card post"
            data-post-id="${p.id}"
        >

            <div class="post-head">

                <div class="author">

                    ${avatarHTML(
                        authorAvatar,
                        p.author || ""
                    )}

                    <div>

                        <strong>
                            ${SocialNet.escape(
                                p.author
                            )}
                        </strong>

                        <small>
                            ${SocialNet.date(
                                p.created_at
                            )}
                        </small>

                    </div>

                </div>

            </div>


            ${
                p.body
                    ? `
                        <div class="post-body">
                            ${SocialNet.escape(
                                p.body
                            ).replace(
                                /\n/g,
                                "<br>"
                            )}
                        </div>
                    `
                    : ""
            }


            ${image}


            <div class="post-tools">

                <button
                    class="like ${p.liked ? "liked" : ""}"
                    data-like="${p.id}"
                    type="button"
                >
                    ❤️
                    <span>
                        ${p.likes_count || 0}
                    </span>
                </button>

            </div>


            <div class="comments">

                ${
                    comments ||
                    '<span class="muted">Aucun commentaire pour le moment.</span>'
                }

            </div>


            <form
                class="comment-form"
                data-comment="${p.id}"
            >

                <input
                    maxlength="500"
                    placeholder="Écrire un commentaire..."
                    required
                >

                <button
                    type="submit"
                    class="btn btn-soft"
                >
                    Envoyer
                </button>

            </form>

        </article>
    `;
}


/* =========================================================
   Choisir une image depuis l’appareil
========================================================= */

chooseImage.addEventListener(
    "click",
    () => {

        imageInput.click();

    }
);


/* =========================================================
   عند اختيار الصورة
========================================================= */

imageInput.addEventListener(
    "change",
    () => {

        const file =
            imageInput.files?.[0];

        if (!file) {

            resetImageSelection();

            return;
        }


        /* ===================================================
           التحقق من نوع الصورة
        =================================================== */

        if (
            !file.type ||
            !file.type.startsWith("image/")
        ) {

            alert(
                "Le fichier sélectionné n’est pas une image."
            );

            resetImageSelection();

            return;
        }


        /* ===================================================
           الحد الأقصى 5MB
        =================================================== */

        const maxSize =
            5 * 1024 * 1024;

        if (file.size > maxSize) {

            alert(
                "L’image est trop volumineuse.\n\n" +
                "La taille maximale est de 5 Mo."
            );

            resetImageSelection();

            return;
        }


        /* ===================================================
           الاسم
        =================================================== */

        selectedImageName.textContent =
            file.name;


        /* ===================================================
           المعاينة
        =================================================== */

        const oldUrl =
            imagePreview.dataset.objectUrl;

        if (oldUrl) {

            URL.revokeObjectURL(
                oldUrl
            );

        }


        const objectUrl =
            URL.createObjectURL(file);

        imagePreview.src =
            objectUrl;

        imagePreview.dataset.objectUrl =
            objectUrl;


        imagePreviewBox.hidden =
            false;


        uploadStatus.textContent =
            "";


        uploadStatus.className =
            "upload-status";

    }
);


/* =========================================================
   حذف الصورة المختارة
========================================================= */

removeImage.addEventListener(
    "click",
    resetImageSelection
);


function resetImageSelection() {

    const oldUrl =
        imagePreview.dataset.objectUrl;

    if (oldUrl) {

        URL.revokeObjectURL(
            oldUrl
        );

    }


    imagePreview.removeAttribute(
        "src"
    );

    imagePreview.removeAttribute(
        "data-object-url"
    );


    imageInput.value =
        "";


    selectedImageName.textContent =
        "Aucune image sélectionnée";


    imagePreviewBox.hidden =
        true;


    uploadStatus.textContent =
        "";

    uploadStatus.className =
        "upload-status";

}


/* =========================================================
   رفع الصورة
========================================================= */

async function uploadSelectedImage() {

    const file =
        imageInput.files?.[0];

    if (!file) {

        return null;

    }


    uploadStatus.textContent =
        "⏳ Téléversement de l’image...";


    uploadStatus.className =
        "upload-status uploading";


    try {

        const formData =
            new FormData();

        /*
         مهم جدًا:
         اسم الحقل يجب أن يكون image
         لأنه نفس الاسم الذي سيستقبله server.js
        */

        formData.append(
            "image",
            file
        );


        const data =
            await SocialNet.api(
                "/api/upload/image",
                {
                    method: "POST",
                    body: formData
                }
            );


        if (
            !data ||
            !data.image ||
            !data.image.url
        ) {

            throw new Error(
                "Le serveur n’a pas renvoyé le lien de l’image."
            );

        }


        uploadStatus.textContent =
            "✅ Image téléversée avec succès.";

        uploadStatus.className =
            "upload-status success";


        return data.image.url;

    } catch (error) {

        uploadStatus.textContent =
            "❌ " + error.message;

        uploadStatus.className =
            "upload-status error";


        throw error;

    }

}


/* =========================================================
   Publier
========================================================= */

pub.addEventListener(
    "click",
    async () => {

        const text =
            body.value.trim();

        const hasImage =
            imageInput.files &&
            imageInput.files.length > 0;


        if (!text && !hasImage) {

            alert(
                "Écrivez quelque chose ou choisissez une image."
            );

            return;
        }


        pub.disabled =
            true;

        chooseImage.disabled =
            true;

        pub.textContent =
            "Publication en cours...";


        try {

            let imageUrl =
                null;


            /* ===============================================
               رفع الصورة أولًا
            =============================================== */

            if (hasImage) {

                imageUrl =
                    await uploadSelectedImage();

            }


            /* ===============================================
               إنشاء المنشور
            =============================================== */

            await SocialNet.api(
                "/api/posts",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        body: text,

                        imageUrl:
                            imageUrl || ""

                    })

                }
            );


            /* ===============================================
               تنظيف النموذج
            =============================================== */

            body.value =
                "";

            resetImageSelection();


            /* ===============================================
               تحديث publications
            =============================================== */

            await load();


            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });


        } catch (error) {

            console.error(
                "Erreur lors de la publication :",
                error
            );

            alert(
                error.message ||
                "Impossible de publier la publication."
            );

        } finally {

            pub.disabled =
                false;

            chooseImage.disabled =
                false;

            pub.textContent =
                "Publier";

        }

    }
);


/* =========================================================
   الJ’aime
========================================================= */

feed.addEventListener(
    "click",
    async event => {

        const button =
            event.target.closest(
                "[data-like]"
            );

        if (!button) return;


        const postId =
            button.dataset.like;


        button.disabled =
            true;


        try {

            await SocialNet.api(
                "/api/posts/" +
                postId +
                "/like",
                {
                    method: "POST"
                }
            );


            await load();

        } catch (error) {

            alert(
                error.message
            );

        } finally {

            button.disabled =
                false;

        }

    }
);


/* =========================================================
   التعليقات
========================================================= */

feed.addEventListener(
    "submit",
    async event => {

        const form =
            event.target.closest(
                "[data-comment]"
            );

        if (!form) return;


        event.preventDefault();


        const postId =
            form.dataset.comment;

        const input =
            form.querySelector(
                "input"
            );

        const button =
            form.querySelector(
                "button"
            );


        const comment =
            input.value.trim();


        if (!comment) return;


        button.disabled =
            true;


        try {

            await SocialNet.api(
                "/api/posts/" +
                postId +
                "/comments",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        body: comment
                    })
                }
            );


            input.value =
                "";

            await load();

        } catch (error) {

            alert(
                error.message
            );

        } finally {

            button.disabled =
                false;

        }

    }
);


/* =========================================================
   تحديث publications
========================================================= */

refresh.addEventListener(
    "click",
    async () => {

        refresh.disabled =
            true;

        refresh.textContent =
            "⏳ Actualisation...";

        try {

            await load();

        } finally {

            refresh.disabled =
                false;

            refresh.textContent =
                "↻ Actualiser";

        }

    }
);


/* =========================================================
   حذف جميع منشورات المستخدم
========================================================= */

clearMine.addEventListener(
    "click",
    async () => {

        const confirmed =
            confirm(
                "Voulez-vous supprimer toutes vos publications ?\n\n" +
                "Cette action est définitive."
            );


        if (!confirmed) return;


        clearMine.disabled =
            true;


        try {

            await SocialNet.api(
                "/api/my-posts",
                {
                    method: "DELETE"
                }
            );


            await load();


        } catch (error) {

            alert(
                error.message
            );


        } finally {

            clearMine.disabled =
                false;

        }

    }
);


/* =========================================================
   بدء الصفحة
========================================================= */

(async function init() {

    await loadCurrentUser();

    await load();

})();
