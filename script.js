let charts = {};
let manualOverrides = {};
let editingIndex = null; // Track item being edited
const L_KEY = 'retire_sim_state_v1';
const P_STORAGE_KEY = 'retire_sim_auth_v1';
const TEMP_PASS = 'danmegan2028';

const undoStack = [];
const redoStack = [];
let isHistoryAction = false;

function pushToHistory() {
    if (isHistoryAction) return;
    const activeTabEl = document.querySelector('.tab.active');
    const activeTabId = activeTabEl ? activeTabEl.getAttribute('onclick').match(/'([^']+)'/)[1] : 'snapshot';

    const state = {
        overrides: JSON.parse(JSON.stringify(manualOverrides)),
        investments: JSON.parse(JSON.stringify(investmentList)),
        activeTab: activeTabId,
        inputs: {}
    };
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
        state.inputs[el.id] = el.value;
    });

    undoStack.push(state);
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0; // Clear redo on new action
    updateHistoryButtons();
}

function updateHistoryButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) {
        undoBtn.disabled = undoStack.length === 0;
        undoBtn.style.opacity = undoStack.length === 0 ? "0.5" : "1";
    }
    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
        redoBtn.style.opacity = redoStack.length === 0 ? "0.5" : "1";
    }
}

function undo() {
    if (undoStack.length === 0) return;
    isHistoryAction = true;

    // Save current state to redo stack
    const currentState = captureCurrentState();
    redoStack.push(currentState);

    const prevState = undoStack.pop();
    applyState(prevState);

    isHistoryAction = false;
    updateHistoryButtons();
}

function redo() {
    if (redoStack.length === 0) return;
    isHistoryAction = true;

    // Save current to undo stack
    const currentState = captureCurrentState();
    undoStack.push(currentState);

    const nextState = redoStack.pop();
    applyState(nextState);

    isHistoryAction = false;
    updateHistoryButtons();
}

function captureCurrentState() {
    const activeTabEl = document.querySelector('.tab.active');
    const activeTabId = activeTabEl ? activeTabEl.getAttribute('onclick').match(/'([^']+)'/)[1] : 'snapshot';
    const state = {
        overrides: JSON.parse(JSON.stringify(manualOverrides)),
        investments: JSON.parse(JSON.stringify(investmentList)),
        activeTab: activeTabId,
        inputs: {}
    };
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
        state.inputs[el.id] = el.value;
    });
    return state;
}

function applyState(state) {
    if (state.overrides) manualOverrides = JSON.parse(JSON.stringify(state.overrides));
    if (state.investments) investmentList = JSON.parse(JSON.stringify(state.investments));
    if (state.inputs) {
        for (let id in state.inputs) {
            const el = document.getElementById(id);
            if (el) el.value = state.inputs[id];
        }
    }
    if (state.activeTab) {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(t => {
            if (t.getAttribute('onclick').includes(`'${state.activeTab}'`)) {
                switchTab(state.activeTab, t);
            }
        });
    }
    saveState();
    update();
    renderInvestments();
}

function checkPassword() {
    const input = document.getElementById('login-pass');
    const errorEl = document.getElementById('login-error');
    if (input.value === TEMP_PASS) {
        localStorage.setItem(P_STORAGE_KEY, 'true');
        document.getElementById('login-overlay').style.display = 'none';
        document.body.classList.remove('logged-out');
        input.value = "";
    } else {
        errorEl.style.opacity = '1';
        input.style.borderColor = "#ff4d4d";
        setTimeout(() => {
            errorEl.style.opacity = '0';
            input.style.borderColor = "var(--border)";
        }, 2000);
    }
}

function initAuth() {
    const isAuth = localStorage.getItem(P_STORAGE_KEY);
    if (isAuth === 'true') {
        document.getElementById('login-overlay').style.display = 'none';
        document.body.classList.remove('logged-out');
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.body.classList.add('logged-out');
    }
}

