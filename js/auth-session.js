import { logoutUser } from "../firebase/auth.js";
import { getUsuario } from "../firebase/firestore.js";
import { isValidRole, routeByRole } from "./roles.js";
import { withTimeout } from "./helpers.js";

export class AuthSessionError extends Error {
  constructor(message, code = "AUTH_SESSION_ERROR") {
    super(message);
    this.name = "AuthSessionError";
    this.code = code;
  }
}

const FIRESTORE_TIMEOUT_MS = 15000;

/**
 * Carga y valida el perfil del usuario en Firestore.
 * @param {string} uid
 * @returns {Promise<{ profile: object, url: string }>}
 */
export const completeLoginSession = async (uid) => {
  console.log("[auth-session] Iniciando validación para uid:", uid);

  if (!uid) {
    throw new AuthSessionError("No se recibió el UID del usuario autenticado.", "NO_UID");
  }

  let profile;
  try {
    profile = await withTimeout(
      getUsuario(uid),
      FIRESTORE_TIMEOUT_MS,
      "Tiempo de espera agotado al leer el perfil en Firestore."
    );
  } catch (error) {
    if (error instanceof AuthSessionError) throw error;
    console.error("[auth-session] Error al leer Firestore:", error);
    const isTimeout = String(error?.message ?? "").includes("Tiempo de espera");
    throw new AuthSessionError(
      error?.message || "No se pudo leer el perfil del usuario.",
      isTimeout ? "FIRESTORE_TIMEOUT" : "FIRESTORE_ERROR"
    );
  }

  console.log("[auth-session] Documento usuarios/{uid}:", profile);

  if (!profile) {
    throw new AuthSessionError(
      "No existe un registro en Firestore para este usuario. El documento debe estar en usuarios/{uid} con el mismo UID de Authentication.",
      "NO_PROFILE"
    );
  }

  if (profile.activo !== true) {
    throw new AuthSessionError("Tu cuenta está inactiva. Contacta al administrador.", "INACTIVE");
  }

  const rol = String(profile.rol ?? "").trim().toLowerCase();
  console.log("[auth-session] Rol detectado:", rol);

  if (!isValidRole(rol)) {
    throw new AuthSessionError(
      `Rol no válido: "${profile.rol}". Roles permitidos: admin, mesero, cocina, caja.`,
      "INVALID_ROLE"
    );
  }

  const url = routeByRole(rol);
  if (!url) {
    throw new AuthSessionError("No hay ruta configurada para este rol.", "NO_ROUTE");
  }

  console.log("[auth-session] Sesión válida. Redirección:", url);
  return { profile: { ...profile, rol }, url };
};

/** Valida perfil sin redirigir (para guards de módulos). */
export const getValidatedProfile = async (uid) => {
  const { profile } = await completeLoginSession(uid);
  return profile;
};

/**
 * Cierra sesión cuando el perfil no es válido para entrar al sistema.
 */
export const handleAuthFailure = async (error) => {
  const logoutCodes = new Set(["NO_PROFILE", "INACTIVE", "INVALID_ROLE", "NO_ROUTE", "NO_UID"]);
  if (!logoutCodes.has(error?.code)) return;

  console.warn("[auth-session] Cerrando sesión por:", error.code);
  try {
    await logoutUser();
    console.log("[auth-session] Sesión cerrada correctamente");
  } catch (logoutError) {
    console.error("[auth-session] Error al cerrar sesión:", logoutError);
  }
};

export const getFriendlyAuthError = (error) => {
  const code = error?.code ?? "";

  const map = {
    "auth/invalid-email": "Correo electrónico inválido.",
    "auth/user-disabled": "Esta cuenta fue deshabilitada.",
    "auth/user-not-found": "Usuario no encontrado.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Credenciales incorrectas.",
    "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
    "auth/network-request-failed": "Error de red. Verifica tu conexión."
  };

  if (map[code]) return map[code];
  if (error instanceof AuthSessionError) return error.message;
  return error?.message || "No se pudo iniciar sesión.";
};
