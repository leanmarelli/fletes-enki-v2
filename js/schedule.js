// js/schedule.js
// ----------------------------------------------------
// Firebase
// ----------------------------------------------------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
    getFirestore, doc, getDoc, collection, getDocs, deleteDoc,
    query, where
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

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

// ----------------------------------------------------
// Estado y helpers
// ----------------------------------------------------
let CURRENT_DATE = "";                 // YYYY-MM-DD de la agenda visible
let CURRENT_DNI = "";                 // DNI actual
let deleteTarget = { dni: null, docId: null };
let modalEliminar = null;

// prefijos de país para WhatsApp
const DIAL_BY_ISO = { AR: "54", UY: "598", CL: "56", PY: "595" };

const esc = (s = "") => String(s).replace(/"/g, "&quot;");

function formatDateToYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function stringToDate(str) {
    const [y, m, d] = (str || "").split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}
function getDniFromUrl() {
    const qs = new URLSearchParams(location.search);
    return qs.get("dni");
}

function hexToRGB(hex = "") {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}
function isDark(hex) {
    const { r, g, b } = hexToRGB(hex);
    const L = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
    return L < 0.5;
}
const formatMoney = n => (Number(n) || 0).toLocaleString("es-AR");

const normalizePhone = s => (s || "").replace(/\D/g, "");
function toWhats(number = "", iso = "AR") {
    let n = normalizePhone(number);
    const cc = DIAL_BY_ISO[(iso || "AR").toUpperCase()] || "54";
    n = n.replace(/^0+/, "");
    if (!n.startsWith(cc)) n = cc + n;
    return `https://wa.me/${n}`;
}

function tipoToClass(t = "") {
    t = t.toLowerCase();
    if (t.includes("mudanza")) return "badge-mudanza";
    if (t.includes("traslado")) return "badge-traslado";
    return "badge-carga";
}

// ----------------------------------------------------
// Navegador de días
// ----------------------------------------------------
function renderDayNavigator(fecha, onChange) {
    const base = typeof fecha === "string" ? stringToDate(fecha) : fecha;

    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
    const noAcc = s => (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "");

    const make = (off) => {
        const d = new Date(base); d.setDate(base.getDate() + off);
        const dow = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(d);
        const mon = new Intl.DateTimeFormat("es-AR", { month: "short" }).format(d);
        const dom = String(d.getDate()).padStart(2, "0");
        const center = `${cap(noAcc(dow).replace(/\.$/, "").slice(0, 3))} ${dom} de ${cap(noAcc(mon).replace(/\.$/, "").slice(0, 3))}`;
        return {
            value: formatDateToYYYYMMDD(d),
            prevDow: cap(noAcc(dow).replace(/\.$/, "").slice(0, 3)),
            prevDom: new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(d),
            center
        };
    };

    const prev = make(-1), cur = make(0), next = make(1);
    const nav = document.getElementById("dia-navigator");
    nav.classList.add("day-nav");
    nav.innerHTML = `
    <button type="button" class="btn btn-outline-secondary day-chip" data-date="${prev.value}">
      <span class="dow">${prev.prevDow}</span><small class="dom">${prev.prevDom}</small>
    </button>
    <div class="day-current" data-date="${cur.value}">${cur.center}</div>
    <button type="button" class="btn btn-outline-secondary day-chip" data-date="${next.value}">
      <span class="dow">${next.prevDow}</span><small class="dom">${next.prevDom}</small>
    </button>
  `;
    nav.querySelectorAll("[data-date]").forEach(el => el.addEventListener("click", () => onChange(el.dataset.date)));
    nav.onkeydown = (ev) => {
        if (ev.key === "ArrowLeft") onChange(prev.value);
        if (ev.key === "ArrowRight") onChange(next.value);
    };
}

// ----------------------------------------------------
// Fetch de datos (con caché y fallback)
// ----------------------------------------------------
const fleteroCache = new Map();
async function getFletero(dni) {
    if (fleteroCache.has(dni)) return fleteroCache.get(dni);
    const snap = await getDoc(doc(db, "fleteros", dni));
    if (!snap.exists()) return null;
    const data = snap.data();
    fleteroCache.set(dni, data);
    return data;
}

async function getViajesPorDia(dni, fechastr) {
    const itemsRef = collection(db, "viajes", dni, "items");
    try {
        const qy = query(itemsRef, where("fecha", "==", fechastr));           // requiere campo denormalizado "fecha"
        const qs = await getDocs(qy);
        if (!qs.empty) return qs.docs.map(d => ({ __id: d.id, ...d.data() }));
    } catch { /* si no existe índice/campo, fallback */ }

    const snap = await getDocs(itemsRef);                                   // fallback
    const out = [];
    snap.forEach(d => {
        const v = d.data();
        const f = v.fecha || v.cliente?.fecha;
        if (f === fechastr) out.push({ __id: d.id, ...v });
    });
    return out;
}

function sortPorHorario(arr) {
    const toMin = h => (h && h.includes(":")) ? (+h.split(":")[0] * 60 + +h.split(":")[1]) : -1;
    arr.sort((a, b) => toMin(a.cliente?.horario) - toMin(b.cliente?.horario));
    return arr;
}

// ----------------------------------------------------
// Render de viajes
// ----------------------------------------------------
function renderViajes(viajes, colorHex, feePct = 0, countryIso = "AR", isAdmin = false) {
    const cont = document.getElementById("viajes-dia");
    cont.innerHTML = "";
    if (!viajes.length) {
        cont.innerHTML = `<div class="alert alert-warning text-center">No hay viajes para este día.</div>`;
        return;
    }

    const frag = document.createDocumentFragment();

    viajes.forEach(viaje => {
        const c = viaje.cliente || {};
        const ayud = viaje.ayudantes || {};
        const ayudantesText = ayud.cantidad > 0 ? `${ayud.cantidad} | $${ayud.precio || 0}` : "No";

        const color = colorHex || "#ffc107";
        const bruto = Number(c.precioServicio) || 0;                         // 👈 total sin comisión
        const neto = feePct ? Math.round(bruto * (1 - (Number(feePct) || 0) / 100)) : bruto; // si algún día lo necesitás

        const cargaTxt = `${c.direccionCarga || ""} (${c.localidadCarga || ""})`;
        const descargaTxt = `${c.direccionDescarga || ""} (${c.localidadDescarga || ""})`;

        // 👇 botón eliminar solo si es admin
        const adminBtnHtml = isAdmin ? `
      <button data-visible-for="admin"
              class="btn btn-light btn-icon ms-2 btn-delete-trip btn-trash"
              data-admin-action
              title="Eliminar"
              data-doc-id="${viaje.__id}"
              data-dni="${CURRENT_DNI}"
              data-cliente="${esc(c.nombre || "")}"
              data-horario="${esc(c.horario || "")}"
              data-carga="${esc(cargaTxt)}"
              data-descarga="${esc(descargaTxt)}">
        <i class="bi bi-trash3"></i>
      </button>
    ` : ``;

        const card = document.createElement("div");
        card.className = "viaje mb-4 p-0 shadow-sm";
        card.innerHTML = `
      <div class="d-flex align-items-stretch">
        <div class="barra-lateral" style="background:${color};">
          <span class="badge hora-badge mt-3 texto-blanco">${c.horario || "-"}</span>
        </div>

        <div class="flex-fill d-flex flex-column justify-content-between">
          <div class="flex-fill p-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="badge badge-chip ${tipoToClass(c.tipoServicio)}">${c.tipoServicio || ""}</span>
              ${adminBtnHtml}
            </div>

            <div class="d-flex justify-content-between align-items-center mb-2">
              <b class="fw-bold fs-6">${c.nombre || ""}</b>
            </div>

            <small class="mb-0">Teléfono:</small>
            <div class="mb-1">
              <a class="link-whats" target="_blank" rel="noopener" href="${toWhats(c.telefono || "", countryIso)}">
                ${c.telefono || ""}
              </a>
            </div>

            <small class="mb-0">Carga:</small>
            <div class="mb-1 d-flex align-items-center gap-2 flex-wrap">
              <b>${c.direccionCarga || ""} (${c.localidadCarga || ""})</b>
            </div>

            <small class="mb-0">Detalle:</small>
            <div class="mb-1"><b>${c.detalle || ""}</b></div>

            <small class="mb-0">Descarga:</small>
            <div class="mb-1 d-flex align-items-center gap-2 flex-wrap">
              <b>${c.direccionDescarga || ""} (${c.localidadDescarga || ""})</b>
            </div>

            <small class="mb-0">Peajes:</small>
            <div class="mb-1"><b>${c.peajes || ""}</b></div>

            <small class="mb-0">Ayudantes:</small>
            <div class="mb-1"><b>${ayudantesText}</b></div>
          </div>

          <div class="precio-badge">
            <small class="mb-0">Precio servicio (total):</small>
            <h3 class="mb-0">$${formatMoney(bruto)}</h3>    <!-- 👈 ahora se muestra el total sin comisión -->
            <!-- Si querés mostrar el neto solo para admin, descomentá:
            ${isAdmin && feePct ? `<small class="mb-0">Neto (–${feePct}%): $${formatMoney(neto)}</small>` : ``}
            -->
          </div>
        </div>
      </div>
    `;
        frag.appendChild(card);
    });

    cont.appendChild(frag);
}


// ----------------------------------------------------
// Controlador principal
// ----------------------------------------------------
async function cargarAgenda(fechastr) {
    CURRENT_DATE = fechastr;
    const dni = getDniFromUrl();
    if (!dni) return;
    CURRENT_DNI = dni;

    const [fletero, viajesRaw] = await Promise.all([
        getFletero(dni),
        getViajesPorDia(dni, fechastr)
    ]);
    if (!fletero) return;

    document.getElementById("titulo-agenda").innerText = `Agenda de ${fletero.name}`;
    document.documentElement.style.setProperty("--color-primario", fletero.colorHex || "#135322");

    const feePct = Number(fletero.fee ?? fletero.comision ?? 0);
    const country = (fletero.country || fletero.countryIso || "AR").toUpperCase();
    const viajes = sortPorHorario(viajesRaw);

    // ...
    const isAdmin = (window?.currentUser?.permission || "").toLowerCase() === "admin";

    // Render principal
    renderViajes(viajes, fletero.colorHex, feePct, country, isAdmin);
    renderDayNavigator(fechastr, (newDate) => cargarAgenda(newDate));

    // Nuevo: sincronizar date-picker y mostrar resumen del día
    const dp = document.getElementById("datePicker");
    if (dp) dp.value = fechastr;
    updateDateChipLabel(fechastr);


}


// ----------------------------------------------------
// Boot
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    const hoy = formatDateToYYYYMMDD(new Date());
    const modalEl = document.getElementById("modalEliminarViaje");
    if (modalEl && window.bootstrap) modalEliminar = new bootstrap.Modal(modalEl);

    const datePicker = document.getElementById("datePicker");
    const dateChip = document.getElementById("dateChip");
    const btnHoy = document.getElementById("btnHoy");

    if (datePicker) {
        datePicker.value = hoy;
        updateDateChipLabel(hoy);

        datePicker.addEventListener("change", (e) => {
            const v = e.target.value;
            if (v) cargarAgenda(v);
        });
    }

    if (dateChip && datePicker) {
        dateChip.addEventListener("click", () => {
            // Abre el selector nativo manteniendo accesibilidad
            if (typeof datePicker.showPicker === "function") datePicker.showPicker();
            else datePicker.click();
        });
    }

    if (btnHoy) {
        btnHoy.addEventListener("click", () => cargarAgenda(formatDateToYYYYMMDD(new Date())));
    }

    cargarAgenda(hoy);
});


