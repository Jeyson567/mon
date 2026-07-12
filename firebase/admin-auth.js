/**
 * Crea usuarios en Firebase Auth sin cerrar la sesión del admin (app secundaria).
 */
import { initializeApp, getApps, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./credentials.js";

const SECONDARY_APP_NAME = "AdminUserCreation";

export const createAuthUser = async (correo, password) => {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  if (existing) await deleteApp(existing).catch(() => {});

  const secondaryApp = initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, correo, password);
    await signOut(secondaryAuth);
    return cred.user;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
};
