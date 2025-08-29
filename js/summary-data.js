// js/summary-data.js
// ----------------------------------------------------
// Resumen por semana/mes + Ajustes persistentes
// - Firestore via utils.js (db centralizado + cache local)
// - Ajustes en: ajustes/{dni}/items
//    { scope: 'week'|'month',
//      periodKey: 'YYYY-MM' (mes) | 'YYYY-MM-DD' (lunes de la semana),
//      monto: number (positivo= sumar, negativo= descontar),
//      motivo: string,
//      by: string (nombre visible),
//      ts: number (Date.now) }
// ----------------------------------------------------

import { applyFeatureGates, installActionGuards, isAdmin } from "./gate.js";
import {
    db, collection, getDocs, query, where, orderBy, addDoc, doc, deleteDoc, showLoading
} from "./utils.js";

/* ───────────────────────────────────────────────────────────
   Estado global
─────────────────────────────────────────────────────────── */
let __booted = false;
let CURRENT_DATE = new Date();          // fecha base para semana/mes
const KEY_GENERAL = "__general";
let FLETEROS = [];                       // [{dni,name,fee,colorHex}]
let CURRENT = null;                      // dni o "__general"

// Modal "eliminar ajuste"
let modalEliminarAjuste = null;
let pendingDeleteAj = null;              // { dni, id }

/* ───────────────────────────────────────────────────────────
   Pequeños helpers
─────────────────────────────────────────────────────────── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s = "") => String(s).replace(/"/g, "&quot;");

const toNum = x => Number(String(x ?? 0).replace(/[^\d-]/g, "")) || 0;
const money = n => (Number(n) || 0).toLocaleString("es-AR");
const first = (full = "") => full.trim().split(/\s+/)[0] || full;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const fmtDDMM = (ts) => {
    const d = new Date(ts || Date.now());
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
};

// Devuelve el nombre del fletero por DNI (o el DNI si no lo encuentra)
function findName(dni) {
    const f = (Array.isArray(FLETEROS) ? FLETEROS : []).find(x => x.dni === dni);
    return f?.name || dni;
}


function toDMY(ymdStr) {
    const [Y, M, D] = (ymdStr || "").split("-");
    if (!Y || !M || !D) return "--/--/----";
    return `${String(D).padStart(2, "0")}/${String(M).padStart(2, "0")}/${Y}`;
}
function updateRangeChipLabel(ymdStr) {
    const lab = document.getElementById("rangeChipLabel");
    if (lab) lab.textContent = toDMY(ymdStr);
}

/* ───────────────────────────────────────────────────────────
   Fechas y claves de período
─────────────────────────────────────────────────────────── */
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function mondayOfDate(d = new Date()) {
    const day = d.getDay();                          // 0-dom … 6-sáb
    const delta = (day === 0 ? -6 : 1 - day);        // a lunes ISO
    const m = new Date(d);
    m.setDate(d.getDate() + delta);
    m.setHours(0, 0, 0, 0);
    return m;
}
function weekRange(d = new Date()) {
    const mon = mondayOfDate(d);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: ymd(mon), end: ymd(sun) };
}
function monthRange(d = new Date()) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: ymd(first), end: ymd(last) };
}
function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // "YYYY-MM"
}
function weekKey(d = new Date()) {
    return ymd(mondayOfDate(d)); // usamos el lunes como clave de semana
}
function niceDate(ymdStr) {
    const [Y, M, D] = ymdStr.split("-").map(Number);
    const d = new Date(Y, M - 1, D);
    const dow = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(d).replace(/\.$/, "");
    const mon = new Intl.DateTimeFormat("es-AR", { month: "short" }).format(d).replace(/\.$/, "");
    return `${cap(dow)} ${String(D).padStart(2, "0")} de ${cap(mon)}`;
}
const labelRange = (type, start, end) =>
    `${type === "week" ? "Semana del" : "Mes del"} ${niceDate(start)} al ${niceDate(end)}`;

