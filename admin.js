"use strict";

if (!SocialNet.requireLogin()) throw new Error("login required");

const $ = id => document.getElementById(id);
function msg(text, type="error") { const el=$("msg"); el.textContent=text; el.className="admin-msg "+type; }
function avatar(url,name){ return url ? `<img src="${SocialNet.escapeAttr(url)}" alt="${SocialNet.escapeAttr(name)}">` : `<span class="admin-avatar">👤</span>`; }

async function load(){
  try{
    const me=await SocialNet.api("/api/admin/check");
    $("adminWho").textContent="Connecté en tant que : "+me.admin.name;
    const [s,u]=await Promise.all([SocialNet.api("/api/admin/stats"),SocialNet.api("/api/admin/users")]);
    $("statUsers").textContent=s.users; $("statPosts").textContent=s.posts; $("statComments").textContent=s.comments; $("statMessages").textContent=s.messages; $("statGroups").textContent=s.groups;
    $("usersBody").innerHTML=u.users.map(x=>`<tr><td><div class="admin-user">${avatar(x.avatar_url,x.name)}<span>${SocialNet.escape(x.name)}</span></div></td><td>${SocialNet.date(x.created_at)}</td><td>${x.is_banned?"Bloqué":"Actif"}</td><td><div class="admin-actions">${x.is_banned?`<button class="admin-btn ok" onclick="unban(${x.id})">Débloquer</button>`:`<button class="admin-btn neutral" onclick="ban(${x.id})">Bloquer</button>`}<button class="admin-btn danger" onclick="removeUser(${x.id},'${SocialNet.escapeAttr(x.name)}')">Supprimer</button></div></td></tr>`).join("") || `<tr><td colspan="4">Aucun utilisateur.</td></tr>`;
  }catch(e){ msg(e.message); if(e.message.includes("administrateur")||e.message.includes("autorisé")) setTimeout(()=>location.href="/",1800); }
}
async function ban(id){if(!confirm("Bloquer cet utilisateur ? Il sera déconnecté."))return;try{await SocialNet.api(`/api/admin/users/${id}/ban`,{method:"POST"});msg("Utilisateur bloqué.","success");load()}catch(e){msg(e.message)}}
async function unban(id){try{await SocialNet.api(`/api/admin/users/${id}/unban`,{method:"POST"});msg("Utilisateur débloqué.","success");load()}catch(e){msg(e.message)}}
async function removeUser(id,name){if(!confirm(`Supprimer définitivement ${name} et ses données liées ?`))return;try{await SocialNet.api(`/api/admin/users/${id}`,{method:"DELETE"});msg("Utilisateur supprimé.","success");load()}catch(e){msg(e.message)}}
load();
