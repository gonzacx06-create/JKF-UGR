const API_URL = window.location.origin + '/api';
let adminToken = null;
let paginaAdmin = 1;
let paginaMisIns = 1;
let currentEmailConsulta = '';

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
        // Forzar reflow para reiniciar la animación
        void el.offsetWidth;
        el.classList.add('tick');
    }
}

function actualizarContador() {
    // Fecha del evento: 2 de septiembre de 2026, 00:00 (UTC-3)
    const fechaEvento = Date.UTC(2026, 8, 2, 3, 0, 0); // 03:00 UTC = 00:00 (UTC-3)
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

// Iniciar contador
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
// Mostrar Inicio por defecto
cambiarSeccion('inicio');

// ========== CARGAR CHARLAS ==========
async function cargarCharlas() {
    const spinner = document.getElementById('loading-spinner');
    const container = document.getElementById('tabla-cronograma');
    const containerFull = document.getElementById('tabla-cronograma-full');
    const select = document.getElementById('charla');

    if (spinner) spinner.style.display = 'flex';

    try {
        const resp = await fetch(API_URL + '/charlas');
        if (!resp.ok) {
            throw new Error('Error ' + resp.status + ': ' + resp.statusText);
        }
        const charlas = await resp.json();

        const grupos = {};
        charlas.forEach(function(ch) {
            if (!grupos[ch.dia]) grupos[ch.dia] = [];
            grupos[ch.dia].push(ch);
        });

        let html = '';
        let filaIndex = 0;
        for (const [dia, lista] of Object.entries(grupos)) {
            html += '<h3>🗓️ ' + dia + '</h3>';
            html += '<table class="tabla-charlas"><thead><tr>';
            html += '<th>🕒 Horario</th><th>📌 Título</th><th>🎙️ Ponente</th>';
            html += '<th>🎟️ Cupos</th><th>Acción</th>';
            html += '</tr></thead><tbody>';
            lista.forEach(function(ch) {
                const disponibles = ch.disponibles || 0;
                const inscritos = ch.inscritos || 0;
                const total = ch.cupo_maximo || 40;
                const disabled = disponibles <= 0 ? 'disabled' : '';
                const delay = (filaIndex * 60) % 420;
                html += '<tr style="animation-delay: ' + delay + 'ms;" class="fila-entrada">';
                html += '<td>' + ch.hora + '</td>';
                html += '<td>' + ch.titulo + '</td>';
                html += '<td>' + ch.ponente + '</td>';
                html += '<td><span class="cupo-detalle">👥 Inscritos: ' + inscritos + ' / ' + total + '</span></td>';
                html += '<td><button type="button" class="btn-inscribir" data-id="' + ch.id + '" ' + disabled + '>' + (disponibles > 0 ? 'Inscribirse' : 'Agotado') + '</button></td>';
                html += '</tr>';
                filaIndex++;
            });
            html += '</tbody></table>';
        }

        if (spinner) spinner.style.display = 'none';
        if (container) container.innerHTML = html;
        if (containerFull) containerFull.innerHTML = html;

        if (container) {
            container.querySelectorAll('.btn-inscribir').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = this.dataset.id;
                    const selectCharla = document.getElementById('charla');
                    if (selectCharla) {
                        for (let opt of selectCharla.options) {
                            if (opt.value == id) {
                                selectCharla.value = id;
                                break;
                            }
                        }
                        const event = new Event('change');
                        selectCharla.dispatchEvent(event);
                        document.getElementById('inscripcion-section').scrollIntoView({ behavior: 'smooth' });
                    }
                });
            });
        }

        if (select) {
            select.innerHTML = '<option value="">-- Elige --</option>';
            charlas.forEach(function(ch) {
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
                    const ch = charlas.find(function(c) { return c.id === id; });
                    document.getElementById('cupo-disponible').textContent = ch ? 'Disponibles: ' + ch.disponibles : '';
                } else {
                    document.getElementById('cupo-disponible').textContent = '';
                }
            });
        }

    } catch (error) {
        console.error('Error cargando charlas:', error);
        if (spinner) spinner.style.display = 'none';
        if (container) container.innerHTML = '<p style="color:#f85149;">Error al cargar el cronograma. Intenta de nuevo más tarde.</p>';
    }
}

// ========== INSCRIPCIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('form-inscripcion');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const nombre = document.getElementById('nombre').value.trim();
            const email = document.getElementById('email').value.trim();
            const charla_id = parseInt(document.getElementById('charla').value);

            if (!nombre || !email || !charla_id) {
                alert('Completa todos los campos');
                return;
            }

            try {
                const resp = await fetch(API_URL + '/inscribir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, email, charla_id })
                });
                const data = await resp.json();

                if (resp.ok) {
                    document.getElementById('mensaje-inscripcion').innerHTML = '<span style="color:#2fc3b8;">✅ ' + data.mensaje + '</span>';
                    const qrContainer = document.getElementById('qr-container');
                    if (qrContainer) {
                        qrContainer.style.display = 'block';
                        document.getElementById('qr-imagen').src = data.qr;
                        document.getElementById('qr-enlace').href = data.url;
                        document.getElementById('qr-enlace').textContent = data.url;
                        document.getElementById('descargar-qr').onclick = function() {
                            const link = document.createElement('a');
                            link.download = 'qr-' + data.codigo + '.png';
                            link.href = data.qr;
                            link.click();
                        };
                    }
                    document.getElementById('form-inscripcion').reset();
                    cargarCharlas();
                } else {
                    document.getElementById('mensaje-inscripcion').innerHTML = '<span style="color:#f85149;">❌ ' + (data.error || 'Error') + '</span>';
                }
            } catch (error) {
                document.getElementById('mensaje-inscripcion').innerHTML = '<span style="color:#f85149;">❌ Error de conexión</span>';
            }
        });
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

// ========== COMPARTIR EN REDES SOCIALES ==========
document.addEventListener('DOMContentLoaded', function() {
    const shareWhatsApp = document.getElementById('shareWhatsApp');
    if (shareWhatsApp) {
        shareWhatsApp.addEventListener('click', function(e) {
            e.preventDefault();
            const url = encodeURIComponent(window.location.href);
            const msg = encodeURIComponent('¡Inscríbete en las XI Jornadas de Kinesiología y Fisiatría UGR 2026!');
            window.open('https://wa.me/?text=' + msg + '%20' + url, '_blank');
        });
    }

    const shareTwitter = document.getElementById('shareTwitter');
    if (shareTwitter) {
        shareTwitter.addEventListener('click', function(e) {
            e.preventDefault();
            const url = encodeURIComponent(window.location.href);
            const text = encodeURIComponent('¡Inscríbete en las XI Jornadas de Kinesiología y Fisiatría UGR 2026!');
            window.open('https://twitter.com/intent/tweet?text=' + text + '&url=' + url, '_blank');
        });
    }

    const shareFacebook = document.getElementById('shareFacebook');
    if (shareFacebook) {
        shareFacebook.addEventListener('click', function(e) {
            e.preventDefault();
            const url = encodeURIComponent(window.location.href);
            window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank');
        });
    }
});

// ========== INICIALIZAR ==========
// Cargar charlas después de que el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    cargarCharlas();
});
// También ejecutar por si el DOM ya está cargado
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    cargarCharlas();
}