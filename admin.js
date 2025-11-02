import { ARMY_REGISTRY } from './ejercitos.js';
// --- DOM Elements ---
const fileLoader = document.getElementById('fileLoader');
const mainFilterGroup = document.getElementById('main-filter-group');
const subFilterGroup = document.getElementById('sub-filter-group');
const factionSelector = document.getElementById('faction-selector');
const newItemGroup = document.getElementById('new-item-group');
const addNewBtn = document.getElementById('add-new-btn');
const editorContainer = document.getElementById('editor-container');
const deleteBtn = document.getElementById('delete-btn');
const resetBtn = document.getElementById('reset-btn');
const saveBtn = document.getElementById('save-btn');
const downloadServerBtn = document.getElementById('download-server-btn');

// --- Global State ---
let currentData = null;
let originalData = null;
let currentFileName = 'edited-army.js';
let isDataFromLocalFile = false;
let activeFilters = { mainCategory: '', subCategories: new Set(), faction: '' };
// ===================================================================================
// --- UI STATE HELPERS --- (ADD THIS NEW SECTION)
// ===================================================================================
function disableButtons() {
    deleteBtn.disabled = true;
    resetBtn.disabled = true;
    saveBtn.disabled = true;
}

function enableButtons() {
    deleteBtn.disabled = false;
    resetBtn.disabled = false;
    saveBtn.disabled = false;
}


// ===================================================================================
// --- INITIALIZATION ---
// ===================================================================================
document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    populateFactionSelector();
    disableButtons();
    attachEventListeners();
    const checkedRadio = document.querySelector('input[name="main-category"]:checked');
    activeFilters.mainCategory = checkedRadio ? checkedRadio.value : 'units';
    updateSubFilters();
}

function attachEventListeners() {
    // Delegate all input changes through the editor container
    editorContainer.addEventListener('change', (e) => {
        const target = e.target;
        if (target.hasAttribute('data-db-key')) {
            if (target.hasAttribute('data-prop')) {
                if (target.dataset.prop === 'mounts') {
                    handleStringArrayChange(e);
                } else {
                    handleDataChange(e);
                }
            }
        }
    });

    fileLoader.addEventListener('change', handleFileLoad);
    deleteBtn.addEventListener('click', handleDelete);
    resetBtn.addEventListener('click', handleReset);
    addNewBtn.addEventListener('click', handleAddNew);
    downloadServerBtn.addEventListener('click', handleDownloadFromServer);
    saveBtn.addEventListener('click', () => {
        if (isDataFromLocalFile) handleDownloadAsFile();
        else handleSaveToServer();
    });

    mainFilterGroup.addEventListener('change', (e) => {
        if (e.target.name === 'main-category') {
            activeFilters.mainCategory = e.target.value;
            updateSubFilters();
            render();
        }
    });

    subFilterGroup.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            if (e.target.checked) activeFilters.subCategories.add(e.target.value);
            else activeFilters.subCategories.delete(e.target.value);
            render();
        }
    });

    factionSelector.addEventListener('change', (e) => {
        activeFilters.faction = e.target.value;
        if (activeFilters.faction) {
            isDataFromLocalFile = false;
            fileLoader.value = '';
            loadArmyData(activeFilters.faction);
        } else if (!isDataFromLocalFile) {
            currentData = null;
            originalData = null;
            render();
        }
    });
    // In admin.js

function populateFactionSelector() {
    const previousSelection = factionSelector.value;
    factionSelector.innerHTML = '<option value="">-- Select Army --</option>';
    
    // 1. Load all the real armies from ejercitos.js
    ARMY_REGISTRY.forEach(army => {
        factionSelector.innerHTML += `<option value="${army.id}">${army.name}</option>`;
    });

    // 2. Unconditionally add the "Objetos Comunes" option to the list.
    // This makes it editable in the admin panel at all times.
    factionSelector.innerHTML += `<option value="comun">Objetos Mágicos Comunes</option>`;

    // Restore the previous selection if it exists and we're not loading a local file
    factionSelector.value = isDataFromLocalFile ? '' : previousSelection;
}
}

