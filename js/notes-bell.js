// js/notes-bell.js
// Pinta badges de notas en navbar y menú. No depende de utils ni index.js.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const NAV_ID = "navNotesBadge";
const MENU_ID = "badgeMenuNotas";
const $ = (id) => document.getElementById(id);

function paint(el, n) {
    if (!el) return;
    const v = Number(n) || 0;
    if (v > 0) { el.textContent = String(v); el.classList.remove("d-none"); }
    else { el.textContent = "0"; el.classList.add("d-none"); }
}
function tick(n) { paint($(NAV_ID), n); paint($(MENU_ID), n); }

let unsub = null;
function ensureSubscribe() {
    if (unsub) return;

    const apps = getApps();
    let app = apps.length ? getApp() : null;

    // Solo inicializa si hay config real disponible
    if (!app && window.FLE_ENKI_FIREBASE_CONFIG) {
        app = initializeApp(window.FLE_ENKI_FIREBASE_CONFIG);
    }
    if (!app) {
        console.warn("notes-bell: sin app Firebase; no suscribe");
        tick(0);
        return;
    }

    try {
        const db = getFirestore(app);
        const qy = query(collection(db, "notes"), where("status", "==", "active"));
        unsub = onSnapshot(qy, (snap) => tick(snap?.size || 0), (err) => {
            console.warn("notes-bell snapshot error:", err);
            tick(0);
        });
    } catch (e) {
        console.warn("notes-bell init error:", e);
        tick(0);
    }
}

function boot() {
    if (!$(NAV_ID) && !$(MENU_ID)) return;
    ensureSubscribe();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
    boot();
}
document.addEventListener("shown.bs.offcanvas", boot);
