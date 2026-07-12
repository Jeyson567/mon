/**
 * Inicialización Firebase — HTML + Live Server + ES Modules + CDN 10.12.2
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./credentials.js";

export const SDK_VERSION = "10.12.2";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("[firebase] Inicializado:", firebaseConfig.projectId);

export { app, auth, db, firebaseConfig };
