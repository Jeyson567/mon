import { listenPedidosCocina, updatePedidoEstado } from "../../firebase/firestore.js";
import { protectModule } from "../../js/guard.js";
import { buildSidebar } from "../../components/sidebar.js";
import { escapeHtml, formatCurrency } from "../../js/helpers.js";
import { alertSuccess, alertError } from "../../js/alerts.js";

const board = document.getElementById("kitchen-board");
const statusEl = document.getElementById("kitchen-status");
let pedidosCache = [];
let knownPedidoIds = new Set();
let tabActiva = "proceso";

const playNewOrderSound = () => {
  const audio = document.getElementById("new-order-sound");
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => beepKitchen());
    return;
  }
  beepKitchen();
};

const beepKitchen = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 200);
  } catch {
    /* sin audio */
  }
};

const estadoBadge = (estado) => {
  const colors = {
    pendiente: "bg-red-600",
    preparando: "bg-yellow-600",
    listo: "bg-green-600"
  };
  return colors[estado] ?? "bg-zinc-600";
};

const pedidosProceso = () =>
  pedidosCache.filter((p) => p.estado === "pendiente" || p.estado === "preparando");

const pedidosListos = () => pedidosCache.filter((p) => p.estado === "listo");

const renderProductos = (productos = []) => {
  if (!productos.length) return `<p class="text-zinc-500 text-sm">Sin detalle de productos</p>`;
  return productos
    .map((item) => {
      const extra = item.esAdicional ? '<span class="text-yellow-400 text-xs ml-1">[Adicional]</span>' : "";
      const nota = item.notas ? `<p class="text-yellow-300 text-sm mt-0.5">↳ ${escapeHtml(item.notas)}</p>` : "";
      return `
        <li class="border-b border-zinc-800 py-2 last:border-0">
          <div class="flex justify-between gap-2">
            <span><strong>${item.cantidad ?? 1}x</strong> ${escapeHtml(item.nombre)}${extra}</span>
            <span class="text-zinc-400">${formatCurrency(item.subtotal ?? item.precio ?? 0)}</span>
          </div>
          ${nota}
        </li>
      `;
    })
    .join("");
};

const renderCard = (p, modo) => {
  const badge = estadoBadge(p.estado);
  const agregado = p.esAgregado
    ? '<p class="text-yellow-400 text-sm font-bold uppercase tracking-wide mb-1">Nuevo agregado</p>'
    : "";
  const horaListo =
    modo === "listos"
      ? `<p class="text-green-400 text-sm font-semibold mt-1">Listo: ${escapeHtml(p.horaListo ?? p.hora ?? "—")}</p>`
      : "";

  const botones =
    modo === "listos"
      ? `<button type="button" class="btn-secondary w-full py-3 min-h-[48px]" data-pedido-id="${p.id}" data-next="entregado">Entregado</button>`
      : `
        <div class="flex flex-wrap gap-2">
          ${p.estado === "pendiente" ? `<button type="button" class="btn-secondary flex-1 py-3 min-h-[48px]" data-pedido-id="${p.id}" data-next="preparando">Preparando</button>` : ""}
          <button type="button" class="btn-primary flex-1 py-3 min-h-[48px]" data-pedido-id="${p.id}" data-next="listo">Listo</button>
        </div>`;

  return `
    <article class="kitchen-card rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-5 ${p.estado === "pendiente" ? "ring-2 ring-orange-500" : ""} ${modo === "listos" ? "border-green-700/50" : ""}">
      <div class="flex justify-between items-start gap-2 mb-3">
        <div>
          ${agregado}
          <h3 class="text-2xl font-bold">${escapeHtml(p.mesa ?? "Mesa")}</h3>
          <p class="text-zinc-400 text-sm">${escapeHtml(p.hora ?? "")} · ${escapeHtml(p.fecha ?? "")}</p>
          ${horaListo}
        </div>
        <span class="${badge} px-3 py-1 rounded-lg text-xs font-bold uppercase">${p.estado}</span>
      </div>
      <p class="text-sm text-zinc-300 mb-2">Mesero: <strong>${escapeHtml(p.mesero ?? "—")}</strong></p>
      ${p.notas ? `<p class="text-yellow-300 text-sm mb-3 p-2 bg-yellow-500/10 rounded-lg">Nota: ${escapeHtml(p.notas)}</p>` : ""}
      <ul class="mb-4 max-h-48 overflow-y-auto">${renderProductos(p.productos)}</ul>
      ${botones}
    </article>
  `;
};

const renderBoard = () => {
  if (!board) return;

  const enProceso = pedidosProceso();
  const listos = pedidosListos();
  const lista = tabActiva === "listos" ? listos : enProceso;

  document.getElementById("kitchen-tab-proceso-count")?.replaceChildren(
    document.createTextNode(String(enProceso.length))
  );
  document.getElementById("kitchen-tab-listos-count")?.replaceChildren(
    document.createTextNode(String(listos.length))
  );

  if (statusEl) {
    statusEl.textContent =
      tabActiva === "listos"
        ? `${listos.length} listo(s)`
        : `${enProceso.length} en proceso`;
  }

  if (!lista.length) {
    board.innerHTML = `
      <p class="col-span-full text-center text-zinc-500 text-xl py-20">
        ${tabActiva === "listos" ? "No hay pedidos listos." : "Sin pedidos en preparación."}<br/>
        <span class="text-sm">${tabActiva === "listos" ? "Los pedidos marcados como Listo aparecerán aquí." : "Los nuevos pedidos desde Mesas aparecerán al instante."}</span>
      </p>`;
    return;
  }

  board.innerHTML = lista.map((p) => renderCard(p, tabActiva === "listos" ? "listos" : "proceso")).join("");
};

const setTab = (tab) => {
  tabActiva = tab;
  document.querySelectorAll("[data-kitchen-tab]").forEach((btn) => {
    const active = btn.dataset.kitchenTab === tab;
    btn.classList.toggle("kitchen-tab-active", active);
    btn.classList.toggle("bg-orange-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("bg-zinc-800", !active);
  });
  renderBoard();
};

document.querySelectorAll("[data-kitchen-tab]")?.forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.kitchenTab));
});

board?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-pedido-id]");
  if (!btn) return;
  const id = btn.dataset.pedidoId;
  const next = btn.dataset.next;
  if (!id || !next) return;
  try {
    await updatePedidoEstado(id, next);
    if (next === "listo") setTab("listos");
    alertSuccess(`Pedido → ${next}`);
  } catch (error) {
    console.error("[cocina] Error estado:", error);
    alertError(error.message);
  }
});

protectModule("cocina", (profile) => {
  buildSidebar(profile.rol);
  setTab("proceso");

  listenPedidosCocina((pedidos) => {
    const nuevos = pedidos.filter((p) => !knownPedidoIds.has(p.id) && p.estado === "pendiente");
    if (knownPedidoIds.size > 0 && nuevos.length) {
      playNewOrderSound();
    }
    knownPedidoIds = new Set(pedidos.map((p) => p.id));
    pedidosCache = pedidos;
    renderBoard();
  });
});
