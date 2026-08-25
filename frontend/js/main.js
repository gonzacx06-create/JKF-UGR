const API_URL = window.location.origin + '/api';
let adminToken = null;
let paginaAdmin = 1;
let paginaMisIns = 1;
let currentEmailConsulta = '';
let modalCharlaId = null;

// ========== TEMA OSCURO/CLARO ==========
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️';
    }
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        themeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
});

// ========== CONTADOR REGRESIVO ==========
function actualizarDigito(el, nuevoValor) {
    if (!el) return;
    if (el.textContent !== nuevoValor) {
        el.textContent = nuevoValor;
        el.classList.remove('tick');
        void el.offsetWidth;
        el.classList.add('tick');
    }
}
function actualizarContador() {
    const fechaEvento = Date.UTC(2026, 8, 2, 3, 0, 0);
    const ahora = new Date().getTime();
    const diferencia = fechaEvento - ahora;
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');
    if (diferencia <= 0) {
        if (daysEl) daysEl.textContent = '00';
        if (hoursEl) hoursEl.textContent = '00';
        if (minutesEl) minutesEl.textContent = '00';
        if (secondsEl) secondsEl.textContent = '00';
        return;
    }
    const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
    actualizarDigito(daysEl, String(dias).padStart(2, '0'));
    actualizarDigito(hoursEl, String(horas).padStart(2, '0'));
    actualizarDigito(minutesEl, String(minutos).padStart(2, '0'));
    actualizarDigito(secondsEl, String(segundos).padStart(2, '0'));
}
setInterval(actualizarContador, 1000);
actualizarContador();

// ========== MENÚ HAMBURGUESA ==========
document.addEventListener('DOMContentLoaded', function() {
    const menuBtn = document.getElementById('menuBtn');
    const sideMenu = document.getElementById('sideMenu');
    let menuOpen = false;
    if (menuBtn && sideMenu) {
        menuBtn.addEventListener('click', function() {
            menuOpen = !menuOpen;
            sideMenu.classList.toggle('open');
        });
        document.querySelectorAll('#sideMenu a').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const section = this.dataset.section;
                cambiarSeccion(section);
                sideMenu.classList.remove('open');
                menuOpen = false;
            });
        });
    }
});

function cambiarSeccion(id) {
    document.querySelectorAll('.section').forEach(function(sec) {
        sec.classList.remove('active');
    });
    document.querySelectorAll('#sideMenu a').forEach(function(a) {
        a.classList.remove('active');
    });
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    const link = document.querySelector('#sideMenu a[data-section="' + id + '"]');
    if (link) link.classList.add('active');
    if (id === 'mis-inscripciones' && currentEmailConsulta) {
        cargarMisInscripciones(currentEmailConsulta, 1);
    }
    if (id === 'admin' && adminToken) {
        cargarAdminInscripciones(1);
    }
}
cambiarSeccion('inicio');

