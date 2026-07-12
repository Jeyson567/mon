import { normalizeRecord } from "../../js/helpers.js";

/** Filtra documentos Firestore inválidos del cache. */
export const sanitizeDocs = (items = []) =>
  (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object" && item.id);

/** Busca por id con validación. */
export const findById = (cache, id, label = "Registro") => {
  if (!id) {
    console.error(`[admin] ${label}: id vacío`);
    return null;
  }
  const item = cache.find((x) => x?.id === id);
  if (!item) {
    console.error(`[admin] ${label} no encontrado:`, id);
  }
  return item ?? null;
};

export { normalizeRecord };
