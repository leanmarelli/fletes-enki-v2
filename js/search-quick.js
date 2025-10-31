// js/search-quick.js
import { db, collection, getDocs } from "./utils.js";
import {
    query, orderBy, limit, getDocs as getDocsFs
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const $ = s => document.querySelector(s);
const box = $("#qbox");
const inp = $("#qinput");
const list = $("#qresults");

// Guardas si el DOM no tiene el buscador (evita addEventListener sobre null)
if (!box || !inp || !list) return;

const norm = s => (s || "").toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let CACHE = [];
let LOADED = false;

// Carga sin collectionGroup: recorre fleteros y trae top N por cada uno
async function loadRecentNoIndex() {
    if (LOADED) return CACHE;

    // 1) lista de fleteros
    const fleterosSnap = await getDocs(collection(db, "fleteros"));
    const dnis = fleterosSnap.docs.map(d => d.id);

    // 2) por cada fletero, top 40 viajes ordenados por fecha desc
    const perDniPromises = dnis.map(async dni => {
        const ref = collection(db, "viajes", dni, "items");
        const qy = query(ref, orderBy("fecha", "desc"), limit(40)); // ajusta límite si querés
        const snap = await getDocsFs(qy);
        return snap.docs.map(doc => {
            const v = doc.data() || {};
            return {
                __id: doc.id,
                __dni: dni,
                fecha: v.fecha || v.cliente?.fecha || "",
                cliente: v.cliente?.nombre || v.cliente?.name || v.cliente || "",
                carga: v.direccionCarga || v.carga || v.cliente?.direccionCarga || "",
                descarga: v.direccionDescarga || v.descarga || v.cliente?.direccionDescarga || "",
                obs: v.observacion || v.observaciones || v.obs || ""
            };
        });
    });

    const chunks = await Promise.all(perDniPromises);
    CACHE = chunks.flat().sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
    LOADED = true;
    return CACHE;
}

function filterLocal(rows, q) {
    const qn = norm(q);
    if (!qn) return [];
    return rows.filter(r =>
        [r.__dni, r.cliente, r.carga, r.descarga, r.obs].some(x => norm(x).includes(qn))
    ).slice(0, 200); // recorta por seguridad
}

function fmtDate(v) {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
    const t = Date.parse(v); if (Number.isNaN(t)) return "";
    return new Date(t).toLocaleDateString("es-AR");
}

function render(rows) {
    if (!rows.length) {
        list.innerHTML = `<div class="list-group-item text-muted">Sin resultados</div>`;
        list.classList.remove("d-none");
        return;
    }
    const top5 = rows.slice(0, 5);
    list.innerHTML = top5.map(r => `
    <a class="list-group-item list-group-item-action d-flex justify-content-between align-items-start"
       data-dni="${r.__dni}" data-id="${r.__id}">
      <div>
        <div><strong>${r.cliente || "(sin cliente)"}</strong></div>
        <div class="meta">${r.carga || "¿?"} → ${r.descarga || "¿?"} · ${fmtDate(r.fecha)}</div>
      </div>
      <span class="bi bi-chevron-right"></span>
    </a>
  `).join("") + `
    <a class="list-group-item list-group-item-action fw-semibold text-center" id="qMore">
      Buscar más resultados…
    </a>`;
    list.classList.remove("d-none");
}

async function onType() {
    const q = inp.value;
    if (!q.trim()) { list.classList.add("d-none"); list.innerHTML = ""; return; }
    const data = await loadRecentNoIndex();
    const res = filterLocal(data, q);
    render(res);
}

inp.addEventListener("input", debounce(onType, 250));
document.addEventListener("click", (e) => {
    const item = e.target.closest("#qresults .list-group-item");
    if (!item) {
        if (!box.contains(e.target)) list.classList.add("d-none");
        return;
    }
    if (item.id === "qMore") {
        // Opcional: expandir a top10 en el dropdown o navegar a una página de búsqueda avanzada
        list.querySelectorAll(".list-group-item").forEach((x, i) => { if (i > 10 && x.id !== "qMore") x.classList.add("d-none"); });
        return;
    }
    const dni = item.dataset.dni, id = item.dataset.id;
    location.href = `schedule.html?dni=${encodeURIComponent(dni)}&doc=${encodeURIComponent(id)}`;
});
