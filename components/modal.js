import { alertError } from "../js/alerts.js";

export const closeModal = (wrapper) => {
  if (wrapper?.isConnected) wrapper.remove();
};

export const openModal = ({ title, content, size = "md" }) => {
  const maxW = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size] ?? "max-w-lg";
  const wrapper = document.createElement("div");
  wrapper.className =
    "modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 sm:p-4 overflow-y-auto";
  wrapper.setAttribute("role", "dialog");
  wrapper.innerHTML = `
    <article class="w-full max-h-[92dvh] overflow-y-auto ${maxW} rounded-2xl bg-zinc-900 border border-zinc-800 p-4 sm:p-5 my-4 shadow-2xl">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold">${title}</h3>
        <button type="button" class="btn-secondary" data-close-modal>Cerrar</button>
      </div>
      <div class="modal-body">${content}</div>
    </article>
  `;
  wrapper.querySelector("[data-close-modal]")?.addEventListener("click", () => closeModal(wrapper));
  wrapper.addEventListener("click", (e) => {
    if (e.target === wrapper) closeModal(wrapper);
  });
  document.body.appendChild(wrapper);
  console.log("[modal] Abierto:", title);
  return wrapper;
};

/**
 * Modal con formulario y envío async.
 */
export const openFormModal = ({ title, formHtml, onSubmit, submitLabel = "Guardar", size = "lg" }) => {
  const wrapper = openModal({
    title,
    size,
    content: `
      <form class="space-y-4" data-admin-form novalidate>
        ${formHtml}
        <div class="flex gap-2 pt-2">
          <button type="submit" class="btn-primary flex-1" data-submit-btn>${submitLabel}</button>
          <button type="button" class="btn-secondary" data-cancel-modal>Cancelar</button>
        </div>
      </form>
    `
  });

  const form = wrapper.querySelector("[data-admin-form]");
  const submitBtn = wrapper.querySelector("[data-submit-btn]");

  if (!form) {
    console.error("[modal] Formulario no encontrado en modal");
    return wrapper;
  }

  wrapper.querySelector("[data-cancel-modal]")?.addEventListener("click", () => closeModal(wrapper));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      console.warn("[modal] Validación HTML fallida");
      return;
    }

    submitBtn.disabled = true;
    const labelOriginal = submitBtn.textContent;
    submitBtn.textContent = "Guardando...";

    try {
      const close = () => closeModal(wrapper);
      await onSubmit(new FormData(form), close);
      form.reset();
      closeModal(wrapper);
      console.log("[modal] Guardado y cerrado:", title);
    } catch (error) {
      console.error("[modal] Error al guardar:", error);
      alertError(error?.message || "Error al guardar");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = labelOriginal;
    }
  });

  return wrapper;
};
