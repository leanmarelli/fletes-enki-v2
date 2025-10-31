/* notas.js */
import {
    db, collection, addDoc, doc, updateDoc, deleteDoc,
    serverTimestamp, onSnapshot, query, orderBy, where
} from "./utils.js";


// -----------------------------
// Config
// -----------------------------
const NOTES_COL = "notes"; // cambia si querés agrupar por empresa/entorno

// -----------------------------
// DOM refs
// -----------------------------
const btnCreate = document.getElementById("btnCreateNote");
const activeWrap = document.getElementById("activeNotes");
const noActive = document.getElementById("noActive");
const resolvedWrap = document.getElementById("resolvedNotes");
const noResolved = document.getElementById("noResolved");
const autosaveLine = document.getElementById("autosaveLine");
const loadingOverlay = document.getElementById("sd-loading");
const badgeMenuNotas = document.getElementById("badgeMenuNotas");

// -----------------------------
// State in-memory
// -----------------------------
let unsubscribe = null;

// -----------------------------
// Utils UI
// -----------------------------
function showLoading(show) {
    loadingOverlay?.classList.toggle("d-none", !show);
}

function setBadgeCount(count) {
    const v = Number(count) || 0;

    // badge del menú lateral
    if (badgeMenuNotas) {
        if (v > 0) {
            badgeMenuNotas.textContent = String(v);
            badgeMenuNotas.classList.remove("d-none");
        } else {
            badgeMenuNotas.classList.add("d-none");
            badgeMenuNotas.textContent = "";
        }
    }

    // badge de la campanita superior
    const bellBadge = document.getElementById("notesBellBadge");
    if (bellBadge) {
        if (v > 0) {
            bellBadge.textContent = String(v);
            bellBadge.classList.remove("d-none");
        } else {
            bellBadge.classList.add("d-none");
            bellBadge.textContent = "";
        }
    }
}


