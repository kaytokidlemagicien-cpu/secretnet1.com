
"use strict";
if(!SocialNet.requireLogin())throw new Error("غير مسجل");
(async()=>{try{const u=(await SocialNet.me()).user;document.getElementById("profileName").textContent=u.name;document.getElementById("profileId").textContent=u.id;document.getElementById("profileDate").textContent=SocialNet.date(u.created_at)}catch(e){console.error(e)}})();

const af=document.getElementById("avatarFile");af?.addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{document.getElementById("avatarUrl").value=await SocialMedia.fileToDataURL(f)}catch(x){alert(x.message)}});
