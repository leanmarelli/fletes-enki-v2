// js/color-select.js
export function enhanceColorSelect(select, items, {
    placeholder = "Elegir persona",
    onChange = null,
    preselect = ""
} = {}) {
    if (!select) return;

    // Fallback: si no hay Bootstrap JS, dejamos el select nativo
    if (!window.bootstrap) {
        // al menos pinto texto “● ” delante (sin color real)
        select.innerHTML = `<option value="">${placeholder}</option>` +
            items.map(x => `<option value="${x.dni}">● ${x.car ? `${x.name} (${x.car})` : x.name}</option>`).join("");
        if (preselect) select.value = preselect;
        if (onChange) select.addEventListener("change", e => onChange(e.target.value, items.find(i => i.dni === e.target.value)));
        return;
    }

    // Ocultar nativo pero conservarlo para el form
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
        <span class="flex-grow-1 text-truncate">${x.car ? `${x.name} (${x.car})` : x.name}</span>
      </a>`;
        ul.appendChild(li);
    });
    wrap.appendChild(ul);

    const setValue = (value) => {
        select.value = value || "";
        const found = items.find(i => i.dni === value);
        const label = wrap.querySelector(".cs-label");
        if (found) {
            label.innerHTML = `<span class="cs-dot" style="background:${found.colorHex || "#ccc"}"></span>
                         <span class="text-truncate">${found.car ? `${found.name} (${found.car})` : found.name}</span>`;
        } else {
            label.textContent = placeholder;
        }
        onChange && onChange(value, found);
    };

    ul.addEventListener("click", (e) => {
        const a = e.target.closest("a.dropdown-item");
        if (!a) return;
        e.preventDefault();
        setValue(a.dataset.value);
    });

    if (preselect) setValue(preselect);

    return { setValue, wrapper: wrap };
}
