import {
  listenMesas,
  listenVentas,
  listenProductos,
  listenInventario,
  cobrarMesaConTicket,
  anularVenta
} from "../../firebase/firestore.js";
import { protectModule } from "../../js/guard.js";
import { buildSidebar } from "../../components/sidebar.js";
import { openFormModal } from "../../components/modal.js";
import { formatCurrency, escapeHtml, toNumber, normalizeRecord } from "../../js/helpers.js";
import { alertSuccess, alertError } from "../../js/alerts.js";
import { printTicket } from "../../js/print-ticket.js";
import {
  descuentosMenuCarrito,
  descontarInventarioItems,
  reembolsarInventarioItems,
  snapshotInventarioVenta
} from "../../js/inventario-refund.js";

let mesasCache = [];
let ventasCache = [];
let productosCache = [];
let inventarioCache = [];
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
      <button type="button" class="btn-primary w-full mt-3 min-h-[48px]" data-cobrar-mesa="${m.id}">Cobrar mesa</button>
    </article>
  `
    )
    .join("");
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
        estado: "pagado"
      };

      const result = await cobrarMesaConTicket({ mesaId: m.id, ventaPayload });
      const ventaImpresion = { ...ventaPayload, ticket: result.ticket, correlativo: result.correlativo };
      printTicket(ventaImpresion);

      const menuDescuentos = descuentosMenuCarrito(carrito, productosCache, inventarioCache);
      if (menuDescuentos.length) {
        const { ok, fallos } = await descontarInventarioItems({
          items: menuDescuentos,
          usuario,
          motivo: `Venta mesa ${m.numero ?? m.id}`,
          tipoMovimiento: "salida",
          inventarioItems: inventarioCache
        });
        if (fallos.length) {
          console.warn("[caja] Inventario no descontado por completo (venta ya registrada):", fallos);
        }
        if (ok === 0 && fallos.length) {
          console.warn("[caja] Ningún ítem de inventario del menú pudo descontarse. Revise inventarioConfig (nombre vs ID).");
        }
      }

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
  if (!id) return;
  const mesa = mesasCache.find((m) => m.id === id);
  if (mesa) openCobroModal(mesa);
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

  listenVentas((items) => {
    ventasCache = items.filter(Boolean);
    renderHistorial();
  });
});
