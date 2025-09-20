// js/schedule.js
// ----------------------------------------------------
// Firestore (SIEMPRE desde utils.js)
// ----------------------------------------------------
import {
  db, doc, getDoc, collection, getDocs, deleteDoc,
  query, where, showLoading
} from "./utils.js";

// ----------------------------------------------------
// Estado y helpers
// ----------------------------------------------------
let CURRENT_DATE = "";                 // YYYY-MM-DD de la agenda visible
let CURRENT_DNI = "";                 // DNI actual
let deleteTarget = { dni: null, docId: null };
let modalEliminar = null;

function computeDiaTotals(viajes) {
  let totalServicio = 0;      // suma de precioServicio
  let totalAyudantes = 0;     // suma de cant * precio (solo si cant>0 y precio>0)
  let cantAyudantes = 0;      // cantidad total de ayudantes (sumada)
  const unitPrices = new Set();

  for (const v of viajes) {
    const c = v.cliente || {};
    const a = v.ayudantes || {};
    const precio = Number(c.precioServicio) || 0;
    const cant = Number(a.cantidad) || 0;
    const pa = Number(a.precio) || 0;

    totalServicio += precio;
    if (cant > 0 && pa > 0) {
      totalAyudantes += cant * pa;
      cantAyudantes += cant;
      unitPrices.add(pa);
    }
  }

  const helperUnit = unitPrices.size === 1 ? [...unitPrices][0] : null;

  return {
    totalCobrar: totalServicio + totalAyudantes,
    totalAyudantes,
    totalBrutoChofer: totalServicio, // = Total a cobrar - Total a ayudantes
    cantAyudantes,
    helperUnit
  };
}


