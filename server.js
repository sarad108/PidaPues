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

app.listen(PORT, async () => {
  console.log(`PidaPues escuchando en el puerto ${PORT}`);

  try {
    // 1. Probar la conexión básica
    await pool.query("SELECT 1");
    console.log("✅ Conexión a MySQL correcta.");

    // 2. Leer e inyectar el schema.sql automáticamente
    const fs = require("fs");
    const schemaPath = path.join(__dirname, "src", "schema.sql");
    
    if (fs.existsSync(schemaPath)) {
      console.log("Leyendo archivo schema.sql para cargar productos...");
      const sqlScript = fs.readFileSync(schemaPath, "utf8");
      
      // Separamos el archivo por cada punto y coma (;) para ejecutar consulta por consulta
      const queries = sqlScript
        .split(";")
        .map(q => q.trim())
        .filter(q => q.length > 0);

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
