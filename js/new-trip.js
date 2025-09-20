// js/new-trip.js
// - Usa db centralizado (utils.js)
// - Hidrata el <select id="fletero"> en esta página (sin redirigir)
// - Guarda campos denormalizados: fecha, y, m, ym, weekStart, importe
// - Muestra modal de éxito con link a la agenda del fletero
import { db, collection, getDocs, addDoc, showLoading, doc, getDoc, updateDoc } from "./utils.js";
import { enhanceColorSelect } from "./color-select.js";

const qs = new URLSearchParams(location.search);
const MODE = (qs.get("mode") || "").toLowerCase(); // "edit" | ""
const EDIT_DNI = qs.get("dni") || "";
const EDIT_ID = qs.get("id") || "";
const RETURN_TO = qs.get("return") || "";

let modalExito, modalError;

/* ----------------------- helpers de fecha ----------------------- */
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
    // Deshabilita inputs/selects/textarea y el botón de submit. Deja el "Cancelar" libre.
    document.querySelectorAll('#new-trip-form input, #new-trip-form select, #new-trip-form textarea, #new-trip-form button[type="submit"]')
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

        // 1) Opciones nativas (para validación del navegador)
        const dniQ = new URLSearchParams(location.search).get("dni") || "";
        select.innerHTML = `<option value="">Elegir persona</option>`;
        for (const x of data) {
            const op = document.createElement("option");
            op.value = x.dni;
            op.textContent = x.car ? `${x.name} (${x.car})` : (x.name || x.dni);
            if (dniQ && x.dni === dniQ) op.selected = true; // preselect si vino por query
            select.appendChild(op);
        }

        // 2) Mejora visual: mantiene el <select> sincronizado
        enhanceColorSelect(select, data, {
            placeholder: "Elegir persona",
            preselect: select.value || "", // lo que haya quedado arriba
            onChange: (dni) => {
                // sincronia con el control nativo (esto hace que "required" pase)
                select.value = dni || "";
                // marcá selected en la opción correspondiente por las dudas
                select.querySelectorAll("option").forEach(o => o.selected = (o.value === dni));
                // notificar a quien escuche
                select.dispatchEvent(new Event("change", { bubbles: true }));
                select.setCustomValidity(""); // limpia mensaje de validación si lo hubo
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

// Carga el doc de Firestore y prellena el form
async function loadEditIfNeeded() {
    if (MODE !== "edit" || !EDIT_DNI || !EDIT_ID) return;

    // UI: título y botón
    const title = document.querySelector("#formTitle");
    if (title) title.textContent = "Editar viaje";
    const submitBtn = document.querySelector('#new-trip-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      Cargando...
    `;
    }

    // Bloquear cambio de fletero en edición (no movemos el doc de colección)
    const selFletero = document.getElementById("fletero");
    if (selFletero) {
        selFletero.value = EDIT_DNI;
        selFletero.querySelectorAll("option").forEach(o => o.selected = (o.value === EDIT_DNI));
        selFletero.disabled = true;
    }

    // Bloqueo total del form mientras carga
    setFormEnabled(false);

    // Traer doc y setear campos
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
    } catch (err) {
        console.error(err);
        alert(err?.message || "No se pudo cargar el viaje a editar.");
    } finally {
        if (submitBtn) submitBtn.textContent = "Actualizar viaje";
        setFormEnabled(true);
    }

    // Botón Cancelar → volver a la pantalla de origen (si vino en la URL)
    if (RETURN_TO) {
        const cancelBtn = document.querySelector('.form-actions-sticky .btn.btn-outline-danger');
        if (cancelBtn) cancelBtn.onclick = () => { location.href = RETURN_TO; };
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
            if (isEdit) showLoading(true);   // overlay #appLoading mientras trae el doc
            bootModals();
            await hydrateSelectFleteroForForm();
            await loadEditIfNeeded();        // precarga edición si corresponde
        } finally {
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
/* --------------------------- submit ----------------------------- */
const form = document.getElementById("new-trip-form");

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
        // lunes de la semana
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
        // timestamp exacto
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
            // EDITAR
            const ref = doc(db, "viajes", EDIT_DNI, "items", EDIT_ID);
            await updateDoc(ref, viaje);

            const modalTitle = document.querySelector("#modalSaveSuccess .modal-title");
            if (modalTitle) modalTitle.textContent = "Viaje actualizado";

            const link = document.getElementById("linkVerAgenda");
            if (link) {
                const backUrl = RETURN_TO || `schedule.html?dni=${encodeURIComponent(EDIT_DNI)}&date=${encodeURIComponent(viaje.fecha)}`;
                link.href = backUrl;
            }

            modalExito?.show();
        } else {
            // CREAR
            const fletero = document.getElementById("fletero").value;
            const ref = collection(db, "viajes", fletero, "items");
            viaje.createdAt = new Date().toISOString();
            await addDoc(ref, viaje);

            const link = document.getElementById("linkVerAgenda");
            if (link) link.href = `schedule.html?dni=${encodeURIComponent(fletero)}&date=${encodeURIComponent(viaje.fecha)}`;

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

let isDirty = false;
document.getElementById("new-trip-form").addEventListener("input", () => { isDirty = true; });
window.addEventListener("beforeunload", (e) => {
    if (isDirty) { e.preventDefault(); e.returnValue = ""; }
});
// En el submit exitoso o al cancelar con RETURN_TO, poné isDirty = false;
