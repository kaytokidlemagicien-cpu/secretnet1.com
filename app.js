// ==========================================
// SocialNet - Client
// ==========================================

const SocialNet = {

  getToken() {

    return sessionStorage.getItem(
      "sn_token"
    );

  },


  getUser() {

    try {

      return JSON.parse(
        sessionStorage.getItem(
          "sn_user"
        ) || "null"
      );

    } catch {

      return null;

    }

  },


  saveSession(data) {

    sessionStorage.setItem(
      "sn_token",
      data.token
    );

    sessionStorage.setItem(
      "sn_user",
      JSON.stringify(data.user)
    );

  },


  clearSession() {

    sessionStorage.removeItem(
      "sn_token"
    );

    sessionStorage.removeItem(
      "sn_user"
    );

  },


  async api(url, options = {}) {

    const token =
      this.getToken();

    const headers = {
      ...(options.body
        ? {
            "Content-Type":
              "application/json"
          }
        : {}),
      ...(options.headers || {})
    };

    if (token) {

      headers.Authorization =
        "Bearer " + token;

    }

    const response =
      await fetch(url, {
        ...options,
        headers
      });

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (
      response.status === 401
    ) {

      this.clearSession();

      if (
        !location.pathname.endsWith(
          "/login.html"
        )
      ) {

        location.replace(
          "/login.html"
        );

      }

      throw new Error(
        data.error ||
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

  },


  async requireLogin() {

    const token =
      this.getToken();

    if (!token) {

      location.replace(
        "/login.html"
      );

      return null;

    }

    try {

      const data =
        await this.api(
          "/api/me"
        );

      sessionStorage.setItem(
        "sn_user",
        JSON.stringify(
          data.user
        )
      );

      return data.user;

    } catch {

      return null;

    }

  },


  async logout() {

    try {

      await this.api(
        "/api/logout",
        {
          method: "POST"
        }
      );

    } catch (_) {

      // لا مشكلة إذا انتهت الجلسة
    }

    this.clearSession();

    location.replace(
      "/login.html"
    );

  }

};


// ==========================================
// HTML escaping
// ==========================================

function escapeHtml(value) {

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


// ==========================================
// Format date
// ==========================================

function formatDate(value) {

  try {

    return new Date(
      value
    ).toLocaleString(
      "ar-TN",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );

  } catch {

    return "";

  }

}


// ==========================================
// Navigation
// ==========================================

function setupNavigation() {

  const current =
    location.pathname
      .split("/")
      .pop() ||
    "index.html";

  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(link => {

      const href =
        link
          .getAttribute("href")
          ?.split("/")
          .pop();

      if (
        href === current
      ) {

        link.classList.add(
          "active"
        );

      }

    });

}


// ==========================================
// Common header
// ==========================================

async function setupUserHeader() {

  const user =
    await SocialNet.requireLogin();

  if (!user) return;

  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(element => {

      element.textContent =
        user.name;

    });

  const logoutButton =
    document.getElementById(
      "logoutButton"
    );

  if (logoutButton) {

    logoutButton.onclick =
      () => SocialNet.logout();

  }

  setupNavigation();

  return user;

}


// ==========================================
// HOME
// ==========================================

async function initHome() {

  const user =
    await setupUserHeader();

  if (!user) return;

  await loadPosts();

  const publishButton =
    document.getElementById(
      "publishButton"
    );

  if (publishButton) {

    publishButton.onclick =
      createPost;

  }

}


async function loadPosts() {

  const feed =
    document.getElementById(
      "postsFeed"
    );

  if (!feed) return;

  try {

    const data =
      await SocialNet.api(
        "/api/posts"
      );

    if (
      !data.posts.length
    ) {

      feed.innerHTML = `
        <div class="card empty">
          لا توجد منشورات بعد.
          كن أول من ينشر! ✨
        </div>
      `;

      return;

    }

    feed.innerHTML =
      data.posts
        .map(renderPost)
        .join("");

  } catch (error) {

    feed.innerHTML = `
      <div class="card error-box">
        ${escapeHtml(error.message)}
      </div>
    `;

  }

}


function renderPost(post) {

  const comments =
    (post.comments || [])
      .map(comment => `
        <div class="comment-item">

          <div class="comment-author">
            👤
            ${escapeHtml(
              comment.author
            )}
          </div>

          <div class="comment-body">
            ${escapeHtml(
              comment.body
            )}
          </div>

        </div>
      `)
      .join("");

  const image =
    post.image_url
      ? `
        <img
          src="${escapeHtml(
            post.image_url
          )}"
          class="post-image"
          alt="صورة المنشور"
          onerror="this.style.display='none'"
        >
      `
      : "";

  return `
    <article class="card post-card">

      <div class="post-header">

        <div class="post-author">
          <span class="avatar-small">
            👤
          </span>

          <strong>
            ${escapeHtml(
              post.author
            )}
          </strong>
        </div>

        <span class="post-date">
          ${formatDate(
            post.created_at
          )}
        </span>

      </div>

      ${
        post.body
          ? `
            <div class="post-content">
              ${escapeHtml(
                post.body
              )}
            </div>
          `
          : ""
      }

      ${image}

      <div class="post-actions">

        <button
          class="like-button ${
            post.liked
              ? "liked"
              : ""
          }"
          onclick="toggleLike(${post.id})"
        >
          ❤️
          <span>
            ${post.likes_count || 0}
          </span>
        </button>

      </div>

      <div class="comments">

        ${
          comments ||
          `<div class="no-comments">
            لا توجد تعليقات بعد.
          </div>`
        }

      </div>

      <div class="comment-form">

        <input
          id="comment-${post.id}"
          type="text"
          maxlength="500"
          placeholder="اكتب تعليقًا..."
        >

        <button
          onclick="sendComment(${post.id})"
          class="btn-primary"
        >
          إرسال
        </button>

      </div>

    </article>
  `;

}


async function createPost() {

  const bodyInput =
    document.getElementById(
      "postBody"
    );

  const imageInput =
    document.getElementById(
      "postImage"
    );

  const button =
    document.getElementById(
      "publishButton"
    );

  const body =
    bodyInput.value.trim();

  const imageUrl =
    imageInput.value.trim();

  if (
    !body &&
    !imageUrl
  ) {

    alert(
      "اكتب شيئًا أو ضع رابط صورة."
    );

    return;

  }

  button.disabled = true;

  button.textContent =
    "جاري النشر...";

  try {

    await SocialNet.api(
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

    await loadPosts();

  } catch (error) {

    alert(
      error.message
    );

  } finally {

    button.disabled = false;

    button.textContent =
      "نشر";

  }

}


async function toggleLike(
  postId
) {

  try {

    await SocialNet.api(
      `/api/posts/${postId}/like`,
      {
        method: "POST"
      }
    );

    await loadPosts();

  } catch (error) {

    alert(
      error.message
    );

  }

}


async function sendComment(
  postId
) {

  const input =
    document.getElementById(
      `comment-${postId}`
    );

  if (!input) return;

  const body =
    input.value.trim();

  if (!body) return;

  try {

    await SocialNet.api(
      `/api/posts/${postId}/comments`,
      {
        method: "POST",

        body: JSON.stringify({
          body
        })
      }
    );

    input.value = "";

    await loadPosts();

  } catch (error) {

    alert(
      error.message
    );

  }

}


// ==========================================
// PROFILE
// ==========================================

async function initProfile() {

  const user =
    await setupUserHeader();

  if (!user) return;

  const name =
    document.getElementById(
      "profileName"
    );

  if (name) {

    name.textContent =
      user.name;

  }

}


// ==========================================
// FRIENDS
// ==========================================

async function initFriends() {

  const user =
    await setupUserHeader();

  if (!user) return;

  const list =
    document.getElementById(
      "friendsList"
    );

  if (!list) return;

  try {

    const data =
      await SocialNet.api(
        "/api/users"
      );

    if (
      !data.users.length
    ) {

      list.innerHTML = `
        <div class="empty">
          لا يوجد مستخدمون آخرون حاليًا.
        </div>
      `;

      return;

    }

    list.innerHTML =
      data.users
        .map(friend => `
          <div class="user-row">

            <div class="user-info-row">

              <div class="avatar">
                👤
              </div>

              <strong>
                ${escapeHtml(
                  friend.name
                )}
              </strong>

            </div>

            <a
              href="messages.html?user=${friend.id}"
              class="btn-primary small-button"
            >
              💬 مراسلة
            </a>

          </div>
        `)
        .join("");

  } catch (error) {

    list.innerHTML = `
      <div class="error-box">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;

  }

}


// ==========================================
// MESSAGES
// ==========================================

let selectedMessageUser = null;


async function initMessages() {

  const currentUser =
    await setupUserHeader();

  if (!currentUser) return;

  await loadMessageUsers();

  const params =
    new URLSearchParams(
      location.search
    );

  const userId =
    Number(
      params.get("user")
    );

  if (
    Number.isInteger(userId) &&
    userId > 0
  ) {

    const userButtons =
      document.querySelectorAll(
        "[data-message-user]"
      );

    const found =
      Array.from(
        userButtons
      ).find(
        button =>
          Number(
            button.dataset.messageUser
          ) === userId
      );

    if (found) {

      openConversation(
        userId,
        found.dataset.userName
      );

    }

  }

}


async function loadMessageUsers() {

  const list =
    document.getElementById(
      "messageUsers"
    );

  if (!list) return;

  try {

    const data =
      await SocialNet.api(
        "/api/users"
      );

    if (
      !data.users.length
    ) {

      list.innerHTML = `
        <div class="empty">
          لا يوجد مستخدمون آخرون.
        </div>
      `;

      return;

    }

    list.innerHTML =
      data.users
        .map(user => `
          <button
            class="message-user"
            data-message-user="${user.id}"
            data-user-name="${escapeHtml(
              user.name
            )}"
            onclick="openConversation(
              ${user.id},
              '${escapeJs(
                user.name
              )}'
            )"
          >
            <span class="avatar">
              👤
            </span>

            <span>
              ${escapeHtml(
                user.name
              )}
            </span>
          </button>
        `)
        .join("");

  } catch (error) {

    list.innerHTML = `
      <div class="error-box">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;

  }

}


