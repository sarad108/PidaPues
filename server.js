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
  console.log(`PidaPues escuchando en http://localhost:${PORT}`);

  try {
    await pool.query("SELECT 1");
    console.log("✅ Conexión a MySQL correcta (base de datos:", process.env.DB_NAME || "pidapues", ")");
  } catch (err) {
    console.error("\n❌ No se pudo conectar a MySQL. El sitio va a cargar pero SIN datos.");
    console.error("   Motivo:", err.code || err.message);
    console.error("   Revisa lo siguiente:");
    console.error("   1) ¿Está corriendo MySQL en tu máquina?");
    console.error("   2) ¿Existe el archivo .env con DB_HOST/DB_USER/DB_PASSWORD/DB_NAME correctos?");
    console.error("   3) ¿Ya ejecutaste `mysql -u root -p < src/schema.sql` para crear la base 'pidapues'?\n");
  }
});

// Libera mesas inactivas (30 min) cada minuto, sin depender de que
// haya alguna pantalla abierta consultando la API.
setInterval(() => {
  liberarMesasInactivas().catch((err) => console.error("Error liberando mesas:", err));
}, 60 * 1000);
