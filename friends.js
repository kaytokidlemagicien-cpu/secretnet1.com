
"use strict";
if(!SocialNet.requireLogin())throw new Error("غير مسجل");
const list=document.getElementById("usersList"),search=document.getElementById("searchUsers");let users=[];
function draw(){const q=search.value.trim().toLowerCase(),a=users.filter(u=>u.name.toLowerCase().includes(q));list.innerHTML=a.length?a.map(u=>`<div class="user-row"><div class="user-info"><span class="avatar">👤</span><div><strong>${SocialNet.escape(u.name)}</strong><small>عضو منذ ${SocialNet.date(u.created_at)}</small></div></div><a class="btn btn-primary btn-small" href="/messages.html?user=${u.id}">💬 مراسلة</a></div>`).join(""):'<div class="empty">لا يوجد مستخدم مطابق.</div>'}
async function load(){list.innerHTML='<div class="loading">جاري التحميل...</div>';try{users=(await SocialNet.api("/api/users")).users;draw()}catch(e){list.innerHTML='<div class="empty">'+SocialNet.escape(e.message)+'</div>'}}
search.addEventListener("input",draw);document.getElementById("refreshUsers").addEventListener("click",load);load();
