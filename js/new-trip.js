// js/new-trip.js
// - Usa db centralizado (utils.js)
// - Hidrata el <select id="fletero"> en esta página (sin redirigir)
// - Guarda campos denormalizados: fecha, y, m, ym, weekStart, importe
// - Muestra modal de éxito con link a la agenda del fletero
import { db, collection, getDocs, addDoc, showLoading, doc, getDoc, updateDoc, deleteDoc } from "./utils.js";
import { enhanceColorSelect } from "./color-select.js";

const qs = new URLSearchParams(location.search);
const MODE = (qs.get("mode") || "").toLowerCase();
const EDIT_DNI = qs.get("dni") || "";
const EDIT_ID = qs.get("id") || "";
const RETURN_TO = qs.get("return") || "";


let modalExito, modalError;

const DATE_Q = (qs.get("date") || "").trim(); // puede venir del FAB

function todayYMD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// Acepta "YYYY-MM-DD" o "dd/mm/yyyy" y devuelve YYYY-MM-DD; si no matchea, devuelve ""
function asYMD(s = "") {
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const [, d, mo, y] = m;
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return "";
}


// ------------------- control de navegación segura -------------------
let isDirty = false;
let allowNav = false;
let HYDRATING = true;            // evita marcar dirty mientras precargamos
let ORIGINAL_FORM_STATE = null;  // snapshot para comparar cambios reales

function beforeUnloadHandler(e) {
    if (isDirty && !allowNav) { e.preventDefault(); e.returnValue = ""; }
}
window.addEventListener("beforeunload", beforeUnloadHandler);

function markDirty() { if (!HYDRATING) isDirty = true; }
function allowSafeNavigation() {
    allowNav = true; isDirty = false;
    window.removeEventListener("beforeunload", beforeUnloadHandler);
}

document.getElementById("new-trip-form")?.addEventListener("input", markDirty);

// ----------------------- armar href para agenda -----------------------
function setAgendaHref(linkEl, { dni, date, fallbackPath = "schedule.html" }) {
    const baseUrl = RETURN_TO ? new URL(RETURN_TO, location.origin)
        : new URL(fallbackPath, location.origin);
    if (dni) baseUrl.searchParams.set("dni", dni);
    if (date) baseUrl.searchParams.set("date", date);
    linkEl.href = baseUrl.pathname + "?" + baseUrl.searchParams.toString();
}

// ----------------------- helpers de fecha -----------------------
function ymdOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(ymdStr) {
    const [Y, M, D] = (ymdStr || "").split("-").map(Number);
    const d = new Date(Y, (M || 1) - 1, D || 1);
    const dow = d.getDay(); // 0=dom..6=sáb
    const delta = (dow === 0 ? -6 : 1 - dow);
    d.setDate(d.getDate() + delta);
    return ymdOf(d);
}

function setFormEnabled(enabled) {
    document
        .querySelectorAll('#new-trip-form input, #new-trip-form select, #new-trip-form textarea, #new-trip-form button[type="submit"]')
        .forEach(el => el.disabled = !enabled);
}

/* -------------------- hidratar select fletero ------------------- */
async function hydrateSelectFleteroForForm() {
    const select = document.getElementById("fletero");
    if (!select) return;

    try {
        const snap = await getDocs(collection(db, "fleteros"));
        const data = snap.docs
            .map(d => ({ dni: d.id, ...(d.data() || {}) }))
            .sort((a, b) => (a.name || a.dni).localeCompare(b.name || b.dni, "es"));

        const dniQ = new URLSearchParams(location.search).get("dni") || "";
        select.innerHTML = `<option value="">Elegir persona</option>`;
        for (const x of data) {
            const op = document.createElement("option");
            op.value = x.dni;
            op.textContent = x.car ? `${x.name} (${x.car})` : (x.name || x.dni);
            if (dniQ && x.dni === dniQ) op.selected = true;
            select.appendChild(op);
        }

        enhanceColorSelect(select, data, {
            placeholder: "Elegir persona",
            preselect: select.value || "",
            onChange: (dni) => {
                select.value = dni || "";
                select.querySelectorAll("option").forEach(o => o.selected = (o.value === dni));
                select.dispatchEvent(new Event("change", { bubbles: true }));
                select.setCustomValidity("");
                if (!HYDRATING) isDirty = true; // sólo cuenta cuando lo cambia el usuario
            }
        });

    } catch (e) {
        console.error("No se pudo cargar el listado de fleteros:", e);
    }
}

