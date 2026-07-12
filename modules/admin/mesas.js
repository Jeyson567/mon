import { listenMesas, saveMesa, removeMesa } from "../../firebase/firestore.js";
import { openFormModal } from "../../components/modal.js";
import { escapeHtml, safeText, toNumber, formatCurrency, normalizeRecord } from "../../js/helpers.js";
import { estadoMesaClass } from "../../js/ui.js";
import { alertSuccess } from "../../js/alerts.js";
import { sanitizeDocs, findById } from "./admin-safe.js";

let mesasCache = [];
let listenerStarted = false;

const defaultMesa = (raw) => {
  const data = normalizeRecord(raw);
  return {
    numero: data.numero ?? "",
    capacidad: toNumber(data.capacidad, 4),
    orden: toNumber(data.orden, 1),
    estado: data.estado ?? "libre",
    total: data.total ?? 0,
    meseroAsignado: data.meseroAsignado ?? "",
    activa: data.activa !== false,
    fechaApertura: data.fechaApertura ?? null
  };
};

const formFields = (raw) => {
  const data = normalizeRecord(raw);
  return `
  <div>
    <label class="block text-sm mb-1">Número / nombre mesa</label>
    <input name="numero" class="input-base" required value="${escapeHtml(data.numero ?? "")}" placeholder="Mesa 1" />
  </div>
  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="block text-sm mb-1">Capacidad</label>
      <input name="capacidad" type="number" min="1" class="input-base" value="${data.capacidad ?? 4}" required />
    </div>
    <div>
      <label class="block text-sm mb-1">Orden visual</label>
      <input name="orden" type="number" min="1" class="input-base" value="${data.orden ?? 1}" required />
    </div>
  </div>
  <label class="flex items-center gap-2">
    <input type="checkbox" name="activa" ${data.activa !== false ? "checked" : ""} />
    <span>Mesa activa</span>
  </label>
`;
};

const render = () => {
  const grid = document.getElementById("lista-mesas");
  if (!grid) return;

  if (!mesasCache.length) {
    grid.innerHTML = `<p class="text-zinc-500 col-span-full text-center py-12">No hay mesas.</p>`;
    return;
  }

  grid.innerHTML = mesasCache
    .map((mesa) => {
      if (!mesa?.id) return "";
      const cls = estadoMesaClass(mesa.estado ?? "libre");
      return `
      <article class="table-card ${cls}">
        <h3 class="text-lg font-bold">${escapeHtml(mesa.numero ?? "Mesa")}</h3>
        <p class="text-sm text-zinc-400">Estado: ${mesa.estado ?? "libre"} · Cap: ${mesa.capacidad ?? 0}</p>
        <p class="text-sm">Total: ${formatCurrency(mesa.total ?? 0)}</p>
        <div class="flex gap-2 mt-3">
          <button type="button" class="btn-secondary text-sm flex-1" data-admin-action="mesa:edit" data-id="${mesa.id}">Editar</button>
          <button type="button" class="btn-danger text-sm" data-admin-action="mesa:delete" data-id="${mesa.id}">Eliminar</button>
        </div>
      </article>
    `;
    })
    .join("");
};

export const openMesaModal = (item = null) => {
  const data = item ? normalizeRecord(item) : null;
  openFormModal({
    title: data?.id ? "Editar mesa" : "Agregar mesa",
    formHtml: formFields(data),
    onSubmit: async (fd) => {
      const numero = safeText(fd.get("numero"));
      if (!numero) throw new Error("Número de mesa obligatorio");
      const payload = {
        ...defaultMesa(data),
        numero,
        capacidad: toNumber(fd.get("capacidad"), 4),
        orden: toNumber(fd.get("orden"), 1),
        activa: fd.get("activa") === "on"
      };
      await saveMesa(data?.id ?? null, payload);
      alertSuccess(data?.id ? "Mesa actualizada" : "Mesa creada");
    }
  });
};

export const handleMesaAction = async (action, el) => {
  const id = el?.dataset?.id;

  if (action === "add") {
    openMesaModal(null);
    return;
  }
  if (action === "edit") {
    const item = findById(mesasCache, id, "Mesa");
    if (!item) throw new Error("Mesa no encontrada");
    openMesaModal(item);
    return;
  }
  if (action === "delete") {
    if (!id || !confirm("¿Eliminar mesa?")) return;
    await removeMesa(id);
    alertSuccess("Mesa eliminada");
  }
};

export const startMesasListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  listenMesas((items) => {
    mesasCache = sanitizeDocs(items);
    render();
  });
};
