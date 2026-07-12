import { listenUsuarios, saveUsuarioDoc, removeUsuarioDoc } from "../../firebase/firestore.js";
import { createAuthUser } from "../../firebase/admin-auth.js";
import { openFormModal } from "../../components/modal.js";
import { escapeHtml, safeText, normalizeRecord } from "../../js/helpers.js";
import { alertSuccess } from "../../js/alerts.js";
import { ROLES } from "../../firebase/permissions.js";
import { sanitizeDocs, findById } from "./admin-safe.js";

let usuariosCache = [];
let listenerStarted = false;

const rolOptions = (selected = "mesero") =>
  Object.values(ROLES)
    .map((r) => `<option value="${r}" ${r === selected ? "selected" : ""}>${r}</option>`)
    .join("");

const formCreate = () => `
  <div><label class="block text-sm mb-1">Nombre</label><input name="nombre" class="input-base" required /></div>
  <div><label class="block text-sm mb-1">Correo</label><input name="correo" type="email" class="input-base" required /></div>
  <div><label class="block text-sm mb-1">Contraseña</label><input name="password" type="password" minlength="6" class="input-base" required /></div>
  <div><label class="block text-sm mb-1">Rol</label><select name="rol" class="input-base">${rolOptions()}</select></div>
  <label class="flex items-center gap-2"><input type="checkbox" name="activo" checked /><span>Activo</span></label>
`;

const formEdit = (raw) => {
  const data = normalizeRecord(raw);
  if (!data.id) {
    console.error("[usuarios] formEdit: sin id", raw);
  }
  return `
  <div><label class="block text-sm mb-1">Nombre</label><input name="nombre" class="input-base" required value="${escapeHtml(data.nombre ?? "")}" /></div>
  <div><label class="block text-sm mb-1">Correo</label><input class="input-base bg-zinc-800" disabled value="${escapeHtml(data.correo ?? "")}" /></div>
  <div><label class="block text-sm mb-1">Rol</label><select name="rol" class="input-base">${rolOptions(data.rol ?? "mesero")}</select></div>
  <label class="flex items-center gap-2"><input type="checkbox" name="activo" ${data.activo === true ? "checked" : ""} /><span>Activo</span></label>
`;
};

const render = () => {
  const tbody = document.getElementById("lista-usuarios");
  if (!tbody) return;

  if (!usuariosCache.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-zinc-500 py-8 text-center">Sin usuarios.</td></tr>`;
    return;
  }

  tbody.innerHTML = usuariosCache
    .map((u) => {
      if (!u?.id) return "";
      return `
      <tr>
        <td class="font-medium">${escapeHtml(u.nombre ?? "—")}</td>
        <td>${escapeHtml(u.correo ?? "—")}</td>
        <td class="uppercase text-sm">${escapeHtml(u.rol ?? "—")}</td>
        <td>${u.activo === true ? "✓" : "✗"}</td>
        <td>
          <button type="button" class="btn-secondary text-sm" data-admin-action="usuario:edit" data-id="${u.id}">Editar</button>
          <button type="button" class="btn-danger text-sm ml-2" data-admin-action="usuario:delete" data-id="${u.id}">Eliminar</button>
        </td>
      </tr>
    `;
    })
    .join("");
};

export const openUsuarioCreateModal = () => {
  openFormModal({
    title: "Agregar usuario",
    submitLabel: "Crear usuario",
    formHtml: formCreate(),
    onSubmit: async (fd) => {
      const correo = safeText(fd.get("correo"));
      const password = fd.get("password");
      const nombre = safeText(fd.get("nombre"));
      if (!nombre || !correo || !password) throw new Error("Nombre, correo y contraseña son obligatorios");
      const authUser = await createAuthUser(correo, password);
      if (!authUser?.uid) throw new Error("No se pudo crear usuario en Auth");
      await saveUsuarioDoc(authUser.uid, {
        nombre,
        correo,
        rol: fd.get("rol"),
        activo: fd.get("activo") === "on"
      });
      alertSuccess("Usuario creado");
    }
  });
};

export const openUsuarioEditModal = (item) => {
  const data = normalizeRecord(item);
  if (!data.id) {
    console.error("[usuarios] Editar: item inválido", item);
    throw new Error("Usuario no válido");
  }
  openFormModal({
    title: "Editar usuario",
    formHtml: formEdit(data),
    onSubmit: async (fd) => {
      await saveUsuarioDoc(data.id, {
        nombre: safeText(fd.get("nombre")),
        correo: data.correo ?? "",
        rol: fd.get("rol"),
        activo: fd.get("activo") === "on"
      });
      alertSuccess("Usuario actualizado");
    }
  });
};

export const handleUsuarioAction = async (action, el) => {
  const id = el?.dataset?.id;

  if (action === "add") {
    openUsuarioCreateModal();
    return;
  }
  if (action === "edit") {
    const item = findById(usuariosCache, id, "Usuario");
    if (!item) throw new Error("Usuario no encontrado");
    openUsuarioEditModal(item);
    return;
  }
  if (action === "delete") {
    if (!id || !confirm("¿Eliminar documento de usuario?")) return;
    await removeUsuarioDoc(id);
    alertSuccess("Eliminado de Firestore");
  }
};

export const startUsuariosListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  listenUsuarios((items) => {
    usuariosCache = sanitizeDocs(items);
    render();
  });
};
