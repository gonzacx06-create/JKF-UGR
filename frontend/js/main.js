(function() {
  'use strict';

  // ============================================
  // 1. MENÚ LATERAL Y NAVEGACIÓN ENTRE VISTAS
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

  // Navegación por vistas
  const views = {
    main: document.getElementById('view-main'),
    inscripciones: document.getElementById('view-inscripciones')
  };

  function showView(viewId) {
    Object.keys(views).forEach(key => {
      views[key].classList.remove('active');
    });
    if (views[viewId]) {
      views[viewId].classList.add('active');
    }
    closeSidebarFunc();
    // Si es la vista de inscripciones, cargar las charlas si no están cargadas
    if (viewId === 'inscripciones') {
      cargarCharlas();
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

  // Enlace específico "Inscribirse" (ya está en el menú)
  // ============================================

  // ============================================
  // 2. OBTENER CHARLAS DESDE LA API
  // ============================================
  const container = document.getElementById('charlas-container');
  const selectCharla = document.getElementById('charla-select');
  const cupoInfo = document.getElementById('cupo-disponible');

  let charlas = [];

  function cargarCharlas() {
    // Evitar recargar si ya están cargadas
    if (charlas.length > 0 && container.children.length > 0) return;

    fetch('/api/charlas')
      .then(res => {
        if (!res.ok) throw new Error('Error al obtener charlas');
        return res.json();
      })
      .then(data => {
        charlas = data;
        renderCharlas();
        populateSelect();
      })
      .catch(err => {
        console.error(err);
        container.innerHTML = `<p style="color:var(--accent4);">⚠️ No se pudieron cargar las charlas. Intenta de nuevo.</p>`;
      });
  }

  function renderCharlas() {
    container.innerHTML = '';
    charlas.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'charla-card';
      card.innerHTML = `
        <div class="ch-titulo">${ch.titulo}</div>
        <div class="ch-meta">
          <span>📅 ${ch.dia}</span>
          <span>⏰ ${ch.hora}</span>
        </div>
        <div class="ch-disertante">🎤 ${ch.ponente}</div>
        <div class="ch-cupos">Cupos disponibles: ${ch.disponibles} de ${ch.cupo_maximo}</div>
      `;
      container.appendChild(card);
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
    // Actualizar cupo al seleccionar
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
  // 3. PROCESAR INSCRIPCIÓN (POST a la API)
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
      mensajeDiv.innerHTML = `<div class="mensaje-exito" style="border-left-color: var(--accent4);"><strong>⚠️</strong> Completa todos los campos obligatorios.</div>`;
      return;
    }

    // Deshabilitar botón para evitar envíos múltiples
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
      // Éxito
      mensajeDiv.innerHTML = `<div class="mensaje-exito"><strong>✅ ¡Inscripción confirmada!</strong> Revisa tu código QR abajo. Te esperamos en la charla.</div>`;

      // Mostrar QR
      qrImagen.src = data.qr;  // dataURL
      qrImagen.alt = `QR para ${nombre}`;
      qrEnlace.href = data.url;
      qrEnlace.textContent = `🔗 Enlace de verificación (código: ${data.codigo})`;
      ultimoQrDataUrl = data.qr;

      qrContainer.style.display = 'block';

      // Actualizar cupos localmente (restando 1 a la charla)
      const ch = charlas.find(c => c.id === charlaId);
      if (ch) {
        ch.disponibles = Math.max(0, ch.disponibles - 1);
        renderCharlas();
        populateSelect(); // actualiza el select
      }

      // Desplazar hacia el QR
      setTimeout(() => {
        qrContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);

      // Resetear formulario
      form.reset();
      selectCharla.value = '';
      cupoInfo.innerHTML = 'Cupos disponibles: <strong>—</strong>';
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
  // 4. DESCARGAR QR
  // ============================================
  descargarBtn.addEventListener('click', function() {
    if (!ultimoQrDataUrl) {
      alert('Primero debes inscribirte para generar un QR.');
      return;
    }
    // Si es dataURL (empieza con data:image), la convertimos a blob
    if (ultimoQrDataUrl.startsWith('data:image')) {
      const link = document.createElement('a');
      link.href = ultimoQrDataUrl;
      link.download = `qr-inscripcion-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Si es URL, usar fetch
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
        .catch(() => {
          window.open(ultimoQrDataUrl, '_blank');
        });
    }
  });

  // ============================================
  // 5. INICIALIZAR: Cargar charlas solo cuando se muestre la vista
  // ============================================
  // Al cargar la página, si la vista de inscripciones está activa (no lo está por defecto)
  // pero el usuario puede hacer clic en el menú, entonces showView llamará a cargarCharlas.

  // Cargar charlas en segundo plano para que estén listas
  // (no bloquea la vista principal)
  setTimeout(cargarCharlas, 1000);

  console.log('🚀 Jornadas UGR 2026 con API integrada');
})();