import {
  listenCategorias,
  listenProductos,
  listenInventario,
  updateMesa,
  savePedido,
  cancelarMesa
} from "../../firebase/firestore.js";
import { openFormModal } from "../../components/modal.js";
import { formatCurrency, escapeHtml, safeText, toNumber, normalizeRecord } from "../../js/helpers.js";
import { reembolsarInventarioCarritoMesa } from "../../js/inventario-refund.js";
import { isAdminRole } from "../../firebase/permissions.js";
import {
  newLineaId,
  normalizarCarrito,
  normalizarLineaCarrito,
  lineasPendientesEnvio,
  lineaEstaEnviada,
  etiquetaEstadoCocina,
  claseBadgeCocina
} from "../../js/pedido-lineas.js";
import { alertSuccess, alertError } from "../../js/alerts.js";
import { mostrarPedido } from "./mesero.js";

let mesaActiva = null;
let profileActivo = null;
let categorias = [];
let productos = [];
let inventarioItems = [];
let categoriaActiva = "todas";
let busquedaProducto = "";
let carrito = [];
let onVolverCallback = null;

const calcularTotal = (lineas) =>
  lineas.reduce((sum, l) => sum + toNumber(l.subtotal, 0), 0);

const recalcularLinea = (linea) => ({
  ...linea,
  subtotal: toNumber(linea.precio, 0) * toNumber(linea.cantidad, 1)
});

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

let historialEliminaciones = [];

const syncMesaFirestore = async () => {
  if (!mesaActiva?.id) return;
  const total = calcularTotal(carrito);
  const payload = { carrito, total, historialEliminaciones };
  if (mesaActiva.estado !== "libre") {
    payload.meseroAsignado = profileActivo?.nombre ?? mesaActiva.meseroAsignado ?? "";
  }
  await updateMesa(mesaActiva.id, payload);
  mesaActiva = { ...mesaActiva, carrito, total, historialEliminaciones };
};

const registrarEliminacionHistorial = (linea) => {
  const entrada = {
    tipo: "eliminar_producto",
    producto: linea.nombre,
    cantidad: linea.cantidad ?? 1,
    precio: linea.precio,
    subtotal: linea.subtotal,
    esAdicional: !!linea.esAdicional,
    enviadoCocina: !!linea.enviadoCocina,
    estadoCocina: linea.estadoCocina ?? null,
    lineaId: linea.lineaId ?? null,
    mesa: mesaActiva?.numero ?? "",
    mesero: profileActivo?.nombre ?? "",
    fecha: new Date().toLocaleDateString("es-GT"),
    hora: new Date().toLocaleTimeString("es-GT")
  };
  historialEliminaciones = [...(historialEliminaciones ?? []), entrada].slice(-100);
  console.log("[pedido] Producto eliminado — historial:", entrada);
};

const eliminarLineaPedido = async (index) => {
  const linea = carrito[index];
  if (!linea) return;

  const yaEnCocina = lineaEstaEnviada(linea);

  if (yaEnCocina) {
    const ok = window.confirm(
      "Este producto ya fue enviado a cocina. ¿Desea eliminarlo del pedido?"
    );
    if (!ok) return;
    registrarEliminacionHistorial(linea);
  }

  const nombre = linea.nombre;
  carrito.splice(index, 1);
  renderLineas();
  try {
    await syncMesaFirestore();
    if (yaEnCocina) alertSuccess(`${nombre} eliminado del pedido`);
  } catch (e) {
    alertError(e.message);
  }
};

const renderHeader = () => {
  const titulo = document.getElementById("pedido-mesa-titulo");
  const estado = document.getElementById("pedido-mesa-estado");
  const mesero = document.getElementById("pedido-mesa-mesero");
  const totalEl = document.getElementById("pedido-mesa-total");

  if (titulo) titulo.textContent = mesaActiva?.numero ?? "Mesa";
  if (estado) estado.textContent = mesaActiva?.estado ?? "—";
  if (mesero) mesero.textContent = mesaActiva?.meseroAsignado || profileActivo?.nombre || "—";
  if (totalEl) totalEl.textContent = formatCurrency(calcularTotal(carrito));
};

