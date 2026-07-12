import { listenVentas } from "../../firebase/firestore.js";
import { protectModule } from "../../js/guard.js";
import { buildSidebar } from "../../components/sidebar.js";
import { openModal } from "../../components/modal.js";
import { formatCurrency, escapeHtml } from "../../js/helpers.js";
import { printTicket } from "../../js/print-ticket.js";
import { ticketTemplate80mm } from "../../components/ticket-template.js";

let ventasCache = [];

const filtros = () => ({
  ticket: document.getElementById("filtro-ticket")?.value?.trim().toLowerCase() ?? "",
  fecha: document.getElementById("filtro-fecha")?.value ?? "",
  mesa: document.getElementById("filtro-mesa")?.value?.trim().toLowerCase() ?? "",
  mesero: document.getElementById("filtro-mesero")?.value?.trim().toLowerCase() ?? "",
  pago: document.getElementById("filtro-pago")?.value ?? "",
  estado: document.getElementById("filtro-estado")?.value ?? ""
});

const fechaVentaIso = (v) => {
  if (!v.fecha) return "";
  const parts = String(v.fecha).split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
};

const ventaPasaFiltros = (v, f) => {
  if (f.ticket && !String(v.ticket ?? "").toLowerCase().includes(f.ticket)) return false;
  if (f.fecha && fechaVentaIso(v) !== f.fecha) return false;
  if (f.mesa && !String(v.mesa ?? "").toLowerCase().includes(f.mesa)) return false;
  if (f.mesero && !String(v.mesero ?? "").toLowerCase().includes(f.mesero)) return false;
  if (f.pago && v.metodoPago !== f.pago) return false;
  if (f.estado && (v.estado ?? "pagado") !== f.estado) return false;
  return true;
};

const estadoClass = (estado) => {
  const map = {
    pagado: "text-green-400",
    anulado: "text-red-400",
    reembolsado: "text-yellow-400"
  };
  return map[estado] ?? "text-zinc-400";
};

const renderTabla = () => {
  const tbody = document.getElementById("reimp-tabla");
  const counter = document.getElementById("reimp-contador");
  if (!tbody) return;

  const f = filtros();
  const list = ventasCache.filter((v) => ventaPasaFiltros(v, f));

  if (counter) counter.textContent = `${list.length} ticket(s)`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-zinc-500">No hay ventas con estos filtros</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((v) => {
      const estado = v.estado ?? "pagado";
      return `
      <tr class="border-b border-zinc-800 hover:bg-zinc-900/50">
        <td class="p-3 font-mono text-orange-300">${escapeHtml(v.ticket ?? "—")}</td>
        <td class="p-3">${escapeHtml(v.fecha ?? "")}</td>
        <td class="p-3">${escapeHtml(v.hora ?? "")}</td>
        <td class="p-3">${escapeHtml(v.mesa ?? "")}</td>
        <td class="p-3">${escapeHtml(v.mesero ?? "")}</td>
        <td class="p-3 text-right font-bold">${formatCurrency(v.total ?? 0)}</td>
        <td class="p-3 capitalize">${escapeHtml(v.metodoPago ?? "")}</td>
        <td class="p-3 capitalize ${estadoClass(estado)}">${estado}</td>
        <td class="p-3 whitespace-nowrap">
          <button type="button" class="btn-secondary text-xs mr-1" data-ver-venta="${v.id}">Ver detalle</button>
          <button type="button" class="btn-primary text-xs" data-reimprimir-venta="${v.id}">Reimprimir</button>
        </td>
      </tr>
    `;
    })
    .join("");
};

const verDetalle = (venta) => {
  openModal({
    title: `Ticket ${venta.ticket ?? ""}`,
    size: "sm",
    content: `
      <div class="ticket-preview bg-white text-black rounded-lg overflow-hidden">
        ${ticketTemplate80mm(venta)}
      </div>
      <button type="button" class="btn-primary w-full mt-4" id="btn-print-detalle">Reimprimir</button>
    `
  });
  document.getElementById("btn-print-detalle")?.addEventListener("click", () => printTicket(venta));
};

document.getElementById("reimp-tabla")?.addEventListener("click", (e) => {
  const verId = e.target.closest("[data-ver-venta]")?.dataset.verVenta;
  const repId = e.target.closest("[data-reimprimir-venta]")?.dataset.reimprimirVenta;
  const id = verId || repId;
  if (!id) return;
  const venta = ventasCache.find((v) => v.id === id);
  if (!venta) return;
  if (verId) verDetalle(venta);
  if (repId) printTicket(venta);
});

["filtro-ticket", "filtro-fecha", "filtro-mesa", "filtro-mesero", "filtro-pago", "filtro-estado"].forEach(
  (id) => {
    document.getElementById(id)?.addEventListener("input", renderTabla);
    document.getElementById(id)?.addEventListener("change", renderTabla);
  }
);

protectModule("tickets", (profile) => {
  buildSidebar(profile.rol);
  listenVentas((items) => {
    ventasCache = items.filter(Boolean);
    renderTabla();
  }, 500);
});
