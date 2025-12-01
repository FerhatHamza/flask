/**
 * FRONTEND LOGIC - APP.JS (VERIFIED GROUP RENDERING)
 */

// ==========================================
//  *** REPLACE THIS WITH YOUR CLOUDFLARE WORKER URL ***
// ==========================================
const API_BASE = "https://flask-manager.ferhathamza17.workers.dev";
// ==========================================

// --- LOCATION GROUPING MAP (Corrected Order for Display) ---
const GROUP_MAPPING = {
    'BAILICHE MAZOUZ': [
        'Polyclinique bailiche mazouz', 
        'Center de sante elmoudjahidine', 
        'Equip mobile 1'
    ],
    'VIEUX KSAR': [
        'Polyclinique vieux ksar', 
        'Equip mobile 2', 
        'Center de sante chikh ameur'
    ]
};

// --- GLOBAL STATE ---
let state = {
    user: null,
    demographics: {},
    locations: [],
    inventory: []
};

// --- AUTHENTICATION & INITIALIZATION (No changes) ---

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

// --- USER & ADMIN LOGIC (Omitted for brevity, assumed correct) ---

function setupUserView() {
    const locId = state.user.location_id;
    const loc = state.locations.find(l => l.id === locId);
    document.getElementById('user-location-label').innerText = loc ? loc.name : 'Lieu Inconnu';
    document.getElementById('inv-date').valueAsDate = new Date();

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


// --- CORE REPORTING FUNCTIONS ---

function calculateGroupTotals(locationNames) {
    let totals = { N: 0, O: 0, Q: 0, R: 0 };
    
    // Find IDs corresponding to names
    const locationIds = state.locations
        .filter(loc => locationNames.includes(loc.name))
        .map(loc => loc.id);

    // Sum inventory data for those IDs
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

/**
 * Renders an individual location row.
 */
function renderLocationRow(locName, isGroupMember) {
    const loc = state.locations.find(l => l.name === locName);
    if (!loc) return '';
    
    const data = state.inventory.find(i => i.location_id === loc.id) || {};
    const N = data.total_N || 0; const O = data.total_O || 0;
    const Q = data.total_Q || 0; const R = data.total_R || 0;
    
    const { usable, loss } = calculateKPIs({N, O, Q, R});

    // Added border-b-2 to separate detail groups better
    return `
        <tr class="hover:bg-gray-100 border-b ${isGroupMember ? 'bg-gray-50' : ''}">
            <td class="px-6 py-3 font-medium ${isGroupMember ? 'pl-10 text-gray-700' : ''}">${loc.name} <span class="text-xs text-gray-400 block">${loc.type}</span></td>
            <td class="px-6 py-3 text-center font-bold">${N}</td>
            <td class="px-6 py-3 text-center">${O}</td>
            <td class="px-6 py-3 text-center text-red-500">${Q}</td>
            <td class="px-6 py-3 text-center text-red-500">${R}</td>
            <td class="px-6 py-3 text-center font-bold bg-blue-50">${usable}</td>
            <td class="px-6 py-3 text-center font-bold bg-yellow-50">${loss}</td>
        </tr>
    `;
}


function renderReportTable() {
    const tbody = document.getElementById('report-body');
    const tfooter = document.getElementById('report-footer');
    tbody.innerHTML = '';
    
    let tN=0, tO=0, tQ=0, tR=0;
    const renderedLocations = []; 
    let htmlContent = ''; 

    // --- 1. RENDER GROUPS (TOTAL followed by DETAILS) ---
    // The order of iteration here determines the order in the report (BAILICHE MAZOUZ then VIEUX KSAR)
    for (const groupName in GROUP_MAPPING) {
        const locationNames = GROUP_MAPPING[groupName];
        const groupTotals = calculateGroupTotals(locationNames);
        const { usable, loss } = calculateKPIs(groupTotals);

        // Add group totals to the grand totals
        tN += groupTotals.N; tO += groupTotals.O; tQ += groupTotals.Q; tR += groupTotals.R;
        
        // Mark locations as rendered
        renderedLocations.push(...locationNames);

        // 1a. Render the Group Total row (The title/header)
        htmlContent += `
            <tr class="bg-blue-300 hover:bg-blue-400 font-black border-t-4 border-b-2 border-blue-500">
                <td class="px-6 py-3 text-blue-900">${groupName} (TOTAL)</td>
                <td class="px-6 py-3 text-center">${groupTotals.N}</td>
                <td class="px-6 py-3 text-center">${groupTotals.O}</td>
                <td class="px-6 py-3 text-center text-red-700">${groupTotals.Q}</td>
                <td class="px-6 py-3 text-center text-red-700">${groupTotals.R}</td>
                <td class="px-6 py-3 text-center bg-blue-400">${usable}</td>
                <td class="px-6 py-3 text-center bg-yellow-300">${loss}</td>
            </tr>
        `;
        
        // 1b. Render the individual locations inside the group (The details)
        locationNames.forEach(locName => {
            htmlContent += renderLocationRow(locName, true); 
        });
    }

    // --- 2. RENDER REMAINING LOCATIONS (if any, not belonging to a custom group) ---
    state.locations.forEach(loc => {
        // Only render if the location name is NOT in any of the custom groups
        if (renderedLocations.includes(loc.name)) return;

        const data = state.inventory.find(i => i.location_id === loc.id) || {};
        const N = data.total_N || 0; const O = data.total_O || 0;
        const Q = data.total_Q || 0; const R = data.total_R || 0;
        
        // Add individual totals to the grand totals
        tN += N; tO += O; tQ += Q; tR += R;

        htmlContent += renderLocationRow(loc.name, false);
    });

    tbody.innerHTML = htmlContent;

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

    // --- 4. UPDATE KPI CARDS (Coverage Rates) ---
    
    const target2_11m = state.demographics.cible_2_11m || 1;
    const target12_59m = state.demographics.cible_12_59m || 1; 
    const cible_totaltN = state.demographics.cible_total || 1; 
    const taux2_11m = ((cible_totaltN / tN) * 100).toFixed(2);
    //const taux2_11m = ((tN / target2_11m) * 100).toFixed(2);
    const taux12_59m = ((tN / target12_59m) * 100).toFixed(2);
    
    const overallTarget = parseInt(target2_11m) + parseInt(target12_59m);

    document.getElementById('kpi-target').innerText = overallTarget.toLocaleString();
    document.getElementById('kpi-n').innerText = tN.toLocaleString();
    document.getElementById('kpi-taux-2-11m').innerText = taux2_11m + '%';
    document.getElementById('kpi-taux-12-59m').innerText = taux12_59m + '%';
    document.getElementById('kpi-loss').innerText = tLoss;
}
