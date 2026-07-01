const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const app = express();
app.use(cors());
app.use(express.json());

// Variables de entorno
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'mi_clave_super_secreta_123456';

// Pool de conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/jornadas',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============================================
// INICIALIZAR BASE DE DATOS
// ============================================
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
    await client.query('DELETE FROM inscripciones');
    console.log('✅ Cupos reseteados y inscripciones eliminadas');

    const result = await client.query('SELECT COUNT(*) FROM charlas');
    const count = parseInt(result.rows[0].count);
    if (count === 0) {
      const charlas = [
        ['Recepción y acreditación', 'Miércoles 2', '08:30 - 10:00', 'Secretaría Técnica', 40],
        ['Conferencia Inaugural: Actualización en Dolor Crónico', 'Miércoles 2', '10:00 - 11:30', 'Dr. Luis Miguel Torres', 40],
        ['Mesa Redonda: Abordaje Multidisciplinar de la Tendinopatía', 'Miércoles 2', '11:30 - 13:00', 'Dra. María López / Dr. Javier Pérez', 40],
        ['Pausa - Almuerzo', 'Miércoles 2', '13:00 - 14:30', 'Organización', 40],
        ['Taller Práctico 1: Ecografía para Fisioterapeutas', 'Miércoles 2', '14:30 - 16:00', 'Dr. Carlos García (SERAM)', 40],
        ['Comunicaciones Orales Libres', 'Miércoles 2', '16:00 - 17:30', 'Varios autores', 40],
        ['Conferencia: Nuevas tendencias en neurorrehabilitación', 'Miércoles 2', '17:30 - 19:00', 'Dra. Elena Muñoz (UGR)', 40],
        ['Cóctel de bienvenida y networking', 'Miércoles 2', '19:00 - 20:30', 'Comité Organizador', 40],
        ['Recepción y entrega de materiales', 'Jueves 3', '08:30 - 10:00', 'Secretaría Técnica', 40],
        ['Conferencia: Rehabilitación en el Deportista de Élite', 'Jueves 3', '10:00 - 11:30', 'Dr. Pedro Martínez (Real Madrid)', 40],
        ['Mesa Redonda: Infiltraciones guiadas por ecografía', 'Jueves 3', '11:30 - 13:00', 'Dra. Ana Belén Rodríguez', 40],
        ['Pausa - Almuerzo (Jueves)', 'Jueves 3', '13:00 - 14:30', 'Organización', 40],
        ['Taller Práctico 2: Punción Seca y Neuromodulación', 'Jueves 3', '14:30 - 16:00', 'Dr. Fernando Ramos', 40],
        ['Conferencia: Innovación en fisioterapia respiratoria', 'Jueves 3', '16:00 - 17:30', 'Dra. Laura Fernández', 40],
        ['Conferencia de Clausura', 'Jueves 3', '17:30 - 19:00', 'Dr. Ricardo Gómez (UGR)', 40],
        ['Entrega de premios y cierre oficial', 'Jueves 3', '19:00 - 20:30', 'Comité Organizador', 40]
      ];
      for (const ch of charlas) {
        await client.query(
          'INSERT INTO charlas (titulo, dia, hora, ponente, cupo_maximo) VALUES ($1, $2, $3, $4, $5)',
          ch
        );
      }
      console.log('✅ Charlas de ejemplo insertadas con cupo 40');
    } else {
      console.log(`✅ ${count} charlas ya existentes`);
    }
    console.log('✅ Base de datos inicializada correctamente');
  } catch (err) {
    console.error('❌ Error en initDB:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
  }
}

