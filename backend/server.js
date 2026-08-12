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

// Inicializar tablas
db.serialize(() => {
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

  // Resetear cupos e inscripciones
  db.run("DELETE FROM inscripciones");
  db.run("UPDATE charlas SET inscritos = 0");

  // Eliminar charlas existentes y cargar las nuevas
  db.run("DELETE FROM charlas", (err) => {
    if (err) console.error('Error al eliminar charlas:', err.message);
    else {
      // ========== NUEVA LISTA DE CHARLAS (según los datos proporcionados) ==========
      const nuevasCharlas = [
        // ===== MIÉRCOLES 2 =====
        // 8 HS
        ['Abordaje Osteopatico de la "Pubalgia" (Dolor de cadera). Evaluación y tratamiento.', 'Miércoles 2', '08:00 - 09:00', 'Robertino Bottaniz', 40],
        // 9 HS
        ['', 'Miércoles 2', '09:00 - 10:00', 'agus elz', 40],
        // 10 HS
        ['*Cuando la postura no mejora: el papel de las vísceras en el dolor y la disfunción* Evaluación y tratamiento integrando Osteopatía Visceral y Posturoterapia.', 'Miércoles 2', '10:00 - 11:00', 'Angelina Tibaldo', 40],
        // 11 HS
        ['', 'Miércoles 2', '11:00 - 12:00', 'rami pioli', 40],
        // 12 HS
        ['Posicionamiento y estrategias de autorregulación en recien nacidos', 'Miércoles 2', '12:00 - 13:00', 'Sofi Mandole, Iara Pereyra', 40],
        // 13 HS (múltiples ponentes)
        ['', 'Miércoles 2', '13:00 - 14:00', 'Ana Cristina Piacenza, Meli Yobe, Martin Larramendi', 40],
        // 14 HS
        ['"Descubriendo el suelo pelvico"', 'Miércoles 2', '14:00 - 15:00', 'Anto Baldesari', 40],
        // 15 HS (taller de 15 a 17)
        ['Taller práctico (15:00 - 17:00)', 'Miércoles 2', '15:00 - 17:00', 'Carlos fumero', 40],
        // 16 HS (ya cubierto por el taller, pero se deja como espacio libre)
        ['', 'Miércoles 2', '16:00 - 17:00', 'fede uca', 40],
        // 17 HS
        ['Quiropraxia: detección y análisis de la subluxacion vertebral', 'Miércoles 2', '17:00 - 18:00', 'Ignacio Guastavino', 40],
        // 18 HS
        ['', 'Miércoles 2', '18:00 - 19:00', 'brenda lorenz', 40],
        // 19 HS
        ['Pilates aplicado al deporte', 'Miércoles 2', '19:00 - 20:00', 'Vanesa Dupertuis', 40],

        // ===== JUEVES 3 =====
        // 8 HS
        ['Mecanismos neurobiologicos del movimiento sobre la cognición: el cerebelo como órgano de predicción y modelos internos', 'Jueves 3', '08:00 - 09:00', 'Lucas Orlandi', 40],
        // 9 HS (vacío)
        ['', 'Jueves 3', '09:00 - 10:00', '', 40],
        // 10 HS
        ['Caso clínico y taller práctico de rehabilitación pulmonar', 'Jueves 3', '10:00 - 11:00', 'Male y Mica Carrizo, Ulises Magallanes', 40],
        // 11 HS
        ['', 'Jueves 3', '11:00 - 12:00', 'Pablo Seguro', 40],
        // 12 HS
        ['', 'Jueves 3', '12:00 - 13:00', 'Gri Sosa', 40],
        // 13 HS
        ['El alcance: una orquesta de articulaciones, músculos y sistema nervioso', 'Jueves 3', '13:00 - 14:00', 'Carlos Bonino + Cami Gasser', 40]
      ];

      const stmt = db.prepare("INSERT INTO charlas (titulo, dia, hora, ponente, cupo_maximo) VALUES (?, ?, ?, ?, ?)");
      nuevasCharlas.forEach(ch => stmt.run(ch));
      stmt.finalize(() => {
        console.log('✅ Cronograma actualizado con los nuevos datos (Miércoles 2 y Jueves 3)');
      });
    }
  });
});

// ========== ENDPOINTS PÚBLICOS (NO requieren autenticación) ==========
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

// ========== PÁGINA DE VERIFICACIÓN QR (pública) ==========
app.get('/verificar/:codigo', (req, res) => {
  // Aquí va tu código de verificación (el que ya tenías)
  // Lo dejo fuera por brevedad, pero debe estar presente
});

// ========== MIDDLEWARE DE AUTENTICACIÓN (solo para admin) ==========
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

// ========== ENDPOINTS PROTEGIDOS (requieren autenticación) ==========
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, mensaje: 'Login exitoso' });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

app.get('/api/admin/inscripciones', verificarToken, (req, res) => {
  // ... (código de admin)
});

app.put('/api/admin/inscripciones/:id/escaneado', verificarToken, (req, res) => {
  // ... (código de admin)
});

app.delete('/api/admin/inscripciones/:id', verificarToken, (req, res) => {
  // ... (código de admin)
});

app.get('/api/admin/exportar-excel', verificarToken, (req, res) => {
  // ... (código de admin)
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