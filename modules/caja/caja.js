import {
  listenMesas,
  listenVentas,
  listenProductos,
  listenInventario,
  listenHabitaciones,
  cobrarMesaConTicket,
  cargarMesaAHabitacion,
  anularVenta
} from "../../firebase/firestore.js";
import { protectModule } from "../../js/guard.js";
import { buildSidebar } from "../../components/sidebar.js";
import { openFormModal } from "../../components/modal.js";
import { formatCurrency, escapeHtml, toNumber, normalizeRecord } from "../../js/helpers.js";
import { alertSuccess, alertError } from "../../js/alerts.js";
import { printTicket } from "../../js/print-ticket.js";
import {
  reembolsarInventarioItems,
  snapshotInventarioVenta
} from "../../js/inventario-refund.js";

let mesasCache = [];
let ventasCache = [];
let productosCache = [];
let inventarioCache = [];
let habitacionesCache = [];
let profileCache = null;

const nowParts = () => {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString("es-GT"),
    hora: d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })
  };
};

const estadoVentaClass = (estado) => {
  const map = {
    pagado: "text-green-400",
    reembolsado: "text-yellow-400",
    anulado: "text-red-400"
  };
  return map[estado] ?? "text-zinc-400";
};

const renderMesasCobro = () => {
  const list = document.getElementById("cashier-list");
  if (!list) return;

  const pendientes = mesasCache.filter(
    (m) => m?.activa !== false && ["ocupada", "cobrando"].includes(m?.estado) && (m?.total ?? 0) > 0
  );

  if (!pendientes.length) {
    list.innerHTML = `<p class="text-zinc-500 col-span-full">No hay mesas pendientes de cobro.</p>`;
    return;
  }

  list.innerHTML = pendientes
    .map(
      (m) => `
    <article class="rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
      <h3 class="font-bold text-lg">${escapeHtml(m.numero ?? "Mesa")}</h3>
      <p class="text-sm text-zinc-400">Estado: ${m.estado}</p>
      <p class="text-sm">Mesero: ${escapeHtml(m.meseroAsignado || "—")}</p>
      <p class="text-xl text-orange-400 font-bold mt-2">${formatCurrency(m.total ?? 0)}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <button type="button" class="btn-primary w-full min-h-[48px]" data-cobrar-mesa="${m.id}">Cobrar todo</button>
        <button type="button" class="btn-secondary w-full min-h-[48px]" data-dividir-mesa="${m.id}">Dividir cuenta</button>
      </div>
      <button type="button" class="btn-secondary w-full mt-2 min-h-[48px]" data-cargar-habitacion="${m.id}">Cargar a habitación</button>
    </article>
  `
    )
    .join("");
};

const habitacionOptions = () => {
  const ocupadas = habitacionesCache.filter((h) => h.estado === "ocupada");
  if (!ocupadas.length) return `<option value="">— No hay habitaciones ocupadas —</option>`;
  return ocupadas
    .map((h) => `<option value="${h.id}">${escapeHtml(h.numero ?? "")} — ${escapeHtml(h.huesped ?? "Huésped")}</option>`)
    .join("");
};

