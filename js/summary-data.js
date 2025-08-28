// js/summary-data.js
// - Usa db centralizado (utils.js)
// - Optimiza Firestore: consultas acotadas por rango (fecha >= start && fecha <= end) + orderBy("fecha")
// - Cachea en memoria por rango (RANGE_CACHE)
// - Elimina "full scans" de subcolecciones

import { applyFeatureGates, installActionGuards, isAdmin,  } from "./gate.js";
import { db, collection, getDocs, query, where, orderBy, showLoading } from "./utils.js";

// --- al principio del archivo ---
let __booted = false;
let CURRENT_DATE = new Date();
const KEY_GENERAL = "__general";
let FLETEROS = [];
let CURRENT = null;

// 👇 asegurate de que sea function declaration (hoisted), no const setPersona = …
async function setPersona(dni) {
    CURRENT = dni;
    setActivePill(dni);
    showLoading(true);

    const d = CURRENT_DATE;
    const sums = (dni === KEY_GENERAL) ? await sumsForGeneral(d) : await sumsForOne(dni, d);
    renderCards(dni, sums, accentFor(dni));

    showLoading(false);
}

// …(tus otras function declarations: loadFleteros, viajesEnRango, renderCards, etc.)

// --- boot declarado como function declaration ---
async function boot() {
    showLoading(true);
    if (__booted) return; __booted = true;

    applyFeatureGates();
    installActionGuards();

    // Modal (si existe)
    const modal = document.querySelector("#ajusteModal");
    if (modal && window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal);

    // Fleteros y tabs
    FLETEROS = await loadFleteros();
    renderPersonTabs(FLETEROS);

    // Tab inicial
    const qs = new URLSearchParams(location.search);
    const dniQ = qs.get("dni");
    let initial = KEY_GENERAL;

    if (dniQ && !isAdmin()) {
        const mine = FLETEROS.find(x => x.dni === dniQ);
        if (mine) {
            const wrap = document.querySelector("#personasTabs");
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

    if (!document.querySelector("#personasTabs .pill.active")) {
        document.querySelector("#personasTabs .pill")?.classList.add("active");
    }
    showLoading(false);
    await setPersona(initial);

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
    btnNext?.addEventListener("click", () => setAndRefresh(addDays(CURRENT_DATE, 7)));
    btnToday?.addEventListener("click", () => setAndRefresh(new Date()));
}

// --- engancha boot SOLO después de auth y DOM ---
function domReady(cb) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cb, { once: true });
    else cb();
}
document.addEventListener("auth:ready", () => domReady(boot), { once: true });
if (window.currentUser) domReady(boot);


// ───────────────────────────────────────────────────────────
// ESTADO (arriba para evitar TDZ)
// ───────────────────────────────────────────────────────────

// Ajustes en memoria (por ahora)
const AJ = Object.create(null);
const getAjustes = dni => AJ[dni] ?? (AJ[dni] = { week: [], month: [] });
const sumAjustes = arr => arr.reduce((a, x) => a + (Number(x.monto) || 0), 0);

// ───────────────────────────────────────────────────────────
// Helpers UI + formato
// ───────────────────────────────────────────────────────────
function toDMY(ymdStr) {
    const [Y, M, D] = (ymdStr || "").split("-");
    if (!Y || !M || !D) return "--/--/----";
    return `${String(D).padStart(2, "0")}/${String(M).padStart(2, "0")}/${Y}`;
}
function updateRangeChipLabel(ymdStr) {
    const lab = document.getElementById("rangeChipLabel");
    if (lab) lab.textContent = toDMY(ymdStr);
}

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const toNum = x => Number(String(x ?? 0).replace(/[^\d.-]/g, "")) || 0;
const money = n => (Number(n) || 0).toLocaleString("es-AR");
const first = (full = "") => full.trim().split(/\s+/)[0] || full;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const fmtDDMM = (ts) => {
    const d = new Date(ts || Date.now());
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
};
const findName = (dni) => (Array.isArray(FLETEROS) ? FLETEROS : []).find(x => x.dni === dni)?.name || dni;

// ───────────────────────────────────────────────────────────
// Fechas
// ───────────────────────────────────────────────────────────
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function weekRange(d = new Date()) {
    const day = d.getDay();                  // 0-dom … 6-sáb
    const deltaToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d); mon.setDate(d.getDate() + deltaToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: ymd(mon), end: ymd(sun) };
}
function monthRange(d = new Date()) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: ymd(first), end: ymd(last) };
}

