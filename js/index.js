// js/index.js
import { applyFeatureGates, installActionGuards, isAdmin } from "./gate.js";
import { db, collection, getDocs } from "./utils.js";

const initials = (name = "") =>
    name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || "").join("");

const normalize = (s = "") =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// Tarjeta de fletero (en lista del offcanvas)
function renderFleteroItem({ dni, name, car, colorHex }) {
    const el = document.createElement("a");
    el.className = "list-group-item list-group-item-action";
    el.href = `schedule.html?dni=${encodeURIComponent(dni)}`;

    const avatar = document.createElement("div");
    avatar.className = "ag-avatar";
    avatar.textContent = initials(name);

    const nameRow = document.createElement("div");
    nameRow.className = "ag-name-row";

    const title = document.createElement("div");
    title.className = "ag-name";
    title.textContent = name || "—";

    const dot = document.createElement("span");
    dot.className = "ag-dot";
    if (colorHex) dot.style.background = colorHex; else dot.style.visibility = "hidden";

    nameRow.appendChild(title);
    nameRow.appendChild(dot);

    const sub = document.createElement("div");
    sub.className = "ag-sub";
    if (car) sub.textContent = car;

    const main = document.createElement("div");
    main.appendChild(nameRow);
    if (car) main.appendChild(sub);

    el.appendChild(avatar);
    el.appendChild(main);

    el.addEventListener("click", () => {
        const oc = document.getElementById("offcanvasMenu");
        if (oc && window.bootstrap) {
            const inst = bootstrap.Offcanvas.getOrCreateInstance(oc);
            inst.hide();
        }
    });

    el.setAttribute("tabindex", "0");
    return el;
}

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

async function hydrateSelectFletero() {
    const select = document.getElementById("fletero");
    if (!select) return;

    select.innerHTML = `<option value="">Elegir persona</option>`;
    try {
        const data = await fetchFleteros();
        data.forEach(x => {
            const op = document.createElement("option");
            op.value = x.dni;
            op.textContent = x.car ? `${x.name} (${x.car})` : x.name;
            select.appendChild(op);
        });
    } catch (e) {
        console.error("No se pudo cargar #fletero:", e);
    }
}

function boot() {
    applyFeatureGates();
    installActionGuards();
    initMenuAgendas();
    hydrateSelectFletero();
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

// Marcar item activo en el menú (opcional)
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
