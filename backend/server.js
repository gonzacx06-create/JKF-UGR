const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Base de datos
const db = new sqlite3.Database('./jornadas.db');

db.serialize(() => {
  // Crear tabla de charlas
  db.run(`CREATE TABLE IF NOT EXISTS charlas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT,
    dia TEXT,
    hora TEXT,
    ponente TEXT,
    cupo_maximo INTEGER,
    inscritos INTEGER DEFAULT 0
  )`);

  // Crear tabla de inscripciones
  db.run(`CREATE TABLE IF NOT EXISTS inscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    email TEXT,
    charla_id INTEGER,
    codigo_unico TEXT UNIQUE,
    fecha_inscripcion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (charla_id) REFERENCES charlas(id)
  )`);

  // Agregar columnas nuevas (solo si no existen) - SEGURO
  db.get("PRAGMA table_info(inscripciones)", (err, rows) => {
    if (err) {
      console.error("Error al obtener información de la tabla:", err.message);
      return;
    }
    // Verificar si la columna 'escaneado' existe
    const columnExists = (colName) => rows.some(row => row.name === colName);
    
    if (!columnExists('escaneado')) {
      db.run("ALTER TABLE inscripciones ADD COLUMN escaneado BOOLEAN DEFAULT 0", (err) => {
        if (err) console.error("Error agregando columna escaneado:", err.message);
        else console.log("✅ Columna 'escaneado' agregada correctamente");
      });
    }
    
    if (!columnExists('fecha_escaneo')) {
      db.run("ALTER TABLE inscripciones ADD COLUMN fecha_escaneo DATETIME", (err) => {
        if (err) console.error("Error agregando columna fecha_escaneo:", err.message);
        else console.log("✅ Columna 'fecha_escaneo' agregada correctamente");
      });
    }
  });

  // RESETEAR CUPOS A 40 Y LIMPIAR INSCRIPCIONES (para empezar de cero)
  db.run("UPDATE charlas SET inscritos = 0", (err) => {
    if (err) console.error("Error al resetear cupos:", err.message);
    else console.log("✅ Cupos reseteados a 0");
  });

  // Opcional: Limpiar todas las inscripciones (si quieres empezar de cero)
  db.run("DELETE FROM inscripciones", (err) => {
    if (err) console.error("Error al limpiar inscripciones:", err.message);
    else console.log("✅ Inscripciones eliminadas");
  });

  // Insertar charlas de ejemplo si no existen
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
      console.log("✅ Charlas de ejemplo insertadas");
    }
  });
});

// API endpoints
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

          // URL para producción (cambia por tu URL de Render)
          const url = `https://jornadas-ugr.onrender.com/verificar/${codigo}`;
          // Si quieres usar variable de entorno:
          // const baseUrl = process.env.BASE_URL || 'https://jornadas-ugr.onrender.com';
          // const url = `${baseUrl}/verificar/${codigo}`;

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

// Página de verificación
app.get('/verificar/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  
  // 1. Buscar la inscripción
  db.get(`
    SELECT i.nombre, i.email, i.fecha_inscripcion, i.escaneado, i.fecha_escaneo,
           c.titulo, c.dia, c.hora
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

    // 2. Verificar si ya fue escaneado
    if (row.escaneado === 1) {
      return res.send(`
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR ya utilizado</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f4f7fc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
            .header { color: #d52333; border-bottom: 3px solid #d52333; padding-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="header">⛔ QR ya utilizado</h1>
            <p>Este código QR ya fue escaneado el <strong>${row.fecha_escaneo}</strong>.</p>
            <p style="color:#666;font-size:0.9rem;">No se permite el reingreso con el mismo código.</p>
          </div>
        </body>
        </html>
      `);
    }

    // 3. Primera vez: marcar como escaneado y guardar fecha/hora
    const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    db.run(
      "UPDATE inscripciones SET escaneado = 1, fecha_escaneo = ? WHERE codigo_unico = ?",
      [ahora, codigo],
      function(err) {
        if (err) {
          console.error('Error al actualizar escaneo:', err);
          return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
              <h1 style="color:#d52333;">❌ Error</h1>
              <p>Ocurrió un error al procesar el escaneo.</p>
            </body></html>
          `);
        }

        // 4. Mostrar confirmación con el horario de escaneo
        res.send(`
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>✅ Inscripción confirmada</title>
            <style>
              body { font-family: 'Segoe UI', sans-serif; background: #f4f7fc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
              .header { color: #003366; border-bottom: 3px solid #d52333; padding-bottom: 10px; }
              .datos { text-align: left; margin: 20px 0; }
              .confirmado { color: #16a34a; font-weight: bold; font-size: 1.2rem; }
              .escaneo { color: #d52333; font-weight: bold; }
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
              <p class="confirmado">✅ QR válido para el acceso</p>
              <p class="escaneo">🕒 Escaneado el: ${ahora}</p>
              <p style="color:#666;font-size:0.9rem;">Presenta este código en el evento.</p>
              <a href="/" class="btn" style="display:inline-block;background:#003366;color:white;padding:10px 20px;border-radius:30px;text-decoration:none;margin-top:10px;">Volver al inicio</a>
            </div>
          </body>
          </html>
        `);
      }
    );
  });
});
// Servir el frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));