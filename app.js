/**
 * FRONTEND LOGIC - APP.JS
 * Place this in your GitHub repository
 */

// ==========================================
//  REPLACE THIS WITH YOUR CLOUDFLARE WORKER URL !!!
// ==========================================
const API_BASE = "https://flask-manager.ferhathamza17.workers.dev";
// ==========================================

// --- GLOBAL STATE ---
let state = {
    user: null,
    demographics: {},
    locations: [],
    inventory: []
};

// --- AUTHENTICATION & INITIALIZATION ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    const err = document.getElementById('login-error');

    btn.innerText = 'Connexion...'; 
    err.classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: u, password: p })
        });

        if (res.ok) {
            state.user = await res.json();
            initApp();
        } else {
            // Handle HTTP errors (401, 500, etc.)
            err.classList.remove('hidden');
            btn.innerText = 'Se Connecter';
        }
    } catch (error) {
        // Handle network errors (Failed to fetch, ERR_CONNECTION_CLOSED)
        console.error("Fetch Error:", error);
        err.innerText = "Erreur de connexion : Vérifiez l'URL de l'API et la configuration CORS.";
        err.classList.remove('hidden');
        btn.innerText = 'Se Connecter';
    }
});

function logout() { 
    window.location.reload(); 
}

async function initApp() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('nav-user-info').innerText = `${state.user.role.toUpperCase()} | ${state.user.username}`;
    
    await refreshData();

    // Show sections based on role
    const role = state.user.role;
    if (role === 'admin') {
        document.getElementById('section-admin').classList.remove('hidden');
        document.getElementById('section-report').classList.remove('hidden');
        populateAdminConfig();
        renderReportTable();
    } else if (role === 'consultant') {
        document.getElementById('section-report').classList.remove('hidden');
        renderReportTable();
    } else if (role === 'user') {
        document.getElementById('section-user').classList.remove('hidden');
        setupUserView();
    }
}

async function refreshData() {
    const res = await fetch(`${API_BASE}/api/data`);
    const data = await res.json();
    state.demographics = data.demo || {};
    state.locations = data.locations || [];
    state.inventory = data.inventory || [];
    document.getElementById('nav-epsp-name').innerText = state.demographics.epsp_name || 'EPSP Gestion';
}

// --- USER VIEW LOGIC ---
function setupUserView() {
    const locId = state.user.location_id;
    const loc = state.locations.find(l => l.id === locId);
    document.getElementById('user-location-label').innerText = loc ? loc.name : 'Lieu Inconnu';
    document.getElementById('inv-date').valueAsDate = new Date();

    // Live Calculation Listeners
    ['inv-O', 'inv-Q', 'inv-R'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            const O = parseInt(document.getElementById('inv-O').value) || 0;
            const Q = parseInt(document.getElementById('inv-Q').value) || 0;
            const R = parseInt(document.getElementById('inv-R').value) || 0;
            const usable = O - Q - R;
            const physical = usable + Q;
            const disp = document.getElementById('disp-usable');
            disp.innerText = usable;
            disp.className = usable < 0 ? "text-xl font-bold font-mono text-red-500" : "text-xl font-bold font-mono text-green-400";
            document.getElementById('disp-physical').innerText = physical;
        });
    });
}

document.getElementById('inventory-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!confirm("Confirmer les chiffres ?")) return;

    const payload = {
        location_id: state.user.location_id,
        date: document.getElementById('inv-date').value,
        N: parseInt(document.getElementById('inv-N').value),
        O: parseInt(document.getElementById('inv-O').value),
        Q: parseInt(document.getElementById('inv-Q').value),
        R: parseInt(document.getElementById('inv-R').value)
    };

    try {
        await fetch(`${API_BASE}/api/inventory`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload) 
        });
        alert("Données enregistrées !");
        document.getElementById('inventory-form').reset();
        setupUserView();
    } catch (error) {
        alert("Erreur lors de l'enregistrement des données. Vérifiez la connexion API.");
        console.error(error);
    }
});

// --- ADMIN VIEW LOGIC ---
function populateAdminConfig() {
    const d = state.demographics;
    if(!d) return;
    document.getElementById('cfg-epsp').value = d.epsp_name || '';
    document.getElementById('cfg-nbr').value = d.nbr_polyclinique || '';
    document.getElementById('cfg-pop').value = d.pop_total || '';
    document.getElementById('cfg-c2').value = d.cible_2_11m || '';
    document.getElementById('cfg-c12').value = d.cible_12_59m || '';
}

document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        epsp_name: document.getElementById('cfg-epsp').value,
        nbr_polyclinique: document.getElementById('cfg-nbr').value,
        pop_total: document.getElementById('cfg-pop').value,
        cible_2_11m: document.getElementById('cfg-c2').value,
        cible_12_59m: document.getElementById('cfg-c12').value,
    };
    await fetch(`${API_BASE}/api/demographics`, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload) 
    });
    alert("Configuration sauvegardée.");
    await refreshData();
    renderReportTable();
});

// --- REPORT LOGIC ---
function renderReportTable() {
    const tbody = document.getElementById('report-body');
    const tfooter = document.getElementById('report-footer');
    tbody.innerHTML = '';
    let tN=0, tO=0, tQ=0, tR=0;

    state.locations.forEach(loc => {
        const data = state.inventory.find(i => i.location_id === loc.id) || {};
        const N = data.total_N || 0; const O = data.total_O || 0;
        const Q = data.total_Q || 0; const R = data.total_R || 0;
        tN += N; tO += O; tQ += Q; tR += R;

        const usable = O - Q - R;
        const denom = (Q + R) * 50;
        let loss = "-";
        if (denom > 0) {
            const rawRate = (denom - N) / denom;
            loss = (rawRate * 100).toFixed(2) + '%';
        }

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 border-b">
                <td class="px-6 py-4 font-medium">${loc.name} <span class="text-xs text-gray-400 block">${loc.type}</span></td>
                <td class="px-6 py-4 text-center font-bold">${N}</td>
                <td class="px-6 py-4 text-center">${O}</td>
                <td class="px-6 py-4 text-center text-red-500">${Q}</td>
                <td class="px-6 py-4 text-center text-red-500">${R}</td>
                <td class="px-6 py-4 text-center font-bold bg-blue-50">${usable}</td>
                <td class="px-6 py-4 text-center font-bold bg-yellow-50">${loss}</td>
            </tr>`;
    });

    const tUsable = tO - tQ - tR;
    const tDenom = (tQ + tR) * 50;
    let tLoss = "0.00%";
    if (tDenom > 0) tLoss = (((tDenom - tN) / tDenom) * 100).toFixed(2) + '%';

    tfooter.innerHTML = `
        <td class="px-6 py-4 font-black">TOTAL GLOBAL</td>
        <td class="px-6 py-4 text-center font-black">${tN}</td>
        <td class="px-6 py-4 text-center font-black">${tO}</td>
        <td class="px-6 py-4 text-center font-black text-red-600">${tQ}</td>
        <td class="px-6 py-4 text-center font-black text-red-600">${tR}</td>
        <td class="px-6 py-4 text-center font-black bg-blue-100">${tUsable}</td>
        <td class="px-6 py-4 text-center font-black text-white bg-red-500">${tLoss}</td>`;

    const target = state.demographics.cible_total || 1;
    document.getElementById('kpi-target').innerText = target.toLocaleString();
    document.getElementById('kpi-n').innerText = tN.toLocaleString();
    document.getElementById('kpi-coverage').innerText = ((tN/target)*100).toFixed(2) + '%';
    document.getElementById('kpi-loss').innerText = tLoss;
}
