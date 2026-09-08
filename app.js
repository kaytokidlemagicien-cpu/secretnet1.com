const $ = id => document.getElementById(id);

let me = null;

let selectedUser = null;


/* =========================
   الجلسة الخاصة بالتبويب
========================= */

function getToken() {

  return sessionStorage.getItem("sn_token");

}


function clearTabSession() {

  sessionStorage.removeItem("sn_token");

  sessionStorage.removeItem("sn_user");

}


function authHeaders(extra = {}) {

  const token = getToken();

  return {
    ...extra,
    "Authorization": "Bearer " + token
  };

}


/* =========================
   API
========================= */

async function api(url, options = {}) {

  const token = getToken();

  if (!token) {

    location.replace("/login.html");

    throw new Error(
      "لا توجد جلسة."
    );

  }

  const headers = {
    ...(options.headers || {}),
    "Authorization":
      "Bearer " + token
  };


  if (
    options.body &&
    !headers["Content-Type"]
  ) {

    headers["Content-Type"] =
      "application/json";

  }


  const response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    );


  const data =
    await response
      .json()
      .catch(() => ({}));


  if (response.status === 401) {

    clearTabSession();

    location.replace(
      "/login.html"
    );

    throw new Error(
      "انتهت الجلسة."
    );

  }


  if (!response.ok) {

    throw new Error(
      data.error ||
      "حدث خطأ."
    );

  }


  return data;

}


/* =========================
   بدء التطبيق
========================= */

async function init() {

  const token = getToken();

  /*
    إذا لم توجد جلسة في هذا التبويب،
    يجب الذهاب للدخول.
  */

  if (!token) {

    location.replace(
      "/login.html"
    );

    return;

  }


  try {

    const data =
      await api("/api/me");

    me = data.user;

    $("usernameDisplay").textContent =
      me.name;

    $("profileName").textContent =
      me.name;


    await renderAll();

  } catch (error) {

    console.error(error);

  }

}


/* =========================
   كل البيانات
========================= */

async function renderAll() {

  await Promise.all([
    renderFeed(),
    renderFriends(),
    renderMessageUsers()
  ]);

}


/* =========================
   المنشورات
========================= */

async function renderFeed() {

  const data =
    await api(
      "/api/posts?t=" +
      Date.now()
    );


  const feed =
    $("postsFeed");


  if (!data.posts.length) {

    feed.innerHTML = `
      <div class="panel">
        لا توجد منشورات بعد.
        كن أول من ينشر! ✨
      </div>
    `;

    return;

  }


  feed.innerHTML =
    data.posts.map(post => {

      const comments =
        (post.comments || [])
          .map(comment => `

            <div class="comment">

              <strong>
                ${esc(comment.author)}
              </strong>

              : ${esc(comment.body)}

            </div>

          `)
          .join("");


      const image =
        post.image_url
          ? `
            <img
              src="${escAttr(post.image_url)}"
              alt="صورة المنشور"
              onerror="this.remove()"
            >
          `
          : "";


      return `

        <article class="post">

          <div class="postHead">

            <span class="postName">
              👤 ${esc(post.author)}
            </span>

            <span class="date">
              ${formatDate(post.created_at)}
            </span>

          </div>


          ${
            post.body
              ? `
                <div class="postText">
                  ${esc(post.body)}
                </div>
              `
              : ""
          }


          ${image}


          <div class="actions">

            <button
              class="${post.liked ? "liked" : ""}"
              onclick="likePost(${post.id})"
            >
              ❤️ ${post.likes_count || 0}
            </button>

          </div>


          <div>

            ${comments}

          </div>


          <form
            class="commentBox"
            onsubmit="
              commentPost(
                event,
                ${post.id}
              )
            "
          >

            <input
              id="comment-${post.id}"
              maxlength="1000"
              placeholder="اكتب تعليقًا..."
              required
            >

            <button>
              إرسال
            </button>

          </form>

        </article>

      `;

    }).join("");

}


/* =========================
   إنشاء منشور
========================= */

$("publishButton").onclick =
  async function() {

    const bodyInput =
      $("postBody");

    const imageInput =
      $("postImage");

    const button =
      $("publishButton");


    const body =
      bodyInput.value.trim();

    const imageUrl =
      imageInput.value.trim();


    if (!body && !imageUrl) {

      alert(
        "اكتب نصًا أو ضع رابط صورة."
      );

      return;

    }


    button.disabled = true;

    button.textContent =
      "جاري النشر...";


    try {

      await api(
        "/api/posts",
        {
          method: "POST",

          body: JSON.stringify({
            body,
            imageUrl
          })
        }
      );


      bodyInput.value = "";

      imageInput.value = "";


      await renderFeed();

    } catch (error) {

      alert(error.message);

    } finally {

      button.disabled = false;

      button.textContent = "نشر";

    }

  };


/* =========================
   الإعجاب
========================= */

window.likePost =
  async function(postId) {

    try {

      await api(
        `/api/posts/${postId}/like`,
        {
          method: "POST"
        }
      );

      await renderFeed();

    } catch (error) {

      alert(error.message);

    }

  };


/* =========================
   التعليق
========================= */

window.commentPost =
  async function(event, postId) {

    event.preventDefault();


    const input =
      $(`comment-${postId}`);


    const body =
      input.value.trim();


    if (!body) {
      return;
    }


    try {

      await api(
        `/api/posts/${postId}/comments`,
        {
          method: "POST",

          body: JSON.stringify({
            body
          })
        }
      );


      await renderFeed();

    } catch (error) {

      alert(error.message);

    }

  };


/* =========================
   المستخدمون
========================= */

