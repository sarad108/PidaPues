// =========================================
// PidaPues — administración de empleados (cédula + PIN personal)
// =========================================
//
// Uso (desde la carpeta del proyecto, con la base ya creada):
//   node scripts/empleados.js crear            -> crea un empleado (pregunta los datos)
//   node scripts/empleados.js pin <cedula>     -> cambia el PIN de un empleado
//   node scripts/empleados.js desactivar <cedula>  -> ya no puede entrar (conserva su historial)
//   node scripts/empleados.js activar <cedula>
//   node scripts/empleados.js listar
//
// El PIN se guarda hasheado (scrypt) en usuario.pin; nunca en texto plano.

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const readline = require("readline/promises");
const pool = require("../src/db");
const { hashPin } = require("../src/auth");

const ROLES_DB = { cocina: "Cocina", mesero: "Mesero", administrador: "Administrador", admin: "Administrador" };

async function preguntar(rl, texto) {
  return (await rl.question(texto)).trim();
}

async function crear() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const nombre = await preguntar(rl, "Primer nombre: ");
    const apellido = await preguntar(rl, "Primer apellido: ");
    const cedula = await preguntar(rl, "Cédula: ");
    const correo = await preguntar(rl, "Correo electrónico: ");
    const rolTxt = (await preguntar(rl, "Rol (cocina / mesero / administrador): ")).toLowerCase();
    const pin = await preguntar(rl, "PIN (4 a 8 dígitos): ");

    if (!nombre || !apellido) throw new Error("El nombre y el apellido son obligatorios.");
    if (!/^[A-Za-z0-9]{5,15}$/.test(cedula)) throw new Error("La cédula debe tener entre 5 y 15 letras o números.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 50) throw new Error("Correo inválido (máximo 50 caracteres).");
    if (!ROLES_DB[rolTxt]) throw new Error("Rol inválido. Usa: cocina, mesero o administrador.");
    if (!/^[0-9]{4,8}$/.test(pin)) throw new Error("El PIN debe tener entre 4 y 8 dígitos.");

    const [[rol]] = await pool.query("SELECT id_rol FROM rol WHERE nombre_rol = ?", [ROLES_DB[rolTxt]]);
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      // nombre_usuario = la cédula (único y fácil de relacionar con la persona)
      const [u] = await conexion.query(
        `INSERT INTO usuario (nombre_usuario, contrasena, pin, fecha_registro, correo_electronico)
         VALUES (?, '!', ?, CURDATE(), ?)`,
        [cedula, hashPin(pin), correo]
      );
      await conexion.query(
        `INSERT INTO empleado (id_usuario, id_rol, primer_nombre, primer_apellido, cedula, correo_electronico, activo)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [u.insertId, rol.id_rol, nombre.slice(0, 25), apellido.slice(0, 25), cedula, correo]
      );
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      if (error.code === "ER_DUP_ENTRY") throw new Error("Ya existe un empleado/usuario con esa cédula o ese correo.");
      throw error;
    } finally {
      conexion.release();
    }
    console.log(`✅ Empleado creado: ${nombre} ${apellido} (${ROLES_DB[rolTxt]}). Entra con su cédula y su PIN.`);
  } finally {
    rl.close();
  }
}

async function cambiarPin(cedula) {
  if (!cedula) throw new Error("Falta la cédula: node scripts/empleados.js pin <cedula>");
  const [[emp]] = await pool.query("SELECT id_usuario FROM empleado WHERE cedula = ?", [cedula]);
  if (!emp) throw new Error("No existe un empleado con esa cédula.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const pin = await preguntar(rl, "Nuevo PIN (4 a 8 dígitos): ");
    if (!/^[0-9]{4,8}$/.test(pin)) throw new Error("El PIN debe tener entre 4 y 8 dígitos.");
    await pool.query("UPDATE usuario SET pin = ? WHERE id_usuario = ?", [hashPin(pin), emp.id_usuario]);
    console.log("✅ PIN actualizado.");
  } finally {
    rl.close();
  }
}

async function cambiarActivo(cedula, activo) {
  if (!cedula) throw new Error("Falta la cédula.");
  const [r] = await pool.query("UPDATE empleado SET activo = ? WHERE cedula = ?", [activo, cedula]);
  if (r.affectedRows === 0) throw new Error("No existe un empleado con esa cédula.");
  console.log(activo ? "✅ Empleado activado." : "✅ Empleado desactivado: ya no puede entrar.");
}

async function listar() {
  const [filas] = await pool.query(
    `SELECT e.cedula, e.primer_nombre, e.primer_apellido, r.nombre_rol, e.activo
       FROM empleado e JOIN rol r ON r.id_rol = e.id_rol ORDER BY e.id_empleado`
  );
  console.table(filas.map((f) => ({
    cedula: f.cedula,
    nombre: `${f.primer_nombre} ${f.primer_apellido}`,
    rol: f.nombre_rol,
    activo: f.activo ? "sí" : "no",
  })));
}

(async () => {
  const [comando, arg] = process.argv.slice(2);
  try {
    if (comando === "crear") await crear();
    else if (comando === "pin") await cambiarPin(arg);
    else if (comando === "desactivar") await cambiarActivo(arg, 0);
    else if (comando === "activar") await cambiarActivo(arg, 1);
    else if (comando === "listar") await listar();
    else console.log("Comandos: crear | pin <cedula> | desactivar <cedula> | activar <cedula> | listar");
  } catch (error) {
    console.error("❌", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
