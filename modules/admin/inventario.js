import {
  listenInventario,
  listenMovimientosInventario,
  saveInventarioItem,
  removeInventarioItem,
  ajustarStockInventario
} from "../../firebase/firestore.js";
import { openFormModal } from "../../components/modal.js";
import { escapeHtml, safeText, toNumber, normalizeRecord, formatCurrency } from "../../js/helpers.js";
import { alertSuccess } from "../../js/alerts.js";
import { getCurrentProfile } from "../../js/guard.js";
import { sanitizeDocs, findById } from "./admin-safe.js";

let inventarioCache = [];
let movimientosCache = [];
let listenerStarted = false;

const TIPOS = {
  cocina: "cocina",
  bar: "bar"
};

const tipoLabel = (tipo) => (tipo === TIPOS.bar ? "Bar" : "Cocina");
const normalizeTipo = (tipo) => (tipo === TIPOS.bar ? TIPOS.bar : TIPOS.cocina);

const formFields = (raw, tipoDefault = TIPOS.cocina) => {
  const data = normalizeRecord(raw);
  const tipo = normalizeTipo(data.tipoInventario ?? tipoDefault);
  return `
  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="block text-sm mb-1">Código</label>
      <input name="codigo" class="input-base" value="${escapeHtml(data.codigo ?? "")}" placeholder="INV-001" />
    </div>
    <div>
      <label class="block text-sm mb-1">Tipo inventario</label>
      <select name="tipoInventario" class="input-base">
        <option value="cocina" ${tipo === "cocina" ? "selected" : ""}>Cocina</option>
        <option value="bar" ${tipo === "bar" ? "selected" : ""}>Bar</option>
      </select>
    </div>
  </div>
  <div>
    <label class="block text-sm mb-1">Nombre</label>
    <input name="nombre" class="input-base" required value="${escapeHtml(data.nombre ?? "")}" />
  </div>
  <div>
    <label class="block text-sm mb-1">Categoría</label>
    <input name="categoria" class="input-base" value="${escapeHtml(data.categoria ?? "")}" placeholder="Carnes, Bebidas..." />
  </div>
  <div class="grid grid-cols-3 gap-3">
    <div>
      <label class="block text-sm mb-1">Existencia</label>
      <input name="stock" type="number" min="0" step="0.01" class="input-base" value="${data.stock ?? 0}" />
    </div>
    <div>
      <label class="block text-sm mb-1">Stock mínimo</label>
      <input name="stockMinimo" type="number" min="0" class="input-base" value="${data.stockMinimo ?? 0}" />
    </div>
    <div>
      <label class="block text-sm mb-1">Costo</label>
      <input name="costo" type="number" min="0" step="0.01" class="input-base" value="${data.costo ?? 0}" />
    </div>
  </div>
  <div>
    <label class="block text-sm mb-1">Unidad</label>
    <input name="unidad" class="input-base" value="${escapeHtml(data.unidad ?? "unidades")}" />
  </div>
  <label class="flex items-center gap-2">
    <input type="checkbox" name="activo" ${data.activo !== false ? "checked" : ""} />
    <span>Activo</span>
  </label>
`;
};

const stockForm = (raw) => {
  const item = normalizeRecord(raw);
  if (!item.id) {
    console.error("[inventario] stockForm: item inválido", raw);
    return `<p class="text-red-400">Error: producto no válido</p>`;
  }
  return `
  <p class="text-sm text-zinc-400 mb-2">${escapeHtml(item.nombre ?? "Producto")} — Stock: <strong>${item.stock ?? 0}</strong></p>
  <div>
    <label class="block text-sm mb-1">Tipo</label>
    <select name="tipoMovimiento" class="input-base">
      <option value="entrada">Entrada (+)</option>
      <option value="salida">Salida (-)</option>
      <option value="ajuste">Ajuste (valor exacto)</option>
    </select>
  </div>
  <div>
    <label class="block text-sm mb-1">Cantidad</label>
    <input name="cantidad" type="number" min="0" step="0.01" class="input-base" required />
  </div>
  <div>
    <label class="block text-sm mb-1">Motivo</label>
    <input name="motivo" class="input-base" placeholder="Compra, merma..." />
  </div>
`;
};

const statsCard = (label, value, tone = "text-zinc-100") => `
  <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-soft">
    <p class="text-zinc-400 text-sm">${label}</p>
    <p class="text-2xl font-bold ${tone}">${value}</p>
  </article>
`;

