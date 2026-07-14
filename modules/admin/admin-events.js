import { alertError } from "../../js/alerts.js";
import { handleCategoriaAction } from "./categorias.js";
import { handleProductoAction } from "./productos.js";
import { handleMesaAction } from "./mesas.js";
import { handleInventarioAction } from "./inventario.js";
import { handleUsuarioAction } from "./usuarios.js";
import { handleHabitacionAction } from "./habitaciones.js";

const handlers = {
  categoria: handleCategoriaAction,
  producto: handleProductoAction,
  mesa: handleMesaAction,
  inventario: handleInventarioAction,
  usuario: handleUsuarioAction,
  habitacion: handleHabitacionAction
};

let eventsBound = false;

/**
 * Delegación de eventos en #admin-app — funciona para todos los paneles.
 */
export const bindAdminEvents = () => {
  if (eventsBound) return;

  const root = document.getElementById("admin-app");
  if (!root) {
    console.error("[admin-events] #admin-app no encontrado en DOM");
    return;
  }

  root.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-admin-action]");
    if (!trigger) return;

    event.preventDefault();
    event.stopPropagation();

    const raw = trigger.dataset.adminAction;
    const [module, action] = raw?.split(":") ?? [];

    console.log("[admin-events] Click:", raw);

    const handler = handlers[module];
    if (!handler) {
      console.error("[admin-events] Módulo desconocido:", module);
      alertError(`Acción no configurada: ${raw}`);
      return;
    }

    try {
      await handler(action, trigger);
    } catch (error) {
      console.error("[admin-events] Error:", module, action, error);
      alertError(error?.message || "Error en la operación");
    }
  });

  eventsBound = true;
  console.log("[admin-events] Listeners registrados en #admin-app");
};
