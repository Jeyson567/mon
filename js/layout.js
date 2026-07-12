const MOBILE_BREAKPOINT = 767;
const DESKTOP_BREAKPOINT = 1024;

/**
 * Sidebar responsive: drawer móvil, compacto tablet, completo PC.
 */
export const initAppLayout = () => {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  let overlay = document.getElementById("sidebar-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sidebar-overlay";
    overlay.className = "sidebar-overlay";
    overlay.setAttribute("aria-hidden", "true");
    document.body.prepend(overlay);
  }

  ensureTopbar();

  const toggle = document.getElementById("sidebar-toggle");
  const tabletToggle = document.getElementById("sidebar-tablet-toggle");

  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

  const closeMobileSidebar = () => {
    document.body.classList.remove("sidebar-open");
    toggle?.setAttribute("aria-expanded", "false");
    overlay.setAttribute("aria-hidden", "true");
  };

  const openMobileSidebar = () => {
    if (!isMobile()) return;
    document.body.classList.add("sidebar-open");
    toggle?.setAttribute("aria-expanded", "true");
    overlay.setAttribute("aria-hidden", "false");
  };

  toggle?.addEventListener("click", () => {
    if (document.body.classList.contains("sidebar-open")) closeMobileSidebar();
    else openMobileSidebar();
  });

  overlay.addEventListener("click", closeMobileSidebar);

  tabletToggle?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-tablet-expanded");
    const expanded = document.body.classList.contains("sidebar-tablet-expanded");
    tabletToggle.setAttribute("aria-expanded", String(expanded));
    tabletToggle.textContent = expanded ? "«" : "»";
    tabletToggle.setAttribute("aria-label", expanded ? "Contraer menú" : "Expandir menú");
  });

  sidebar.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      if (isMobile()) closeMobileSidebar();
    });
  });

  window.addEventListener(
    "resize",
    () => {
      if (!isMobile()) closeMobileSidebar();
      if (window.innerWidth >= DESKTOP_BREAKPOINT) {
        document.body.classList.remove("sidebar-tablet-expanded");
      }
    },
    { passive: true }
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileSidebar();
  });

  document.body.classList.add("app-body");
};

const ensureTopbar = () => {
  if (document.getElementById("sidebar-toggle")) return;

  const mainWrap = document.querySelector(".app-main");
  if (!mainWrap) return;

  const topbar = document.createElement("header");
  topbar.className = "app-topbar";
  topbar.innerHTML = `
    <button type="button" id="sidebar-toggle" class="app-menu-btn" aria-expanded="false" aria-controls="sidebar">
      <span aria-hidden="true">☰</span> Menú
    </button>
    <span class="app-topbar-title">GRAN MONTANA</span>
  `;
  mainWrap.insertBefore(topbar, mainWrap.firstChild);
};

/**
 * Envuelve layout antiguo (flex + sidebar w-72) en app-shell si hace falta.
 */
export const migrateLegacyLayout = () => {
  if (document.querySelector(".app-shell")) return;

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const flexRoot = sidebar.parentElement;
  if (!flexRoot) return;

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const mainWrap = document.createElement("div");
  mainWrap.className = "app-main";

  sidebar.classList.remove("w-72", "hidden", "lg:flex", "shrink-0");
  sidebar.classList.add("app-sidebar");

  const siblings = [...flexRoot.children].filter((c) => c !== sidebar);

  flexRoot.replaceWith(shell);
  shell.appendChild(sidebar);

  siblings.forEach((child) => {
    child.classList.add("app-content");
    mainWrap.appendChild(child);
  });

  shell.appendChild(mainWrap);
};
