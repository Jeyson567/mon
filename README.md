# Restaurant System (Base Profesional)

Sistema web modular para restaurante usando:

- HTML5
- TailwindCSS
- JavaScript Vanilla moderno (ES Modules)
- Firebase Authentication
- Firestore Database

## Flujo implementado

1. Login por correo y contrasena con Firebase Auth.
2. Carga de perfil desde `usuarios/{uid}`.
3. Redireccion por rol (`admin`, `mesero`, `cocina`, `caja`).
4. Control de acceso por modulo.
5. Base en tiempo real con `onSnapshot` para mesas y cocina.

## Archivos clave

- `firebase/config.js`: inicializacion modular (`initializeApp`, `getAuth`, `getFirestore`).
- `firebase/firestore.js`: helpers de colecciones, listeners y transaccion de ticket.
- `js/auth.js`: login y validacion de usuario activo.
- `js/app.js`: sesion, sidebar dinamico y logout seguro.
- `modules/cocina/cocina.js`: monitor en tiempo real + sonido nuevos pedidos.
- `js/inventory.js`: descuento automatico de stock por venta.
- `firestore.rules`: reglas base por rol.

## Configuracion Firebase (HTML + Live Server, sin npm)

Credenciales en `firebase/credentials.js` → importadas por `firebase/config.js` al cargar cualquier módulo.

- SDK CDN: **10.12.2** (`https://www.gstatic.com/firebasejs/10.12.2/`)
- `storageBucket`: `car-wash-edad9.appspot.com`
- Sin npm, Vite ni bundlers

## Panel administrativo (`/modules/admin/admin.html`)

Solo rol **admin** puede crear/editar/eliminar desde la interfaz:

| Pestaña | Acciones |
|---------|----------|
| Productos | Agregar, editar, eliminar, configurar inventario por venta |
| Categorías | Agregar, editar, eliminar |
| Mesas | Agregar, editar, eliminar (tiempo real) |
| Inventario | Agregar, editar, ajustar stock, eliminar |
| Usuarios | Crear (Auth + Firestore), editar, eliminar doc |

**Orden recomendado al empezar:** Categorías → Inventario → Productos → Mesas → Usuarios.

Mesero ve el menú en la pestaña **Menú** (datos en vivo desde Firestore).

## Configuracion requerida (Firestore)
2. Crear colecciones:
   - `usuarios`
   - `mesas`
   - `pedidos`
   - `productos`
   - `categorias`
   - `ventas`
   - `cierres_caja`
   - `configuracion`
   - `notificaciones`
   - `inventario`
   - `movimientos_inventario`
3. Crear documento `configuracion/tickets` con:
   ```json
   { "ultimoTicket": 0 }
   ```
4. Subir audio a `sounds/new-order.mp3`.

## Login: requisitos del documento usuario

El documento **debe** existir en `usuarios/{uid}` donde `{uid}` es el mismo UID de Firebase Authentication (no el correo).

Campos mínimos:

```json
{
  "nombre": "Admin",
  "correo": "admin@correo.com",
  "rol": "admin",
  "activo": true
}
```

Roles válidos: `admin`, `mesero`, `cocina`, `caja`.

## Depuración de login

Abre DevTools → Console y busca logs con prefijos:

- `[auth]`
- `[auth-session]`
- `[firestore]`
- `[roles]`

Si el loader no desaparece, revisa permisos de lectura en `usuarios/{uid}` en Firestore Rules.

## Nota

Esta entrega deja una base profesional lista para ampliar CRUDs y reportes de cada modulo sin frameworks pesados.
