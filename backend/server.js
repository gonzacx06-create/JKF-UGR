const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONEXIÓN A POSTGRESQL
// ============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/jornadas',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Función para inicializar las tablas
async function initDB() {
  const client = await pool.connect();
  try {
    console.log('🔄 Conectando a PostgreSQL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS charlas (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        dia TEXT NOT NULL,
        hora TEXT NOT NULL,
        ponente TEXT NOT NULL,
        cupo_maximo INTEGER NOT NULL,
        inscritos INTEGER DEFAULT 0
      )
    `);
    console.log('✅ Tabla "charlas" creada/verificada');

    await client.query(`
      CREATE TABLE IF NOT EXISTS inscripciones (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL,
        charla_id INTEGER REFERENCES charlas(id) ON DELETE CASCADE,
        codigo_unico TEXT UNIQUE NOT NULL,
        fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        escaneado BOOLEAN DEFAULT FALSE,
        fecha_escaneo TIMESTAMP
      )
    `);
    console.log('✅ Tabla "inscripciones" creada/verificada');

    await client.query('UPDATE charlas SET inscritos = 0');
    console.log('✅ Cupos reseteados a 0');

    await client.query('DELETE FROM inscripciones');
    console.log('✅ Inscripciones eliminadas');

    const result = await client.query('SELECT COUNT(*) FROM charlas');
    const count = parseInt(result.rows[0].count);
    if (count === 0) {
      const charlas = [
        ['Recepción y acreditación', 'Miércoles 2', '08:30 - 10:00', 'Secretaría Técnica', 100],
        ['Conferencia Inaugural: Actualización en Dolor Crónico', 'Miércoles 2', '10:00 - 11:30', 'Dr. Luis Miguel Torres', 80],
        ['Mesa Redonda: Abordaje Multidisciplinar de la Tendinopatía', 'Miércoles 2', '11:30 - 13:00', 'Dra. María López / Dr. Javier Pérez', 80],
        ['Pausa - Almuerzo', 'Miércoles 2', '13:00 - 14:30', 'Organización', 120],
        ['Taller Práctico 1: Ecografía para Fisioterapeutas', 'Miércoles 2', '14:30 - 16:00', 'Dr. Carlos García (SERAM)', 40],
        ['Comunicaciones Orales Libres', 'Miércoles 2', '16:00 - 17:30', 'Varios autores', 60],
        ['Conferencia: Nuevas tendencias en neurorrehabilitación', 'Miércoles 2', '17:30 - 19:00', 'Dra. Elena Muñoz (UGR)', 80],
        ['Cóctel de bienvenida y networking', 'Miércoles 2', '19:00 - 20:30', 'Comité Organizador', 100],
        ['Recepción y entrega de materiales', 'Jueves 3', '08:30 - 10:00', 'Secretaría Técnica', 100],
        ['Conferencia: Rehabilitación en el Deportista de Élite', 'Jueves 3', '10:00 - 11:30', 'Dr. Pedro Martínez (Real Madrid)', 80],
        ['Mesa Redonda: Infiltraciones guiadas por ecografía', 'Jueves 3', '11:30 - 13:00', 'Dra. Ana Belén Rodríguez', 80],
        ['Pausa - Almuerzo (Jueves)', 'Jueves 3', '13:00 - 14:30', 'Organización', 120],
        ['Taller Práctico 2: Punción Seca y Neuromodulación', 'Jueves 3', '14:30 - 16:00', 'Dr. Fernando Ramos', 40],
        ['Conferencia: Innovación en fisioterapia respiratoria', 'Jueves 3', '16:00 - 17:30', 'Dra. Laura Fernández', 80],
        ['Conferencia de Clausura', 'Jueves 3', '17:30 - 19:00', 'Dr. Ricardo Gómez (UGR)', 80],
        ['Entrega de premios y cierre oficial', 'Jueves 3', '19:00 - 20:30', 'Comité Organizador', 100]
      ];

      for (const ch of charlas) {
        await client.query(
          'INSERT INTO charlas (titulo, dia, hora, ponente, cupo_maximo) VALUES ($1, $2, $3, $4, $5)',
          ch
        );
      }
      console.log('✅ Charlas de ejemplo insertadas');
    } else {
      console.log(`✅ ${count} charlas ya existentes, omitiendo inserción`);
    }

    console.log('✅ Base de datos inicializada correctamente');

  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
    console.error('Detalles del error:', err.stack);
  } finally {
    client.release();
    console.log('🔒 Conexión a la base de datos liberada');
  }
}

// ============================================
// ENDPOINTS
// ============================================

// Obtener todas las charlas con cupos disponibles
app.get('/api/charlas', async (req, res) => {
  try {
    const result = await pool.query('SELECT *, (cupo_maximo - inscritos) as disponibles FROM charlas');
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /api/charlas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Ver todas las inscripciones (endpoint temporal)
app.get('/api/ver-inscripciones', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM inscripciones');
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /api/ver-inscripciones:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Inscribir a una charla
app.post('/api/inscribir', async (req, res) => {
  const { nombre, email, charla_id } = req.body;
  if (!nombre || !email || !charla_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const charlaResult = await client.query(
      'SELECT cupo_maximo, inscritos FROM charlas WHERE id = $1 FOR UPDATE',
      [charla_id]
    );
    if (charlaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Charla no encontrada' });
    }
    const charla = charlaResult.rows[0];
    if (charla.inscritos >= charla.cupo_maximo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cupo completo para esta charla' });
    }

    const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();

    await client.query(
      'INSERT INTO inscripciones (nombre, email, charla_id, codigo_unico) VALUES ($1, $2, $3, $4)',
      [nombre, email, charla_id, codigo]
    );

    await client.query(
      'UPDATE charlas SET inscritos = inscritos + 1 WHERE id = $1',
      [charla_id]
    );

    await client.query('COMMIT');

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const url = `${baseUrl}/verificar/${codigo}`;

    QRCode.toDataURL(url, (err, qrDataUrl) => {
      if (err) {
        console.error('Error generando QR:', err);
        return res.status(500).json({ error: 'Error generando QR' });
      }
      res.json({
        mensaje: 'Inscripción exitosa',
        codigo,
        qr: qrDataUrl,
        url
      });
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en inscripción:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// OBTENER INSCRIPCIONES POR EMAIL (CON PAGINACIÓN)
app.get('/api/mis-inscripciones', async (req, res) => {
  const email = req.query.email;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;

  if (!email) {
    return res.status(400).json({ error: 'El email es requerido' });
  }

  try {
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM inscripciones WHERE email = $1',
      [email]
    );
    const total = parseInt(totalResult.rows[0].total);

    const result = await pool.query(`
      SELECT 
        i.id,
        i.nombre,
        i.email,
        i.codigo_unico AS codigo,
        i.fecha_inscripcion,
        i.escaneado,
        i.fecha_escaneo,
        c.titulo,
        c.dia,
        c.hora,
        c.ponente
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE i.email = $1
      ORDER BY i.fecha_inscripcion DESC
      LIMIT $2 OFFSET $3
    `, [email, limit, offset]);

    res.json({
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error al obtener inscripciones:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Verificar código QR (API JSON)
app.get('/api/verificar/:codigo', async (req, res) => {
  const codigo = req.params.codigo;
  try {
    const result = await pool.query(`
      SELECT i.nombre, i.email, i.fecha_inscripcion, c.titulo, c.dia, c.hora
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE i.codigo_unico = $1
    `, [codigo]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código no válido' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en /api/verificar/:codigo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PÁGINA DE VERIFICACIÓN (CON LOGS Y FECHA CORREGIDA)
// ============================================
app.get('/verificar/:codigo', async (req, res) => {
  const codigo = req.params.codigo;
  console.log(`🔍 Verificando código: ${codigo}`);

  try {
    console.log('📡 Intentando consultar la base de datos...');
    const result = await pool.query(`
      SELECT i.nombre, i.email, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
             c.titulo, c.dia, c.hora
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE i.codigo_unico = $1
    `, [codigo]);

    console.log(`✅ Resultados obtenidos: ${result.rows.length} filas`);

    if (result.rows.length === 0) {
      console.warn('⚠️ Código no encontrado en la base de datos.');
      return res.send(generateErrorPage('❌', 'Código no válido', 'No se encontró ninguna inscripción con este código.'));
    }

    const row = result.rows[0];
    console.log(`👤 Inscripción encontrada para: ${row.nombre}`);

    if (row.escaneado === true) {
      console.warn(`⛔ QR ya escaneado el ${row.fecha_escaneo}`);
      return res.send(generateErrorPage('⛔', 'QR ya utilizado', `Este código QR ya fue escaneado el <strong>${row.fecha_escaneo}</strong>. No se permite el reingreso.`));
    }

    // ===== CORRECCIÓN DE FECHA =====
    const ahora = new Date().toISOString(); // Formato ISO: YYYY-MM-DDTHH:MM:SS.MMMZ
    console.log(`🕒 Escaneando por primera vez a las ${ahora}`);
    
    await pool.query(
      'UPDATE inscripciones SET escaneado = TRUE, fecha_escaneo = $1 WHERE codigo_unico = $2',
      [ahora, codigo]
    );
    console.log('✅ Registro marcado como escaneado');

    // Formatear fecha para mostrar en la página (más legible)
    const fechaLegible = new Date(ahora).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    res.send(generateSuccessPage(row, fechaLegible));

  } catch (err) {
    console.error('❌ Error en verificación:', err.message);
    console.error('📄 Stack trace:', err.stack);
    res.status(500).send(generateErrorPage('⚠️', 'Error interno', `Ocurrió un problema al verificar tu inscripción. Detalle técnico: ${err.message}`));
  }
});

// ============================================
// FUNCIONES AUXILIARES PARA GENERAR HTML
// ============================================

function generateLayout(title, bodyContent) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Jornadas UGR</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --surface2: #1c2330;
      --border: #30363d;
      --accent: #e8a838;
      --text: #e6edf3;
      --text-dim: #8b949e;
      --text-dimmer: #484f58;
      --azul-ugr: #1565C0;
      --azul-ugr-claro: #42A5F5;
      --rojo-ugr: #D32F2F;
      --verde: #81c784;
      --font-display: 'Georgia', serif;
      --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --radius: 10px;
      --radius-sm: 6px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .site-header {
      width: 100%;
      max-width: 960px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius) var(--radius) 0 0;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 0 auto;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-left .logo-text {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: var(--accent);
      text-transform: uppercase;
    }
    .header-left .logo-text small {
      font-weight: 400;
      color: var(--text-dim);
      font-size: 11px;
      margin-left: 6px;
    }
    .logo-ugr {
      height: 40px;
      margin-right: 4px;
    }
    .header-right {
      font-size: 12px;
      color: var(--text-dim);
      font-weight: 500;
    }
    .main-card {
      width: 100%;
      max-width: 960px;
      background: var(--surface);
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      padding: 40px 36px;
      flex: 1;
    }
    .main-card .icon {
      font-size: 48px;
      text-align: center;
      margin-bottom: 12px;
    }
    .main-card h1 {
      font-family: var(--font-display);
      font-size: 28px;
      color: var(--verde);
      text-align: center;
      margin-bottom: 6px;
    }
    .main-card .subtitle {
      text-align: center;
      color: var(--text-dim);
      font-size: 14px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .main-card .datos {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 8px 16px;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .main-card .datos .label {
      color: var(--text-dim);
      font-weight: 600;
    }
    .main-card .datos .value {
      color: var(--text);
      word-break: break-word;
    }
    .main-card .datos .value .destacado {
      color: var(--azul-ugr-claro);
      font-weight: 600;
    }
    .main-card .badge {
      background: rgba(129,199,132,0.12);
      border: 1px solid rgba(129,199,132,0.2);
      border-radius: 6px;
      padding: 12px 16px;
      text-align: center;
      margin: 16px 0 20px;
      font-size: 14px;
      color: var(--verde);
      font-weight: 600;
    }
    .main-card .badge small {
      display: block;
      font-weight: 400;
      color: var(--text-dim);
      font-size: 12px;
      margin-top: 4px;
    }
    .main-card .error-title {
      color: var(--rojo-ugr);
    }
    .main-card .warning-title {
      color: var(--accent);
    }
    .site-footer {
      width: 100%;
      max-width: 960px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius) var(--radius);
      padding: 20px 24px;
      text-align: center;
      font-size: 11px;
      color: var(--text-dimmer);
      line-height: 1.8;
    }
    .site-footer strong { color: var(--accent); }
    .btn-volver {
      display: inline-block;
      margin-top: 8px;
      padding: 10px 28px;
      background: var(--accent);
      color: #0d1117;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      text-align: center;
      width: 100%;
      max-width: 200px;
      transition: opacity 0.2s;
    }
    .btn-volver:hover { opacity: 0.85; }
    @media (max-width: 480px) {
      .main-card { padding: 24px 18px; }
      .main-card .datos { grid-template-columns: 1fr; gap: 2px; }
      .main-card .datos .label { font-weight: 700; }
      .site-header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .header-right { align-self: flex-start; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="header-left">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23e8a838'/%3E%3Ctext x='8' y='26' font-family='Arial' font-size='20' fill='%230d1117' font-weight='bold'%3EUGR%3C/text%3E%3C/svg%3E" alt="UGR" class="logo-ugr" />
      <span class="logo-text">JKF-UGR <small>· IX Jornadas</small></span>
    </div>
    <div class="header-right">2 y 3 sep · Santa Fe</div>
  </header>

  <div class="main-card">
    ${bodyContent}
  </div>

  <footer class="site-footer">
    <strong>Universidad del Gran Rosario (UGR)</strong> – Kinesiología y Fisiatría<br>
    Facultad de Kinesiología y Fisiatría · Santa Fe, Argentina<br>
    <span style="margin-top:6px;display:block;">© 2026 · Todos los derechos reservados</span>
  </footer>
</body>
</html>
  `;
}

function generateErrorPage(icon, title, message) {
  const body = `
    <div class="icon">${icon}</div>
    <h1 class="error-title">${title}</h1>
    <p style="color: var(--text-dim); font-size: 14px; line-height: 1.7; margin-bottom: 8px;">${message}</p>
    <p style="font-size:12px;color:var(--text-dimmer);margin-top:12px;">Verifica que el QR sea correcto o contacta al organizador.</p>
    <a href="/" class="btn-volver">Volver al inicio</a>
  `;
  return generateLayout(title, body);
}

function generateSuccessPage(row, horaEscaneo) {
  const body = `
    <div class="icon">✅</div>
    <h1>Inscripción confirmada</h1>
    <p class="subtitle">QR válido para el acceso al evento</p>

    <div class="datos">
      <span class="label">👤 Nombre</span>
      <span class="value">${row.nombre}</span>
      <span class="label">📧 Email</span>
      <span class="value">${row.email}</span>
      <span class="label">🎤 Charla</span>
      <span class="value"><span class="destacado">${row.titulo}</span></span>
      <span class="label">📅 Día y hora</span>
      <span class="value">${row.dia} - ${row.hora}</span>
      <span class="label">📝 Inscripción</span>
      <span class="value">${row.fecha_inscripcion}</span>
    </div>

    <div class="badge">
      🟢 Acceso permitido
      <small>Escaneado el: ${horaEscaneo}</small>
    </div>

    <a href="/" class="btn-volver">Volver al inicio</a>
    <div style="text-align:center;color:var(--text-dimmer);font-size:12px;margin-top:12px;">
      Presenta este código en el evento · IX Jornadas UGR 2026
    </div>
  `;
  return generateLayout('Inscripción confirmada', body);
}

// ============================================
// SERVIDOR DE ARCHIVOS ESTÁTICOS
// ============================================
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ============================================
// PUERTO
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));