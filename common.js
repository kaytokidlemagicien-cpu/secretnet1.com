"use strict";

(function(){
  const saved=localStorage.getItem("sn_theme");
  if(saved==="dark") document.documentElement.classList.add("dark");
  const btn=document.getElementById("themeToggle");
  if(btn){
    const sync=()=>{btn.textContent=document.documentElement.classList.contains("dark")?"☀️":"🌙";};
    btn.addEventListener("click",()=>{
      document.documentElement.classList.toggle("dark");
      localStorage.setItem("sn_theme",document.documentElement.classList.contains("dark")?"dark":"light");
      sync();
    });
    sync();
  }
})();

if(SocialNet.requireLogin()){
(async()=>{try{
 const d=await SocialNet.me(),u=d.user;
 sessionStorage.setItem("sn_user",JSON.stringify(u));
 for(const id of ["topName","sideName"]){const el=document.getElementById(id);if(el)el.textContent=u.name;}
 const top=document.getElementById("topAvatar");
 if(top){top.outerHTML=SocialNet.avatarHTML(u.avatar_url,u.name).replace('class="avatar"','class="mini-avatar"');}
 const side=document.getElementById("sideAvatar");
 if(side){side.outerHTML=SocialNet.avatarHTML(u.avatar_url,u.name);}
}catch(e){console.error(e)}})()}
const lb=document.getElementById("logoutButton");if(lb)lb.addEventListener("click",()=>SocialNet.logout());
