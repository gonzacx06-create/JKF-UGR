const { Pool } = require('pg');

// Usa la External Database URL (con dominio completo)
const pool = new Pool({
  connectionString: 'postgresql://jornadas_user:qfx6y7qKryzAF0ac97aQ28NdtLbixBmx@dpg-d91vn0mgvqtc7391laeg-a.ohio-postgres.render.com/jornadas_bqyp',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const charlaId = 1; // Cambia el ID si quieres probar otra charla
    const nuevoCupo = 2;

    await pool.query('UPDATE charlas SET cupo_maximo = $1 WHERE id = $2', [nuevoCupo, charlaId]);
    console.log(`✅ Cupo de la charla ID ${charlaId} reducido a ${nuevoCupo}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
})();