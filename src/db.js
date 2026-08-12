// =========================================
// PidaPues — conexión a MySQL
// =========================================

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pidapues",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // fechas como string "YYYY-MM-DD HH:mm:ss" (más fácil de manejar en JS)
});

module.exports = pool;
