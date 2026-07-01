const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');

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

// Middleware JWT
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

app.get('/verificar/:codigo', async (req, res) => {
  // ... (igual que antes, con diseño profesional) 
  // Por brevedad, asumo que ya lo tienes completo.
  // Si no, está en el código anterior.
});

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
// ADMIN: GESTIÓN DE INSCRIPCIONES (protegido)
// ============================================

app.get('/api/admin/inscripciones', verificarToken, async (req, res) => {
  // ... (igual que antes)
});

app.put('/api/admin/inscripciones/:id/escaneado', verificarToken, async (req, res) => {
  // ... (igual que antes)
});

app.delete('/api/admin/inscripciones/:id', verificarToken, async (req, res) => {
  // ... (igual que antes)
});

app.get('/api/admin/exportar-csv', verificarToken, async (req, res) => {
  // ... (igual que antes)
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