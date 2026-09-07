const $ = id => document.getElementById(id);
let me = null;
let selectedUser = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "حدث خطأ.");
  return data;
}

async function checkSession() {
  try {
    const data = await api("/api/me");
    me = data.user;
    showApp();
  } catch {
    $("gate").classList.remove("hidden");
  }
}

$("passForm").onsubmit = async e => {
  e.preventDefault();
  $("passError").textContent = "";
  try {
    const data = await api("/api/enter", {
      method: "POST",
      body: JSON.stringify({
        password: $("sitePassword").value,
        name: $("userName").value
      })
    });
    me = data.user;
    showApp();
  } catch (err) {
    $("passError").textContent = err.message;
  }
};

async function showApp() {
  $("gate").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("currentName").textContent = me.name;
  $("profileName").textContent = me.name;
  await renderAll();
}

$("logout").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  location.reload();
};

async function renderAll() {
  await Promise.all([renderFeed(), renderFriends(), renderMessageUsers()]);
}

async function renderFeed() {
  const { posts } = await api("/api/posts");
  const feed = $("feed");
  if (!posts.length) {
    feed.innerHTML = '<div class="panel">لا توجد منشورات بعد. كن أول من ينشر! ✨</div>';
    return;
  }
  feed.innerHTML = posts.map(post => `
    <article class="post">
      <div class="postHead">
        <span class="postName">👤 ${esc(post.author)}</span>
        <span class="date">${new Date(post.created_at).toLocaleString("ar-TN")}</span>
      </div>
      ${post.body ? `<div class="postText">${esc(post.body)}</div>` : ""}
      ${post.image_url ? `<img src="${esc(post.image_url)}" alt="صورة" onerror="this.remove()">` : ""}
      <div class="actions">
        <button class="${post.liked ? "liked" : ""}" onclick="likePost(${post.id})">❤️ ${post.likes}</button>
      </div>
      <div>${post.comments.map(c => `<div class="comment"><b>${esc(c.author)}</b>: ${esc(c.body)}</div>`).join("")}</div>
      <form class="commentBox" onsubmit="commentPost(event,${post.id})">
        <input maxlength="250" placeholder="اكتب تعليقًا..." required>
        <button>إرسال</button>
      </form>
    </article>
  `).join("");
}

$("publish").onclick = async () => {
  try {
    await api("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        body: $("postText").value.trim(),
        imageUrl: $("postImage").value.trim()
      })
    });
    $("postText").value = "";
    $("postImage").value = "";
    await renderFeed();
  } catch (e) { alert(e.message); }
};

window.likePost = async id => {
  try {
    await api(`/api/posts/${id}/like`, { method: "POST" });
    await renderFeed();
  } catch (e) { alert(e.message); }
};

window.commentPost = async (e, id) => {
  e.preventDefault();
  const input = e.target.querySelector("input");
  try {
    await api(`/api/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: input.value.trim() })
    });
    await renderFeed();
  } catch (e) { alert(e.message); }
};

async function renderFriends() {
  const { users } = await api("/api/users");
  $("friendsList").innerHTML = users.length
    ? users.map(u => `<div class="userRow"><span>👤 ${esc(u.name)}</span><button onclick="openChat(${u.id},'${escAttr(u.name)}')">مراسلة</button></div>`).join("")
    : "<p>لا يوجد أصدقاء آخرون حتى الآن.</p>";
}

async function renderMessageUsers() {
  const { users } = await api("/api/users");
  $("messageUsers").innerHTML = users.length
    ? users.map(u => `<button class="small" onclick="openChat(${u.id},'${escAttr(u.name)}')">${esc(u.name)}</button> `).join("")
    : "<p>لا يوجد مستخدمون آخرون.</p>";
}

window.openChat = async (userId, userName) => {
  selectedUser = { id: userId, name: userName };
  const { messages } = await api(`/api/messages/${userId}`);
  $("chat").classList.remove("hidden");
  $("chat").innerHTML = `
    <h3>محادثة مع ${esc(userName)}</h3>
    <div id="msgs">
      ${messages.length ? messages.map(m => `<div class="msg ${m.sender_id === me.id ? "me" : ""}"><b>${esc(m.sender)}</b><br>${esc(m.body)}</div>`).join("") : "<p>لا توجد رسائل بعد.</p>"}
    </div>
    <form class="chatForm" onsubmit="sendMsg(event)">
      <input maxlength="500" placeholder="اكتب رسالة..." required>
      <button>إرسال</button>
    </form>
  `;
};

window.sendMsg = async e => {
  e.preventDefault();
  if (!selectedUser) return;
  const input = e.target.querySelector("input");
  try {
    await api(`/api/messages/${selectedUser.id}`, {
      method: "POST",
      body: JSON.stringify({ body: input.value.trim() })
    });
    await openChat(selectedUser.id, selectedUser.name);
  } catch (e) { alert(e.message); }
};

$("clearMine").onclick = async () => {
  if (!confirm("هل تريد حذف جميع منشوراتك؟")) return;
  try {
    await api("/api/my-posts", { method: "DELETE" });
    await renderFeed();
  } catch (e) { alert(e.message); }
};

document.querySelectorAll("nav button").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll("nav button").forEach(x => x.classList.remove("active"));
    button.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    $(button.dataset.view).classList.remove("hidden");
  };
});

function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function escAttr(text) {
  return esc(text).replace(/`/g, "&#096;");
}

checkSession();