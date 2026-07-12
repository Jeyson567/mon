import { ticketTemplate80mm } from "../components/ticket-template.js";

/**
 * Imprime ticket 80mm con window.print()
 */
export const printTicket = (venta) => {
  const existing = document.getElementById("ticket-print-root");
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = "ticket-print-root";
  root.innerHTML = ticketTemplate80mm(venta);
  document.body.appendChild(root);

  window.print();

  setTimeout(() => root.remove(), 500);
};
