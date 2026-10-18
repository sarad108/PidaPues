const fs = require('fs');
const mysql = require('mysql2/promise');

(async () => {
  console.log('Conectando a la base de datos de Aiven...');
  
  const connection = await mysql.createConnection({
    host: 'mysql-2c4474dd-pidapues2026.i.aivencloud.com',
    port: 22319,
    user: 'avnadmin',
    password: 'AVNS_o0gTARh73hnorxr0Ac_',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false },
    multipleStatements: true
  });

  console.log('Leyendo el archivo schema.sql...');
  const sql = fs.readFileSync('src/schema.sql', 'utf8');
  
  console.log('Inyectando las tablas en la nube...');
  await connection.query(sql);
  
  console.log('✅ ¡Tablas e historial del schema creados en Aiven con éxito, parce!');
  process.exit(0);
})().catch(err => {
  console.error('❌ Error al subir el schema:', err.message);
  process.exit(1);
});
