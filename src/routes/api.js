// =========================================
// PidaPues — rutas de la API (Express Router)
// =========================================

const express = require("express");
const pool = require("../db");
const {
  ROLES,
  crearToken,
  verificarPin,
  requireRol,
  estaBloqueado,
  minutosRestantesBloqueo,
  registrarIntento,
  MINUTOS_BLOQUEO,
} = require("../auth");

const router = express.Router();

// Express 4 no reenvía automáticamente los rechazos de promesas de un
// handler async al middleware de errores; este wrapper lo garantiza.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const TOTAL_MESAS = 8;
const MINUTOS_INACTIVIDAD_MESA = 30;
const METODOS_PAGO = ["efectivo", "tarjeta", "qr"];

/* ---------------------------------------------------------
   Utilidades
--------------------------------------------------------- */

function generarCodigoVerificacion() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
}

function aIso(fecha) {
  if (!fecha) return null;
  // dateStrings:true en mysql2 ya nos da "YYYY-MM-DD HH:mm:ss"
  return fecha.replace(" ", "T");
}

// Convierte una fila de `pedidos` (+ sus items) al formato que consume el frontend
function mapearPedido(fila, items) {
  const pedido = {
    id: fila.id,
    mesa: fila.mesa,
    items: items.map((i) => ({
      productoId: i.producto_id,
      cantidad: i.cantidad,
      observacion: i.observacion || "",
    })),
    total: fila.total,
    estado: fila.estado,
    metodoPago: fila.metodo_pago,
    pagado: !!fila.pagado,
    notificadoCocina: !!fila.notificado_cocina,
    fechaHoraRegistro: aIso(fila.fecha_registro),
    fechaHoraPago: aIso(fila.fecha_pago),
    fechaHoraInicioPreparacion: aIso(fila.fecha_inicio_preparacion),
    fechaHoraListo: aIso(fila.fecha_listo),
    fechaHoraEntregado: aIso(fila.fecha_entregado),
    factura: null,
  };

  if (fila.pagado) {
    pedido.factura = {
      numero: fila.factura_numero,
      fecha: aIso(fila.fecha_pago),
      cliente: fila.factura_cliente || "Consumidor final",
      razonSocial: fila.factura_razon_social,
      nit: fila.factura_nit,
      direccion: fila.factura_direccion,
      regimen: fila.factura_regimen,
      banco: fila.factura_banco,
      tipoCuenta: fila.factura_tipo_cuenta,
      numeroCuenta: fila.factura_numero_cuenta,
      titularCuenta: fila.factura_titular_cuenta,
    };
  }

  return pedido;
}

async function obtenerPedidoCompleto(id) {
  const [[fila]] = await pool.query("SELECT * FROM pedidos WHERE id = ?", [id]);
  if (!fila) return null;
  const [items] = await pool.query("SELECT * FROM pedido_items WHERE pedido_id = ?", [id]);
  return mapearPedido(fila, items);
}

// Libera mesas cuya última interacción supera MINUTOS_INACTIVIDAD_MESA.
// La usan tanto el endpoint GET /mesas como el monitor periódico del servidor.
async function liberarMesasInactivas() {
  await pool.query(
    `UPDATE mesas
     SET estado = 'libre', pedido_id = NULL, ultima_interaccion = NULL
     WHERE estado <> 'libre'
       AND ultima_interaccion IS NOT NULL
       AND ultima_interaccion < (NOW() - INTERVAL ? MINUTE)`,
    [MINUTOS_INACTIVIDAD_MESA]
  );
}

async function tocarMesa(numero) {
  await pool.query(
    "UPDATE mesas SET ultima_interaccion = NOW() WHERE numero = ? AND estado <> 'libre'",
    [numero]
  );
}

// RF011: la mesa pasa a "pago" en cuanto se crea el pedido (todavía sin
// verificar), para que ninguna otra persona pueda tomar esa misma mesa
// mientras el pago está en curso.
async function reservarMesaParaPago(numero, pedidoId) {
  await pool.query(
    "UPDATE mesas SET estado = 'pago', pedido_id = ?, ultima_interaccion = NOW() WHERE numero = ?",
    [pedidoId, numero]
  );
}

// RF011: al verificarse el pago, la mesa pasa de "pago" a "ocupada".
async function ocuparMesa(numero, pedidoId) {
  await pool.query(
    "UPDATE mesas SET estado = 'ocupada', pedido_id = ?, ultima_interaccion = NOW() WHERE numero = ?",
    [pedidoId, numero]
  );
}

async function liberarMesa(numero) {
  await pool.query(
    "UPDATE mesas SET estado = 'libre', pedido_id = NULL, ultima_interaccion = NULL WHERE numero = ?",
    [numero]
  );
}