// ========== FUNCIONES PARA AVATAR ==========
function generarColor(nombre) {
    if (!nombre) return '#6ea8fe';
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) {
        hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colores = ['#ff8a5b', '#ff6b8b', '#f7b733', '#2fc3b8', '#9b7fe0', '#6ea8fe', '#f78166', '#56d4c8'];
    return colores[Math.abs(hash) % colores.length];
}
function obtenerIniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
        return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
}
function normalizarNombreParaFoto(nombre) {
    if (!nombre) return 'ponente';
    return nombre.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function generarAvatares(ponenteStr) {
    if (!ponenteStr) return '<div class="avatar-group"><div class="avatar-item"><span class="iniciales" style="background:#6ea8fe;">?</span></div></div>';
    const nombres = ponenteStr.split(',').map(s => s.trim());
    const muchos = nombres.length > 2 ? 'many' : '';
    let html = `<div class="avatar-group ${muchos}">`;
    nombres.forEach(nombre => {
        const iniciales = obtenerIniciales(nombre);
        const color = generarColor(nombre);
        const nombreFoto = normalizarNombreParaFoto(nombre);
        const fotoPath = `assets/ponentes/${nombreFoto}.png`;
        html += `<div class="avatar-item">
            <img src="${fotoPath}" alt="${nombre}" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'iniciales\\' style=\\'background:${color};\\'>${iniciales}</span>';" />
        </div>`;
    });
    html += '</div>';
    return html;
}

// ========== CARGAR CHARLAS (sin aula) ==========
async function cargarCharlas() {
    const spinner = document.getElementById('loading-spinner');
    const container = document.getElementById('cronograma-cards');
    const sanatorioContainer = document.getElementById('sanatorio-cards');
    const select = document.getElementById('charla');

    if (spinner) spinner.style.display = 'flex';
    if (container) container.innerHTML = '';
    if (sanatorioContainer) sanatorioContainer.innerHTML = '';

    try {
        const resp = await fetch(API_URL + '/charlas');
        if (!resp.ok) throw new Error('Error ' + resp.status + ': ' + resp.statusText);
        const charlas = await resp.json();

        // Separar normales y Sanatorio
        const normales = charlas.filter(ch => ch.dia !== 'Jueves 3 - Sanatorio');
        const sanatorio = charlas.filter(ch => ch.dia === 'Jueves 3 - Sanatorio');

        // --- Generar tarjetas normales (sin aula) ---
        const grupos = {};
        normales.forEach(ch => {
            if (!grupos[ch.dia]) grupos[ch.dia] = [];
            grupos[ch.dia].push(ch);
        });
        const ordenDias = ['Miércoles 2', 'Jueves 3'];
        let html = '';
        for (const dia of ordenDias) {
            if (!grupos[dia]) continue;
            const lista = grupos[dia];
            lista.sort((a, b) => a.hora.localeCompare(b.hora));
            html += `<div class="dia-titulo">🗓️ ${dia}</div>`;
            html += `<div class="carrusel">`;
            lista.forEach(ch => {
                const disponibles = ch.disponibles || 0;
                const inscriptos = ch.inscritos || 0;
                const total = ch.cupo_maximo || 40;
                const disabled = disponibles <= 0 ? 'disabled' : '';
                const tituloProf = 'Lic. en Kinesiología y Fisiatría';
                html += `
                    <div class="charla-card-horizontal" data-id="${ch.id}" data-dia="${ch.dia}" data-hora="${ch.hora}">
                        <div class="card-header">
                            ${generarAvatares(ch.ponente)}
                            <div class="ponente-info">
                                <div class="ponente-nombre">${ch.ponente || 'Ponente'}</div>
                                <div class="ponente-titulo">${tituloProf}</div>
                            </div>
                        </div>
                        <div class="charla-titulo">${ch.titulo || 'Título no especificado'}</div>
                        <div class="charla-detalle">
                            <span>📅 ${ch.dia}</span>
                            <span>🕒 ${ch.hora}</span>
                        </div>
                        <div class="cupos-disponibles">👥 ${inscriptos} / ${total} inscriptos</div>
                        <button type="button" class="btn-inscribir-tarjeta" data-id="${ch.id}" ${disabled}>
                            ${disponibles > 0 ? '🎯 Inscribirse' : 'Agotado'}
                        </button>
                    </div>
                `;
            });
            html += `</div>`;
        }
        if (container) container.innerHTML = html;

        // Eventos para tarjetas normales
        if (container) {
            container.querySelectorAll('.btn-inscribir-tarjeta:not([disabled])').forEach(btn => {
                btn.addEventListener('click', function() {
                    const charlaId = this.dataset.id;
                    const card = this.closest('.charla-card-horizontal');
                    const dia = card.dataset.dia;
                    const hora = card.dataset.hora;
                    const ponente = card.querySelector('.ponente-nombre').textContent;
                    const titulo = card.querySelector('.charla-titulo').textContent;
                    const aula = ''; // Ya no se usa el aula
                    mostrarModalInscripcion(charlaId, dia, hora, ponente, titulo, aula);
                });
            });
        }

        // --- Generar tarjetas del Sanatorio (sin aula) ---
        if (sanatorio.length > 0) {
            let sanHtml = `<div class="carrusel-sanatorio">`;
            sanatorio.sort((a, b) => a.hora.localeCompare(b.hora));
            sanatorio.forEach(ch => {
                const disponibles = ch.disponibles || 0;
                const inscriptos = ch.inscritos || 0;
                const total = ch.cupo_maximo || 40;
                const disabled = disponibles <= 0 ? 'disabled' : '';
                sanHtml += `
                    <div class="sanatorio-card" data-id="${ch.id}" data-dia="${ch.dia}" data-hora="${ch.hora}">
                        <div class="sanatorio-titulo">${ch.titulo || 'Título'}</div>
                        <div class="sanatorio-ponentes">🎙️ ${ch.ponente || 'Ponentes'}</div>
                        <div class="sanatorio-detalle">
                            <span>📅 Jueves 3 - 📍 Suipacha 2251 - SSF</span>
                            <span>🕒 ${ch.hora}</span>
                            <span>👥 ${inscriptos} / ${total} inscriptos</span>
                        </div>
                        <button type="button" class="btn-inscribir-sanatorio" data-id="${ch.id}" ${disabled}>
                            ${disponibles > 0 ? '🎯 Inscribirse' : 'Agotado'}
                        </button>
                    </div>
                `;
            });
            sanHtml += `</div>`;
            if (sanatorioContainer) sanatorioContainer.innerHTML = sanHtml;

            // Eventos para Sanatorio
            sanatorioContainer.querySelectorAll('.btn-inscribir-sanatorio:not([disabled])').forEach(btn => {
                btn.addEventListener('click', function() {
                    const charlaId = this.dataset.id;
                    const card = this.closest('.sanatorio-card');
                    const dia = card.dataset.dia;
                    const hora = card.dataset.hora;
                    const ponente = card.querySelector('.sanatorio-ponentes').textContent.replace('🎙️ ', '');
                    const titulo = card.querySelector('.sanatorio-titulo').textContent;
                    const aula = 'Sanatorio Santa Fe';
                    mostrarModalInscripcion(charlaId, dia, hora, ponente, titulo, aula);
                });
            });
        }

        if (spinner) spinner.style.display = 'none';

        // Llenar select del formulario (si existe)
        if (select) {
            select.innerHTML = '<option value="">-- Elige --</option>';
            charlas.forEach(ch => {
                if (ch.disponibles > 0) {
                    const opt = document.createElement('option');
                    opt.value = ch.id;
                    opt.textContent = ch.titulo + ' (' + ch.disponibles + ' cupos)';
                    select.appendChild(opt);
                }
            });
            select.addEventListener('change', function() {
                const id = parseInt(this.value);
                if (id) {
                    const ch = charlas.find(c => c.id === id);
                    document.getElementById('cupo-disponible').textContent = ch ? 'Disponibles: ' + ch.disponibles : '';
                } else {
                    document.getElementById('cupo-disponible').textContent = '';
                }
            });
        }

    } catch (error) {
        console.error('Error cargando charlas:', error);
        if (spinner) spinner.style.display = 'none';
        if (container) container.innerHTML = '<p style="color:#f85149;">Error al cargar el cronograma.</p>';
    }
}

// ========== MODAL DE INSCRIPCIÓN ==========
function mostrarModalInscripcion(charlaId, dia, hora, ponente, titulo, aula) {
    modalCharlaId = charlaId;
    const modal = document.getElementById('modal-inscripcion');
    const info = document.getElementById('modal-charla-info');
    info.innerHTML = `
        <strong>${titulo}</strong><br>
        🎙️ ${ponente} · 📅 ${dia} · 🕒 ${hora}
    `;
    document.getElementById('modal-nombre').value = '';
    document.getElementById('modal-email').value = '';
    document.getElementById('modal-mensaje').innerHTML = '';
    document.getElementById('modal-qr-container').style.display = 'none';
    modal.style.display = 'flex';
}
document.getElementById('modal-close').addEventListener('click', function() {
    document.getElementById('modal-inscripcion').style.display = 'none';
});
window.addEventListener('click', function(e) {
    const modal = document.getElementById('modal-inscripcion');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});
document.getElementById('modal-form-inscripcion').addEventListener('submit', async function(e) {
    e.preventDefault();
    const nombre = document.getElementById('modal-nombre').value.trim();
    const email = document.getElementById('modal-email').value.trim();
    if (!nombre || !email) {
        document.getElementById('modal-mensaje').innerHTML = '<span style="color:#f85149;">Completa todos los campos.</span>';
        return;
    }
    try {
        const resp = await fetch(API_URL + '/inscribir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, charla_id: modalCharlaId })
        });
        const data = await resp.json();
        if (resp.ok) {
            document.getElementById('modal-mensaje').innerHTML = '<span style="color:#2fc3b8;">✅ ' + data.mensaje + '</span>';
            const qrContainer = document.getElementById('modal-qr-container');
            qrContainer.style.display = 'block';
            document.getElementById('modal-qr-imagen').src = data.qr;
            document.getElementById('modal-qr-enlace').href = data.url;
            document.getElementById('modal-qr-enlace').textContent = data.url;
            document.getElementById('modal-descargar-qr').onclick = function() {
                const link = document.createElement('a');
                link.download = 'qr-' + data.codigo + '.png';
                link.href = data.qr;
                link.click();
            };
            cargarCharlas();
        } else {
            document.getElementById('modal-mensaje').innerHTML = '<span style="color:#f85149;">❌ ' + (data.error || 'Error') + '</span>';
        }
    } catch (error) {
        document.getElementById('modal-mensaje').innerHTML = '<span style="color:#f85149;">❌ Error de conexión</span>';
    }
});

