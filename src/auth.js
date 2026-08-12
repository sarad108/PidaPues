// =========================================
// PidaPues — acceso por PIN para Cocina, Mesero y Admin
// =========================================
//
// Es intencionalmente simple (un PIN compartido por módulo, no usuarios
// individuales): al validar el PIN se entrega un token de sesión que se
// guarda en memoria en el servidor (se pierde si el servidor se reinicia,
// lo cual está bien para este caso de uso). Ese token viaja en el header
// `x-pidapues-token` y protege tanto las pantallas como los endpoints de
// la API — así, aunque alguien abra la URL de cocina.html directamente,
// no puede ver ni modificar datos sin el token válido.

const crypto = require("crypto");

const ROLES = ["cocina", "mesero", "admin"];
const HORAS_EXPIRACION = 12;

const PINES = {
  cocina: process.env.PIN_COCINA,
  mesero: process.env.PIN_MESERO,
  admin: process.env.PIN_ADMIN,
};

// token -> { rol, expira }
const tokens = new Map();

function limpiarExpirados() {
  const ahora = Date.now();
  for (const [token, datos] of tokens) {
    if (datos.expira < ahora) tokens.delete(token);
  }
}

function crearToken(rol) {
  limpiarExpirados();
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, { rol, expira: Date.now() + HORAS_EXPIRACION * 60 * 60 * 1000 });
  return token;
}

function verificarPin(rol, pin) {
  const esperado = PINES[rol];
  return !!esperado && String(pin || "").trim() === String(esperado);
}

// -----------------------------------------------------------------
// NF004 — bloqueo tras 3 intentos fallidos consecutivos por módulo.
// Se guarda en memoria del servidor (igual que los tokens); el
// registro persistente de cada intento con fecha/hora vive en la
// tabla `intentos_acceso` (lo escribe el router en /auth/login).
// -----------------------------------------------------------------
const INTENTOS_MAXIMOS = 3;
const MINUTOS_BLOQUEO = 5;

// rol -> { fallidos, bloqueadoHasta }
const intentosPorRol = new Map();

function estaBloqueado(rol) {
  const datos = intentosPorRol.get(rol);
  if (!datos || !datos.bloqueadoHasta) return false;
  if (datos.bloqueadoHasta < Date.now()) {
    // El bloqueo ya expiró: se libera y se reinicia el contador.
    intentosPorRol.delete(rol);
    return false;
  }
  return true;
}

function minutosRestantesBloqueo(rol) {
  const datos = intentosPorRol.get(rol);
  if (!datos || !datos.bloqueadoHasta) return 0;
  return Math.max(1, Math.ceil((datos.bloqueadoHasta - Date.now()) / 60000));
}

// Registra el resultado de un intento de login y aplica el bloqueo
// cuando corresponde. Devuelve si este intento activó el bloqueo, para
// que el router pueda anotarlo también en la bitácora de la base de datos.
function registrarIntento(rol, exito) {
  if (exito) {
    intentosPorRol.delete(rol);
    return { bloqueado: false };
  }

  const datos = intentosPorRol.get(rol) || { fallidos: 0, bloqueadoHasta: null };
  datos.fallidos += 1;

  if (datos.fallidos >= INTENTOS_MAXIMOS) {
    datos.bloqueadoHasta = Date.now() + MINUTOS_BLOQUEO * 60 * 1000;
    intentosPorRol.set(rol, datos);
    return { bloqueado: true, intentosRestantes: 0 };
  }

  intentosPorRol.set(rol, datos);
  return { bloqueado: false, intentosRestantes: INTENTOS_MAXIMOS - datos.fallidos };
}

// Exige un token válido; además, si se pasan roles, exige que el token
// pertenezca a uno de esos roles (el rol "admin" siempre tiene acceso,
// ya que en un restaurante real el administrador puede resolver
// cualquier pantalla).
function requireRol(...rolesPermitidos) {
  return (req, res, next) => {
    const token = req.headers["x-pidapues-token"];
    const datos = token && tokens.get(token);

    if (!datos || datos.expira < Date.now()) {
      return res.status(401).json({ error: "Sesión inválida o expirada. Ingresa el PIN nuevamente." });
    }

    const permitido = datos.rol === "admin" || rolesPermitidos.length === 0 || rolesPermitidos.includes(datos.rol);
    if (!permitido) {
      return res.status(403).json({ error: "No tienes permiso para acceder a este módulo." });
    }

    req.rolAutenticado = datos.rol;
    next();
  };
}

module.exports = {
  ROLES,
  crearToken,
  verificarPin,
  requireRol,
  estaBloqueado,
  minutosRestantesBloqueo,
  registrarIntento,
  MINUTOS_BLOQUEO,
};
