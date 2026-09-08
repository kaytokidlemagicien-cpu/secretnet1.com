
"use strict";
const SocialNet={
 token(){return sessionStorage.getItem("sn_token")},
 user(){try{return JSON.parse(sessionStorage.getItem("sn_user"))}catch{return null}},
 headers(extra={}){const t=this.token();return {...extra,...(t?{Authorization:"Bearer "+t}:{})}},
 async api(url,options={}){const o={...options,headers:this.headers(options.headers||{})};const r=await fetch(url,o);const d=await r.json().catch(()=>({}));if(r.status===401){sessionStorage.removeItem("sn_token");sessionStorage.removeItem("sn_user");location.replace("/login.html");throw new Error(d.error||"يجب تسجيل الدخول.")}if(!r.ok)throw new Error(d.error||"حدث خطأ.");return d},
 async me(){return this.api("/api/me")},
 requireLogin(){if(!this.token()){location.replace("/login.html");return false}return true},
 async logout(){try{if(this.token())await this.api("/api/logout",{method:"POST"})}catch(e){}finally{sessionStorage.clear();location.replace("/login.html")}},
 escape(t){return String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))},
 escapeAttr(t){return this.escape(t).replace(/`/g,"&#096;")},
 date(d){return new Date(d).toLocaleString("ar-TN",{dateStyle:"medium",timeStyle:"short"})},
avatarHTML(url,name=""){const safe=this.escapeAttr(url||""); return url
? `<img class="avatar avatar-img" src="${safe}" alt="${this.escapeAttr(name)}" loading="lazy" onerror="this.onerror=null;this.src='';this.classList.add('avatar-fallback');this.outerHTML='<span class="avatar">👤</span>'">`
: `<span class="avatar">👤</span>`;}
};
window.SocialNet=SocialNet;
