const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

// Configuración
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'JKF-UGR.2026.Sf';
const JWT_SECRET = 'mi_clave_super_secreta_123456';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Base de datos SQLite
const db = new sqlite3.Database('./jornadas.db');

db.serialize(() => {
  // Crear tablas si no existen (sin borrar datos existentes)
  db.run(`CREATE TABLE IF NOT EXISTS charlas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT, dia TEXT, hora TEXT, ponente TEXT,
    cupo_maximo INTEGER, inscritos INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS inscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT, email TEXT, charla_id INTEGER,
    codigo_unico TEXT UNIQUE, fecha_inscripcion DATETIME DEFAULT CURRENT_TIMESTAMP,
    escaneado BOOLEAN DEFAULT 0, fecha_escaneo DATETIME,
    FOREIGN KEY (charla_id) REFERENCES charlas(id)
  )`);

  // No se borran ni reinseran datos al iniciar
  console.log('✅ Base de datos lista (tablas creadas/verificadas)');
});

// ========== ENDPOINTS PÚBLICOS ==========
app.get('/api/charlas', (req, res) => {
  db.all("SELECT *, (cupo_maximo - inscritos) as disponibles FROM charlas", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/inscribir', (req, res) => {
  const { nombre, email, charla_id } = req.body;
  if (!nombre || !email || !charla_id) return res.status(400).json({ error: 'Faltan datos' });

  db.get("SELECT cupo_maximo, inscritos FROM charlas WHERE id = ?", [charla_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Charla no encontrada' });
    if (row.inscritos >= row.cupo_maximo) return res.status(400).json({ error: 'Cupo completo' });

    db.get("SELECT COUNT(*) as count FROM inscripciones WHERE email = ? AND charla_id = ?", [email, charla_id], (err, countRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (countRow.count >= 2) return res.status(400).json({ error: 'Ya tienes el máximo de 2 inscripciones para esta charla.' });

      const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();
      db.run("BEGIN TRANSACTION");
      db.run("INSERT INTO inscripciones (nombre, email, charla_id, codigo_unico) VALUES (?, ?, ?, ?)", [nombre, email, charla_id, codigo], function(err) {
        if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
        db.run("UPDATE charlas SET inscritos = inscritos + 1 WHERE id = ?", [charla_id], function(err) {
          if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
          db.run("COMMIT");
          const url = `${BASE_URL}/verificar/${codigo}`;
          QRCode.toDataURL(url, (err, qrDataUrl) => {
            if (err) return res.status(500).json({ error: 'Error generando QR' });
            res.json({ mensaje: 'Inscripción exitosa', codigo, qr: qrDataUrl, url });
          });
        });
      });
    });
  });
});

app.get('/api/mis-inscripciones', (req, res) => {
  const email = req.query.email;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  db.get("SELECT COUNT(*) as total FROM inscripciones WHERE email = ?", [email], (err, totalRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = totalRow.total || 0;
    db.all(`SELECT i.id, i.nombre, i.email, i.codigo_unico AS codigo, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
            c.titulo, c.dia, c.hora, c.ponente FROM inscripciones i JOIN charlas c ON i.charla_id = c.id
            WHERE i.email = ? ORDER BY i.fecha_inscripcion DESC LIMIT ? OFFSET ?`, [email, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    });
  });
});

app.delete('/api/inscripciones/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  db.run("BEGIN TRANSACTION");
  db.get("SELECT charla_id FROM inscripciones WHERE codigo_unico = ?", [codigo], (err, row) => {
    if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
    if (!row) { db.run("ROLLBACK"); return res.status(404).json({ error: 'Inscripción no encontrada' }); }
    db.run("DELETE FROM inscripciones WHERE codigo_unico = ?", [codigo], function(err) {
      if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
      db.run("UPDATE charlas SET inscritos = inscritos - 1 WHERE id = ? AND inscritos > 0", [row.charla_id], function(err) {
        if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
        db.run("COMMIT");
        res.json({ mensaje: 'Inscripción cancelada correctamente' });
      });
    });
  });
});

