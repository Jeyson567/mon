import { observeAuth } from "../firebase/auth.js";
import { getValidatedProfile, getFriendlyAuthError, handleAuthFailure } from "./auth-session.js";
import { enforceModuleAccess } from "./router.js";
import { alertError } from "./alerts.js";
import { isAdminRole } from "../firebase/permissions.js";

let currentProfile = null;

export const getCurrentProfile = () => currentProfile;
export const isAdmin = () => isAdminRole(currentProfile?.rol);

/**
 * Protege un módulo: exige sesión Firebase + perfil Firestore + permiso por rol.
 * @param {string} recurso
 * @param {(profile: object) => void} [onReady]
 */
export const protectModule = (recurso, onReady) => {
  observeAuth(async (user) => {
    if (!user) {
      console.warn("[guard] Sin sesión, enviando a login");
      window.location.replace("/login.html");
      return;
    }

    try {
      const profile = await getValidatedProfile(user.uid);
      enforceModuleAccess({ rol: profile.rol, recurso });
      currentProfile = profile;
      console.log("[guard] Acceso permitido:", { recurso, rol: profile.rol });
      onReady?.(profile);
    } catch (error) {
      console.error("[guard] Acceso denegado:", error);
      await handleAuthFailure(error);
      alertError(getFriendlyAuthError(error));
      window.location.replace("/login.html");
    }
  });
};
