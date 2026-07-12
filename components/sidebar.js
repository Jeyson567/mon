import { ROLES } from "../firebase/permissions.js";
import { logoutUser } from "../firebase/auth.js";
import { migrateLegacyLayout, initAppLayout } from "../js/layout.js";

const menuByRole = {
  [ROLES.admin]: [
    { label: "Dashboard", href: "/dashboard.html", icon: "⌂" },
    { label: "Mesas", href: "/modules/mesero/mesero.html", icon: "▦" },
    { label: "Cocina", href: "/modules/cocina/cocina.html", icon: "🍳" },
    { label: "Caja", href: "/modules/caja/caja.html", icon: "💵" },
    { label: "Reimpresión tickets", href: "/modules/reimpresion/reimpresion.html", icon: "🧾" },
    { label: "Productos", href: "/modules/admin/admin.html#productos", icon: "☰" },
    { label: "Categorías", href: "/modules/admin/admin.html#categorias", icon: "◫" },
    { label: "Inventario", href: "/modules/admin/admin.html#inventario", icon: "📦" },
    { label: "Usuarios", href: "/modules/admin/admin.html#usuarios", icon: "👤" },
    { label: "Reportes", href: "/modules/admin/admin.html#reportes", icon: "📊" },
    { label: "Configuración", href: "/modules/admin/admin.html#configuracion", icon: "⚙" }
  ],
  [ROLES.mesero]: [{ label: "Mesas y pedidos", href: "/modules/mesero/mesero.html", icon: "▦" }],
  [ROLES.cocina]: [{ label: "Monitor Cocina", href: "/modules/cocina/cocina.html", icon: "🍳" }],
  [ROLES.caja]: [
    { label: "Cobros", href: "/modules/caja/caja.html", icon: "💵" },
    { label: "Historial", href: "/modules/caja/caja.html#historial", icon: "📋" },
    { label: "Reimpresión tickets", href: "/modules/reimpresion/reimpresion.html", icon: "🧾" }
  ]
};

export const buildSidebar = (rol) => {
  migrateLegacyLayout();

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const menu = menuByRole[rol] ?? [];
  const path = window.location.pathname + window.location.hash;

  sidebar.classList.add("app-sidebar");
  sidebar.setAttribute("aria-label", "Menú principal");

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div>
        <p class="sidebar-brand-sub">GRAN MONTANA</p>
        <h2 class="sidebar-brand-title">${rol}</h2>
      </div>
      <button type="button" id="sidebar-tablet-toggle" class="sidebar-tablet-toggle" aria-expanded="false" aria-label="Expandir menú">»</button>
    </div>
    <nav class="sidebar-nav" aria-label="Navegación">
      ${menu
        .map((item) => {
          const active = path === item.href || path.startsWith(item.href.split("#")[0]);
          return `<a href="${item.href}" class="sidebar-link ${active ? "is-active" : ""}">
            <span class="sidebar-link-icon" aria-hidden="true">${item.icon ?? "•"}</span>
            <span class="sidebar-link-label">${item.label}</span>
          </a>`;
        })
        .join("")}
    </nav>
    <button type="button" id="sidebar-logout" class="btn-danger w-full mt-4 text-sm">
      <span class="logout-label">Cerrar sesión</span>
    </button>
  `;

  document.getElementById("sidebar-logout")?.addEventListener("click", async () => {
    await logoutUser();
    window.location.replace("/login.html");
  });

  initAppLayout();
};