// ----------------------------------------------------
// Interacciones (eliminar / copiar)
// ----------------------------------------------------
const contViajes = document.getElementById("viajes-dia");
if (contViajes) {
    // abrir modal eliminar
    contViajes.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-delete-trip");
        if (!btn) return;

        deleteTarget = { dni: btn.dataset.dni, docId: btn.dataset.docId };

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || "-"; };
        set("delCliente", btn.dataset.cliente);
        set("delHorario", btn.dataset.horario);
        set("delCarga", btn.dataset.carga);
        set("delDescarga", btn.dataset.descarga);

        modalEliminar?.show();
    });

    // copiar carga/descarga
    contViajes.addEventListener("click", async (e) => {
        const btn = e.target.closest(".copy-btn");
        if (!btn) return;
        const text = btn.dataset.copy || "";
        if (!text) return;

        const old = btn.innerHTML;
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else {
                const ta = document.createElement("textarea");
                ta.value = text; document.body.appendChild(ta);
                ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
            }
            btn.classList.add("copied");
            btn.innerHTML = `<i class="bi bi-check2"></i>`;
            setTimeout(() => { btn.classList.remove("copied"); btn.innerHTML = old; }, 1200);
        } catch (err) {
            console.error("No se pudo copiar", err);
        }
    });
}

