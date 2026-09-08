"use strict";

if (!SocialNet.requireLogin()) throw new Error("login required");

const $ = id => document.getElementById(id);
function msg(text, type="error") { const el=$("msg"); el.textContent=text; el.className="admin-msg "+type; }
function avatar(url,name){ return url ? `<img src="${SocialNet.escapeAttr(url)}" alt="${SocialNet.escapeAttr(name)}">` : `<span class="admin-avatar">👤</span>`; }
function adminHeaders(){ const p=sessionStorage.getItem("sn_admin_password")||""; return p ? {"X-Admin-Password":p} : {}; }
async function adminApi(url, options={}){ options.headers={...(options.headers||{}),...adminHeaders()}; return SocialNet.api(url,options); }

async function load(){
  try{
    const me=await adminApi("/api/admin/check");
    $("adminWho").textContent="Connecté en tant que : "+me.admin.name;
    $("adminLogin").style.display="none";
    const [s,u]=await Promise.all([adminApi("/api/admin/stats"),adminApi("/api/admin/users")]);
    $("statUsers").textContent=s.users; $("statPosts").textContent=s.posts; $("statComments").textContent=s.comments; $("statMessages").textContent=s.messages; $("statGroups").textContent=s.groups;
    $("usersBody").innerHTML=u.users.map(x=>`<tr><td><div class="admin-user">${avatar(x.avatar_url,x.name)}<span>${SocialNet.escape(x.name)}</span></div></td><td>${SocialNet.date(x.created_at)}</td><td>${x.is_banned?"Bloqué":"Actif"}</td><td><div class="admin-actions">${x.is_banned?`<button class="admin-btn ok" onclick="unban(${x.id})">Débloquer</button>`:`<button class="admin-btn neutral" onclick="ban(${x.id})">Bloquer</button>`}<button class="admin-btn danger" onclick="removeUser(${x.id},'${SocialNet.escapeAttr(x.name)}')">Supprimer</button></div></td></tr>`).join("") || `<tr><td colspan="4">Aucun utilisateur.</td></tr>`;
  }catch(e){
    $("adminLogin").style.display="block";
    if(String(e.message).includes("incorrect")||String(e.message).includes("absent")) msg(e.message);
    else if(String(e.message).includes("administrateur")||String(e.message).includes("autorisé")){ msg(e.message); setTimeout(()=>location.href="/",1800); }
  }
}
$("adminPasswordForm").addEventListener("submit",async ev=>{ev.preventDefault();sessionStorage.setItem("sn_admin_password",$("adminPassword").value);msg("");try{await load();if($("adminLogin").style.display!=="none")sessionStorage.removeItem("sn_admin_password")}catch(e){sessionStorage.removeItem("sn_admin_password");msg(e.message)}});
async function ban(id){if(!confirm("Bloquer cet utilisateur ? Il sera déconnecté."))return;try{await adminApi(`/api/admin/users/${id}/ban`,{method:"POST"});msg("Utilisateur bloqué.","success");load()}catch(e){msg(e.message)}}
async function unban(id){try{await adminApi(`/api/admin/users/${id}/unban`,{method:"POST"});msg("Utilisateur débloqué.","success");load()}catch(e){msg(e.message)}}
async function removeUser(id,name){if(!confirm(`Supprimer définitivement ${name} et ses données liées ?`))return;try{await adminApi(`/api/admin/users/${id}`,{method:"DELETE"});msg("Utilisateur supprimé.","success");load()}catch(e){msg(e.message)}}
load();
