// js/seed-trips.js
// ------------------------------------------------------------
// Seeder de datos ficticios para viajes
// Crea varios viajes por día para TODOS los fleteros
// entre "hoy" y el 5 de septiembre (del año actual),
// con IDs determinísticos para poder re-ejecutarlo
// sin duplicar.
// ------------------------------------------------------------
// USO RÁPIDO (en una página admin):
//  1) Asegurate de tener utils.js cargado (db inicializado).
//  2) Importá este archivo:
//       <script type="module" src="./js/seed-trips.js"></script>
//  3) En la consola del navegador:
//       await window.startSeed();
//     (o con rango custom)
//       await window.startSeed({ from: "2025-08-28", to: "2025-09-05", perDayMin: 2, perDayMax: 4 });
// ------------------------------------------------------------

import { db, collection, doc, setDoc, getDocs, writeBatch } from "./utils.js";

// ------------------------
// Helpers de fechas
// ------------------------
function ymdOf(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
function mondayOf(ymdStr) {
    const [Y, M, D] = (ymdStr || "").split("-").map(Number);
    const d = new Date(Y, (M || 1) - 1, D || 1);
    const dow = d.getDay(); // 0=dom .. 6=sab
    const delta = (dow === 0 ? -6 : 1 - dow);
    d.setDate(d.getDate() + delta);
    return ymdOf(d);
}
function* eachDay(from, to) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    for (; d <= end; d.setDate(d.getDate() + 1)) {
        yield new Date(d);
    }
}

// ------------------------
// Datos aleatorios
// ------------------------
const NOMBRES = [
    "Juan Pérez", "María López", "Carlos García", "Lucía Fernández",
    "Sofía Romero", "Martín Díaz", "Valentina Torres", "Agustín Ruiz",
    "Camila Castro", "Diego Herrera", "Micaela Molina", "Tomás Ríos"
];
const TIPOS = ["Carga", "Mudanza", "Traslado"];
const LOCALIDADES = ["CABA", "San Isidro", "Vicente López", "La Plata", "Lanús", "Avellaneda", "Morón", "Quilmes", "Pilar"];
const CALLES = ["Belgrano", "Rivadavia", "San Martín", "Sarmiento", "Mitre", "Independencia", "Alsina", "Castelli", "Urquiza"];
const PEAJES = ["Sí", "No"];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
function telefonoAR() {
    // 11 + 8 dígitos
    return `11${rnd(10000000, 99999999)}`;
}
function horarioRnd(used = new Set()) {
    // Bloques entre 08:00 y 18:30 cada 30'
    const slots = [];
    for (let h = 8; h <= 18; h++) {
        for (let m = 0; m <= 30; m += 30) slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    // evitamos repetir horario dentro del mismo día/fletero
    let tries = 0;
    while (tries++ < 100) {
        const s = pick(slots);
        if (!used.has(s)) { used.add(s); return s; }
    }
    return pick(slots);
}

function buildTrip(ymd, usedHours) {
    const [Y, M, D] = ymd.split("-").map(Number);
    const nombre = pick(NOMBRES);
    const tipoServicio = pick(TIPOS);
    const localidadC = pick(LOCALIDADES);
    const localidadD = pick(LOCALIDADES);
    const dirC = `${pick(CALLES)} ${rnd(100, 2400)}`;
    const dirD = `${pick(CALLES)} ${rnd(100, 2400)}`;
    const horario = horarioRnd(usedHours);

    // precios ficticios
    const base = rnd(35000, 160000);
    const ayudCant = Math.random() < 0.35 ? rnd(1, 3) : 0;
    const ayudPrecio = ayudCant ? rnd(10000, 30000) : 0;

    return {
        cliente: {
            horario,
            fecha: ymd,
            nombre,
            telefono: telefonoAR(),
            tipoServicio,
            direccionCarga: dirC,
            localidadCarga: localidadC,
            detalle: `${tipoServicio} estándar`,
            direccionDescarga: dirD,
            localidadDescarga: localidadD,
            peajes: pick(PEAJES),
            precioServicio: base
        },
        ayudantes: { cantidad: ayudCant, precio: ayudPrecio },
        createdAt: new Date().toISOString(),
        // denormalizaciones
        fecha: ymd,
        y: Y,
        m: M,
        ym: `${Y}-${String(M).padStart(2, "0")}`,
        weekStart: mondayOf(ymd),
        importe: base
    };
}

// ------------------------
// Seeder principal
// ------------------------
async function fetchFleteros() {
    const snap = await getDocs(collection(db, "fleteros"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * @param {Object} opts
 * @param {string} [opts.from] - "YYYY-MM-DD" (default: hoy)
 * @param {string} [opts.to]   - "YYYY-MM-DD" (default: 5 de septiembre del año actual)
 * @param {number} [opts.perDayMin] - mínimos viajes por día (default 2)
 * @param {number} [opts.perDayMax] - máximos viajes por día (default 4)
 */
export async function startSeed(opts = {}) {
    const today = new Date();
    const year = today.getFullYear();

    const from = opts.from ? new Date(opts.from) : today;
    const to = opts.to ? new Date(opts.to) : new Date(year, 8, 5); // 8 = septiembre
    const perDayMin = Number.isFinite(opts.perDayMin) ? opts.perDayMin : 2;
    const perDayMax = Number.isFinite(opts.perDayMax) ? opts.perDayMax : 4;

    if (isNaN(from) || isNaN(to)) throw new Error("Fechas inválidas en startSeed()");
    if (from > to) throw new Error("'from' no puede ser posterior a 'to'");

    console.time("seed");
    const fleteros = await fetchFleteros();
    if (!fleteros.length) { console.warn("No hay fleteros para poblar"); return; }

    let totalWrites = 0;

    for (const f of fleteros) {
        for (const d of eachDay(from, to)) {
            const ymd = ymdOf(d);
            const writesForDay = rnd(perDayMin, perDayMax);

            // Batch por día/fletero (cómodo y dentro de límites)
            const batch = writeBatch(db);
            const usedHours = new Set();

            for (let i = 0; i < writesForDay; i++) {
                const trip = buildTrip(ymd, usedHours);
                // ID determinística → permite re-seed sin duplicar
                const docId = `${ymd}-${String(i + 1).padStart(2, "0")}`;
                const ref = doc(collection(db, "viajes", f.id, "items"), docId);
                batch.set(ref, trip, { merge: true });
                totalWrites++;
            }

            await batch.commit();
            console.log(`✔ ${f.name || f.id} @ ${ymd}: ${writesForDay} viajes`);
        }
    }

    console.timeEnd("seed");
    console.log(`Listo. Total de escrituras: ${totalWrites}`);
}

// Exponer en window para invocar desde la consola si hace falta
window.startSeed = startSeed;
