// js/schedule.js
// ----------------------------------------------------
// Firestore (SIEMPRE desde utils.js)
// ----------------------------------------------------
import {
  db, doc, getDoc, collection, getDocs, deleteDoc,
  query, where, showLoading
} from "./utils.js";

// ===== Datepicker en MODAL (inline) con contadores =====
let FP = null;                            // instancia flatpickr (modal)
const monthCountCache = new Map();        // `${dni}:${YYYY-MM}` -> { 'YYYY-MM-DD': count }
let DATE_MODAL = null;                    // instancia bootstrap.Modal
let CURRENT_COLOR = "#135322";            // color del fletero activo

/** Devuelve {'YYYY-MM-DD': cantidad} para un mes */
async function fetchMonthCounts(dni, year, month) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const cacheKey = `${dni}:${ym}`;
  if (monthCountCache.has(cacheKey)) return monthCountCache.get(cacheKey);

  const itemsRef = collection(db, "viajes", dni, "items");
  const counts = {};

  try {
    const q1 = query(itemsRef, where("ym", "==", ym));
    const qs1 = await getDocs(q1);
    qs1.forEach(s => {
      const v = s.data() || {};
      const f = v.fecha || v.cliente?.fecha;
      if (f) counts[f] = (counts[f] || 0) + 1;
    });
    monthCountCache.set(cacheKey, counts);
    return counts;
  } catch { }

  try {
    const start = `${ym}-01`, end = `${ym}-31`;
    const q2 = query(itemsRef, where("fecha", ">=", start), where("fecha", "<=", end));
    const qs2 = await getDocs(q2);
    qs2.forEach(s => {
      const v = s.data() || {};
      const f = v.fecha || v.cliente?.fecha;
      if (f) counts[f] = (counts[f] || 0) + 1;
    });
    monthCountCache.set(cacheKey, counts);
    return counts;
  } catch {
    const all = await getDocs(itemsRef);
    all.forEach(s => {
      const v = s.data() || {};
      const f = v.fecha || v.cliente?.fecha;
      if (f?.startsWith(ym)) counts[f] = (counts[f] || 0) + 1;
    });
    monthCountCache.set(cacheKey, counts);
    return counts;
  }
}

/** Asegura que el mes visible esté decorado */
async function ensureMonthDecorations(instance, dni) {
  const y = instance.currentYear;
  const m = instance.currentMonth + 1;
  await fetchMonthCounts(dni, y, m);
  instance.redraw(); // dispara onDayCreate
}

/** Inicializa el calendario inline dentro del modal */
function initModalDatePicker(dni, colorHex = "#135322") {
  const host = document.getElementById("modalCalendarHost");
  if (!host) return;

  FP = flatpickr(host, {
  inline: true,
  locale: "es",
  dateFormat: "Y-m-d",
  defaultDate: CURRENT_DATE || new Date(),
  disableMobile: true,

    onReady: async (_s, _t, inst) => {
      await ensureMonthDecorations(inst, inst.__dni);
      prefetchNeighbors(inst.__dni, inst);
    },
    onMonthChange: async (_s, _t, inst) => {
      await ensureMonthDecorations(inst, inst.__dni);
      prefetchNeighbors(inst.__dni, inst);
    },
    onYearChange: async (_s, _t, inst) => {
      await ensureMonthDecorations(inst, inst.__dni);
      prefetchNeighbors(inst.__dni, inst);
    },


    // contador por día (dot)
    // contador por día (dot)
    onDayCreate: function (_sel, _str, inst, dayElem) {
      if (
        dayElem.classList.contains("prevMonthDay") ||
        dayElem.classList.contains("nextMonthDay") ||
        dayElem.classList.contains("disabled")
      ) return;

      const d = dayElem.dateObj;
      if (!d) return;

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const ym = `${y}-${m}`;
      const ymd = `${ym}-${dd}`;

      const counts = monthCountCache.get(`${inst.__dni}:${ym}`);
      const count = counts?.[ymd] || 0;
      if (!count) return;

      dayElem.classList.add("has-trips");

      const badge = document.createElement("span");
      badge.className = "trip-badge";
      if (count >= 100) badge.classList.add("badge-3d");
      else if (count >= 10) badge.classList.add("badge-2d");

      badge.style.background = inst.__colorHex || "#135322";
      badge.textContent = count >= 100 ? "99+" : String(count);
      dayElem.appendChild(badge);
    },


    // elegir fecha => actualiza agenda y cierra modal
    onChange: function (_sel, dateStr) {
      if (!dateStr) return;
      updateDateChipLabel(dateStr);
      cargarAgenda(dateStr);
      DATE_MODAL?.hide();
    }
  });

  // metadata para reutilizar instancia
  FP.__dni = dni;
  FP.__colorHex = colorHex;
}

