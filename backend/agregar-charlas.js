const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./jornadas.db');

// Lista de todas las charlas (con los mismos IDs que usamos en el HTML)
const charlas = [
  // Miércoles 2
  { id: 1, titulo: 'Recepción y acreditación', dia: 'Miércoles 2', hora: '08:30 - 10:00', ponente: 'Secretaría Técnica', cupo_maximo: 100 },
  { id: 2, titulo: 'Conferencia Inaugural: Actualización en Dolor Crónico', dia: 'Miércoles 2', hora: '10:00 - 11:30', ponente: 'Dr. Luis Miguel Torres', cupo_maximo: 80 },
  { id: 3, titulo: 'Mesa Redonda: Abordaje Multidisciplinar de la Tendinopatía', dia: 'Miércoles 2', hora: '11:30 - 13:00', ponente: 'Dra. María López / Dr. Javier Pérez', cupo_maximo: 80 },
  { id: 4, titulo: 'Pausa - Almuerzo', dia: 'Miércoles 2', hora: '13:00 - 14:30', ponente: 'Organización', cupo_maximo: 120 },
  { id: 5, titulo: 'Taller Práctico 1: Ecografía para Fisioterapeutas', dia: 'Miércoles 2', hora: '14:30 - 16:00', ponente: 'Dr. Carlos García (SERAM)', cupo_maximo: 40 },
  { id: 6, titulo: 'Comunicaciones Orales Libres', dia: 'Miércoles 2', hora: '16:00 - 17:30', ponente: 'Varios autores', cupo_maximo: 60 },
  { id: 7, titulo: 'Conferencia: Nuevas tendencias en neurorrehabilitación', dia: 'Miércoles 2', hora: '17:30 - 19:00', ponente: 'Dra. Elena Muñoz (UGR)', cupo_maximo: 80 },
  { id: 8, titulo: 'Cóctel de bienvenida y networking', dia: 'Miércoles 2', hora: '19:00 - 20:30', ponente: 'Comité Organizador', cupo_maximo: 100 },
  // Jueves 3
  { id: 9, titulo: 'Recepción y entrega de materiales', dia: 'Jueves 3', hora: '08:30 - 10:00', ponente: 'Secretaría Técnica', cupo_maximo: 100 },
  { id: 10, titulo: 'Conferencia: Rehabilitación en el Deportista de Élite', dia: 'Jueves 3', hora: '10:00 - 11:30', ponente: 'Dr. Pedro Martínez (Real Madrid)', cupo_maximo: 80 },
  { id: 11, titulo: 'Mesa Redonda: Infiltraciones guiadas por ecografía', dia: 'Jueves 3', hora: '11:30 - 13:00', ponente: 'Dra. Ana Belén Rodríguez', cupo_maximo: 80 },
  { id: 12, titulo: 'Pausa - Almuerzo (Jueves)', dia: 'Jueves 3', hora: '13:00 - 14:30', ponente: 'Organización', cupo_maximo: 120 },
  { id: 13, titulo: 'Taller Práctico 2: Punción Seca y Neuromodulación', dia: 'Jueves 3', hora: '14:30 - 16:00', ponente: 'Dr. Fernando Ramos', cupo_maximo: 40 },
  { id: 14, titulo: 'Conferencia: Innovación en fisioterapia respiratoria', dia: 'Jueves 3', hora: '16:00 - 17:30', ponente: 'Dra. Laura Fernández', cupo_maximo: 80 },
  { id: 15, titulo: 'Conferencia de Clausura', dia: 'Jueves 3', hora: '17:30 - 19:00', ponente: 'Dr. Ricardo Gómez (UGR)', cupo_maximo: 80 },
  { id: 16, titulo: 'Entrega de premios y cierre oficial', dia: 'Jueves 3', hora: '19:00 - 20:30', ponente: 'Comité Organizador', cupo_maximo: 100 }
];

db.serialize(() => {
  // Primero, eliminar todas las charlas existentes (opcional, para limpiar)
  // Si quieres conservar las charlas anteriores, comenta la siguiente línea
  // db.run("DELETE FROM charlas");

  // Insertar o reemplazar (usamos INSERT OR REPLACE para que si ya existe, se actualice)
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO charlas (id, titulo, dia, hora, ponente, cupo_maximo, inscritos)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);

  charlas.forEach(ch => {
    stmt.run(ch.id, ch.titulo, ch.dia, ch.hora, ch.ponente, ch.cupo_maximo, (err) => {
      if (err) console.error(`Error al insertar ${ch.titulo}:`, err.message);
      else console.log(`✅ Insertada: ${ch.titulo} (ID ${ch.id})`);
    });
  });

  stmt.finalize(() => {
    console.log('✅ Todas las charlas han sido agregadas/actualizadas.');
    db.close();
  });
});