// ===================================================================================
// --- DATA LOADING & PROCESSING ---
// ===================================================================================

async function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;
    currentFileName = file.name;
    isDataFromLocalFile = true;
    factionSelector.value = '';
    activeFilters.faction = '';
    editorContainer.innerHTML = '<p>Loading local file...</p>';
    disableButtons();
    const reader = new FileReader();
    reader.onload = async (e) => {
        let fileContent = e.target.result;
        let objectURL = null;
        try {
            fileContent = fileContent.replace(/^import.*?;/gm, '');
            const blob = new Blob([fileContent], { type: 'application/javascript' });
            objectURL = URL.createObjectURL(blob);
            const armyModule = await import(objectURL);
            processLoadedData(armyModule.default);
        } catch (error) {
            editorContainer.innerHTML = `<p style="color:red;">Error parsing file: ${error.message}</p>`;
        } finally {
            if (objectURL) URL.revokeObjectURL(objectURL);
        }
    };
    reader.readAsText(file);
}

async function loadArmyData(factionId) {
    editorContainer.innerHTML = '<p>Loading...</p>';
    disableButtons();
    
    try {
        const response = await fetch(`/api/get-army?faction=${factionId}`);
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        const data = await response.json();
        processLoadedData(data);
    } catch (error) {
        editorContainer.innerHTML = `<p style="color:red;">Error loading data: ${error.message}</p>`;
    }
}

function processLoadedData(data) {
    currentData = data;
    originalData = JSON.parse(JSON.stringify(currentData));
    updateSubFilters();
    render();
    enableButtons();
    saveBtn.textContent = isDataFromLocalFile ? 'Descargar Cambios' : 'Guardar en Servidor';

    if (isDataFromLocalFile) {
        downloadServerBtn.classList.add('hidden');
    } else {
        downloadServerBtn.classList.remove('hidden');
    }
}

// ===================================================================================
// --- UI & FILTERING ---
// ===================================================================================

function render() {
    if (!currentData) {
        editorContainer.innerHTML = '<p>Select an army or load a local file to begin editing.</p>';
        newItemGroup.classList.add('hidden');
        disableButtons();
        return;
    }
    editorContainer.innerHTML = '';
    newItemGroup.classList.remove('hidden');

    const dbKey = getDbKeyForCategory(activeFilters.mainCategory);
    
    switch (activeFilters.mainCategory) {
        case 'units':
            buildUnitsUI(currentData[dbKey] || {});
            break;
        case 'magicItems':
            buildMagicItemsUI(currentData.magicItemsDB || {});
            break;
        case 'demonicGifts':
            editorContainer.innerHTML += '<h2>Regalos Demoníacos</h2>';
            buildSimpleUI(currentData.regalosDemoniacosDB || {}, 'regalosDemoniacosDB');
            editorContainer.innerHTML += '<h2>Iconos Demoníacos</h2>';
            buildSimpleUI(currentData.iconosDemoniacosDB || {}, 'iconosDemoniacosDB');
            break;
        default:
            buildSimpleUI(currentData[dbKey] || {}, dbKey);
    }
}

function updateSubFilters() {
    subFilterGroup.innerHTML = '';
    activeFilters.subCategories.clear();
    let filters = [];
    let html = '';

    switch (activeFilters.mainCategory) {
        case 'units': filters = ['Lord', 'Hero', 'Core', 'Special', 'Rare']; break;
        case 'magicItems': filters = ['Arma Mágica', 'Armadura Mágica', 'Talismán', 'Artefacto Arcano', 'Objeto Hechizado', 'Estandarte Mágico']; break;
        case 'demonicGifts':
            html = `<strong>Regalos:</strong>`;
            ['Regalo Mayor', 'Regalo Menor'].forEach(f => html += createCheckboxHtml(f));
            html += `<br><strong>Iconos:</strong>`;
            ['Icono Mayor', 'Icono Menor'].forEach(f => html += createCheckboxHtml(f));
            break;
        case 'armySkills':
            if (currentData?.armySkillsDB) {
                filters = [...new Set(Object.values(currentData.armySkillsDB).map(s => s.type))];
            }
            break;
    }

    subFilterGroup.innerHTML = html || filters.map(f => createCheckboxHtml(f)).join('');
    populateFactionSelector();
}