/* ---------------------------------------------------------
   Acceso por PIN (Cocina / Mesero / Admin)
--------------------------------------------------------- */

router.post("/auth/login", asyncHandler(async (req, res) => {
  const { rol, pin } = req.body || {};
  if (!ROLES.includes(rol)) {
    return res.status(400).json({ error: "Rol inválido." });
  }

  // NF004: bloqueo tras 3 intentos fallidos consecutivos.
  if (estaBloqueado(rol)) {
    return res.status(423).json({
      error: `Acceso bloqueado por intentos fallidos. Intenta de nuevo en ${minutosRestantesBloqueo(rol)} minuto(s).`,
    });
  }

  const exito = verificarPin(rol, pin);
  const resultado = registrarIntento(rol, exito);

  // NF004: se registra fecha y hora de cada intento (éxito o fallo).
  await pool.query(
    "INSERT INTO intentos_acceso (rol, exito, bloqueado, ip, fecha_hora) VALUES (?, ?, ?, ?, NOW())",
    [rol, exito ? 1 : 0, resultado.bloqueado ? 1 : 0, req.ip || null]
  );

  if (!exito) {
    if (resultado.bloqueado) {
      return res.status(423).json({
        error: `PIN incorrecto. Se bloqueó el acceso por seguridad; intenta de nuevo en ${MINUTOS_BLOQUEO} minutos.`,
      });
    }
    return res.status(401).json({
      error: "PIN incorrecto.",
      intentosRestantes: resultado.intentosRestantes,
    });
  }

  const token = crearToken(rol);
  res.json({ token, rol });
}))

/* ---------------------------------------------------------
   Productos y datos del negocio
--------------------------------------------------------- */

router.get("/productos", asyncHandler(async (_req, res) => {
  const [filas] = await pool.query(
    "SELECT id, categoria, nombre, descripcion, precio, emoji, imagen_url FROM productos WHERE disponible = 1 ORDER BY id"
  );
  res.json(filas.map((p) => ({ ...p, imagenUrl: p.imagen_url })));
}))

router.get("/negocio", asyncHandler(async (_req, res) => {
  const [[fila]] = await pool.query("SELECT * FROM negocio WHERE id = 1");
  if (!fila) return res.status(404).json({ error: "No hay datos del negocio configurados." });
  res.json({
    razonSocial: fila.razon_social,
    nit: fila.nit,
    direccion: fila.direccion,
    regimen: fila.regimen,
    banco: fila.banco,
    tipoCuenta: fila.tipo_cuenta,
    numeroCuenta: fila.numero_cuenta,
    titularCuenta: fila.titular_cuenta,
  });
}))

/* ---------------------------------------------------------
   Mesas
--------------------------------------------------------- */

router.get("/mesas", asyncHandler(async (_req, res) => {
  await liberarMesasInactivas();
  const [filas] = await pool.query("SELECT * FROM mesas ORDER BY numero");
  res.json(
    filas.map((m) => ({
      numero: m.numero,
      estado: m.estado,
      pedidoId: m.pedido_id,
      ultimaInteraccion: aIso(m.ultima_interaccion),
    }))
  );
}))

/* ---------------------------------------------------------
   Pedidos — lectura (filtrada por rol)
--------------------------------------------------------- */

router.get("/pedidos", asyncHandler(async (req, res) => {
  const rol = req.query.rol || "admin";

  // Exige el token del rol que se está pidiendo ver (admin puede ver todo).
  let autorizado = false;
  requireRol(rol)(req, res, () => { autorizado = true; });
  if (!autorizado) return; // requireRol ya respondió con 401/403

  let filas;

  if (rol === "cocina") {
    [filas] = await pool.query(
      "SELECT * FROM pedidos WHERE pagado = 1 AND estado IN ('pendiente','en_preparacion','listo') ORDER BY fecha_registro ASC"
    );
  } else if (rol === "mesero") {
    [filas] = await pool.query(
      "SELECT * FROM pedidos WHERE pagado = 1 AND estado = 'listo' ORDER BY fecha_listo ASC"
    );
  } else {
    // admin / reportes: todo, más reciente primero
    [filas] = await pool.query("SELECT * FROM pedidos ORDER BY fecha_registro DESC");
  }

  const resultado = [];
  for (const fila of filas) {
    const [items] = await pool.query("SELECT * FROM pedido_items WHERE pedido_id = ?", [fila.id]);
    resultado.push(mapearPedido(fila, items));
  }
  res.json(resultado);
}))

