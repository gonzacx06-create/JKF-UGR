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
      renderizarMisInscripciones();
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
  function inscribirDesdeCronograma(charlaId, titulo, dia, hora, ponente) {
    // Seleccionar la charla en el formulario
    const select = document.getElementById('charla-select');
    if (select) {
      select.value = charlaId;
      select.dispatchEvent(new Event('change'));
      // Desplazar al formulario
      const form = document.getElementById('form-inscripcion');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-inscribir-cronograma');
    if (btn) {
      e.preventDefault();
      const id = parseInt(btn.dataset.id);
      const titulo = btn.dataset.titulo;
      const dia = btn.dataset.dia;
      const hora = btn.dataset.hora;
      const ponente = btn.dataset.ponente;
      inscribirDesdeCronograma(id, titulo, dia, hora, ponente);
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
  // 4. INSCRIPCIÓN Y GUARDADO LOCAL
  // ============================================
  const form = document.getElementById('form-inscripcion');
  const mensajeDiv = document.getElementById('mensaje-inscripcion');
  const qrContainer = document.getElementById('qr-container');
  const qrImagen = document.getElementById('qr-imagen');
  const qrEnlace = document.getElementById('qr-enlace');
  const descargarBtn = document.getElementById('descargar-qr');

  let ultimoQrDataUrl = '';

  function guardarInscripcionLocal(charlaId, titulo, dia, hora, ponente, qrDataUrl, urlVerificacion, codigo) {
    const inscripciones = JSON.parse(localStorage.getItem('misInscripciones') || '[]');
    inscripciones.push({
      charlaId,
      titulo,
      dia,
      hora,
      ponente,
      qr: qrDataUrl,
      url: urlVerificacion,
      codigo,
      fecha: new Date().toISOString()
    });
    localStorage.setItem('misInscripciones', JSON.stringify(inscripciones));
  }

  function renderizarMisInscripciones() {
    const contenedor = document.getElementById('lista-mis-inscripciones');
    const inscripciones = JSON.parse(localStorage.getItem('misInscripciones') || '[]');

    if (inscripciones.length === 0) {
      contenedor.innerHTML = `
        <p style="color: var(--text-dim); font-size: 14px; grid-column: 1/-1; text-align: center; padding: 20px 0;">
          No tienes inscripciones aún. Selecciona una charla desde el <strong>cronograma</strong> o desde el formulario.
        </p>
      `;
      return;
    }

    contenedor.innerHTML = '';
    inscripciones.forEach((ins, index) => {
      const card = document.createElement('div');
      card.className = 'charla-card';
      card.innerHTML = `
        <div class="ch-titulo">${ins.titulo}</div>
        <div class="ch-meta">
          <span>📅 ${ins.dia}</span>
          <span>⏰ ${ins.hora}</span>
        </div>
        <div class="ch-disertante">🎤 ${ins.ponente}</div>
        <div style="margin-top: 12px; text-align: center;">
          <img src="${ins.qr}" alt="QR" style="max-width: 120px; border-radius: 6px; background: white; padding: 6px;" />
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: var(--text-dimmer); display: flex; justify-content: space-between; align-items: center;">
          <span>Código: ${ins.codigo}</span>
          <button class="btn-descargar-qr-local" data-index="${index}" style="background: transparent; border: none; color: var(--azul-ugr-claro); cursor: pointer; text-decoration: underline; font-size: 12px;">Descargar QR</button>
        </div>
      `;
      contenedor.appendChild(card);
    });

    document.querySelectorAll('.btn-descargar-qr-local').forEach(btn => {
      btn.addEventListener('click', function(e) {
        const idx = parseInt(this.dataset.index);
        const inscripciones = JSON.parse(localStorage.getItem('misInscripciones') || '[]');
        const ins = inscripciones[idx];
        if (ins && ins.qr) {
          const link = document.createElement('a');
          link.href = ins.qr;
          link.download = `qr-${ins.titulo.replace(/\s+/g, '-')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      });
    });
  }

  // ============================================
  // 5. ENVÍO DEL FORMULARIO
  // ============================================
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

      const ch = charlas.find(c => c.id === charlaId);
      if (ch) {
        guardarInscripcionLocal(charlaId, ch.titulo, ch.dia, ch.hora, ch.ponente, data.qr, data.url, data.codigo);
        ch.disponibles = Math.max(0, ch.disponibles - 1);
        populateSelect();
      }

      // Resetear campos (excepto nombre/email)
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
  // 6. DESCARGAR QR (desde el contenedor actual)
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
  // 7. INICIALIZACIÓN
  // ============================================
  setTimeout(cargarCharlas, 500);
  renderizarMisInscripciones();

  console.log('🚀 Jornadas UGR 2026 - Formulario en página principal y Mis inscripciones en vista separada');
})();