function escapeJs(value) {

  return String(
    value ?? ""
  )
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");

}


window.openConversation =
  async function(
    userId,
    userName
  ) {

    selectedMessageUser = {
      id: Number(userId),
      name: userName
    };

    const title =
      document.getElementById(
        "conversationTitle"
      );

    if (title) {

      title.textContent =
        "💬 " + userName;

    }

    document
      .querySelectorAll(
        ".message-user"
      )
      .forEach(button => {

        button.classList.toggle(
          "selected",
          Number(
            button.dataset.messageUser
          ) === Number(userId)
        );

      });

    await loadConversation();

  };


async function loadConversation() {

  const container =
    document.getElementById(
      "messagesContainer"
    );

  if (
    !container ||
    !selectedMessageUser
  ) return;

  try {

    const data =
      await SocialNet.api(
        `/api/messages/${selectedMessageUser.id}`
      );

    if (
      !data.messages.length
    ) {

      container.innerHTML = `
        <div class="empty">
          لا توجد رسائل بعد.
          ابدأ المحادثة الآن.
        </div>
      `;

      return;

    }

    const me =
      SocialNet.getUser();

    container.innerHTML =
      data.messages
        .map(message => {

          const mine =
            Number(
              message.sender_id
            ) === Number(me.id);

          return `
            <div
              class="message ${
                mine
                  ? "message-me"
                  : "message-other"
              }"
            >

              <div class="message-author">
                ${escapeHtml(
                  message.sender
                )}
              </div>

              <div class="message-body">
                ${escapeHtml(
                  message.body
                )}
              </div>

              <div class="message-date">
                ${formatDate(
                  message.created_at
                )}
              </div>

            </div>
          `;

        })
        .join("");

    container.scrollTop =
      container.scrollHeight;

  } catch (error) {

    container.innerHTML = `
      <div class="error-box">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;

  }

}


async function sendMessage() {

  if (
    !selectedMessageUser
  ) {

    alert(
      "اختر شخصًا أولاً."
    );

    return;

  }

  const input =
    document.getElementById(
      "messageInput"
    );

  const button =
    document.getElementById(
      "sendMessageButton"
    );

  const body =
    input.value.trim();

  if (!body) return;

  button.disabled = true;

  try {

    await SocialNet.api(
      `/api/messages/${selectedMessageUser.id}`,
      {
        method: "POST",

        body: JSON.stringify({
          body
        })
      }
    );

    input.value = "";

    await loadConversation();

  } catch (error) {

    alert(
      error.message
    );

  } finally {

    button.disabled = false;

  }

}


// ==========================================
// Auto initialization
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const page =
      document.body.dataset.page;

    if (
      page === "home"
    ) {

      initHome();

    } else if (
      page === "profile"
    ) {

      initProfile();

    } else if (
      page === "friends"
    ) {

      initFriends();

    } else if (
      page === "messages"
    ) {

      initMessages();

    }

  }
);
