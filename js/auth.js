import { loginWithEmail, observeAuth } from "../firebase/auth.js";
import { completeLoginSession, getFriendlyAuthError, handleAuthFailure } from "./auth-session.js";
import { toggleLoader } from "./ui.js";
import { alertError } from "./alerts.js";

const loginForm = document.getElementById("login-form");
const btnLogin = document.getElementById("btn-login");

let isProcessingLogin = false;
let isRedirecting = false;

const setLoginBusy = (busy) => {
  console.log("[auth] Loader:", busy ? "visible" : "oculto");
  toggleLoader(busy);
  if (btnLogin) btnLogin.disabled = busy;
};

const redirectTo = (url) => {
  if (isRedirecting) {
    console.warn("[auth] Redirección ya en curso, se omite:", url);
    return;
  }
  isRedirecting = true;
  console.log("[auth] Redirigiendo con location.replace →", url);
  window.location.replace(url);
};

/**
 * Flujo único post-autenticación: Firestore → validar → redirigir.
 */
const processAuthenticatedUser = async (uid, source) => {
  console.log("[auth] processAuthenticatedUser desde:", source, "uid:", uid);

  const { url } = await completeLoginSession(uid);
  redirectTo(url);
};

/**
 * Sesión existente al abrir login.html (sin formulario).
 */
const checkExistingSession = async (user) => {
  if (!user || isProcessingLogin || isRedirecting) return;

  console.log("[auth] Sesión existente detectada, validando perfil...");
  isProcessingLogin = true;
  setLoginBusy(true);

  try {
    await processAuthenticatedUser(user.uid, "session-restore");
  } catch (error) {
    console.error("[auth] Sesión existente inválida:", error);
    await handleAuthFailure(error);
    alertError(getFriendlyAuthError(error));
    isProcessingLogin = false;
    setLoginBusy(false);
  }
};

if (loginForm) {
  observeAuth((user) => {
    console.log("[auth] onAuthStateChanged →", user ? user.uid : "sin usuario");
    if (!user) return;
    if (isProcessingLogin || isRedirecting) {
      console.log("[auth] onAuthStateChanged ignorado (login en progreso)");
      return;
    }
    checkExistingSession(user);
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isProcessingLogin || isRedirecting) {
      console.warn("[auth] Submit ignorado: proceso en curso");
      return;
    }

    const correo = document.getElementById("correo")?.value?.trim() ?? "";
    const password = document.getElementById("password")?.value ?? "";

    if (!correo || !password) {
      alertError("Ingresa correo y contraseña.");
      return;
    }

    isProcessingLogin = true;
    setLoginBusy(true);

    try {
      console.log("[auth] Paso 1/3: Firebase Auth login...");
      const cred = await loginWithEmail(correo, password);
      console.log("[auth] Paso 2/3: Auth OK. UID:", cred.user.uid);

      console.log("[auth] Paso 3/3: Validando perfil Firestore...");
      await processAuthenticatedUser(cred.user.uid, "form-submit");
    } catch (error) {
      console.error("[auth] Error en login:", {
        code: error?.code,
        message: error?.message,
        stack: error?.stack
      });

      if (!(error?.code?.startsWith?.("auth/"))) {
        await handleAuthFailure(error);
      }

      alertError(getFriendlyAuthError(error));
      isProcessingLogin = false;
      setLoginBusy(false);
    }
  });
}