const renderDashboard = (tipo, items) => {
  const root = document.getElementById(`inventario-${tipo}-dashboard`);
  if (!root) return;
  const activos = items.filter((item) => item.activo !== false);
  const stockBajo = activos.filter((item) => toNumber(item.stock, 0) <= toNumber(item.stockMinimo, 0));
  const agotados = activos.filter((item) => toNumber(item.stock, 0) <= 0);
  const valor = activos.reduce((sum, item) => sum + toNumber(item.stock, 0) * toNumber(item.costo, 0), 0);
  root.innerHTML = [
    statsCard("Productos", activos.length, "text-blue-300"),
    statsCard("Valor inventario", formatCurrency(valor), "text-green-300"),
    statsCard("Stock bajo", stockBajo.length, stockBajo.length ? "text-yellow-300" : "text-green-300"),
    statsCard("Agotados", agotados.length, agotados.length ? "text-red-300" : "text-green-300")
  ].join("");
};

const renderMovimientos = (tipo) => {
  const tbody = document.getElementById(`movimientos-inventario-${tipo}`);
  if (!tbody) return;
  const rows = movimientosCache
    .filter((m) => normalizeTipo(m.tipoInventario) === tipo)
    .slice(0, 50);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-zinc-500 py-8 text-center">Sin movimientos.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (m) => `
      <tr>
        <td>${escapeHtml(`${m.fecha ?? ""} ${m.hora ?? ""}`.trim())}</td>
        <td>${escapeHtml(m.producto ?? "—")}</td>
        <td>${escapeHtml(m.tipoMovimiento ?? "—")}</td>
        <td>${m.cantidad ?? 0}</td>
        <td>${m.stockAnterior ?? "—"}</td>
        <td>${m.stockNuevo ?? "—"}</td>
        <td>${escapeHtml(m.usuario ?? "—")}</td>
        <td>${escapeHtml(m.motivo ?? "—")}</td>
      </tr>
    `
    )
    .join("");
};

const renderTipo = (tipo) => {
  const tbody = document.getElementById(`lista-inventario-${tipo}`);
  if (!tbody) return;

  const items = inventarioCache.filter((item) => normalizeTipo(item.tipoInventario) === tipo);
  renderDashboard(tipo, items);
  renderMovimientos(tipo);

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-zinc-500 py-8 text-center">Sin inventario ${tipoLabel(tipo).toLowerCase()}.</td></tr>`;
    return;
  }

  tbody.innerHTML = items
    .map((item) => {
      if (!item?.id) return "";
      const bajo = toNumber(item.stock, 0) <= toNumber(item.stockMinimo, 0);
      return `
      <tr class="${bajo ? "bg-red-500/10" : ""}">
        <td class="font-mono text-xs">${escapeHtml(item.codigo ?? "—")}</td>
        <td class="font-medium">${escapeHtml(item.nombre ?? "—")}</td>
        <td>${escapeHtml(item.categoria ?? "—")}</td>
        <td>${item.stock ?? 0}</td>
        <td>${escapeHtml(item.unidad ?? "")}</td>
        <td>${item.stockMinimo ?? 0}</td>
        <td>${formatCurrency(item.costo ?? 0)}</td>
        <td>${item.activo !== false ? "Activo" : "Inactivo"}</td>
        <td>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary text-sm" data-admin-action="inventario:edit" data-id="${item.id}">Editar</button>
            <button type="button" class="btn-primary text-sm" data-admin-action="inventario:stock" data-id="${item.id}">Ajustar</button>
            <button type="button" class="btn-danger text-sm" data-admin-action="inventario:delete" data-id="${item.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
};

const render = () => {
  renderTipo(TIPOS.cocina);
  renderTipo(TIPOS.bar);
};

const exportInventarioPdf = (tipo) => {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF || !window.jspdf) throw new Error("Librería PDF no disponible");
  const profile = getCurrentProfile();
  const items = inventarioCache.filter((item) => normalizeTipo(item.tipoInventario) === tipo);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const now = new Date();
  const activos = items.filter((item) => item.activo !== false);
  const stockBajo = activos.filter((item) => toNumber(item.stock, 0) <= toNumber(item.stockMinimo, 0));
  const agotados = activos.filter((item) => toNumber(item.stock, 0) <= 0);
  const valorTotal = activos.reduce((sum, item) => sum + toNumber(item.stock, 0) * toNumber(item.costo, 0), 0);

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 92, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("GRAN MONTANA", 40, 38);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Inventario ${tipoLabel(tipo)}`, 40, 58);
  doc.text(`Fecha: ${now.toLocaleDateString("es-GT")}   Hora: ${now.toLocaleTimeString("es-GT")}`, 40, 76);
  doc.text(`Usuario: ${profile?.nombre ?? profile?.email ?? "Sistema"}`, 520, 58);

  doc.autoTable({
    startY: 112,
    head: [["Código", "Producto", "Categoría", "Unidad", "Existencia", "Stock mínimo", "Costo", "Valor total"]],
    body: items.map((item) => [
      item.codigo ?? "",
      item.nombre ?? "",
      item.categoria ?? "",
      item.unidad ?? "",
      toNumber(item.stock, 0).toFixed(2),
      toNumber(item.stockMinimo, 0).toFixed(2),
      formatCurrency(item.costo ?? 0),
      formatCurrency(toNumber(item.stock, 0) * toNumber(item.costo, 0))
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const page = doc.internal.getNumberOfPages();
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("GRAN MONTANA · Reporte de inventario", 40, height - 24);
      doc.text(`Página ${page}`, width - 80, height - 24);
    }
  });

  const finalY = doc.lastAutoTable.finalY + 24;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text(`Total de productos: ${activos.length}`, 40, finalY);
  doc.text(`Valor total del inventario: ${formatCurrency(valorTotal)}`, 240, finalY);
  doc.text(`Productos con stock bajo: ${stockBajo.length}`, 500, finalY);
  doc.text(`Productos agotados: ${agotados.length}`, 680, finalY);
  doc.save(`inventario-${tipo}-${now.toISOString().slice(0, 10)}.pdf`);
};

export const openInventarioModal = (item = null, tipoDefault = TIPOS.cocina) => {
  const data = item ? normalizeRecord(item) : null;
  openFormModal({
    title: data?.id ? "Editar inventario" : `Agregar producto ${tipoLabel(tipoDefault)}`,
    formHtml: formFields(data, tipoDefault),
    onSubmit: async (fd) => {
      const nombre = safeText(fd.get("nombre"));
      if (!nombre) throw new Error("Nombre obligatorio");
      await saveInventarioItem(data?.id ?? null, {
        codigo: safeText(fd.get("codigo")),
        nombre,
        categoria: safeText(fd.get("categoria")),
        stock: toNumber(fd.get("stock"), 0),
        stockMinimo: toNumber(fd.get("stockMinimo"), 0),
        costo: toNumber(fd.get("costo"), 0),
        unidad: safeText(fd.get("unidad")) || "unidades",
        tipoInventario: normalizeTipo(fd.get("tipoInventario")),
        activo: fd.get("activo") === "on"
      });
      alertSuccess(data?.id ? "Actualizado" : "Creado");
    }
  });
};

const openStockModal = (item) => {
  if (!item?.id) {
    console.error("[inventario] openStockModal: item null");
    throw new Error("Producto de inventario no válido");
  }
  openFormModal({
    title: "Ajustar stock",
    submitLabel: "Aplicar",
    formHtml: stockForm(item),
    onSubmit: async (fd) => {
      const profile = getCurrentProfile();
      const usuario = profile?.nombre ?? profile?.correo ?? "admin";
      await ajustarStockInventario({
        inventarioId: item.id,
        cantidad: toNumber(fd.get("cantidad"), 0),
        tipoMovimiento: fd.get("tipoMovimiento"),
        motivo: safeText(fd.get("motivo")) || "Ajuste manual",
        usuario
      });
      alertSuccess("Stock actualizado");
    }
  });
};

export const handleInventarioAction = async (action, el) => {
  const id = el?.dataset?.id;

  if (action === "add") {
    openInventarioModal(null, normalizeTipo(el?.dataset?.tipoInventario));
    return;
  }

  const item = findById(inventarioCache, id, "Inventario");

  if (action === "edit") {
    if (!item) throw new Error("Item no encontrado");
    openInventarioModal(item);
    return;
  }
  if (action === "stock") {
    if (!item) throw new Error("Item no encontrado");
    openStockModal(item);
    return;
  }
  if (action === "delete") {
    if (!id || !confirm("¿Eliminar?")) return;
    await removeInventarioItem(id);
    alertSuccess("Eliminado");
  }
};

export const startInventarioListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-export-inventario]");
    if (!btn) return;
    exportInventarioPdf(normalizeTipo(btn.dataset.exportInventario));
  });
  listenInventario((items) => {
    inventarioCache = sanitizeDocs(items).map((item) => ({
      ...item,
      tipoInventario: normalizeTipo(item.tipoInventario)
    }));
    render();
    window.dispatchEvent(new CustomEvent("inventario-updated", { detail: inventarioCache }));
  });
  listenMovimientosInventario((items) => {
    movimientosCache = sanitizeDocs(items);
    render();
  });
};

export const getInventarioCache = () => inventarioCache;
