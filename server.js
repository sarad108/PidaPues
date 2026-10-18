// =========================================
// PidaPues — servidor (API + frontend estático)
// =========================================

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const { router: apiRouter, liberarMesasInactivas } = require("./src/routes/api");
const pool = require("./src/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

// Frontend estático (index, menu, cocina, mesero, admin, pago, css, js, img)
app.use(express.static(path.join(__dirname, "public")));

// Manejo simple de errores async no capturados en las rutas
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

// Arrancar el servidor e inyectar el schema automáticamente
app.listen(PORT, async () => {
  console.log(`PidaPues escuchando en el puerto ${PORT}`);

  try {
    // 1. Probar la conexión básica con Aiven
    await pool.query("SELECT 1");
    console.log("✅ Conexión a MySQL correcta.");

    // 2. Leer e inyectar el archivo schema.sql limpiando comentarios
    const fs = require("fs");
    const schemaPath = path.join(__dirname, "src", "schema.sql");
    
    if (fs.existsSync(schemaPath)) {
      console.log("Leyendo archivo schema.sql para cargar productos...");
      let sqlScript = fs.readFileSync(schemaPath, "utf8");
      
      // Eliminamos comentarios de una sola línea (-- ...) y líneas vacías
      const lineasLimpias = sqlScript
        .split("\n")
        .map(linea => linea.trim())
        .filter(linea => !linea.startsWith("--") && !linea.startsWith("#") && linea.length > 0);

      // Volvemos a unir el script limpio
      const scriptSinComentarios = lineasLimpias.join(" ");

      // Separamos por cada punto y coma (;) de forma segura
      const queries = scriptSinComentarios
        .split(";")
        .map(q => q.trim())
        .filter(q => q.length > 0);

      console.log(`Ejecutando ${queries.length} consultas en la base de datos...`);
      for (const query of queries) {
        await pool.query(query);
      }
      console.log("✅ ¡Estructura y productos cargados con éxito en la nube!");
    }
  } catch (err) {
    console.error("\n❌ Error inicializando el schema en la nube:");
    console.error("Motivo:", err.message);
  }
});

// Libera mesas inactivas (30 min) cada minuto, sin depender de que
// haya alguna pantalla abierta consultando la API.
setInterval(() => {
  liberarMesasInactivas().catch((err) => console.error("Error liberando mesas:", err));
}, 60 * 1000);