function empty(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function htm(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
}

function fmtDate(ts) {
    if (!ts) return "";
    // Firestore Timestamp -> Date
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("es-AR");
}

// -----------------------------
// Modal dinámico (Bootstrap)
// -----------------------------
function openNoteModal({ mode = "create", note = null } = {}) {
    const modalId = "noteModal";
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const title = mode === "create" ? "Crear nota" : "Editar nota";
    const initialTitle = note?.title ?? "";
    const initialBody = note?.body ?? "";

    const modal = htm(`
    <div class="modal fade" id="${modalId}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-5">${title}</h1>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Título</label>
              <input id="noteTitle" class="form-control" maxlength="100" value="${initialTitle}">
            </div>
            <div class="mb-2">
              <label class="form-label">Descripción</label>
              <textarea id="noteBody" class="form-control" rows="4" maxlength="1000">${initialBody}</textarea>
            </div>
            <div id="modalHelp" class="form-text">Máx 1000 caracteres.</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button id="noteSaveBtn" type="button" class="btn btn-primary">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `);

    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    modal.querySelector("#noteSaveBtn").addEventListener("click", async () => {
        const titleEl = modal.querySelector("#noteTitle");
        const bodyEl = modal.querySelector("#noteBody");
        const titleVal = titleEl.value.trim();
        const bodyVal = bodyEl.value.trim();

        if (!titleVal && !bodyVal) {
            // hard stop: no contenido
            titleEl.focus();
            return;
        }

        try {
            showLoading(true);
            if (mode === "create") {
                await createNote({
                    title: titleVal,
                    body: bodyVal,
                });
            } else {
                await updateNote(note.id, {
                    title: titleVal,
                    body: bodyVal,
                });
            }
            bsModal.hide();
        } catch (e) {
            console.error("Error guardando nota:", e);
        } finally {
            showLoading(false);
        }
    });

    // Limpieza al cerrar
    modal.addEventListener("hidden.bs.modal", () => {
        modal.remove();
    });
}

// -----------------------------
// Firestore ops
// -----------------------------
async function createNote({ title, body }) {
    const currentUser = window.currentUser || {};
    const payload = {
        title: title || "",
        body: body || "",
        status: "active",                // "active" | "resolved"
        createdAt: serverTimestamp(),
        resolvedAt: null,
        createdBy: currentUser.uid || null,
    };
    await addDoc(collection(db, NOTES_COL), payload);
    flashAutosave("Nota creada");
}

async function updateNote(id, data) {
    await updateDoc(doc(db, NOTES_COL, id), {
        ...data,
    });
    flashAutosave("Nota actualizada");
}

async function toggleResolved(id, toResolved) {
    await updateDoc(doc(db, NOTES_COL, id), {
        status: toResolved ? "resolved" : "active",
        resolvedAt: toResolved ? serverTimestamp() : null,
    });
    flashAutosave(toResolved ? "Marcada como resuelta" : "Devuelta a activas");
}

async function removeNote(id) {
    await deleteDoc(doc(db, NOTES_COL, id));
    // opcional: toast
}

function subscribeNotes() {
    activeWrap.classList.add('loading');
    resolvedWrap.classList.add('loading');

    const q = query(collection(db, NOTES_COL), orderBy("createdAt", "desc"));
    unsubscribe = onSnapshot(q, (snap) => {
        const all = [];
        snap.forEach((d) => all.push({ id: d.id, ...d.data() }));

        const active = all.filter(n => n.status !== "resolved");
        const resolved = all.filter(n => n.status === "resolved");

        renderNotes(activeWrap, noActive, active, false);
        renderNotes(resolvedWrap, noResolved, resolved, true);
        setBadgeCount(active.length);

        activeWrap.classList.remove('loading');
        resolvedWrap.classList.remove('loading');
    });
}

// -----------------------------
// Render
// -----------------------------
function renderNotes(container, emptyLabel, notes, isResolved) {
    empty(container);
    if (!notes.length) {
        emptyLabel?.classList.remove("d-none");
        return;
    }
    emptyLabel?.classList.add("d-none");

    notes.forEach(note => {
        container.appendChild(renderNoteCard(note, isResolved));
    });
}

function renderNoteCard(note, isResolved) {
    const created = fmtDate(note.createdAt);
    const resolved = fmtDate(note.resolvedAt);

    const card = htm(`
    <div class="sd-card p-3 note-item">
      <div class="flex-grow-1">
        <div class="h6 mb-1">${escapeHtml(note.title || "Sin título")}</div>
      </div>
      ${note.body ? `<div class="text-body mb-1">${escapeHtml(note.body)}</div>` : ``}
      <div class="text-secondary small">
        Creada: ${created || "-"}${isResolved ? ` · Resuelta: ${resolved || "-"}` : ""}
      </div>

      <div class="note-actions" data-visible-for="admin" data-admin-action>
        ${isResolved
            ? `<button class="btn btn-icon btn-done" title="Devolver a activas" data-action="undo"><i class="bi bi-arrow-counterclockwise"></i></button>`
            : `<button class="btn btn-icon btn-done" title="Marcar como hecho" data-action="resolve"><i class="bi bi-check2"></i></button>`
        }
        <button class="btn btn-icon btn-edit"  title="Editar"   data-action="edit"><i class="bi bi-pencil-square"></i></button>
        <button class="btn btn-icon btn-trash" title="Eliminar" data-action="delete"><i class="bi bi-trash3"></i></button>
      </div>
    </div>
  `);

    card.querySelector("[data-action='resolve']")?.addEventListener("click", () => toggleResolved(note.id, true));
    card.querySelector("[data-action='undo']")?.addEventListener("click", () => toggleResolved(note.id, false));
    card.querySelector("[data-action='edit']")?.addEventListener("click", () => openNoteModal({ mode: "edit", note }));
    card.querySelector("[data-action='delete']")?.addEventListener("click", () => {
        if (confirm("¿Eliminar nota? Esta acción no se puede deshacer.")) removeNote(note.id);
    });

    return card;
}



// -----------------------------
// Helpers
// -----------------------------
function flashAutosave(text) {
    if (!autosaveLine) return;
    autosaveLine.textContent = text;
    autosaveLine.classList.remove("d-none");
    setTimeout(() => {
        autosaveLine.classList.add("d-none");
        autosaveLine.textContent = "";
    }, 2000);
}

function escapeHtml(str) {
    return (str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// -----------------------------
// Boot
// -----------------------------
function init() {
    // back simple
    const btnBack = document.getElementById("btnBack");
    btnBack?.addEventListener("click", () => history.back());

    btnCreate?.addEventListener("click", () => {
        openNoteModal({ mode: "create" });
    });

    showLoading(true);
    subscribeNotes();
    showLoading(false);
}

// Espera a que auth-guard dispare auth:ready o ejecuta directo si ya está
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}

const toggleBtn = document.getElementById("btnToggleResolved");
const icoResolved = document.getElementById("icoResolved");
if (resolvedWrap && window.bootstrap) {
    resolvedWrap.addEventListener("show.bs.collapse", () => {
        icoResolved.className = "bi bi-eye";
        toggleBtn.title = "Ocultar resueltos";
    });
    resolvedWrap.addEventListener("hide.bs.collapse", () => {
        icoResolved.className = "bi bi-eye-slash";
        toggleBtn.title = "Mostrar resueltos";
    });
}

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openNoteModal({ mode: 'create' }); }
});

document.querySelectorAll('.btn-icon[title]').forEach(el => new bootstrap.Tooltip(el, { delay: { show: 200, hide: 0 }, placement: 'top' }));
