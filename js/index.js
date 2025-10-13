// js/index.js
import { applyFeatureGates, installActionGuards, isAdmin } from "./gate.js";
import { db, collection, getDocs } from "./utils.js";
import { enhanceColorSelect } from "./color-select.js"; 


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

// ---------------- Select de la tarjeta “Agendas” ----------------
async function hydrateSelectFletero() {
    const select = document.getElementById("fletero");
    if (!select) return;
    if (!IS_INDEX) return; // solo index redirige

    try {
        const data = await fetchFleteros();
        enhanceColorSelect(select, data, {
            placeholder: "Elegir persona",
            onChange: (dni) => { if (dni) location.href = `schedule.html?dni=${encodeURIComponent(dni)}`; }
        });
    } catch (e) {
        console.error("No se pudo cargar #fletero:", e);
    }
}



// ---------------- Boot ----------------
function boot() {
    applyFeatureGates();
    installActionGuards();
    initMenuAgendas();

    if (IS_INDEX) {
        hydrateSelectFletero();
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
