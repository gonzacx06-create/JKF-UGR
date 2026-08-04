const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const app = express();
app.use(cors());
app.use(express.json());

// ========== CONFIGURACIÓN ==========
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'mi_clave_super_secreta_123456';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ========== BASE DE DATOS SQLITE ==========
const db = new sqlite3.Database('./jornadas.db');

// ========== INICIALIZAR TABLAS Y MIGRACIONES ==========
db.serialize(() => {
  // Tabla charlas
  db.run(`
    CREATE TABLE IF NOT EXISTS charlas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      dia TEXT,
      hora TEXT,
      ponente TEXT,
      cupo_maximo INTEGER,
      inscritos INTEGER DEFAULT 0
    )
  `, (err) => {
    if (err) console.error('Error creando charlas:', err.message);
    else console.log('✅ Tabla charlas lista');
  });

  // Tabla inscripciones
  db.run(`
    CREATE TABLE IF NOT EXISTS inscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      email TEXT,
      charla_id INTEGER,
      codigo_unico TEXT UNIQUE,
      fecha_inscripcion DATETIME DEFAULT CURRENT_TIMESTAMP,
      escaneado BOOLEAN DEFAULT 0,
      fecha_escaneo DATETIME,
      FOREIGN KEY (charla_id) REFERENCES charlas(id)
    )
  `, (err) => {
    if (err) console.error('Error creando inscripciones:', err.message);
    else console.log('✅ Tabla inscripciones lista');
  });

  // Migración: agregar columnas si no existen (ya están en CREATE, pero por si acaso)
  db.all("PRAGMA table_info(inscripciones)", (err, rows) => {
    if (err) return;
    const columns = rows.map(r => r.name);
    if (!columns.includes('escaneado')) {
      db.run("ALTER TABLE inscripciones ADD COLUMN escaneado BOOLEAN DEFAULT 0");
    }
    if (!columns.includes('fecha_escaneo')) {
      db.run("ALTER TABLE inscripciones ADD COLUMN fecha_escaneo DATETIME");
    }
  });

  // Resetear cupos e inscripciones (para empezar limpio)
  db.run("UPDATE charlas SET inscritos = 0");
  db.run("DELETE FROM inscripciones");
  console.log('✅ Cupos reseteados a 0 y inscripciones eliminadas');

  // ========== NUEVA LISTA DE CHARLAS (según los datos proporcionados) ==========
  // Eliminar todas las charlas existentes para reemplazarlas
  db.run("DELETE FROM charlas", (err) => {
    if (err) console.error('Error al eliminar charlas:', err.message);
    else {
      const nuevasCharlas = [
        // Miércoles 2
        ['Robertino Bottaniz', 'Miércoles 2', '08:00 - 09:00', 'Robertino Bottaniz', 40],
        ['agus elz', 'Miércoles 2', '09:00 - 10:00', 'agus elz', 40],
        ['Angelina Tibaldo', 'Miércoles 2', '10:00 - 11:00', 'Angelina Tibaldo', 40],
        ['rami pioli', 'Miércoles 2', '11:00 - 12:00', 'rami pioli', 40],
        ['Sofi Mandole, Iara Pereyra', 'Miércoles 2', '12:00 - 13:00', 'Sofi Mandole, Iara Pereyra', 40],
        ['Ana Cristina Piacenza', 'Miércoles 2', '13:00 - 14:00', 'Ana Cristina Piacenza', 40],
        ['Anto Baldesari', 'Miércoles 2', '14:00 - 15:00', 'Anto Baldesari', 40],
        ['Carlos fumero', 'Miércoles 2', '15:00 - 16:00', 'Carlos fumero', 40],
        ['fede uca', 'Miércoles 2', '16:00 - 17:00', 'fede uca', 40],
        ['brenda lorenz', 'Miércoles 2', '18:00 - 19:00', 'brenda lorenz', 40],
        ['Vanesa Dupertuis', 'Miércoles 2', '19:00 - 20:00', 'Vanesa Dupertuis', 40],
        // Jueves 3
        ['Lucas Orlandi', 'Jueves 3', '08:00 - 09:00', 'Lucas Orlandi', 40],
        ['Male y Mica Carrizo', 'Jueves 3', '10:00 - 11:00', 'Male y Mica Carrizo', 40],
        ['Pablo Seguro', 'Jueves 3', '11:00 - 12:00', 'Pablo Seguro', 40],
        ['Gri Sosa', 'Jueves 3', '12:00 - 13:00', 'Gri Sosa', 40],
        ['Carlos Bonino', 'Jueves 3', '13:00 - 14:00', 'Carlos Bonino', 40],
        ['Mariela Perugini', 'Jueves 3', '12:00 - 14:30', 'Mariela Perugini', 40]
      ];

      const stmt = db.prepare("INSERT INTO charlas (titulo, dia, hora, ponente, cupo_maximo) VALUES (?, ?, ?, ?, ?)");
      nuevasCharlas.forEach(ch => stmt.run(ch));
      stmt.finalize(() => {
        console.log('✅ Charlas actualizadas con los nuevos horarios y disertantes');
      });
    }
  });
});

