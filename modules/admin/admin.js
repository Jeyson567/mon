import { protectModule } from "../../js/guard.js";
import { buildSidebar } from "../../components/sidebar.js";
import { bindAdminEvents } from "./admin-events.js";
import { startCategoriasListener } from "./categorias.js";
import { startInventarioListener } from "./inventario.js";
import { startProductosListener } from "./productos.js";
import { startMesasListener } from "./mesas.js";
import { startUsuariosListener } from "./usuarios.js";
import { startReportesListener } from "./reportes.js";
import { startHabitacionesListener } from "./habitaciones.js";

// 1) Enlazar botones INMEDIATAMENTE (no esperar auth)
bindAdminEvents();

const tabs = document.querySelectorAll(".admin-tab");
const panels = document.querySelectorAll(".admin-panel");

const showTab = (name) => {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  panels.forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
  if (location.hash !== `#${name}`) location.hash = name;
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

const hash = location.hash.replace("#", "");
if (hash && document.getElementById(`panel-${hash}`)) showTab(hash);

const startAllListeners = () => {
  const starters = [
    { name: "categorías", fn: startCategoriasListener },
    { name: "inventario", fn: startInventarioListener },
    { name: "productos", fn: startProductosListener },
    { name: "mesas", fn: startMesasListener },
    { name: "habitaciones", fn: startHabitacionesListener },
    { name: "usuarios", fn: startUsuariosListener },
    { name: "reportes", fn: startReportesListener }
  ];

  for (const { name, fn } of starters) {
    try {
      fn();
      console.log("[admin] Listener OK:", name);
    } catch (error) {
      console.error("[admin] Error listener:", name, error);
    }
  }
};

// 2) Tras autenticación, iniciar tiempo real
protectModule("dashboard", (profile) => {
  const nameEl = document.getElementById("admin-user-name");
  if (!profile) {
    console.error("[admin] Perfil null en onReady");
    return;
  }
  if (nameEl) nameEl.textContent = profile?.nombre ?? profile?.correo ?? "Admin";
  buildSidebar(profile.rol);
  startAllListeners();
});