// ========== PÁGINA DE VERIFICACIÓN QR ==========
app.get('/verificar/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  db.get(`
    SELECT i.nombre, i.email, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
           c.titulo, c.dia, c.hora
    FROM inscripciones i
    JOIN charlas c ON i.charla_id = c.id
    WHERE i.codigo_unico = ?
  `, [codigo], (err, row) => {
    if (err || !row) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verificación - Jornadas UGR</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f5f7fa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; padding: 20px; }
            .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); max-width: 500px; width: 100%; text-align: center; border: 1px solid rgba(0,0,0,0.04); }
            .icon { font-size: 4rem; margin-bottom: 10px; }
            h1 { color: #d52333; margin-bottom: 10px; }
            p { color: #2c3e50; }
            .btn { display: inline-block; background: #003366; color: white; padding: 12px 30px; border-radius: 40px; text-decoration: none; margin-top: 15px; font-weight: 600; transition: background 0.2s; }
            .btn:hover { background: #002244; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">❌</div>
            <h1>Código no válido</h1>
            <p>No se encontró ninguna inscripción con este código.</p>
            <a href="/" class="btn">Volver al inicio</a>
          </div>
        </body>
        </html>
      `);
    }

    if (row.escaneado) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR ya utilizado</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f5f7fa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; padding: 20px; }
            .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); max-width: 500px; width: 100%; text-align: center; border: 1px solid rgba(0,0,0,0.04); }
            .icon { font-size: 4rem; margin-bottom: 10px; }
            h1 { color: #d52333; margin-bottom: 10px; }
            .fecha { background: #f0f4f8; padding: 10px; border-radius: 10px; margin: 15px 0; }
            p { color: #2c3e50; }
            .btn { display: inline-block; background: #003366; color: white; padding: 12px 30px; border-radius: 40px; text-decoration: none; margin-top: 15px; font-weight: 600; transition: background 0.2s; }
            .btn:hover { background: #002244; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">⛔</div>
            <h1>Este QR ya fue utilizado</h1>
            <div class="fecha">
              <p><strong>Primer escaneo:</strong> ${new Date(row.fecha_escaneo).toLocaleString('es-AR')}</p>
            </div>
            <p style="margin-top:10px;">Si tienes dudas, consulta con el organizador.</p>
            <a href="/" class="btn">Volver al inicio</a>
          </div>
        </body>
        </html>
      `);
    }

    const ahora = new Date().toISOString();
    db.run("UPDATE inscripciones SET escaneado = 1, fecha_escaneo = ? WHERE codigo_unico = ?", [ahora, codigo]);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>✅ Inscripción confirmada</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #f5f7fa; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
          .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); max-width: 500px; width: 100%; border: 1px solid rgba(0,0,0,0.04); }
          .icon { font-size: 4rem; text-align: center; margin-bottom: 10px; }
          h1 { color: #003366; border-bottom: 4px solid #d52333; padding-bottom: 12px; margin-bottom: 20px; font-size: 1.8rem; text-align: center; }
          .datos { background: #f9fafc; padding: 20px; border-radius: 12px; margin: 15px 0; }
          .datos p { margin: 8px 0; color: #2c3e50; }
          .datos strong { color: #003366; }
          .escaneo { background: #eef2f7; padding: 12px; border-radius: 10px; font-size: 0.95rem; color: #1e2a3a; margin: 15px 0; text-align: center; }
          .btn { display: inline-block; background: #d52333; color: white; padding: 12px 30px; border-radius: 40px; text-decoration: none; margin-top: 15px; font-weight: 600; transition: background 0.2s; }
          .btn:hover { background: #b01a28; }
          .footer-text { text-align: center; color: #8b949e; font-size: 0.9rem; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>Inscripción confirmada</h1>
          <div class="datos">
            <p><strong>Nombre:</strong> ${row.nombre}</p>
            <p><strong>Email:</strong> ${row.email}</p>
            <p><strong>Charla:</strong> ${row.titulo}</p>
            <p><strong>Día:</strong> ${row.dia} - ${row.hora}</p>
            <p><strong>Fecha de inscripción:</strong> ${new Date(row.fecha_inscripcion).toLocaleString('es-AR')}</p>
          </div>
          <div class="escaneo">🔹 Escaneado el: ${new Date(ahora).toLocaleString('es-AR')}</div>
          <p style="color:#2c3e50; text-align:center;">Este QR es válido para el acceso al evento.</p>
          <div style="text-align:center;">
            <a href="/" class="btn">Volver al inicio</a>
          </div>
          <div class="footer-text">XI Jornadas de Kinesiología y Fisiatría · UGR 2026</div>
        </div>
      </body>
      </html>
    `);
  });
});

// ========== MIDDLEWARE DE AUTENTICACIÓN ==========
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token no proporcionado' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

// ========== ADMIN ==========
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, mensaje: 'Login exitoso' });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

