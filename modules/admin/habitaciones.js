import { listenHabitaciones, saveHabitacion, removeHabitacion } from "../../firebase/firestore.js";
import { openFormModal, openModal } from "../../components/modal.js";
import { escapeHtml, safeText, toNumber, formatCurrency, normalizeRecord } from "../../js/helpers.js";
import { alertSuccess } from "../../js/alerts.js";
import { sanitizeDocs, findById } from "./admin-safe.js";

let habitacionesCache = [];
let listenerStarted = false;

const estadoOptions = (selected = "disponible") =>
  ["disponible", "ocupada", "limpieza", "mantenimiento"]
    .map((estado) => `<option value="${estado}" ${estado === selected ? "selected" : ""}>${estado}</option>`)
    .join("");

const formFields = (raw) => {
  const data = normalizeRecord(raw);
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-sm mb-1">Número</label>
        <input name="numero" class="input-base" required value="${escapeHtml(data.numero ?? "")}" />
      </div>
      <div>
        <label class="block text-sm mb-1">Estado</label>
        <select name="estado" class="input-base">${estadoOptions(data.estado ?? "disponible")}</select>
      </div>
    </div>
    <div>
      <label class="block text-sm mb-1">Nombre del huésped</label>
      <input name="huesped" class="input-base" value="${escapeHtml(data.huesped ?? "")}" />
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-sm mb-1">Fecha ingreso</label>
        <input name="fechaIngreso" type="date" class="input-base" value="${escapeHtml(data.fechaIngreso ?? "")}" />
      </div>
      <div>
        <label class="block text-sm mb-1">Fecha salida</label>
        <input name="fechaSalida" type="date" class="input-base" value="${escapeHtml(data.fechaSalida ?? "")}" />
      </div>
    </div>
  `;
};

const render = () => {
  const tbody = document.getElementById("lista-habitaciones");
  if (!tbody) return;

  if (!habitacionesCache.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-zinc-500 text-center py-8">Sin habitaciones.</td></tr>`;
    return;
  }

  tbody.innerHTML = habitacionesCache
    .map((h) => {
      const total = toNumber(h.totalConsumos, 0) || (h.consumos ?? []).reduce((sum, c) => sum + toNumber(c.total, 0), 0);
      return `
        <tr>
          <td class="font-bold">${escapeHtml(h.numero ?? "—")}</td>
          <td>${escapeHtml(h.huesped ?? "—")}</td>
          <td class="capitalize">${escapeHtml(h.estado ?? "disponible")}</td>
          <td>${escapeHtml(h.fechaIngreso ?? "—")}</td>
          <td>${escapeHtml(h.fechaSalida ?? "—")}</td>
          <td class="font-bold">${formatCurrency(total)}</td>
          <td>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn-secondary text-sm" data-admin-action="habitacion:checkout" data-id="${h.id}">Checkout</button>
              <button type="button" class="btn-secondary text-sm" data-admin-action="habitacion:edit" data-id="${h.id}">Editar</button>
              <button type="button" class="btn-danger text-sm" data-admin-action="habitacion:delete" data-id="${h.id}">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
};

const openHabitacionModal = (item = null) => {
  const data = item ? normalizeRecord(item) : null;
  openFormModal({
    title: data?.id ? "Editar habitación" : "Crear habitación",
    formHtml: formFields(data),
    onSubmit: async (fd) => {
      const numero = safeText(fd.get("numero"));
      if (!numero) throw new Error("Número obligatorio");
      await saveHabitacion(data?.id ?? null, {
        numero,
        huesped: safeText(fd.get("huesped")),
        estado: safeText(fd.get("estado")) || "disponible",
        fechaIngreso: safeText(fd.get("fechaIngreso")),
        fechaSalida: safeText(fd.get("fechaSalida")),
        consumos: data?.consumos ?? [],
        totalConsumos: toNumber(data?.totalConsumos, 0)
      });
      alertSuccess(data?.id ? "Habitación actualizada" : "Habitación creada");
    }
  });
};

const openCheckoutModal = (habitacion) => {
  const consumos = habitacion?.consumos ?? [];
  const total = consumos.reduce((sum, c) => sum + toNumber(c.total, 0), 0);
  openModal({
    title: `Checkout habitación ${habitacion.numero ?? ""}`,
    size: "xl",
    content: `
      <p class="text-zinc-400 mb-3">Huésped: <strong class="text-white">${escapeHtml(habitacion.huesped ?? "—")}</strong></p>
      <div class="table-scroll-wrap rounded-2xl border border-zinc-800 bg-zinc-950">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Origen</th>
              <th>Mesa</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              consumos.length
                ? consumos
                    .map(
                      (c) => `
                      <tr>
                        <td>${escapeHtml(`${c.fecha ?? ""} ${c.hora ?? ""}`.trim())}</td>
                        <td>${escapeHtml(c.origen ?? "Restaurante")}</td>
                        <td>${escapeHtml(c.mesa ?? "—")}</td>
                        <td class="font-bold">${formatCurrency(c.total ?? 0)}</td>
                      </tr>`
                    )
                    .join("")
                : `<tr><td colspan="4" class="text-center text-zinc-500 py-8">Sin consumos.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <p class="text-2xl font-bold text-orange-400 text-right mt-4">Total: ${formatCurrency(total)}</p>
    `
  });
};

export const handleHabitacionAction = async (action, el) => {
  const id = el?.dataset?.id;
  if (action === "add") {
    openHabitacionModal(null);
    return;
  }

  const item = findById(habitacionesCache, id, "Habitación");
  if (!item) throw new Error("Habitación no encontrada");

  if (action === "edit") {
    openHabitacionModal(item);
    return;
  }
  if (action === "checkout") {
    openCheckoutModal(item);
    return;
  }
  if (action === "delete") {
    if (!confirm("¿Eliminar habitación?")) return;
    await removeHabitacion(id);
    alertSuccess("Habitación eliminada");
  }
};

export const startHabitacionesListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  listenHabitaciones((items) => {
    habitacionesCache = sanitizeDocs(items);
    render();
  });
};

export const getHabitacionesCache = () => habitacionesCache;
