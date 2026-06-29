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

  // ========== MIGRACIÓN SEGURA: Agregar columnas si no existen ==========
db.serialize(() => {
  // Verificar y agregar columna 'escaneado' si no existe
  db.all("PRAGMA table_info(inscripciones)", (err, rows) => {
    if (err) {
      console.error('Error al verificar columnas:', err.message);
      return;
    }
    
    // Asegurarse de que rows sea un array
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
});
// ============================================================

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

// ENDPOINT TEMPORAL PARA VERIFICAR INSCRIPCIONES EN PRODUCCIÓN
app.get('/api/ver-inscripciones', (req, res) => {
  db.all("SELECT * FROM inscripciones", (err, rows) => {
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

// ============================================
// PÁGINA DE VERIFICACIÓN (con el mismo diseño)
// ============================================
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
      // Página de error con el mismo diseño
      return res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR no válido - Jornadas UGR</title>
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
              --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            * { margin:0; padding:0; box-sizing:border-box; }
            body {
              background: var(--bg);
              color: var(--text);
              font-family: var(--font-body);
              min-height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
              padding: 20px;
            }
            .card {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 12px;
              padding: 40px;
              max-width: 480px;
              width: 100%;
              text-align: center;
            }
            .card .icon { font-size: 48px; margin-bottom: 16px; }
            .card h1 {
              font-family: 'Georgia', serif;
              font-size: 24px;
              color: #fff;
              margin-bottom: 12px;
            }
            .card h1 .error { color: var(--rojo-ugr); }
            .card p {
              color: var(--text-dim);
              font-size: 14px;
              line-height: 1.7;
              margin-bottom: 8px;
            }
            .card .btn {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 28px;
              background: var(--accent);
              color: #0d1117;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 700;
              font-size: 14px;
            }
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

    // Si el QR ya fue escaneado antes
    if (row.escaneado === 1) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR ya utilizado - Jornadas UGR</title>
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
              --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            * { margin:0; padding:0; box-sizing:border-box; }
            body {
              background: var(--bg);
              color: var(--text);
              font-family: var(--font-body);
              min-height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
              padding: 20px;
            }
            .card {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 12px;
              padding: 40px;
              max-width: 480px;
              width: 100%;
              text-align: center;
            }
            .card .icon { font-size: 48px; margin-bottom: 16px; }
            .card h1 {
              font-family: 'Georgia', serif;
              font-size: 24px;
              color: #fff;
              margin-bottom: 12px;
            }
            .card h1 .warning { color: var(--accent); }
            .card p {
              color: var(--text-dim);
              font-size: 14px;
              line-height: 1.7;
              margin-bottom: 8px;
            }
            .card .highlight {
              color: var(--azul-ugr);
              font-weight: 600;
            }
            .card .btn {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 28px;
              background: var(--accent);
              color: #0d1117;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 700;
              font-size: 14px;
            }
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

    // ============================================
    // PRIMERA VEZ: Marcar como escaneado y mostrar datos
    // ============================================
    const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    db.run(
      "UPDATE inscripciones SET escaneado = 1, fecha_escaneo = ? WHERE codigo_unico = ?",
      [ahora, codigo],
      function(err) {
        if (err) {
          console.error('Error al actualizar escaneo:', err);
          return res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Error - Jornadas UGR</title>
              <style>
                :root {
                  --bg: #0d1117;
                  --surface: #161b22;
                  --border: #30363d;
                  --accent: #e8a838;
                  --text: #e6edf3;
                  --text-dim: #8b949e;
                  --rojo-ugr: #D32F2F;
                  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }
                * { margin:0; padding:0; box-sizing:border-box; }
                body {
                  background: var(--bg);
                  color: var(--text);
                  font-family: var(--font-body);
                  min-height: 100vh;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  padding: 20px;
                }
                .card {
                  background: var(--surface);
                  border: 1px solid var(--border);
                  border-radius: 12px;
                  padding: 40px;
                  max-width: 480px;
                  width: 100%;
                  text-align: center;
                }
                .card .icon { font-size: 48px; margin-bottom: 16px; }
                .card h1 {
                  font-family: 'Georgia', serif;
                  font-size: 24px;
                  color: #fff;
                  margin-bottom: 12px;
                }
                .card h1 .error { color: var(--rojo-ugr); }
                .card p {
                  color: var(--text-dim);
                  font-size: 14px;
                  line-height: 1.7;
                  margin-bottom: 8px;
                }
                .card .btn {
                  display: inline-block;
                  margin-top: 20px;
                  padding: 10px 28px;
                  background: var(--accent);
                  color: #0d1117;
                  border-radius: 6px;
                  text-decoration: none;
                  font-weight: 700;
                  font-size: 14px;
                }
                .card .btn:hover { opacity: 0.85; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">⚠️</div>
                <h1><span class="error">Error al procesar</span></h1>
                <p>Ocurrió un error al verificar tu inscripción.</p>
                <p style="font-size:12px;color:var(--text-dimmer);">Intenta nuevamente o contacta al organizador.</p>
                <a href="/" class="btn">Volver al inicio</a>
              </div>
            </body>
            </html>
          `);
        }

        // ✅ ÉXITO: Mostrar los datos con el diseño UGR
        res.send(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>✅ Inscripción confirmada - Jornadas UGR</title>
            <style>
              :root {
                --bg: #0d1117;
                --surface: #161b22;
                --surface2: #1c2330;
                --border: #30363d;
                --accent: #e8a838;
                --text: #e6edf3;
                --text-dim: #8b949e;
                --azul-ugr: #1565C0;
                --azul-ugr-claro: #42A5F5;
                --verde: #81c784;
                --font-display: 'Georgia', serif;
                --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              }
              * { margin:0; padding:0; box-sizing:border-box; }
              body {
                background: var(--bg);
                color: var(--text);
                font-family: var(--font-body);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 24px;
              }
              .card {
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 40px 36px;
                max-width: 520px;
                width: 100%;
              }
              .card .header-icon {
                font-size: 48px;
                text-align: center;
                margin-bottom: 12px;
              }
              .card h1 {
                font-family: var(--font-display);
                font-size: 26px;
                color: var(--verde);
                text-align: center;
                margin-bottom: 6px;
              }
              .card .subtitle {
                text-align: center;
                color: var(--text-dim);
                font-size: 14px;
                border-bottom: 1px solid var(--border);
                padding-bottom: 16px;
                margin-bottom: 20px;
              }
              .card .datos {
                display: grid;
                grid-template-columns: 100px 1fr;
                gap: 8px 16px;
                font-size: 14px;
                margin-bottom: 20px;
              }
              .card .datos .label {
                color: var(--text-dim);
                font-weight: 600;
              }
              .card .datos .value {
                color: var(--text);
                word-break: break-word;
              }
              .card .datos .value .destacado {
                color: var(--azul-ugr-claro);
                font-weight: 600;
              }
              .card .badge {
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
              .card .badge small {
                display: block;
                font-weight: 400;
                color: var(--text-dim);
                font-size: 12px;
                margin-top: 4px;
              }
              .card .footer-info {
                text-align: center;
                color: var(--text-dimmer);
                font-size: 12px;
                border-top: 1px solid var(--border);
                padding-top: 16px;
                margin-top: 8px;
              }
              .card .btn {
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
                transition: opacity 0.2s;
              }
              .card .btn:hover { opacity: 0.85; }
              @media (max-width: 480px) {
                .card { padding: 24px 18px; }
                .card .datos { grid-template-columns: 1fr; gap: 2px; }
                .card .datos .label { font-weight: 700; }
              }
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