function niceDate(ymdStr) {
    const [Y, M, D] = ymdStr.split("-").map(Number);
    const d = new Date(Y, M - 1, D);
    const dow = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(d).replace(/\.$/, "");
    const mon = new Intl.DateTimeFormat("es-AR", { month: "short" }).format(d).replace(/\.$/, "");
    return `${cap(dow)} ${String(D).padStart(2, "0")} de ${cap(mon)}`;
}
const labelRange = (type, start, end) => `${type === "week" ? "Semana del" : "Mes del"} ${niceDate(start)} al ${niceDate(end)}`;

// ───────────────────────────────────────────────────────────
// Firestore (cargas)
// ───────────────────────────────────────────────────────────
async function loadFleteros() {
    const snap = await getDocs(collection(db, "fleteros"));
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

// Caché por rango: clave `${dni}|${start}|${end}`
const RANGE_CACHE = new Map();

async function viajesEnRango(dni, start, end) {
    const key = `${dni}|${start}|${end}`;
    if (RANGE_CACHE.has(key)) return RANGE_CACHE.get(key);

    const ref = collection(db, "viajes", dni, "items");
    const qy = query(
        ref,
        where("fecha", ">=", start),
        where("fecha", "<=", end),
        orderBy("fecha")
    );

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

// ───────────────────────────────────────────────────────────
// UI: tabs + tarjetas
// ───────────────────────────────────────────────────────────
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

const conceptsList = (items) => {
    if (!items?.length) return `<small class="text-muted">No hay conceptos aplicados.</small>`;
    return `<div class="concept-list mt-2">
    ${items.map(({ monto, motivo, by, ts }) => {
        const sign = monto < 0 ? "-" : "+";
        return `<div class="sd-concepto">
        <span class="value ${monto < 0 ? "neg" : "pos"}">${sign}$${money(Math.abs(monto))}</span>
        <span class="note">de ${first(by || "")} (${motivo || "-"}) del ${fmtDDMM(ts)}</span>
      </div>`;
    }).join("")}
  </div>`;
};

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

    // Listas de ajustes a mostrar (propios o agregados en “General”)
    let weekAdjList = [], monthAdjList = [];
    if (isGen) {
        weekAdjList = Object.entries(AJ).flatMap(([dniK, v]) => v.week.map(it => ({ ...it, by: findName(dniK) })));
        monthAdjList = Object.entries(AJ).flatMap(([dniK, v]) => v.month.map(it => ({ ...it, by: findName(dniK) })));
    } else {
        const aj = getAjustes(dni);
        const name = findName(dni);
        weekAdjList = aj.week.map(x => ({ ...x, by: x.by || name }));
        monthAdjList = aj.month.map(x => ({ ...x, by: x.by || name }));
    }

    const wAdj = sumAjustes(weekAdjList);
    const mAdj = sumAjustes(monthAdjList);
    const weekFinal = (sums.week.net || 0) + wAdj;
    const monthFinal = (sums.month.net || 0) + mAdj;

    const feeLine = (obj) => obj.feePct == null
        ? "" // En “General” ocultamos la línea de % comisión
        : `<div class="small text-muted">Comisión ${obj.feePct}%: -$${money(obj.feeAmount || 0)}</div>`;

    box.innerHTML = `
    <div class="summary-card sd-card" style="--card-accent:${accentColor}">
      ${cardHeader(sums.week.label)}
      <div class="mt-3">
        <div><strong>Total (sin comisión):</strong> $${money(sums.week.gross || 0)}</div>
        ${feeLine(sums.week)}
        <div><strong>Subtotal (con comisión):</strong> $${money(sums.week.net || 0)}</div>
        <div class="mt-2"><span class="fw-semibold">Ajustes:</span> ${conceptsList(weekAdjList)}</div>
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
      ${cardHeader(sums.month.label)}
      <div class="mt-3">
        <div><strong>Total (sin comisión):</strong> $${money(sums.month.gross || 0)}</div>
        ${feeLine(sums.month)}
        <div><strong>Subtotal (con comisión):</strong> $${money(sums.month.net || 0)}</div>
        <div class="mt-2"><span class="fw-semibold">Ajustes:</span> ${conceptsList(monthAdjList)}</div>
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

    // Total final (lo más grande)
    paintAmount($(".sd-amount.semana"), weekFinal);
    paintAmount($(".sd-amount.mes"), monthFinal);

    wireCardActions(dni);
}

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

    const ownerName = first(findName(dni));

    box.onclick = (ev) => {
        const addW = ev.target.closest(".btn-sumar-semana");
        const subW = ev.target.closest(".btn-descontar-semana");
        const addM = ev.target.closest(".btn-sumar-mes");
        const subM = ev.target.closest(".btn-descontar-mes");
        let scope, plus;

        if (addW || subW) { scope = "week"; plus = !!addW; }
        if (addM || subM) { scope = "month"; plus = !!addM; }
        if (!scope) return;

        const pushAdj = (amount, note) => {
            getAjustes(dni)[scope].push({
                monto: amount,
                motivo: (note || "-").trim(),
                by: ownerName,
                ts: Date.now()
            });
            setPersona(dni);
        };

        if (bsModal) {
            mScope.value = scope;
            mMonto.value = "";
            mMotivo.value = "";
            mMonto.dataset.sign = plus ? "1" : "-1";
            mTitle.textContent = plus ? "Sumar" : "Descontar";

            const onSave = () => {
                const sign = Number(mMonto.dataset.sign) || 1;
                const raw = toNum(mMonto.value);
                if (!raw) return;
                pushAdj(raw * sign, mMotivo.value);
                bsModal.hide();
            };
            mSave.addEventListener("click", onSave, { once: true });
            bsModal.show();
        } else {
            const raw = prompt(`${plus ? "Sumar" : "Descontar"} monto (solo números):`, "0");
            if (raw == null) return;
            const val = Math.round(Number(String(raw).replace(/[^\d-]/g, "")) || 0);
            if (!val) return;
            const note = prompt("Detalle/nota (opcional):", "") || "-";
            pushAdj(plus ? Math.abs(val) : -Math.abs(val), note);
        }
    };
}

// ───────────────────────────────────────────────────────────
// Cálculos
// ───────────────────────────────────────────────────────────
async function sumsForOne(dni, d = new Date()) {
    const f = FLETEROS.find(x => x.dni === dni);
    const fee = f ? Number(f.fee) || 0 : 0;

    const w = weekRange(d), m = monthRange(d);
    const [vw, vm] = await Promise.all([
        viajesEnRango(dni, w.start, w.end),
        viajesEnRango(dni, m.start, m.end)
    ]);

    const cw = computeWithFee(totalBruto(vw), fee);
    const cm = computeWithFee(totalBruto(vm), fee);

    return {
        week: { label: labelRange("week", w.start, w.end), ...cw, count: vw.length },
        month: { label: labelRange("month", m.start, m.end), ...cm, count: vm.length }
    };
}

async function sumsForGeneral(d = new Date()) {
    const w = weekRange(d), m = monthRange(d);
    let wGross = 0, wNet = 0, wCount = 0;
    let mGross = 0, mNet = 0, mCount = 0;

    for (const f of FLETEROS) {
        const [vw, vm] = await Promise.all([
            viajesEnRango(f.dni, w.start, w.end),
            viajesEnRango(f.dni, m.start, m.end)
        ]);
        const gW = totalBruto(vw), gM = totalBruto(vm);
        const cW = computeWithFee(gW, Number(f.fee) || 0);
        const cM = computeWithFee(gM, Number(f.fee) || 0);

        wGross += cW.gross; wNet += cW.net; wCount += vw.length;
        mGross += cM.gross; mNet += cM.net; mCount += vm.length;
    }

    // En “General” no hay un % único de comisión (varía por fletero)
    return {
        week: { label: labelRange("week", w.start, w.end), gross: wGross, feePct: null, feeAmount: null, net: wNet, count: wCount },
        month: { label: labelRange("month", m.start, m.end), gross: mGross, feePct: null, feeAmount: null, net: mNet, count: mCount }
    };
}

// ───────────────────────────────────────────────────────────
// Loading/estilos
// ───────────────────────────────────────────────────────────
const accentFor = dni => dni === KEY_GENERAL
    ? "#198754"
    : (FLETEROS.find(x => x.dni === dni)?.colorHex || "#0d6efd");

// boot on auth
document.addEventListener("auth:ready", boot, { once: true });
if (window.currentUser) boot();