// ===== GET /api/admin/inscripciones =====
app.get('/api/admin/inscripciones', verificarToken, (req, res) => {
  const { email, charla_id, escaneado, page = 1, limit = 20 } = req.query;
  console.log(`📋 GET /admin/inscripciones?page=${page}&limit=${limit}&email=${email || 'none'}&charla_id=${charla_id || 'none'}&escaneado=${escaneado || 'none'}`);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = '1=1';
  const params = [];
  if (email) { where += ' AND i.email LIKE ?'; params.push(`%${email}%`); }
  if (charla_id) { where += ' AND i.charla_id = ?'; params.push(parseInt(charla_id)); }
  if (escaneado !== undefined && escaneado !== '') { where += ' AND i.escaneado = ?'; params.push(escaneado === 'true' ? 1 : 0); }

  const countSQL = `SELECT COUNT(*) as total FROM inscripciones i WHERE ${where}`;
  db.get(countSQL, params, (err, countRow) => {
    if (err) {
      console.error(`❌ Error en GET /admin/inscripciones (count):`, err.message);
      return res.status(500).json({ error: err.message });
    }
    const total = countRow ? countRow.total : 0;

    const query = `
      SELECT i.id, i.nombre, i.email, i.codigo_unico AS codigo, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
             c.titulo AS charla_titulo, c.dia, c.hora, c.ponente
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE ${where}
      ORDER BY i.fecha_inscripcion DESC
      LIMIT ? OFFSET ?
    `;
    db.all(query, [...params, parseInt(limit), offset], (err, rows) => {
      if (err) {
        console.error(`❌ Error en GET /admin/inscripciones (data):`, err.message);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ GET /admin/inscripciones: ${rows.length} registros encontrados (total: ${total})`);
      res.json({
        data: rows,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
      });
    });
  });
});

// ===== PUT /api/admin/inscripciones/:id/escaneado =====
app.put('/api/admin/inscripciones/:id/escaneado', verificarToken, (req, res) => {
  const id = parseInt(req.params.id);
  const { escaneado } = req.body;
  console.log(`🔄 PUT /admin/inscripciones/${id}/escaneado, escaneado=${escaneado}`);

  if (isNaN(id) || typeof escaneado !== 'boolean') {
    console.warn(`❌ Datos inválidos: id=${id}, escaneado=${escaneado}`);
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  db.run(
    "UPDATE inscripciones SET escaneado = ?, fecha_escaneo = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?",
    [escaneado ? 1 : 0, escaneado ? 1 : 0, id],
    function(err) {
      if (err) {
        console.error(`❌ Error en PUT /admin/inscripciones/${id}:`, err.message);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        console.warn(`❌ PUT /admin/inscripciones/${id}: inscripción no encontrada`);
        return res.status(404).json({ error: 'Inscripción no encontrada' });
      }
      console.log(`✅ PUT /admin/inscripciones/${id} actualizado correctamente`);
      res.json({ mensaje: 'Actualizado correctamente' });
    }
  );
});

// ===== DELETE /api/admin/inscripciones/:id =====
app.delete('/api/admin/inscripciones/:id', verificarToken, (req, res) => {
  const id = parseInt(req.params.id);
  console.log(`🗑️ DELETE /admin/inscripciones/${id}`);

  if (isNaN(id)) {
    console.warn(`❌ ID inválido: ${id}`);
    return res.status(400).json({ error: 'ID inválido' });
  }

  db.run("BEGIN TRANSACTION");
  db.get("SELECT charla_id FROM inscripciones WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error(`❌ Error en DELETE /admin/inscripciones/${id}:`, err.message);
      db.run("ROLLBACK");
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      console.warn(`❌ DELETE /admin/inscripciones/${id}: inscripción no encontrada`);
      db.run("ROLLBACK");
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }

    db.run("DELETE FROM inscripciones WHERE id = ?", [id], function(err) {
      if (err) {
        console.error(`❌ Error en DELETE /admin/inscripciones/${id} (delete):`, err.message);
        db.run("ROLLBACK");
        return res.status(500).json({ error: err.message });
      }

      db.run("UPDATE charlas SET inscritos = inscritos - 1 WHERE id = ? AND inscritos > 0", [row.charla_id], function(err) {
        if (err) {
          console.error(`❌ Error en DELETE /admin/inscripciones/${id} (update cupo):`, err.message);
          db.run("ROLLBACK");
          return res.status(500).json({ error: err.message });
        }

        db.run("COMMIT");
        console.log(`✅ DELETE /admin/inscripciones/${id} exitoso`);
        res.json({ mensaje: 'Inscripción eliminada y cupo liberado' });
      });
    });
  });
});

// ===== GET /api/admin/exportar-excel =====
app.get('/api/admin/exportar-excel', verificarToken, (req, res) => {
  console.log(`📊 GET /admin/exportar-excel`);

  db.all(`
    SELECT i.nombre, i.email, c.titulo AS charla, c.dia, c.hora, i.codigo_unico AS codigo,
           i.fecha_inscripcion, CASE WHEN i.escaneado THEN 'Sí' ELSE 'No' END AS escaneado, i.fecha_escaneo
    FROM inscripciones i
    JOIN charlas c ON i.charla_id = c.id
    ORDER BY i.fecha_inscripcion DESC
  `, (err, rows) => {
    if (err) {
      console.error(`❌ Error en GET /admin/exportar-excel:`, err.message);
      return res.status(500).json({ error: err.message });
    }
    if (rows.length === 0) {
      console.warn(`⚠️ GET /admin/exportar-excel: No hay inscripciones`);
      return res.status(404).json({ error: 'No hay inscripciones' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inscripciones');
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
    worksheet.addRows(rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=inscripciones-${new Date().toISOString().split('T')[0]}.xlsx`);
    workbook.xlsx.writeBuffer().then(buffer => {
      console.log(`✅ GET /admin/exportar-excel: ${rows.length} registros exportados`);
      res.send(buffer);
    }).catch(err => {
      console.error(`❌ Error en GET /admin/exportar-excel (writeBuffer):`, err.message);
      res.status(500).json({ error: err.message });
    });
  });
});

// ========== SERVIR FRONTEND ==========
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));