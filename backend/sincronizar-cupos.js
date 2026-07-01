const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/jornadas',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

(async () => {
  const client = await pool.connect();
  try {
    // Actualizar cada charla con el conteo real de inscripciones
    await client.query(`
      UPDATE charlas c
      SET inscritos = (
        SELECT COUNT(*) FROM inscripciones i WHERE i.charla_id = c.id
      )
    `);
    console.log('✅ Cupos sincronizados correctamente');
  } catch (err) {
    console.error('❌ Error sincronizando cupos:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
})();