const renderLineas = () => {
  const container = document.getElementById("pedido-lineas");
  if (!container) return;

  if (!carrito.length) {
    container.innerHTML = `
      <p class="text-zinc-500 text-center py-8 border border-dashed border-zinc-700 rounded-xl">
        Sin productos.<br/>
        <span class="text-sm">Selecciona del menú →</span>
      </p>`;
    renderHeader();
    return;
  }

  container.innerHTML = carrito
    .map((linea, index) => {
      const badge = linea.esAdicional
        ? '<span class="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-0.5 rounded ml-1">Adicional</span>'
        : "";
      const estadoLbl = etiquetaEstadoCocina(linea);
      const estadoBadge = estadoLbl
        ? `<span class="text-xs px-2 py-0.5 rounded ml-1 ${claseBadgeCocina(linea)}">${estadoLbl}</span>`
        : "";
      const bloqueado = lineaEstaEnviada(linea);
      const qtyControls = bloqueado
        ? `<span class="text-sm text-zinc-400">Cant. ${linea.cantidad}</span>`
        : linea.esAdicional
          ? `<span class="text-sm text-zinc-400">Cant. ${linea.cantidad}</span>`
          : `
        <button type="button" class="btn-secondary px-3 py-1 text-lg min-h-[44px] min-w-[44px]" data-qty-minus="${index}" aria-label="Menos">−</button>
        <span class="min-w-[2rem] text-center font-bold text-lg">${linea.cantidad}</span>
        <button type="button" class="btn-secondary px-3 py-1 text-lg min-h-[44px] min-w-[44px]" data-qty-plus="${index}" aria-label="Más">+</button>`;

      const btnEliminar = `
        <button type="button" class="btn-eliminar-linea shrink-0" data-eliminar-linea="${index}" aria-label="Eliminar ${escapeHtml(linea.nombre)}">
          <span aria-hidden="true">🗑</span> Eliminar
        </button>`;

      return `
      <div class="linea-pedido ${linea.esAdicional ? "border-yellow-600/40" : ""} ${bloqueado ? "border-zinc-600/80" : ""}" data-linea-index="${index}">
        <div class="linea-pedido-row">
          <div class="linea-pedido-info min-w-0 flex-1">
            <p class="font-bold leading-tight truncate">${escapeHtml(linea.nombre)}${badge}${estadoBadge}</p>
            <p class="text-sm text-zinc-400 mt-0.5">${linea.cantidad > 1 ? `${linea.cantidad} × ` : ""}${formatCurrency(linea.precio)}</p>
          </div>
          <p class="linea-pedido-precio font-bold text-orange-400 shrink-0">${formatCurrency(linea.subtotal)}</p>
          ${btnEliminar}
        </div>
        <div class="flex items-center gap-2 mt-2 flex-wrap">
          ${qtyControls}
        </div>
        ${linea.notas ? `<p class="text-xs text-zinc-400 mt-1">${escapeHtml(linea.notas)}</p>` : ""}
        ${
          !linea.esAdicional && !bloqueado
            ? `<input type="text" class="input-base mt-2 text-sm" data-nota-linea="${index}" placeholder="Nota: sin hielo, bien cocido..." value="${escapeHtml(linea.notas ?? "")}" />`
            : ""
        }
      </div>
    `;
    })
    .join("");

  renderHeader();
};

const renderCategorias = () => {
  const nav = document.getElementById("pedido-categorias");
  if (!nav) return;

  const nombres = categorias.map((c) => c.nombre).filter(Boolean);
  const tabs = ["todas", ...nombres];

  nav.innerHTML = tabs
    .map((nombre) => {
      const active = categoriaActiva === nombre;
      return `<button type="button" class="cat-tab ${active ? "active" : ""}" data-cat="${escapeHtml(nombre)}">${nombre === "todas" ? "Todas" : escapeHtml(nombre)}</button>`;
    })
    .join("");

  nav.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaActiva = btn.dataset.cat;
      renderCategorias();
      renderProductosMenu();
    });
  });
};

const productoCoincideBusqueda = (p) => {
  if (!busquedaProducto.trim()) return true;
  const q = norm(busquedaProducto);
  return norm(p.nombre).includes(q) || norm(p.categoria).includes(q);
};

const renderProductosMenu = () => {
  const grid = document.getElementById("pedido-productos");
  if (!grid) return;

  const list = productos.filter((p) => {
    if (p.disponible === false) return false;
    if (!productoCoincideBusqueda(p)) return false;
    if (categoriaActiva === "todas") return true;
    return p.categoria === categoriaActiva;
  });

  if (!list.length) {
    grid.innerHTML = `<p class="text-zinc-500 col-span-full text-center py-8">${
      busquedaProducto.trim() ? "Sin coincidencias para tu búsqueda." : "No hay productos en esta categoría."
    }</p>`;
    return;
  }

  grid.innerHTML = list
    .map(
      (p) => `
      <button type="button" class="producto-pos-btn" data-add-producto="${p.id}">
        <p class="font-bold text-base leading-tight">${escapeHtml(p.nombre)}</p>
        <p class="text-xs text-zinc-500">${escapeHtml(p.categoria ?? "")}</p>
        <p class="text-orange-400 text-lg font-bold mt-2">${formatCurrency(p.precio)}</p>
        <p class="text-xs text-zinc-500 mt-1">+ Agregar</p>
      </button>
    `
    )
    .join("");
};

