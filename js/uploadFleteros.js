/* // ✅ Usamos require en vez de import para evitar errores de ESM
const fs = require("fs");
const admin = require("firebase-admin");

// ✅ Leemos JSON
const fleteros = JSON.parse(fs.readFileSync("../json/fleteros.json"));
// ✅ Inicializamos Firebase Admin SDK
const serviceAccount = require("../json/serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://gestion-fletes-enki.firebaseio.com"
});

const db = admin.firestore();

async function subirFleteros() {
    const colRef = db.collection("fleteros");

    for (const fletero of fleteros) {
        const id = fletero.dni; // usamos DNI como ID
        await colRef.doc(id).set(fletero);
        console.log(`✅ Subido: ${fletero.name}`);
    }
}

subirFleteros()
    .then(() => {
        console.log("🚀 Todos los fleteros subidos correctamente");
        process.exit();
    })
    .catch((err) => {
        console.error("❌ Error subiendo fleteros:", err);
    });
 */

/* import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDhmZ_5e4prHLW7nQp_VY0KoTw9ObM7qVQ",
    authDomain: "gestion-fletes-enki.firebaseapp.com",
    projectId: "gestion-fletes-enki",
    storageBucket: "gestion-fletes-enki.firebasestorage.app",
    messagingSenderId: "1091950041596",
    appId: "1:1091950041596:web:b6c0e2942f92eafad93a79"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const fleteros = [
    { dni: "37861418", nombre: "Cristian Ramirez" },
    { dni: "37790599", nombre: "Alejandro Smith" },
    { dni: "38228317", nombre: "Juan José Báez" },
    { dni: "49077113", nombre: "Ricardo Rivero" },
    { dni: "30027216", nombre: "Matías Barreto" }
];

const nombresClientes = ["Lucia", "Carlos", "María", "Nico", "Flor"];
const direcciones = ["Av. Siempreviva 742", "Mitre 1234", "Rivadavia 5600", "Castro Barros 1000", "Belgrano 200"];
const tiposServicio = ["Mudanza", "Carga", "Traslado"];
const localidades = ["CABA", "San Justo", "Lanús", "Morón", "La Plata"];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generarViaje(fecha) {
    return {
        ayudantes: {
            cantidad: 0,
            precio: 0
        },
        cliente: {
            nombre: getRandomItem(nombresClientes),
            telefono: `54911${Math.floor(10000000 + Math.random() * 89999999)}`,
            detalle: "Caja y TV",
            direccionCarga: getRandomItem(direcciones),
            direccionDescarga: getRandomItem(direcciones),
            fecha: fecha,
            horario: `${Math.floor(8 + Math.random() * 8)}:00`,
            localidadCarga: getRandomItem(localidades),
            localidadDescarga: getRandomItem(localidades),
            peajes: "No",
            precioServicio: Math.floor(30000 + Math.random() * 40000),
            tipoServicio: getRandomItem(tiposServicio)
        }
    };
}

async function insertarViajes() {
    const startDate = new Date("2025-08-03");
    const endDate = new Date("2025-08-10");

    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        const fechaStr = d.toISOString().split('T')[0];
        for (const fletero of fleteros) {
            const cantidadViajes = Math.random() < 0.5 ? 1 : 2;
            for (let i = 0; i < cantidadViajes; i++) {
                const viaje = generarViaje(fechaStr);
                const ref = collection(db, "viajes", fletero.dni, "items");
                await addDoc(ref, viaje);
                console.log(`✅ Insertado viaje de ${fletero.nombre} para el ${fechaStr}`);
            }
        }
    }

    console.log("✔ Todos los viajes fueron insertados");
}

insertarViajes();
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// Config de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDhmZ_5e4prHLW7nQp_VY0KoTw9ObM7qVQ",
    authDomain: "gestion-fletes-enki.firebaseapp.com",
    projectId: "gestion-fletes-enki",
    storageBucket: "gestion-fletes-enki.appspot.com",
    messagingSenderId: "1091950041596",
    appId: "1:1091950041596:web:b6c0e2942f92eafad93a79"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DNIs de los fleteros
const fleteros = [
    "37861418", // Cristian Ramirez
    "37790599", // Alejandro Smith
    "38228317", // Juan José Báez
    "49077113", // Ricardo Rivero
    "30027216"  // Matías Barreto
];

// Fechas a borrar
const fechasObjetivo = [
    "2025-08-03", "2025-08-04", "2025-08-05", "2025-08-06",
    "2025-08-07", "2025-08-08", "2025-08-09", "2025-08-10"
];

// Función principal
async function borrarViajes() {
    for (const dni of fleteros) {
        const itemsRef = collection(db, "viajes", dni, "items");
        const snapshot = await getDocs(itemsRef);

        snapshot.forEach(async (docSnap) => {
            const data = docSnap.data();
            if (fechasObjetivo.includes(data.fecha)) {
                await deleteDoc(doc(db, "viajes", dni, "items", docSnap.id));
                console.log(`✅ Borrado viaje del ${data.fecha} para DNI ${dni}`);
            }
        });
    }
}

borrarViajes().then(() => {
    console.log("🧹 Limpieza completada.");
}).catch(err => {
    console.error("⚠️ Error durante la limpieza:", err);
});
