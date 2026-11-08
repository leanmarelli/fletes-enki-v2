// js/index.js
import { applyFeatureGates, installActionGuards, isAdmin } from "./gate.js";
import { db, collection, getDocs } from "./utils.js";


const initials = (name = "") =>
    name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || "").join("");

const IS_INDEX = (() => {
    const file = location.pathname.split('/').pop().toLowerCase() || 'index.html';
    return file === 'index.html';
})();


const normalize = (s = "") =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// ---------------- Tarjeta en el offcanvas ----------------
function renderFleteroItem({ dni, name, car, colorHex }) {
    const el = document.createElement("a");
    // usamos flex para alinear puntito + textos
    el.className = "list-group-item list-group-item-action d-flex align-items-center gap-3";
    el.href = `schedule.html?dni=${encodeURIComponent(dni)}`;

    // • Dot principal (reemplaza al avatar con iniciales)
    const lead = document.createElement("span");
    lead.className = "ag-lead-dot";
    lead.style.background = colorHex || "#ced4da"; // gris si no hay color
    el.appendChild(lead);

    // Contenido textual
    const main = document.createElement("div");

    const title = document.createElement("div");
    title.className = "ag-name";
    title.textContent = name || "—";

    const sub = document.createElement("div");
    sub.className = "ag-sub";
    if (car) sub.textContent = car;

    main.appendChild(title);
    if (car) main.appendChild(sub);
    el.appendChild(main);

    // cerrar offcanvas si está abierto
    el.addEventListener("click", () => {
        const oc = document.getElementById("offcanvasMenu");
        if (oc && window.bootstrap) bootstrap.Offcanvas.getOrCreateInstance(oc).hide();
    });

    el.setAttribute("tabindex", "0");
    return el;
}


