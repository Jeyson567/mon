import { listenMesas } from "../../firebase/firestore.js";
import { protectModule, getCurrentProfile } from "../../js/guard.js";
import { buildSidebar } from "../../components/sidebar.js";
import { estadoMesaClass } from "../../js/ui.js";
import { formatCurrency, escapeHtml } from "../../js/helpers.js";
import { initPedidoMesa, abrirVistaPedido } from "./pedido-mesa.js";

const grid = document.getElementById("mesas-grid");
const viewMesas = document.getElementById("view-mesas");
const viewPedido = document.getElementById("view-pedido");

let mesasCache = [];
let profileCache = null;

export const mostrarMesas = () => {
  viewPedido?.classList.add("hidden");
  viewMesas?.classList.remove("hidden");
};

export const mostrarPedido = () => {
  viewMesas?.classList.add("hidden");
  viewPedido?.classList.remove("hidden");
};

const estadoLabel = (estado) => {
  const map = {
    libre: "Libre",
    ocupada: "Ocupada",
    cobrando: "Cobrando",
    pagada: "Pagada",
    reservada: "Reservada"
  };
  return map[estado] ?? estado;
};

const renderMesas = () => {
  if (!grid) return;

  const activas = mesasCache.filter((m) => m?.activa !== false);

  if (!activas.length) {
    grid.innerHTML = `<p class="text-zinc-500 col-span-full text-center py-12">No hay mesas. El administrador debe crearlas.</p>`;
    return;
  }

  grid.innerHTML = activas
    .map((mesa) => {
      const cls = estadoMesaClass(mesa.estado ?? "libre");
      const lineas = mesa.carrito?.length ?? 0;
      return `
        <button type="button" class="mesa-card-btn table-card ${cls}" data-mesa-id="${mesa.id}" aria-label="Abrir pedido ${escapeHtml(mesa.numero)}">
          <div class="flex justify-between items-start">
            <h3 class="text-xl font-bold">${escapeHtml(mesa.numero ?? "Mesa")}</h3>
            <span class="text-xs uppercase px-2 py-1 rounded-lg bg-zinc-800/80">${estadoLabel(mesa.estado)}</span>
          </div>
          <p class="text-2xl font-bold text-orange-400 mt-3">${formatCurrency(mesa.total ?? 0)}</p>
          <p class="text-sm text-zinc-400 mt-1">${lineas} producto(s) en pedido</p>
          <p class="mesa-tap-hint">
            <span aria-hidden="true">→</span> Tocar para tomar pedido
          </p>
        </button>
      `;
    })
    .join("");
};

grid?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mesa-id]");
  if (!btn) return;
  const mesaId = btn.dataset.mesaId;
  const mesa = mesasCache.find((m) => m.id === mesaId);
  if (!mesa) return;
  abrirVistaPedido(mesa, profileCache);
});

document.getElementById("btn-volver-mesas")?.addEventListener("click", mostrarMesas);

protectModule("mesas", (profile) => {
  profileCache = profile;
  buildSidebar(profile.rol);
  initPedidoMesa({ profile, onVolver: mostrarMesas });
});

listenMesas((mesas) => {
  mesasCache = mesas.filter(Boolean);
  renderMesas();
});