const openCargarHabitacionModal = (mesa) => {
  const m = normalizeRecord(mesa);
  const carrito = Array.isArray(m.carrito) ? m.carrito : [];
  if (!m.id || !carrito.length) return;

  openFormModal({
    title: `Cargar a habitación — ${m.numero ?? "Mesa"}`,
    size: "md",
    submitLabel: "Cargar consumo",
    formHtml: `
      <p class="text-zinc-400 text-sm">El consumo se agregará a la habitación y la mesa quedará libre. No se registra pago inmediato.</p>
      <div>
        <label class="block text-sm mb-1">Habitación</label>
        <select name="habitacionId" class="input-base" required>${habitacionOptions()}</select>
      </div>
      <div>
        <label class="block text-sm mb-1">Origen / descripción</label>
        <input name="origen" class="input-base" value="Restaurante" />
      </div>
      <p class="text-lg font-bold">Total a cargar: <span class="text-orange-400">${formatCurrency(m.total ?? 0)}</span></p>
    `,
    onSubmit: async (fd) => {
      const habitacionId = fd.get("habitacionId");
      if (!habitacionId) throw new Error("Selecciona una habitación ocupada");
      const usuario = profileCache?.nombre ?? profileCache?.email ?? "caja";
      const inventarioDescuentos = snapshotInventarioVenta(carrito, productosCache, inventarioCache);
      const consumoPayload = {
        origen: String(fd.get("origen") ?? "Restaurante").trim() || "Restaurante",
        mesa: m.numero ?? m.id,
        mesaId: m.id,
        mesero: m.meseroAsignado || profileCache?.nombre || "—",
        usuario,
        productos: carrito.map((l) => ({
          nombre: l.esAdicional ? `${l.nombre} [Adicional]` : l.nombre,
          cantidad: l.cantidad ?? 1,
          subtotal: l.subtotal ?? l.precio ?? 0,
          notas: l.notas ?? "",
          esAdicional: !!l.esAdicional
        })),
        inventarioDescuentos,
        subtotal: toNumber(m.total, 0),
        total: toNumber(m.total, 0)
      };
      await cargarMesaAHabitacion({ mesaId: m.id, habitacionId, consumoPayload, inventarioDescuentos });
      alertSuccess("Consumo cargado a habitación");
    }
  });
};

const lineaLabel = (linea) =>
  `${linea.nombre ?? "Producto"} · ${linea.cantidad ?? 1} x ${formatCurrency(linea.precio ?? linea.subtotal ?? 0)}`;

const selectedLineasFromForm = (carrito, fd) => {
  const selected = new Set(fd.getAll("lineas[]").map((v) => Number(v)));
  return carrito
    .map((linea, index) => ({ linea, index }))
    .filter((entry) => selected.has(entry.index));
};

