"use strict";
if(!SocialNet.requireLogin())throw new Error("غير مسجل");
const list=document.getElementById("usersList"),search=document.getElementById("searchUsers");let users=[],friends=[],incoming=[],outgoing=[];
function state(u){if(friends.some(f=>Number(f.id)===Number(u.id)))return ["صديق","friend"];if(incoming.some(r=>Number(r.requester_id)===Number(u.id)))return ["قبول الطلب","accept"];if(outgoing.some(r=>Number(r.addressee_id)===Number(u.id)))return ["الطلب مُرسل","pending"];return ["إضافة صديق","add"];}
function draw(){
 const q=search.value.trim().toLowerCase(),a=users.filter(u=>u.name.toLowerCase().includes(q));
 list.innerHTML=a.length?a.map(u=>{const [txt,cls]=state(u);return `<div class="user-row"><div class="user-info">${SocialNet.avatarHTML(u.avatar_url,u.name)}<div><strong>${SocialNet.escape(u.name)}</strong><small>عضو منذ ${SocialNet.date(u.created_at)}</small></div></div><div class="user-actions"><a class="btn btn-soft btn-small" href="/profile.html?user=${u.id}">👤 الملف</a><button class="btn btn-primary btn-small ${cls}" data-user="${u.id}" data-action="${cls}" ${cls==="pending"||cls==="friend"?"disabled":""}>${txt}</button><a class="btn btn-soft btn-small" href="/messages.html?user=${u.id}">💬 رسالة</a></div></div>`}).join(""):'<div class="empty">لا يوجد مستخدم مطابق.</div>';
}
async function load(){
 list.innerHTML='<div class="loading">جاري التحميل...</div>';
 try{users=(await SocialNet.api("/api/users")).users;const f=await SocialNet.api("/api/friends");friends=f.friends;const r=await SocialNet.api("/api/friends/requests");incoming=r.incoming;outgoing=r.outgoing;draw()}catch(e){list.innerHTML='<div class="empty">'+SocialNet.escape(e.message)+'</div>'}
}
list.addEventListener("click",async e=>{const b=e.target.closest("[data-user]");if(!b)return;const id=b.dataset.user,action=b.dataset.action;try{if(action==="add")await SocialNet.api("/api/friends/request/"+id,{method:"POST"});else if(action==="accept"){const req=incoming.find(x=>Number(x.requester_id)===Number(id));if(req)await SocialNet.api("/api/friends/accept/"+req.id,{method:"POST"})}await load()}catch(x){alert(x.message)}});
search.addEventListener("input",draw);document.getElementById("refreshUsers").addEventListener("click",load);load();