// ========== MIS INSCRIPCIONES ==========
document.addEventListener('DOMContentLoaded', function() {
    const btnConsultar = document.getElementById('btn-consultar');
    if (btnConsultar) {
        btnConsultar.addEventListener('click', function() {
            const email = document.getElementById('email-consulta').value.trim();
            if (!email) { alert('Ingresa un email válido'); return; }
            currentEmailConsulta = email;
            paginaMisIns = 1;
            cargarMisInscripciones(email, 1);
        });
    }
});
async function cargarMisInscripciones(email, page) {
    page = page || 1;
    const limit = 5;
    try {
        const resp = await fetch(API_URL + '/mis-inscripciones?email=' + encodeURIComponent(email) + '&page=' + page + '&limit=' + limit);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Error');
        const container = document.getElementById('mis-inscripciones-resultado');
        if (data.data.length === 0) {
            container.innerHTML = '<p style="color:#8b949e;">No tienes inscripciones.</p>';
            document.getElementById('paginacion-mis-inscripciones').innerHTML = '';
            return;
        }
        let html = '<table class="tabla-charlas"><thead><tr><th>Charla</th><th>Día</th><th>Hora</th><th>Código</th><th>Estado</th><th>Acción</th></tr></thead><tbody>';
        data.data.forEach(function(ins) {
            const esc = ins.escaneado ? '✅ Escaneado' : '⏳ Pendiente';
            html += '<tr><td>' + ins.titulo + '</td><td>' + ins.dia + '</td><td>' + ins.hora + '</td><td><code>' + ins.codigo + '</code></td><td>' + esc + '</td><td><button type="button" class="btn-accion btn-eliminar" data-codigo="' + ins.codigo + '">Cancelar</button></td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
        container.querySelectorAll('[data-codigo]').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                if (!confirm('¿Cancelar esta inscripción?')) return;
                const codigo = this.dataset.codigo;
                try {
                    const resp = await fetch(API_URL + '/inscripciones/' + codigo, { method: 'DELETE' });
                    if (resp.ok) {
                        alert('Inscripción cancelada.');
                        cargarMisInscripciones(email, 1);
                    } else {
                        const err = await resp.json();
                        alert('Error: ' + err.error);
                    }
                } catch (err) { alert('Error de conexión'); }
            });
        });
        const pag = document.getElementById('paginacion-mis-inscripciones');
        const totalPages = data.pagination.totalPages;
        if (totalPages > 1) {
            let pagHtml = '';
            for (let i = 1; i <= totalPages; i++) {
                pagHtml += '<button type="button" class="btn-secundario" data-page="' + i + '" style="' + (i === page ? 'background:#e8a838;color:#0d1117;' : '') + '">' + i + '</button>';
            }
            pag.innerHTML = pagHtml;
            pag.querySelectorAll('[data-page]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    cargarMisInscripciones(email, parseInt(this.dataset.page));
                });
            });
        } else {
            pag.innerHTML = '';
        }
    } catch (error) {
        document.getElementById('mis-inscripciones-resultado').innerHTML = '<p style="color:#f85149;">Error: ' + error.message + '</p>';
    }
}