async function renderFriends() {

  const data =
    await api(
      "/api/users?t=" +
      Date.now()
    );


  const container =
    $("friendsList");


  if (!data.users.length) {

    container.innerHTML = `
      <p>
        لا يوجد مستخدمون آخرون حاليًا.
      </p>
    `;

    return;

  }


  container.innerHTML =
    data.users.map(user => `

      <div class="userRow">

        <span>
          👤 ${esc(user.name)}
        </span>

        <button
          onclick="
            startChat(
              ${user.id},
              ${JSON.stringify(user.name)}
            )
          "
        >
          مراسلة
        </button>

      </div>

    `).join("");

}


/* =========================
   قائمة الرسائل
========================= */

async function renderMessageUsers() {

  const data =
    await api(
      "/api/users?t=" +
      Date.now()
    );


  const container =
    $("messageUsers");


  if (!data.users.length) {

    container.innerHTML = `
      <p>
        لا يوجد مستخدمون آخرون.
      </p>
    `;

    return;

  }


  container.innerHTML =
    data.users.map(user => `

      <div class="userRow">

        <span>
          👤 ${esc(user.name)}
        </span>

        <button
          onclick="
            startChat(
              ${user.id},
              ${JSON.stringify(user.name)}
            )
          "
        >
          فتح المحادثة
        </button>

      </div>

    `).join("");

}


/* =========================
   فتح محادثة
========================= */

window.startChat =
  async function(userId, userName) {

    selectedUser = {
      id: userId,
      name: userName
    };


    try {

      const data =
        await api(
          `/api/messages/${userId}?t=${Date.now()}`
        );


      const chat =
        $("chat");


      chat.classList.remove(
        "hidden"
      );


      const messages =
        data.messages || [];


      chat.innerHTML = `

        <h3>
          💬 محادثة مع
          ${esc(userName)}
        </h3>


        <div id="messagesList">

          ${
            messages.length
              ? messages.map(message => `

                <div
                  class="
                    msg
                    ${
                      message.sender_id === me.id
                        ? "me"
                        : ""
                    }
                  "
                >

                  <strong>
                    ${esc(message.sender)}
                  </strong>

                  <br>

                  ${esc(message.body)}

                  <span class="msg-time">
                    ${formatDate(message.created_at)}
                  </span>

                </div>

              `).join("")
              : `
                <p>
                  لا توجد رسائل بعد.
                </p>
              `
          }

        </div>


        <form
          id="chatForm"
          class="chatForm"
        >

          <input
            id="messageInput"
            maxlength="2000"
            placeholder="اكتب رسالة..."
            required
          >

          <button>
            إرسال
          </button>

        </form>

      `;


      const messagesList =
        $("messagesList");


      messagesList.scrollTop =
        messagesList.scrollHeight;


      $("chatForm").onsubmit =
        async function(event) {

          event.preventDefault();

          await sendMessage();

        };


    } catch (error) {

      alert(error.message);

    }

  };


/* =========================
   إرسال رسالة
========================= */

async function sendMessage() {

  if (!selectedUser) {
    return;
  }


  const input =
    $("messageInput");


  const body =
    input.value.trim();


  if (!body) {
    return;
  }


  try {

    await api(
      `/api/messages/${selectedUser.id}`,
      {
        method: "POST",

        body: JSON.stringify({
          body
        })
      }
    );


    input.value = "";


    await startChat(
      selectedUser.id,
      selectedUser.name
    );

  } catch (error) {

    alert(error.message);

  }

}


/* =========================
   حذف منشوراتي
========================= */

$("deleteMyPosts").onclick =
  async function() {

    const confirmed =
      confirm(
        "هل تريد حذف جميع منشوراتك؟"
      );


    if (!confirmed) {
      return;
    }


    try {

      await api(
        "/api/my-posts",
        {
          method: "DELETE"
        }
      );


      await renderFeed();

      alert(
        "تم حذف منشوراتك."
      );

    } catch (error) {

      alert(error.message);

    }

  };


/* =========================
   تسجيل الخروج
========================= */

$("logoutButton").onclick =
  async function() {

    try {

      await api(
        "/api/logout",
        {
          method: "POST"
        }
      );

    } catch (error) {

      console.error(error);

    }


    clearTabSession();


    location.replace(
      "/login.html"
    );

  };


/* =========================
   التنقل داخل نفس التبويب
========================= */

document
  .querySelectorAll("nav button")
  .forEach(button => {

    button.addEventListener(
      "click",
      async function() {

        document
          .querySelectorAll("nav button")
          .forEach(item => {
            item.classList.remove(
              "active"
            );
          });


        this.classList.add(
          "active"
        );


        document
          .querySelectorAll(".view")
          .forEach(view => {
            view.classList.add(
              "hidden"
            );
          });


        const view =
          document.getElementById(
            this.dataset.view
          );


        if (view) {

          view.classList.remove(
            "hidden"
          );

        }


        /*
          تحديث المستخدمين والرسائل
          عند فتح أقسامها.
        */

        if (
          this.dataset.view ===
          "friendsView"
        ) {

          await renderFriends();

        }


        if (
          this.dataset.view ===
          "messagesView"
        ) {

          await renderMessageUsers();

        }

      }
    );

  });


/* =========================
   الأدوات
========================= */

function esc(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character])
  );

}


function escAttr(value) {

  return esc(value)
    .replace(
      /`/g,
      "&#096;"
    );

}


function formatDate(value) {

  return new Date(value)
    .toLocaleString(
      "ar-TN"
    );

}


/* =========================
   تشغيل
========================= */

init();
