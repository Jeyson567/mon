import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./config.js";

export const colecciones = {
  usuarios: "usuarios",
  mesas: "mesas",
  pedidos: "pedidos",
  productos: "productos",
  categorias: "categorias",
  ventas: "ventas",
  cierresCaja: "cierres_caja",
  configuracion: "configuracion",
  notificaciones: "notificaciones",
  inventario: "inventario",
  movimientosInventario: "movimientos_inventario",
  habitaciones: "habitaciones"
};

export const getUsuario = async (uid) => {
  if (!uid) {
    console.error("[firestore] getUsuario: uid vacío");
    return null;
  }

  const ref = doc(db, colecciones.usuarios, uid);
  console.log("[firestore] getDoc →", `${colecciones.usuarios}/${uid}`);

  try {
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("[firestore] Documento no encontrado:", uid);
      return null;
    }

    const data = { id: snap.id, ...snap.data() };
    console.log("[firestore] Perfil leído:", { uid, rol: data.rol, activo: data.activo });
    return data;
  } catch (error) {
    console.error("[firestore] Error getDoc usuarios:", {
      code: error?.code,
      message: error?.message
    });
    throw error;
  }
};

export const upsertUsuario = async (uid, payload) =>
  setDoc(doc(db, colecciones.usuarios, uid), { ...payload, fechaCreacion: payload.fechaCreacion ?? serverTimestamp() }, { merge: true });

const snapshotListener = (label, q, callback) =>
  onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs
        .map((d) => {
          const data = d.data();
          if (!data || typeof data !== "object") {
            console.warn(`[firestore] ${label}: doc sin data`, d.id);
            return null;
          }
          return { id: d.id, ...data };
        })
        .filter(Boolean);
      callback(docs);
    },
    (error) => console.error(`[firestore] Error listener ${label}:`, error.code, error.message)
  );

export const listenMesas = (callback) =>
  snapshotListener("mesas", query(collection(db, colecciones.mesas), orderBy("orden", "asc")), callback);