// ========== ADMIN ==========
document.addEventListener('DOMContentLoaded', function() {
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('admin-user').value;
            const password = document.getElementById('admin-pass').value;
            try {
                const resp = await fetch(API_URL + '/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await resp.json();
                if (resp.ok) {
                    adminToken = data.token;
                    document.getElementById('admin-login-section').style.display = 'none';
                    document.getElementById('admin-panel-section').style.display = 'block';
                    cargarSelectCharlasAdmin();
                    cargarAdminInscripciones(1);
                } else {
                    document.getElementById('admin-login-error').textContent = data.error || 'Error';
                }
            } catch (err) {
                document.getElementById('admin-login-error').textContent = 'Error de conexión';
            }
        });
    }
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            adminToken = null;
            document.getElementById('admin-login-section').style.display = 'block';
            document.getElementById('admin-panel-section').style.display = 'none';
            document.getElementById('admin-login-error').textContent = '';
        });
    }
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', function() {
            cargarAdminInscripciones(1);
        });
    }
    const btnExportarExcel = document.getElementById('btn-exportar-excel');
    if (btnExportarExcel) {
        btnExportarExcel.addEventListener('click', async function() {
            if (!adminToken) return;
            try {
                const resp = await fetch(API_URL + '/admin/exportar-excel', {
                    headers: { 'Authorization': 'Bearer ' + adminToken }
                });
                if (resp.status === 401 || resp.status === 403) {
                    alert('Sesión expirada.');
                    document.getElementById('btn-logout').click();
                    return;
                }
                const blob = await resp.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'inscripciones-' + new Date().toISOString().split('T')[0] + '.xlsx';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (err) {
                alert('Error al exportar: ' + err.message);
            }
        });
    }
});
async function cargarSelectCharlasAdmin() {
    try {
        const resp = await fetch(API_URL + '/charlas');
        const charlas = await resp.json();
        const select = document.getElementById('filtro-charla');
        select.innerHTML = '<option value="">Todas</option>';
        charlas.forEach(function(ch) {
            const opt = document.createElement('option');
            opt.value = ch.id;
            opt.textContent = ch.titulo;
            select.appendChild(opt);
        });
    } catch (err) { console.error(err); }
}
async function cargarAdminInscripciones(page) {
    page = page || 1;
    if (!adminToken) return;
    paginaAdmin = page;
    const email = document.getElementById('filtro-email').value;
    const charla_id = document.getElementById('filtro-charla').value;
    const escaneado = document.getElementById('filtro-escaneado').value;
    const limit = 10;
    try {
        const params = new URLSearchParams({ page: page, limit: limit });
        if (email) params.append('email', email);
        if (charla_id) params.append('charla_id', charla_id);
        if (escaneado !== '') params.append('escaneado', escaneado);
        const resp = await fetch(API_URL + '/admin/inscripciones?' + params.toString(), {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        if (resp.status === 401 || resp.status === 403) {
            alert('Sesión expirada.');
            document.getElementById('btn-logout').click();
            return;
        }
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Error');
        renderAdminTabla(data);
    } catch (err) {
        document.getElementById('admin-inscripciones-tabla').innerHTML = '<p style="color:#f85149;">Error: ' + err.message + '</p>';
    }
}
function renderAdminTabla(data) {
    const container = document.getElementById('admin-inscripciones-tabla');
    if (data.data.length === 0) {
        container.innerHTML = '<p style="color:#8b949e;">No hay inscripciones con esos filtros.</p>';
        document.getElementById('paginacion-admin').innerHTML = '';
        return;
    }
    let html = '<table><thead><tr><th>Nombre</th><th>Email</th><th>Charla</th><th>Día</th><th>Hora</th><th>Código</th><th>Escaneado</th><th>Acciones</th></tr></thead><tbody>';
    data.data.forEach(function(ins) {
        const esc = ins.escaneado ? '✅ Sí' : '⏳ No';
        html += '<tr><td>' + ins.nombre + '</td><td>' + ins.email + '</td><td>' + ins.charla_titulo + '</td><td>' + ins.dia + '</td><td>' + ins.hora + '</td><td><code>' + ins.codigo + '</code></td><td>' + esc + '</td><td><button type="button" class="btn-accion" data-id="' + ins.id + '" data-esc="' + ins.escaneado + '">' + (ins.escaneado ? 'Marcar no escaneado' : 'Marcar escaneado') + '</button> <button type="button" class="btn-accion btn-eliminar" data-id="' + ins.id + '" data-eliminar>Eliminar</button></td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    container.querySelectorAll('[data-id]').forEach(function(btn) {
        if (btn.dataset.eliminar) {
            btn.addEventListener('click', async function() {
                if (!confirm('¿Eliminar esta inscripción permanentemente?')) return;
                const id = this.dataset.id;
                try {
                    const resp = await fetch(API_URL + '/admin/inscripciones/' + id, {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + adminToken }
                    });
                    if (resp.ok) {
                        alert('Inscripción eliminada.');
                        cargarAdminInscripciones(paginaAdmin);
                    } else {
                        const err = await resp.json();
                        alert('Error: ' + err.error);
                    }
                } catch (err) { alert('Error de conexión'); }
            });
        } else {
            btn.addEventListener('click', async function() {
                const id = this.dataset.id;
                const escActual = this.dataset.esc === 'true';
                const nuevo = !escActual;
                try {
                    const resp = await fetch(API_URL + '/admin/inscripciones/' + id + '/escaneado', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
                        body: JSON.stringify({ escaneado: nuevo })
                    });
                    if (resp.ok) {
                        cargarAdminInscripciones(paginaAdmin);
                    } else {
                        const err = await resp.json();
                        alert('Error: ' + err.error);
                    }
                } catch (err) { alert('Error de conexión'); }
            });
        }
    });
    const pag = document.getElementById('paginacion-admin');
    const totalPages = data.pagination.totalPages;
    if (totalPages > 1) {
        let pagHtml = '';
        for (let i = 1; i <= totalPages; i++) {
            pagHtml += '<button type="button" class="btn-secundario" data-page="' + i + '" style="' + (i === paginaAdmin ? 'background:#e8a838;color:#0d1117;' : '') + '">' + i + '</button>';
        }
        pag.innerHTML = pagHtml;
        pag.querySelectorAll('[data-page]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                cargarAdminInscripciones(parseInt(this.dataset.page));
            });
        });
    } else {
        pag.innerHTML = '';
    }
}

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', function() {
    cargarCharlas();
});
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    cargarCharlas();
}