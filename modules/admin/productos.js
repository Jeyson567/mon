import { listenProductos, saveProducto, removeProducto } from "../../firebase/firestore.js";
import { openFormModal } from "../../components/modal.js";
import { escapeHtml, safeText, toNumber, formatCurrency, normalizeRecord } from "../../js/helpers.js";
import { alertSuccess } from "../../js/alerts.js";
import { getCategoriasCache } from "./categorias.js";
import { getInventarioCache } from "./inventario.js";
import { sanitizeDocs, findById } from "./admin-safe.js";

let productosCache = [];
let listenerStarted = false;

const inventarioOptions = () =>
  getInventarioCache()
    .filter((i) => i?.nombre && i?.id)
    .map(
      (i) =>
        `<option value="${escapeHtml(i.id)}">${escapeHtml(i.nombre)} — ${escapeHtml(i.tipoInventario === "bar" ? "Bar" : "Cocina")} (stock: ${i.stock ?? 0})</option>`
    )
    .join("");

const categoriaOptions = (selected = "") => {
  const cats = getCategoriasCache().filter((c) => c?.nombre);
  if (!cats.length) return `<option value="">— Crea categorías primero —</option>`;
  return cats
    .map(
      (c) =>
        `<option value="${escapeHtml(c.nombre)}" ${c.nombre === selected ? "selected" : ""}>${escapeHtml(c.nombre)}</option>`
    )
    .join("");
};

const inventarioConfigRowHtml = (producto = "", cantidad = 1) => `
  <div class="inventario-row mb-2" data-inv-row>
    <select name="invProducto[]" class="input-base">
      <option value="">— Insumo —</option>
      ${inventarioOptions()}
    </select>
    <input name="invCantidad[]" type="number" min="0.01" step="0.01" class="input-base" value="${cantidad}" />
    <button type="button" class="btn-danger px-2" data-remove-inv-row>×</button>
  </div>
`;

const bindInventarioRows = (root, editRows = []) => {
  if (!root) {
    console.error("[productos] bindInventarioRows: root null");
    return;
  }
  const container = root.querySelector("[data-inv-config]");
  const toggle = root.querySelector("[name=descontarInventario]");
  const section = root.querySelector("[data-inv-section]");

  const refresh = () => section?.classList.toggle("hidden", toggle?.value !== "si");
  toggle?.addEventListener("change", refresh);
  refresh();

  root.querySelector("[data-add-inv-row]")?.addEventListener("click", () => {
    container?.insertAdjacentHTML("beforeend", inventarioConfigRowHtml());
    bindRemoveButtons(container);
  });

  bindRemoveButtons(container);
  const rows = Array.isArray(editRows) ? editRows : [];
  container?.querySelectorAll("[data-inv-row]").forEach((row, i) => {
    if (rows[i]?.productoInventario) {
      const sel = row.querySelector("select");
      if (sel) sel.value = rows[i].productoInventario;
    }
  });
};

const bindRemoveButtons = (container) => {
  container?.querySelectorAll("[data-remove-inv-row]").forEach((btn) => {
    btn.onclick = () => btn.closest("[data-inv-row]")?.remove();
  });
};

const parseInventarioConfig = (fd) => {
  const nombres = fd.getAll("invProducto[]");
  const cantidades = fd.getAll("invCantidad[]");
  const config = [];
  nombres.forEach((nombre, i) => {
    const n = safeText(nombre);
    if (n) config.push({ productoInventario: n, cantidad: toNumber(cantidades[i], 1) });
  });
  return config;
};

