export const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(value);

export const formatDateTime = (date = new Date()) =>
  `${date.toLocaleDateString("es-GT")} ${date.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`;

export const safeText = (value) => String(value ?? "").trim();

/** Convierte null/undefined en objeto vacío (evita data.nombre cuando data es null). */
export const normalizeRecord = (value) =>
  value !== null && value !== undefined && typeof value === "object" ? value : {};

export const safeNombre = (record, fallback = "") =>
  safeText(normalizeRecord(record).nombre) || fallback;

export const escapeHtml = (value) => {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
};

export const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Evita promesas colgadas (p. ej. Firestore sin respuesta).
 */
export const withTimeout = (promise, ms, message = "Operación agotó el tiempo de espera") =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