const agregarProducto = (productoId) => {
  const p = productos.find((x) => x.id === productoId);
  if (!p) return;

  const existente = carrito.findIndex(
    (l) =>
      l.productoId === p.id &&
      !l.esAdicional &&
      !l.notas &&
      !lineaEstaEnviada(l)
  );
  if (existente >= 0) {
    carrito[existente].cantidad = toNumber(carrito[existente].cantidad, 1) + 1;
    carrito[existente] = recalcularLinea(carrito[existente]);
  } else {
    carrito.push(
      normalizarLineaCarrito(
        recalcularLinea({
          lineaId: newLineaId(),
          productoId: p.id,
          nombre: p.nombre,
          precio: p.precio,
          cantidad: 1,
          notas: "",
          subtotal: p.precio,
          enviadoCocina: false,
          estadoCocina: null
        })
      )
    );
  }

  renderLineas();
  syncMesaFirestore().catch((e) => alertError(e.message));
  alertSuccess(`${p.nombre} agregado`);
};

const inventarioSelectHtml = (selectedId = "") => {
  const opts = inventarioItems
    .map(
      (item) =>
        `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.nombre)} (stock: ${item.stock ?? 0})</option>`
    )
    .join("");
  return `<select name="inventarioId" class="input-base" data-inv-select><option value="">— Seleccionar —</option>${opts}</select>`;
};

const openProductoAdicionalModal = () => {
  openFormModal({
    title: "Producto adicional",
    size: "md",
    submitLabel: "Agregar al pedido",
    formHtml: `
      <div>
        <label class="block text-sm mb-1">Nombre del producto</label>
        <input name="nombre" class="input-base" required maxlength="120" placeholder="Ej: Refresco extra" />
      </div>
      <div>
        <label class="block text-sm mb-1">Precio (Q0 – Q20,000)</label>
        <input name="precio" type="number" min="0" max="20000" step="0.01" class="input-base" required value="0" />
      </div>
      <div>
        <label class="block text-sm mb-1">Comentario</label>
        <input name="comentario" class="input-base" maxlength="200" placeholder="Opcional" />
      </div>
      <div>
        <label class="block text-sm mb-1">Descontar inventario</label>
        <select name="descontarInventario" class="input-base" data-toggle-inv>
          <option value="no">No</option>
          <option value="si">Sí</option>
        </select>
      </div>
      <div data-inv-fields class="hidden space-y-3 border border-zinc-700 rounded-xl p-3">
        <div>
          <label class="block text-sm mb-1">Producto inventario</label>
          ${inventarioSelectHtml()}
        </div>
        <div>
          <label class="block text-sm mb-1">Cantidad a descontar</label>
          <input name="cantidadInventario" type="number" min="0.01" step="0.01" class="input-base" value="1" />
        </div>
      </div>
    `,
    onSubmit: async (fd) => {
      const nombre = safeText(fd.get("nombre"));
      const precio = Math.min(20000, Math.max(0, toNumber(fd.get("precio"), 0)));
      const comentario = safeText(fd.get("comentario"));
      const descontar = fd.get("descontarInventario") === "si";

      if (!nombre) throw new Error("Indica el nombre del producto");

      const linea = normalizarLineaCarrito(
        recalcularLinea({
          lineaId: newLineaId(),
          esAdicional: true,
          nombre,
          precio,
          cantidad: 1,
          notas: comentario,
          subtotal: precio,
          enviadoCocina: false,
          estadoCocina: null
        })
      );

      if (descontar) {
        const inventarioId = fd.get("inventarioId");
        const cantidadInv = Math.max(0.01, toNumber(fd.get("cantidadInventario"), 1));
        if (!inventarioId) throw new Error("Selecciona un producto de inventario");
        linea.inventarioDescuento = { inventarioId, cantidad: cantidadInv, aplicado: false };
      }

      carrito.push(linea);
      renderLineas();
      await syncMesaFirestore();
      alertSuccess("Producto adicional agregado");
    }
  });

  setTimeout(() => {
    const toggle = document.querySelector("[data-toggle-inv]");
    const section = document.querySelector("[data-inv-fields]");
    const invSelect = document.querySelector("[data-inv-select]");
    const invCantidad = document.querySelector("[name=cantidadInventario]");

    const refreshInv = () => {
      const si = toggle?.value === "si";
      section?.classList.toggle("hidden", !si);
      if (invSelect) invSelect.required = si;
      if (invCantidad) invCantidad.required = si;
    };
    toggle?.addEventListener("change", refreshInv);
    refreshInv();
  }, 30);
};

