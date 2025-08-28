// js/utils.js
// Unifica la config de Firebase + Firestore con caché persistente.
// Usá SIEMPRE este módulo en vez de importar desde los CDN en cada archivo.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    // Re-exports más usados:
    doc, getDoc,
    collection, getDocs,
    query, where, orderBy, limit,
    addDoc, setDoc, updateDoc, deleteDoc,
    startAfter, endBefore
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// 🔐 Config (misma que usabas)
const firebaseConfig = {
    apiKey: "AIzaSyDhmZ_5e4prHLW7nQp_VY0KoTw9ObM7qVQ",
    authDomain: "gestion-fletes-enki.firebaseapp.com",
    projectId: "gestion-fletes-enki",
    storageBucket: "gestion-fletes-enki.firebasestorage.app",
    messagingSenderId: "1091950041596",
    appId: "1:1091950041596:web:b6c0e2942f92eafad93a79"
};

// ✅ Evita doble init
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Firestore con caché persistente y coordinación multi-tab
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

// ✅ Re-export de helpers que vas a usar en el resto del proyecto
export {
    doc, getDoc,
    collection, getDocs,
    query, where, orderBy, limit,
    addDoc, setDoc, updateDoc, deleteDoc,
    startAfter, endBefore
};

/* Spinner de carga */
export function showLoading(on = true) {
    const el = document.getElementById("appLoading");
    if (el) el.classList.toggle("show", !!on);
}