function createCheckboxHtml(value) {
    return `<label><input type="checkbox" value="${value}"> ${value}</label>`;
}

function populateFactionSelector() {
    const previousSelection = factionSelector.value;
    factionSelector.innerHTML = '<option value="">-- Select Army --</option>';
    
    // 1. Load all the real armies from ejercitos.js
    ARMY_REGISTRY.forEach(army => {
        factionSelector.innerHTML += `<option value="${army.id}">${army.name}</option>`;
    });

    // 2. Unconditionally add the "Objetos Comunes" option to the list.
    // This makes it editable in the admin panel at all times.
    factionSelector.innerHTML += `<option value="comun">Objetos Mágicos Comunes</option>`;

    // Restore the previous selection if it exists and we're not loading a local file
    factionSelector.value = isDataFromLocalFile ? '' : previousSelection;
}

// ===================================================================================
// --- UI BUILDERS ---
// ===================================================================================

function buildUnitsUI(unitsDB) {
    for (const unitName in unitsDB) {
        const unit = unitsDB[unitName];
        if (activeFilters.subCategories.size > 0 && !activeFilters.subCategories.has(unit.foc)) continue;

        const card = document.createElement('div');
        card.className = 'entry-card';
        const dbKey = getDbKeyForCategory('units');
        
        const warningHtml = unit.warning ? `<p class="warning-text" style="color: #FBBF24; font-style: italic;">${unit.warning}</p>` : '';
        const header = `<div class="entry-header"><h3>${unitName}</h3><label><input type="checkbox" class="delete-checkbox" data-db-key="${dbKey}" data-id="${unitName}"> Mark for Deletion</label></div>`;

        let profileHtml = '<h4>Perfiles</h4><table><thead><tr><th>Nombre</th><th>M</th><th>HA</th><th>HP</th><th>F</th><th>R</th><th>H</th><th>I</th><th>A</th><th>L</th></tr></thead><tbody>';
        (unit.perfiles || []).forEach((p, index) => {
            profileHtml += `<tr><td><input type="text" value="${p.nombre}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="perfiles[${index}].nombre"></td>`;
            Object.keys(p.stats).forEach(stat => {
                 profileHtml += `<td><input type="text" value="${p.stats[stat]}" style="width:30px" data-db-key="${dbKey}" data-id="${unitName}" data-prop="perfiles[${index}].stats.${stat}"></td>`;
            });
            profileHtml += `</tr>`;
        });
        profileHtml += '</tbody></table>';



   let attributesHtml = `<h4>Atributos</h4><div class="attributes-grid">
        <label>Points: <input type="number" step="0.5" value="${unit.points || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="points"></label>
        <label>FOC: <select data-db-key="${dbKey}" data-id="${unitName}" data-prop="foc">
            ${['Lord','Hero','Core','Special','Rare'].map(foc => `<option value="${foc}" ${unit.foc === foc ? 'selected' : ''}>${foc}</option>`).join('')}
        </select></label>
        <label>Subfaction: <input type="text" value="${unit.subfaction || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="subfaction"></label>
        
       
        ${
            (unit.composition && unit.composition.type === 'ratioBased')
            ? `
                <div class="composition-group">
                    <label>Min Primary: <input type="number" value="${unit.min?.primary || 0}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="min.primary"></label>
                    <label>Min Secondary: <input type="number" value="${unit.min?.secondary || 0}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="min.secondary"></label>
                    <label>Max Primary: <input type="number" value="${unit.max?.primary || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="max.primary"></label>
                    <label>Max Secondary: <input type="number" value="${unit.max?.secondary || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="max.secondary"></label>
                </div>
            `
            : `
                <label>Min: <input type="number" value="${unit.min || 0}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="min"></label>
                <label>Max: <input type="number" value="${unit.max || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="max"></label>
            `
        }

        <label>Max Regalos: <input type="number" value="${unit.maxRegalos || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="maxRegalos"></label>
        <label>Max Iconos: <input type="number" value="${unit.maxIconos || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="maxIconos"></label>
        <label>Magic Banner: <input type="number" value="${unit.magicBanner || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="magicBanner"></label>
        <label>Champ Items: <input type="number" value="${unit.champItems || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="champItems"></label>
        <label>Max Magic Items: <input type="number" value="${unit.maxMagicItems || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="maxMagicItems"></label>
        <label>Max Relics: <input type="number" value="${unit.maxRelics || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="maxRelics"></label>
    </div>`;



        let commandHtml = '<h4>Grupo de Mando</h4><div class="command-grid">';
        if (unit.command) {
            ['c', 's', 'm'].forEach(cmdType => {
                const cmd = unit.command[cmdType];
               // CORRECTED CODE:
if (cmd) {
    commandHtml += `<div>
        <label><b>${cmdType.toUpperCase()}:</b> Nombre: <input type="text" value="${cmd.n || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="command.${cmdType}.n"></label>
        <label>Coste: <input type="number" value="${cmd.p || 0}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="command.${cmdType}.p"></label>
    </div>`;
}

            });
        }
        commandHtml += '</div>';
        
        const textAreasHtml = `
            <div><label>Equipo:</label><textarea data-db-key="${dbKey}" data-id="${unitName}" data-prop="equipo">${unit.equipo || ''}</textarea></div>
            <div><label>Reglas Especiales:</label><textarea data-db-key="${dbKey}" data-id="${unitName}" data-prop="reglasEspeciales">${unit.reglasEspeciales || ''}</textarea></div>`;

        let optionsHtml = '<h4>Opciones</h4><table><thead><tr><th>Nombre (n)</th><th>Coste (p)</th><th>Resumen (summary)</th></tr></thead><tbody>';
        (unit.options || []).forEach((opt, index) => {
            optionsHtml += `<tr>
                <td><input type="text" value="${opt.n || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="options[${index}].n"></td>
                <td><input type="number" value="${opt.p || 0}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="options[${index}].p" style="width: 70px;"></td>
                <td><input type="text" value="${opt.summary || ''}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="options[${index}].summary"></td>
            </tr>`;
        });
        optionsHtml += '</tbody></table>';

        const mountsHtml = `<div><label>Monturas (separadas por coma):</label><input type="text" value="${(unit.mounts || []).join(', ')}" data-db-key="${dbKey}" data-id="${unitName}" data-prop="mounts"></div>`;
        

       card.innerHTML = `${warningHtml}${header}<div class="unit-layout"><div>${profileHtml}</div><div>${attributesHtml}${commandHtml}</div></div>${textAreasHtml}${optionsHtml}${mountsHtml}`;
        editorContainer.appendChild(card);
    }
}

