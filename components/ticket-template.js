import { formatCurrency } from "../js/helpers.js";
import { BUSINESS_NAME } from "../js/config.js";

export const ticketTemplate80mm = (venta) => {
  const productos = venta?.productos ?? [];
  const lineasProductos = productos.length
    ? productos
        .map(
          (item) =>
            `<p style="margin:2px 0;font-size:12px;">${item.cantidad ?? 1} x ${item.nombre ?? "Item"}${item.esAdicional || String(item.nombre ?? "").includes("[Adicional]") ? " *" : ""} <span style="float:right">${formatCurrency(item.subtotal ?? 0)}</span></p>${item.notas ? `<p style="margin:0 0 2px 12px;font-size:11px;">↳ ${item.notas}</p>` : ""}`
        )
        .join("")
  : `<p style="margin:2px 0;font-size:12px;">Consumo general</p>`;

  return `
  <section id="ticket-print" style="width:80mm;font-family:monospace;padding:10px;color:#000;background:#fff;">
    <p style="text-align:center;margin:0;font-size:14px;">==============================</p>
    <h1 style="text-align:center;margin:4px 0;font-size:18px;letter-spacing:1px;">${BUSINESS_NAME}</h1>
    <p style="text-align:center;margin:0;font-size:14px;">==============================</p>
    <p style="margin:8px 0 2px;font-size:13px;"><strong>${venta?.ticket ?? ""}</strong></p>
    <p style="margin:2px 0;font-size:12px;">Fecha: ${venta?.fecha ?? ""}</p>
    <p style="margin:2px 0;font-size:12px;">Hora: ${venta?.hora ?? ""}</p>
    <p style="margin:2px 0;font-size:12px;">Mesa: ${venta?.mesa ?? ""}</p>
    <p style="margin:2px 0;font-size:12px;">Mesero: ${venta?.mesero ?? ""}</p>
    <p style="margin:8px 0;text-align:center;">---</p>
    <p style="margin:4px 0;font-weight:bold;font-size:12px;">Productos</p>
    ${lineasProductos}
    <p style="margin:8px 0;text-align:center;">---</p>
    <p style="margin:2px 0;font-size:12px;">Subtotal: <span style="float:right">${formatCurrency(venta?.subtotal ?? 0)}</span></p>
    <p style="margin:2px 0;font-size:12px;">Propina: <span style="float:right">${formatCurrency(venta?.propina ?? 0)}</span></p>
    <p style="margin:4px 0;font-size:14px;font-weight:bold;">TOTAL: <span style="float:right">${formatCurrency(venta?.total ?? 0)}</span></p>
    <p style="margin:8px 0 2px;font-size:12px;">Método pago: ${venta?.metodoPago ?? ""}</p>
    <p style="margin:12px 0 0;text-align:center;font-size:12px;">Gracias por su visita</p>
  </section>
`;
};
