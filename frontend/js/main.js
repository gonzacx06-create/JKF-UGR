const API_URL = 'https://jornadas-ugr.onrender.com/api';

async function cargarCharlas() {
  try {
    const resp = await fetch(`${API_URL}/charlas`);
    const charlas = await resp.json();
    const container = document.getElementById('charlas-container');
    const select = document.getElementById('charla');

    container.innerHTML = '';
    select.innerHTML = '<option value="">-- Elige --</option>';

    charlas.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'charla-card';
      const disponibles = ch.disponibles || 0;
      const estado = disponibles > 0 ? `Cupos disponibles: ${disponibles}` : '¡CUPO LLENO!';
      const claseCupo = disponibles > 0 ? 'cupo' : 'cupo lleno';
      card.innerHTML = `
        <h3>${ch.titulo}</h3>
        <p><strong>Día:</strong> ${ch.dia}</p>
        <p><strong>Hora:</strong> ${ch.hora}</p>
        <p><strong>Ponente:</strong> ${ch.ponente}</p>
        <p class="${claseCupo}">${estado}</p>
      `;
      container.appendChild(card);

      if (disponibles > 0) {
        const option = document.createElement('option');
        option.value = ch.id;
        option.textContent = `${ch.titulo} (${disponibles} cupos)`;
        select.appendChild(option);
      }
    });

    select.addEventListener('change', () => {
      const id = parseInt(select.value);
      if (id) {
        const ch = charlas.find(c => c.id === id);
        document.getElementById('cupo-disponible').textContent = ch ? `Disponibles: ${ch.disponibles}` : '';
      } else {
        document.getElementById('cupo-disponible').textContent = '';
      }
    });

  } catch (error) {
    console.error('Error cargando charlas:', error);
    document.getElementById('charlas-container').innerHTML = '<p style="color:#d52333;">Error al cargar el cronograma. Intenta de nuevo más tarde.</p>';
  }
}

document.getElementById('form-inscripcion').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = document.getElementById('nombre').value.trim();
  const email = document.getElementById('email').value.trim();
  const charla_id = parseInt(document.getElementById('charla').value);

  if (!nombre || !email || !charla_id) {
    alert('Completa todos los campos');
    return;
  }

  try {
    const resp = await fetch(`${API_URL}/inscribir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, charla_id })
    });

    const data = await resp.json();

    if (resp.ok) {
      document.getElementById('mensaje-inscripcion').innerHTML = `<span style="color:#16a34a;">✅ ${data.mensaje}</span>`;
      const qrContainer = document.getElementById('qr-container');
      qrContainer.style.display = 'block';
      const qrImg = document.getElementById('qr-imagen');
      qrImg.src = data.qr;
      document.getElementById('qr-enlace').href = data.url;
      document.getElementById('qr-enlace').textContent = data.url;

      // Botón descargar QR
      const descargarBtn = document.getElementById('descargar-qr');
      descargarBtn.onclick = function() {
        const link = document.createElement('a');
        link.download = `qr-${data.codigo}.png`;
        link.href = data.qr;
        link.click();
      };

      document.getElementById('form-inscripcion').reset();
      cargarCharlas();
    } else {
      document.getElementById('mensaje-inscripcion').innerHTML = `<span style="color:#d52333;">❌ ${data.error || 'Error en la inscripción'}</span>`;
    }
  } catch (error) {
    document.getElementById('mensaje-inscripcion').innerHTML = `<span style="color:#d52333;">❌ Error de conexión con el servidor</span>`;
  }
});

cargarCharlas();