function setVal(sel, val) {
    const el = document.querySelector(sel);
    if (el) el.value = val ?? "";
}
function setRadioByValue(name, value) {
    document.querySelectorAll(`input[name="${name}"]`)
        .forEach(r => r.checked = (r.value === (value || "")));
}

// -------------------- helpers de snapshot de form -------------------
function val(id) { return (document.getElementById(id)?.value ?? "").trim(); }
function checkedVal(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ""; }

function getFormState() {
    return {
        fletero: document.getElementById("fletero")?.value || "",
        cliente: {
            nombre: val("cliente"),
            telefono: val("telefono"),
            tipoServicio: checkedVal("tipoServicio"),
            fecha: val("fecha"),
            horario: val("hora"),
            direccionCarga: val("dirCarga"),
            localidadCarga: val("locCarga"),
            detalle: val("detalle"),
            direccionDescarga: val("dirDescarga"),
            localidadDescarga: val("locDescarga"),
            peajes: checkedVal("peajes"),
            precioServicio: String(parseInt(val("precioServicio") || "0", 10))
        },
        ayudantes: {
            cantidad: String(parseInt(val("cantAyudantes") || "0", 10)),
            precio: String(parseInt(val("precioAyudante") || "0", 10))
        }
    };
}
function shallowEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// Carga el doc de Firestore y prellena el form
async function loadEditIfNeeded() {
    if (MODE !== "edit" || !EDIT_DNI || !EDIT_ID) return;

    const title = document.querySelector("#formTitle");
    if (title) title.textContent = "Editar viaje";
    const submitBtn = document.querySelector('#new-trip-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      Cargando...
    `;
    }

    const selFletero = document.getElementById("fletero");
    if (selFletero) {
        selFletero.value = EDIT_DNI;
        selFletero.querySelectorAll("option").forEach(o => o.selected = (o.value === EDIT_DNI));
        // queda habilitado para poder reasignar
    }

    setFormEnabled(false);

    const ref = doc(db, "viajes", EDIT_DNI, "items", EDIT_ID);
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("No se encontró el viaje a editar.");

        const v = snap.data() || {};
        const c = v.cliente || {};
        const a = v.ayudantes || {};

        setVal("#cliente", c.nombre || "");
        setVal("#telefono", c.telefono || "");
        setRadioByValue("tipoServicio", c.tipoServicio || "");
        setVal("#fecha", v.fecha || c.fecha || "");
        setVal("#hora", c.horario || "");
        setVal("#dirCarga", c.direccionCarga || "");
        setVal("#locCarga", c.localidadCarga || "");
        setVal("#detalle", c.detalle || "");
        setVal("#dirDescarga", c.direccionDescarga || "");
        setVal("#locDescarga", c.localidadDescarga || "");
        setRadioByValue("peajes", c.peajes || "");
        setVal("#precioServicio", c.precioServicio ?? "");
        setVal("#cantAyudantes", a.cantidad ?? "");
        setVal("#precioAyudante", a.precio ?? "");

        // snapshot original para comparar
        ORIGINAL_FORM_STATE = getFormState();
        isDirty = false;

    } catch (err) {
        console.error(err);
        alert(err?.message || "No se pudo cargar el viaje a editar.");
    } finally {
        if (submitBtn) submitBtn.textContent = "Actualizar viaje";
        setFormEnabled(true);
        HYDRATING = false; // a partir de acá, los cambios del usuario cuentan
    }

    // Botón Cancelar → volver a la pantalla de origen (si vino en la URL)
    if (RETURN_TO) {
        const cancelBtn = document.querySelector('.form-actions-sticky .btn.btn-outline-danger');
        if (cancelBtn) cancelBtn.onclick = () => { allowSafeNavigation(); location.href = RETURN_TO; };
    }
}

/* ------------------------- modales ------------------------------ */
function bootModals() {
    const exEl = document.getElementById("modalSaveSuccess");
    const erEl = document.getElementById("modalSaveError");
    if (exEl && window.bootstrap) {
        modalExito = window.bootstrap.Modal.getOrCreateInstance(exEl, { backdrop: "static", keyboard: false });
    }
    if (erEl && window.bootstrap) {
        modalError = window.bootstrap.Modal.getOrCreateInstance(erEl);
    }

    // Redirección al tocar “Ver agenda”
    const link = document.getElementById("linkVerAgenda");
    if (link) {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const href = link.getAttribute("href");
            allowSafeNavigation();     // <- desactiva el warning
            modalExito?.hide();
            setTimeout(() => { location.href = href; }, 150);
        });
    }
}

/* -------------------- boot cuando el DOM esté ------------------- */
(function readyThenBoot() {
    const run = async () => {
        const isEdit = MODE === "edit";
        try {
            if (isEdit) showLoading(true);
            bootModals();
            await hydrateSelectFleteroForForm();

            if (MODE !== "edit") {
                // Si vino ?date= usa esa; si no, usa hoy
                const ymd = asYMD(DATE_Q) || todayYMD();
                const fechaInput = document.getElementById("fecha");
                if (fechaInput) fechaInput.value = ymd;
            }
            await loadEditIfNeeded();

        } finally {
            if (!isEdit) HYDRATING = false; // en create, cerramos hidratación acá
            if (isEdit) showLoading(false);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
        run();
    }
})();

/* --------------------------- submit ----------------------------- */
const form = document.getElementById("new-trip-form");

// marcar el form como sucio ante cambios
form?.addEventListener("input", markDirty);

form.addEventListener("submit", async (e) => {
    // Validación de fletero (en create). En edit está deshabilitado, pero con value cargado.
    const sel = document.getElementById("fletero");
    if (!sel.value && sel.dataset?.value) sel.value = sel.dataset.value;

    if (!sel.value && MODE !== "edit") {
        e.preventDefault();
        const err = document.getElementById("errorDetails");
        if (err) err.textContent = "Seleccioná un fletero antes de guardar.";
        modalError?.show();
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    showLoading(true);

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const prevHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    ${MODE === "edit" ? "Actualizando..." : "Guardando..."}
  `;

    try {
        // Armado de payload común
        const viaje = {
            cliente: {
                horario: document.getElementById("hora").value,
                fecha: document.getElementById("fecha").value, // YYYY-MM-DD
                nombre: document.getElementById("cliente").value,
                telefono: document.getElementById("telefono").value,
                tipoServicio: document.querySelector('input[name="tipoServicio"]:checked')?.value || "",
                direccionCarga: document.getElementById("dirCarga").value,
                localidadCarga: document.getElementById("locCarga").value,
                detalle: document.getElementById("detalle").value,
                direccionDescarga: document.getElementById("dirDescarga").value,
                localidadDescarga: document.getElementById("locDescarga").value,
                peajes: document.querySelector('input[name="peajes"]:checked')?.value || "",
                precioServicio: parseInt(document.getElementById("precioServicio").value || "0", 10)
            },
            ayudantes: {
                cantidad: parseInt(document.getElementById("cantAyudantes").value || "0", 10),
                precio: parseInt(document.getElementById("precioAyudante").value || "0", 10)
            }
        };

        // Denormalizaciones
        const fechaYMD = document.getElementById("fecha").value; // "YYYY-MM-DD"
        const [Y, M] = fechaYMD.split("-").map(Number);

        viaje.fecha = fechaYMD;
        viaje.y = Y;
        viaje.m = M;
        viaje.ym = `${Y}-${String(M).padStart(2, "0")}`;
        (function mondayOfInto(v) {
            const [y, m, d] = fechaYMD.split("-").map(Number);
            const dt = new Date(y, m - 1, d);
            const dow = dt.getDay();
            const delta = (dow === 0 ? -6 : 1 - dow);
            dt.setDate(dt.getDate() + delta);
            const y2 = dt.getFullYear(), m2 = String(dt.getMonth() + 1).padStart(2, "0"), d2 = String(dt.getDate()).padStart(2, "0");
            v.weekStart = `${y2}-${m2}-${d2}`;
        })(viaje);
        viaje.importe = Number(document.getElementById("precioServicio").value) || 0;
        {
            const [y, m, d] = fechaYMD.split("-").map(Number);
            const [h, mm] = (document.getElementById("hora").value || "00:00").split(":").map(Number);
            viaje.when = new Date(y, m - 1, d, h || 0, mm || 0).toISOString();
        }

        // Subtítulo del modal
        const parts = [viaje.cliente.nombre, viaje.cliente.fecha, viaje.cliente.horario].filter(Boolean);
        const subt = document.getElementById("successSubtitle");
        if (subt) subt.textContent = parts.join(" · ");

        if (MODE === "edit" && EDIT_DNI && EDIT_ID) {
            // Comparación real con snapshot: ¿hay cambios?
            const currentState = getFormState();
            if (ORIGINAL_FORM_STATE && shallowEqual(currentState, ORIGINAL_FORM_STATE)) {
                const err = document.getElementById("errorDetails");
                if (err) err.textContent = "No hay cambios por guardar.";
                modalError?.show();
                submitBtn.disabled = false;
                submitBtn.innerHTML = prevHtml;
                showLoading(false);
                return;
            }

            // Fletero destino (puede ser distinto al original)
            const fleteroDest = document.getElementById("fletero")?.value || EDIT_DNI;

            if (fleteroDest !== EDIT_DNI) {
                // --- REASIGNAR: crear en nueva colección y borrar el viejo ---
                const newColl = collection(db, "viajes", fleteroDest, "items");
                await addDoc(newColl, viaje); // nuevo ID
                await deleteDoc(doc(db, "viajes", EDIT_DNI, "items", EDIT_ID));

                isDirty = false;
                const modalTitle = document.querySelector("#modalSaveSuccess .modal-title");
                if (modalTitle) modalTitle.textContent = "Viaje reasignado";

                const link = document.getElementById("linkVerAgenda");
                if (link) setAgendaHref(link, { dni: fleteroDest, date: viaje.fecha });

                modalExito?.show();

            } else {
                // --- ACTUALIZAR en el mismo fletero ---
                const ref = doc(db, "viajes", EDIT_DNI, "items", EDIT_ID);
                await updateDoc(ref, viaje);

                isDirty = false;
                const modalTitle = document.querySelector("#modalSaveSuccess .modal-title");
                if (modalTitle) modalTitle.textContent = "Viaje actualizado";

                const link = document.getElementById("linkVerAgenda");
                if (link) setAgendaHref(link, { dni: EDIT_DNI, date: viaje.fecha });

                modalExito?.show();
            }
        } else {
            // CREAR
            const fletero = document.getElementById("fletero").value;
            const ref = collection(db, "viajes", fletero, "items");
            viaje.createdAt = new Date().toISOString();
            await addDoc(ref, viaje);

            isDirty = false;

            const link = document.getElementById("linkVerAgenda");
            if (link) setAgendaHref(link, { dni: fletero, date: viaje.fecha });

            modalExito?.show();
            form.reset();
        }

    } catch (error) {
        console.error("Error al guardar/actualizar:", error);
        const err = document.getElementById("errorDetails");
        if (err) err.textContent = error?.message || "Error desconocido. Reintentá en unos segundos.";
        modalError?.show();
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = prevHtml;
        showLoading(false);
    }
});