function renderTotalesDia(viajes, feePct = 0, driverName = "") {
  const box = document.getElementById("totales-dia");
  if (!box) return;

  // Ocultar si no hay viajes
  if (!viajes || viajes.length === 0) {
    box.innerHTML = "";
    box.classList.remove("sd-card", "p-3");
    return;
  }

  const { totalBrutoChofer } = computeDiaTotals(viajes);

  // "Cobrado" es lo del viaje (sin ayudantes)
  const cobrado = totalBrutoChofer;

  // Comisión: mostrar el monto de la comisión (no el neto)
  const pct = Number(feePct) || 0;
  const montoComision = Math.round(cobrado * pct / 100);

  box.classList.add("sd-card", "p-3");
  box.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">Viajes del día</h6>
      <span class="badge bg-light text-dark border">${viajes.length} viajes</span>
    </div>

    <div class="line mb-2">
      <span>Cobrado</span>
      <span class="fw-semibold">$${formatMoney(cobrado)}</span>
    </div>

    ${pct > 0 ? `
      <hr class="my-2">
      <div class="line mb-1">
        <span class="fw-semibold">Comisión (${pct}%)</span>
        <span class="display-total">$${formatMoney(montoComision)}</span>
      </div>
    ` : ``}
  `;
}


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
    <button type="button" class="btn btn-outline-secondary day-chip no-selected" data-date="${prev.value}">
      <span class="dow">${prev.prevDow}</span><small class="dom">${prev.prevDom}</small>
    </button>
    <div class="day-current" data-date="${cur.value}">${cur.center}</div>
    <button type="button" class="btn btn-outline-secondary day-chip no-selected" data-date="${next.value}">
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
    const bruto = Number(c.precioServicio) || 0;                         // total sin comisión
    const neto = feePct ? Math.round(bruto * (1 - (Number(feePct) || 0) / 100)) : bruto;

    const cargaTxt = `${c.direccionCarga || ""}, ${c.localidadCarga || ""}`;
    const descargaTxt = `${c.direccionDescarga || ""}, ${c.localidadDescarga || ""}`;

    const adminBtnHtml = isAdmin ? `
      <div class="d-flex align-items-center" data-visible-for="admin" data-admin-action>
        <button
          class="btn btn-light btn-icon ms-2 btn-edit-trip"
          title="Editar"
          data-doc-id="${viaje.__id}"
          data-dni="${CURRENT_DNI}"
        >
          <i class="bi bi-pencil-square"></i>
        </button>

        <button
          class="btn btn-light btn-icon ms-2 btn-delete-trip btn-trash"
          title="Eliminar"
          data-doc-id="${viaje.__id}"
          data-dni="${CURRENT_DNI}"
          data-cliente="${esc(c.nombre || "")}"
          data-horario="${esc(c.horario || "")}"
          data-carga="${esc(cargaTxt)}"
          data-descarga="${esc(descargaTxt)}"
        >
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    ` : ``;


    const card = document.createElement("div");
    card.className = "viaje mb-4 p-0 shadow-sm";

    const cantAy = Number(ayud.cantidad) || 0;
    const precioAy = Number(ayud.precio) || 0;
    const totalAy = cantAy * precioAy;
    const showHelpers = cantAy > 0 && precioAy > 0;

    const helpersBody = showHelpers ? `
  <small class="mb-0">Ayudantes:</small>
  <div class="mb-1"><b>${cantAy} | $${formatMoney(precioAy)}</b></div>
` : "";

    const totalCobrarViaje = bruto + (showHelpers ? totalAy : 0);

    // clic en Editar → navegar a new-trip con modo edición
    contViajes.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-edit-trip");
      if (!btn) return;

      const dni = btn.dataset.dni;
      const id = btn.dataset.docId;

      // URL de retorno (vuelve a la agenda actual)
      const returnTo = `${location.pathname}${location.search}`;
      const params = new URLSearchParams({
        mode: "edit",
        dni,
        id,
        return: returnTo
      });

      location.href = `new-trip.html?${params.toString()}`;
    });

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
              <b>${c.direccionCarga || ""}, ${c.localidadCarga || ""}</b>
            </div>

            <small class="mb-0">Detalle:</small>
            <div class="mb-1"><b>${c.detalle || ""}</b></div>

            <small class="mb-0">Descarga:</small>
            <div class="mb-1 d-flex align-items-center gap-2 flex-wrap">
              <b>${c.direccionDescarga || ""}, ${c.localidadDescarga || ""}</b>
            </div>

            <small class="mb-0">Peajes:</small>
            <div class="mb-1"><b>${c.peajes || ""}</b></div>

            ${helpersBody}
          </div>
          <div class="precio-badge">
          
          ${showHelpers ? `
            <div class="text-white-50 small mt-1 d-flex justify-content-between align-items-center gap-2">
            Precio flete: <b class="text-white">$${formatMoney(bruto)}</b>
            </div>
            <div class="text-white-50 small mt-1 d-flex justify-content-between align-items-center gap-2">
              Total a ayudantes: <b class="text-white">$${formatMoney(totalAy)}</b>
            </div>
            <div class="d-flex justify-content-between align-items-center gap-2">
              <small class="mb-0 text-white fw-semibold">Cobrar: </small>
              <h3 class="mb-0 text-white">$${formatMoney(totalCobrarViaje)}</h3>
            </div>
          ` : `
          <div class="d-flex justify-content-between align-items-center gap-2">
              <small class="mb-0 text-white mr-5">Cobrar: </small>
              <h3 class="mb-0 text-white"> $${formatMoney(totalCobrarViaje)}</h3>
            </div>
          `}

          

        </div>

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
  showLoading(true);
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

  const isAdmin = (window?.currentUser?.permission || "").toLowerCase() === "admin";

  renderViajes(viajes, fletero.colorHex, feePct, country, isAdmin);
  renderTotalesDia(viajes, feePct, fletero.name);
  renderDayNavigator(fechastr, (newDate) => cargarAgenda(newDate));

  const dp = document.getElementById("datePicker");
  if (dp) dp.value = fechastr;
  updateDateChipLabel(fechastr);

  showLoading(false);
}

function getDateFromUrlParam() {
  const qs = new URLSearchParams(location.search);
  const d = qs.get("date");
  return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null;
}

// ----------------------------------------------------
// Boot
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const datePicker = document.getElementById("datePicker");
  const dateChip = document.getElementById("dateChip");
  const btnHoy = document.getElementById("btnHoy");
  const modalEl = document.getElementById("modalEliminarViaje");

  if (modalEl && window.bootstrap) modalEliminar = new bootstrap.Modal(modalEl);

  const initial = getDateFromUrlParam() || formatDateToYYYYMMDD(new Date());

  if (datePicker) {
    datePicker.value = initial;
    updateDateChipLabel(initial);
  }
  cargarAgenda(initial);

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  datePicker?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (v) {
      updateDateChipLabel(v);
      cargarAgenda(v);
    }
  });

  if (isIOS) {
    try { datePicker.type = "date"; } catch (e) { }
    datePicker.classList.remove("visually-hidden");
    datePicker.classList.add("ios-date-overlay");
    dateChip?.setAttribute("aria-hidden", "true");
    dateChip?.setAttribute("tabindex", "-1");
  } else {
    dateChip?.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof datePicker.showPicker === "function") {
        datePicker.showPicker();
      } else {
        datePicker.focus();
        datePicker.click();
      }
    });
  }

  btnHoy?.addEventListener("click", () => {
    const todayStr = formatDateToYYYYMMDD(new Date());
    if (datePicker) datePicker.value = todayStr;
    updateDateChipLabel(todayStr);
    cargarAgenda(todayStr);
  });
});

// ----------------------------------------------------
// Interacciones (eliminar / copiar)
// ----------------------------------------------------
const contViajes = document.getElementById("viajes-dia");
if (contViajes) {
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
    showLoading(true);
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
      showLoading(false);
    }
  });
}

function formatYYYYMMDDtoDDMMYYYY(str = "") {
  const [y, m, d] = (str || "").split("-");
  if (!y || !m || !d) return str || "";
  return `${d}/${m}/${y}`;
}
function updateDateChipLabel(yyyy_mm_dd) {
  const lab = document.getElementById("dateChipLabel");
  if (lab) lab.textContent = formatYYYYMMDDtoDDMMYYYY(yyyy_mm_dd);
}