const openDividirCuentaModal = (mesa) => {
  const m = normalizeRecord(mesa);
  const carrito = Array.isArray(m.carrito) ? m.carrito : [];
  if (!m.id || !carrito.length) return;

  openFormModal({
    title: `Dividir cuenta — ${m.numero ?? "Mesa"}`,
    size: "xl",
    submitLabel: "Cobrar selección",
    formHtml: `
      <p class="text-zinc-400 text-sm">Selecciona los productos que pagará esta persona o grupo. La mesa seguirá abierta si quedan productos pendientes.</p>
      <div class="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        ${carrito
          .map(
            (linea, index) => `
            <label class="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <input type="checkbox" name="lineas[]" value="${index}" class="mt-1" data-split-linea data-subtotal="${toNumber(linea.subtotal, 0)}" />
              <span class="flex-1">
                <span class="block font-semibold">${escapeHtml(lineaLabel(linea))}</span>
                <span class="text-sm text-zinc-500">${escapeHtml(linea.notas ?? "")}</span>
              </span>
              <strong>${formatCurrency(linea.subtotal ?? 0)}</strong>
            </label>`
          )
          .join("")}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-sm mb-1">Descuento</label>
          <input name="descuento" id="split-descuento" type="number" min="0" step="0.01" class="input-base" value="0" />
        </div>
        <div>
          <label class="block text-sm mb-1">Impuestos</label>
          <input name="impuestos" id="split-impuestos" type="number" min="0" step="0.01" class="input-base" value="0" />
        </div>
        <div>
          <label class="block text-sm mb-1">Propina</label>
          <input name="propina" id="split-propina" type="number" min="0" step="0.01" class="input-base" value="0" />
        </div>
      </div>
      <div class="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 space-y-1">
        <p>Subtotal: <strong id="split-subtotal">Q0.00</strong></p>
        <p>Total: <strong id="split-total" class="text-orange-400">Q0.00</strong></p>
      </div>
      <div>
        <label class="block text-sm mb-1">Método de pago</label>
        <select name="metodoPago" class="input-base" required>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
      </div>
    `,
    onSubmit: async (fd) => {
      const seleccion = selectedLineasFromForm(carrito, fd);
      if (!seleccion.length) throw new Error("Selecciona al menos un producto para cobrar");

      const lineas = seleccion.map((entry) => entry.linea);
      const sub = lineas.reduce((sum, linea) => sum + toNumber(linea.subtotal, 0), 0);
      const descuento = Math.min(sub, Math.max(0, toNumber(fd.get("descuento"), 0)));
      const impuestos = Math.max(0, toNumber(fd.get("impuestos"), 0));
      const propina = Math.max(0, toNumber(fd.get("propina"), 0));
      const total = sub - descuento + impuestos + propina;
      const metodoPago = fd.get("metodoPago");
      const { fecha, hora } = nowParts();
      const usuario = profileCache?.nombre ?? profileCache?.email ?? "caja";
      const mesero = m.meseroAsignado || profileCache?.nombre || "—";
      const inventarioDescuentos = snapshotInventarioVenta(lineas, productosCache, inventarioCache);
      const lineaIdsCobradas = seleccion.map((entry) => entry.linea.lineaId).filter(Boolean);
      const indicesCobrados = seleccion.map((entry) => entry.index);

      const ventaPayload = {
        mesa: m.numero ?? m.id,
        mesaId: m.id,
        mesero,
        fecha,
        hora,
        productos: lineas.map((l) => ({
          nombre: l.esAdicional ? `${l.nombre} [Adicional]` : l.nombre,
          cantidad: l.cantidad ?? 1,
          subtotal: l.subtotal ?? l.precio ?? 0,
          notas: l.notas ?? "",
          esAdicional: !!l.esAdicional
        })),
        inventarioDescuentos,
        lineaIdsCobradas,
        indicesCobrados,
        parcial: lineas.length < carrito.length,
        subtotal: sub,
        descuento,
        impuestos,
        propina,
        total,
        metodoPago,
        cobradoPor: usuario,
        estado: "pagado"
      };

      const result = await cobrarMesaConTicket({ mesaId: m.id, ventaPayload, inventarioDescuentos });
      printTicket({ ...ventaPayload, ticket: result.ticket, correlativo: result.correlativo });
      alertSuccess(`Cobro parcial ${result.ticket}`);
    }
  });

  setTimeout(() => {
    const recalc = () => {
      const checked = [...document.querySelectorAll("[data-split-linea]:checked")];
      const sub = checked.reduce((sum, input) => sum + toNumber(input.dataset.subtotal, 0), 0);
      const descuento = Math.min(sub, Math.max(0, toNumber(document.getElementById("split-descuento")?.value, 0)));
      const impuestos = Math.max(0, toNumber(document.getElementById("split-impuestos")?.value, 0));
      const propina = Math.max(0, toNumber(document.getElementById("split-propina")?.value, 0));
      const total = sub - descuento + impuestos + propina;
      const lblSub = document.getElementById("split-subtotal");
      const lblTotal = document.getElementById("split-total");
      if (lblSub) lblSub.textContent = formatCurrency(sub);
      if (lblTotal) lblTotal.textContent = formatCurrency(total);
    };
    document.querySelectorAll("[data-split-linea], #split-descuento, #split-impuestos, #split-propina").forEach((el) => {
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });
    recalc();
  }, 50);
};

