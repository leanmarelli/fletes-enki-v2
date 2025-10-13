// js/utils.js
// ---------------------------------------------
// Punto único de inicialización de Firebase/Firestore
// con cache persistente multi-tabs.
// ---------------------------------------------

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    doc, getDoc, setDoc, addDoc, deleteDoc,
    collection, getDocs, query, where, orderBy, limit,
    serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ====== CONFIGS DE ENTORNO ======
// PROD (ya lo tenías)
const PROD_CONFIG = {
    apiKey: "AIzaSyDhmZ_5e4prHLW7nQp_VY0KoTw9ObM7qVQ",
    authDomain: "gestion-fletes-enki.firebaseapp.com",
    projectId: "gestion-fletes-enki",
    storageBucket: "gestion-fletes-enki.firebasestorage.app",
    messagingSenderId: "1091950041596",
    appId: "1:1091950041596:web:b6c0e2942f92eafad93a79"
};

// DEV (copiá/pegá desde tu env_dev.json de Firebase → Config)
// ⚠️ Ejemplo placeholder — reemplazá por tus valores reales:
const DEV_CONFIG = {
    apiKey: "AIzaSyAbUEM4j7Orwc0DPZIExA7lZ3729UPC-SA",
    authDomain: "gestion-fletes-enki-dev.firebaseapp.com",
    projectId: "gestion-fletes-enki-dev",
    storageBucket: "gestion-fletes-enki-dev.firebasestorage.app",
    messagingSenderId: "572930533229",
    appId: "1:572930533229:web:38e5072e702acbde319c64",
    measurementId: "G-9F343B0BN0"
};

// ====== DETECCIÓN DE ENTORNO ======
const host = location.hostname;
const params = new URLSearchParams(location.search);

// 1) Forzado por querystring/localStorage (útil para probar en cualquier dominio)
const forcedEnv = (params.get("env") || localStorage.getItem("fletenv") || "").toLowerCase();

// 2) Heurística por hostname
const isLikelyDevHost =
    host.includes("localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".netlify.app"); // tu site dev

// Resolve final env
const ENV = forcedEnv === "dev" ? "dev"
    : forcedEnv === "prod" ? "prod"
        : (isLikelyDevHost ? "dev" : "prod");

const firebaseConfig = ENV === "dev" ? DEV_CONFIG : PROD_CONFIG;

// ====== FIRESTORE SETTINGS ======
const isLocalhost =
    ["localhost", "127.0.0.1", "[::1]"].includes(host) ||
    location.protocol === "file:";

const fsSettings = {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    }),
    ...(isLocalhost ? {
        experimentalForceLongPolling: true,
        useFetchStreams: false
    } : {})
};

// ====== INIT APP/FIRESTORE ======
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = initializeFirestore(app, fsSettings);

// ====== RE-EXPORT FIRESTORE HELPERS ======
export {
    doc, getDoc, setDoc, addDoc, deleteDoc,
    collection, getDocs, query, where, orderBy, limit,
    serverTimestamp, updateDoc
};

// ====== HELPERS DEBUG ======
// Consultá desde consola: window._fletenv  /  setFletEnv('dev'|'prod')
export const currentEnv = ENV;
export function setFletEnv(e) {
    localStorage.setItem("fletenv", e);
    alert(`Entorno forzado a: ${e}. Recargá la página.`);
}
window._fletenv = ENV;
window.setFletEnv = setFletEnv;

// Spinner de carga
export function showLoading(on = true) {
    const el = document.getElementById("appLoading");
    if (el) el.classList.toggle("show", !!on);
}