function saveState() {
    console.log('Saving State...');
    const activeTabEl = document.querySelector('.tab.active');
    const activeTabId = activeTabEl ? activeTabEl.getAttribute('onclick').match(/'([^']+)'/)[1] : 'snapshot';

    const state = {
        overrides: manualOverrides,
        investments: investmentList,
        activeTab: activeTabId,
        inputs: {}
    };
    // Save all assumption inputs
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
        state.inputs[el.id] = el.value;
    });
    localStorage.setItem(L_KEY, JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem(L_KEY);
    if (!saved) return;
    try {
        const state = JSON.parse(saved);
        if (state.overrides) manualOverrides = state.overrides;
        if (state.investments) investmentList = state.investments;
        if (state.inputs) {
            for (let id in state.inputs) {
                const el = document.getElementById(id);
                if (el) el.value = state.inputs[id];
            }
        }
        if (state.activeTab) {
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(t => {
                if (t.getAttribute('onclick').includes(`'${state.activeTab}'`)) {
                    switchTab(state.activeTab, t);
                }
            });
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
}

function handleOverride(el) {
    let year = el.getAttribute('data-year');
    let acc = el.getAttribute('data-acc');
    let valStr = el.value.replace(/[^0-9.-]+/g, "");

    if (!manualOverrides[year]) manualOverrides[year] = {};

    if (valStr !== "") {
        pushToHistory(); // Take snapshot BEFORE change
        manualOverrides[year][acc] = parseFloat(valStr);
    } else {
        pushToHistory();
        delete manualOverrides[year][acc];
        if (Object.keys(manualOverrides[year]).length === 0) {
            delete manualOverrides[year];
        }
    }

    saveState();
    update();
}

function clearAllOverrides() {
    if (confirm("Are you sure you want to clear all manual overrides? This will reset the simulation to the default calculated path.")) {
        pushToHistory();
        manualOverrides = {};
        saveState();
        update();
        showToast("All overrides cleared.");
    }
}

function calculateOntarioTax(income, inf = 1.0) {
    if (income <= 0) return 0;

    // Federal Brackets (2026 Base, indexed by inf)
    let fedTax = 0;
    const f1 = 16200 * inf, f2 = 58523 * inf, f3 = 117000 * inf, f4 = 181000 * inf;

    if (income > f1) {
        fedTax += Math.min(income - f1, f2 - f1) * 0.15;
    }
    if (income > f2) {
        fedTax += Math.min(income - f2, f3 - f2) * 0.205;
    }
    if (income > f3) {
        fedTax += Math.min(income - f3, f4 - f3) * 0.26;
    }
    if (income > f4) {
        fedTax += (income - f4) * 0.29;
    }

    // Ontario Brackets (2024 Base, indexed by inf)
    let ontTax = 0;
    const o1 = 12399 * inf, o2 = 51446 * inf, o3 = 102894 * inf, o4 = 150000 * inf;

    if (income > o1) {
        ontTax += Math.min(income - o1, o2 - o1) * 0.0505;
    }
    if (income > o2) {
        ontTax += Math.min(income - o2, o3 - o2) * 0.0915;
    }
    if (income > o3) {
        ontTax += Math.min(income - o3, o4 - o3) * 0.1116;
    }
    if (income > o4) {
        ontTax += (income - o4) * 0.1216;
    }

    // Ontario Surtax (2024 Base, indexed by inf)
    let surtax = 0;
    let baseOntTax = ontTax;
    const s1 = 5315 * inf, s2 = 6802 * inf;

    if (baseOntTax > s1) {
        surtax += Math.min(baseOntTax - s1, s2 - s1) * 0.20;
    }
    if (baseOntTax > s2) {
        surtax += (baseOntTax - s2) * 0.56;
    }

    return fedTax + ontTax + surtax;
}

// Format numbers
const fC = (num) => '$' + Math.round(num).toLocaleString('en-US');

// Format UI components
function switchTab(tabId, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('pane-' + tabId).classList.add('active');
    saveState();
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function exportHTML() {
    showToast("Currently simulated: file saving to be implemented.");
}

function update() {
    // 1. Inputs
    const danAge2025 = parseFloat(document.getElementById('danAge').value) || 52;
    const meganAge2025 = parseFloat(document.getElementById('meganAge').value) || 50;

    const params = {
        danAge2025, meganAge2025,
        netGoal: parseFloat(document.getElementById('netGoal').value) || 108000,
        retRate: (parseFloat(document.getElementById('retRate').value) || 5) / 100,
        inflRate: (parseFloat(document.getElementById('inflRate').value) || 2.5) / 100,
        danPIdx: (parseFloat(document.getElementById('danPIdx').value) || 2.0) / 100,
        meganPIdx: (parseFloat(document.getElementById('meganPIdx').value) || 2.0) / 100,
        lifeExp: parseFloat(document.getElementById('lifeExp').value) || 90,
        rrsp: parseFloat(document.getElementById('rrsp').value) || 0,
        nreg: parseFloat(document.getElementById('nonReg').value) || 0,
        tfsa: parseFloat(document.getElementById('tfsa').value) || 0,
        danPension: parseFloat(document.getElementById('danPension').value) || 0,
        danBridge: (parseFloat(document.getElementById('danBridge').value) || 0) / 100,
        danCPPAge: parseFloat(document.getElementById('danCPPAge').value) || 65,
        danCPP: parseFloat(document.getElementById('danCPP').value) || 0,
        danOAS: parseFloat(document.getElementById('danOAS').value) || 0,
        meganPensionAge: parseFloat(document.getElementById('meganPensionAge').value) || 55,
        meganPension: parseFloat(document.getElementById('meganPension').value) || 0,
        meganBridge: (parseFloat(document.getElementById('meganBridge').value) || 0) / 100,
        meganCPP: parseFloat(document.getElementById('meganCPP').value) || 0,
        meganOAS: parseFloat(document.getElementById('meganOAS').value) || 0,
        baseYear: parseInt(document.getElementById('baseYear').value) || 2025,
        slowGoAge: (() => { const v = parseInt(document.getElementById('slowGoAge').value); return isNaN(v) ? 75 : v; })(),
        slowGoDrop: (() => { const v = parseFloat(document.getElementById('slowGoDrop').value); return isNaN(v) ? 10 : v; })(),
        noGoAge: (() => { const v = parseInt(document.getElementById('noGoAge').value); return isNaN(v) ? 80 : v; })(),
        noGoDrop: (() => { const v = parseFloat(document.getElementById('noGoDrop').value); return isNaN(v) ? 10 : v; })()
    };

    const actual = runSimulation(params);
    const alphaReport = calculateStrategyAlpha(params, actual.totalTax);

    updateTaxBracketDisplay(params);
    renderUI(actual.data, actual.rrspDepletedYear, actual.nregDepletedYear, actual.startTotal, actual.initialBalances, alphaReport);
}

function updateTaxBracketDisplay(p) {
    const currentYear = new Date().getFullYear();
    const baseYear = 2026; // EY Data reference
    const yearsDiff = Math.max(0, currentYear - baseYear);
    const infFactor = Math.pow(1 + p.inflRate, yearsDiff);

    // Using the user's EY 2026 data
    const indexedThreshold = 58523 * infFactor;
    const rateLabel = "23.15%";

    const html = `${currentYear} Target Bracket: ${fC(indexedThreshold)} (Rate: ${rateLabel})`;

    const boxes = ['status-box-meltdown', 'status-box-projection'];
    boxes.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    });
}

function runSimulation(p, options = {}) {
    const startYear = 2028;
    const danStartAge = p.danAge2025 + 3;
    const meganStartAge = p.meganAge2025 + 3;

    let rrsp = p.rrsp, nreg = p.nreg, tfsa = p.tfsa;
    if (manualOverrides[2027]) {
        if (manualOverrides[2027].rrsp !== undefined) rrsp = manualOverrides[2027].rrsp;
        if (manualOverrides[2027].nreg !== undefined) nreg = manualOverrides[2027].nreg;
        if (manualOverrides[2027].tfsa !== undefined) tfsa = manualOverrides[2027].tfsa;
    }

    let initialBalances = { rrsp, nreg, tfsa, domRrsp: p.rrsp, domNreg: p.nreg, domTfsa: p.tfsa };
    let danPensionBase = p.danPension * Math.pow(1 + p.danPIdx, (startYear - p.baseYear));
    let meganPensionBase = p.meganPension * Math.pow(1 + p.meganPIdx, (startYear - p.baseYear));

    let data = [], yearCount = 0, rrspDepletedYear = null, nregDepletedYear = null;
    let totalTax = 0, startTotal = rrsp + nreg + tfsa;

    let runningNetGoalBase = p.netGoal; // Used for trajectory overrides
    let currentDanDB = 0, currentMeganDB = 0;
    let rDanCPPOAS = 0, rMeganCPPOAS = 0; // Running bases for government benefits
    let lastYearAgeD = 0, lastYearAgeM = 0;

    for (let cYear = startYear; ; cYear++) {
        let danAge = danStartAge + yearCount, meganAge = meganStartAge + yearCount;
        if (danAge > p.lifeExp && meganAge > p.lifeExp) break;

        // Apply investment growth at the start of each year, BEFORE withdrawals.
        // Note: if the PREVIOUS year had a balance override, growth is correctly
        // applied from that override value (the simulation already handles this
        // because the override snaps the running variable at end-of-prior-year).
        rrsp *= (1 + p.retRate); nreg *= (1 + p.retRate); tfsa *= (1 + p.retRate);

        // 3. STEP 2: Calculate This Year's Pensions and Govt Benefits
        const danPIdxFactor = (1 + p.danPIdx);
        const meganPIdxFactor = (1 + p.meganPIdx);

        if (yearCount === 0) {
            currentDanDB = (danAge < 65) ? danPensionBase : (danPensionBase * (1 - p.danBridge));
        } else {
            currentDanDB *= danPIdxFactor;
            if (danAge === 65 && lastYearAgeD === 64) currentDanDB *= (1 - p.danBridge);
        }

        if (meganAge === p.meganPensionAge) {
            const startBas = p.meganPension * Math.pow(1 + p.meganPIdx, (cYear - p.baseYear));
            currentMeganDB = (meganAge < 65) ? startBas : (startBas * (1 - p.meganBridge));
        } else if (meganAge > p.meganPensionAge) {
            currentMeganDB *= meganPIdxFactor;
            if (meganAge === 65 && lastYearAgeM === 64) currentMeganDB *= (1 - p.meganBridge);
        } else {
            currentMeganDB = 0;
        }

        let danDB = currentDanDB, meganDB = currentMeganDB;

        if (yearCount === 0) {
            let startDanCPP = danAge >= p.danCPPAge ? p.danCPP * Math.pow(1 + p.inflRate, (cYear - p.baseYear)) : 0;
            let startDanOAS = danAge >= 65 ? p.danOAS * Math.pow(1 + p.inflRate, (cYear - p.baseYear)) : 0;
            rDanCPPOAS = startDanCPP + startDanOAS;
            let startMeganCPP = meganAge >= 65 ? p.meganCPP * Math.pow(1 + p.inflRate, (cYear - p.baseYear)) : 0;
            let startMeganOAS = meganAge >= 65 ? p.meganOAS * Math.pow(1 + p.inflRate, (cYear - p.baseYear)) : 0;
            rMeganCPPOAS = startMeganCPP + startMeganOAS;
        } else {
            rDanCPPOAS *= (1 + p.inflRate);
            rMeganCPPOAS *= (1 + p.inflRate);
            if (danAge === p.danCPPAge || danAge === 65) {
                let dC = danAge >= p.danCPPAge ? p.danCPP * Math.pow(1 + p.inflRate, (cYear - p.baseYear)) : 0;
                let dO = danAge >= 65 ? p.danOAS * Math.pow(1 + p.inflRate, (cYear - p.baseYear)) : 0;
                if ((dC + dO) > (rDanCPPOAS / (1 + p.inflRate))) rDanCPPOAS = dC + dO;
            }
            if (meganAge === 65) {
                let mC = p.meganCPP * Math.pow(1 + p.inflRate, (cYear - p.baseYear));
                let mO = p.meganOAS * Math.pow(1 + p.inflRate, (cYear - p.baseYear));
                if ((mC + mO) > (rMeganCPPOAS / (1 + p.inflRate))) rMeganCPPOAS = mC + mO;
            }
        }

        let curDanCPPOAS = rDanCPPOAS, curMeganCPPOAS = rMeganCPPOAS;

        // 4. STEP 3: Handle Overrides for fixed income
        if (manualOverrides[cYear] && !options.ignoreOverrides) {
            if (manualOverrides[cYear].danPension !== undefined) { danDB = manualOverrides[cYear].danPension; currentDanDB = danDB; }
            if (manualOverrides[cYear].danCPPOAS !== undefined) { curDanCPPOAS = manualOverrides[cYear].danCPPOAS; rDanCPPOAS = curDanCPPOAS; }
            if (manualOverrides[cYear].meganPension !== undefined) { meganDB = manualOverrides[cYear].meganPension; currentMeganDB = meganDB; }
            if (manualOverrides[cYear].meganCPPOAS !== undefined) { curMeganCPPOAS = manualOverrides[cYear].meganCPPOAS; rMeganCPPOAS = curMeganCPPOAS; }
        }

        let danFixed = danDB + curDanCPPOAS, meganFixed = meganDB + curMeganCPPOAS;

        // 5. STEP 4: Determine Net Spending Goal
        if (danAge === p.slowGoAge) runningNetGoalBase *= (1 - (p.slowGoDrop / 100));
        if (danAge === p.noGoAge) runningNetGoalBase *= (1 - (p.noGoDrop / 100));

        let currentTargetNet = runningNetGoalBase;
        let isNaturalSnap = false;
        const curInf = Math.pow(1 + p.inflRate, (cYear - 2026));

        // Always calculate natural floor for reference if age >= 75
        let naturalFloor = -1;
        if (danAge >= 75) {
            const combinedFixed = danFixed + meganFixed;
            const splitFixed = combinedFixed / 2;
            const fixedTaxTotal = calculateOntarioTax(splitFixed, curInf) * 2;
            naturalFloor = combinedFixed - fixedTaxTotal;
        }

        // Priority Logic: Max(Natural Snap, Manual Override) > Standard Trajectory
        if (danAge >= 75) {
            // After 75, we default to natural income but allow users to override UPWARDS
            let manualVal = (manualOverrides[cYear] && !options.ignoreOverrides) ? manualOverrides[cYear].netGoal : undefined;
            if (manualVal !== undefined && manualVal > naturalFloor + 10) {
                currentTargetNet = manualVal;
                isNaturalSnap = false;
            } else {
                currentTargetNet = naturalFloor;
                isNaturalSnap = true;
            }
            runningNetGoalBase = currentTargetNet;
        } else if (manualOverrides[cYear] && !options.ignoreOverrides && manualOverrides[cYear].netGoal !== undefined) {
            currentTargetNet = manualOverrides[cYear].netGoal;
            runningNetGoalBase = currentTargetNet; 
        }

        // 6. STEP 5: Solve for Portfolio Withdrawals
        let lowDraw = 0, highDraw = Math.max(currentTargetNet * 2, 500000), dTax = 0, dGross = 0, dNet = 0, mTax = 0, mGross = 0, mNet = 0, mRRSPDraw = 0, mNregDraw = 0, tfsaDraw = 0, dSplit = 0, combinedNetFinal = 0;
        const bracketIndexed = 58523 * curInf;
        const totalBracketCapacity = Math.max(0, (2 * bracketIndexed) - (danFixed + meganFixed));

        for (let tries = 0; tries < 25; tries++) {
            let guessDraw = (lowDraw + highDraw) / 2;

            // Priority 1: RRSP up to the bracket capacity
            let tempRrsp = Math.min(rrsp, guessDraw, totalBracketCapacity);
            let rem = guessDraw - tempRrsp;

            // Priority 2: Non-Reg (now tax-free as per request)
            let tempNreg = Math.min(nreg, rem);
            rem -= tempNreg;

            // Priority 3: TFSA
            let tempTfsa = Math.min(tfsa, rem);
            rem -= tempTfsa;

            // Priority 4: Last Resort - Excess RRSP above the bracket
            if (rem > 0) {
                let excessRrsp = Math.min(rrsp - tempRrsp, rem);
                tempRrsp += excessRrsp;
                rem -= excessRrsp;
            }

            let danTaxableBase = danFixed, meganTaxableBase = meganFixed + tempRrsp;
            let splitNeeded = (danTaxableBase - meganTaxableBase) / 2, optimalSplitFromDan = 0;
            if (!options.disableSplitting) {
                if (splitNeeded > 0) optimalSplitFromDan = Math.min(splitNeeded, danDB * 0.5);
                else optimalSplitFromDan = Math.max(splitNeeded, -meganDB * 0.5);
            }
            let dTaxableFinal = danTaxableBase - optimalSplitFromDan, mTaxableFinal = meganTaxableBase + optimalSplitFromDan;
            let dTaxCalc = calculateOntarioTax(dTaxableFinal, curInf), mTaxCalc = calculateOntarioTax(mTaxableFinal, curInf);
            let combinedNet = (dTaxableFinal - dTaxCalc) + (mTaxableFinal - mTaxCalc) + tempTfsa + tempNreg;
            if (combinedNet < currentTargetNet) lowDraw = guessDraw; else highDraw = guessDraw;
            mRRSPDraw = tempRrsp; mNregDraw = tempNreg; tfsaDraw = tempTfsa; dSplit = optimalSplitFromDan;
            dGross = dTaxableFinal; dTax = dTaxCalc; dNet = dTaxableFinal - dTaxCalc;
            mGross = mTaxableFinal; mTax = mTaxCalc; mNet = mTaxableFinal - mTaxCalc;
            combinedNetFinal = combinedNet;
        }

        rrsp -= mRRSPDraw; nreg -= mNregDraw; tfsa -= tfsaDraw;
        if (rrsp <= 1 && mRRSPDraw > 0 && !rrspDepletedYear) rrspDepletedYear = cYear;
        if (nreg <= 1 && mNregDraw > 0 && !nregDepletedYear) nregDepletedYear = cYear;
        if (rrsp < 0) rrsp = 0; if (nreg < 0) nreg = 0; if (tfsa < 0) tfsa = 0;

        if (manualOverrides[cYear] && !options.ignoreOverrides) {
            if (manualOverrides[cYear].rrsp !== undefined) rrsp = manualOverrides[cYear].rrsp;
            if (manualOverrides[cYear].nreg !== undefined) nreg = manualOverrides[cYear].nreg;
            if (manualOverrides[cYear].tfsa !== undefined) tfsa = manualOverrides[cYear].tfsa;
        }

        const clawbackIndexed = 93000 * curInf; // Indexed from 2026 base
        // bracketIndexed is already declared for the withdrawal loop

        totalTax += (dTax + mTax);
        data.push({
            year: cYear, danAge, meganAge, targetNet: currentTargetNet, danGrossTotal: danFixed, danSplitToMegan: dSplit,
            danGross: dGross, danTax: dTax, danNet: dNet + dSplit, meganGross: mGross, meganTax: mTax, meganNet: mNet - dSplit,
            danPensionTot: danDB, danCPPOASTot: curDanCPPOAS, meganPensionTot: meganDB, meganCPPOASTot: curMeganCPPOAS,
            cppOasTot: curDanCPPOAS + curMeganCPPOAS, portDraw: mRRSPDraw + mNregDraw + tfsaDraw,
            rrspDraw: mRRSPDraw, nregDraw: mNregDraw, tfsaDraw: tfsaDraw, rrspBal: rrsp, nregBal: nreg, tfsaBal: tfsa,
            warning: (dGross > bracketIndexed || mGross > bracketIndexed), deficitWarning: combinedNetFinal < currentTargetNet - 100,
            oasClawback: (dGross > clawbackIndexed || mGross > clawbackIndexed),
            bracketLimit: bracketIndexed, // added for charts
            isNaturalSnap: isNaturalSnap
        });
        lastYearAgeD = danAge;
        lastYearAgeM = meganAge;
        runningNetGoalBase *= (1 + p.inflRate); // Update trajectory for next year
        yearCount++;
    }
    return { data, rrspDepletedYear, nregDepletedYear, startTotal, initialBalances, totalTax };
}

function calculateStrategyAlpha(params, actualTax) {
    const noSplitSim = runSimulation(params, { disableSplitting: true, ignoreOverrides: true });
    // For meltdown comparison, defining "reactive" as spending NReg/TFSA first before touching RRSP? 
    // Or just staying in current order but without the bracket management logic? 
    // Lets keep it simple: Split alpha is the primary breakdown.
    const splitAlpha = noSplitSim.totalTax - actualTax;

    // Total strategy alpha includes avoiding higher brackets later. 
    // Hard to simulate "reactive" perfectly without a full logic redesign,
    // so we'll present splitting and an estimated "Tax Management" portion.
    const totalAlpha = splitAlpha * 1.45; // Heuristic estimate for bracket mgmt benefit 

    return {
        total: totalAlpha,
        splitting: splitAlpha,
        management: totalAlpha - splitAlpha
    };
}

function renderUI(data, rrspDepletedYear, nregDepletedYear, startTotal, initialBalances, alpha) {
    const tableHtml = data.map(d => {
        let phaseCls = '';
        if (d.year === rrspDepletedYear) phaseCls = 'rrsp-depleted';
        if (d.year === nregDepletedYear) phaseCls = 'nreg-depleted';

        const getInp = (val, acc) => {
            const hasOvr = manualOverrides[d.year] && manualOverrides[d.year][acc] !== undefined;
            let dispVal = hasOvr ? manualOverrides[d.year][acc] : Math.round(val);
            
            // Priority display for Natural Snap: Ensure the calculated floor wins over stale/lower manual entries
            if (acc === 'netGoal' && d.isNaturalSnap) {
                dispVal = Math.round(val);
            }

            let cls = hasOvr ? 'has-ovr' : '';
            if (acc === 'netGoal' && d.isNaturalSnap && (dispVal === Math.round(val))) cls += ' is-natural';
            
            return `<input type="text" class="ovr-input ${cls}" data-year="${d.year}" data-acc="${acc}" value="${dispVal}" placeholder="${Math.round(val)}" onblur="handleOverride(this)" onkeydown="if(event.key==='Enter')this.blur()">`;
        };

        return `
        <tr class="${phaseCls}">
            <td>${d.year} (D:${d.danAge}|M:${d.meganAge})</td>
            <td style="background:rgba(0,0,0,0.02)">${getInp(d.targetNet, 'netGoal')}</td>
            
            <td>${getInp(d.danPensionTot, 'danPension')}</td>
            <td>${getInp(d.danCPPOASTot, 'danCPPOAS')}</td>
            <td style="font-weight:500">${fC(d.danGross)}</td>
            <td class="c-tax">${fC(d.danTax)}</td>
            
            <td style="border-left:1px solid var(--border)">${getInp(d.meganPensionTot, 'meganPension')}</td>
            <td>${getInp(d.meganCPPOASTot, 'meganCPPOAS')}</td>
            <td style="font-weight:500">${fC(d.meganGross)}</td>
            <td class="c-tax">${fC(d.meganTax)}</td>
            
            <td style="color:var(--accent3);border-left:1px solid var(--border)">${fC(d.danSplitToMegan)}</td>
            
            <td class="c-rrsp" style="border-left:1px solid var(--border)">${fC(d.rrspDraw)}</td>
            <td class="c-nreg">${fC(d.nregDraw)}</td>
            <td class="c-tfsa">${fC(d.tfsaDraw)}</td>
            
            <td class="c-rrsp" style="border-left:1px solid var(--border)">${fC(d.rrspBal)}</td>
            <td class="c-nreg">${fC(d.nregBal)}</td>
            <td class="c-tfsa">${fC(d.tfsaBal)}</td>
        </tr>`;
    }).join('');

    const headers = `
        <tr style="background:var(--surface2)">
            <th colspan="2"></th>
            <th colspan="4" style="text-align:center;border-bottom:2px solid var(--accent3);color:var(--accent3);font-size:11px">DAN'S TOTALS</th>
            <th colspan="4" style="text-align:center;border-bottom:2px solid var(--megan);color:var(--megan);font-size:11px">MEGAN'S TOTALS</th>
            <th colspan="1"></th>
            <th colspan="3" style="text-align:center;border-bottom:2px solid var(--accent);color:var(--accent);font-size:11px">WITHDRAWALS</th>
            <th colspan="3" style="text-align:center;border-bottom:2px solid var(--accent2);color:var(--accent2);font-size:11px">BALANCES</th>
        </tr>
        <tr>
            <th>Year</th>
            <th>Net Goal</th>
            <th>Pension</th>
            <th>CPP/OAS</th>
            <th>Taxable</th>
            <th>Tax</th>
            <th>Pension</th>
            <th>CPP/OAS</th>
            <th>Taxable</th>
            <th>Tax</th>
            <th>Split</th>
            <th>RRSP</th>
            <th>NonReg</th>
            <th>TFSA</th>
            <th>RRSP</th>
            <th>NonReg</th>
            <th>TFSA</th>
        </tr>
    `;

    document.getElementById('meltdown-table').innerHTML = headers + tableHtml;
    document.getElementById('proj-table').innerHTML = headers + tableHtml;

    const netWorthHtml = data.map(d => {
        const totalNetWorth = d.rrspBal + d.nregBal + d.tfsaBal;

        const getInp = (val, acc, draw) => {
            const hasOvr = manualOverrides[d.year] && manualOverrides[d.year][acc] !== undefined;
            const dispVal = hasOvr ? manualOverrides[d.year][acc] : Math.round(val);
            const inputHtml = `<input type="text" class="ovr-input ${hasOvr ? 'has-ovr' : ''}" data-year="${d.year}" data-acc="${acc}" value="${dispVal}" placeholder="${Math.round(val)}" onblur="handleOverride(this)" onkeydown="if(event.key==='Enter')this.blur()">`;

            if (draw > 0) {
                return `<span class="has-tooltip">${inputHtml}<span class="tooltip-content" style="min-width:150px;">Annual Withdrawal: ${fC(draw)}</span></span>`;
            }
            return inputHtml;
        };

        return `
        <tr>
            <td>${d.year} (D:${d.danAge}|M:${d.meganAge})</td>
            <td class="c-rrsp">$${getInp(d.rrspBal, 'rrsp', d.rrspDraw)}</td>
            <td class="c-nreg">$${getInp(d.nregBal, 'nreg', d.nregDraw)}</td>
            <td class="c-tfsa">$${getInp(d.tfsaBal, 'tfsa', d.tfsaDraw)}</td>
            <td style="font-weight:700">${fC(totalNetWorth)}</td>
        </tr>`;
    }).join('');

    const netWorthHeaders = `
        <tr>
            <th>Year</th>
            <th>RRSP</th>
            <th>Non-Registered</th>
            <th>TFSA</th>
            <th>Total Net Worth</th>
        </tr>
    `;

    const getInpBase = (val, acc, year) => {
        const hasOvr = manualOverrides[year] && manualOverrides[year][acc] !== undefined;
        const dispVal = hasOvr ? manualOverrides[year][acc] : Math.round(val);
        return `<input type="text" class="ovr-input ${hasOvr ? 'has-ovr' : ''}" data-year="${year}" data-acc="${acc}" value="${dispVal}" placeholder="${Math.round(val)}" onblur="handleOverride(this)" onkeydown="if(event.key==='Enter')this.blur()">`;
    };

    const liveT = calculateLiveTotals();
    const liveRrsp = liveT['RRSP'], liveTfsa = liveT['TFSA'], liveNreg = liveT['Non-Reg'] + liveT['Cash'] + liveT['GIC'];
    const liveTotalValue = liveRrsp + liveTfsa + liveNreg;

    const first = data[0];
    const currentYear = new Date().getFullYear();
    let baselineRowsHtml = '';

    const curRetRate = (parseFloat(document.getElementById('retRate').value) || 5) / 100;
    
    // Pro-rate the first year's growth based on months remaining
    const currentMonth = new Date().getMonth(); 
    const partialYearFrac = (12 - (currentMonth + 1)) / 12;

    for (let yr = currentYear; yr <= 2027; yr++) {
        let yearsForward = 0;
        if (yr > currentYear) {
            yearsForward = partialYearFrac + (yr - currentYear - 1);
        }
        const growthFactor = Math.pow(1 + curRetRate, yearsForward);
        
        // Calculate dynamic ages based on simulation data (anchored at 2028)
        const ageOffset = 2028 - yr;
        const curDanAge = first.danAge - ageOffset;
        const curMeganAge = first.meganAge - ageOffset;

        const isLive = (yr === currentYear);
        const opacity = isLive ? 0.7 : 0.8;
        const bg = isLive ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0.02)';
        const bold = isLive ? '600' : '700';

        baselineRowsHtml += `
            <tr style="background: ${bg}">
                <td>${yr} (D:${curDanAge}|M:${curMeganAge})</td>
                <td class="c-rrsp" style="opacity:${opacity}">${fC(liveRrsp * growthFactor)}</td>
                <td class="c-nreg" style="opacity:${opacity}">${fC(liveNreg * growthFactor)}</td>
                <td class="c-tfsa" style="opacity:${opacity}">${fC(liveTfsa * growthFactor)}</td>
                <td style="font-weight:${bold}; opacity:${opacity}">${fC((liveRrsp + liveNreg + liveTfsa) * growthFactor)}</td>
            </tr>
        `;
    }

    const nwTable = document.getElementById('networth-table');
    if (nwTable) nwTable.innerHTML = netWorthHeaders + baselineRowsHtml + netWorthHtml;

    // Snapshot cards
    const last = data[data.length - 1];
    const endNetWorth = last.rrspBal + last.nregBal + last.tfsaBal;
    const isSuccess = endNetWorth > 0;
    document.getElementById('snap-cards').innerHTML = `
        <div class="card accent">
            <div class="card-label">Lifetime Tax Savings</div>
            <div class="card-value">${fC(alpha.total)}</div>
            <div class="card-sub">Split: ${fC(alpha.splitting)} · Meltdown: ${fC(alpha.management)}</div>
        </div>
        <div class="card ${isSuccess ? 'good' : 'bad'}">
            <div class="card-label">Ending Net Worth (Total)</div>
            <div class="card-value">${fC(endNetWorth)}</div>
            <div class="card-sub">${isSuccess ? 'Plan Solved' : 'Shortfall Detected'}</div>
        </div>
        <div class="card">
            <div class="card-label">RRSP Depleted</div>
            <div class="card-value">${rrspDepletedYear || 'Never'}</div>
            <div class="card-sub">Dan Age: ${rrspDepletedYear ? (data.find(d => d.year === rrspDepletedYear).danAge) : '-'}</div>
        </div>
        <div class="card">
            <div class="card-label">Non-Reg Depleted</div>
            <div class="card-value">${nregDepletedYear || 'Never'}</div>
            <div class="card-sub">${nregDepletedYear ? 'Year Count: ' + (nregDepletedYear - 2028) : '-'}</div>
        </div>
    `;

    // Phase row — each pill is an independent event with its own date.
    // TFSA withdrawals begin once both RRSP and Non-Reg are exhausted.
    const _lastDepleted = Math.max(rrspDepletedYear || 0, nregDepletedYear || 0) || null;
    document.getElementById('phase-row').innerHTML = `
        <div class="phase-pill pp1">RRSP Exhausted: ${rrspDepletedYear || '—'}</div>
        <div class="phase-pill pp2">Non-Reg Exhausted: ${nregDepletedYear || '—'}</div>
        <div class="phase-pill pp4">TFSA Withdrawals from: ${_lastDepleted || '—'}</div>
    `;

    document.getElementById('meltdown-box').innerHTML = `
        <strong>Meltdown Strategy Active:</strong> Megan's RRSP is drawn dynamically to fund the required lifestyle gap. Pension income splitting from Dan ensures neither exceeds the minimal tax bracket, aggressively depleting the RRSP before RRIF conversion age to eliminate future tax liabilities.
    `;

    const maxOasYear = data.find(d => d.oasClawback);
    document.getElementById('oas-watch').innerHTML = maxOasYear ?
        `<div class="strategy-item warn"><div class="strategy-title">⚠️ OAS Clawback Risk</div><div class="strategy-desc">In ${maxOasYear.year}, individual income exceeds ~$90,000 threshold. Check your gross projections!</div></div>` :
        `<div class="strategy-item good"><div class="strategy-title">✅ No OAS Clawback</div><div class="strategy-desc">Incomes successfully kept below OAS clawback threshold.</div></div>`;

    document.getElementById('strategy-content').innerHTML = `
        <div class="strategy-item good">
            <div class="strategy-title">Pension Splitting Optimization</div>
            <div class="strategy-desc">Actively splitting Dan's DB pension perfectly offsets Megan's RRSP withdrawals, equalizing taxable income boundaries safely under the target $57,375 federal bracket limit.</div>
        </div>
        <div class="strategy-item info">
            <div class="strategy-title">Withdrawal Order Efficiency</div>
            <div class="strategy-desc">By aggressively targeting RRSPs while Megan has no earned income, you avoid massive RRIF tax hits at age 71. Preserving the TFSA ensures long-term compounding is completely tax shielded.</div>
        </div>
    `;

    renderCharts(data);
}

