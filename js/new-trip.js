import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDhmZ_5e4prHLW7nQp_VY0KoTw9ObM7qVQ",
    authDomain: "gestion-fletes-enki.firebaseapp.com",
    projectId: "gestion-fletes-enki",
    storageBucket: "gestion-fletes-enki.firebasestorage.app",
    messagingSenderId: "1091950041596",
    appId: "1:1091950041596:web:b6c0e2942f92eafad93a79"
};

// ✅ Evitar doble init (porque también cargás js/firebase.js)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

let modalExito, modalError;

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

// ✅ Correr ahora o esperar DOM si hace falta
function readyThenBoot() {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootModals, { once: true });
    } else {
        bootModals();
    }
}
readyThenBoot();

// ------- Submit -------
const form = document.getElementById("new-trip-form");
form.addEventListener("submit", async (e) => {
    // FRENAR el envío/reload
    e.preventDefault();
    e.stopPropagation();

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const prevHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    Guardando...
  `;

    const fletero = document.getElementById("fletero").value;
    if (!fletero) {
        const err = document.getElementById("errorDetails");
        if (err) err.textContent = "Seleccioná un fletero antes de guardar.";
        modalError?.show();
        submitBtn.disabled = false;
        submitBtn.innerHTML = prevHtml;
        return;
    }

    const viaje = {
        cliente: {
            horario: document.getElementById("hora").value,
            fecha: document.getElementById("fecha").value,
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
        },
        createdAt: new Date().toISOString()
    };

    try {
        const ref = collection(db, "viajes", fletero, "items");
        // ====== denormalizaciones para reportes ======
        const fechaYMD = document.getElementById("fecha").value; // "YYYY-MM-DD"

        // calcula el lunes de esa semana
        function ymdOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
        function mondayOf(ymdStr) {
            const [Y, M, D] = fechaYMD.split("-").map(Number);
            const d = new Date(Y, M - 1, D);
            const dow = d.getDay(); // 0=dom..6=sab
            const delta = (dow === 0 ? -6 : 1 - dow);
            d.setDate(d.getDate() + delta);
            return ymdOf(d);
        }

        const [Y, M] = fechaYMD.split("-").map(Number);

        viaje.fecha = fechaYMD;                     // rango por string funciona bien
        viaje.y = Y;
        viaje.m = M;
        viaje.ym = `${Y}-${String(M).padStart(2, "0")}`;
        viaje.weekStart = mondayOf(fechaYMD);
        viaje.importe = Number(document.getElementById("precioServicio").value) || 0;
        // =============================================

        await addDoc(ref, viaje);

        // Subtítulo del modal
        const parts = [viaje.cliente.nombre, viaje.cliente.fecha, viaje.cliente.horario].filter(Boolean);
        const subt = document.getElementById("successSubtitle");
        if (subt) subt.textContent = parts.join(" · ");

        // Link a la agenda del DNI elegido
        const link = document.getElementById("linkVerAgenda");
        if (link) link.href = `schedule.html?dni=${encodeURIComponent(fletero)}`;

        modalExito?.show();
        form.reset();

    } catch (error) {
        console.error("Error al guardar:", error);
        const err = document.getElementById("errorDetails");
        if (err) err.textContent = error?.message || "Error desconocido. Reintentá en unos segundos.";
        modalError?.show();
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = prevHtml;
    }
});
