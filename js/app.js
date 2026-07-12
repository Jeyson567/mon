import { observeAuth } from "../firebase/auth.js";
import { getValidatedProfile, getFriendlyAuthError, handleAuthFailure } from "./auth-session.js";
import { buildSidebar } from "../components/sidebar.js";
import { alertError } from "./alerts.js";

const dashboardContent = document.getElementById("dashboard-content");

const renderStatsCards = (profile) => {
  if (!dashboardContent) return;
  dashboardContent.innerHTML = `
    <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 class="text-zinc-400 text-sm">Usuario</h2>
      <p class="text-xl font-bold mt-2">${profile.nombre}</p>
    </article>
    <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 class="text-zinc-400 text-sm">Rol activo</h2>
      <p class="text-xl font-bold mt-2 uppercase">${profile.rol}</p>
    </article>
    <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 class="text-zinc-400 text-sm">Estado</h2>
      <p class="text-xl font-bold mt-2">${profile.activo ? "Activo" : "Inactivo"}</p>
    </article>
    <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 class="text-zinc-400 text-sm">Sistema</h2>
      <p class="text-xl font-bold mt-2">Operativo</p>
    </article>
  `;
};

observeAuth(async (user) => {
  if (!user) {
    window.location.replace("/login.html");
    return;
  }

  try {
    const profile = await getValidatedProfile(user.uid);
    buildSidebar(profile.rol);
    renderStatsCards(profile);
  } catch (error) {
    console.error("[app] Error cargando dashboard:", error);
    await handleAuthFailure(error);
    alertError(getFriendlyAuthError(error));
    window.location.replace("/login.html");
  }
});

