"use strict";
if(SocialNet.requireLogin()){
(async()=>{try{
 const d=await SocialNet.me(),u=d.user;
 sessionStorage.setItem("sn_user",JSON.stringify(u));
 for(const id of ["topName","sideName"]){const el=document.getElementById(id);if(el)el.textContent=u.name;}
 for(const id of ["topAvatar","sideAvatar"]){
   const el=document.getElementById(id);
   if(el) el.outerHTML=SocialNet.avatarHTML(u.avatar_url,u.name).replace('class="avatar"','class="mini-avatar"');
 }
}catch(e){console.error(e)}})()}
const lb=document.getElementById("logoutButton");if(lb)lb.addEventListener("click",()=>SocialNet.logout());
