"use strict";

if (!SocialNet.requireLogin()) throw new Error("Non connecté");

const list = document.getElementById("usersList");
const search = document.getElementById("searchUsers");
const refresh = document.getElementById("refreshUsers");

let users = [];
let friends = [];
let incoming = [];
let outgoing = [];

function idOf(value) {
    const n = Number(value);
    return Number.isInteger(n) ? n : 0;
}

function state(user) {
    const id = idOf(user.id);

    if (friends.some(f => idOf(f.id) === id)) {
        return ["Ami", "friend"];
    }

    const request = incoming.find(r => idOf(r.requester_id) === id);
    if (request) {
        return ["Accepter la demande", "accept"];
    }

    if (outgoing.some(r => idOf(r.addressee_id) === id)) {
        return ["Demande envoyée", "pending"];
    }

    return ["Ajouter comme ami", "add"];
}

function draw() {
    const q = String(search?.value || "").trim().toLowerCase();
    const filtered = users.filter(u => String(u.name || "").toLowerCase().includes(q));

    if (!filtered.length) {
        list.innerHTML = '<div class="empty">Aucun utilisateur correspondant.</div>';
        return;
    }

    list.innerHTML = filtered.map(u => {
        const [text, cls] = state(u);
        const disabled = cls === "pending" || cls === "friend" ? "disabled" : "";
        return `
            <div class="user-row">
                <div class="user-info">
                    ${SocialNet.avatarHTML(u.avatar_url, u.name)}
                    <div>
                        <strong>${SocialNet.escape(u.name)}</strong>
                        <small>Membre depuis ${SocialNet.date(u.created_at)}</small>
                    </div>
                </div>
                <div class="user-actions">
                    <a class="btn btn-soft btn-small" href="/profile.html?user=${encodeURIComponent(u.id)}">👤 Profil</a>
                    <button type="button" class="btn btn-primary btn-small ${cls}" data-user="${SocialNet.escapeAttr(u.id)}" data-action="${cls}" ${disabled}>${text}</button>
                    <a class="btn btn-soft btn-small" href="/messages.html?user=${encodeURIComponent(u.id)}">💬 Message</a>
                </div>
            </div>`;
    }).join("");
}

async function load() {
    list.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const [usersData, friendsData, requestsData] = await Promise.all([
            SocialNet.api("/api/users"),
            SocialNet.api("/api/friends"),
            SocialNet.api("/api/friends/requests")
        ]);

        users = Array.isArray(usersData.users) ? usersData.users : [];
        friends = Array.isArray(friendsData.friends) ? friendsData.friends : [];
        incoming = Array.isArray(requestsData.incoming) ? requestsData.incoming : [];
        outgoing = Array.isArray(requestsData.outgoing) ? requestsData.outgoing : [];

        draw();
    } catch (e) {
        list.innerHTML = `<div class="empty">${SocialNet.escape(e.message || "Impossible de charger la liste des amis.")}</div>`;
    }
}

list.addEventListener("click", async event => {
    const button = event.target.closest("button[data-user]");
    if (!button || button.disabled) return;

    const id = idOf(button.dataset.user);
    const action = button.dataset.action;
    if (!id) return;

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "Traitement...";

    try {
        if (action === "add") {
            await SocialNet.api(`/api/friends/request/${id}`, { method: "POST" });
        } else if (action === "accept") {
            const request = incoming.find(x => idOf(x.requester_id) === id);
            if (!request) throw new Error("Demande d’amitié introuvable.");
            await SocialNet.api(`/api/friends/accept/${encodeURIComponent(request.id)}`, { method: "POST" });
        }

        await load();
    } catch (error) {
        button.disabled = false;
        button.textContent = oldText;
        alert(error.message || "Une erreur est survenue lors du traitement de la demande d’amitié.");
        await load();
    }
});

search.addEventListener("input", draw);
refresh.addEventListener("click", load);
load();