/* ───────────────────────────────────────────────────────────
   Firestore: fleteros + viajes (con cache por rango)
─────────────────────────────────────────────────────────── */
async function loadFleteros() {
    showLoading(true);
    const snap = await getDocs(collection(db, "fleteros"));
    showLoading(false);
    return snap.docs.map(d => {
        const x = d.data() || {};
        return {
            dni: d.id,
            name: x.name || d.id,
            fee: Number(x.fee ?? x.comision ?? 0),
            colorHex: x.colorHex || "#0d6efd"
        };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const RANGE_CACHE = new Map(); // key: `${dni}|${start}|${end}` → [viajes]
async function viajesEnRango(dni, start, end) {
    const key = `${dni}|${start}|${end}`;
    if (RANGE_CACHE.has(key)) return RANGE_CACHE.get(key);

    const ref = collection(db, "viajes", dni, "items");
    const qy = query(ref, where("fecha", ">=", start), where("fecha", "<=", end), orderBy("fecha"));
    const snap = await getDocs(qy);
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    RANGE_CACHE.set(key, arr);
    return arr;
}

function totalBruto(viajes = []) {
    let t = 0;
    for (const v of viajes) {
        const raw = v.importe ?? v.precioServicio ?? v?.cliente?.precioServicio ?? 0;
        t += toNum(raw);
    }
    return t;
}
function computeWithFee(gross, feePct) {
    const g = Number(gross) || 0;
    const f = Number(feePct) || 0;
    const feeAmount = Math.round(g * f / 100);
    const net = g - feeAmount;
    return { gross: g, feePct: f, feeAmount, net };
}

/* ───────────────────────────────────────────────────────────
   Firestore: Ajustes por período (persistentes)
─────────────────────────────────────────────────────────── */
// cache en memoria para minimizar lecturas
const AJ_CACHE = new Map(); // key: `${dni}|${wk}|${mk}` → {week:[], month:[]}

async function fetchAjustesFor(dni, d = new Date()) {
    const wk = weekKey(d), mk = monthKey(d);
    const ckey = `${dni}|${wk}|${mk}`;
    if (AJ_CACHE.has(ckey)) return AJ_CACHE.get(ckey);

    const baseRef = collection(db, "ajustes", dni, "items");

    // Dos consultas separadas (no usamos OR)
    const [snapW, snapM] = await Promise.all([
        getDocs(query(baseRef, where("scope", "==", "week"), where("periodKey", "==", wk))),
        getDocs(query(baseRef, where("scope", "==", "month"), where("periodKey", "==", mk)))
    ]);

    const mapDoc = d => ({ id: d.id, ...(d.data() || {}) });
    const res = {
        week: snapW.docs.map(mapDoc).sort((a, b) => (a.ts || 0) - (b.ts || 0)),
        month: snapM.docs.map(mapDoc).sort((a, b) => (a.ts || 0) - (b.ts || 0)),
    };
    AJ_CACHE.set(ckey, res);
    return res;
}

async function addAjuste({ dni, scope, baseDate, monto, motivo, by }) {
    const ref = collection(db, "ajustes", String(dni), "items");
    const payload = {
        scope,                                     // 'week'|'month'
        periodKey: scope === "week" ? weekKey(baseDate) : monthKey(baseDate),
        monto: Number(monto) || 0,
        motivo: (motivo || "-").trim(),
        by: by || (findName(dni) || ""),
        ts: Date.now()
    };
    await addDoc(ref, payload);
    // invalidar cache de ese período
    const wk = weekKey(baseDate), mk = monthKey(baseDate);
    AJ_CACHE.delete(`${dni}|${wk}|${mk}`);
}

async function deleteAjuste(dni, id, baseDate) {
    await deleteDoc(doc(db, "ajustes", String(dni), "items", String(id)));
    const wk = weekKey(baseDate), mk = monthKey(baseDate);
    AJ_CACHE.delete(`${dni}|${wk}|${mk}`);
}

/* ───────────────────────────────────────────────────────────
   Cálculos de resumen (viajes + ajustes)
─────────────────────────────────────────────────────────── */
async function sumsForOne(dni, d = new Date()) {
    const f = FLETEROS.find(x => x.dni === dni);
    const fee = f ? Number(f.fee) || 0 : 0;

    const w = weekRange(d), m = monthRange(d);
    const [vw, vm, aj] = await Promise.all([
        viajesEnRango(dni, w.start, w.end),
        viajesEnRango(dni, m.start, m.end),
        fetchAjustesFor(dni, d)
    ]);

    const cw = computeWithFee(totalBruto(vw), fee);
    const cm = computeWithFee(totalBruto(vm), fee);

    return {
        week: { label: labelRange("week", w.start, w.end), ...cw, count: vw.length, ajustes: aj.week },
        month: { label: labelRange("month", m.start, m.end), ...cm, count: vm.length, ajustes: aj.month }
    };
}

async function sumsForGeneral(d = new Date()) {
    const w = weekRange(d), m = monthRange(d);

    let wGross = 0, wNet = 0, wCount = 0;
    let mGross = 0, mNet = 0, mCount = 0;
    const ajWeek = [], ajMonth = [];

    for (const f of FLETEROS) {
        const [vw, vm, aj] = await Promise.all([
            viajesEnRango(f.dni, w.start, w.end),
            viajesEnRango(f.dni, m.start, m.end),
            fetchAjustesFor(f.dni, d)
        ]);

        const gW = totalBruto(vw), gM = totalBruto(vm);
        const cW = computeWithFee(gW, Number(f.fee) || 0);
        const cM = computeWithFee(gM, Number(f.fee) || 0);

        wGross += cW.gross; wNet += cW.net; wCount += vw.length;
        mGross += cM.gross; mNet += cM.net; mCount += vm.length;

        // Agrego ajustes (marco el nombre para mostrar)
        ajWeek.push(...aj.week.map(x => ({ ...x, by: x.by || f.name, __dni: f.dni })));
        ajMonth.push(...aj.month.map(x => ({ ...x, by: x.by || f.name, __dni: f.dni })));
    }

    ajWeek.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    ajMonth.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    return {
        week: { label: labelRange("week", w.start, w.end), gross: wGross, feePct: null, feeAmount: null, net: wNet, count: wCount, ajustes: ajWeek },
        month: { label: labelRange("month", m.start, m.end), gross: mGross, feePct: null, feeAmount: null, net: mNet, count: mCount, ajustes: ajMonth }
    };
}

/* ───────────────────────────────────────────────────────────
   UI: Tabs + Tarjetas
─────────────────────────────────────────────────────────── */
function renderPersonTabs(personas) {
    const wrap = $("#personasTabs");
    if (!wrap) return;
    wrap.innerHTML = "";

    // General
    const gen = document.createElement("button");
    gen.className = "pill pill--general";
    gen.type = "button";
    gen.dataset.id = KEY_GENERAL;
    gen.innerHTML = `<span class="dot" style="background:#adb5bd"></span> General`;
    wrap.appendChild(gen);

    // Fleteros
    personas.forEach(p => {
        const btn = document.createElement("button");
        btn.className = "pill";
        btn.type = "button";
        btn.dataset.id = p.dni;
        btn.innerHTML = `<span class="dot" style="background:${p.colorHex}"></span> ${first(p.name)}`;
        wrap.appendChild(btn);
    });

    // Delegación
    wrap.addEventListener("click", e => {
        const pill = e.target.closest(".pill");
        if (!pill) return;
        wrap.querySelectorAll(".pill").forEach(x => x.classList.remove("active"));
        pill.classList.add("active");
        setPersona(pill.dataset.id);
    });

    wrap.querySelector(".pill")?.classList.add("active");
}
const setActivePill = id => {
    const wrap = $("#personasTabs");
    wrap?.querySelectorAll(".pill").forEach(x => x.classList.toggle("active", x.dataset.id === id));
};

const cardHeader = label => `
  <div class="sd-section-title">
    <span class="bar"></span><span>${label}</span>
  </div>`;

function conceptsList(items, { dni, scope, periodoLabel, allowDelete } = {}) {
    if (!items?.length) return `<small class="text-muted">No hay conceptos aplicados.</small>`;
    return `<div class="concept-list mt-2">
    ${items.map(it => {
        const montoAbs = Math.abs(Number(it.monto) || 0);
        const sign = (Number(it.monto) || 0) < 0 ? "-" : "+";
        const delBtn = (allowDelete && it.id)
            ? `<button type="button"
                   class="btn btn-link p-0 ms-2 text-danger aj-del"
                   title="Eliminar ajuste"
                   data-id="${esc(it.id)}"
                   data-dni="${esc(dni)}"
                   data-scope="${esc(scope)}"
                   data-monto="${String(it.monto)}"
                   data-motivo="${esc(it.motivo || "-")}"
                   data-periodo="${esc(periodoLabel)}"
                   data-persona="${esc(findName(dni))}">
              <i class="bi bi-x-lg"></i>
           </button>`
            : ``;
        return `<div class="sd-concepto d-flex align-items-baseline gap-2">
                <div>
                  <span class="value ${it.monto < 0 ? "neg" : "pos"}">${sign}$${money(montoAbs)}</span>
                  <span class="note">de ${first(it.by || "")} (${it.motivo || "-"}) del ${fmtDDMM(it.ts)}</span>
                </div>
                ${delBtn}
              </div>`;
    }).join("")}
  </div>`;
}

function paintAmount(el, value) {
    if (!el) return;
    el.classList.remove("pos", "neg", "zero");
    if (!value) el.classList.add("zero");
    else if (value > 0) el.classList.add("pos");
    else el.classList.add("neg");
    el.textContent = (value < 0 ? "-$" : "$") + money(Math.abs(value || 0));
}

function renderCards(dni, sums, accentColor = "#0d6efd") {
    const box = $("#cardsContainer");
    if (!box) return;

    const isGen = (dni === KEY_GENERAL);
    const allowDelete = !isGen && isAdmin();
    const weekAdjList = (sums.week.ajustes || []).map(x => ({ ...x, by: x.by || findName(dni) }));
    const monthAdjList = (sums.month.ajustes || []).map(x => ({ ...x, by: x.by || findName(dni) }));

    const wAdj = weekAdjList.reduce((a, x) => a + (Number(x.monto) || 0), 0);
    const mAdj = monthAdjList.reduce((a, x) => a + (Number(x.monto) || 0), 0);

    const weekFinal = (sums.week.net || 0) + wAdj;
    const monthFinal = (sums.month.net || 0) + mAdj;

    const feeLine = (obj) => obj.feePct == null
        ? ""
        : `<div class="small text-muted">Comisión ${obj.feePct}%: -$${money(obj.feeAmount || 0)}</div>`;

    const weekLabel = sums.week.label;
    const monthLabel = sums.month.label;

    box.innerHTML = `
    <div class="summary-card sd-card" style="--card-accent:${accentColor}">
      ${cardHeader(weekLabel)}
      <div class="mt-3">
        <div><strong>Total (sin comisión):</strong> $${money(sums.week.gross || 0)}</div>
        ${feeLine(sums.week)}
        <div><strong>Subtotal (con comisión):</strong> $${money(sums.week.net || 0)}</div>
        <div class="mt-2"><span class="fw-semibold">Ajustes:</span>
          ${conceptsList(weekAdjList, { dni, scope: "week", periodoLabel: weekLabel, allowDelete })}
        </div>
        <p class="sd-amount semana mt-3"></p>
        <p>Cantidad de viajes: <strong>${sums.week.count}</strong></p>
      </div>
      ${!isGen && isAdmin() ? `
        <div class="sd-actions mt-2">
          <button class="btn btn-success btn-sumar-semana">Sumar</button>
          <button class="btn btn-outline-danger btn-descontar-semana">Descontar</button>
        </div>` : ``}
    </div>

    <div class="summary-card sd-card" style="--card-accent:${accentColor}">
      ${cardHeader(monthLabel)}
      <div class="mt-3">
        <div><strong>Total (sin comisión):</strong> $${money(sums.month.gross || 0)}</div>
        ${feeLine(sums.month)}
        <div><strong>Subtotal (con comisión):</strong> $${money(sums.month.net || 0)}</div>
        <div class="mt-2"><span class="fw-semibold">Ajustes:</span>
          ${conceptsList(monthAdjList, { dni, scope: "month", periodoLabel: monthLabel, allowDelete })}
        </div>
        <p class="sd-amount mes mt-3"></p>
        <p>Cantidad de viajes: <strong>${sums.month.count}</strong></p>
      </div>
      ${!isGen && isAdmin() ? `
        <div class="sd-actions mt-2">
          <button class="btn btn-success btn-sumar-mes">Sumar</button>
          <button class="btn btn-outline-danger btn-descontar-mes">Descontar</button>
        </div>` : ``}
    </div>
  `;

    // Totales grandes
    paintAmount($(".sd-amount.semana"), weekFinal);
    paintAmount($(".sd-amount.mes"), monthFinal);

    wireCardActions(dni);
}

/* ───────────────────────────────────────────────────────────
   Interacciones tarjetas (sumar / descontar / eliminar)
─────────────────────────────────────────────────────────── */
function wireCardActions(dni) {
    const box = $("#cardsContainer");
    if (!box) return;

    const modal = $("#ajusteModal");
    const mScope = $("#ajScope");
    const mMonto = $("#ajMonto");
    const mMotivo = $("#ajMotivo");
    const mTitle = $("#ajTitle");
    const mSave = $("#ajSave");
    const bsModal = modal && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modal) : null;

    // 1) Botones sumar/descontar
    box.onclick = (ev) => {
        const addW = ev.target.closest(".btn-sumar-semana");
        const subW = ev.target.closest(".btn-descontar-semana");
        const addM = ev.target.closest(".btn-sumar-mes");
        const subM = ev.target.closest(".btn-descontar-mes");

        let scope = null, plus = true;
        if (addW || subW) { scope = "week"; plus = !!addW; }
        if (addM || subM) { scope = "month"; plus = !!addM; }
        if (!scope) return;

        if (!bsModal) return;

        // Título, preset y bloqueo del "." y ","
        mScope.value = scope;
        mMonto.value = "";
        mMotivo.value = "";
        mMonto.dataset.sign = plus ? "1" : "-1";
        mTitle.textContent = plus ? "Sumar" : "Descontar";

        const keydownBlock = (e) => { if (e.key === "." || e.key === ",") e.preventDefault(); };
        const inputClean = () => {
            const cleaned = mMonto.value.replace(/[.,]/g, "");
            if (cleaned !== mMonto.value) mMonto.value = cleaned;
        };
        mMonto.addEventListener("keydown", keydownBlock);
        mMonto.addEventListener("input", inputClean);

        const onSave = async () => {
            const sign = Number(mMonto.dataset.sign) || 1;
            const raw = toNum(mMonto.value);
            if (!raw) return;

            // evitar doble click
            mSave.disabled = true;
            try {
                await addAjuste({
                    dni,
                    scope,
                    baseDate: CURRENT_DATE,
                    monto: raw * sign,
                    motivo: mMotivo.value,
                    by: first(findName(dni))
                });
                bsModal.hide();
                await setPersona(dni);
            } catch (err) {
                console.error("No se pudo guardar el ajuste:", err);
                alert("No se pudo guardar el ajuste. Intentá de nuevo.");
            } finally {
                mSave.disabled = false;
                mMonto.removeEventListener("keydown", keydownBlock);
                mMonto.removeEventListener("input", inputClean);
            }
        };

        mSave.addEventListener("click", onSave, { once: true });
        bsModal.show();
    };

    // 2) Click en la “x” de un ajuste → abrir modal eliminar
    box.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".aj-del");
        if (!btn) return;

        // popular modal
        $("#delAjPersona").textContent = btn.dataset.persona || "-";
        $("#delAjScope").textContent = btn.dataset.scope === "week" ? "Semana" : "Mes";
        $("#delAjPeriodo").textContent = btn.dataset.periodo || "-";
        const raw = Number(btn.dataset.monto) || 0;
        $("#delAjMonto").textContent = `${raw < 0 ? "-" : ""}$${money(Math.abs(raw))}`;
        $("#delAjMotivo").textContent = btn.dataset.motivo || "-";

        pendingDeleteAj = { dni: btn.dataset.dni, id: btn.dataset.id };
        modalEliminarAjuste?.show();
    });
}

