"use strict";

const $ = id => document.getElementById(id);
const loginSection=$("loginSection"), createSection=$("createSection"), verifySection=$("verifySection");
const loginForm=$("loginForm"), createForm=$("createForm"), verifyForm=$("verifyForm");
const errorBox=$("loginError");

function apiUrl(endpoint){
 const base=String(window.SECRETNET_API_BASE||"").trim().replace(/\/+$/,"");
 return base + "/" + String(endpoint).replace(/^\/+/, "");
}
function showError(message){ errorBox.textContent=message||""; }
function show(section){ [loginSection,createSection,verifySection].forEach(x=>x.classList.add("hidden")); section.classList.remove("hidden"); showError(""); }

async function finishLogin(data){
 if(!data.token) throw new Error("Le serveur n’a pas fourni de session.");
 localStorage.setItem("sn_token",data.token);
 localStorage.setItem("sn_user",JSON.stringify(data.user||null));
 sessionStorage.setItem("sn_token",data.token);
 sessionStorage.setItem("sn_user",JSON.stringify(data.user||null));
 location.replace("/index.html");
}

(async()=>{
 const token=localStorage.getItem("sn_token")||sessionStorage.getItem("sn_token");
 if(!token)return;
 try{
  const r=await fetch(apiUrl("/api/me"),{headers:{Authorization:"Bearer "+token}});
  if(r.ok){location.replace("/index.html");return;}
 }catch(_){}
 localStorage.removeItem("sn_token");localStorage.removeItem("sn_user");
 sessionStorage.removeItem("sn_token");sessionStorage.removeItem("sn_user");
})();

$("showCreate").addEventListener("click",()=>show(createSection));
$("showLogin").addEventListener("click",()=>show(loginSection));
$("backToCreate").addEventListener("click",()=>show(createSection));

loginForm.addEventListener("submit",async ev=>{
 ev.preventDefault(); showError("");
 const name=$("userName").value.trim(), password=$("sitePassword").value;
 if(!name||!password){showError("Entrez votre nom et votre mot de passe.");return;}
 const b=$("loginButton"); b.disabled=true;b.textContent="Connexion...";
 try{
  const r=await fetch(apiUrl("/api/enter"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,password})});
  const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||"Échec de la connexion.");
  await finishLogin(d);
 }catch(x){showError(x.message||"Impossible de se connecter.");}finally{b.disabled=false;b.textContent="Se connecter";}
});

createForm.addEventListener("submit",async ev=>{
 ev.preventDefault(); showError("");
 const name=$("createName").value.trim(), password=$("createPassword").value, confirm=$("createPasswordConfirm").value, email=$("createEmail").value.trim();
 if(password!==confirm){showError("Les deux mots de passe ne correspondent pas.");return;}
 const b=$("createButton");b.disabled=true;b.textContent="Création...";
 try{
  const r=await fetch(apiUrl("/api/register"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,password,email})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Impossible de créer le compte.");
  $("verifyEmail").value=email; sessionStorage.setItem("pendingVerificationEmail",email); show(verifySection);
 }catch(x){showError(x.message||"Impossible de créer le compte.");}finally{b.disabled=false;b.textContent="Créer le compte";}
});

verifyForm.addEventListener("submit",async ev=>{
 ev.preventDefault();showError("");
 const email=$("verifyEmail").value.trim(), code=$("verifyCode").value.trim(), b=$("verifyButton");
 b.disabled=true;b.textContent="Vérification...";
 try{
  const r=await fetch(apiUrl("/api/verify-email"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Code incorrect.");
  sessionStorage.removeItem("pendingVerificationEmail"); await finishLogin(d);
 }catch(x){showError(x.message||"Code incorrect.");}finally{b.disabled=false;b.textContent="Vérifier le code";}
});

const pending=sessionStorage.getItem("pendingVerificationEmail");
if(pending){$("verifyEmail").value=pending;show(verifySection);}