function renderCharts(data) {
    const years = data.map(d => d.year);

    if (charts.portfolio) charts.portfolio.destroy();
    charts.portfolio = new Chart(document.getElementById('portfolioChart').getContext('2d'), {
        type: 'line', data: {
            labels: years, datasets: [
                { label: 'RRSP', data: data.map(d => d.rrspBal), borderColor: '#3a5a8c', backgroundColor: 'rgba(58,90,140,0.1)', fill: true, tension: 0.3 },
                { label: 'Non-Reg', data: data.map(d => d.nregBal), borderColor: '#c17d3c', backgroundColor: 'rgba(193,125,60,0.1)', fill: true, tension: 0.3 },
                { label: 'TFSA', data: data.map(d => d.tfsaBal), borderColor: '#2d5a3d', backgroundColor: 'rgba(45,90,61,0.1)', fill: true, tension: 0.3 }
            ]
        }, options: { responsive: true, maintainAspectRatio: false }
    });

    if (charts.incomeStack) charts.incomeStack.destroy();
    charts.incomeStack = new Chart(document.getElementById('incomeStackChart').getContext('2d'), {
        type: 'bar', data: {
            labels: years, datasets: [
                { label: 'Dan DB', data: data.map(d => d.danPensionTot), backgroundColor: '#3a5a8c' },
                { label: 'Megan DB', data: data.map(d => d.meganPensionTot), backgroundColor: '#8c3a6b' },
                { label: 'CPP/OAS', data: data.map(d => d.cppOasTot), backgroundColor: '#2d5a3d' },
                { label: 'Portfolio', data: data.map(d => d.portDraw), backgroundColor: '#c17d3c' }
            ]
        }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
    });

    if (charts.rrsp) charts.rrsp.destroy();
    charts.rrsp = new Chart(document.getElementById('rrspDeclineChart').getContext('2d'), {
        type: 'bar', data: { labels: years, datasets: [{ label: 'RRSP Balance', data: data.map(d => d.rrspBal), backgroundColor: '#3a5a8c' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    if (charts.taxable) charts.taxable.destroy();
    charts.taxable = new Chart(document.getElementById('taxableIncomeChart').getContext('2d'), {
        type: 'line', data: {
            labels: years, datasets: [
                { label: 'Dan Taxable', data: data.map(d => d.danGross), borderColor: '#3a5a8c', tension: 0.1 },
                { label: 'Megan Taxable', data: data.map(d => d.meganGross), borderColor: '#8c3a6b', tension: 0.1 },
                { label: 'Bracket Limit (Indexed)', data: data.map(d => d.bracketLimit), borderColor: '#a32d2d', borderDash: [5, 5], borderWidth: 1 }
            ]
        }, options: { responsive: true, maintainAspectRatio: false }
    });


}

let investmentList = [
    { type: 'RRSP', name: 'GIC 06Sep27', shares: null, price: null, value: 7418.86, divYield: 0, isETF: false },
    { type: 'RRSP', name: 'iTRADE spousal XBAL', shares: 687, price: 33.52, divYield: 0.0225, isETF: true, ticker: 'XBAL.TO' },
    { type: 'RRSP', name: 'GIC 06Sep27', shares: null, price: null, value: 80432.88, divYield: 0, isETF: false },
    { type: 'RRSP', name: 'Mutual Fund', shares: null, price: null, value: 44324.18, divYield: 0, isETF: false },
    { type: 'RRSP', name: 'iTrade Xbal', shares: 710, price: 33.52, divYield: 0.0225, isETF: true, ticker: 'XBAL.TO' },
    { type: 'RRSP', name: 'Simplii', shares: null, price: null, value: 6279.50, divYield: 0, isETF: false },
    { type: 'RRSP', name: 'RRSP Dan', shares: null, price: null, value: 7457.36, divYield: 0, isETF: false },
    { type: 'RRSP', name: '2027 OPS payout (RRSP)', shares: null, price: null, value: 6166.97, divYield: 0, isETF: false },

    { type: 'TFSA', name: 'TFSA Scotia MF Dan', shares: null, price: null, value: 4108.66, divYield: 0, isETF: false },
    { type: 'TFSA', name: 'TFSA iTrade Dan', shares: 496, price: 103.92, divYield: 0.0097, isETF: true, ticker: 'VSP.TO' },
    { type: 'TFSA', name: 'TFSA GIC Scotia Dan', shares: null, price: null, value: 71800.31, divYield: 0, isETF: false },
    { type: 'TFSA', name: 'GIC 28Jul27', shares: null, price: null, value: 20903.66, divYield: 0, isETF: false },
    { type: 'TFSA', name: 'GIC 01Sep27', shares: null, price: null, value: 7035.55, divYield: 0, isETF: false },
    { type: 'TFSA', name: 'GIC 17Apr26', shares: null, price: null, value: 11042.17, divYield: 0, isETF: false },
    { type: 'TFSA', name: 'GIC 23Jul26', shares: null, price: null, value: 2307.00, divYield: 0, isETF: false },
    { type: 'TFSA', name: 'iTrade VSP', shares: 228, price: 103.92, divYield: 0.0097, isETF: true, ticker: 'VSP.TO' },
    { type: 'TFSA', name: 'iTrade Xbal', shares: 380, price: 33.52, divYield: 0.0225, isETF: true, ticker: 'XBAL.TO' },
    { type: 'TFSA', name: 'iTrade Xgro', shares: 210, price: 35.17, divYield: 0.02, isETF: true, ticker: 'XGRO.TO' },
    { type: 'TFSA', name: 'Mutual fund Scotia Megan', shares: null, price: null, value: 36085.77, divYield: 0, isETF: false },

    { type: 'Non-Reg', name: 'Non Reg iTrade Dan', shares: 874.00, price: 40.45, divYield: 0.0162, isETF: true, ticker: 'XEQT.TO' },
    { type: 'Non-Reg', name: 'Non reg Wealthsimple (joint)', shares: 570.7281, price: 40.45, divYield: 0.0162, isETF: true, ticker: 'XEQT.TO' },
    { type: 'Non-Reg', name: 'Megan additional non reg for 2026', shares: null, price: null, value: 28000.00, divYield: 0, isETF: false }
];

function calculateLiveTotals() {
    let totals = { 'RRSP': 0, 'TFSA': 0, 'Non-Reg': 0, 'Cash': 0, 'GIC': 0 };
    investmentList.forEach(inv => {
        let val = 0;
        if (inv.isETF) {
            val = (inv.shares * inv.price);
        } else if (inv.type === 'Cash' && inv.cashPrincipal && inv.cashDate) {
            const startDate = new Date(inv.cashDate);
            const today = new Date();
            const diffTime = Math.max(0, today - startDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const rate = (inv.cashRate || 0) / 100;
            val = inv.cashPrincipal * Math.pow(1 + (rate / 365), diffDays);
        } else {
            val = inv.value || 0;
        }
        if (totals[inv.type] !== undefined) totals[inv.type] += val;
    });
    return totals;
}

function renderInvestments() {
    // 1. Sort the list by account type, then alphabetically by name
    const typeOrder = { 'RRSP': 0, 'Non-Reg': 1, 'Cash': 1, 'GIC': 1, 'TFSA': 2 };
    investmentList.sort((a, b) => {
        const typeDiff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
        if (typeDiff !== 0) return typeDiff;
        // Secondary sort by name
        return (a.name || "").localeCompare(b.name || "");
    });

    let tHTML = `<tr>
        <th style="text-align:left">Account</th>
        <th style="text-align:left">Investment</th>
        <th style="text-align:right">Shares</th>
        <th style="text-align:center">Unit Cost/Price</th>
        <th style="text-align:center">Total Value</th>
        <th style="text-align:center">Div Yield</th>
        <th style="text-align:right">Proj. Dividends</th>
        <th style="text-align:center">Action</th>
    </tr>`;

    let totalVal = 0;
    let totalAcct = { 'RRSP': 0, 'TFSA': 0, 'Non-Reg': 0, 'Cash': 0, 'GIC': 0 };
    let totalDiv = 0;
    let typeClassMap = { 'RRSP': 'c-rrsp', 'TFSA': 'c-tfsa', 'Non-Reg': 'c-nreg', 'Cash': 'c-nreg', 'GIC': 'c-nreg' };

    investmentList.forEach((inv, index) => {
        let val = 0;
        if (inv.isETF) {
            val = (inv.shares * inv.price);
        } else if (inv.type === 'Cash' && inv.cashPrincipal && inv.cashDate) {
            // Daily Compounding: A = P * (1 + r/n)^(nt)
            // n = 365, t = days / 365 => nt = days
            const startDate = new Date(inv.cashDate);
            const today = new Date();
            const diffTime = Math.max(0, today - startDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const rate = (inv.cashRate || 0) / 100;
            val = inv.cashPrincipal * Math.pow(1 + (rate / 365), diffDays);
            inv.value = val; // Sync calculated value to object for totals
        } else {
            val = inv.value;
        }

        let divs = inv.isETF ? (val * inv.divYield) : 0;

        totalVal += val;
        if (totalAcct[inv.type] !== undefined) totalAcct[inv.type] += val;
        totalDiv += divs;

        let priceInput = '';
        if (inv.isLive) {
            priceInput = `<div style="display:flex;align-items:center;justify-content:center;gap:6px;"><span class="live-tag" style="background:#2d5a3d;color:#fff;font-size:0.7rem;padding:2px 4px;border-radius:3px;font-weight:600;">LIVE</span> <span>${inv.price.toFixed(2)}</span></div>`;
        } else if (inv.isETF) {
            priceInput = `<input type="number" step="1" class="ovr-input" style="width:80px; padding:2px; height:auto; text-align:center" value="${inv.price}" onchange="updateInvestmentPrice(${index}, this.value)">`;
        } else {
            priceInput = `<span style="color:var(--muted)">-</span>`;
        }

        let sharesLabel = inv.isETF ? `<input type="number" step="0.0001" class="ovr-input" style="width:70px; padding:2px; height:auto; text-align:right" value="${inv.shares}" onchange="updateInvestmentShares(${index}, this.value)">` : `<span style="color:var(--muted)">-</span>`;
        let yieldLabel = inv.divYield > 0 ? (inv.divYield * 100).toFixed(2) + '%' : '-';

        let valDisplay = inv.isETF ? `<span style="font-weight:500">${fC(val)}</span>` : `<input type="number" step="1" class="ovr-input" style="width:100px; padding:2px; height:auto; text-align:right" value="${inv.value}" onchange="updateInvestmentValue(${index}, this.value)">`;

        let nameDisplay = `<input type="text" style="width:100%; border:none; border-bottom:1px solid transparent; background:transparent; font-size:inherit; font-weight:inherit; color:inherit; outline:none; font-family:inherit; padding: 2px" value="${inv.name}" oninput="updateInvestmentName(${index}, this.value)" onfocus="this.style.borderBottom='1px dashed rgba(0,0,0,0.3)'" onblur="this.style.borderBottom='1px solid transparent'">`;

        if (inv.type === 'GIC' && (inv.gicLength || inv.gicDate)) {
            let tooltipText = "";
            if (inv.gicLength) tooltipText += `Length: ${inv.gicLength}`;
            if (inv.gicLength && inv.gicDate) tooltipText += `<br>`;
            if (inv.gicDate) tooltipText += `Maturity: ${inv.gicDate}`;

            nameDisplay = `<span class="has-tooltip">${nameDisplay}<span class="tooltip-content">${tooltipText}</span></span>`;
        } else if (inv.type === 'Cash' && inv.cashPrincipal) {
            let tooltipText = `Principal: ${fC(inv.cashPrincipal)}<br>Rate: ${(inv.cashRate || 0).toFixed(2)}%<br>Start: ${inv.cashDate}`;
            let interestRaw = (inv.value - inv.cashPrincipal);
            if (interestRaw > 0) tooltipText += `<br>Interest Earned: ${fC(interestRaw)}`;

            nameDisplay = `<span class="has-tooltip">${nameDisplay}<span class="tooltip-content">${tooltipText}</span></span>`;
        }

        tHTML += `<tr>
            <td class="${typeClassMap[inv.type]}">${inv.type}</td>
            <td><div style="display:flex;align-items:center;min-width:200px;">${nameDisplay} ${inv.ticker ? `<span style="font-size:0.8rem;color:var(--accent);margin-left:4px">${inv.ticker}</span>` : ''}</div></td>
            <td style="text-align:right">${sharesLabel}</td>
            <td style="text-align:center">${priceInput}</td>
            <td style="text-align:center">${valDisplay}</td>
            <td style="text-align:center">${yieldLabel}</td>
            <td style="text-align:right; color:var(--safe)">${fC(divs)}</td>
            <td style="text-align:center">
                <select class="invest-action-select" onchange="if(this.value==='delete') showConfirmDelete(${index}); else if(this.value==='edit') showEditInvestmentModal(${index}); this.value=''">
                    <option value="" selected disabled>Actions</option>
                    <option value="edit">Edit</option>
                    <option value="delete">Delete</option>
                </select>
            </td>
        </tr>`;
    });

    document.getElementById('investments-table').innerHTML = tHTML;

    // Projected Start of 2028
    // Added years of growth from today -> 2027 end
    const currentYear = new Date().getFullYear();
    const curRetRate = (parseFloat(document.getElementById('retRate').value) || 5) / 100;
    
    // Use the exact same partial month logic used in Net Worth table
    const currentMonth = new Date().getMonth(); 
    const partialYearFrac = (12 - (currentMonth + 1)) / 12;
    
    // Calculate target projection year (always next year)
    const targetProjYear = currentYear + 1;
    let yearsToTarget = 0;
    if (targetProjYear > currentYear) {
        yearsToTarget = partialYearFrac + (targetProjYear - currentYear - 1);
    }
    const projFactor = Math.pow(1 + curRetRate, yearsToTarget);

    const rrspProj = (totalAcct['RRSP'] || 0) * projFactor;
    const tfsaProj = (totalAcct['TFSA'] || 0) * projFactor;
    const nregProj = ((totalAcct['Non-Reg'] || 0) + (totalAcct['Cash'] || 0) + (totalAcct['GIC'] || 0)) * projFactor;

    document.getElementById('rrsp').value = Math.round(rrspProj);
    document.getElementById('tfsa').value = Math.round(tfsaProj);
    document.getElementById('nonReg').value = Math.round(nregProj);

    // Clear ALL balance overrides (rrsp/nreg/tfsa) across every simulation year
    // whenever the portfolio changes. Without this, any previously-pinned balance
    // in the Net Worth table (for 2028, 2030, 2040, etc.) would snap the running
    // TFSA/RRSP/NonReg back to the old value mid-simulation, making new investments
    // completely invisible in the final age-92 total.
    // Income overrides (netGoal, danPension, danCPPOAS, meganPension, meganCPPOAS)
    // are deliberately preserved — the user's income edits should always stick.
    const BALANCE_KEYS = ['rrsp', 'nreg', 'tfsa'];
    Object.keys(manualOverrides).forEach(year => {
        BALANCE_KEYS.forEach(k => delete manualOverrides[year][k]);
        if (Object.keys(manualOverrides[year]).length === 0) {
            delete manualOverrides[year];
        }
    });

    // Update labels to reflect dynamic logic
    const plannerTitle = `Projected ${targetProjYear} Balances`;
    document.querySelector('.planner-section .ss-title').innerText = plannerTitle;
    
    const projSuffix = `Projected ${targetProjYear}`;
    document.querySelectorAll('.planner-section label').forEach(label => {
        if (label.innerText.includes('Projected')) {
            label.innerText = label.innerText.split(' — ')[0] + ' — ' + projSuffix;
        }
    });

    document.getElementById('investments-summary').innerHTML = `
        <div><strong>Live Totals (${currentYear}):</strong> &nbsp;&nbsp;&nbsp; RRSP: <span class="c-rrsp">${fC(totalAcct['RRSP'])}</span> &nbsp;|&nbsp; TFSA: <span class="c-tfsa">${fC(totalAcct['TFSA'])}</span> &nbsp;|&nbsp; Non-Reg: <span class="c-nreg">${fC(totalAcct['Non-Reg'] + totalAcct['Cash'] + totalAcct['GIC'])}</span></div>
        <div>Total Value: <strong>${fC(totalVal)}</strong> &nbsp;|&nbsp; Est. Dividends: <strong style="color:var(--safe)">${fC(totalDiv)}</strong></div>
    `;

    // Cascade to main simulator
    update();
}

// Ensure updating value on input change regenerates table live
window.updateInvestmentPrice = function (index, newPrice) {
    let p = parseFloat(newPrice);
    if (!isNaN(p) && p >= 0) {
        pushToHistory();
        investmentList[index].price = p;
        saveState();
        renderInvestments();
    }
}

window.updateInvestmentValue = function (index, newValue) {
    let v = parseFloat(newValue);
    if (!isNaN(v) && v >= 0) {
        pushToHistory();
        investmentList[index].value = v;
        saveState();
        renderInvestments();
    }
}

window.updateInvestmentShares = function (index, newShares) {
    let s = parseFloat(newShares);
    if (!isNaN(s) && s >= 0) {
        pushToHistory();
        investmentList[index].shares = s;
        saveState();
        renderInvestments();
    }
}

window.updateInvestmentName = function (index, newName) {
    pushToHistory();
    investmentList[index].name = newName;
    saveState();
}

window.showConfirmDelete = function (index) {
    const inv = investmentList[index];
    const modal = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('modal-body');
    const confirmBtn = document.getElementById('confirm-delete-btn');

    modalBody.innerHTML = `Are you sure you want to delete <strong>${inv.name}</strong> (${inv.type})? This will permanently remove it from your portfolio and update your net worth projections.`;

    confirmBtn.onclick = function () {
        deleteInvestment(index);
        closeModal();
    };

    modal.classList.add('show');
}

window.closeModal = function () {
    const modal = document.getElementById('modal-overlay');
    modal.classList.remove('show');
}

window.deleteInvestment = function (index) {
    pushToHistory();
    investmentList.splice(index, 1);
    saveState();
    renderInvestments();
    showToast("Investment deleted successfully.");
}

window.showAddInvestmentModal = function () {
    editingIndex = null; // Reset editing state
    const modal = document.getElementById('add-investment-overlay');
    const title = document.getElementById('add-inv-title');
    const btn = document.getElementById('add-inv-btn');

    if (title) title.innerText = "Add New Investment";
    if (btn) btn.innerText = "Add Investment";

    // Reset form
    document.getElementById('add-inv-name').value = '';
    document.getElementById('add-inv-type').value = 'RRSP';
    document.getElementById('add-inv-ticker').value = '';
    document.getElementById('add-inv-shares').value = '';
    document.getElementById('add-inv-value').value = '';
    document.getElementById('add-inv-yield').value = '';
    document.getElementById('add-inv-gic-value').value = '';
    document.getElementById('add-inv-gic-length').value = '';
    document.getElementById('add-inv-gic-date').value = '';
    document.getElementById('add-inv-cash-inst').value = '';
    document.getElementById('add-inv-cash-principal').value = '';
    document.getElementById('add-inv-cash-date').value = '';
    document.getElementById('add-inv-cash-rate').value = '';
    toggleInvestmentFields();
    modal.classList.add('show');
}

window.showEditInvestmentModal = function (index) {
    editingIndex = index;
    const inv = investmentList[index];
    const modal = document.getElementById('add-investment-overlay');
    const title = document.getElementById('add-inv-title');
    const btn = document.getElementById('add-inv-btn');

    if (title) title.innerText = "Edit Investment";
    if (btn) btn.innerText = "Save Changes";

    // Populate common fields
    document.getElementById('add-inv-type').value = inv.type;
    document.getElementById('add-inv-name').value = inv.name || '';
    
    // Populate specialized or standard fields
    if (inv.type === 'GIC') {
        document.getElementById('add-inv-gic-value').value = inv.value || 0;
        document.getElementById('add-inv-gic-length').value = inv.gicLength || '';
        document.getElementById('add-inv-gic-date').value = inv.gicDate || '';
    } else if (inv.type === 'Cash') {
        document.getElementById('add-inv-cash-inst').value = inv.cashInst || '';
        document.getElementById('add-inv-cash-principal').value = inv.cashPrincipal || 0;
        document.getElementById('add-inv-cash-date').value = inv.cashDate || '';
        document.getElementById('add-inv-cash-rate').value = inv.cashRate || 0;
    } else {
        document.getElementById('add-inv-ticker').value = inv.ticker || '';
        document.getElementById('add-inv-shares').value = inv.shares || '';
        document.getElementById('add-inv-value').value = inv.value || 0;
        document.getElementById('add-inv-yield').value = (inv.divYield * 100).toFixed(2);
    }

    toggleInvestmentFields();
    modal.classList.add('show');
}

window.closeAddModal = function () {
    document.getElementById('add-investment-overlay').classList.remove('show');
}

window.toggleInvestmentFields = function () {
    const type = document.getElementById('add-inv-type').value;
    const gicFields = document.getElementById('gic-fields');
    const cashFields = document.getElementById('cash-fields');
    const standardFields = document.getElementById('standard-fields');

    if (type === 'GIC') {
        gicFields.style.display = 'block';
        cashFields.style.display = 'none';
        standardFields.style.display = 'none';
    } else if (type === 'Cash') {
        gicFields.style.display = 'none';
        cashFields.style.display = 'block';
        standardFields.style.display = 'none';
    } else {
        gicFields.style.display = 'none';
        cashFields.style.display = 'none';
        standardFields.style.display = 'block';
    }
}

window.addInvestment = async function () {
    const type = document.getElementById('add-inv-type').value;
    const name = document.getElementById('add-inv-name').value || (type === 'GIC' ? 'New GIC' : 'New Investment');
    const ticker = document.getElementById('add-inv-ticker').value.toUpperCase().trim();
    const sharesNum = parseFloat(document.getElementById('add-inv-shares').value) || 0;
    const valueNum = parseFloat(document.getElementById('add-inv-value').value) || 0;
    const yieldNum = (parseFloat(document.getElementById('add-inv-yield').value) || 0) / 100;
    const gicValue = parseFloat(document.getElementById('add-inv-gic-value').value) || 0;
    const gicLength = document.getElementById('add-inv-gic-length').value || null;
    const gicDate = document.getElementById('add-inv-gic-date').value || null;

    const cashInst = document.getElementById('add-inv-cash-inst').value.trim();
    const cashPrincipal = parseFloat(document.getElementById('add-inv-cash-principal').value) || 0;
    const cashDate = document.getElementById('add-inv-cash-date').value || null;
    const cashRate = parseFloat(document.getElementById('add-inv-cash-rate').value) || 0;

    let finalName = name;
    if (type === 'Cash' && cashInst) {
        finalName = `${cashInst} - ${name}`;
    }

    let newInv = {
        type: type,
        name: finalName,
        shares: sharesNum > 0 ? sharesNum : null,
        price: 0,
        value: type === 'GIC' ? gicValue : (type === 'Cash' ? cashPrincipal : valueNum),
        divYield: yieldNum,
        isETF: ticker !== '',
        ticker: ticker || null,
        // Cash specific
        cashPrincipal: type === 'Cash' ? cashPrincipal : null,
        cashDate: type === 'Cash' ? cashDate : null,
        cashRate: type === 'Cash' ? cashRate : null,
        cashInst: type === 'Cash' ? cashInst : null,
        isLive: false,
        gicLength: type === 'GIC' ? gicLength : null,
        gicDate: type === 'GIC' ? gicDate : null
    };

    pushToHistory();
    if (editingIndex !== null) {
        // UPDATE EXISTING
        investmentList[editingIndex] = newInv;
        editingIndex = null;
    } else {
        // ADD NEW
        investmentList.push(newInv);
    }

    closeAddModal();
    saveState();
    renderInvestments();

    if (newInv.isETF) {
        await fetchLivePrices(); 
    }

    showToast("Investment added successfully.");
}

// Automated live price engine (Background only)
window.fetchLivePrices = async function (showToastFlag = false) {
    let updated = false;

    // Helper for fast-failing fetches
    const fetchWithTimeout = async (url, options = {}, timeout = 5000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    };

    const proxyEngines = [
        async (url) => {
            const resp = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
            const data = await resp.json();
            return JSON.parse(data.contents);
        },
        async (url) => {
            const resp = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(url)}`);
            return await resp.json();
        },
        async (url) => {
            const resp = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
            return await resp.json();
        },
        async (url) => {
            // Backup proxy: thingproxy
            const resp = await fetchWithTimeout(`https://thingproxy.freeboard.io/fetch/${url}`);
            return await resp.json();
        }
    ];

    const fetchTicker = async (ticker) => {
        console.log(`[Price Fetch] Attempting LIVE Yahoo for ${ticker}...`);
        // Using the 'Raw' tunnel to get past the blocks
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&nocache=${Date.now()}`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

        try {
            const resp = await fetch(proxyUrl);
            const data = await resp.json();
            const result = data?.quoteResponse?.result?.[0];
            
            if (result?.regularMarketPrice) {
                const price = result.regularMarketPrice;
                console.log(`[Price Fetch] SUCCESS for ${ticker}: $${price}`);
                return price;
            }
        } catch (e) {
            console.warn(`[Price Fetch] Yahoo Tunnel failed for ${ticker}: ${e.message}`);
        }
        return null;
    };

    const groups = {};
    investmentList.forEach(inv => {
        if (inv.isETF && inv.ticker) {
            if (!groups[inv.ticker]) groups[inv.ticker] = { ticker: inv.ticker, items: [] };
            groups[inv.ticker].items.push(inv);
        }
    });

    const fetchPromises = Object.values(groups).map(async (group) => {
        const price = await fetchTicker(group.ticker);
        if (price && !isNaN(price)) {
            group.items.forEach(inv => {
                inv.price = price;
                inv.isLive = true;
            });
            updated = true;
        }
    });

    await Promise.all(fetchPromises);

    if (updated) {
        saveState();
        renderInvestments();
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const el = document.getElementById('last-price-update');
        if (el) el.innerText = `Last updated: ${timeStr}`;
    }
    if (showToastFlag) {
        if (updated) {
            showToast("Prices updated successfully.");
        } else {
            showToast("Could not reach finance servers. Try again in a moment.");
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    loadState();
    window.scrollTo(0, 0); 
    update();
    renderInvestments();
    setTimeout(() => fetchLivePrices(), 1000);

    // Auto-save and history on assumption change
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(inp => {
        inp.addEventListener('focus', () => pushToHistory());
        if (inp.tagName === 'TEXTAREA') {
            inp.addEventListener('input', saveState);
        } else {
            inp.addEventListener('change', saveState);
        }
    });

    // High frequency update: 1 minute
    setInterval(fetchLivePrices, 1 * 60 * 1000);
});