// ---------------- Datos ----------------
async function fetchFleteros() {
    const snap = await getDocs(collection(db, "fleteros"));
    return snap.docs.map(d => {
        const x = d.data() || {};
        return {
            dni: d.id,
            name: x.name || d.id,
            car: x.car || "",
            colorHex: x.colorHex || ""
        };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// ---------------- Menú lateral (admin) ----------------
function initMenuAgendas() {
    const collapseEl = document.getElementById("collapseAgendasMenu");
    const listEl = document.getElementById("listaFleterosMenu");
    const searchEl = document.getElementById("buscarFletero");
    if (!collapseEl || !listEl) return;
    if (!isAdmin()) return;

    let data = [];

    collapseEl.addEventListener("show.bs.collapse", async () => {
        if (listEl.dataset.loaded) return;
        listEl.innerHTML = '<div class="list-group-item text-muted">Cargando…</div>';
        try {
            data = await fetchFleteros();
            const frag = document.createDocumentFragment();
            data.forEach(x => frag.appendChild(renderFleteroItem(x)));
            listEl.innerHTML = "";
            listEl.appendChild(frag);
            listEl.dataset.loaded = "1";
        } catch (err) {
            console.error("Error al cargar fleteros:", err);
            listEl.innerHTML = '<div class="list-group-item text-danger">Error al cargar</div>';
        }
    }, { once: true });

    searchEl?.addEventListener("input", () => {
        const q = normalize(searchEl.value);
        const frag = document.createDocumentFragment();
        data.filter(x => normalize(x.name).includes(q))
            .forEach(x => frag.appendChild(renderFleteroItem(x)));
        listEl.innerHTML = "";
        listEl.appendChild(frag);
    });
}

// ---------------- Grilla de la tarjeta “Agendas” ----------------
const CHEVRON_SVG =
    '<svg class="fl-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
    '<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderFleteroTile({ dni, name, car, colorHex }) {
    const a = document.createElement("a");
    a.className = "fl-tile";
    a.href = `schedule.html?dni=${encodeURIComponent(dni)}`;
    a.style.setProperty("--fl-color", colorHex || "#ced4da");

    const dot = document.createElement("span");
    dot.className = "fl-dot";
    dot.textContent = initials(name);

    const text = document.createElement("span");
    text.className = "fl-text";

    // Solo el primer nombre; el completo queda como tooltip/accesibilidad
    const firstName = (name || "").trim().split(/\s+/)[0] || "—";
    const title = document.createElement("span");
    title.className = "fl-name";
    title.textContent = firstName;
    text.appendChild(title);
    a.title = name || "";
    a.setAttribute("aria-label", `Ver agenda de ${name || firstName}`);

    if (car) {
        const sub = document.createElement("span");
        sub.className = "fl-sub";
        sub.textContent = car;
        text.appendChild(sub);
    }

    a.append(dot, text);
    a.insertAdjacentHTML("beforeend", CHEVRON_SVG);
    return a;
}

async function hydrateFleterosGrid() {
    const grid = document.getElementById("fleterosGrid");
    if (!grid) return;

    try {
        const data = await fetchFleteros();
        grid.innerHTML = "";
        if (!data.length) {
            grid.innerHTML = '<p class="fl-empty">No hay fleteros cargados.</p>';
            return;
        }
        const frag = document.createDocumentFragment();
        data.forEach(x => frag.appendChild(renderFleteroTile(x)));
        grid.appendChild(frag);
    } catch (e) {
        console.error("No se pudo cargar la grilla de fleteros:", e);
        grid.innerHTML = '<p class="fl-empty text-danger">No se pudieron cargar los fleteros.</p>';
    }
}



// ---------------- Boot ----------------
function boot() {
    applyFeatureGates();
    installActionGuards();
    initMenuAgendas();

    if (IS_INDEX) {
        hydrateFleterosGrid();
    }
}


function runWhenDomReady() {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
}
document.addEventListener("auth:ready", runWhenDomReady, { once: true });
if (window.currentUser) runWhenDomReady();

// ---------------- Marcar item activo en el menú ----------------
const back = document.getElementById("btnBack");
if (back) {
    back.addEventListener("click", () => {
        if (history.length > 1) history.back();
        else location.href = "index.html";
    });
}

function setActive(el, { disable = false } = {}) {
    if (!el) return;
    el.classList.add("active");
    el.setAttribute("aria-current", "page");
    if (disable) {
        el.classList.add("disabled");
        el.removeAttribute("href");
    }
}

function clearActives() {
    document.querySelectorAll("#offcanvasMenu .btn.active").forEach(el => {
        el.classList.remove("active", "disabled");
        el.removeAttribute("aria-current");
    });
}

function highlightMenu() {
    const path = location.pathname.split("/").pop().toLowerCase();
    const qs = new URLSearchParams(location.search);
    const currentDni = qs.get("dni") || "";
    const myDni = window?.currentUser?.dni || "";

    clearActives();

    const map = {
        "index.html": '#offcanvasMenu a[href$="index.html"]',
        "new-trip.html": '#offcanvasMenu a[href$="new-trip.html"]',
        "summary-data.html": '#offcanvasMenu a[href$="summary-data.html"]'
    };

    if (map[path]) {
        setActive(document.querySelector(map[path]));
        return;
    }

    if (path === "schedule.html") {
        if (myDni && currentDni && myDni === currentDni) {
            setActive(document.getElementById("linkMiAgenda"));
        } else {
            const toggle = document.querySelector('a[data-bs-toggle="collapse"][href="#collapseAgendasMenu"]');
            setActive(toggle);
        }
    }
}

document.addEventListener("auth:ready", highlightMenu, { once: true });
if (window.currentUser) highlightMenu();

(function hardenOffcanvas() {
    function cleanup() {
        // borra cualquier backdrop residual
        document.querySelectorAll('.offcanvas-backdrop').forEach(el => el.remove());
        // resetea clases/estilos del body si quedaron
        document.body.classList.remove('offcanvas-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('paddingRight');
    }

    // cuando se oculta por cualquier motivo
    document.addEventListener('hidden.bs.offcanvas', cleanup);
    // clic en backdrop → oculta y limpia
    document.addEventListener('click', (e) => {
        const isBackdrop = e.target.classList?.contains('offcanvas-backdrop');
        if (!isBackdrop) return;
        const oc = bootstrap.Offcanvas.getInstance(document.querySelector('.offcanvas.show'));
        oc?.hide();
        // fallback de limpieza
        setTimeout(cleanup, 0);
    });
})();