// ============================================
// MIDDLEWARE JWT
// ============================================
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.warn('❌ Token no proporcionado');
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    console.warn('❌ Token no proporcionado (formato inválido)');
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    console.log('✅ Token verificado para usuario:', decoded.username);
    next();
  } catch (err) {
    console.warn('❌ Token inválido o expirado:', err.message);
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

// ============================================
// ENDPOINTS PÚBLICOS
// ============================================

app.get('/api/charlas', async (req, res) => {
  try {
    const result = await pool.query('SELECT *, (cupo_maximo - inscritos) as disponibles FROM charlas');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error en /api/charlas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inscribir', async (req, res) => {
  const { nombre, email, charla_id } = req.body;
  if (!nombre || !email || !charla_id) {
    console.warn('❌ Faltan datos en inscripción:', { nombre, email, charla_id });
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const charlaResult = await client.query('SELECT cupo_maximo, inscritos FROM charlas WHERE id = $1 FOR UPDATE', [charla_id]);
    if (charlaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn('❌ Charla no encontrada ID:', charla_id);
      return res.status(404).json({ error: 'Charla no encontrada' });
    }
    const charla = charlaResult.rows[0];
    if (charla.inscritos >= charla.cupo_maximo) {
      await client.query('ROLLBACK');
      console.warn('❌ Cupo completo para charla ID:', charla_id);
      return res.status(400).json({ error: 'Cupo completo' });
    }

    // Límite de 2 inscripciones por email por charla
    const countResult = await client.query(
      'SELECT COUNT(*) FROM inscripciones WHERE email = $1 AND charla_id = $2',
      [email, charla_id]
    );
    const inscripcionesActuales = parseInt(countResult.rows[0].count);
    if (inscripcionesActuales >= 2) {
      await client.query('ROLLBACK');
      console.warn(`❌ El usuario ${email} ya tiene ${inscripcionesActuales} inscripciones en la charla ${charla_id}`);
      return res.status(400).json({ error: 'Ya tienes el máximo de 2 inscripciones para esta charla.' });
    }

    const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();
    await client.query('INSERT INTO inscripciones (nombre, email, charla_id, codigo_unico) VALUES ($1, $2, $3, $4)', [nombre, email, charla_id, codigo]);
    await client.query('UPDATE charlas SET inscritos = inscritos + 1 WHERE id = $1', [charla_id]);
    await client.query('COMMIT');

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const url = `${baseUrl}/verificar/${codigo}`;
    console.log(`✅ Inscripción exitosa: ${nombre} - Código: ${codigo}`);
    QRCode.toDataURL(url, (err, qrDataUrl) => {
      if (err) {
        console.error('❌ Error generando QR:', err);
        return res.status(500).json({ error: 'Error generando QR' });
      }
      res.json({ mensaje: 'Inscripción exitosa', codigo, qr: qrDataUrl, url });
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en inscripción:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/mis-inscripciones', async (req, res) => {
  const email = req.query.email;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;
  if (!email) {
    console.warn('❌ Email requerido en /api/mis-inscripciones');
    return res.status(400).json({ error: 'Email requerido' });
  }

  try {
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM inscripciones WHERE email = $1', [email]);
    const total = parseInt(totalResult.rows[0].total);
    const result = await pool.query(`
      SELECT i.id, i.nombre, i.email, i.codigo_unico AS codigo, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
             c.titulo, c.dia, c.hora, c.ponente
      FROM inscripciones i JOIN charlas c ON i.charla_id = c.id
      WHERE i.email = $1 ORDER BY i.fecha_inscripcion DESC LIMIT $2 OFFSET $3
    `, [email, limit, offset]);
    console.log(`✅ ${result.rows.length} inscripciones encontradas para ${email}`);
    res.json({ data: result.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('❌ Error en /api/mis-inscripciones:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inscripciones/:codigo', async (req, res) => {
  const codigo = req.params.codigo;
  console.log('🔍 Cancelando inscripción con código:', codigo);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insResult = await client.query('SELECT charla_id FROM inscripciones WHERE codigo_unico = $1', [codigo]);
    if (insResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn('❌ Inscripción no encontrada con código:', codigo);
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }
    const charla_id = insResult.rows[0].charla_id;
    await client.query('DELETE FROM inscripciones WHERE codigo_unico = $1', [codigo]);
    await client.query('UPDATE charlas SET inscritos = inscritos - 1 WHERE id = $1 AND inscritos > 0', [charla_id]);
    await client.query('COMMIT');
    console.log(`✅ Inscripción cancelada: ${codigo}`);
    res.json({ mensaje: 'Inscripción cancelada correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error cancelando inscripción:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================
// PÁGINA DE VERIFICACIÓN DE QR (DISEÑO PROFESIONAL)
// ============================================
app.get('/verificar/:codigo', async (req, res) => {
  const codigo = req.params.codigo;
  console.log('🔍 Verificando código:', codigo);

  try {
    const result = await pool.query(`
      SELECT i.nombre, i.email, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
             c.titulo, c.dia, c.hora
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE i.codigo_unico = $1
    `, [codigo]);

    if (result.rows.length === 0) {
      console.warn('❌ Código no válido:', codigo);
      return res.send(generateErrorPage('❌', 'Código no válido', 'No se encontró ninguna inscripción con este código.'));
    }

    const row = result.rows[0];

    if (row.escaneado === true) {
      console.warn('⛔ QR ya utilizado:', codigo);
      return res.send(generateErrorPage('⛔', 'QR ya utilizado', `Este código QR ya fue escaneado el <strong>${row.fecha_escaneo}</strong>. No se permite el reingreso.`));
    }

    const ahora = new Date().toISOString();
    await pool.query(
      'UPDATE inscripciones SET escaneado = TRUE, fecha_escaneo = $1 WHERE codigo_unico = $2',
      [ahora, codigo]
    );

    const fechaLegible = new Date(ahora).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    console.log('✅ QR verificado correctamente:', codigo);
    res.send(generateSuccessPage(row, fechaLegible));

  } catch (err) {
    console.error('❌ Error en verificación:', err.message);
    res.status(500).send(generateErrorPage('⚠️', 'Error interno', 'Ocurrió un problema al verificar tu inscripción. Intenta de nuevo.'));
  }
});

// ============================================
// FUNCIONES AUXILIARES PARA GENERAR HTML (verificación)
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
      --border: #30363d;
      --accent: #e8a838;
      --text: #e6edf3;
      --text-dim: #8b949e;
      --azul-ugr: #1565C0;
      --rojo-ugr: #D32F2F;
      --verde: #81c784;
      --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-display: 'Georgia', serif;
      --radius: 10px;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; }
    .site-header {
      width: 100%; max-width: 960px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius) var(--radius) 0 0;
      padding: 16px 24px; display: flex; align-items: center; justify-content: space-between;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .header-left .logo-text { font-size: 14px; font-weight: 700; letter-spacing: 0.15em; color: var(--accent); text-transform: uppercase; }
    .header-left .logo-text small { font-weight: 400; color: var(--text-dim); font-size: 11px; }
    .logo-ugr { height: 40px; }
    .header-right { font-size: 12px; color: var(--text-dim); }
    .main-card {
      width: 100%; max-width: 960px; background: var(--surface); border-left: 1px solid var(--border); border-right: 1px solid var(--border);
      padding: 40px 36px; flex: 1;
    }
    .main-card .icon { font-size: 48px; text-align: center; margin-bottom: 12px; }
    .main-card h1 { font-family: var(--font-display); font-size: 28px; text-align: center; margin-bottom: 6px; color: var(--verde); }
    .main-card .error-title { color: var(--rojo-ugr); }
    .main-card .subtitle { text-align: center; color: var(--text-dim); font-size: 14px; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 20px; }
    .main-card .datos { display: grid; grid-template-columns: 100px 1fr; gap: 8px 16px; font-size: 14px; margin-bottom: 20px; }
    .main-card .datos .label { color: var(--text-dim); font-weight: 600; }
    .main-card .datos .value { color: var(--text); word-break: break-word; }
    .main-card .datos .value .destacado { color: var(--azul-ugr); font-weight: 600; }
    .main-card .badge {
      background: rgba(129,199,132,0.12); border: 1px solid rgba(129,199,132,0.2); border-radius: 6px;
      padding: 12px 16px; text-align: center; margin: 16px 0 20px; font-size: 14px; color: var(--verde); font-weight: 600;
    }
    .main-card .badge small { display: block; font-weight: 400; color: var(--text-dim); font-size: 12px; margin-top: 4px; }
    .site-footer {
      width: 100%; max-width: 960px; background: var(--surface); border: 1px solid var(--border); border-top: none;
      border-radius: 0 0 var(--radius) var(--radius); padding: 20px 24px; text-align: center; font-size: 11px; color: var(--text-dim);
    }
    .site-footer strong { color: var(--accent); }
    .btn-volver {
      display: inline-block; margin-top: 8px; padding: 10px 28px; background: var(--accent); color: #0d1117; border-radius: 6px;
      text-decoration: none; font-weight: 700; font-size: 14px; text-align: center; width: 100%; max-width: 200px; transition: opacity 0.2s;
    }
    .btn-volver:hover { opacity: 0.85; }
    @media (max-width: 480px) {
      .main-card { padding: 24px 18px; }
      .main-card .datos { grid-template-columns: 1fr; gap: 2px; }
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
  <div class="main-card">${bodyContent}</div>
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
    <p style="font-size:12px;color:var(--text-dim);margin-top:12px;">Verifica que el QR sea correcto o contacta al organizador.</p>
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
      <span class="label">👤 Nombre</span><span class="value">${row.nombre}</span>
      <span class="label">📧 Email</span><span class="value">${row.email}</span>
      <span class="label">🎤 Charla</span><span class="value"><span class="destacado">${row.titulo}</span></span>
      <span class="label">📅 Día y hora</span><span class="value">${row.dia} - ${row.hora}</span>
      <span class="label">📝 Inscripción</span><span class="value">${row.fecha_inscripcion}</span>
    </div>
    <div class="badge">
      🟢 Acceso permitido
      <small>Escaneado el: ${horaEscaneo}</small>
    </div>
    <a href="/" class="btn-volver">Volver al inicio</a>
    <div style="text-align:center;color:var(--text-dim);font-size:12px;margin-top:12px;">Presenta este código en el evento · IX Jornadas UGR 2026</div>
  `;
  return generateLayout('Inscripción confirmada', body);
}

// ============================================
// ADMIN: LOGIN
// ============================================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    console.warn('❌ Login sin credenciales');
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    console.log(`✅ Login exitoso para: ${username}`);
    return res.json({ token, mensaje: 'Login exitoso' });
  }
  console.warn(`❌ Login fallido para: ${username}`);
  return res.status(401).json({ error: 'Credenciales incorrectas' });
});

// ============================================
// ADMIN: GESTIÓN DE INSCRIPCIONES (PROTEGIDO)
// ============================================

// Obtener todas las inscripciones con filtros y paginación
app.get('/api/admin/inscripciones', verificarToken, async (req, res) => {
  const { email, charla_id, escaneado, page = 1, limit = 20 } = req.query;
  console.log('📋 Admin: listando inscripciones con filtros:', { email, charla_id, escaneado, page, limit });

  try {
    let query = `
      SELECT 
        i.id, i.nombre, i.email, i.codigo_unico AS codigo,
        i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
        c.titulo AS charla_titulo, c.dia, c.hora, c.ponente
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (email) {
      query += ` AND i.email ILIKE $${paramIndex}`;
      params.push(`%${email}%`);
      paramIndex++;
    }
    if (charla_id) {
      query += ` AND i.charla_id = $${paramIndex}`;
      params.push(parseInt(charla_id));
      paramIndex++;
    }
    if (escaneado !== undefined && escaneado !== '') {
      const escaneadoBool = escaneado === 'true';
      query += ` AND i.escaneado = $${paramIndex}`;
      params.push(escaneadoBool);
      paramIndex++;
    }

    query += ` ORDER BY i.fecha_inscripcion DESC`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE 1=1
    `;
    const countParams = [];
    let countIndex = 1;
    if (email) {
      countQuery += ` AND i.email ILIKE $${countIndex}`;
      countParams.push(`%${email}%`);
      countIndex++;
    }
    if (charla_id) {
      countQuery += ` AND i.charla_id = $${countIndex}`;
      countParams.push(parseInt(charla_id));
      countIndex++;
    }
    if (escaneado !== undefined && escaneado !== '') {
      const escaneadoBool = escaneado === 'true';
      countQuery += ` AND i.escaneado = $${countIndex}`;
      countParams.push(escaneadoBool);
      countIndex++;
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    console.log(`✅ Admin: ${result.rows.length} inscripciones encontradas (total: ${total})`);
    res.json({
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('❌ Error en admin/inscripciones:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Actualizar estado de escaneo
app.put('/api/admin/inscripciones/:id/escaneado', verificarToken, async (req, res) => {
  const id = parseInt(req.params.id);
  const { escaneado } = req.body;
  if (isNaN(id) || typeof escaneado !== 'boolean') {
    console.warn('❌ Datos inválidos para actualizar escaneo:', { id, escaneado });
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  console.log(`🔄 Admin: actualizando escaneo de inscripción ${id} a ${escaneado}`);
  try {
    const result = await pool.query(
      'UPDATE inscripciones SET escaneado = $1, fecha_escaneo = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = $2 RETURNING *',
      [escaneado, id]
    );
    if (result.rows.length === 0) {
      console.warn(`❌ Inscripción ${id} no encontrada`);
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }
    console.log(`✅ Escaneo actualizado para inscripción ${id}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando escaneo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Eliminar inscripción
app.delete('/api/admin/inscripciones/:id', verificarToken, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    console.warn('❌ ID inválido para eliminar inscripción');
    return res.status(400).json({ error: 'ID inválido' });
  }
  console.log(`🗑️ Admin: eliminando inscripción ${id}`);
  try {
    const result = await pool.query('DELETE FROM inscripciones WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      console.warn(`❌ Inscripción ${id} no encontrada para eliminar`);
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }
    console.log(`✅ Inscripción ${id} eliminada`);
    res.json({ mensaje: 'Inscripción eliminada', data: result.rows[0] });
  } catch (err) {
    console.error('❌ Error eliminando inscripción:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: EXPORTAR A EXCEL (.xlsx)
// ============================================
app.get('/api/admin/exportar-excel', verificarToken, async (req, res) => {
  console.log('📊 Admin: exportando a Excel');
  try {
    const result = await pool.query(`
      SELECT 
        i.nombre, i.email,
        c.titulo AS charla, c.dia, c.hora,
        i.codigo_unico AS codigo,
        i.fecha_inscripcion,
        CASE WHEN i.escaneado THEN 'Sí' ELSE 'No' END AS escaneado,
        i.fecha_escaneo
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      ORDER BY i.fecha_inscripcion DESC
    `);

    const rows = result.rows;
    if (rows.length === 0) {
      console.warn('⚠️ No hay inscripciones para exportar');
      return res.status(404).json({ error: 'No hay inscripciones para exportar' });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Jornadas UGR';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Inscripciones', {
      properties: { tabColor: { argb: '1565C0' } },
    });

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '1565C0' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin', color: { argb: '30363d' } },
        bottom: { style: 'thin', color: { argb: '30363d' } },
        left: { style: 'thin', color: { argb: '30363d' } },
        right: { style: 'thin', color: { argb: '30363d' } }
      }
    };

    const cellStyle = {
      alignment: { horizontal: 'left', vertical: 'middle' },
      border: {
        top: { style: 'thin', color: { argb: '30363d' } },
        bottom: { style: 'thin', color: { argb: '30363d' } },
        left: { style: 'thin', color: { argb: '30363d' } },
        right: { style: 'thin', color: { argb: '30363d' } }
      }
    };

    worksheet.columns = [
      { header: 'Nombre', key: 'nombre', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Charla', key: 'charla', width: 40 },
      { header: 'Día', key: 'dia', width: 15 },
      { header: 'Hora', key: 'hora', width: 15 },
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'Fecha Inscripción', key: 'fecha_inscripcion', width: 22 },
      { header: 'Escaneado', key: 'escaneado', width: 12 },
      { header: 'Fecha Escaneo', key: 'fecha_escaneo', width: 22 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.style = headerStyle;
    });

    rows.forEach((row, index) => {
      const rowData = [
        row.nombre,
        row.email,
        row.charla,
        row.dia,
        row.hora,
        row.codigo,
        row.fecha_inscripcion,
        row.escaneado,
        row.fecha_escaneo || ''
      ];
      const newRow = worksheet.addRow(rowData);
      newRow.height = 20;
      newRow.eachCell((cell) => {
        cell.style = cellStyle;
      });
      if (index % 2 === 0) {
        newRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F5F5F5' }
          };
        });
      }
    });

    worksheet.autoFilter = {
      from: 'A1',
      to: `I${rows.length + 1}`
    };

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=inscripciones-${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
    console.log(`✅ Excel exportado con ${rows.length} registros`);
  } catch (err) {
    console.error('❌ Error exportando Excel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SERVIDOR ESTÁTICO Y PUERTO
// ============================================
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

initDB().catch(err => {
  console.error('❌ Error fatal en initDB:', err.message);
  process.exit(1);
});