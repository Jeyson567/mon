import {
  collection,
  doc,
  getDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/config.js";
import { colecciones, registrarMovimientoInventario } from "../firebase/firestore.js";

export const descontarInventarioPorVenta = async ({
  productosVendidos,
  usuario,
  permitirSinStock = false
}) => {
  await runTransaction(db, async (tx) => {
    for (const item of productosVendidos) {
      const inventarioConfig = item.inventarioConfig ?? [];
      for (const insumo of inventarioConfig) {
        const qRef = doc(collection(db, colecciones.inventario), insumo.productoInventario);
        const snap = await tx.get(qRef);
        if (!snap.exists()) continue;
        const data = snap.data();
        const nuevoStock = (data.stock ?? 0) - Number(insumo.cantidad ?? 0) * Number(item.cantidad ?? 1);
        if (nuevoStock < 0 && !permitirSinStock) throw new Error(`Stock insuficiente de ${insumo.productoInventario}`);
        tx.update(qRef, { stock: Math.max(nuevoStock, 0) });
      }
    }
  });

  for (const item of productosVendidos) {
    for (const insumo of item.inventarioConfig ?? []) {
      await registrarMovimientoInventario({
        producto: insumo.productoInventario,
        cantidad: insumo.cantidad * (item.cantidad ?? 1),
        tipoMovimiento: "venta",
        motivo: `Venta ${item.nombre}`,
        usuario,
        fecha: new Date().toLocaleDateString("es-GT"),
        hora: new Date().toLocaleTimeString("es-GT")
      });
    }
  }
};
