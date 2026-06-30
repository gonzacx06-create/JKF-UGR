(function() {
  'use strict';

  // ============================================
  // 1. MENÚ LATERAL Y NAVEGACIÓN
  // ============================================
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const closeSidebar = document.getElementById('closeSidebar');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
  function closeSidebarFunc() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }
  menuBtn.addEventListener('click', openSidebar);
  closeSidebar.addEventListener('click', closeSidebarFunc);
  overlay.addEventListener('click', closeSidebarFunc);

  const views = {
    main: document.getElementById('view-main'),
    misInscripciones: document.getElementById('view-mis-inscripciones')
  };

  function showView(viewId) {
    Object.keys(views).forEach(key => {
      views[key].classList.remove('active');
    });
    if (views[viewId]) {
      views[viewId].classList.add('active');
    }
    closeSidebarFunc();
    if (viewId === 'mis-inscripciones') {
      // Al abrir la vista, si hay email guardado, buscar automáticamente
      const savedEmail = localStorage.getItem('miEmail');
      if (savedEmail) {
        document.getElementById('email-buscador').value = savedEmail;
        buscarInscripciones(savedEmail);
      }
    }
  }

  document.querySelectorAll('.sidebar nav a').forEach(link => {
    link.addEventListener('click', function(e) {
      const view = this.dataset.view;
      const scrollTarget = this.dataset.scroll;
      if (view) {
        showView(view);
        if (view === 'main' && scrollTarget) {
          setTimeout(() => {
            const el = document.getElementById(scrollTarget);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 200);
        }
      }
    });
  });

  // ============================================
  // 2. INSCRIBIR DESDE EL CRONOGRAMA
  // ============================================
  function inscribirDesdeCronograma(charlaId) {
    const select = document.getElementById('charla-select');
    if (select) {
      select.value = charlaId;
      select.dispatchEvent(new Event('change'));
      const form = document.getElementById('form-inscripcion');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-inscribir-cronograma');
    if (btn) {
      e.preventDefault();
      const id = parseInt(btn.dataset.id);
      inscribirDesdeCronograma(id);
    }
  });

  // ============================================
  // 3. GESTIÓN DE CHARLAS (API)
  // ============================================
  const selectCharla = document.getElementById('charla-select');
  const cupoInfo = document.getElementById('cupo-disponible');
  let charlas = [];

  function cargarCharlas() {
    if (charlas.length > 0) return;
    fetch('/api/charlas')
      .then(res => {
        if (!res.ok) throw new Error('Error al obtener charlas');
        return res.json();
      })
      .then(data => {
        charlas = data;
        populateSelect();
      })
      .catch(err => {
        console.error('❌ Error cargando charlas:', err);
      });
  }

  function populateSelect() {
    selectCharla.innerHTML = '<option value="">— Elige una charla —</option>';
    charlas.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = `${ch.titulo} (${ch.dia} ${ch.hora}) - Cupos: ${ch.disponibles}`;
      selectCharla.appendChild(opt);
    });
    selectCharla.addEventListener('change', actualizarCupo);
  }

  function actualizarCupo() {
    const id = parseInt(selectCharla.value);
    const ch = charlas.find(c => c.id === id);
    if (ch) {
      cupoInfo.innerHTML = `Cupos disponibles: <strong>${ch.disponibles}</strong>`;
    } else {
      cupoInfo.innerHTML = 'Cupos disponibles: <strong>—</strong>';
    }
  }

  // ============================================
  // 4. INSCRIPCIÓN (formulario)
  // ============================================
  const form = document.getElementById('form-inscripcion');
  const mensajeDiv = document.getElementById('mensaje-inscripcion');
  const qrContainer = document.getElementById('qr-container');
  const qrImagen = document.getElementById('qr-imagen');
  const qrEnlace = document.getElementById('qr-enlace');
  const descargarBtn = document.getElementById('descargar-qr');

  let ultimoQrDataUrl = '';

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    const nombre = document.getElementById('nombre').value.trim();
    const email = document.getElementById('email').value.trim();
    const charlaId = parseInt(selectCharla.value);

    if (!nombre || !email || !charlaId) {
      mensajeDiv.innerHTML = `<div class="mensaje-exito" style="border-left-color: var(--accent4);"><strong>⚠️</strong> Completa todos los campos.</div>`;
      return;
    }

    const btn = form.querySelector('.btn-primary');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    fetch('/api/inscribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, charla_id: charlaId })
    })
    .then(res => {
      if (!res.ok) {
        return res.json().then(errData => {
          throw new Error(errData.error || 'Error en la inscripción');
        });
      }
      return res.json();
    })
    .then(data => {
      mensajeDiv.innerHTML = `<div class="mensaje-exito"><strong>✅ ¡Inscripción confirmada!</strong> Se agregó a "Mis inscripciones".</div>`;

      qrImagen.src = data.qr;
      qrImagen.alt = `QR para ${nombre}`;
      qrEnlace.href = data.url;
      qrEnlace.textContent = `🔗 Enlace de verificación (código: ${data.codigo})`;
      ultimoQrDataUrl = data.qr;
      qrContainer.style.display = 'block';

      // Guardar email para futuras consultas en "Mis inscripciones"
      localStorage.setItem('miEmail', email);

      // Actualizar cupos localmente
      const ch = charlas.find(c => c.id === charlaId);
      if (ch) {
        ch.disponibles = Math.max(0, ch.disponibles - 1);
        populateSelect();
      }

      // Resetear campos
      document.getElementById('nombre').value = '';
      document.getElementById('email').value = '';
      selectCharla.value = '';
      cupoInfo.innerHTML = 'Cupos disponibles: <strong>—</strong>';

      setTimeout(() => {
        qrContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    })
    .catch(err => {
      mensajeDiv.innerHTML = `<div class="mensaje-exito" style="border-left-color: var(--accent4);"><strong>⚠️</strong> ${err.message}</div>`;
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Inscribirme';
    });
  });

  // ============================================
  // 5. DESCARGAR QR (desde el contenedor actual)
  // ============================================
  descargarBtn.addEventListener('click', function() {
    if (!ultimoQrDataUrl) {
      alert('Primero inscríbete para generar un QR.');
      return;
    }
    if (ultimoQrDataUrl.startsWith('data:image')) {
      const link = document.createElement('a');
      link.href = ultimoQrDataUrl;
      link.download = `qr-inscripcion-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      fetch(ultimoQrDataUrl)
        .then(res => res.blob())
        .then(blob => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `qr-inscripcion-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        })
        .catch(() => window.open(ultimoQrDataUrl, '_blank'));
    }
  });

  // ============================================
  // 6. MIS INSCRIPCIONES (desde el servidor por email)
  // ============================================
  const emailBuscador = document.getElementById('email-buscador');
  const btnBuscar = document.getElementById('btn-buscar-inscripciones');

  function buscarInscripciones(email) {
    const contenedor = document.getElementById('lista-mis-inscripciones');
    contenedor.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 20px;">Cargando...</p>';

    fetch(`/api/mis-inscripciones?email=${encodeURIComponent(email)}`)
      .then(res => {
        if (!res.ok) throw new Error('Error al obtener inscripciones');
        return res.json();
      })
      .then(data => {
        if (data.length === 0) {
          contenedor.innerHTML = `
            <p style="color: var(--text-dim); font-size: 14px; grid-column: 1/-1; text-align: center; padding: 20px 0;">
              No tienes inscripciones con este email. Inscríbete a una charla desde el cronograma.
            </p>
          `;
          return;
        }

        // Guardar email para futuras visitas
        localStorage.setItem('miEmail', email);

        contenedor.innerHTML = '';
        data.forEach(ins => {
          const card = document.createElement('div');
          card.className = 'charla-card';
          // Usamos la URL base actual (localhost o producción) para el QR
          const baseUrl = window.location.origin;
          const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${baseUrl}/verificar/${ins.codigo}`)}`;

          card.innerHTML = `
            <div class="ch-titulo">${ins.titulo}</div>
            <div class="ch-meta">
              <span>📅 ${ins.dia}</span>
              <span>⏰ ${ins.hora}</span>
            </div>
            <div class="ch-disertante">🎤 ${ins.ponente}</div>
            <div style="margin-top: 12px; text-align: center;">
              <img src="${qrImageUrl}" alt="QR" style="max-width: 120px; border-radius: 6px; background: white; padding: 6px;" />
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: var(--text-dimmer); display: flex; justify-content: space-between; align-items: center;">
              <span>Código: ${ins.codigo}</span>
              <button class="btn-descargar-qr-local" data-codigo="${ins.codigo}" style="background: transparent; border: none; color: var(--azul-ugr-claro); cursor: pointer; text-decoration: underline; font-size: 12px;">Descargar QR</button>
            </div>
          `;
          contenedor.appendChild(card);
        });

        // Eventos de descarga
        document.querySelectorAll('.btn-descargar-qr-local').forEach(btn => {
          btn.addEventListener('click', function(e) {
            const codigo = this.dataset.codigo;
            const baseUrl = window.location.origin;
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${baseUrl}/verificar/${codigo}`)}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `qr-${codigo}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          });
        });
      })
      .catch(err => {
        console.error('Error:', err);
        contenedor.innerHTML = `
          <p style="color: var(--accent4); text-align: center; padding: 20px;">
            ⚠️ Error al cargar las inscripciones. Intenta de nuevo.
          </p>
        `;
      });
  }

  // Evento del botón "Buscar"
  btnBuscar.addEventListener('click', function() {
    const email = emailBuscador.value.trim();
    if (!email) {
      alert('Por favor, ingresa tu correo electrónico.');
      return;
    }
    buscarInscripciones(email);
  });

  // Buscar al presionar Enter
  emailBuscador.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      btnBuscar.click();
    }
  });

  // ============================================
  // 7. INICIALIZACIÓN
  // ============================================
  setTimeout(cargarCharlas, 500);

  console.log('🚀 Jornadas UGR 2026 - Formulario en página principal y Mis inscripciones vía servidor');
})();