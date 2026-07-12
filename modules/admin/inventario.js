import {
  listenInventario,
  saveInventarioItem,
  removeInventarioItem,
  ajustarStockInventario
} from "../../firebase/firestore.js";
import { openFormModal } from "../../components/modal.js";
import { escapeHtml, safeText, toNumber, normalizeRecord } from "../../js/helpers.js";
import { alertSuccess } from "../../js/alerts.js";
import { getCurrentProfile } from "../../js/guard.js";
import { sanitizeDocs, findById } from "./admin-safe.js";

let inventarioCache = [];
let listenerStarted = false;

const formFields = (raw) => {
  const data = normalizeRecord(raw);
  return `
  <div>
    <label class="block text-sm mb-1">Nombre</label>
    <input name="nombre" class="input-base" required value="${escapeHtml(data.nombre ?? "")}" />
  </div>
  <div>
    <label class="block text-sm mb-1">Categoría</label>
    <input name="categoria" class="input-base" value="${escapeHtml(data.categoria ?? "")}" placeholder="Carnes, Bebidas..." />
  </div>
  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="block text-sm mb-1">Stock inicial</label>
      <input name="stock" type="number" min="0" step="0.01" class="input-base" value="${data.stock ?? 0}" />
    </div>
    <div>
      <label class="block text-sm mb-1">Stock mínimo</label>
      <input name="stockMinimo" type="number" min="0" class="input-base" value="${data.stockMinimo ?? 0}" />
    </div>
  </div>
  <div>
    <label class="block text-sm mb-1">Unidad</label>
    <input name="unidad" class="input-base" value="${escapeHtml(data.unidad ?? "unidades")}" />
  </div>
  <label class="flex items-center gap-2">
    <input type="checkbox" name="activo" ${data.activo !== false ? "checked" : ""} />
    <span>Activo</span>
  </label>
`;
};

const stockForm = (raw) => {
  const item = normalizeRecord(raw);
  if (!item.id) {
    console.error("[inventario] stockForm: item inválido", raw);
    return `<p class="text-red-400">Error: producto no válido</p>`;
  }
  return `
  <p class="text-sm text-zinc-400 mb-2">${escapeHtml(item.nombre ?? "Producto")} — Stock: <strong>${item.stock ?? 0}</strong></p>
  <div>
    <label class="block text-sm mb-1">Tipo</label>
    <select name="tipoMovimiento" class="input-base">
      <option value="entrada">Entrada (+)</option>
      <option value="salida">Salida (-)</option>
      <option value="ajuste">Ajuste (valor exacto)</option>
    </select>
  </div>
  <div>
    <label class="block text-sm mb-1">Cantidad</label>
    <input name="cantidad" type="number" min="0" step="0.01" class="input-base" required />
  </div>
  <div>
    <label class="block text-sm mb-1">Motivo</label>
    <input name="motivo" class="input-base" placeholder="Compra, merma..." />
  </div>
`;
};

const render = () => {
  const tbody = document.getElementById("lista-inventario");
  if (!tbody) return;

  if (!inventarioCache.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-zinc-500 py-8 text-center">Sin inventario.</td></tr>`;
    return;
  }

  tbody.innerHTML = inventarioCache
    .map((item) => {
      if (!item?.id) return "";
      const bajo = (item.stock ?? 0) <= (item.stockMinimo ?? 0);
      return `
      <tr class="${bajo ? "bg-red-500/10" : ""}">
        <td class="font-medium">${escapeHtml(item.nombre ?? "—")}</td>
        <td>${escapeHtml(item.categoria ?? "—")}</td>
        <td>${item.stock ?? 0}</td>
        <td>${escapeHtml(item.unidad ?? "")}</td>
        <td>${item.stockMinimo ?? 0}</td>
        <td>${item.activo !== false ? "Activo" : "Inactivo"}</td>
        <td>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary text-sm" data-admin-action="inventario:edit" data-id="${item.id}">Editar</button>
            <button type="button" class="btn-primary text-sm" data-admin-action="inventario:stock" data-id="${item.id}">Ajustar</button>
            <button type="button" class="btn-danger text-sm" data-admin-action="inventario:delete" data-id="${item.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
};

export const openInventarioModal = (item = null) => {
  const data = item ? normalizeRecord(item) : null;
  openFormModal({
    title: data?.id ? "Editar inventario" : "Agregar producto inventario",
    formHtml: formFields(data),
    onSubmit: async (fd) => {
      const nombre = safeText(fd.get("nombre"));
      if (!nombre) throw new Error("Nombre obligatorio");
      await saveInventarioItem(data?.id ?? null, {
        nombre,
        categoria: safeText(fd.get("categoria")),
        stock: toNumber(fd.get("stock"), 0),
        stockMinimo: toNumber(fd.get("stockMinimo"), 0),
        unidad: safeText(fd.get("unidad")) || "unidades",
        activo: fd.get("activo") === "on"
      });
      alertSuccess(data?.id ? "Actualizado" : "Creado");
    }
  });
};

const openStockModal = (item) => {
  if (!item?.id) {
    console.error("[inventario] openStockModal: item null");
    throw new Error("Producto de inventario no válido");
  }
  openFormModal({
    title: "Ajustar stock",
    submitLabel: "Aplicar",
    formHtml: stockForm(item),
    onSubmit: async (fd) => {
      const profile = getCurrentProfile();
      const usuario = profile?.nombre ?? profile?.correo ?? "admin";
      await ajustarStockInventario({
        inventarioId: item.id,
        cantidad: toNumber(fd.get("cantidad"), 0),
        tipoMovimiento: fd.get("tipoMovimiento"),
        motivo: safeText(fd.get("motivo")) || "Ajuste manual",
        usuario
      });
      alertSuccess("Stock actualizado");
    }
  });
};

export const handleInventarioAction = async (action, el) => {
  const id = el?.dataset?.id;

  if (action === "add") {
    openInventarioModal(null);
    return;
  }

  const item = findById(inventarioCache, id, "Inventario");

  if (action === "edit") {
    if (!item) throw new Error("Item no encontrado");
    openInventarioModal(item);
    return;
  }
  if (action === "stock") {
    if (!item) throw new Error("Item no encontrado");
    openStockModal(item);
    return;
  }
  if (action === "delete") {
    if (!id || !confirm("¿Eliminar?")) return;
    await removeInventarioItem(id);
    alertSuccess("Eliminado");
  }
};

export const startInventarioListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  listenInventario((items) => {
    inventarioCache = sanitizeDocs(items);
    render();
    window.dispatchEvent(new CustomEvent("inventario-updated", { detail: inventarioCache }));
  });
};

export const getInventarioCache = () => inventarioCache;