const renderHistorial = () => {
  const tbody = document.getElementById("historial-ventas");
  if (!tbody) return;

  if (!ventasCache.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-zinc-500">Sin ventas registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = ventasCache
    .map((v) => {
      const estado = v.estado ?? "pagado";
      const puedeAnular = estado === "pagado";
      return `
    <tr class="border-b border-zinc-800">
      <td class="p-3 font-mono">${escapeHtml(v.ticket ?? "")}</td>
      <td class="p-3">${escapeHtml(v.mesa ?? "")}</td>
      <td class="p-3 text-right">${formatCurrency(v.subtotal ?? 0)}</td>
      <td class="p-3 text-right">${formatCurrency(v.propina ?? 0)}</td>
      <td class="p-3 text-right font-bold">${formatCurrency(v.total ?? 0)}</td>
      <td class="p-3">${escapeHtml(v.metodoPago ?? "")}</td>
      <td class="p-3 capitalize ${estadoVentaClass(estado)}">${estado}</td>
      <td class="p-3 whitespace-nowrap">
        <button type="button" class="btn-secondary text-xs mr-1" data-reprint="${v.id}">Reimprimir</button>
        ${puedeAnular ? `<button type="button" class="btn-danger text-xs" data-anular-venta="${v.id}">Anular</button>` : ""}
      </td>
    </tr>
  `;
    })
    .join("");
};

const openAnularVentaModal = (venta) => {
  openFormModal({
    title: `Anular venta — ${venta.ticket ?? ""}`,
    size: "md",
    submitLabel: "Confirmar anulación",
    formHtml: `
      <p class="text-zinc-400 text-sm">La venta pasará a <strong class="text-yellow-400">reembolsado</strong> y el inventario descontado será devuelto.</p>
      <div>
        <label class="block text-sm mb-1">Motivo</label>
        <textarea name="motivo" class="input-base min-h-[80px]" required placeholder="Motivo de la anulación..."></textarea>
      </div>
    `,
    onSubmit: async (fd) => {
      const motivo = String(fd.get("motivo") ?? "").trim();
      if (!motivo) throw new Error("Indica el motivo");
      const usuario = profileCache?.nombre ?? profileCache?.email ?? "caja";

      const items = venta.inventarioDescuentos ?? [];
      if (items.length) {
        const { fallos } = await reembolsarInventarioItems({
          items,
          usuario,
          motivo: `Anulación ${venta.ticket}: ${motivo}`,
          inventarioItems: inventarioCache
        });
        if (fallos?.length) {
          console.warn("[caja] Reembolso parcial de inventario:", fallos);
        }
      }

      await anularVenta({ ventaId: venta.id, motivo, usuario });
      alertSuccess(`Venta ${venta.ticket} anulada — inventario reembolsado`);
    }
  });
};

const openCobroModal = (mesa) => {
  const m = normalizeRecord(mesa);
  if (!m.id) return;

  const subtotal = toNumber(m.total, 0);

  openFormModal({
    title: `Cobrar — ${m.numero ?? "Mesa"}`,
    size: "md",
    formHtml: `
      <p class="text-zinc-400 text-sm">Subtotal consumo: <strong class="text-white" id="lbl-subtotal">${formatCurrency(subtotal)}</strong></p>
      <div>
        <label class="block text-sm mb-1">Propina (manual)</label>
        <input name="propina" id="input-propina" type="number" min="0" step="0.01" class="input-base" value="0" />
        <p class="text-xs text-zinc-500 mt-1">Ingresa 0 si no hay propina</p>
      </div>
      <p class="text-lg font-bold">TOTAL: <span id="lbl-total" class="text-orange-400">${formatCurrency(subtotal)}</span></p>
      <div>
        <label class="block text-sm mb-1">Método de pago</label>
        <select name="metodoPago" class="input-base" required>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
      </div>
      <input type="hidden" name="subtotal" value="${subtotal}" />
    `,
    submitLabel: "Cobrar e imprimir",
    onSubmit: async (fd) => {
      const propina = Math.max(0, toNumber(fd.get("propina"), 0));
      const sub = Math.max(0, toNumber(fd.get("subtotal"), 0));
      const total = sub + propina;
      const metodoPago = fd.get("metodoPago");
      const { fecha, hora } = nowParts();
      const mesero = m.meseroAsignado || profileCache?.nombre || "—";
      const usuario = profileCache?.nombre ?? profileCache?.email ?? "caja";
      const carrito = m.carrito ?? [];

      const inventarioDescuentos = snapshotInventarioVenta(
        carrito,
        productosCache,
        inventarioCache
      );

      const ventaPayload = {
        mesa: m.numero ?? m.id,
        mesaId: m.id,
        mesero,
        fecha,
        hora,
        productos:
          (Array.isArray(carrito) && carrito.length
            ? carrito.map((l) => ({
                nombre: l.esAdicional ? `${l.nombre} [Adicional]` : l.nombre,
                cantidad: l.cantidad ?? 1,
                subtotal: l.subtotal ?? l.precio ?? 0,
                notas: l.notas ?? "",
                esAdicional: !!l.esAdicional
              }))
            : null) ?? [{ nombre: "Consumo", cantidad: 1, subtotal: sub }],
        inventarioDescuentos,
        subtotal: sub,
        propina,
        total,
        metodoPago,
        cobradoPor: usuario,
        estado: "pagado"
      };

      const result = await cobrarMesaConTicket({
        mesaId: m.id,
        ventaPayload,
        inventarioDescuentos
      });
      const ventaImpresion = { ...ventaPayload, ticket: result.ticket, correlativo: result.correlativo };
      printTicket(ventaImpresion);

      alertSuccess(`Cobrado ${result.ticket}`);
    }
  });

  setTimeout(() => {
    const inputPropina = document.getElementById("input-propina");
    const lblTotal = document.getElementById("lbl-total");
    const updateTotal = () => {
      const prop = Math.max(0, toNumber(inputPropina?.value, 0));
      if (lblTotal) lblTotal.textContent = formatCurrency(subtotal + prop);
    };
    inputPropina?.addEventListener("input", updateTotal);
    updateTotal();
  }, 50);
};

const setupTabs = () => {
  if (location.hash === "#historial") {
    document.getElementById("view-cobros")?.classList.add("hidden");
    document.getElementById("view-historial")?.classList.remove("hidden");
  }
};

document.getElementById("cashier-list")?.addEventListener("click", (e) => {
  const id = e.target.closest("[data-cobrar-mesa]")?.dataset.cobrarMesa;
  const splitId = e.target.closest("[data-dividir-mesa]")?.dataset.dividirMesa;
  const habitacionId = e.target.closest("[data-cargar-habitacion]")?.dataset.cargarHabitacion;
  if (!id && !splitId && !habitacionId) return;
  const mesaId = id || splitId || habitacionId;
  const mesa = mesasCache.find((m) => m.id === mesaId);
  if (mesa && id) openCobroModal(mesa);
  if (mesa && splitId) openDividirCuentaModal(mesa);
  if (mesa && habitacionId) openCargarHabitacionModal(mesa);
});

document.getElementById("historial-ventas")?.addEventListener("click", (e) => {
  const reprintId = e.target.closest("[data-reprint]")?.dataset.reprint;
  const anularId = e.target.closest("[data-anular-venta]")?.dataset.anularVenta;
  const id = reprintId || anularId;
  if (!id) return;
  const venta = ventasCache.find((v) => v.id === id);
  if (!venta) {
    alertError("Venta no encontrada");
    return;
  }
  if (reprintId) printTicket(venta);
  if (anularId) openAnularVentaModal(venta);
});

protectModule("caja", (profile) => {
  profileCache = profile;
  buildSidebar(profile.rol);
  setupTabs();

  listenMesas((items) => {
    mesasCache = items.filter(Boolean);
    renderMesasCobro();
  });

  listenProductos((items) => {
    productosCache = items.filter(Boolean);
  });

  listenInventario((items) => {
    inventarioCache = items.filter(Boolean);
  });

  listenHabitaciones((items) => {
    habitacionesCache = items.filter(Boolean);
  });

  listenVentas((items) => {
    ventasCache = items.filter(Boolean);
    renderHistorial();
  });
});
