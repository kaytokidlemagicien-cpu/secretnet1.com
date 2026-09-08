"use strict";
if(!SocialNet.requireLogin())throw new Error("غير مسجل");
const avatarInput=document.getElementById("avatarInput"),changeAvatar=document.getElementById("changeAvatar"),status=document.getElementById("avatarStatus"),postsBox=document.getElementById("profilePosts");
function postCard(p){
 const image=p.image_url?`<div class="post-image-container"><img class="post-image" src="${SocialNet.escapeAttr(p.image_url)}" loading="lazy" alt="صورة المنشور"></div>`:"";
 return `<article class="card post"><div class="post-head"><div class="author">${SocialNet.avatarHTML(p.author_avatar,p.author)}<div><strong>${SocialNet.escape(p.author)}</strong><small>${SocialNet.date(p.created_at)}</small></div></div></div>${p.body?`<div class="post-body">${SocialNet.escape(p.body).replace(/\n/g,"<br>")}</div>`:""}${image}<div class="post-tools">❤️ ${p.likes_count||0} إعجاب</div></article>`;
}
async function load(){
 postsBox.innerHTML='<div class="loading">جاري تحميل المنشورات...</div>';
 try{
  const me=SocialNet.user();
  const requested=Number(new URLSearchParams(location.search).get("user"));
  const target=Number.isInteger(requested)&&requested>0?requested:me.id;
  const d=await SocialNet.api("/api/users/"+target),u=d.user;
  document.getElementById("profileName").textContent=u.name;
  document.getElementById("profileId").textContent=u.id;
  document.getElementById("profileDate").textContent=SocialNet.date(u.created_at);
  const old=document.getElementById("profileAvatar");
  if(old) old.outerHTML=SocialNet.avatarHTML(u.avatar_url,u.name).replace('class="avatar"','class="avatar avatar-large"').replace('class="avatar avatar-large"','id="profileAvatar" class="avatar avatar-large"');
  const own=Number(me.id)===Number(u.id);
  const change=document.getElementById("changeAvatar"), input=document.getElementById("avatarInput");
  if(change) change.hidden=!own; if(input) input.hidden=!own;
  postsBox.innerHTML=d.posts.length?d.posts.map(postCard).join(""):'<div class="card empty">لا توجد منشورات بعد.</div>';
 }catch(e){postsBox.innerHTML='<div class="card empty">'+SocialNet.escape(e.message)+'</div>'}
}
changeAvatar.addEventListener("click",()=>avatarInput.click());
avatarInput.addEventListener("change",async()=>{
 const file=avatarInput.files?.[0];if(!file)return;
 if(!file.type.startsWith("image/"))return alert("اختر صورة صحيحة.");
 if(file.size>5*1024*1024)return alert("الحد الأقصى 5 ميغابايت.");
 const fd=new FormData();fd.append("image",file);changeAvatar.disabled=true;status.textContent="⏳ جاري رفع الصورة...";
 try{const d=await SocialNet.api("/api/profile/avatar",{method:"POST",body:fd});sessionStorage.setItem("sn_user",JSON.stringify(d.user));status.textContent="✅ تم تغيير صورة الحساب.";await load();location.reload()}catch(e){status.textContent="❌ "+e.message}finally{changeAvatar.disabled=false;avatarInput.value=""}
});
document.getElementById("refreshProfile").addEventListener("click",load);load();