function buildMagicItemsUI(magicItemsDB) {
    for (const categoryName in magicItemsDB) {
        if (activeFilters.subCategories.size > 0 && !activeFilters.subCategories.has(categoryName)) continue;
        const categoryItems = magicItemsDB[categoryName];
        const categoryHeader = document.createElement('h2');
        categoryHeader.textContent = categoryName;
        editorContainer.appendChild(categoryHeader);
        for (const itemName in categoryItems) {
            const item = categoryItems[itemName];
            const card = document.createElement('div');
            card.className = 'entry-card';
            const dbKey = getDbKeyForCategory('magicItems');
            card.innerHTML = `
                <div class="entry-header">
                    <h4>${itemName}</h4>
                    <label><input type="checkbox" class="delete-checkbox" data-db-key="${dbKey}" data-category="${categoryName}" data-id="${itemName}"> Mark for Deletion</label>
                </div>
                <div class="attributes-grid">
                    <label>Points: <input type="number" value="${item.points}" data-db-key="${dbKey}" data-category="${categoryName}" data-id="${itemName}" data-prop="points"></label>
                    <label>Relic: <select data-db-key="${dbKey}" data-category="${categoryName}" data-id="${itemName}" data-prop="relic">
                        <option value="true" ${item.relic === true ? 'selected' : ''}>Yes</option>
                        <option value="false" ${item.relic !== true ? 'selected' : ''}>No</option>
                    </select></label>
                </div>
                <label>Summary:</label>
                <textarea data-db-key="${dbKey}" data-category="${categoryName}" data-id="${itemName}" data-prop="summary">${item.summary || ''}</textarea>
            `;
            editorContainer.appendChild(card);
        }
    }
}

