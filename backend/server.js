const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ========== BASE DE DATOS SQLITE ==========
const db = new sqlite3.Database('./jornadas.db');

// Crear tablas si no existen
db.serialize(() => {
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
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      email TEXT,
      charla_id INTEGER,
      codigo_unico TEXT UNIQUE,
      fecha_inscripcion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (charla_id) REFERENCES charlas(id)
    )
  `);

  // ========== MIGRACIÓN SEGURA ==========
  db.all("PRAGMA table_info(inscripciones)", (err, rows) => {
    if (err) {
      console.error('Error al verificar columnas:', err.message);
      return;
    }
    const columns = Array.isArray(rows) ? rows : [];
    const columnNames = columns.map(row => row.name);

    if (!columnNames.includes('escaneado')) {
      db.run("ALTER TABLE inscripciones ADD COLUMN escaneado BOOLEAN DEFAULT 0", (err) => {
        if (err) console.error('Error al agregar columna escaneado:', err.message);
        else console.log('✅ Columna escaneado agregada correctamente');
      });
    }

    if (!columnNames.includes('fecha_escaneo')) {
      db.run("ALTER TABLE inscripciones ADD COLUMN fecha_escaneo DATETIME", (err) => {
        if (err) console.error('Error al agregar columna fecha_escaneo:', err.message);
        else console.log('✅ Columna fecha_escaneo agregada correctamente');
      });
    }
  });

  // Resetear cupos a 0 (para empezar de nuevo)
  db.run("UPDATE charlas SET inscritos = 0", (err) => {
    if (err) console.error("Error al resetear cupos:", err.message);
    else console.log("✅ Cupos reseteados a 0");
  });
});

// Insertar charlas de ejemplo si no existen
db.get("SELECT COUNT(*) as count FROM charlas", (err, row) => {
  if (err) {
    console.error('Error al verificar charlas:', err.message);
    return;
  }
  if (row.count === 0) {
    const charlas = [
      ['Biomecánica del movimiento', 'Lunes 15/06', '10:00', 'Dr. Pérez', 40],
      ['Fisioterapia deportiva', 'Martes 16/06', '12:00', 'Lic. Gómez', 35],
      ['Rehabilitación neurológica', 'Miércoles 17/06', '09:00', 'Dra. López', 40],
      ['Kinesiología en pediatría', 'Jueves 18/06', '11:00', 'Lic. Martínez', 35],
    ];
    const stmt = db.prepare("INSERT INTO charlas (titulo, dia, hora, ponente, cupo_maximo) VALUES (?, ?, ?, ?, ?)");
    charlas.forEach(c => stmt.run(c));
    stmt.finalize();
    console.log('✅ Charlas de ejemplo insertadas');
  }
});

// ========== ENDPOINTS ==========
app.get('/api/charlas', (req, res) => {
  db.all("SELECT *, (cupo_maximo - inscritos) as disponibles FROM charlas", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/inscribir', (req, res) => {
  const { nombre, email, charla_id } = req.body;
  if (!nombre || !email || !charla_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  db.get("SELECT cupo_maximo, inscritos FROM charlas WHERE id = ?", [charla_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Charla no encontrada' });
    if (row.inscritos >= row.cupo_maximo) {
      return res.status(400).json({ error: 'Cupo completo para esta charla' });
    }

    const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();

    db.run("BEGIN TRANSACTION");
    db.run("INSERT INTO inscripciones (nombre, email, charla_id, codigo_unico) VALUES (?, ?, ?, ?)",
      [nombre, email, charla_id, codigo],
      function(err) {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: err.message });
        }
        db.run("UPDATE charlas SET inscritos = inscritos + 1 WHERE id = ?", [charla_id], function(err) {
          if (err) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: err.message });
          }
          db.run("COMMIT");

          const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
          const url = `${baseUrl}/verificar/${codigo}`;
          QRCode.toDataURL(url, (err, qrDataUrl) => {
            if (err) return res.status(500).json({ error: 'Error generando QR' });
            res.json({
              mensaje: 'Inscripción exitosa',
              codigo,
              qr: qrDataUrl,
              url
            });
          });
        });
      }
    );
  });
});

// ========== RUTA DE VERIFICACIÓN (con el nuevo diseño) ==========
app.get('/verificar/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  db.get(`
    SELECT i.nombre, i.email, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo, c.titulo, c.dia, c.hora
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
            body { font-family: 'Segoe UI', sans-serif; background: #f5f7fa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); max-width: 500px; text-align: center; }
            .icon { font-size: 4rem; margin-bottom: 10px; }
            h1 { color: #d52333; margin-bottom: 10px; }
            p { color: #2c3e50; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">❌</div>
            <h1>Código no válido</h1>
            <p>No se encontró ninguna inscripción con este código.</p>
            <p style="margin-top:20px;"><a href="/" style="color:#003366; text-decoration:none; font-weight:600;">← Volver al inicio</a></p>
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
            body { font-family: 'Segoe UI', sans-serif; background: #f5f7fa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); max-width: 500px; text-align: center; }
            .icon { font-size: 4rem; margin-bottom: 10px; }
            h1 { color: #d52333; margin-bottom: 10px; }
            .fecha { background: #f0f4f8; padding: 10px; border-radius: 10px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">⛔</div>
            <h1>Este QR ya fue utilizado</h1>
            <div class="fecha">
              <p><strong>Primer escaneo:</strong> ${new Date(row.fecha_escaneo).toLocaleString('es-AR')}</p>
            </div>
            <p style="margin-top:20px;">Si tienes dudas, consulta con el organizador.</p>
            <p><a href="/" style="color:#003366; text-decoration:none; font-weight:600;">← Volver al inicio</a></p>
          </div>
        </body>
        </html>
      `);
    }

    const ahora = new Date().toISOString();
    db.run("UPDATE inscripciones SET escaneado = 1, fecha_escaneo = ? WHERE codigo_unico = ?", [ahora, codigo], (err) => {
      if (err) console.error('Error al actualizar escaneo:', err.message);
    });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>✅ Inscripción confirmada</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #f5f7fa; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
          .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); max-width: 500px; width: 100%; }
          .icon { font-size: 4rem; margin-bottom: 10px; text-align: center; }
          h1 { color: #003366; border-bottom: 4px solid #d52333; padding-bottom: 12px; margin-bottom: 20px; font-size: 1.6rem; }
          .datos { background: #f9fafc; padding: 20px; border-radius: 12px; margin: 15px 0; }
          .datos p { margin: 8px 0; }
          .escaneo { background: #eef2f7; padding: 12px; border-radius: 10px; font-size: 0.9rem; color: #1e2a3a; margin: 15px 0; text-align: center; }
          .btn { display: inline-block; background: #003366; color: white; padding: 12px 30px; border-radius: 40px; text-decoration: none; margin-top: 15px; font-weight: 600; transition: background 0.2s; }
          .btn:hover { background: #002244; }
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
          <div class="escaneo">
            🔹 Escaneado el: ${new Date(ahora).toLocaleString('es-AR')}
          </div>
          <p style="color:#2c3e50; margin:10px 0;">Este QR es válido para el acceso.</p>
          <p style="text-align:center;"><a href="/" class="btn">Volver al inicio</a></p>
        </div>
      </body>
      </html>
    `);
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