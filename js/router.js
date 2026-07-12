import { puedeAcceder } from "../firebase/permissions.js";
import { AuthSessionError } from "./auth-session.js";

export const enforceModuleAccess = ({ rol, recurso }) => {
  if (puedeAcceder(rol, recurso)) return;
  console.error("[router] Acceso denegado:", { rol, recurso });
  throw new AuthSessionError("No tienes permiso para acceder a este módulo.", "FORBIDDEN");
};
