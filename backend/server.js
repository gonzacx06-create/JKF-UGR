const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./jornadas.db');

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
});

// Insertar charlas de ejemplo (puedes cambiarlas después)
db.get("SELECT COUNT(*) as count FROM charlas", (err, row) => {
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
  }
});

// ENDPOINTS
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

app.get('/api/verificar/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  db.get(`
    SELECT i.nombre, i.email, i.fecha_inscripcion, c.titulo, c.dia, c.hora
    FROM inscripciones i
    JOIN charlas c ON i.charla_id = c.id
    WHERE i.codigo_unico = ?
  `, [codigo], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código no válido' });
    res.json(row);
  });
});

app.get('/verificar/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  db.get(`
    SELECT i.nombre, i.email, i.fecha_inscripcion, c.titulo, c.dia, c.hora
    FROM inscripciones i
    JOIN charlas c ON i.charla_id = c.id
    WHERE i.codigo_unico = ?
  `, [codigo], (err, row) => {
    if (err || !row) {
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h1 style="color:#d52333;">❌ Código no válido</h1>
          <p>No se encontró ninguna inscripción con este código.</p>
        </body></html>
      `);
    }
    res.send(`
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verificación de inscripción</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #f4f7fc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
          .header { color: #003366; border-bottom: 3px solid #d52333; padding-bottom: 10px; }
          .datos { text-align: left; margin: 20px 0; }
          .confirmado { color: #d52333; font-weight: bold; font-size: 1.2rem; }
          .btn { display: inline-block; background: #003366; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="header">✅ Inscripción confirmada</h1>
          <div class="datos">
            <p><strong>Nombre:</strong> ${row.nombre}</p>
            <p><strong>Email:</strong> ${row.email}</p>
            <p><strong>Charla:</strong> ${row.titulo}</p>
            <p><strong>Día:</strong> ${row.dia} - ${row.hora}</p>
            <p><strong>Fecha de inscripción:</strong> ${row.fecha_inscripcion}</p>
          </div>
          <p class="confirmado">Este QR es válido para el acceso.</p>
          <p style="color:#666;font-size:0.9rem;">Presenta este código en el evento.</p>
          <a href="/" class="btn">Volver al inicio</a>
        </div>
      </body>
      </html>
    `);
  });
});

// Servir frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));