router.get("/pedidos/:id", asyncHandler(async (req, res) => {
  const pedido = await obtenerPedidoCompleto(Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado." });
  res.json(pedido);
}))

/* ---------------------------------------------------------
   Pedidos — creación (queda "pendiente_pago", NO llega a cocina)
--------------------------------------------------------- */

router.post("/pedidos", asyncHandler(async (req, res) => {
  const { mesa, items, metodoPago, datosFactura } = req.body || {};

  const numeroMesa = Number(mesa);
  if (!numeroMesa || numeroMesa < 1 || numeroMesa > TOTAL_MESAS) {
    return res.status(400).json({ error: `Mesa inválida (1 a ${TOTAL_MESAS}).` });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El pedido no tiene productos." });
  }
  if (!METODOS_PAGO.includes(metodoPago)) {
    return res.status(400).json({ error: "Método de pago inválido." });
  }

  // RF011: no se puede iniciar un pedido en una mesa que ya está en uso
  // (con pago en curso o ya ocupada por otro pedido).
  await liberarMesasInactivas();
  const [[filaMesa]] = await pool.query("SELECT estado FROM mesas WHERE numero = ?", [numeroMesa]);
  if (!filaMesa) {
    return res.status(400).json({ error: "La mesa indicada no existe." });
  }
  if (filaMesa.estado !== "libre") {
    return res.status(409).json({ error: `La mesa ${numeroMesa} ya está en uso. Elige otra mesa.` });
  }

  // El total SIEMPRE se calcula en el servidor con el precio real del
  // producto — nunca se confía en un total enviado desde el cliente.
  const [productosDb] = await pool.query("SELECT id, precio FROM productos WHERE disponible = 1");
  const precios = new Map(productosDb.map((p) => [p.id, p.precio]));

  let total = 0;
  for (const item of items) {
    const precio = precios.get(Number(item.productoId));
    if (precio == null || !item.cantidad || item.cantidad < 1) {
      return res.status(400).json({ error: "Uno de los productos del pedido no es válido." });
    }
    total += precio * item.cantidad;
  }

  const codigo = generarCodigoVerificacion();
  const nombreCliente = (datosFactura && datosFactura.nombreCliente) || null;

  const [resultado] = await pool.query(
    `INSERT INTO pedidos (mesa, total, estado, metodo_pago, pagado, codigo_verificacion,
                           factura_cliente, fecha_registro)
     VALUES (?, ?, 'pendiente_pago', ?, 0, ?, ?, NOW())`,
    [numeroMesa, total, metodoPago, codigo, nombreCliente]
  );
  const pedidoId = resultado.insertId;

  for (const item of items) {
    await pool.query(
      "INSERT INTO pedido_items (pedido_id, producto_id, cantidad, observacion) VALUES (?, ?, ?, ?)",
      [pedidoId, Number(item.productoId), item.cantidad, item.observacion || null]
    );
  }

  // RF011: reserva la mesa (estado "pago") mientras se verifica el pago.
  await reservarMesaParaPago(numeroMesa, pedidoId);

  const pedido = await obtenerPedidoCompleto(pedidoId);

  // En una pasarela real este código se enviaría por SMS/notificación de la
  // app del banco. Aquí lo devolvemos para poder simular esa pantalla en
  // el prototipo, pero NUNCA se usa para saltarse la verificación: solo el
  // servidor decide si el pago queda confirmado.
  res.status(201).json({ pedido, codigoVerificacionDemo: codigo });
}))

/* ---------------------------------------------------------
   Pedidos — verificación segura del pago
--------------------------------------------------------- */

router.post("/pedidos/:id/verificar-pago", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const codigo = String((req.body && req.body.codigo) || "").trim();

  const [[fila]] = await pool.query("SELECT * FROM pedidos WHERE id = ?", [id]);
  if (!fila) return res.status(404).json({ error: "Pedido no encontrado." });
  if (fila.pagado) return res.status(409).json({ error: "Este pedido ya fue verificado." });
  if (fila.bloqueado) {
    return res.status(423).json({ error: "Demasiados intentos fallidos. Solicita un nuevo código." });
  }

  if (codigo !== fila.codigo_verificacion) {
    const intentos = fila.intentos_verificacion + 1;
    const bloquear = intentos >= 3;
    await pool.query(
      "UPDATE pedidos SET intentos_verificacion = ?, bloqueado = ? WHERE id = ?",
      [intentos, bloquear ? 1 : 0, id]
    );
    return res.status(400).json({
      error: bloquear
        ? "Código incorrecto. Se bloqueó por seguridad; solicita un nuevo código."
        : "Código incorrecto.",
      intentosRestantes: Math.max(0, 3 - intentos),
      bloqueado: bloquear,
    });
  }

  const [[negocio]] = await pool.query("SELECT * FROM negocio WHERE id = 1");
  const numeroFactura = "FE-" + (5000 + id);

  await pool.query(
    `UPDATE pedidos SET
       pagado = 1,
       estado = 'pendiente',
       fecha_pago = NOW(),
       factura_numero = ?,
       factura_razon_social = ?,
       factura_nit = ?,
       factura_direccion = ?,
       factura_regimen = ?,
       factura_banco = ?,
       factura_tipo_cuenta = ?,
       factura_numero_cuenta = ?,
       factura_titular_cuenta = ?
     WHERE id = ?`,
    [
      numeroFactura,
      negocio.razon_social,
      negocio.nit,
      negocio.direccion,
      negocio.regimen,
      negocio.banco,
      negocio.tipo_cuenta,
      negocio.numero_cuenta,
      negocio.titular_cuenta,
      id,
    ]
  );

  await ocuparMesa(fila.mesa, id);

  const pedido = await obtenerPedidoCompleto(id);
  res.json(pedido);
}))

