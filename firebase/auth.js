import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./config.js";

export const loginWithEmail = (correo, password) =>
  signInWithEmailAndPassword(auth, correo, password);

export const logoutUser = () => signOut(auth);

export const observeAuth = (callback) => onAuthStateChanged(auth, callback);