function buildSimpleUI(db, dbKey) {
     for (const itemName in db) {
        const item = db[itemName];
        
        if (activeFilters.mainCategory === 'demonicGifts') {
            const type = dbKey === 'regalosDemoniacosDB' ? item.type : `Icono ${item.type}`;
            if (activeFilters.subCategories.size > 0 && !activeFilters.subCategories.has(type)) continue;
        }

        const card = document.createElement('div');
        card.className = 'entry-card';
        card.innerHTML = `<div class="entry-header"><h3>${itemName}</h3><label><input type="checkbox" class="delete-checkbox" data-db-key="${dbKey}" data-id="${itemName}"> Mark for Deletion</label></div>
        <label>Points: <input type="number" value="${item.points}" data-db-key="${dbKey}" data-id="${itemName}" data-prop="points"></label>
        <label>Summary:</label><textarea data-db-key="${dbKey}" data-id="${itemName}" data-prop="summary">${item.summary || ''}</textarea>`;
        editorContainer.appendChild(card);
    }
}

// ===================================================================================
// --- DATA MANIPULATION ---
// ===================================================================================


// REPLACE this function to simplify it again.
function handleDataChange(event) {
    const input = event.target;
    const { dbKey, category, id, prop } = input.dataset;
    let value = input.value;

    if (input.type === 'number') value = parseFloat(input.value) || 0;
    if (input.tagName === 'SELECT' && input.value === 'true') value = true;
    if (input.tagName === 'SELECT' && input.value === 'false') value = false;
    
    const keys = prop.replace(/\[(\d+)\]/g, '.$1').split('.');
    let target = category ? currentData[dbKey]?.[category]?.[id] : currentData[dbKey]?.[id];
    if (!target) return;

    for (let i = 0; i < keys.length - 1; i++) {
        // Safety check to create nested objects if they don't exist
        if (!target[keys[i]]) target[keys[i]] = {}; 
        target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
}


function handleJsonDataChange(event) {
    const textarea = event.target;
    try {
        const jsonData = JSON.parse(textarea.value);
        const fakeEvent = { target: { ...textarea.dataset, value: jsonData } };
        handleDataChange(fakeEvent);
        textarea.style.borderColor = '';
    } catch (e) {
        textarea.style.borderColor = 'red';
    }
}

function handleStringArrayChange(event) {
    const input = event.target;
    const arrayValue = input.value.split(',').map(item => item.trim()).filter(Boolean);
    const fakeEvent = { target: { ...input.dataset, value: arrayValue } };
    handleDataChange(fakeEvent);
}

function handleDelete() {
    const checkedBoxes = editorContainer.querySelectorAll('.delete-checkbox:checked');
    if (checkedBoxes.length === 0) return alert("No items marked for deletion.");

    if (confirm(`Are you sure you want to delete ${checkedBoxes.length} item(s)?`)) {
        checkedBoxes.forEach(box => {
            const { dbKey, category, id } = box.dataset;
            if (category) {
                delete currentData[dbKey][category][id];
            } else {
                delete currentData[dbKey][id];
            }
        });
        render();
    }
}

function handleAddNew() {
    const count = document.getElementById('new-item-count').valueAsNumber || 1;
    const dbKey = getDbKeyForCategory(activeFilters.mainCategory);
    if (!currentData[dbKey]) currentData[dbKey] = {};

    for (let i = 0; i < count; i++) {
        const newName = `Nueva Entrada ${Object.keys(currentData[dbKey]).length + i + 1}`;
        currentData[dbKey][newName] = createNewTemplate(activeFilters.mainCategory);
    }
    render();
}

function createNewTemplate(category) {
    if (category === 'units') return { faction: "new", foc: "Core", points: 10, min: 1, max: 20, equipo: "", reglasEspeciales: "", perfiles: [{ nombre: "Nuevo Perfil", stats: { M: 4, HA: 3, HP: 3, F: 3, R: 3, H: 1, I: 3, A: 1, L: 7 } }] };
    if (category === 'magicItems') return { points: 5, relic: false, summary: "Nueva descripción." };
    return { points: 5, summary: "Nueva descripción." };
}

function handleReset() {
    if (confirm("Are you sure you want to discard all changes since the last save?")) {
        currentData = JSON.parse(JSON.stringify(originalData));
        render();
    }
}

function getDbKeyForCategory(category) {
    if (category === 'units') {
        if (currentData?.unitsDB) return 'unitsDB';
        return Object.keys(currentData).find(k => k.startsWith('unitsDB_')) || 'unitsDB';
    }
    const keyMap = { 'magicItems': 'magicItemsDB', 'armySkills': 'armySkillsDB', 'mounts': 'mountsDB', 'demonicGifts': 'regalosDemoniacosDB' };
    return keyMap[category];
}

// ===================================================================================
// --- SAVE & UTILITIES ---
// ===================================================================================

/**
 * Creates a clean, file-safe timestamp string like "20251102-171048".
 * @returns {string} The formatted timestamp.
 */
function getFormattedTimestamp() {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `${date}-${time}`;
}


// REPLACE the existing formatDataForSaving function with this one (it's the same correct one as before)
function formatDataForSaving(data) {
    const factionId = data.FACTION_ID || activeFilters.faction || 'comun';
    const generatedDate = new Date().toISOString();

    // --- SPECIAL CASE: Saving the common magic items file (comun.js) ---
    if (factionId === 'comun') {
        const magicItemsString = JSON.stringify(data.magicItemsDB || {}, null, 2);
        return `// Guamahammer Common Magic Items\n// Generated by Admin Editor @ ${generatedDate}\n\nexport const commonMagicItemsDB = ${magicItemsString};\n`;
    }

    // --- STANDARD ARMY FILE SAVING LOGIC ---
    const dataToSave = JSON.parse(JSON.stringify(data));
    delete dataToSave.COMMON_MAGIC_ITEMS;
    const cleanMagicItemsDB = {};
    const commonItems = originalData.COMMON_MAGIC_ITEMS || {};
    if (dataToSave.magicItemsDB) {
        for (const category in dataToSave.magicItemsDB) {
            const commonItemsInCategory = commonItems[category] || {};
            for (const itemName in dataToSave.magicItemsDB[category]) {
                if (!Object.prototype.hasOwnProperty.call(commonItemsInCategory, itemName)) {
                    if (!cleanMagicItemsDB[category]) cleanMagicItemsDB[category] = {};
                    cleanMagicItemsDB[category][itemName] = dataToSave.magicItemsDB[category][itemName];
                }
            }
        }
    }
    dataToSave.magicItemsDB = cleanMagicItemsDB;
    const constDbKeys = ['unitsDB', 'mountsDB', 'magicItemsDB', 'armySkillsDB', 'specialProfilesDB', 'regalosDemoniacosDB', 'iconosDemoniacosDB'];
    let constsString = '';
    const exportMappings = [];
    constDbKeys.forEach(key => {
        if (dataToSave[key] && Object.keys(dataToSave[key]).length > 0) {
            const suffixedVarName = `${key}_${factionId}`;
            constsString += `const ${suffixedVarName} = ${JSON.stringify(dataToSave[key], null, 2)};\n\n`;
            exportMappings.push({ key: key, varName: suffixedVarName });
            delete dataToSave[key];
        }
    });
    const exportProperties = [];
    for (const key in dataToSave) {
        const value = (key === 'FOC_CONFIG')
            ? JSON.stringify(dataToSave[key], null, 4).replace(/\n/g, '\n    ')
            : JSON.stringify(dataToSave[key]);
        exportProperties.push(`    ${key}: ${value}`);
    }
    exportMappings.forEach(mapping => {
        exportProperties.push(`    ${mapping.key}: ${mapping.varName}`);
    });
    let fileContent = `// Guamahammer Army File: ${factionId}\n// Generated by Admin Editor @ ${generatedDate}\n\n`;
    fileContent += `import { commonMagicItemsDB } from '../comun.js';\n\n`;
    fileContent += constsString;
    fileContent += `export default {\n`;
    fileContent += exportProperties.join(',\n');
    fileContent += `\n};\n`;
    return fileContent;
}

// REPLACE the existing handleDownloadFromServer function
// PASTE THIS COMPLETE FUNCTION IN ITS PLACE:

function handleDownloadFromServer() {
    if (!currentData || !currentData.FACTION_ID) {
        alert("No server-side army is currently loaded.");
        return;
    }

    const factionId = currentData.FACTION_ID;
    const fileName = `${factionId}-${getFormattedTimestamp()}.js`;
    
    // Determine the correct file path based on the factionId.
    const filePath = factionId === 'comun' 
        ? `/${factionId}.js`          // If 'comun', path is root: /comun.js
        : `/armies/${factionId}.js`;  // Otherwise, path is /armies/faction.js

    const a = document.createElement('a');
    a.href = filePath; 
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}



async function handleSaveToServer() {
    if (!currentData) return;

    const factionId = currentData.FACTION_ID || activeFilters.faction;
    if (!factionId) {
        alert("Cannot save: No faction ID is available.");
        return;
    }

    // A final confirmation before overwriting a server file.
    if (!confirm(`Are you sure you want to save changes to ${factionId}.js on the server?`)) {
        return;
    }

    const fileContent = formatDataForSaving(currentData);

    try {
        const response = await fetch('/api/save-army', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ factionId, fileContent }) // Send the pre-formatted content
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Server responded with status ${response.status}`);
        }

        alert(`${factionId}.js saved successfully on the server!`);
        
        // After a successful save, the original data should be updated to match the new state.
        // This prevents the user from being prompted to save again if they haven't made new changes.
        originalData = JSON.parse(JSON.stringify(currentData));

    } catch (error) {
        console.error('Error saving to server:', error);
        alert(`Failed to save file: ${error.message}`);
    }
}

// ... handleSaveToServer stays the same ...

// REPLACE the existing handleDownloadAsFile function
function handleDownloadAsFile() {
    if (!currentData) return;
    const finalFileContent = formatDataForSaving(currentData);
    const blob = new Blob([finalFileContent], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate a clean filename instead of using the old one
    const factionId = currentData.FACTION_ID || activeFilters.faction || 'comun';
    a.download = `${factionId}-${getFormattedTimestamp()}.js`;

    a.click();
    URL.revokeObjectURL(url);
}

// ... rest of the file stays the same ...
