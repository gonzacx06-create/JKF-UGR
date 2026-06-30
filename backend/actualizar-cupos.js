const { Pool } = require('pg');

// Usa la URL de Render directamente
const pool = new Pool({
  connectionString: 'postgresql://jornadas_user:qfx6y7qKryzAF0ac97aQ28NdtLbixBmx@dpg-d91vn0mgvqtc7391laeg-a.ohio-postgres.render.com/jornadas_bqyp',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('UPDATE charlas SET cupo_maximo = 40 WHERE id IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)');
    await client.query('UPDATE charlas SET inscritos = 0');
    console.log('✅ Cupos actualizados a 40 y reiniciados a 0');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
})();