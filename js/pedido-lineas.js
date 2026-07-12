/** Utilidades para líneas del carrito / cocina */

export const newLineaId = () =>
  `ln_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const normalizarLineaCarrito = (linea) => {
  const l = linea && typeof linea === "object" ? linea : {};
  return {
    ...l,
    lineaId: l.lineaId || newLineaId(),
    enviadoCocina: l.enviadoCocina === true,
    estadoCocina: l.estadoCocina ?? null
  };
};

export const normalizarCarrito = (carrito) =>
  (Array.isArray(carrito) ? carrito : []).map(normalizarLineaCarrito);

/** Productos que aún no se han enviado a cocina */
export const lineasPendientesEnvio = (carrito) =>
  normalizarCarrito(carrito).filter((l) => !l.enviadoCocina);

export const lineaEstaEnviada = (linea) => linea?.enviadoCocina === true;

export const etiquetaEstadoCocina = (linea) => {
  if (!linea?.enviadoCocina) return "";
  const e = linea.estadoCocina;
  if (e === "listo") return "Listo";
  if (e === "entregado") return "Entregado";
  if (e === "preparando") return "Preparando";
  return "En cocina";
};

export const claseBadgeCocina = (linea) => {
  const e = linea?.estadoCocina;
  if (e === "listo" || e === "entregado") return "bg-green-600/30 text-green-300";
  if (e === "preparando") return "bg-yellow-600/30 text-yellow-300";
  if (linea?.enviadoCocina) return "bg-orange-600/30 text-orange-300";
  return "";
};
