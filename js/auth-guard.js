// js/auth-guard.js
// Guard de rutas para TODAS las páginas protegidas.
// No lo incluyas en login.html.

import { db, doc, getDoc } from "./utils.js";

// Admin “hardcoded” adicional al de Firestore (si no lo necesitás, quitá esta línea)
const ADMIN_DNI = "30027216";

// Evita “flash” de contenido antes de validar
document.documentElement.style.visibility = 'hidden';

// No correr el guard en login
const IS_LOGIN = /(^|\/)login\.html$/i.test(location.pathname);

if (IS_LOGIN) {
    const qs = new URLSearchParams(location.search);
    if (qs.get("logout") === "1") {
        try { localStorage.removeItem("fletenki:user"); } catch { }
        history.replaceState({}, "", location.pathname);
    }
    document.documentElement.style.visibility = "";
} else {
    if (window.__fletenkiAuthGuardRan) {
        document.documentElement.style.visibility = "";
        throw new Error("auth-guard already ran");
    }
    window.__fletenkiAuthGuardRan = true;

    function getRequiredGuard() {
        const byId = document.getElementById("auth-guard")?.dataset?.guard;
        const byHtml = document.documentElement.getAttribute("data-guard");
        const byBody = document.body.getAttribute("data-guard");
        return (byId || byHtml || byBody || "").toLowerCase(); // '', 'user', 'admin'
    }
    const required = getRequiredGuard();

    // Session helpers
    const TTL = 7 * 24 * 60 * 60 * 1000;
    const getSession = () => {
        try { return JSON.parse(localStorage.getItem("fletenki:user") || "null"); }
        catch { return null; }
    };
    const saveSession = (s) => localStorage.setItem("fletenki:user", JSON.stringify(s));
    const clearSession = () => { try { localStorage.removeItem("fletenki:user"); } catch { } };
    const goLogin = () => {
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(`login.html?next=${next}`);
    };
    const goSchedule = (dni) => location.replace(`schedule.html?dni=${encodeURIComponent(dni)}`);

    function showAccessDenied(reason = "No tenés permisos para ver esta página.", dni = null) {
        document.documentElement.style.visibility = "";
        const myDni = dni || (getSession()?.dni || "");
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

    (async function guard() {
        const sess = getSession();
        if (!sess?.dni) return goLogin();

        if (!sess.ts || (Date.now() - sess.ts) > TTL) {
            clearSession();
            return goLogin();
        }

        try {
            const snap = await getDoc(doc(db, "fleteros", String(sess.dni)));
            if (!snap.exists()) throw new Error("dni-not-found");

            const data = snap.data();
            const okPatent = String(data.patent || "").toUpperCase() === String(sess.patent || "").toUpperCase();
            if (!okPatent) throw new Error("patent-mismatch");

            const perm = String(data.permission || "").toLowerCase();
            const isAdmin = perm === "admin" || String(sess.dni) === ADMIN_DNI;

            // Página admin-only y no es admin → a su agenda
            if (required === "admin" && !isAdmin) return goSchedule(sess.dni);

            // Refresca sesión, expone usuario y dispara evento
            const role = isAdmin ? "admin" : (perm || "user");
            saveSession({ ...sess, ts: Date.now(), permission: role });
            window.currentUser = { dni: sess.dni, name: data.name, permission: role, patent: data.patent };
            document.dispatchEvent(new CustomEvent("auth:ready", { detail: window.currentUser }));

            // Solo dueño (no admin) puede ver su summary/schedule
            const path = location.pathname.toLowerCase();
            const isSummary = /(^|\/)summary-data\.html$/.test(path);
            const isSchedule = /(^|\/)schedule\.html$/.test(path);

            if ((isSummary || isSchedule) && !isAdmin) {
                const qs = new URLSearchParams(location.search);
                const dniUrl = (qs.get("dni") || "").trim();
                const dniSess = String(sess.dni);

                if (!dniUrl) {
                    const target = (isSummary ? "summary-data.html" : "schedule.html") + `?dni=${encodeURIComponent(dniSess)}`;
                    return location.replace(target);
                }
                if (dniUrl !== dniSess) {
                    return showAccessDenied("No podés ver datos de otro fletero.", dniSess);
                }
            }

            document.documentElement.style.visibility = "";
        } catch (err) {
            clearSession();
            goLogin();
        }
    })();

    // Logout global
    function doLogout(redirect = true) {
        clearSession();
        if (redirect) location.replace("login.html");
    }
    document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-logout]");
        if (!el) return;
        e.preventDefault();
        doLogout(true);
    });
    // Soporta ?logout=1
    (() => {
        const qs = new URLSearchParams(location.search);
        if (qs.get("logout") === "1" || location.hash === "#logout") {
            doLogout(true);
        }
    })();
}

// Links dinámicos de menú (opcionales)
function wireMyAgenda() {
    const a = document.getElementById("linkMiAgenda");
    if (!a) return;
    const dni = window?.currentUser?.dni;
    a.href = dni ? `schedule.html?dni=${encodeURIComponent(dni)}` : "login.html";
    a.addEventListener("click", () => {
        const oc = document.getElementById("offcanvasMenu");
        const inst = window.bootstrap?.Offcanvas?.getOrCreateInstance?.(oc);
        inst?.hide();
    });
}
function wireMyResumen() {
    const a = document.getElementById("linkMiResumen");
    if (!a) return;
    const dni = window?.currentUser?.dni;
    a.href = dni ? `summary-data.html?dni=${encodeURIComponent(dni)}` : "login.html";
    a.addEventListener("click", () => {
        const oc = document.getElementById("offcanvasMenu");
        const inst = window.bootstrap?.Offcanvas?.getOrCreateInstance?.(oc);
        inst?.hide();
    });
}
document.addEventListener("auth:ready", wireMyAgenda, { once: true });
if (window.currentUser) wireMyAgenda();
document.addEventListener("auth:ready", wireMyResumen, { once: true });
if (window.currentUser) wireMyResumen();
