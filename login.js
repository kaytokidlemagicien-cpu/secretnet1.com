"use strict";
const f = document.getElementById("loginForm"),
      n = document.getElementById("userName"),
      p = document.getElementById("sitePassword"),
      b = document.getElementById("loginButton"),
      e = document.getElementById("loginError");

// التحقق من وجود الجلسة عند فتح الصفحة (استبدال sessionStorage بـ localStorage)
(async () => {
  const t = localStorage.getItem("sn_token");
  if (!t) return;
  try {
    const r = await fetch("/api/me", { headers: { Authorization: "Bearer " + t } });
    if (r.ok) {
      location.replace("/index.html");
      return;
    }
  } catch {}
  localStorage.clear();
})();

// عند التحديث وتسجيل الدخول
f.addEventListener("submit", async ev => {
  ev.preventDefault();
  e.textContent = "";
  const name = n.value.trim(), password = p.value;
  
  if (!name || !password) {
    e.textContent = "Entrez votre nom et votre mot de passe.";
    return;
  }
  
  b.disabled = true;
  b.textContent = "Connexion...";
  
  try {
    const r = await fetch("/api/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password })
    });
    const d = await r.json().catch(() => ({}));
    
    if (!r.ok) throw new Error(d.error || "Échec de la connexion.");
    
    // حفظ التوكن والبيانات دائمًا في localStorage لعمل التطبيق
    localStorage.setItem("sn_token", d.token);
    localStorage.setItem("sn_user", JSON.stringify(d.user));
    
    location.replace("/index.html");
  } catch (x) {
    e.textContent = x.message;
  } finally {
    b.disabled = false;
    b.textContent = "Connexion";
  }
});