// ========== MIDDLEWARE JWT ==========
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

// ========== ENDPOINTS PÚBLICOS ==========

// Obtener charlas
app.get('/api/charlas', (req, res) => {
  db.all("SELECT *, (cupo_maximo - inscritos) as disponibles FROM charlas", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Inscribir
app.post('/api/inscribir', (req, res) => {
  const { nombre, email, charla_id } = req.body;
  if (!nombre || !email || !charla_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  db.get("SELECT cupo_maximo, inscritos FROM charlas WHERE id = ?", [charla_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Charla no encontrada' });
    if (row.inscritos >= row.cupo_maximo) {
      return res.status(400).json({ error: 'Cupo completo' });
    }

    // Límite de 2 inscripciones por email por charla
    db.get("SELECT COUNT(*) as count FROM inscripciones WHERE email = ? AND charla_id = ?", [email, charla_id], (err, countRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (countRow.count >= 2) {
        return res.status(400).json({ error: 'Ya tienes el máximo de 2 inscripciones para esta charla.' });
      }

      const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();

      db.run("BEGIN TRANSACTION");
      db.run("INSERT INTO inscripciones (nombre, email, charla_id, codigo_unico) VALUES (?, ?, ?, ?)",
        [nombre, email, charla_id, codigo],
        function(err) {
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
        }
      );
    });
  });
});

// Mis inscripciones (por email)
app.get('/api/mis-inscripciones', (req, res) => {
  const email = req.query.email;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;

  if (!email) return res.status(400).json({ error: 'Email requerido' });

  db.get("SELECT COUNT(*) as total FROM inscripciones WHERE email = ?", [email], (err, totalRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = totalRow.total || 0;

    db.all(`
      SELECT i.id, i.nombre, i.email, i.codigo_unico AS codigo, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
             c.titulo, c.dia, c.hora, c.ponente
      FROM inscripciones i
      JOIN charlas c ON i.charla_id = c.id
      WHERE i.email = ?
      ORDER BY i.fecha_inscripcion DESC
      LIMIT ? OFFSET ?
    `, [email, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        data: rows,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
      });
    });
  });
});

// Cancelar inscripción (por código)
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

// ========== PÁGINA DE VERIFICACIÓN DE QR ==========
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
        <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verificación - Jornadas UGR</title>
        <style>body{font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.card{background:#161b22;padding:40px;border-radius:10px;border:1px solid #30363d;max-width:500px;text-align:center;}.icon{font-size:4rem;}.h1{color:#f85149;}</style>
        </head><body><div class="card"><div class="icon">❌</div><h1 style="color:#f85149;">Código no válido</h1><p style="color:#8b949e;">No se encontró ninguna inscripción con este código.</p><a href="/" style="color:#e8a838;">← Volver</a></div></body></html>
      `);
    }

    if (row.escaneado) {
      return res.send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR ya utilizado</title>
        <style>body{font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.card{background:#161b22;padding:40px;border-radius:10px;border:1px solid #30363d;max-width:500px;text-align:center;}.icon{font-size:4rem;}.fecha{background:#21262d;padding:10px;border-radius:6px;margin:15px 0;}</style>
        </head><body><div class="card"><div class="icon">⛔</div><h1 style="color:#f85149;">QR ya utilizado</h1><div class="fecha"><p><strong>Primer escaneo:</strong> ${new Date(row.fecha_escaneo).toLocaleString('es-AR')}</p></div><p style="color:#8b949e;">Si tienes dudas, consulta con el organizador.</p><a href="/" style="color:#e8a838;">← Volver</a></div></body></html>
      `);
    }

    // Primer escaneo válido
    const ahora = new Date().toISOString();
    db.run("UPDATE inscripciones SET escaneado = 1, fecha_escaneo = ? WHERE codigo_unico = ?", [ahora, codigo]);

    res.send(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>✅ Inscripción confirmada</title>
      <style>
        body{font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;}
        .card{background:#161b22;padding:40px;border-radius:10px;border:1px solid #30363d;max-width:500px;width:100%;}
        .icon{font-size:4rem;text-align:center;}
        h1{color:#81c784;border-bottom:2px solid #e8a838;padding-bottom:12px;margin-bottom:20px;}
        .datos{background:#21262d;padding:20px;border-radius:6px;margin:15px 0;}
        .datos p{margin:8px 0;}
        .escaneo{background:#21262d;padding:12px;border-radius:6px;font-size:0.9rem;color:#8b949e;margin:15px 0;text-align:center;}
        .btn{display:inline-block;background:#e8a838;color:#0d1117;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:15px;}
        .btn:hover{opacity:0.8;}
      </style>
      </head><body>
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
        <p style="color:#8b949e;">Este QR es válido para el acceso.</p>
        <a href="/" class="btn">Volver al inicio</a>
      </div>
      </body></html>
    `);
  });
});

// ========== ADMIN: LOGIN ==========
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, mensaje: 'Login exitoso' });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

// ========== ADMIN: GESTIÓN DE INSCRIPCIONES ==========
app.get('/api/admin/inscripciones', verificarToken, (req, res) => {
  const { email, charla_id, escaneado, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = '1=1';
  const params = [];
  if (email) { where += ' AND i.email LIKE ?'; params.push(`%${email}%`); }
  if (charla_id) { where += ' AND i.charla_id = ?'; params.push(parseInt(charla_id)); }
  if (escaneado !== undefined && escaneado !== '') { where += ' AND i.escaneado = ?'; params.push(escaneado === 'true' ? 1 : 0); }

  const countSQL = `SELECT COUNT(*) as total FROM inscripciones i WHERE ${where}`;
  db.get(countSQL, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: err.message });
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
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        data: rows,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
      });
    });
  });
});

// Actualizar escaneado (admin)
app.put('/api/admin/inscripciones/:id/escaneado', verificarToken, (req, res) => {
  const id = parseInt(req.params.id);
  const { escaneado } = req.body;
  if (isNaN(id) || typeof escaneado !== 'boolean') {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  db.run(
    "UPDATE inscripciones SET escaneado = ?, fecha_escaneo = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?",
    [escaneado ? 1 : 0, escaneado ? 1 : 0, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Inscripción no encontrada' });
      res.json({ mensaje: 'Actualizado correctamente' });
    }
  );
});

// Eliminar inscripción (admin)
app.delete('/api/admin/inscripciones/:id', verificarToken, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  db.run("BEGIN TRANSACTION");
  db.get("SELECT charla_id FROM inscripciones WHERE id = ?", [id], (err, row) => {
    if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
    if (!row) { db.run("ROLLBACK"); return res.status(404).json({ error: 'Inscripción no encontrada' }); }

    db.run("DELETE FROM inscripciones WHERE id = ?", [id], function(err) {
      if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
      db.run("UPDATE charlas SET inscritos = inscritos - 1 WHERE id = ? AND inscritos > 0", [row.charla_id], function(err) {
        if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
        db.run("COMMIT");
        res.json({ mensaje: 'Inscripción eliminada y cupo liberado' });
      });
    });
  });
});

// ========== ADMIN: EXPORTAR A EXCEL ==========
app.get('/api/admin/exportar-excel', verificarToken, (req, res) => {
  db.all(`
    SELECT i.nombre, i.email, c.titulo AS charla, c.dia, c.hora, i.codigo_unico AS codigo,
           i.fecha_inscripcion, CASE WHEN i.escaneado THEN 'Sí' ELSE 'No' END AS escaneado, i.fecha_escaneo
    FROM inscripciones i
    JOIN charlas c ON i.charla_id = c.id
    ORDER BY i.fecha_inscripcion DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: 'No hay inscripciones' });

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
    workbook.xlsx.writeBuffer().then(buffer => res.send(buffer));
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