
"use strict";
if(SocialNet.requireLogin()){(async()=>{try{const d=await SocialNet.me();sessionStorage.setItem("sn_user",JSON.stringify(d.user));for(const id of ["topName","sideName"]){const el=document.getElementById(id);if(el)el.textContent=d.user.name}}catch(e){console.error(e)}})()}
const lb=document.getElementById("logoutButton");if(lb)lb.addEventListener("click",()=>SocialNet.logout());
