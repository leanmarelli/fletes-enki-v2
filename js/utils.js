// js/utils.js
// ---------------------------------------------
// Punto único de inicialización de Firebase/Firestore
// con cache persistente multi-tabs.
// TODOS los demás módulos deben importar { db, ... } de acá.
// ---------------------------------------------

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
    // Inicialización avanzada con cache persistente:
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    // Re-export de helpers que usás en la app:
    doc, getDoc, setDoc, addDoc, deleteDoc,
    collection, getDocs, query, where, orderBy, limit,
    serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// Config del proyecto (único lugar):
const firebaseConfig = {
    apiKey: "AIzaSyDhmZ_5e4prHLW7nQp_VY0KoTw9ObM7qVQ",
    authDomain: "gestion-fletes-enki.firebaseapp.com",
    projectId: "gestion-fletes-enki",
    storageBucket: "gestion-fletes-enki.firebasestorage.app",
    messagingSenderId: "1091950041596",
    appId: "1:1091950041596:web:b6c0e2942f92eafad93a79"
};

// Detectar entorno local (localhost, 127.0.0.1, ::1 o file://)
const isLocalhost =
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.protocol === "file:";

// Settings de Firestore
const fsSettings = {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    }),
    // En local, forzamos long-polling (evita timeouts/negociación del stream)
    ...(isLocalhost ? {
        experimentalForceLongPolling: true,
        useFetchStreams: false
    } : {})
};

// App única:
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// IMPORTANTÍSIMO: llamar initializeFirestore **ANTES** que cualquier getFirestore.
export const db = initializeFirestore(app, fsSettings);

// Re-exportá utilidades de Firestore para no importar el CDN en cada archivo
export {
    doc, getDoc, setDoc, addDoc, deleteDoc,
    collection, getDocs, query, where, orderBy, limit,
    serverTimestamp, updateDoc
};

/* Spinner de carga */
export function showLoading(on = true) {
    const el = document.getElementById("appLoading");
    if (el) el.classList.toggle("show", !!on);
}
