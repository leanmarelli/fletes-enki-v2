// js/gate.js
export function isAdmin() {
    return String(window?.currentUser?.permission || '').toLowerCase() === 'admin';
}

export function applyFeatureGates(root = document) {
    const admin = isAdmin();

    // Mostrar / ocultar bloques enteros
    root.querySelectorAll('[data-visible-for]').forEach(el => {
        const need = (el.getAttribute('data-visible-for') || '').toLowerCase();
        const show = (need === 'admin' && admin) || (need === 'user' && !admin);

        if (show) {
            const tag = el.tagName;
            el.style.display = (tag === 'LI') ? 'list-item' : 'block';
        } else {
            el.style.display = 'none';
        }
    });

    // Habilitar / deshabilitar inputs/botones
    root.querySelectorAll('[data-enabled-for]').forEach(el => {
        const need = (el.getAttribute('data-enabled-for') || '').toLowerCase();
        if (need === 'admin') el.disabled = !admin;
        if (need === 'user') el.disabled = admin;
    });
}

/** Bloquea clicks de acciones marcadas solo para admin */
export function installActionGuards() {
    document.addEventListener('click', (e) => {
        const adminAction = e.target.closest('[data-admin-action]');
        if (adminAction && !isAdmin()) {
            e.preventDefault();
            alert('Necesitás permisos de administrador.');
        }
    });
}
