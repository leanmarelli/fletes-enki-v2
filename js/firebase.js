/* import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

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

async function autoCargarFleteros() {
    const select = document.getElementById("fletero");

    if (!select) {
        console.log("ℹ️ No hay select #fletero en esta página, no se carga nada");
        return;
    }

    // Texto inicial
    select.innerHTML = `<option value="">Elegir persona</option>`;

    try {
        const snapshot = await getDocs(collection(db, "fleteros"));
        snapshot.forEach(doc => {
            const data = doc.data();

            // ✅ Ahora usamos los campos correctos
            const option = document.createElement("option");
            option.value = doc.id; // DNI como ID
            option.textContent = `${data.name} (${data.car})`;
            select.appendChild(option);
        });

        console.log("✅ Fleteros cargados correctamente en #fletero");
    } catch (error) {
        console.error("❌ Error cargando fleteros:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    autoCargarFleteros();
}); */