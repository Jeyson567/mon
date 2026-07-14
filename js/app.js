import { observeAuth } from "../firebase/auth.js";
import { getValidatedProfile, getFriendlyAuthError, handleAuthFailure } from "./auth-session.js";
import { buildSidebar } from "../components/sidebar.js";
import { alertError } from "./alerts.js";
import { listenVentas, listenInventario, listenPedidos } from "../firebase/firestore.js";
import { formatCurrency, escapeHtml, toNumber } from "./helpers.js";

const dashboardContent = document.getElementById("dashboard-content");
let ventasCache = [];
let inventarioCache = [];
let pedidosCache = [];
let chartVentas = null;
let chartProductos = null;
let filtroActual = "hoy";

const parseVentaDate = (venta) => {
  if (venta?.fechaRegistro?.seconds) return new Date(venta.fechaRegistro.seconds * 1000);
  const [d, m, y] = String(venta?.fecha ?? "").split("/").map(Number);
  if (d && m && y) return new Date(y, m - 1, d);
  return null;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const rangeByFilter = () => {
  const now = new Date();
  const customFrom = document.getElementById("dash-from")?.value;
  const customTo = document.getElementById("dash-to")?.value;
  if (filtroActual === "ayer") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { from: startOfDay(d), to: endOfDay(d) };
  }
  if (filtroActual === "semana") {
    const d = startOfDay(now);
    d.setDate(d.getDate() - d.getDay());
    return { from: d, to: endOfDay(now) };
  }
  if (filtroActual === "mes") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  if (filtroActual === "anio") return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
  if (filtroActual === "personalizado" && customFrom && customTo) {
    return { from: startOfDay(new Date(customFrom)), to: endOfDay(new Date(customTo)) };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
};

const ventasFiltradas = () => {
  const { from, to } = rangeByFilter();
  return ventasCache.filter((venta) => {
    if (venta?.estado && venta.estado !== "pagado") return false;
    const date = parseVentaDate(venta);
    return date && date >= from && date <= to;
  });
};

const costoVenta = (venta) =>
  (venta.inventarioDescuentos ?? []).reduce((sum, item) => {
    const inv = inventarioCache.find((x) => x.id === item.inventarioId);
    return sum + toNumber(item.cantidad, 0) * toNumber(inv?.costo, 0);
  }, 0);

const groupProductos = (ventas) => {
  const map = new Map();
  for (const venta of ventas) {
    for (const p of venta.productos ?? []) {
      const nombre = p.nombre ?? "Producto";
      const prev = map.get(nombre) ?? { nombre, cantidad: 0, total: 0 };
      prev.cantidad += toNumber(p.cantidad, 1);
      prev.total += toNumber(p.subtotal, 0);
      map.set(nombre, prev);
    }
  }
  return [...map.values()].sort((a, b) => b.cantidad - a.cantidad);
};

const groupByField = (ventas, field) => {
  const map = new Map();
  for (const venta of ventas) {
    const key = venta[field] || "Sin dato";
    const prev = map.get(key) ?? { nombre: key, total: 0, ventas: 0 };
    prev.total += toNumber(venta.total, 0);
    prev.ventas += 1;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
};

const avgKitchenMinutes = () => {
  const tiempos = pedidosCache
    .map((p) => {
      const start = toNumber(p.timestamp, 0);
      const end = toNumber(p.timestampListo, 0);
      return start && end && end > start ? (end - start) / 60000 : null;
    })
    .filter((n) => Number.isFinite(n));
  if (!tiempos.length) return 0;
  return tiempos.reduce((s, n) => s + n, 0) / tiempos.length;
};

const renderList = (items, empty = "Sin datos") => {
  if (!items.length) return `<p class="text-zinc-500 text-sm">${empty}</p>`;
  return `<div class="space-y-2">${items
    .map(
      (item) => `
      <div class="flex justify-between gap-3 rounded-xl bg-white/60 border border-slate-200 px-3 py-2">
        <span class="font-medium text-slate-700">${escapeHtml(item.nombre)}</span>
        <span class="text-slate-500">${item.cantidad ?? item.ventas ?? ""} ${item.total ? formatCurrency(item.total) : ""}</span>
      </div>`
    )
    .join("")}</div>`;
};

const renderDashboard = (profile = {}) => {
  if (!dashboardContent) return;
  const ventas = ventasFiltradas();
  const total = ventas.reduce((sum, venta) => sum + toNumber(venta.total, 0), 0);
  const subtotal = ventas.reduce((sum, venta) => sum + toNumber(venta.subtotal, 0), 0);
  const utilidad = ventas.reduce((sum, venta) => sum + toNumber(venta.subtotal, 0) - costoVenta(venta), 0);
  const productos = groupProductos(ventas);
  const meseros = groupByField(ventas, "mesero");
  const clientes = groupByField(ventas.filter((v) => v.cliente || v.huesped), "cliente");
  const barProductos = productos.filter((p) => /cerveza|licor|vino|gaseosa|jugo|agua|energizante|coctel|bar/i.test(p.nombre));

  dashboardContent.className = "space-y-5";
  dashboardContent.innerHTML = `
    <section class="rounded-3xl bg-white text-slate-800 border border-slate-200 shadow-soft p-5">
      <div class="flex flex-wrap justify-between gap-4 items-end">
        <div>
          <p class="text-sm text-slate-500 uppercase tracking-widest">Dashboard profesional</p>
          <h1 class="text-3xl font-bold">GRAN MONTANA</h1>
          <p class="text-slate-500">Usuario: ${escapeHtml(profile.nombre ?? "")} · Rol: ${escapeHtml(profile.rol ?? "")}</p>
        </div>
        <div class="flex flex-wrap gap-2 items-end">
          <select id="dash-filter" class="input-base light-input w-auto">
            <option value="hoy">Hoy</option>
            <option value="ayer">Ayer</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mes</option>
            <option value="anio">Este año</option>
            <option value="personalizado">Personalizado</option>
          </select>
          <input id="dash-from" type="date" class="input-base light-input w-auto ${filtroActual === "personalizado" ? "" : "hidden"}" />
          <input id="dash-to" type="date" class="input-base light-input w-auto ${filtroActual === "personalizado" ? "" : "hidden"}" />
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <article class="metric-card"><p>Ventas</p><strong>${formatCurrency(total)}</strong><span>${ventas.length} tickets</span></article>
      <article class="metric-card"><p>Subtotal</p><strong>${formatCurrency(subtotal)}</strong><span>Sin propinas</span></article>
      <article class="metric-card"><p>Utilidad estimada</p><strong>${formatCurrency(utilidad)}</strong><span>Según costos inventario</span></article>
      <article class="metric-card"><p>Cocina</p><strong>${avgKitchenMinutes().toFixed(1)} min</strong><span>Promedio preparación</span></article>
    </section>

    <section class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <article class="dashboard-card"><h2>Ventas por día</h2><canvas id="ventas-chart" height="140"></canvas></article>
      <article class="dashboard-card"><h2>Productos más vendidos</h2><canvas id="productos-chart" height="140"></canvas></article>
    </section>

    <section class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <article class="dashboard-card"><h2>Más vendidos</h2>${renderList(productos.slice(0, 5))}</article>
      <article class="dashboard-card"><h2>Menos vendidos</h2>${renderList([...productos].reverse().slice(0, 5))}</article>
      <article class="dashboard-card"><h2>Meseros</h2>
        <p class="text-sm text-slate-500 mb-2">Más ventas: <strong>${escapeHtml(meseros[0]?.nombre ?? "—")}</strong></p>
        <p class="text-sm text-slate-500 mb-3">Menos ventas: <strong>${escapeHtml(meseros.at(-1)?.nombre ?? "—")}</strong></p>
        ${renderList(meseros.slice(0, 5))}
      </article>
      <article class="dashboard-card"><h2>Bar</h2>${renderList(barProductos.slice(0, 5), "Sin ventas de bar en el periodo")}</article>
      <article class="dashboard-card"><h2>Clientes frecuentes</h2>${renderList(clientes.slice(0, 5), "Sin clientes registrados")}</article>
      <article class="dashboard-card"><h2>Resumen anual</h2><p class="text-slate-500">El filtro “Este año” muestra ventas y utilidad anual. Cambia el selector para ver día, semana o mes.</p></article>
    </section>
  `;

  const filter = document.getElementById("dash-filter");
  if (filter) filter.value = filtroActual;
  const rerender = () => {
    filtroActual = filter?.value ?? "hoy";
    renderDashboard(profile);
  };
  filter?.addEventListener("change", rerender);
  document.getElementById("dash-from")?.addEventListener("change", () => renderDashboard(profile));
  document.getElementById("dash-to")?.addEventListener("change", () => renderDashboard(profile));
  renderCharts(ventas, productos);
};

const renderCharts = (ventas, productos) => {
  const ventasCtx = document.getElementById("ventas-chart");
  const productosCtx = document.getElementById("productos-chart");
  chartVentas?.destroy();
  chartProductos?.destroy();

  if (ventasCtx && window.Chart) {
    const dias = new Map();
    for (const venta of ventas) {
      const key = parseVentaDate(venta)?.toLocaleDateString("es-GT") ?? "Sin fecha";
      dias.set(key, (dias.get(key) ?? 0) + toNumber(venta.total, 0));
    }
    chartVentas = new window.Chart(ventasCtx, {
      type: "line",
      data: { labels: [...dias.keys()], datasets: [{ label: "Ventas", data: [...dias.values()], borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.12)", tension: 0.35, fill: true }] },
      options: { plugins: { legend: { display: false } }, responsive: true }
    });
  }

  if (productosCtx && window.Chart) {
    const top = productos.slice(0, 6);
    chartProductos = new window.Chart(productosCtx, {
      type: "bar",
      data: { labels: top.map((p) => p.nombre), datasets: [{ label: "Cantidad", data: top.map((p) => p.cantidad), backgroundColor: "#16a34a" }] },
      options: { plugins: { legend: { display: false } }, responsive: true }
    });
  }
};

const startDashboardListeners = (profile) => {
  listenVentas((items) => {
    ventasCache = items.filter(Boolean);
    renderDashboard(profile);
  }, 1000);
  listenInventario((items) => {
    inventarioCache = items.filter(Boolean);
    renderDashboard(profile);
  });
  listenPedidos((items) => {
    pedidosCache = items.filter(Boolean);
    renderDashboard(profile);
  });
};

observeAuth(async (user) => {
  if (!user) {
    window.location.replace("/login.html");
    return;
  }

  try {
    const profile = await getValidatedProfile(user.uid);
    buildSidebar(profile.rol);
    renderDashboard(profile);
    startDashboardListeners(profile);
  } catch (error) {
    console.error("[app] Error cargando dashboard:", error);
    await handleAuthFailure(error);
    alertError(getFriendlyAuthError(error));
    window.location.replace("/login.html");
  }
});

