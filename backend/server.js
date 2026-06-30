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

    // Crear tabla de charlas
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

    // Crear tabla de inscripciones
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

    // Resetear cupos (opcional)
    await client.query('UPDATE charlas SET inscritos = 0');
    console.log('✅ Cupos reseteados a 0');

    // Limpiar inscripciones (opcional)
    await client.query('DELETE FROM inscripciones');
    console.log('✅ Inscripciones eliminadas');

    // Insertar charlas de ejemplo si la tabla está vacía
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
    // No lanzamos el error para que el servidor siga arrancando y podamos ver los logs
  } finally {
    client.release();
    console.log('🔒 Conexión a la base de datos liberada');
  }
}

// ============================================
// INICIALIZAR LA BASE DE DATOS Y ARRANCAR EL SERVIDOR
// ============================================
async function startServer() {
  try {
    // Inicializar la base de datos (no bloquea el arranque del servidor)
    await initDB();
  } catch (err) {
    console.error('❌ Error en initDB, continuando de todas formas:', err.message);
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

      // Verificar cupo
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

      // Insertar inscripción
      await client.query(
        'INSERT INTO inscripciones (nombre, email, charla_id, codigo_unico) VALUES ($1, $2, $3, $4)',
        [nombre, email, charla_id, codigo]
      );

      // Actualizar cupo
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

  // ============================================
// OBTENER INSCRIPCIONES POR EMAIL (CON PAGINACIÓN)
// ============================================
app.get('/api/mis-inscripciones', async (req, res) => {
  const email = req.query.email;
  const page = parseInt(req.query.page) || 1;      // Página actual (por defecto 1)
  const limit = parseInt(req.query.limit) || 5;    // Registros por página (por defecto 5)
  const offset = (page - 1) * limit;

  if (!email) {
    return res.status(400).json({ error: 'El email es requerido' });
  }

  try {
    // Consulta para obtener el total de registros (para calcular páginas)
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM inscripciones WHERE email = $1',
      [email]
    );
    const total = parseInt(totalResult.rows[0].total);

    // Consulta con paginación
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
  // PÁGINA DE VERIFICACIÓN (HTML con diseño)
  // (Mantiene el mismo código HTML que antes, sin cambios)
  // ============================================
  app.get('/verificar/:codigo', async (req, res) => {
    const codigo = req.params.codigo;

    try {
      const result = await pool.query(`
        SELECT i.nombre, i.email, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
               c.titulo, c.dia, c.hora
        FROM inscripciones i
        JOIN charlas c ON i.charla_id = c.id
        WHERE i.codigo_unico = $1
      `, [codigo]);

      if (result.rows.length === 0) {
        return res.send(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QR no válido - Jornadas UGR</title>
            <style>
              :root { --bg: #0d1117; --surface: #161b22; --border: #30363d; --accent: #e8a838; --text: #e6edf3; --text-dim: #8b949e; --azul-ugr: #1565C0; --rojo-ugr: #D32F2F; --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
              * { margin:0; padding:0; box-sizing:border-box; }
              body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
              .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 40px; max-width: 480px; width: 100%; text-align: center; }
              .card .icon { font-size: 48px; margin-bottom: 16px; }
              .card h1 { font-family: 'Georgia', serif; font-size: 24px; color: #fff; margin-bottom: 12px; }
              .card h1 .error { color: var(--rojo-ugr); }
              .card p { color: var(--text-dim); font-size: 14px; line-height: 1.7; margin-bottom: 8px; }
              .card .btn { display: inline-block; margin-top: 20px; padding: 10px 28px; background: var(--accent); color: #0d1117; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; }
              .card .btn:hover { opacity: 0.85; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">❌</div>
              <h1><span class="error">Código no válido</span></h1>
              <p>No se encontró ninguna inscripción con este código.</p>
              <p style="font-size:12px;color:var(--text-dim);">Verifica que el QR sea correcto o contacta al organizador.</p>
              <a href="/" class="btn">Volver al inicio</a>
            </div>
          </body>
          </html>
        `);
      }

      const row = result.rows[0];

      if (row.escaneado === true) {
        return res.send(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QR ya utilizado - Jornadas UGR</title>
            <style>
              :root { --bg: #0d1117; --surface: #161b22; --border: #30363d; --accent: #e8a838; --text: #e6edf3; --text-dim: #8b949e; --azul-ugr: #1565C0; --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
              * { margin:0; padding:0; box-sizing:border-box; }
              body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
              .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 40px; max-width: 480px; width: 100%; text-align: center; }
              .card .icon { font-size: 48px; margin-bottom: 16px; }
              .card h1 { font-family: 'Georgia', serif; font-size: 24px; color: #fff; margin-bottom: 12px; }
              .card h1 .warning { color: var(--accent); }
              .card p { color: var(--text-dim); font-size: 14px; line-height: 1.7; margin-bottom: 8px; }
              .card .btn { display: inline-block; margin-top: 20px; padding: 10px 28px; background: var(--accent); color: #0d1117; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; }
              .card .btn:hover { opacity: 0.85; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">⛔</div>
              <h1><span class="warning">QR ya utilizado</span></h1>
              <p>Este código QR ya fue escaneado el <strong>${row.fecha_escaneo}</strong>.</p>
              <p style="font-size:13px;color:var(--text-dimmer);">No se permite el reingreso con el mismo código.</p>
              <a href="/" class="btn">Volver al inicio</a>
            </div>
          </body>
          </html>
        `);
      }

      // Marcar como escaneado
      const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      await pool.query(
        'UPDATE inscripciones SET escaneado = TRUE, fecha_escaneo = $1 WHERE codigo_unico = $2',
        [ahora, codigo]
      );

      // Mostrar confirmación
      res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>✅ Inscripción confirmada - Jornadas UGR</title>
          <style>
            :root { --bg: #0d1117; --surface: #161b22; --surface2: #1c2330; --border: #30363d; --accent: #e8a838; --text: #e6edf3; --text-dim: #8b949e; --azul-ugr: #1565C0; --azul-ugr-claro: #42A5F5; --verde: #81c784; --font-display: 'Georgia', serif; --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            * { margin:0; padding:0; box-sizing:border-box; }
            body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 24px; }
            .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 40px 36px; max-width: 520px; width: 100%; }
            .card .header-icon { font-size: 48px; text-align: center; margin-bottom: 12px; }
            .card h1 { font-family: var(--font-display); font-size: 26px; color: var(--verde); text-align: center; margin-bottom: 6px; }
            .card .subtitle { text-align: center; color: var(--text-dim); font-size: 14px; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 20px; }
            .card .datos { display: grid; grid-template-columns: 100px 1fr; gap: 8px 16px; font-size: 14px; margin-bottom: 20px; }
            .card .datos .label { color: var(--text-dim); font-weight: 600; }
            .card .datos .value { color: var(--text); word-break: break-word; }
            .card .datos .value .destacado { color: var(--azul-ugr-claro); font-weight: 600; }
            .card .badge { background: rgba(129,199,132,0.12); border: 1px solid rgba(129,199,132,0.2); border-radius: 6px; padding: 12px 16px; text-align: center; margin: 16px 0 20px; font-size: 14px; color: var(--verde); font-weight: 600; }
            .card .badge small { display: block; font-weight: 400; color: var(--text-dim); font-size: 12px; margin-top: 4px; }
            .card .footer-info { text-align: center; color: var(--text-dimmer); font-size: 12px; border-top: 1px solid var(--border); padding-top: 16px; margin-top: 8px; }
            .card .btn { display: inline-block; margin-top: 8px; padding: 10px 28px; background: var(--accent); color: #0d1117; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; text-align: center; width: 100%; transition: opacity 0.2s; }
            .card .btn:hover { opacity: 0.85; }
            @media (max-width: 480px) { .card { padding: 24px 18px; } .card .datos { grid-template-columns: 1fr; gap: 2px; } .card .datos .label { font-weight: 700; } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header-icon">✅</div>
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
              <small>Escaneado el: ${ahora}</small>
            </div>
            <a href="/" class="btn">Volver al inicio</a>
            <div class="footer-info">
              Presenta este código en el evento · IX Jornadas UGR 2026
            </div>
          </div>
        </body>
        </html>
      `);

    } catch (err) {
      console.error('Error en verificación:', err.message);
      res.status(500).send('Error interno');
    }
  });

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
}

// ============================================
// ARRANCAR EL SERVIDOR
// ============================================
startServer().catch(err => {
  console.error('❌ Error fatal al arrancar el servidor:', err.message);
  console.error(err.stack);
  process.exit(1);
});