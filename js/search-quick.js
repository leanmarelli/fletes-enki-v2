// js/search-quick.js
import { db, collection, getDocs } from "./utils.js";
import {
    query, orderBy, limit, getDocs as getDocsFs
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

function boot() {
    const $ = s => document.querySelector(s);
    const box = $("#qbox");
    const inp = $("#qinput");
    const list = $("#qresults");
    if (!box || !inp || !list) return; // no hay buscador en esta página

    // Utils
    const norm = s => (s || "").toLowerCase()
        .normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
    const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const pickColor = f => (f?.colorHex || f?.color || "#888").toString().trim();
    const pickName = f => (f?.name || f?.dni || "").toString().trim();

    let CACHE = [];
    let LOADED = false;

    async function loadRecentNoIndex() {
        if (LOADED) return CACHE;

        // Fleteros con metadatos
        const fleSnap = await getDocs(collection(db, "fleteros"));
        const fleteros = fleSnap.docs.map(d => {
            const data = d.data() || {};
            return { dni: d.id, name: pickName({ ...data, dni: d.id }), color: pickColor(data) };
        });

        // Últimos viajes por fletero
        const perDniPromises = fleteros.map(async f => {
            const ref = collection(db, "viajes", f.dni, "items");
            const qy = query(ref, orderBy("fecha", "desc"), limit(40));
            const snap = await getDocsFs(qy);

            return snap.docs.map(doc => {
                const v = doc.data() || {};
                const c = v.cliente || {};
                return {
                    __id: doc.id,
                    __dni: f.dni,
                    __fletero: f.name,
                    __color: f.color,
                    fecha: v.fecha || c.fecha || "",
                    cliente: c.nombre || c.name || "",
                    carga: c.direccionCarga || "",
                    descarga: c.direccionDescarga || "",
                    obs: c.detalle || v.observacion || v.observaciones || v.obs || ""
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
            [r.__dni, r.__fletero, r.cliente, r.carga, r.descarga, r.obs].some(x => norm(x).includes(qn))
        );
    }

    function fmtDate(v) {
        if (!v) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
        const t = Date.parse(v);
        if (Number.isNaN(t)) return "";
        return new Date(t).toLocaleDateString("es-AR");
    }

    function render(rows) {
        const top6 = rows.slice(0, 6);
        if (!top6.length) {
            list.innerHTML = `<div class="list-group-item text-muted">Sin resultados</div>`;
            list.classList.remove("d-none");
            return;
        }

        list.innerHTML = top6.map(r => `
      <a class="list-group-item list-group-item-action d-flex justify-content-between align-items-start"
         data-dni="${r.__dni}" data-id="${r.__id}" data-date="${r.fecha}">
        <div class="me-3">
          <div class="d-flex align-items-center gap-2">
            <span class="rounded-circle d-inline-block" style="width:10px;height:10px;background:${r.__color};"></span>
            <small class="text-muted">${r.__fletero} · ${r.__dni}</small>
          </div>
          <div><strong>${r.cliente || "(sin cliente)"}</strong></div>
          <div class="meta text-muted">${r.carga || "¿?"} → ${r.descarga || "¿?"} · ${fmtDate(r.fecha)}</div>
        </div>
        <span class="bi bi-chevron-right"></span>
      </a>
    `).join("");

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
        const dni = item.dataset.dni;
        const id = item.dataset.id;
        const date = item.dataset.date || "";
        location.href = `schedule.html?dni=${encodeURIComponent(dni)}&date=${encodeURIComponent(date)}&doc=${encodeURIComponent(id)}`;
    });
}

// Ejecutar cuando el DOM esté
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
    boot();
}
