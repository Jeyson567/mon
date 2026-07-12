import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/config.js";
import { colecciones, ajustarStockInventario } from "../firebase/firestore.js";

/**
 * Resuelve referencia de inventario (ID Firestore o nombre guardado en productos).
 */
export const resolverInventarioId = (ref, inventarioItems = []) => {
  const key = safeRef(ref);
  if (!key) return null;

  const byId = inventarioItems.find((i) => i?.id === key);
  if (byId?.id) return byId.id;

  const byNombre = inventarioItems.find(
    (i) => String(i?.nombre ?? "").trim().toLowerCase() === key.toLowerCase()
  );
  if (byNombre?.id) return byNombre.id;

  return key;
};

const safeRef = (v) => String(v ?? "").trim();

/** Verifica que el documento exista en Firestore */
export const existeInventarioDoc = async (inventarioId) => {
  if (!inventarioId) return false;
  try {
    const snap = await getDoc(doc(db, colecciones.inventario, inventarioId));
    return snap.exists();
  } catch (e) {
    console.warn("[inventario] Error al verificar documento:", inventarioId, e);
    return false;
  }
};

/** Descuentos ya aplicados en adicionales al agregar al carrito */
export const descuentosAdicionalesCarrito = (carrito = [], inventarioItems = []) => {
  const map = new Map();
  for (const linea of carrito) {
    const inv = linea?.inventarioDescuento;
    if (!inv?.inventarioId) continue;
    const id = resolverInventarioId(inv.inventarioId, inventarioItems);
    if (!id) {
      console.warn("[inventario] Adicional sin inventario válido:", inv.inventarioId, linea?.nombre);
      continue;
    }
    const cant = Number(inv.cantidad ?? 0) * Number(linea.cantidad ?? 1);
    if (cant <= 0) continue;
    const prev = map.get(id) ?? { inventarioId: id, cantidad: 0, nombre: linea.nombre };
    prev.cantidad += cant;
    map.set(id, prev);
  }
  return [...map.values()];
};

/** Descuentos de productos del menú (inventarioConfig) al cobrar */
export const descuentosMenuCarrito = (carrito = [], productos = [], inventarioItems = []) => {
  const map = new Map();
  for (const linea of carrito) {
    if (!linea?.productoId) continue;
    const p = productos.find((x) => x.id === linea.productoId);
    if (!p?.descontarInventario || !Array.isArray(p.inventarioConfig)) continue;
    const qty = Number(linea.cantidad ?? 1);
    for (const ins of p.inventarioConfig) {
      const ref = ins?.productoInventario;
      if (!ref) continue;
      const id = resolverInventarioId(ref, inventarioItems);
      if (!id) {
        console.warn("[inventario] Producto inventario no encontrado:", ref, "— producto:", p.nombre);
        continue;
      }
      const cant = Number(ins.cantidad ?? 0) * qty;
      if (cant <= 0) continue;
      const prev = map.get(id) ?? { inventarioId: id, cantidad: 0, nombre: p.nombre };
      prev.cantidad += cant;
      map.set(id, prev);
    }
  }
  return [...map.values()];
};

export const snapshotInventarioVenta = (carrito = [], productos = [], inventarioItems = []) => {
  const map = new Map();
  const addList = (list) => {
    for (const item of list) {
      if (!item?.inventarioId || item.cantidad <= 0) continue;
      const prev = map.get(item.inventarioId) ?? {
        inventarioId: item.inventarioId,
        cantidad: 0,
        nombre: item.nombre
      };
      prev.cantidad += item.cantidad;
      map.set(item.inventarioId, prev);
    }
  };
  addList(descuentosAdicionalesCarrito(carrito, inventarioItems));
  addList(descuentosMenuCarrito(carrito, productos, inventarioItems));
  return [...map.values()];
};

/**
 * Descuenta inventario sin bloquear el flujo principal.
 * @returns {{ ok: number, fallos: Array }}
 */
export const descontarInventarioItems = async ({
  items = [],
  usuario,
  motivo,
  tipoMovimiento = "salida",
  inventarioItems = []
}) => {
  const fallos = [];
  let ok = 0;

  for (const item of items) {
    if (!item?.inventarioId || item.cantidad <= 0) continue;

    const inventarioId = resolverInventarioId(item.inventarioId, inventarioItems) ?? item.inventarioId;

    if (!inventarioId) {
      console.warn("[inventario] Referencia vacía:", item);
      fallos.push({ item, error: "Referencia de inventario vacía" });
      continue;
    }

    const existe = await existeInventarioDoc(inventarioId);
    if (!existe) {
      console.warn("[inventario] Producto de inventario no encontrado:", inventarioId, item);
      fallos.push({ item, error: "Producto de inventario no encontrado" });
      continue;
    }

    try {
      await ajustarStockInventario({
        inventarioId,
        cantidad: item.cantidad,
        tipoMovimiento,
        motivo: `${motivo} — ${item.nombre ?? inventarioId}`,
        usuario
      });
      ok++;
    } catch (e) {
      console.warn("[inventario] Error al descontar:", inventarioId, e);
      fallos.push({ item, error: e?.message ?? String(e) });
    }
  }

  return { ok, fallos };
};

export const reembolsarInventarioItems = async ({ items, usuario, motivo, inventarioItems = [] }) => {
  return descontarInventarioItems({
    items,
    usuario,
    motivo,
    tipoMovimiento: "reembolso",
    inventarioItems
  });
};

export const reembolsarInventarioCarritoMesa = async ({
  carrito,
  usuario,
  motivo,
  inventarioItems = []
}) => {
  const items = descuentosAdicionalesCarrito(carrito, inventarioItems);
  if (!items.length) return { ok: 0, fallos: [] };
  return reembolsarInventarioItems({ items, usuario, motivo, inventarioItems });
};
