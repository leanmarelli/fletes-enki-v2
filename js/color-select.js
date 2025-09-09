// js/color-select.js
export function enhanceColorSelect(select, items, {
    placeholder = "Elegir persona",
    onChange = null,
    preselect = ""
} = {}) {
    if (!select) return;

    // 1) Cargar SIEMPRE las <option> del <select> nativo (para required + submit)
    function buildNativeOptions() {
        select.innerHTML = "";
        select.appendChild(new Option(placeholder, "")); // opción vacía
        for (const x of items) {
            const label = x.car ? `${x.name} (${x.car})` : (x.name || x.dni);
            const opt = new Option(label, x.dni);
            opt.dataset.colorHex = x.colorHex || "";
            select.appendChild(opt);
        }
    }
    buildNativeOptions();

    // 2) Si no hay Bootstrap JS, usar el <select> nativo y listo
    if (!window.bootstrap) {
        if (preselect) select.value = preselect;
        if (onChange) select.addEventListener("change", e => onChange(e.target.value, items.find(i => i.dni === e.target.value)));
        return;
    }

    // 3) Construir el dropdown “lindo”
    select.classList.add("visually-hidden");
    select.setAttribute("data-enhanced", "1");

    const wrap = document.createElement("div");
    wrap.className = "dropdown color-select";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "form-select";
    btn.setAttribute("data-bs-toggle", "dropdown");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span class="cs-label">${placeholder}</span>`;
    wrap.appendChild(btn);

    const ul = document.createElement("ul");
    ul.className = "dropdown-menu w-100";
    ul.style.maxHeight = "300px";
    ul.style.overflowY = "auto";

    items.forEach(x => {
        const li = document.createElement("li");
        li.innerHTML = `
      <a href="#" class="dropdown-item d-flex align-items-center gap-2" data-value="${x.dni}">
        <span class="cs-dot" style="background:${x.colorHex || "#ccc"}"></span>
        <span class="flex-grow-1 text-truncate">${x.car ? `${x.name} (${x.car})` : (x.name || x.dni)}</span>
      </a>`;
        ul.appendChild(li);
    });
    wrap.appendChild(ul);

    // 4) Selección: actualizar <select> real + disparar change
    const setValue = (value) => {
        select.value = value || "";
        // si por algún motivo no existiera la opción, la creamos (defensa)
        if (value && ![...select.options].some(o => o.value === value)) {
            const f = items.find(i => i.dni === value);
            if (f) {
                const opt = new Option(f.car ? `${f.name} (${f.car})` : f.name, f.dni);
                select.appendChild(opt);
                select.value = value;
            }
        }
        // actualizar la etiqueta del botón
        const found = items.find(i => i.dni === value);
        const label = wrap.querySelector(".cs-label");
        if (found) {
            label.innerHTML = `<span class="cs-dot" style="background:${found.colorHex || "#ccc"}"></span>
                         <span class="text-truncate">${found.car ? `${found.name} (${found.car})` : found.name}</span>`;
        } else {
            label.textContent = placeholder;
        }
        // notificar
        select.dispatchEvent(new Event("change", { bubbles: true }));
        if (onChange) onChange(value, found);
    };

    ul.addEventListener("click", (e) => {
        const a = e.target.closest("a.dropdown-item");
        if (!a) return;
        e.preventDefault();
        setValue(a.dataset.value);
    });

    if (preselect) setValue(preselect);
}