// Confirmación del modal “Eliminar ajuste”
async function onConfirmDeleteAjuste(ev) {
    ev.preventDefault();
    if (!pendingDeleteAj) return;

    const btn = $("#btnConfirmarEliminarAj");
    if (btn) { btn.disabled = true; btn.textContent = "Eliminando…"; }
    try {
        await deleteAjuste(pendingDeleteAj.dni, pendingDeleteAj.id, CURRENT_DATE);
        modalEliminarAjuste?.hide();
        pendingDeleteAj = null;
        await setPersona(CURRENT);
    } catch (err) {
        console.error(err);
        alert("No se pudo eliminar el ajuste. Intentá de nuevo.");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Eliminar"; }
    }
}

/* ───────────────────────────────────────────────────────────
   Loading/estilos
─────────────────────────────────────────────────────────── */
const accentFor = dni => dni === KEY_GENERAL
    ? "#198754"
    : (FLETEROS.find(x => x.dni === dni)?.colorHex || "#0d6efd");

/* ───────────────────────────────────────────────────────────
   Controlador principal de persona/fecha
─────────────────────────────────────────────────────────── */
async function setPersona(dni) {
    CURRENT = dni;
    setActivePill(dni);
    showLoading(true);

    const d = CURRENT_DATE;
    const sums = (dni === KEY_GENERAL) ? await sumsForGeneral(d) : await sumsForOne(dni, d);
    renderCards(dni, sums, accentFor(dni));

    showLoading(false);
}

