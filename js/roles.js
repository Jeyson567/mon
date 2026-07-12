import { ROLES } from "../firebase/permissions.js";

const ROUTES = {
  [ROLES.admin]: "/dashboard.html",
  [ROLES.mesero]: "/modules/mesero/mesero.html",
  [ROLES.cocina]: "/modules/cocina/cocina.html",
  [ROLES.caja]: "/modules/caja/caja.html"
};

export const isValidRole = (rol) => Object.values(ROLES).includes(rol);

export const routeByRole = (rol) => {
  const normalized = String(rol ?? "").trim().toLowerCase();
  const url = ROUTES[normalized] ?? null;
  console.log("[roles] routeByRole:", { rol, normalized, url });
  return url;
};