const buildFormHtml = (raw) => {
  const data = normalizeRecord(raw);
  const descontar = data.descontarInventario === true;
  const config = Array.isArray(data.inventarioConfig) ? data.inventarioConfig : [];
  const rows = config.length
    ? config.map((r) => inventarioConfigRowHtml(r?.productoInventario ?? "", r?.cantidad ?? 1)).join("")
    : inventarioConfigRowHtml();

  return `
    <div>
      <label class="block text-sm mb-1">Nombre producto</label>
      <input name="nombre" class="input-base" required value="${escapeHtml(data.nombre ?? "")}" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm mb-1">Precio (Q)</label>
        <input name="precio" type="number" min="0" step="0.01" class="input-base" required value="${data.precio ?? ""}" />
      </div>
      <div>
        <label class="block text-sm mb-1">Categoría</label>
        <select name="categoria" class="input-base" required>${categoriaOptions(data.categoria ?? "")}</select>
      </div>
    </div>
    <label class="flex items-center gap-2">
      <input type="checkbox" name="disponible" ${data.disponible !== false ? "checked" : ""} />
      <span>Disponible</span>
    </label>
    <div>
      <label class="block text-sm mb-1">Descontar inventario</label>
      <select name="descontarInventario" class="input-base">
        <option value="no" ${!descontar ? "selected" : ""}>No</option>
        <option value="si" ${descontar ? "selected" : ""}>Sí</option>
      </select>
    </div>
    <div data-inv-section class="${descontar ? "" : "hidden"}">
      <div class="flex justify-between mb-2">
        <span class="text-sm font-medium">Insumos</span>
        <button type="button" class="btn-secondary text-sm" data-add-inv-row>+ Insumo</button>
      </div>
      <div data-inv-config>${rows}</div>
    </div>
  `;
};

const render = () => {
  const tbody = document.getElementById("lista-productos");
  if (!tbody) return;

  if (!productosCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-zinc-500 py-8 text-center">Sin productos.</td></tr>`;
    return;
  }

  tbody.innerHTML = productosCache
    .map((p) => {
      if (!p?.id) return "";
      return `
      <tr>
        <td class="font-medium">${escapeHtml(p.nombre ?? "—")}</td>
        <td>${formatCurrency(p.precio ?? 0)}</td>
        <td>${escapeHtml(p.categoria ?? "")}</td>
        <td>${p.disponible !== false ? "✓" : "✗"}</td>
        <td class="text-sm text-zinc-400">${p.descontarInventario ? (p.inventarioConfig?.length ?? 0) + " ins." : "—"}</td>
        <td>
          <button type="button" class="btn-secondary text-sm" data-admin-action="producto:edit" data-id="${p.id}">Editar</button>
          <button type="button" class="btn-danger text-sm ml-2" data-admin-action="producto:delete" data-id="${p.id}">Eliminar</button>
        </td>
      </tr>
    `;
    })
    .join("");
};

export const openProductoModal = (item = null) => {
  const data = item ? normalizeRecord(item) : null;
  console.log("[productos] Modal", data?.id ?? "nuevo");

  const wrapper = openFormModal({
    title: data?.id ? "Editar producto" : "Agregar producto",
    size: "xl",
    formHtml: buildFormHtml(data),
    onSubmit: async (fd) => {
      const nombre = safeText(fd.get("nombre"));
      if (!nombre) throw new Error("Nombre obligatorio");
      const descontar = fd.get("descontarInventario") === "si";
      await saveProducto(data?.id ?? null, {
        nombre,
        precio: toNumber(fd.get("precio"), 0),
        categoria: safeText(fd.get("categoria")),
        disponible: fd.get("disponible") === "on",
        descontarInventario: descontar,
        inventarioConfig: descontar ? parseInventarioConfig(fd) : []
      });
      alertSuccess(data?.id ? "Producto actualizado" : "Producto creado");
    }
  });

  const form = wrapper?.querySelector("[data-admin-form]");
  if (!form) {
    console.error("[productos] Formulario modal no encontrado");
    return;
  }
  bindInventarioRows(form, data?.inventarioConfig ?? []);
};

export const handleProductoAction = async (action, el) => {
  const id = el?.dataset?.id;

  if (action === "add") {
    openProductoModal(null);
    return;
  }
  if (action === "edit") {
    const item = findById(productosCache, id, "Producto");
    if (!item) throw new Error("Producto no encontrado");
    openProductoModal(item);
    return;
  }
  if (action === "delete") {
    if (!id || !confirm("¿Eliminar producto?")) return;
    await removeProducto(id);
    alertSuccess("Eliminado");
  }
};

export const startProductosListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  listenProductos((items) => {
    productosCache = sanitizeDocs(items);
    render();
    window.dispatchEvent(new CustomEvent("productos-updated", { detail: productosCache }));
  });
};
