// =========================================
// PidaPues — conexión a MySQL (Producción + Local)
// =========================================

const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pidapues",
  
  // TRUCO CLAVE: Activa el SSL seguro solo cuando esté corriendo en internet (Render)
  ssl: process.env.DB_HOST && process.env.DB_HOST !== "localhost" 
    ? { rejectUnauthorized: false } 
    : null,

  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // fechas como string "YYYY-MM-DD HH:mm:ss"
});

module.exports = pool;