// confirmar eliminación
const formEliminar = document.getElementById("formEliminarViaje");
if (formEliminar) {
    formEliminar.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const btn = document.getElementById("btnConfirmarEliminar");
        if (btn) { btn.disabled = true; btn.textContent = "Eliminando…"; }

        try {
            if (!deleteTarget.dni || !deleteTarget.docId) throw new Error("Falta destino");
            await deleteDoc(doc(db, "viajes", deleteTarget.dni, "items", deleteTarget.docId));
            modalEliminar?.hide();
            await cargarAgenda(CURRENT_DATE);
        } catch (err) {
            console.error(err);
            alert("No se pudo eliminar el viaje. Intentá de nuevo.");
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Eliminar"; }
            deleteTarget = { dni: null, docId: null };
        }
    });
}

function renderResumenDia(viajes, feePct = 0) {
    const el = document.getElementById("resumen-dia");
    if (!el) return;

    const totalViajes = viajes.length;
    const totalBruto = viajes.reduce((acc, v) => acc + (Number(v?.cliente?.precioServicio) || 0), 0);

    // Si quisieras mostrar neto con comisión del fletero:
    // const totalNeto = feePct ? Math.round(totalBruto * (1 - feePct/100)) : totalBruto;

    el.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-truck"></i>
          <div>
            <div class="text-muted small">Viajes del día</div>
            <div class="fs-5 fw-bold mb-0">${totalViajes}</div>
          </div>
        </div>

        <div class="vr d-none d-md-block"></div>

        <div>
          <div class="text-muted small">Total recaudado (bruto)</div>
          <div class="fs-4 fw-bold mb-0">$${formatMoney(totalBruto)}</div>
        </div>
      </div>
    </div>
  `;
}

// Formatea 2025-08-26 -> 26/08/2025
function formatYYYYMMDDtoDDMMYYYY(str = "") {
    const [y, m, d] = (str || "").split("-");
    if (!y || !m || !d) return str || "";
    return `${d}/${m}/${y}`;
}

function updateDateChipLabel(yyyy_mm_dd) {
    const lab = document.getElementById("dateChipLabel");
    if (lab) lab.textContent = formatYYYYMMDDtoDDMMYYYY(yyyy_mm_dd);
}

