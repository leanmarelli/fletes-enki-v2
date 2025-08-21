import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// --- Firebase (evita doble init) ---
const firebaseConfig = {
  apiKey: "AIzaSyDhmZ_5e4prHLW7nQp_VY0KoTw9ObM7qVQ",
  authDomain: "gestion-fletes-enki.firebaseapp.com",
  projectId: "gestion-fletes-enki",
  storageBucket: "gestion-fletes-enki.firebasestorage.app",
  messagingSenderId: "1091950041596",
  appId: "1:1091950041596:web:b6c0e2942f92eafad93a79"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- helpers ---
const TTL = 7 * 24 * 60 * 60 * 1000;
const ADMIN_PAGE_RE = /\/(index|new\-trip|admin|config|panel)\.html$/i;

function resolveNext(href) {
  // Soporta next absoluto (/FLETENKI/index.html) o relativo (schedule.html)
  try {
    if (!href) return null;
    const decoded = decodeURIComponent(href);
    return decoded.startsWith('/')
      ? new URL(decoded, location.origin).href
      : new URL(decoded, location.href).href;
  } catch {
    return null;
  }
}

function redirectByRole({ next, isAdmin, dni }) {
  const target = resolveNext(next);
  if (target) {
    const isAdminPage = ADMIN_PAGE_RE.test(new URL(target).pathname);
    if (isAdminPage && !isAdmin) {
      location.replace(`schedule.html?dni=${encodeURIComponent(dni)}`);
    } else {
      location.replace(target);
    }
    return;
  }
  // sin next válido
  if (isAdmin) location.replace('index.html');
  else location.replace(`schedule.html?dni=${encodeURIComponent(dni)}`);
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

// --- main ---
window.addEventListener('DOMContentLoaded', () => {
  // NO incluyas auth-guard en login.html
  const loginForm = document.getElementById("login-form");
  const errorMsg = document.getElementById("login-error");
  const qs = new URLSearchParams(location.search);

  if (!loginForm) {
    console.error('login.js: #login-form no encontrado. ¿El script está en el <body> o con defer?');
    return;
  }

  // 1) logout por query
  if (qs.get("logout") === "1") {
    try { localStorage.removeItem("fletenki:user"); } catch { }
    history.replaceState({}, "", location.pathname);
    // seguimos: que el usuario vea el form vacío
  }

  // 2) auto-redirect si ya hay sesión no vencida
  try {
    const sess = JSON.parse(localStorage.getItem("fletenki:user") || "null");
    if (sess?.dni && sess?.ts && (Date.now() - sess.ts) < TTL) {
      const isAdmin = String(sess.permission || "").toLowerCase() === "admin";
      redirectByRole({ next: qs.get("next"), isAdmin, dni: sess.dni });
      return; // importante: no sigas mostrando el form
    }
  } catch { }

  // 3) submit
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorMsg) errorMsg.style.display = "none";

    const dni = document.getElementById("dni")?.value.trim();
    const patente = document.getElementById("patente")?.value.trim().toUpperCase();
    const next = new URLSearchParams(location.search).get("next");

    if (!dni || !patente) return showError(errorMsg, "⚠️ Completa DNI y patente");
    if (!/^\d+$/.test(dni)) return showError(errorMsg, "⚠️ El DNI debe contener solo números");
    if (!/^[A-Z0-9]{6,7}$/.test(patente)) return showError(errorMsg, "⚠️ Patente inválida");

    try {
      const snap = await getDoc(doc(db, "fleteros", dni));
      if (!snap.exists()) return showError(errorMsg, "❌ DNI no encontrado");

      const data = snap.data() || {};
      const storedPatent = String(data.patent || "").toUpperCase();
      if (!storedPatent) return showError(errorMsg, "❌ Este usuario no tiene patente configurada");
      if (storedPatent !== patente) return showError(errorMsg, "❌ Patente incorrecta para este DNI");

      const isAdmin = String(data.permission || "").toLowerCase() === "admin";

      // guardar sesión (incluye permission)
      localStorage.setItem("fletenki:user", JSON.stringify({
        dni,
        patent: patente,
        permission: isAdmin ? 'admin' : 'user',
        ts: Date.now()
      }));

      // redirigir según rol / next
      redirectByRole({ next, isAdmin, dni });

    } catch (err) {
      console.error("Error en login:", err);
      showError(errorMsg, "❌ Error de conexión, intenta de nuevo");
    }
  });
});
