import { listenVentas } from "../../firebase/firestore.js";
import { formatCurrency, escapeHtml } from "../../js/helpers.js";

let ventasCache = [];
let listenerStarted = false;

const render = () => {
  const resumen = document.getElementById("reportes-resumen");
  const tbody = document.getElementById("lista-reportes-ventas");

  const pagadas = ventasCache.filter((v) => v?.estado === "pagado" || !v?.estado);
  const totalVentas = pagadas.reduce((s, v) => s + (Number(v.subtotal) || 0), 0);
  const totalPropinas = pagadas.reduce((s, v) => s + (Number(v.propina) || 0), 0);
  const totalGeneral = pagadas.reduce((s, v) => s + (Number(v.total) || 0), 0);

  if (resumen) {
    resumen.innerHTML = `
      <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p class="text-zinc-400 text-sm">Ventas (subtotal)</p>
        <p class="text-2xl font-bold text-green-400">${formatCurrency(totalVentas)}</p>
      </article>
      <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p class="text-zinc-400 text-sm">Propinas</p>
        <p class="text-2xl font-bold text-yellow-400">${formatCurrency(totalPropinas)}</p>
      </article>
      <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p class="text-zinc-400 text-sm">Total cobrado</p>
        <p class="text-2xl font-bold text-orange-400">${formatCurrency(totalGeneral)}</p>
      </article>
    `;
  }

  if (!tbody) return;
  if (!pagadas.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-zinc-500">Sin ventas</td></tr>`;
    return;
  }

  tbody.innerHTML = pagadas
    .map(
      (v) => `
    <tr>
      <td class="font-mono">${escapeHtml(v.ticket ?? "")}</td>
      <td>${escapeHtml(v.fecha ?? "")} ${escapeHtml(v.hora ?? "")}</td>
      <td>${escapeHtml(v.mesa ?? "")}</td>
      <td>${formatCurrency(v.subtotal ?? 0)}</td>
      <td>${formatCurrency(v.propina ?? 0)}</td>
      <td class="font-bold">${formatCurrency(v.total ?? 0)}</td>
      <td>${escapeHtml(v.metodoPago ?? "")}</td>
    </tr>
  `
    )
    .join("");
};

export const startReportesListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  listenVentas((items) => {
    ventasCache = items.filter(Boolean);
    render();
  });
};