export const abrirVistaPedido = (mesa, profile) => {
  mesaActiva = normalizeRecord(mesa);
  profileActivo = profile;
  carrito = normalizarCarrito(mesaActiva.carrito);
  historialEliminaciones = Array.isArray(mesaActiva.historialEliminaciones)
    ? [...mesaActiva.historialEliminaciones]
    : [];
  categoriaActiva = "todas";
  busquedaProducto = "";

  const buscarInput = document.getElementById("pedido-buscar-producto");
  if (buscarInput) buscarInput.value = "";

  const notasEl = document.getElementById("pedido-notas-mesa");
  if (notasEl) notasEl.value = mesaActiva.notasPedido ?? "";

  renderHeader();
  renderLineas();
  renderCategorias();
  renderProductosMenu();
  renderCancelarMesaBtn();
  mostrarPedido();
};

const puedeCancelarMesa = (profile) => {
  const rol = String(profile?.rol ?? "").toLowerCase();
  return isAdminRole(rol) || rol === "caja" || rol === "mesero";
};

const renderCancelarMesaBtn = () => {
  const btn = document.getElementById("btn-cancelar-mesa");
  if (!btn) return;
  const show = puedeCancelarMesa(profileActivo);
  btn.classList.toggle("hidden", !show);
};

const openCancelarMesaModal = () => {
  if (!mesaActiva?.id) return;
  openFormModal({
    title: `Cancelar — ${mesaActiva.numero ?? "Mesa"}`,
    size: "md",
    submitLabel: "Confirmar cancelación",
    formHtml: `
      <p class="text-zinc-400 text-sm">Se cerrará la mesa, se limpiará el pedido y se devolverá el inventario descontado.</p>
      <div>
        <label class="block text-sm mb-1">Motivo de cancelación</label>
        <textarea name="motivo" class="input-base min-h-[80px]" required placeholder="Ej: cliente se retiró, error en pedido..."></textarea>
      </div>
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmar" required class="mt-1" />
        <span>Confirmo que deseo cancelar esta mesa</span>
      </label>
    `,
    onSubmit: async (fd) => {
      const motivo = safeText(fd.get("motivo"));
      if (!motivo) throw new Error("Indica el motivo de cancelación");
      const usuario = profileActivo?.nombre ?? profileActivo?.email ?? "usuario";

      await reembolsarInventarioCarritoMesa({
        carrito,
        usuario,
        motivo: `Cancelación mesa ${mesaActiva.numero}: ${motivo}`,
        inventarioItems: inventarioItems
      });
      await cancelarMesa({ mesaId: mesaActiva.id, motivo, usuario });

      carrito = [];
      mesaActiva = null;
      alertSuccess("Mesa cancelada");
      onVolverCallback?.();
    }
  });
};

const enviarCocina = async () => {
  const pendientes = lineasPendientesEnvio(carrito);
  if (!pendientes.length) {
    alertError("No hay productos nuevos para enviar a cocina");
    return;
  }

  const notasMesa = document.getElementById("pedido-notas-mesa")?.value ?? "";
  const yaHabiaEnviados = carrito.some((l) => l.enviadoCocina);

  const productosEnvio = pendientes.map((l) => ({
    ...l,
    enviadoCocina: true,
    estadoCocina: "pendiente"
  }));

  const lineaIds = productosEnvio.map((l) => l.lineaId);

  await savePedido({
    mesa: mesaActiva.numero,
    mesaId: mesaActiva.id,
    productos: productosEnvio,
    lineaIds,
    esAgregado: yaHabiaEnviados,
    notas: safeText(notasMesa),
    estado: "pendiente",
    mesero: profileActivo?.nombre ?? "",
    prioridad: "normal",
    fecha: new Date().toLocaleDateString("es-GT"),
    hora: new Date().toLocaleTimeString("es-GT"),
    timestamp: Date.now()
  });

  const idsEnviados = new Set(lineaIds);
  carrito = carrito.map((l) =>
    idsEnviados.has(l.lineaId)
      ? { ...l, enviadoCocina: true, estadoCocina: "pendiente" }
      : l
  );

  await updateMesa(mesaActiva.id, {
    carrito,
    total: calcularTotal(carrito),
    estado: "ocupada",
    meseroAsignado: profileActivo?.nombre ?? mesaActiva.meseroAsignado ?? "",
    fechaApertura: mesaActiva.fechaApertura ?? new Date().toISOString(),
    notasPedido: safeText(notasMesa),
    ultimoEnvioCocina: new Date().toISOString()
  });
  mesaActiva = {
    ...mesaActiva,
    carrito,
    total: calcularTotal(carrito),
    estado: "ocupada",
    meseroAsignado: profileActivo?.nombre ?? mesaActiva.meseroAsignado ?? ""
  };

  renderLineas();
  const n = pendientes.length;
  alertSuccess(
    yaHabiaEnviados
      ? `Nuevo agregado enviado (${n} producto${n > 1 ? "s" : ""})`
      : `Pedido enviado a cocina (${n} producto${n > 1 ? "s" : ""})`
  );
};

