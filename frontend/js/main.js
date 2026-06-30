(function() {
  'use strict';

  // ============================================
  // 1. MENÚ LATERAL Y NAVEGACIÓN
  // ============================================
  function initApp() {
    console.log('🔥 Inicializando Jornadas UGR...');

    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const closeSidebar = document.getElementById('closeSidebar');

    if (!menuBtn || !sidebar || !overlay || !closeSidebar) {
      console.error('❌ Error: Elementos del menú no encontrados.');
      return;
    }

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

    // ============================================
    // 2. FUNCIÓN PARA CAMBIAR DE VISTA (CORREGIDA)
    // ============================================
    function showView(viewId) {
      // Obtener los elementos directamente por ID (sin depender de un objeto views)
      const viewMain = document.getElementById('view-main');
      const viewMis = document.getElementById('view-mis-inscripciones');

      // Ocultar todas
      if (viewMain) viewMain.classList.remove('active');
      if (viewMis) viewMis.classList.remove('active');

      // Mostrar la seleccionada
      if (viewId === 'main' && viewMain) {
        viewMain.classList.add('active');
        console.log('✅ Vista activada: main');
      } else if (viewId === 'mis-inscripciones' && viewMis) {
        viewMis.classList.add('active');
        console.log('✅ Vista activada: mis-inscripciones');
      } else {
        console.error(`❌ Vista no encontrada: ${viewId}`);
        return;
      }

      closeSidebarFunc();

      // Si es la vista de inscripciones, buscar automáticamente si hay email guardado
      if (viewId === 'mis-inscripciones') {
        const emailBuscador = document.getElementById('email-buscador');
        const savedEmail = localStorage.getItem('miEmail');
        if (savedEmail && emailBuscador) {
          emailBuscador.value = savedEmail;
          buscarInscripciones(savedEmail);
        } else if (!emailBuscador) {
          console.error('❌ Elemento "email-buscador" no encontrado.');
        }
      }
    }

    // ============================================
    // 3. FUNCIÓN PARA BUSCAR INSCRIPCIONES (sin cambios)
    // ============================================
    function buscarInscripciones(email) {
      const contenedor = document.getElementById('lista-mis-inscripciones');
      if (!contenedor) {
        console.error('❌ Contenedor "lista-mis-inscripciones" no encontrado.');
        return;
      }
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

          localStorage.setItem('miEmail', email);

          contenedor.innerHTML = '';
          data.forEach(ins => {
            const card = document.createElement('div');
            card.className = 'charla-card';
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

    // ============================================
    // 4. ASIGNAR EVENTOS DEL MENÚ (SOLUCIÓN DEFINITIVA)
    // ============================================
    // Asignar directamente al enlace por ID
    const linkMisInscripciones = document.getElementById('linkMisInscripciones');
    if (linkMisInscripciones) {
      // Clonar y reemplazar para eliminar eventos anteriores
      const newLink = linkMisInscripciones.cloneNode(true);
      linkMisInscripciones.parentNode.replaceChild(newLink, linkMisInscripciones);
      
      // Asignar evento al nuevo enlace
      newLink.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔗 Clic en "Mis inscripciones" (por ID)');
        showView('mis-inscripciones');
      });
      console.log('✅ Evento asignado a linkMisInscripciones por ID');
    } else {
      console.error('❌ linkMisInscripciones no encontrado en el DOM');
    }

    // También asignar a todos los enlaces del sidebar (fallback)
    document.querySelectorAll('.sidebar nav a').forEach(link => {
      // Evitar duplicar el evento en el enlace ya asignado
      if (link.id === 'linkMisInscripciones') return;
      link.addEventListener('click', function(e) {
        const view = this.dataset.view;
        const scrollTarget = this.dataset.scroll;
        if (view) {
          e.preventDefault();
          console.log(`🔗 Clic en enlace (data-view=${view})`);
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
    // 5. INSCRIBIR DESDE EL CRONOGRAMA (sin cambios)
    // ============================================
    function inscribirDesdeCronograma(charlaId) {
      const select = document.getElementById('charla-select');
      if (select) {
        select.value = charlaId;
        select.dispatchEvent(new Event('change'));
        const form = document.getElementById('form-inscripcion');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        console.warn('⚠️ Select de charlas no encontrado.');
      }
    }

    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.btn-inscribir-cronograma');
      if (btn) {
        e.preventDefault();
        const id = parseInt(btn.dataset.id);
        if (!isNaN(id)) {
          inscribirDesdeCronograma(id);
        }
      }
    });

    // ============================================
    // 6. GESTIÓN DE CHARLAS (API)
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
          console.log('✅ Charlas cargadas correctamente.');
        })
        .catch(err => console.error('❌ Error cargando charlas:', err));
    }

    function populateSelect() {
      if (!selectCharla) return;
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
      if (!selectCharla || !cupoInfo) return;
      const id = parseInt(selectCharla.value);
      const ch = charlas.find(c => c.id === id);
      if (ch) {
        cupoInfo.innerHTML = `Cupos disponibles: <strong>${ch.disponibles}</strong>`;
      } else {
        cupoInfo.innerHTML = 'Cupos disponibles: <strong>—</strong>';
      }
    }

    // ============================================
    // 7. FORMULARIO DE INSCRIPCIÓN
    // ============================================
    const form = document.getElementById('form-inscripcion');
    const mensajeDiv = document.getElementById('mensaje-inscripcion');
    const qrContainer = document.getElementById('qr-container');
    const qrImagen = document.getElementById('qr-imagen');
    const qrEnlace = document.getElementById('qr-enlace');
    const descargarBtn = document.getElementById('descargar-qr');

    let ultimoQrDataUrl = '';

    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();

        const nombre = document.getElementById('nombre').value.trim();
        const email = document.getElementById('email').value.trim();
        const charlaId = parseInt(selectCharla ? selectCharla.value : '');

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

          localStorage.setItem('miEmail', email);

          const ch = charlas.find(c => c.id === charlaId);
          if (ch) {
            ch.disponibles = Math.max(0, ch.disponibles - 1);
            populateSelect();
          }

          document.getElementById('nombre').value = '';
          document.getElementById('email').value = '';
          if (selectCharla) selectCharla.value = '';
          if (cupoInfo) cupoInfo.innerHTML = 'Cupos disponibles: <strong>—</strong>';

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
    }

    // ============================================
    // 8. DESCARGAR QR
    // ============================================
    if (descargarBtn) {
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
    }

    // ============================================
    // 9. BOTÓN "BUSCAR" EN MIS INSCRIPCIONES
    // ============================================
    const emailBuscador = document.getElementById('email-buscador');
    const btnBuscar = document.getElementById('btn-buscar-inscripciones');

    if (btnBuscar) {
      btnBuscar.addEventListener('click', function() {
        if (!emailBuscador) return;
        const email = emailBuscador.value.trim();
        if (!email) {
          alert('Por favor, ingresa tu correo electrónico.');
          return;
        }
        buscarInscripciones(email);
      });
    }

    if (emailBuscador) {
      emailBuscador.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          if (btnBuscar) btnBuscar.click();
        }
      });
    }

    // ============================================
    // 10. INICIALIZACIÓN
    // ============================================
    setTimeout(cargarCharlas, 500);
    console.log('🚀 Jornadas UGR 2026 - Todo listo');
  }

  // Esperar a que el DOM esté completamente cargado
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();