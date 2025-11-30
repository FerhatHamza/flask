/**
 * FRONTEND LOGIC - APP.JS (Updated)
 */

// ==========================================
//  REPLACE THIS WITH YOUR CLOUDFLARE WORKER URL !!!
// ==========================================
const API_BASE = "https://flask-manager.ferhathamza17.workers.dev";
// ==========================================

// --- LOCATION GROUPING MAP (For Global Totaux) ---
// Note: These names must exactly match the 'name' field in your locations table.
const GROUP_MAPPING = {
    'VIEUX KSAR': [
        'Polyclinique vieux k\'sar', 
        'equip mobile 2', 
        'center de sante chikh ameur'
    ],
    'BAILICHE MAZOUZ': [
        'Polyclinique bailiche mazouz', 
        'equip mobile 1', 
        'center de sante elmoudjahidine'
    ]
};

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
            err.classList.remove('hidden');
            btn.innerText = 'Se Connecter';
        }
    } catch (error) {
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


// --- REPORT LOGIC (Includes Group Totals) ---

/**
 * Calculates sums for a specific group of locations.
 * @param {string[]} locationNames - Array of location names in the group.
 * @returns {object} Totals (N, O, Q, R).
 */
function calculateGroupTotals(locationNames) {
    let totals = { N: 0, O: 0, Q: 0, R: 0 };
    
    // 1. Find the location IDs corresponding to the names
    const locationIds = state.locations
        .filter(loc => locationNames.includes(loc.name))
        .map(loc => loc.id);

    // 2. Sum the inventory data for those IDs
    state.inventory.forEach(inv => {
        if (locationIds.includes(inv.location_id)) {
            totals.N += inv.total_N || 0;
            totals.O += inv.total_O || 0;
            totals.Q += inv.total_Q || 0;
            totals.R += inv.total_R || 0;
        }
    });
    return totals;
}

/**
 * Helper to calculate Usable and Loss Rate for a set of totals.
 */
function calculateKPIs(totals) {
    const usable = totals.O - totals.Q - totals.R;
    const denom = (totals.Q + totals.R) * 50;
    let loss = "0.00%";
    if (denom > 0) {
        const rawRate = (denom - totals.N) / denom;
        loss = (rawRate * 100).toFixed(2) + '%';
    }
    return { usable, loss };
}

function renderReportTable() {
    const tbody = document.getElementById('report-body');
    const tfooter = document.getElementById('report-footer');
    tbody.innerHTML = '';
    
    let tN=0, tO=0, tQ=0, tR=0;
    
    // --- 1. RENDER GROUP TOTALS ---
    for (const groupName in GROUP_MAPPING) {
        const locationNames = GROUP_MAPPING[groupName];
        const groupTotals = calculateGroupTotals(locationNames);
        const { usable, loss } = calculateKPIs(groupTotals);

        // Add group totals to the grand totals
        tN += groupTotals.N; tO += groupTotals.O; tQ += groupTotals.Q; tR += groupTotals.R;

        // Render the group row
        const groupRow = document.createElement('tr');
        groupRow.className = "bg-blue-50 hover:bg-blue-100 font-bold border-t-2 border-blue-200";
        groupRow.innerHTML = `
            <td class="px-6 py-3 font-black text-blue-800">${groupName} (TOTAL)</td>
            <td class="px-6 py-3 text-center">${groupTotals.N}</td>
            <td class="px-6 py-3 text-center">${groupTotals.O}</td>
            <td class="px-6 py-3 text-center text-red-600">${groupTotals.Q}</td>
            <td class="px-6 py-3 text-center text-red-600">${groupTotals.R}</td>
            <td class="px-6 py-3 text-center bg-blue-100">${usable}</td>
            <td class="px-6 py-3 text-center bg-yellow-100">${loss}</td>
        `;
        tbody.appendChild(groupRow);
    }
    
    // --- 2. RENDER INDIVIDUAL LOCATIONS (Non-grouped locations are also included) ---
    state.locations.forEach(loc => {
        // Find if this location is part of a mapped group. If so, skip rendering it individually.
        const isGrouped = Object.values(GROUP_MAPPING).flat().includes(loc.name);
        if (isGrouped) return;

        const data = state.inventory.find(i => i.location_id === loc.id) || {};
        const N = data.total_N || 0; const O = data.total_O || 0;
        const Q = data.total_Q || 0; const R = data.total_R || 0;
        
        // Only add non-grouped totals if you want a true GRAND TOTAL 
        // that includes locations not in the two specified groups.
        tN += N; tO += O; tQ += Q; tR += R;

        const { usable, loss } = calculateKPIs({N, O, Q, R});

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

    // --- 3. RENDER GRAND TOTALS ---
    const tUsable = tO - tQ - tR;
    const tDenom = (tQ + tR) * 50;
    let tLoss = "0.00%";
    if (tDenom > 0) tLoss = (((tDenom - tN) / tDenom) * 100).toFixed(2) + '%';

    tfooter.innerHTML = `
        <tr>
            <td class="px-6 py-4 font-black text-white bg-slate-700">GRAND TOTAL GLOBAL</td>
            <td class="px-6 py-4 text-center font-black text-white bg-slate-700">${tN}</td>
            <td class="px-6 py-4 text-center font-black text-white bg-slate-700">${tO}</td>
            <td class="px-6 py-4 text-center font-black text-white bg-slate-700">${tQ}</td>
            <td class="px-6 py-4 text-center font-black text-white bg-slate-700">${tR}</td>
            <td class="px-6 py-4 text-center font-black text-blue-800 bg-blue-300">${tUsable}</td>
            <td class="px-6 py-4 text-center font-black text-white bg-red-600">${tLoss}</td>
        </tr>
    `;

    // --- 4. UPDATE KPI CARDS (New Coverage Rates) ---
    
    // Note: Since 'N' is the total number vaccinated (not split by age group),
    // we use the total N against each specific age target for the Taux Cible.
    const target2_11m = state.demographics.cible_2_11m || 1;
    const target12_59m = state.demographics.cible_12_59m || 1; 

    // Calculate Taux Cible (Coverage Rate)
    const taux2_11m = ((tN / target2_11m) * 100).toFixed(2);
    const taux12_59m = ((tN / target12_59m) * 100).toFixed(2);
    
    // Calculate Overall Coverage
    const overallTarget = target2_11m + target12_59m;
    const overallTaux = ((tN / overallTarget) * 100).toFixed(2);


    document.getElementById('kpi-target').innerText = overallTarget.toLocaleString();
    document.getElementById('kpi-n').innerText = tN.toLocaleString();
    document.getElementById('kpi-taux-2-11m').innerText = taux2_11m + '%';
    document.getElementById('kpi-taux-12-59m').innerText = taux12_59m + '%';
    document.getElementById('kpi-overall-coverage').innerText = overallTaux + '%'; // New overall KPI
    document.getElementById('kpi-loss').innerText = tLoss;
}
