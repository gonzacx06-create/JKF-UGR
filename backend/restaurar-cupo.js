const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://jornadas_user:qfx6y7qKryzAF0ac97aQ28NdtLbixBmx@dpg-d91vn0mgvqtc7391laeg-a.ohio-postgres.render.com/jornadas_bqyp',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await pool.query('UPDATE charlas SET cupo_maximo = 40 WHERE id = 1');
    console.log('✅ Cupo de la charla ID 1 restaurado a 40');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
})();