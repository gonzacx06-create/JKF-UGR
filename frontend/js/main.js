const API_URL = window.location.origin + '/api';
let adminToken = null;
let paginaAdmin = 1;
let paginaMisIns = 1;
let currentEmailConsulta = '';

// ========== MENÚ HAMBURGUESA ==========
const menuBtn = document.getElementById('menuBtn');
const sideMenu = document.getElementById('sideMenu');
let menuOpen = false;

menuBtn.addEventListener('click', () => {
    menuOpen = !menuOpen;
    sideMenu.classList.toggle('open');
});

// Cerrar menú al hacer clic en un enlace
document.querySelectorAll('#sideMenu a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        cambiarSeccion(section);
        sideMenu.classList.remove('open');
        menuOpen = false;
    });
});

function cambiarSeccion(id) {
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('#sideMenu a').forEach(a => a.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    const link = document.querySelector(`#sideMenu a[data-section="${id}"]`);
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

// ========== CARGAR CHARLAS (tabla) ==========
async function cargarCharlas() {
    try {
        const resp = await fetch(`${API_URL}/charlas`);
        const charlas = await resp.json();
        const container = document.getElementById('tabla-cronograma');
        const containerFull = document.getElementById('tabla-cronograma-full');
        const select = document.getElementById('charla');

        // Agrupar por día
        const grupos = {};
        charlas.forEach(ch => {
            if (!grupos[ch.dia]) grupos[ch.dia] = [];
            grupos[ch.dia].push(ch);
        });

        let html = '';
        for (const [dia, lista] of Object.entries(grupos)) {
            html += `<h3 style="color: #003366; margin: 15px 0 10px; border-bottom: 2px solid #d52333; padding-bottom: 5px;">${dia}</h3>`;
            html += `<table class="tabla-charlas">
                <thead><tr>
                    <th>Horario</th><th>Título</th><th>Ponente</th><th>Cupos</th><th>Acción</th>
                </tr></thead><tbody>`;
            lista.forEach(ch => {
                const disponibles = ch.disponibles || 0;
                const estado = disponibles > 0 ? `Disponibles: ${disponibles}` : 'LLENO';
                const disabled = disponibles <= 0 ? 'disabled' : '';
                html += `<tr>
                    <td>${ch.hora}</td>
                    <td>${ch.titulo}</td>
                    <td>${ch.ponente}</td>
                    <td>${estado}</td>
                    <td><button class="btn-inscribir" data-id="${ch.id}" ${disabled}>Inscribirse</button></td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        container.innerHTML = html;
        if (containerFull) containerFull.innerHTML = html;

        // Eventos para botones de inscripción
        container.querySelectorAll('.btn-inscribir').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const selectCharla = document.getElementById('charla');
                for (let opt of selectCharla.options) {
                    if (opt.value == id) {
                        selectCharla.value = id;
                        break;
                    }
                }
                const event = new Event('change');
                selectCharla.dispatchEvent(event);
                document.getElementById('inscripcion-section').scrollIntoView({ behavior: 'smooth' });
            });
        });

        // Llenar select del formulario
        select.innerHTML = '<option value="">-- Elige --</option>';
        charlas.forEach(ch => {
            if (ch.disponibles > 0) {
                const opt = document.createElement('option');
                opt.value = ch.id;
                opt.textContent = `${ch.titulo} (${ch.disponibles} cupos)`;
                select.appendChild(opt);
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
        document.getElementById('tabla-cronograma').innerHTML = '<p style="color:#f85149;">Error al cargar el cronograma.</p>';
    }
}

// ========== INSCRIPCIÓN ==========
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
            document.getElementById('mensaje-inscripcion').innerHTML = `<span style="color:#81c784;">✅ ${data.mensaje}</span>`;
            const qrContainer = document.getElementById('qr-container');
            qrContainer.style.display = 'block';
            document.getElementById('qr-imagen').src = data.qr;
            document.getElementById('qr-enlace').href = data.url;
            document.getElementById('qr-enlace').textContent = data.url;
            document.getElementById('descargar-qr').onclick = () => {
                const link = document.createElement('a');
                link.download = `qr-${data.codigo}.png`;
                link.href = data.qr;
                link.click();
            };
            document.getElementById('form-inscripcion').reset();
            cargarCharlas();
        } else {
            document.getElementById('mensaje-inscripcion').innerHTML = `<span style="color:#f85149;">❌ ${data.error || 'Error'}</span>`;
        }
    } catch (error) {
        document.getElementById('mensaje-inscripcion').innerHTML = `<span style="color:#f85149;">❌ Error de conexión</span>`;
    }
});

// ========== MIS INSCRIPCIONES ==========
document.getElementById('btn-consultar').addEventListener('click', () => {
    const email = document.getElementById('email-consulta').value.trim();
    if (!email) { alert('Ingresa un email válido'); return; }
    currentEmailConsulta = email;
    paginaMisIns = 1;
    cargarMisInscripciones(email, 1);
});

async function cargarMisInscripciones(email, page = 1) {
    const limit = 5;
    try {
        const resp = await fetch(`${API_URL}/mis-inscripciones?email=${encodeURIComponent(email)}&page=${page}&limit=${limit}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Error');
        const container = document.getElementById('mis-inscripciones-resultado');
        if (data.data.length === 0) {
            container.innerHTML = '<p style="color:#8b949e;">No tienes inscripciones.</p>';
            document.getElementById('paginacion-mis-inscripciones').innerHTML = '';
            return;
        }
        let html = `<table class="tabla-charlas">
            <thead><tr><th>Charla</th><th>Día</th><th>Hora</th><th>Código</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
        data.data.forEach(ins => {
            const esc = ins.escaneado ? '✅ Escaneado' : '⏳ Pendiente';
            html += `<tr>
                <td>${ins.titulo}</td><td>${ins.dia}</td><td>${ins.hora}</td>
                <td><code>${ins.codigo}</code></td><td>${esc}</td>
                <td><button class="btn-accion btn-eliminar" data-codigo="${ins.codigo}">Cancelar</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;

        container.querySelectorAll('[data-codigo]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('¿Cancelar esta inscripción?')) return;
                const codigo = btn.dataset.codigo;
                try {
                    const resp = await fetch(`${API_URL}/inscripciones/${codigo}`, { method: 'DELETE' });
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
                pagHtml += `<button class="btn-secundario" data-page="${i}" style="${i===page?'background:#e8a838;color:#0d1117;':''}">${i}</button>`;
            }
            pag.innerHTML = pagHtml;
            pag.querySelectorAll('[data-page]').forEach(btn => {
                btn.addEventListener('click', () => {
                    cargarMisInscripciones(email, parseInt(btn.dataset.page));
                });
            });
        } else {
            pag.innerHTML = '';
        }
    } catch (error) {
        document.getElementById('mis-inscripciones-resultado').innerHTML = `<p style="color:#f85149;">Error: ${error.message}</p>`;
    }
}

// ========== ADMIN ==========
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-user').value;
    const password = document.getElementById('admin-pass').value;
    try {
        const resp = await fetch(`${API_URL}/admin/login`, {
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

document.getElementById('btn-logout').addEventListener('click', () => {
    adminToken = null;
    document.getElementById('admin-login-section').style.display = 'block';
    document.getElementById('admin-panel-section').style.display = 'none';
    document.getElementById('admin-login-error').textContent = '';
});

async function cargarSelectCharlasAdmin() {
    try {
        const resp = await fetch(`${API_URL}/charlas`);
        const charlas = await resp.json();
        const select = document.getElementById('filtro-charla');
        select.innerHTML = '<option value="">Todas</option>';
        charlas.forEach(ch => {
            const opt = document.createElement('option');
            opt.value = ch.id;
            opt.textContent = ch.titulo;
            select.appendChild(opt);
        });
    } catch (err) { console.error(err); }
}

async function cargarAdminInscripciones(page = 1) {
    if (!adminToken) return;
    paginaAdmin = page;
    const email = document.getElementById('filtro-email').value;
    const charla_id = document.getElementById('filtro-charla').value;
    const escaneado = document.getElementById('filtro-escaneado').value;
    const limit = 10;

    try {
        const params = new URLSearchParams({ page, limit });
        if (email) params.append('email', email);
        if (charla_id) params.append('charla_id', charla_id);
        if (escaneado !== '') params.append('escaneado', escaneado);

        const resp = await fetch(`${API_URL}/admin/inscripciones?${params}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
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
        document.getElementById('admin-inscripciones-tabla').innerHTML = `<p style="color:#f85149;">Error: ${err.message}</p>`;
    }
}

function renderAdminTabla(data) {
    const container = document.getElementById('admin-inscripciones-tabla');
    if (data.data.length === 0) {
        container.innerHTML = '<p style="color:#8b949e;">No hay inscripciones con esos filtros.</p>';
        document.getElementById('paginacion-admin').innerHTML = '';
        return;
    }
    let html = `<table>
        <thead><tr>
            <th>Nombre</th><th>Email</th><th>Charla</th><th>Día</th><th>Hora</th><th>Código</th><th>Escaneado</th><th>Acciones</th>
        </tr></thead><tbody>`;
    data.data.forEach(ins => {
        const esc = ins.escaneado ? '✅ Sí' : '⏳ No';
        html += `<tr>
            <td>${ins.nombre}</td><td>${ins.email}</td><td>${ins.charla_titulo}</td>
            <td>${ins.dia}</td><td>${ins.hora}</td>
            <td><code>${ins.codigo}</code></td>
            <td>${esc}</td>
            <td>
                <button class="btn-accion" data-id="${ins.id}" data-esc="${ins.escaneado}">${ins.escaneado ? 'Marcar no escaneado' : 'Marcar escaneado'}</button>
                <button class="btn-accion btn-eliminar" data-id="${ins.id}" data-eliminar>Eliminar</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('[data-id]').forEach(btn => {
        if (btn.dataset.eliminar) {
            btn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar esta inscripción permanentemente?')) return;
                const id = btn.dataset.id;
                try {
                    const resp = await fetch(`${API_URL}/admin/inscripciones/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${adminToken}` }
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
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const escActual = btn.dataset.esc === 'true';
                const nuevo = !escActual;
                try {
                    const resp = await fetch(`${API_URL}/admin/inscripciones/${id}/escaneado`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
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
            pagHtml += `<button class="btn-secundario" data-page="${i}" style="${i===paginaAdmin?'background:#e8a838;color:#0d1117;':''}">${i}</button>`;
        }
        pag.innerHTML = pagHtml;
        pag.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                cargarAdminInscripciones(parseInt(btn.dataset.page));
            });
        });
    } else {
        pag.innerHTML = '';
    }
}

document.getElementById('btn-aplicar-filtros').addEventListener('click', () => {
    cargarAdminInscripciones(1);
});

document.getElementById('btn-exportar-excel').addEventListener('click', async () => {
    if (!adminToken) return;
    try {
        const resp = await fetch(`${API_URL}/admin/exportar-excel`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
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
        a.download = `inscripciones-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        alert('Error al exportar: ' + err.message);
    }
});

// ========== INICIALIZAR ==========
cargarCharlas();