/** Abre el modal y sincroniza el mes/fecha */
async function openDateModal() {
  if (!DATE_MODAL) {
    const modalEl = document.getElementById("dateModal");
    DATE_MODAL = new bootstrap.Modal(modalEl);
  }
  if (!FP) initModalDatePicker(CURRENT_DNI, CURRENT_COLOR);

  // sincronizar fecha visible + conteos del mes actual
  FP.setDate(CURRENT_DATE || new Date(), false);
  const d = stringToDate(CURRENT_DATE || formatDateToYYYYMMDD(new Date()));
  await fetchMonthCounts(CURRENT_DNI, d.getFullYear(), d.getMonth() + 1);
  FP.redraw();

  DATE_MODAL.show();
}

// ----------------------------------------------------
// Estado y helpers
// ----------------------------------------------------
let CURRENT_DATE = "";                 // YYYY-MM-DD de la agenda visible
let CURRENT_DNI = "";                  // DNI actual
let deleteTarget = { dni: null, docId: null };
let modalEliminar = null;

function computeDiaTotals(viajes) {
  let totalServicio = 0;
  let totalAyudantes = 0;
  let cantAyudantes = 0;
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
    totalBrutoChofer: totalServicio,
    cantAyudantes,
    helperUnit
  };
}

function renderTotalesDia(viajes, feePct = 0, driverName = "") {
  const box = document.getElementById("totales-dia");
  if (!box) return;

  if (!viajes || viajes.length === 0) {
    box.innerHTML = "";
    box.classList.remove("sd-card", "p-3");
    return;
  }

  const { totalBrutoChofer } = computeDiaTotals(viajes);
  const cobrado = totalBrutoChofer;

  const pct = Number(feePct) || 0;
  const montoComision = Math.round(cobrado * pct / 100);

  box.classList.add("sd-card", "p-3");
  box.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">Viajes del día</h6>
      <span class="badge bg-light text-dark border">${viajes.length} viajes</span>
    </div>

    <div class="line mb-2">
      <span>Total a cobrar</span>
      <span class="fw-semibold">$${formatMoney(totalCobrar)}</span>
    </div>

    ${ayudantesLine}

    <hr class="my-2">
    ${expr ? `<div class="text-end small muted">${expr}</div>` : ``}
    <div class="line mb-1">
      <span class="fw-semibold">Total a rendir</span>
      <span class="display-total">$${formatMoney(totalBrutoChofer)}</span>
    </div>
    
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
  nav.querySelectorAll("[data-date]").forEach(el =>
    el.addEventListener("click", () => {
      if (FP) FP.setDate(el.dataset.date, true);
      else onChange(el.dataset.date);
    })
  );

  nav.onkeydown = (ev) => {
    if (ev.key === "ArrowLeft") {
      if (FP) FP.setDate(prev.value, true); else onChange(prev.value);
    }
    if (ev.key === "ArrowRight") {
      if (FP) FP.setDate(next.value, true); else onChange(next.value);
    }
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
    const qy = query(itemsRef, where("fecha", "==", fechastr));
    const qs = await getDocs(qy);
    if (!qs.empty) return qs.docs.map(d => ({ __id: d.id, ...d.data() }));
  } catch { }

  const snap = await getDocs(itemsRef);
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

    const color = colorHex || "#ffc107";
    const bruto = Number(c.precioServicio) || 0;
    const cantAy = Number(ayud.cantidad) || 0;
    const precioAy = Number(ayud.precio) || 0;
    const totalAy = cantAy * precioAy;
    const showHelpers = cantAy > 0 && precioAy > 0;
    const totalCobrarViaje = bruto + (showHelpers ? totalAy : 0);

    const cargaTxt = `${c.direccionCarga || ""}, ${c.localidadCarga || ""}`;
    const descargaTxt = `${c.direccionDescarga || ""}, ${c.localidadDescarga || ""}`;

    const adminBtnHtml = isAdmin ? `
      <div class="d-flex align-items-center" data-visible-for="admin" data-admin-action>
        <button class="btn btn-light btn-icon ms-2 btn-edit-trip" title="Editar"
          data-doc-id="${viaje.__id}" data-dni="${CURRENT_DNI}">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-light btn-icon ms-2 btn-delete-trip btn-trash" title="Eliminar"
          data-doc-id="${viaje.__id}" data-dni="${CURRENT_DNI}"
          data-cliente="${esc(c.nombre || "")}" data-horario="${esc(c.horario || "")}"
          data-carga="${esc(cargaTxt)}" data-descarga="${esc(descargaTxt)}">
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    ` : ``;

    const helpersBody = showHelpers ? `
      <small class="mb-0">Ayudantes:</small>
      <div class="mb-1"><b>${cantAy} | $${formatMoney(precioAy)}</b></div>
    ` : "";

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
                <h3 class="mb-0 text-white">$${formatMoney(totalCobrarViaje)}</h3>
              </div>
            `}
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
  try {
    CURRENT_DATE = fechastr;

    const dni = getDniFromUrl();
    if (!dni) return;
    CURRENT_DNI = dni;

    const [fletero, viajesRaw] = await Promise.all([
      getFletero(dni),
      getViajesPorDia(dni, fechastr)
    ]);
    if (!fletero) return;

    // color y metadata del modal
    const color = fletero.colorHex || "#135322";
    CURRENT_COLOR = color;
    if (FP) { FP.__dni = CURRENT_DNI; FP.__colorHex = CURRENT_COLOR; }

    // si el calendario ya existe, sincronizá fecha/mes y decoraciones
    if (FP) {
      FP.setDate(fechastr, false);
      const d = stringToDate(fechastr);
      await fetchMonthCounts(dni, d.getFullYear(), d.getMonth() + 1);
      FP.redraw();
    } else {
      // si aún no existe, al menos precargá conteos del mes actual para que el modal abra listo
      const d = stringToDate(fechastr);
      await fetchMonthCounts(dni, d.getFullYear(), d.getMonth() + 1);
    }

    // UI agenda
    document.getElementById("titulo-agenda").innerText = `Agenda de ${fletero.name}`;
    document.documentElement.style.setProperty("--color-primario", color);

    const feePct = Number(fletero.fee ?? fletero.comision ?? 0);
    const country = (fletero.country || fletero.countryIso || "AR").toUpperCase();
    const viajes = sortPorHorario(viajesRaw);
    const isAdmin = (window?.currentUser?.permission || "").toLowerCase() === "admin";

    renderViajes(viajes, color, feePct, country, isAdmin);
    renderTotalesDia(viajes, feePct, fletero.name);
    renderDayNavigator(fechastr, (newDate) => cargarAgenda(newDate));
    updateDateChipLabel(fechastr);
  } finally {
    showLoading(false);
  }
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
  // modal eliminar (si existe en el DOM)
  const modalEl = document.getElementById("modalEliminarViaje");
  if (modalEl && window.bootstrap) modalEliminar = new bootstrap.Modal(modalEl);

  // abrir modal al tocar el chip
  document.getElementById("dateChip")?.addEventListener("click", (e) => {
    e.preventDefault();
    openDateModal();
  });

  // botón "Hoy" del modal
  document.getElementById("btnModalToday")?.addEventListener("click", () => {
    const today = formatDateToYYYYMMDD(new Date());
    if (FP) FP.setDate(today, true);  // true -> dispara onChange => carga agenda y cierra
  });

  const initial = getDateFromUrlParam() || formatDateToYYYYMMDD(new Date());
  updateDateChipLabel(initial);
  cargarAgenda(initial);
});

// ----------------------------------------------------
// Interacciones (editar / eliminar / copiar)
// ----------------------------------------------------
const contViajes = document.getElementById("viajes-dia");

// Editar
if (contViajes) {
  contViajes.addEventListener("click", (e) => {
    const btnEdit = e.target.closest(".btn-edit-trip");
    if (btnEdit) {
      const dni = btnEdit.dataset.dni;
      const id = btnEdit.dataset.docId;
      const returnTo = `${location.pathname}${location.search}`;
      const params = new URLSearchParams({ mode: "edit", dni, id, return: returnTo });
      location.href = `new-trip.html?${params.toString()}`;
      return;
    }
  });

  // Eliminar
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

  // Copiar
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

// Debug rápido desde consola
window.__debugMonth = async function () {
  const d = stringToDate(CURRENT_DATE);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const m = await fetchMonthCounts(CURRENT_DNI, d.getFullYear(), d.getMonth() + 1);
  console.log("Counts", CURRENT_DNI, ym, m);
};

async function prefetchNeighbors(dni, inst) {
  const y = inst.currentYear, m = inst.currentMonth + 1;
  const prev = new Date(y, m - 2, 1);
  const next = new Date(y, m, 1);
  await Promise.all([
    fetchMonthCounts(dni, prev.getFullYear(), prev.getMonth() + 1),
    fetchMonthCounts(dni, next.getFullYear(), next.getMonth() + 1),
  ]);
}
