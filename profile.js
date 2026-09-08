"use strict";
if(!SocialNet.requireLogin())throw new Error("Non connecté");
const avatarInput=document.getElementById("avatarInput"),changeAvatar=document.getElementById("changeAvatar"),status=document.getElementById("avatarStatus"),postsBox=document.getElementById("profilePosts");
function postCard(p){
 const image=p.image_url?`<div class="post-image-container"><img class="post-image" src="${SocialNet.escapeAttr(p.image_url)}" loading="lazy" alt="Image de la publication"></div>`:"";
 return `<article class="card post"><div class="post-head"><div class="author">${SocialNet.avatarHTML(p.author_avatar,p.author)}<div><strong>${SocialNet.escape(p.author)}</strong><small>${SocialNet.date(p.created_at)}</small></div></div></div>${p.body?`<div class="post-body">${SocialNet.escape(p.body).replace(/\n/g,"<br>")}</div>`:""}${image}<div class="post-tools">❤️ ${p.likes_count||0} J’aime</div></article>`;
}
async function load(){
 postsBox.innerHTML='<div class="loading">Chargement des publications...</div>';
 try{
  const d=await SocialNet.api("/api/users/"+SocialNet.user().id),u=d.user;
  document.getElementById("profileName").textContent=u.name;document.getElementById("profileId").textContent=u.id;document.getElementById("profileDate").textContent=SocialNet.date(u.created_at);
  document.getElementById("profileAvatar").outerHTML=SocialNet.avatarHTML(u.avatar_url,u.name).replace('class="avatar"','class="avatar avatar-large"');
  sessionStorage.setItem("sn_user",JSON.stringify(u));
  postsBox.innerHTML=d.posts.length?d.posts.map(postCard).join(""):'<div class="card empty">لا توجد منشورات بعد.</div>';
 }catch(e){postsBox.innerHTML='<div class="card empty">'+SocialNet.escape(e.message)+'</div>'}
}
changeAvatar.addEventListener("click",()=>avatarInput.click());
avatarInput.addEventListener("change",async()=>{
 const file=avatarInput.files?.[0];if(!file)return;
 if(!file.type.startsWith("image/"))return alert("Choisissez une image valide.");
 if(file.size>5*1024*1024)return alert("Taille maximale : 5 Mo.");
 const fd=new FormData();fd.append("image",file);changeAvatar.disabled=true;status.textContent="⏳ Téléversement de l’image...";
 try{const d=await SocialNet.api("/api/profile/avatar",{method:"POST",body:fd});sessionStorage.setItem("sn_user",JSON.stringify(d.user));status.textContent="✅ Photo de profil modifiée.";await load();location.reload()}catch(e){status.textContent="❌ "+e.message}finally{changeAvatar.disabled=false;avatarInput.value=""}
});
document.getElementById("refreshProfile").addEventListener("click",load);load();
