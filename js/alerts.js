import { showToast } from "../components/toast.js";

export const alertError = (message) => showToast(message, "error");
export const alertSuccess = (message) => showToast(message, "success");
export const alertInfo = (message) => showToast(message, "info");