router.post("/pedidos/:id/reenviar-codigo", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [[fila]] = await pool.query("SELECT * FROM pedidos WHERE id = ?", [id]);
  if (!fila) return res.status(404).json({ error: "Pedido no encontrado." });
  if (fila.pagado) return res.status(409).json({ error: "Este pedido ya fue verificado." });

  const nuevoCodigo = generarCodigoVerificacion();
  await pool.query(
    "UPDATE pedidos SET codigo_verificacion = ?, intentos_verificacion = 0, bloqueado = 0 WHERE id = ?",
    [nuevoCodigo, id]
  );
  await tocarMesa(fila.mesa); // extiende el tiempo antes de liberar la mesa por inactividad
  res.json({ codigoVerificacionDemo: nuevoCodigo });
}))

/* ---------------------------------------------------------
   Pedidos — flujo de cocina (pendiente -> en_preparacion -> listo)
--------------------------------------------------------- */

router.patch("/pedidos/:id/cocina", requireRol("cocina"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const nuevoEstado = req.body && req.body.estado;
  if (!["en_preparacion", "listo"].includes(nuevoEstado)) {
    return res.status(400).json({ error: "Estado no permitido desde cocina." });
  }

  const [[fila]] = await pool.query("SELECT * FROM pedidos WHERE id = ?", [id]);
  if (!fila) return res.status(404).json({ error: "Pedido no encontrado." });
  if (!fila.pagado) return res.status(409).json({ error: "El pedido aún no tiene el pago verificado." });

  const transicionesValidas = { pendiente: "en_preparacion", en_preparacion: "listo" };
  if (transicionesValidas[fila.estado] !== nuevoEstado) {
    return res.status(409).json({ error: `No se puede pasar de "${fila.estado}" a "${nuevoEstado}".` });
  }

  const campoFecha = nuevoEstado === "en_preparacion" ? "fecha_inicio_preparacion" : "fecha_listo";
  await pool.query(
    `UPDATE pedidos SET estado = ?, ${campoFecha} = NOW() WHERE id = ?`,
    [nuevoEstado, id]
  );
  await tocarMesa(fila.mesa);

  res.json(await obtenerPedidoCompleto(id));
}))

router.post("/pedidos/:id/notificado", requireRol("cocina"), asyncHandler(async (req, res) => {
  await pool.query("UPDATE pedidos SET notificado_cocina = 1 WHERE id = ?", [Number(req.params.id)]);
  res.json({ ok: true });
}))

/* ---------------------------------------------------------
   Pedidos — entrega del mesero (listo -> entregado)
--------------------------------------------------------- */

router.patch("/pedidos/:id/entregar", requireRol("mesero"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [[fila]] = await pool.query("SELECT * FROM pedidos WHERE id = ?", [id]);
  if (!fila) return res.status(404).json({ error: "Pedido no encontrado." });
  if (fila.estado !== "listo") {
    return res.status(409).json({ error: 'Solo se pueden entregar pedidos en estado "listo".' });
  }

  await pool.query("UPDATE pedidos SET estado = 'entregado', fecha_entregado = NOW() WHERE id = ?", [id]);
  await liberarMesa(fila.mesa);

  res.json(await obtenerPedidoCompleto(id));
}))

/* ---------------------------------------------------------
   Demo
--------------------------------------------------------- */

router.delete("/demo", requireRol("admin"), asyncHandler(async (_req, res) => {
  await pool.query("DELETE FROM pedidos"); // ON DELETE CASCADE limpia pedido_items
  await pool.query("UPDATE mesas SET estado='libre', pedido_id=NULL, ultima_interaccion=NULL");
  res.json({ ok: true });
}))

module.exports = { router, liberarMesasInactivas };
