export const ROLES = {
  admin: "admin",
  mesero: "mesero",
  cocina: "cocina",
  caja: "caja"
};

/** Recursos del sistema para control de acceso */
export const RECURSOS = {
  dashboard: "dashboard",
  mesas: "mesas",
  pedidos: "pedidos",
  cocina: "cocina",
  monitor: "monitor",
  caja: "caja",
  tickets: "tickets",
  productos: "productos",
  categorias: "categorias",
  inventario: "inventario",
  usuarios: "usuarios",
  reportes: "reportes",
  configuracion: "configuracion"
};

export const permisosPorRol = {
  admin: Object.values(RECURSOS),
  mesero: [RECURSOS.mesas, RECURSOS.pedidos],
  cocina: [RECURSOS.cocina, RECURSOS.monitor],
  caja: [RECURSOS.caja, RECURSOS.tickets]
};

export const isAdminRole = (rol) => String(rol ?? "").toLowerCase() === ROLES.admin;

/** Admin tiene acceso total a cualquier módulo */
export const puedeAcceder = (rol, recurso) => {
  const r = String(rol ?? "").toLowerCase();
  if (isAdminRole(r)) return true;
  return (permisosPorRol[r] ?? []).includes(recurso);
};