export const saveMesa = async (id, payload) => {
  if (id) {
    await updateDoc(doc(db, colecciones.mesas, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, colecciones.mesas), payload);
  return created.id;
};

export const removeMesa = async (id) => deleteDoc(doc(db, colecciones.mesas, id));

export const listenHabitaciones = (callback) =>
  snapshotListener("habitaciones", query(collection(db, colecciones.habitaciones), orderBy("numero", "asc")), callback);

export const saveHabitacion = async (id, payload) => {
  if (id) {
    await updateDoc(doc(db, colecciones.habitaciones, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, colecciones.habitaciones), {
    ...payload,
    consumos: payload.consumos ?? [],
    fechaCreacion: serverTimestamp()
  });
  return created.id;
};

export const removeHabitacion = async (id) => deleteDoc(doc(db, colecciones.habitaciones, id));

/** Cocina: pendiente, preparando, listo (excluye entregado y cancelado) */
export const listenPedidosCocina = (callback) => {
  const estadosActivos = new Set(["pendiente", "preparando", "listo"]);
  return snapshotListener("pedidos", collection(db, colecciones.pedidos), (items) => {
    const activos = items
      .filter((p) => estadosActivos.has(p.estado))
      .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
    callback(activos);
  });
};

export const listenPedidos = (callback) =>
  snapshotListener("pedidos", collection(db, colecciones.pedidos), callback);

export const savePedido = async (payload) =>
  addDoc(collection(db, colecciones.pedidos), {
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
    fechaRegistro: serverTimestamp()
  });

export const updateMesa = async (mesaId, payload) =>
  updateDoc(doc(db, colecciones.mesas, mesaId), payload);

export const getMesa = async (mesaId) => {
  const snap = await getDoc(doc(db, colecciones.mesas, mesaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const updatePedidoEstado = async (pedidoId, estado) => {
  const pedidoRef = doc(db, colecciones.pedidos, pedidoId);
  const pedidoSnap = await getDoc(pedidoRef);

  const extra =
    estado === "listo"
      ? {
          horaListo: new Date().toLocaleTimeString("es-GT"),
          fechaListo: new Date().toLocaleDateString("es-GT"),
          timestampListo: Date.now()
        }
      : estado === "entregado"
        ? {
            horaEntregado: new Date().toLocaleTimeString("es-GT"),
            fechaEntregado: new Date().toLocaleDateString("es-GT")
          }
        : {};

  await updateDoc(pedidoRef, { estado, ...extra });

  if (!pedidoSnap.exists()) return;

  const pedido = pedidoSnap.data();
  const mesaId = pedido?.mesaId;
  const lineaIds =
    pedido?.lineaIds ??
    (pedido?.productos ?? []).map((p) => p.lineaId).filter(Boolean);

  if (!mesaId || !lineaIds?.length) return;

  const mesaRef = doc(db, colecciones.mesas, mesaId);
  const mesaSnap = await getDoc(mesaRef);
  if (!mesaSnap.exists()) return;

  const carrito = mesaSnap.data()?.carrito ?? [];
  const estadoLinea =
    estado === "entregado" ? "entregado" : estado === "listo" ? "listo" : estado;

  const idsSet = new Set(lineaIds);
  const carritoActualizado = carrito.map((linea) =>
    idsSet.has(linea.lineaId) ? { ...linea, estadoCocina: estadoLinea } : linea
  );

  await updateDoc(mesaRef, { carrito: carritoActualizado });
};

export const cancelarPedidosActivosMesa = async (mesaId, motivo) => {
  const snap = await getDocs(query(collection(db, colecciones.pedidos), where("mesaId", "==", mesaId)));
  const activos = new Set(["pendiente", "preparando", "listo"]);
  const updates = snap.docs
    .filter((d) => activos.has(d.data()?.estado))
    .map((d) =>
      updateDoc(d.ref, {
        estado: "cancelado",
        motivoCancelacion: motivo,
        canceladoEn: new Date().toISOString()
      })
    );
  await Promise.all(updates);
};

export const cancelarMesa = async ({ mesaId, motivo, usuario }) => {
  const mesa = await getMesa(mesaId);
  if (!mesa) throw new Error("Mesa no encontrada");

  await cancelarPedidosActivosMesa(mesaId, motivo);

  const ahora = new Date();
  await updateMesa(mesaId, {
    estado: "libre",
    carrito: [],
    total: 0,
    meseroAsignado: "",
    notasPedido: "",
    fechaApertura: null,
    ultimoEnvioCocina: null,
    cancelacion: {
      motivo,
      usuario,
      fecha: ahora.toLocaleDateString("es-GT"),
      hora: ahora.toLocaleTimeString("es-GT")
    }
  });
};

export const anularVenta = async ({ ventaId, motivo, usuario }) => {
  const venta = await getVentaById(ventaId);
  if (!venta) throw new Error("Venta no encontrada");
  if (venta.estado === "reembolsado") throw new Error("Esta venta ya fue reembolsada");
  if (venta.estado === "anulado") throw new Error("Esta venta ya está anulada");

  const ahora = new Date();
  await updateDoc(doc(db, colecciones.ventas, ventaId), {
    estado: "reembolsado",
    motivoReembolso: motivo,
    reembolsadoPor: usuario,
    fechaReembolso: ahora.toLocaleDateString("es-GT"),
    horaReembolso: ahora.toLocaleTimeString("es-GT")
  });

  return venta;
};

export const getProductosDisponibles = async () => {
  const snap = await getDocs(query(collection(db, colecciones.productos), where("disponible", "==", true), orderBy("nombre", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const normalizeInventoryDiscounts = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const inventarioId = String(item?.inventarioId ?? "").trim();
    const cantidad = Number(item?.cantidad ?? 0);
    if (!inventarioId || !Number.isFinite(cantidad) || cantidad <= 0) continue;

    const prev = map.get(inventarioId) ?? {
      inventarioId,
      cantidad: 0,
      nombre: item?.nombre ?? item?.producto ?? inventarioId,
      tipoInventario: item?.tipoInventario ?? null
    };
    prev.cantidad += cantidad;
    map.set(inventarioId, prev);
  }
  return [...map.values()];
};

const buildStockError = ({ item, data, disponible }) => {
  const requerido = Number(item.cantidad ?? 0);
  const nombre = data?.nombre ?? item.nombre ?? item.inventarioId;
  const unidad = data?.unidad ? ` ${data.unidad}` : "";
  return `Stock insuficiente de ${nombre}. Disponible: ${disponible}${unidad}. Requerido: ${requerido}${unidad}.`;
};

export const cobrarMesaConTicket = async ({ mesaId, ventaPayload, inventarioDescuentos }) => {
  const ticketRef = doc(db, colecciones.configuracion, "tickets");
  const mesaRef = doc(db, colecciones.mesas, mesaId);
  const ventaRef = doc(collection(db, colecciones.ventas));
  const descuentos = normalizeInventoryDiscounts(inventarioDescuentos ?? ventaPayload?.inventarioDescuentos ?? []);

  return runTransaction(db, async (tx) => {
    const ticketSnap = await tx.get(ticketRef);
    const mesaSnap = await tx.get(mesaRef);
    if (!mesaSnap.exists()) throw new Error("Mesa no encontrada");

    const inventarioSnaps = [];
    for (const item of descuentos) {
      const ref = doc(db, colecciones.inventario, item.inventarioId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error(`Producto de inventario no encontrado: ${item.nombre ?? item.inventarioId}`);
      inventarioSnaps.push({ item, ref, snap });
    }

    for (const entry of inventarioSnaps) {
      const data = entry.snap.data();
      const disponible = Number(data?.stock ?? 0);
      if (disponible < Number(entry.item.cantidad ?? 0)) {
        throw new Error(buildStockError({ item: entry.item, data, disponible }));
      }
    }

    const ultimoTicket = ticketSnap.exists() ? ticketSnap.data().ultimoTicket ?? 0 : 0;
    const correlativo = ultimoTicket + 1;
    const ticket = `TK-${String(correlativo).padStart(6, "0")}`;
    const ahora = new Date();
    const usuarioMovimiento = ventaPayload?.cobradoPor ?? ventaPayload?.usuario ?? ventaPayload?.mesero ?? "caja";
    const mesaData = mesaSnap.data();
    const carritoActual = Array.isArray(mesaData?.carrito) ? mesaData.carrito : [];
    const idsCobrados = new Set(ventaPayload?.lineaIdsCobradas ?? []);
    const indicesCobrados = new Set(ventaPayload?.indicesCobrados ?? []);
    const esParcial = ventaPayload?.parcial === true;
    const carritoRestante = esParcial
      ? carritoActual.filter((linea, index) => {
          const id = linea?.lineaId;
          return !(id ? idsCobrados.has(id) : indicesCobrados.has(index));
        })
      : [];
    const totalRestante = carritoRestante.reduce((sum, linea) => sum + Number(linea?.subtotal ?? 0), 0);

    tx.set(ticketRef, { ultimoTicket: correlativo }, { merge: true });
    tx.set(ventaRef, {
      ...ventaPayload,
      inventarioDescuentos: descuentos,
      inventarioAplicado: descuentos.length > 0,
      ticket,
      correlativo,
      fechaRegistro: serverTimestamp()
    });

    for (const entry of inventarioSnaps) {
      const data = entry.snap.data();
      const stockAnterior = Number(data?.stock ?? 0);
      const cantidad = Number(entry.item.cantidad ?? 0);
      const stockNuevo = stockAnterior - cantidad;
      tx.update(entry.ref, { stock: stockNuevo });
      tx.set(doc(collection(db, colecciones.movimientosInventario)), {
        inventarioId: entry.item.inventarioId,
        producto: data?.nombre ?? entry.item.nombre ?? entry.item.inventarioId,
        cantidad,
        tipoMovimiento: "venta",
        motivo: `Venta ${ticket}`,
        usuario: usuarioMovimiento,
        tipoInventario: data?.tipoInventario ?? entry.item.tipoInventario ?? "cocina",
        stockAnterior,
        stockNuevo,
        fecha: ahora.toLocaleDateString("es-GT"),
        hora: ahora.toLocaleTimeString("es-GT"),
        ventaId: ventaRef.id,
        ticket,
        fechaRegistro: serverTimestamp()
      });
    }

    tx.update(
      mesaRef,
      esParcial && carritoRestante.length
        ? {
            estado: "ocupada",
            total: totalRestante,
            carrito: carritoRestante,
            ultimoCobroParcial: {
              ticket,
              total: ventaPayload?.total ?? 0,
              fecha: ahora.toISOString()
            }
          }
        : {
            estado: "libre",
            total: 0,
            carrito: [],
            meseroAsignado: "",
            notasPedido: "",
            fechaApertura: null
          }
    );

    return { ticket, correlativo, ventaId: ventaRef.id };
  });
};

export const cargarMesaAHabitacion = async ({ mesaId, habitacionId, consumoPayload, inventarioDescuentos }) => {
  const mesaRef = doc(db, colecciones.mesas, mesaId);
  const habitacionRef = doc(db, colecciones.habitaciones, habitacionId);
  const cargoRef = doc(collection(db, colecciones.ventas));
  const descuentos = normalizeInventoryDiscounts(inventarioDescuentos ?? consumoPayload?.inventarioDescuentos ?? []);

  return runTransaction(db, async (tx) => {
    const mesaSnap = await tx.get(mesaRef);
    const habitacionSnap = await tx.get(habitacionRef);
    if (!mesaSnap.exists()) throw new Error("Mesa no encontrada");
    if (!habitacionSnap.exists()) throw new Error("Habitación no encontrada");
    const habitacion = habitacionSnap.data();
    if (habitacion?.estado && habitacion.estado !== "ocupada") throw new Error("La habitación no está ocupada");

    const inventarioSnaps = [];
    for (const item of descuentos) {
      const ref = doc(db, colecciones.inventario, item.inventarioId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error(`Producto de inventario no encontrado: ${item.nombre ?? item.inventarioId}`);
      inventarioSnaps.push({ item, ref, snap });
    }

    for (const entry of inventarioSnaps) {
      const data = entry.snap.data();
      const disponible = Number(data?.stock ?? 0);
      if (disponible < Number(entry.item.cantidad ?? 0)) {
        throw new Error(buildStockError({ item: entry.item, data, disponible }));
      }
    }

    const ahora = new Date();
    const cargo = {
      id: cargoRef.id,
      origen: consumoPayload?.origen ?? "Restaurante",
      mesa: consumoPayload?.mesa ?? mesaSnap.data()?.numero ?? mesaId,
      productos: consumoPayload?.productos ?? [],
      subtotal: consumoPayload?.subtotal ?? 0,
      total: consumoPayload?.total ?? 0,
      fecha: ahora.toLocaleDateString("es-GT"),
      hora: ahora.toLocaleTimeString("es-GT"),
      usuario: consumoPayload?.usuario ?? "caja",
      estado: "pendiente_checkout"
    };

    tx.set(cargoRef, {
      ...consumoPayload,
      habitacionId,
      habitacionNumero: habitacion.numero ?? "",
      inventarioDescuentos: descuentos,
      estado: "cargado_habitacion",
      fechaRegistro: serverTimestamp()
    });

    tx.update(habitacionRef, {
      consumos: [...(habitacion.consumos ?? []), cargo],
      totalConsumos: Number(habitacion.totalConsumos ?? 0) + Number(cargo.total ?? 0)
    });

    for (const entry of inventarioSnaps) {
      const data = entry.snap.data();
      const stockAnterior = Number(data?.stock ?? 0);
      const cantidad = Number(entry.item.cantidad ?? 0);
      const stockNuevo = stockAnterior - cantidad;
      tx.update(entry.ref, { stock: stockNuevo });
      tx.set(doc(collection(db, colecciones.movimientosInventario)), {
        inventarioId: entry.item.inventarioId,
        producto: data?.nombre ?? entry.item.nombre ?? entry.item.inventarioId,
        cantidad,
        tipoMovimiento: "venta",
        motivo: `Cargo habitación ${habitacion.numero ?? ""}`,
        usuario: consumoPayload?.usuario ?? "caja",
        tipoInventario: data?.tipoInventario ?? entry.item.tipoInventario ?? "cocina",
        stockAnterior,
        stockNuevo,
        fecha: ahora.toLocaleDateString("es-GT"),
        hora: ahora.toLocaleTimeString("es-GT"),
        ventaId: cargoRef.id,
        fechaRegistro: serverTimestamp()
      });
    }

    tx.update(mesaRef, {
      estado: "libre",
      total: 0,
      carrito: [],
      meseroAsignado: "",
      notasPedido: "",
      fechaApertura: null
    });

    return { cargoId: cargoRef.id };
  });
};

export const registrarMovimientoInventario = async (payload) =>
  addDoc(collection(db, colecciones.movimientosInventario), { ...payload, fechaRegistro: serverTimestamp() });

// ——— Categorías ———
export const listenCategorias = (callback) =>
  snapshotListener("categorias", query(collection(db, colecciones.categorias), orderBy("nombre", "asc")), callback);

export const saveCategoria = async (id, payload) => {
  if (id) {
    await updateDoc(doc(db, colecciones.categorias, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, colecciones.categorias), {
    ...payload,
    fechaCreacion: serverTimestamp()
  });
  return created.id;
};

export const removeCategoria = async (id) => deleteDoc(doc(db, colecciones.categorias, id));

// ——— Productos ———
export const listenProductos = (callback) =>
  snapshotListener("productos", query(collection(db, colecciones.productos), orderBy("nombre", "asc")), callback);

export const saveProducto = async (id, payload) => {
  if (id) {
    await updateDoc(doc(db, colecciones.productos, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, colecciones.productos), {
    ...payload,
    fechaCreacion: serverTimestamp()
  });
  return created.id;
};

export const removeProducto = async (id) => deleteDoc(doc(db, colecciones.productos, id));

// ——— Inventario ———
export const listenInventario = (callback) =>
  snapshotListener("inventario", query(collection(db, colecciones.inventario), orderBy("nombre", "asc")), callback);

export const listenMovimientosInventario = (callback) =>
  snapshotListener("movimientos_inventario", collection(db, colecciones.movimientosInventario), (items) => {
    const sorted = [...items].sort((a, b) => {
      const ta = a.fechaRegistro?.seconds ?? 0;
      const tb = b.fechaRegistro?.seconds ?? 0;
      return tb - ta;
    });
    callback(sorted.slice(0, 300));
  });

export const saveInventarioItem = async (id, payload) => {
  if (id) {
    await updateDoc(doc(db, colecciones.inventario, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, colecciones.inventario), {
    ...payload,
    fechaCreacion: serverTimestamp()
  });
  return created.id;
};

export const removeInventarioItem = async (id) => deleteDoc(doc(db, colecciones.inventario, id));

export const ajustarStockInventario = async ({
  inventarioId,
  cantidad,
  tipoMovimiento,
  motivo,
  usuario
}) => {
  const ref = doc(db, colecciones.inventario, inventarioId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      console.error("[firestore] Inventario no existe:", inventarioId);
      throw new Error("Producto de inventario no encontrado");
    }

    const snapData = snap.data();
    if (!snapData) throw new Error("Documento de inventario sin datos");

    const actual = Number(snapData.stock ?? 0);
    const cantidadNum = Number(cantidad ?? 0);
    let nuevo = actual;
    if (tipoMovimiento === "entrada" || tipoMovimiento === "reembolso") nuevo = actual + cantidadNum;
    else if (tipoMovimiento === "salida" || tipoMovimiento === "venta") nuevo = actual - cantidadNum;
    else nuevo = cantidadNum;

    if (nuevo < 0) throw new Error("El stock no puede quedar negativo");

    const ahora = new Date();
    tx.update(ref, { stock: nuevo });
    tx.set(doc(collection(db, colecciones.movimientosInventario)), {
      inventarioId,
      producto: snapData.nombre ?? inventarioId,
      cantidad: cantidadNum,
      tipoMovimiento,
      motivo,
      usuario,
      tipoInventario: snapData.tipoInventario ?? "cocina",
      stockAnterior: actual,
      stockNuevo: nuevo,
      fecha: ahora.toLocaleDateString("es-GT"),
      hora: ahora.toLocaleTimeString("es-GT"),
      fechaRegistro: serverTimestamp()
    });
    return nuevo;
  });
};

// ——— Usuarios ———
export const listenUsuarios = (callback) =>
  snapshotListener("usuarios", query(collection(db, colecciones.usuarios), orderBy("nombre", "asc")), callback);

export const saveUsuarioDoc = async (uid, payload) =>
  setDoc(
    doc(db, colecciones.usuarios, uid),
    { ...payload, fechaCreacion: payload.fechaCreacion ?? serverTimestamp() },
    { merge: true }
  );

export const removeUsuarioDoc = async (uid) => deleteDoc(doc(db, colecciones.usuarios, uid));

// ——— Ventas / historial ———
export const listenVentas = (callback, limitCount = 200) =>
  snapshotListener("ventas", query(collection(db, colecciones.ventas)), (items) => {
    const sorted = [...items].sort((a, b) => {
      const ta = a.fechaRegistro?.seconds ?? a.fechaRegistro ?? 0;
      const tb = b.fechaRegistro?.seconds ?? b.fechaRegistro ?? 0;
      return tb > ta ? 1 : -1;
    });
    callback(sorted.slice(0, limitCount));
  });

export const getVentaById = async (ventaId) => {
  const snap = await getDoc(doc(db, colecciones.ventas, ventaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};