/* ───────────────────────────────────────────────────────────
   Boot
─────────────────────────────────────────────────────────── */
async function boot() {
    if (__booted) return; __booted = true;

    applyFeatureGates();
    installActionGuards();

    // Modal eliminar ajuste
    const elDelAj = $("#modalEliminarAjuste");
    if (elDelAj && window.bootstrap) {
        modalEliminarAjuste = bootstrap.Modal.getOrCreateInstance(elDelAj);
        elDelAj.querySelector("#formEliminarAjuste")?.addEventListener("submit", onConfirmDeleteAjuste);
    }

    // Modal de alta ajuste si existe en DOM
    const ajModal = $("#ajusteModal");
    if (ajModal && window.bootstrap) bootstrap.Modal.getOrCreateInstance(ajModal);

    // Fleteros + tabs
    FLETEROS = await loadFleteros();
    renderPersonTabs(FLETEROS);

    // Tab inicial por query
    const qs = new URLSearchParams(location.search);
    const dniQ = qs.get("dni");
    let initial = KEY_GENERAL;

    if (dniQ && !isAdmin()) {
        const mine = FLETEROS.find(x => x.dni === dniQ);
        if (mine) {
            const wrap = $("#personasTabs");
            wrap.innerHTML = "";
            const btn = document.createElement("button");
            btn.className = "pill active";
            btn.type = "button";
            btn.dataset.id = mine.dni;
            btn.innerHTML = `<span class="dot" style="background:${mine.colorHex}"></span> ${first(mine.name)}`;
            wrap.appendChild(btn);
            initial = mine.dni;
        }
    } else if (dniQ && (isAdmin() || FLETEROS.some(x => x.dni === dniQ))) {
        initial = dniQ;
    }

    if (!$("#personasTabs .pill.active")) {
        $("#personasTabs .pill")?.classList.add("active");
    }

    // ----- barra de periodo -----
    const inp = document.getElementById("rangeDate");
    const btnPrev = document.getElementById("btnPrev");
    const btnNext = document.getElementById("btnNext");
    const btnToday = document.getElementById("btnToday");
    const rangeChip = document.getElementById("rangeChip");

    const y = CURRENT_DATE.getFullYear();
    const m = String(CURRENT_DATE.getMonth() + 1).padStart(2, "0");
    const d = String(CURRENT_DATE.getDate()).padStart(2, "0");
    if (inp) inp.value = `${y}-${m}-${d}`;
    updateRangeChipLabel(inp?.value || "");

    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const setAndRefresh = (dateObj) => {
        CURRENT_DATE = dateObj;
        const s = ymd(dateObj);
        if (inp) inp.value = s;
        updateRangeChipLabel(s);
        setPersona(CURRENT);
    };

    inp?.addEventListener("change", () => {
        const [Y, M, D] = (inp.value || "").split("-").map(Number);
        if (Y && M && D) setAndRefresh(new Date(Y, M - 1, D));
    });

    if (isIOS) {
        try { inp.type = "date"; } catch { }
        inp.classList.remove("visually-hidden");
        inp.classList.add("ios-date-overlay");
        rangeChip?.setAttribute("aria-hidden", "true");
        rangeChip?.setAttribute("tabindex", "-1");
    } else {
        rangeChip?.addEventListener("click", (e) => {
            e.preventDefault();
            if (typeof inp.showPicker === "function") inp.showPicker();
            else { inp.focus(); inp.click(); }
        });
    }

    const addDays = (base, n) => { const x = new Date(base); x.setDate(x.getDate() + n); return x; };
    btnPrev?.addEventListener("click", () => setAndRefresh(addDays(CURRENT_DATE, -7)));
    btnNext?.addEventListener("click", () => setAndRefresh(addDays(CURRENT_DATE, +7)));
    btnToday?.addEventListener("click", () => setAndRefresh(new Date()));

    // Primera carga
    await setPersona(initial);
}

// Correr boot cuando haya auth + DOM
function domReady(cb) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cb, { once: true });
    else cb();
}
document.addEventListener("auth:ready", () => domReady(boot), { once: true });
if (window.currentUser) domReady(boot);
