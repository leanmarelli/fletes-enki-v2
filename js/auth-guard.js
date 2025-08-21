// js/auth-guard.js
// ----------------------------------------------------
// 1) Firebase (evita doble init)
// ----------------------------------------------------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

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

// ⬅️ Admin “hardcoded” por DNI (además de lo que diga Firestore)
const ADMIN_DNI = "30027216";

// ----------------------------------------------------
// 2) Evitar "flash": oculto hasta validar
//    y NO correr el guard en login.html
// ----------------------------------------------------
document.documentElement.style.visibility = 'hidden';
const IS_LOGIN = /(^|\/)login\.html$/i.test(location.pathname);

if (IS_LOGIN) {
    const qs = new URLSearchParams(location.search);
    if (qs.get('logout') === '1') {
        try { localStorage.removeItem('fletenki:user'); } catch { }
        history.replaceState({}, '', location.pathname);
    }
    document.documentElement.style.visibility = '';
} else {
    // --------------------------------------------------
    // 3) Guard real (solo para páginas protegidas)
    // --------------------------------------------------

    if (window.__fletenkiAuthGuardRan) {
        document.documentElement.style.visibility = '';
        throw new Error('auth-guard already ran');
    }
    window.__fletenkiAuthGuardRan = true;

    function getRequiredGuard() {
        const byId = document.getElementById('auth-guard')?.dataset?.guard;
        const byHtml = document.documentElement.getAttribute('data-guard');
        const byBody = document.body.getAttribute('data-guard');
        return (byId || byHtml || byBody || '').toLowerCase(); // '', 'user', 'admin'
    }
    const required = getRequiredGuard();

    // --- Helpers de sesión y navegación ---
    function getSession() {
        try { return JSON.parse(localStorage.getItem('fletenki:user') || 'null'); }
        catch { return null; }
    }
    function saveSession(sess) { localStorage.setItem('fletenki:user', JSON.stringify(sess)); }
    function clearSession() { try { localStorage.removeItem('fletenki:user'); } catch { } }
    function goLogin() {
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(`login.html?next=${next}`);
    }
    function goSchedule(dni) { location.replace(`schedule.html?dni=${encodeURIComponent(dni)}`); }

    // ⬅️ Pantalla de error 403 inline
    function showAccessDenied(reason = 'No tenés permisos para ver esta página.', dni = null) {
        document.documentElement.style.visibility = '';
        const myDni = dni || (getSession()?.dni || '');
        document.body.innerHTML = `
      <div class="container container-tiny my-5">
        <div class="alert alert-danger p-4 shadow-sm rounded-3">
          <h4 class="mb-2">Acceso denegado</h4>
          <p class="mb-3">${reason}</p>
          <div class="d-flex flex-wrap gap-2">
            ${myDni ? `<a class="btn btn-dark" href="schedule.html?dni=${encodeURIComponent(myDni)}">Ir a mi agenda</a>
                        <a class="btn btn-outline-dark" href="summary-data.html?dni=${encodeURIComponent(myDni)}">Ir a mi resumen</a>` : ``}
          </div>
        </div>
      </div>`;
    }

    // --- Guard principal ---
    (async function guard() {
        const sess = getSession();
        if (!sess?.dni) return goLogin();

        // TTL 7 días
        const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
        if (!sess.ts || (Date.now() - sess.ts) > ONE_WEEK) {
            clearSession();
            return goLogin();
        }

        try {
            const snap = await getDoc(doc(db, 'fleteros', String(sess.dni)));
            if (!snap.exists()) throw new Error('dni-not-found');

            const data = snap.data();
            const okPatent = String(data.patent || '').toUpperCase() === String(sess.patent || '').toUpperCase();
            if (!okPatent) throw new Error('patent-mismatch');

            const permissionRaw = String(data.permission || '').toLowerCase();
            const isAdmin = permissionRaw === 'admin' || String(sess.dni) === ADMIN_DNI; // ⬅️

            // Página admin-only y no es admin → a su agenda
            if (required === 'admin' && !isAdmin) {
                return goSchedule(sess.dni);
            }

            // Refresco sesión (sumo role), expongo user y aviso al resto
            const role = isAdmin ? 'admin' : permissionRaw;
            saveSession({ ...sess, ts: Date.now(), permission: role });
            window.currentUser = { dni: sess.dni, name: data.name, permission: role, patent: data.patent };
            document.dispatchEvent(new CustomEvent('auth:ready', { detail: window.currentUser }));

            // ⬅️ ENFORCEMENT: solo dueño (no admin) puede ver su summary/schedule
            const path = location.pathname.toLowerCase();
            const isSummary = /(^|\/)summary-data\.html$/.test(path);
            const isSchedule = /(^|\/)schedule\.html$/.test(path);
            if ((isSummary || isSchedule) && !isAdmin) {
                const qs = new URLSearchParams(location.search);
                const dniUrl = (qs.get('dni') || '').trim();
                const dniSess = String(sess.dni);

                if (!dniUrl) {
                    // si no pasan dni → lo mando al suyo
                    const target = (isSummary ? 'summary-data.html' : 'schedule.html') + `?dni=${encodeURIComponent(dniSess)}`;
                    return location.replace(target);
                }
                if (dniUrl !== dniSess) {
                    // si intentan ver otro DNI → error
                    return showAccessDenied('No podés ver datos de otro fletero.', dniSess);
                }
            }

            document.documentElement.style.visibility = '';
        } catch (e) {
            clearSession();
            goLogin();
        }
    })();

    // --- Logout global (en páginas protegidas) ---
    function doLogout(redirect = true) {
        clearSession();
        if (redirect) location.replace('login.html');
    }
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-logout]');
        if (!el) return;
        e.preventDefault();
        doLogout(true);
    });
    (function checkLogoutParam() {
        const qs = new URLSearchParams(location.search);
        if (qs.get('logout') === '1' || location.hash === '#logout') {
            doLogout(true);
        }
    })();
}

// ---- Links dinámicos (opcional) ----
function wireMyAgenda() {
    const a = document.getElementById('linkMiAgenda');
    if (!a) return;
    const dni = window?.currentUser?.dni;
    a.href = dni ? `schedule.html?dni=${encodeURIComponent(dni)}` : 'login.html';
    a.addEventListener('click', () => {
        const oc = document.getElementById('offcanvasMenu');
        const inst = window.bootstrap?.Offcanvas?.getOrCreateInstance?.(oc);
        inst?.hide();
    });
}

function wireMyResumen() {
    const a = document.getElementById('linkMiResumen');
    if (!a) return;
    const dni = window?.currentUser?.dni;
    a.href = dni ? `summary-data.html?dni=${encodeURIComponent(dni)}` : 'login.html';
    a.addEventListener('click', () => {
        const oc = document.getElementById('offcanvasMenu');
        const inst = window.bootstrap?.Offcanvas?.getOrCreateInstance?.(oc);
        inst?.hide();
    });
}

// Cuando el guard expone currentUser
document.addEventListener('auth:ready', wireMyAgenda, { once: true });
if (window.currentUser) wireMyAgenda();

document.addEventListener('auth:ready', wireMyResumen, { once: true });
if (window.currentUser) wireMyResumen();