const irCobrar = async () => {
  if (!carrito.length && !(mesaActiva?.total > 0)) {
    alertError("No hay consumo para cobrar");
    return;
  }
  await syncMesaFirestore();
  await updateMesa(mesaActiva.id, { estado: "cobrando" });
  window.location.href = "/modules/caja/caja.html";
};

export const initPedidoMesa = ({ profile, onVolver }) => {
  onVolverCallback = onVolver;
  profileActivo = profile;

  listenCategorias((items) => {
    categorias = items.filter(Boolean);
    if (document.getElementById("view-pedido") && !document.getElementById("view-pedido").classList.contains("hidden")) {
      renderCategorias();
    }
  });

  listenProductos((items) => {
    productos = items.filter(Boolean);
    if (document.getElementById("view-pedido") && !document.getElementById("view-pedido").classList.contains("hidden")) {
      renderProductosMenu();
    }
  });

  listenInventario((items) => {
    inventarioItems = items.filter(Boolean);
  });

  document.getElementById("pedido-buscar-producto")?.addEventListener("input", (e) => {
    busquedaProducto = e.target.value;
    renderProductosMenu();
  });

  document.getElementById("btn-producto-adicional")?.addEventListener("click", () => {
    if (!mesaActiva) {
      alertError("Abre una mesa primero");
      return;
    }
    openProductoAdicionalModal();
  });

  document.getElementById("pedido-productos")?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-add-producto]")?.dataset.addProducto;
    if (id) agregarProducto(id);
  });

  document.getElementById("pedido-lineas")?.addEventListener("click", (e) => {
    const minus = e.target.closest("[data-qty-minus]");
    const plus = e.target.closest("[data-qty-plus]");
    const remove = e.target.closest("[data-qty-remove]");

    if (minus) {
      const i = Number(minus.dataset.qtyMinus);
      if (!carrito[i] || carrito[i].esAdicional || lineaEstaEnviada(carrito[i])) return;
      if (carrito[i].cantidad > 1) {
        carrito[i].cantidad--;
        carrito[i] = recalcularLinea(carrito[i]);
      } else {
        carrito.splice(i, 1);
      }
      renderLineas();
      syncMesaFirestore().catch(() => {});
    }
    if (plus) {
      const i = Number(plus.dataset.qtyPlus);
      if (!carrito[i] || carrito[i].esAdicional || lineaEstaEnviada(carrito[i])) return;
      carrito[i].cantidad++;
      carrito[i] = recalcularLinea(carrito[i]);
      renderLineas();
      syncMesaFirestore().catch(() => {});
    }
    if (remove) {
      const i = Number(remove.dataset.qtyRemove);
      eliminarLineaPedido(i).catch((err) => alertError(err.message));
      return;
    }

    const eliminar = e.target.closest("[data-eliminar-linea]");
    if (eliminar) {
      eliminarLineaPedido(Number(eliminar.dataset.eliminarLinea)).catch((err) =>
        alertError(err.message)
      );
    }
  });

  document.getElementById("pedido-lineas")?.addEventListener("change", (e) => {
    const input = e.target.closest("[data-nota-linea]");
    if (!input) return;
    const i = Number(input.dataset.notaLinea);
    carrito[i].notas = input.value;
    syncMesaFirestore().catch(() => {});
  });

  document.getElementById("btn-enviar-cocina")?.addEventListener("click", () => {
    enviarCocina().catch((err) => alertError(err.message));
  });

  document.getElementById("btn-cobrar-mesa")?.addEventListener("click", () => {
    irCobrar().catch((err) => alertError(err.message));
  });

  document.getElementById("btn-cancelar-mesa")?.addEventListener("click", () => {
    openCancelarMesaModal();
  });
};
