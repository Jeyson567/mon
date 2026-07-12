import { listenCategorias, saveCategoria, removeCategoria } from "../../firebase/firestore.js";
import { openFormModal } from "../../components/modal.js";
import { escapeHtml, safeText, toNumber, normalizeRecord } from "../../js/helpers.js";
import { alertSuccess } from "../../js/alerts.js";
import { sanitizeDocs, findById } from "./admin-safe.js";

let categoriasCache = [];
let listenerStarted = false;

const formFields = (raw) => {
  const data = normalizeRecord(raw);
  return `
  <div>
    <label class="block text-sm mb-1">Nombre categoría</label>
    <input name="nombre" class="input-base" required value="${escapeHtml(data.nombre ?? "")}" placeholder="Ej: Bebidas" />
  </div>
  <div>
    <label class="block text-sm mb-1">Orden (opcional)</label>
    <input name="orden" type="number" min="0" class="input-base" value="${data.orden ?? 0}" />
  </div>
`;
};

const render = () => {
  const tbody = document.getElementById("lista-categorias");
  if (!tbody) {
    console.error("[categorias] #lista-categorias no existe");
    return;
  }

  if (!categoriasCache.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-zinc-500 py-8 text-center">No hay categorías. Agrega la primera.</td></tr>`;
    return;
  }

  tbody.innerHTML = categoriasCache
    .map(
      (c) => `
      <tr>
        <td class="font-medium">${escapeHtml(c?.nombre ?? "—")}</td>
        <td>${c?.orden ?? 0}</td>
        <td>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary text-sm" data-admin-action="categoria:edit" data-id="${c.id}">Editar</button>
            <button type="button" class="btn-danger text-sm" data-admin-action="categoria:delete" data-id="${c.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
};

export const openCategoriaModal = (item = null) => {
  const data = item ? normalizeRecord(item) : null;
  console.log("[categorias] Abriendo modal", data?.id ?? "nuevo");
  openFormModal({
    title: data?.id ? "Editar categoría" : "Agregar categoría",
    formHtml: formFields(data),
    onSubmit: async (fd) => {
      const nombre = safeText(fd.get("nombre"));
      if (!nombre) throw new Error("El nombre es obligatorio");
      const payload = { nombre, orden: toNumber(fd.get("orden"), 0) };
      await saveCategoria(data?.id ?? null, payload);
      alertSuccess(data?.id ? "Categoría actualizada" : "Categoría creada");
    }
  });
};

export const handleCategoriaAction = async (action, el) => {
  const id = el?.dataset?.id;

  if (action === "add") {
    openCategoriaModal(null);
    return;
  }
  if (action === "edit") {
    const item = findById(categoriasCache, id, "Categoría");
    if (!item) throw new Error("Categoría no encontrada");
    openCategoriaModal(item);
    return;
  }
  if (action === "delete") {
    if (!id || !confirm("¿Eliminar esta categoría?")) return;
    await removeCategoria(id);
    alertSuccess("Categoría eliminada");
  }
};

export const startCategoriasListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  listenCategorias((items) => {
    categoriasCache = sanitizeDocs(items);
    render();
    window.dispatchEvent(new CustomEvent("categorias-updated", { detail: categoriasCache }));
  });
};

export const getCategoriasCache = () => categoriasCache;
