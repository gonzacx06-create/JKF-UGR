const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./jornadas.db');

// Mostrar todas las inscripciones
db.all("SELECT * FROM inscripciones", (err, rows) => {
  if (err) {
    console.error('❌ Error al leer la tabla:', err.message);
    return;
  }
  
  if (rows.length === 0) {
    console.log('📭 No hay inscripciones guardadas en la base de datos.');
  } else {
    console.log(`✅ Se encontraron ${rows.length} inscripciones:`);
    console.table(rows);
  }
  
  // También mostrar las charlas para referencia
  db.all("SELECT * FROM charlas", (err, charlas) => {
    if (err) {
      console.error('❌ Error al leer charlas:', err.message);
      return;
    }
    console.log('\n📋 Charlas disponibles:');
    console.table(charlas);
    db.close();
  });
});