import { ARMY_REGISTRY } from './ejercitos.js';
// --- DOM Elements ---

const rawEditorModal = document.getElementById('raw-editor-modal');
const rawJsonTextarea = document.getElementById('raw-json-textarea');
const saveRawJsonBtn = document.getElementById('save-raw-json-btn');
const cancelRawJsonBtn = document.getElementById('cancel-raw-json-btn');
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
// --- UI STATE HELPERS ---
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

// REPLACE your existing attachEventListeners function with this one.

function attachEventListeners() {
    // Delegate all input changes through the editor container
    editorContainer.addEventListener('change', (e) => {
        const target = e.target;
        if (target.matches('.entry-title-input')) {
            handleRename(e);
        } else if (target.hasAttribute('data-db-key')) {
            if (target.dataset.prop === 'mounts') {
                handleStringArrayChange(e);
            } else {
                handleDataChange(e);
            }
        }
    });

    // Modified click listener to handle raw editor button
    editorContainer.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('.add-row-btn') || target.matches('.delete-row-btn')) {
            handleRowAction(e);
        } else if (target.matches('.raw-edit-btn')) { // <-- ADD THIS ELSE-IF BLOCK
            handleOpenRawEditor(e);
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

    // --- ADD THESE TWO NEW LISTENERS FOR THE MODAL ---
    saveRawJsonBtn.addEventListener('click', handleSaveRawEditor);
    cancelRawJsonBtn.addEventListener('click', () => rawEditorModal.close());
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

// DELETE your old render() function and PASTE this one in its place.

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
        case 'mounts':
        case 'specialProfiles': // specialProfiles now correctly uses the complex UI builder
            buildComplexEntryUI(currentData[dbKey] || {}, dbKey);
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
            const defaultDbKey = getDbKeyForCategory(activeFilters.mainCategory);
            if (defaultDbKey) {
                 buildSimpleUI(currentData[defaultDbKey] || {}, defaultDbKey);
            }
    }
}


function updateSubFilters() {
    subFilterGroup.innerHTML = '';
    activeFilters.subCategories.clear();
    let filters = [];
    let html = '';

    switch (activeFilters.mainCategory) {
        case 'units': filters = ['Lord', 'Hero', 'Core', 'Special', 'Rare']; break;
        case 'mounts': filters = ['Character', 'Chariot', 'Monstrous']; break; // Example filters for mounts
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
        case 'specialProfiles': // <-- ADD THIS CASE BLOCK
            break;
    default:
        subFilterHtml = '';
    }

    subFilterGroup.innerHTML = html || filters.map(f => createCheckboxHtml(f)).join('');
}

function createCheckboxHtml(value) {
    return `<label><input type="checkbox" value="${value}"> ${value}</label>`;
}

function populateFactionSelector() {
    const previousSelection = factionSelector.value;
    factionSelector.innerHTML = '<option value="">-- Select Army --</option>';
    
    ARMY_REGISTRY.forEach(army => {
        factionSelector.innerHTML += `<option value="${army.id}">${army.name}</option>`;
    });

    factionSelector.innerHTML += `<option value="comun">Objetos Mágicos Comunes</option>`;

    factionSelector.value = isDataFromLocalFile ? '' : previousSelection;
}

// ===================================================================================
// --- UI BUILDERS ---
// ===================================================================================

/**
 * NEW: Generalized UI builder for complex entries like Units and Mounts.
 * @param {object} db - The database object (e.g., unitsDB, mountsDB).
 * @param {string} dbKey - The key for the database (e.g., 'unitsDB').
 */
function buildComplexEntryUI(db, dbKey) {
    for (const entryName in db) {
        const entry = db[entryName];
        if (activeFilters.subCategories.size > 0 && !activeFilters.subCategories.has(entry.foc)) continue;

        const card = document.createElement('div');
        card.className = 'entry-card';

const header = `<div class="entry-header">
    <input type="text" class="entry-title-input" value="${entryName}" data-db-key="${dbKey}" data-id="${entryName}">
    <div class="header-buttons">
        <button class="raw-edit-btn" data-db-key="${dbKey}" data-id="${entryName}">Edición Avanzada</button>
        <label><input type="checkbox" class="delete-checkbox" data-db-key="${dbKey}" data-id="${entryName}"> Mark for Deletion</label>
    </div>
</div>`;
   const warningHtml = `
            <div class="warning-editor">
                <label>Warning Text: 
                    <input 
                        type="text" 
                        class="warning-input" 
                        value="${entry.warning || ''}" 
                        placeholder="e.g., Only one per army"
                        data-db-key="${dbKey}" 
                        data-id="${entryName}" 
                        data-prop="warning">
                </label>
            </div>
        `;

        let profileHtml = '';
        if (entry.perfiles) {
            profileHtml = '<h4>Perfiles</h4><table><thead><tr><th>Nombre</th><th>M</th><th>HA</th><th>HP</th><th>F</th><th>R</th><th>H</th><th>I</th><th>A</th><th>L</th><th></th></tr></thead><tbody>';
            (entry.perfiles || []).forEach((p, index) => {
                profileHtml += `<tr><td><input type="text" value="${p.nombre}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="perfiles[${index}].nombre"></td>`;
                Object.keys(p.stats).forEach(stat => {
                     profileHtml += `<td><input type="text" value="${p.stats[stat]}" style="width:30px" data-db-key="${dbKey}" data-id="${entryName}" data-prop="perfiles[${index}].stats.${stat}"></td>`;
                });
                profileHtml += `<td><button class="delete-row-btn" data-action="delete-profile" data-db-key="${dbKey}" data-id="${entryName}" data-index="${index}">Delete</button></td></tr>`;
            });
            profileHtml += '</tbody></table>';
            profileHtml += `<button class="add-row-btn" data-action="add-profile" data-db-key="${dbKey}" data-id="${entryName}">+ Add Profile</button>`;
        }
        
        // --- START PHASE 3: COMPOSITION UNIT LOGIC ---
        
        let costAndSizeHtml = '';
        const isCompositionUnit = entry.composition && entry.composition.type === 'ratioBased';

        if (isCompositionUnit) {
            // RENDER THE NEW COMPOSITION EDITOR UI
            // Optional chaining (?.) is used heavily to prevent errors if parts of the object don't exist yet.
            costAndSizeHtml = `
                <h4>Atributos (Composición por Ratio)</h4>
                <div class="composition-editor">
                    <fieldset>
                        <legend>Unidad Primaria</legend>
                        <label>Nombre: <input type="text" value="${entry.composition?.primary?.name || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.primary.name"></label>
                        <label>Coste: <input type="number" value="${entry.composition?.primary?.cost || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.primary.cost"></label>
                        <label>Min: <input type="number" value="${entry.min?.primary || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="min.primary"></label>
                        <label>Max: <input type="number" value="${entry.max?.primary || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="max.primary"></label>
                    </fieldset>
                    <fieldset>
                        <legend>Unidad Secundaria</legend>
                        <label>Nombre: <input type="text" value="${entry.composition?.secondary?.name || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.secondary.name"></label>
                        <label>Coste: <input type="number" value="${entry.composition?.secondary?.cost || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.secondary.cost"></label>
                        <label>Min: <input type="number" value="${entry.min?.secondary || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="min.secondary"></label>
                        <label>Max: <input type="number" value="${entry.max?.secondary || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="max.secondary"></label>
                    </fieldset>
                    <fieldset class="rule-logic-fieldset">
                        <legend>Regla de Composición</legend>
                        <label>Texto de la Regla:</label>
                        <textarea data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.ruleText">${entry.composition?.ruleText || ''}</textarea>
                        <div class="rule-logic-grid">
                            <label>Secundarias Min: <input type="number" value="${entry.composition?.ruleLogic?.secondaryMin || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.ruleLogic.secondaryMin" title="Minimum number of secondary units required, regardless of primary count."></label>
                            <label>Secundarias Max: <input type="number" value="${entry.composition?.ruleLogic?.secondaryMax || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.ruleLogic.secondaryMax" title="Absolute maximum number of secondary units allowed."></label>
                            <label>por cada Primaria: <input type="number" value="${entry.composition?.ruleLogic?.perPrimary || 1}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="composition.ruleLogic.perPrimary" title="How many secondary units can be taken for each primary unit."></label>
                        </div>
                    </fieldset>
                </div>
            `;
        } else {
            // RENDER THE STANDARD POINTS/MIN/MAX UI (this is the old code)
            costAndSizeHtml = `
                <h4>Atributos</h4>
                <div class="attributes-grid">
                    <label>Points: <input type="number" step="0.5" value="${entry.points || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="points"></label>
                    <label>Min: <input type="number" value="${entry.min || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="min"></label>
                    <label>Max: <input type="number" value="${entry.max || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="max"></label>
                </div>`;
        }
        
        // These attributes are common to BOTH standard and composition units.
        // We define them once to avoid duplicating code inside the if/else block.
        const commonAttributesHtml = `
            <div class="attributes-grid common-attributes">
                <label>FOC: <select data-db-key="${dbKey}" data-id="${entryName}" data-prop="foc">
                    ${['Lord','Hero','Core','Special','Rare','Character','Chariot','Monstrous'].map(foc => `<option value="${foc}" ${entry.foc === foc ? 'selected' : ''}>${foc}</option>`).join('')}
                </select></label>
                <label>Subfaction: <input type="text" value="${entry.subfaction || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="subfaction"></label>
                <label>Max Regalos: <input type="number" value="${entry.maxRegalos || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="maxRegalos"></label>
                <label>Max Iconos: <input type="number" value="${entry.maxIconos || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="maxIconos"></label>
                <label>Magic Banner: <input type="number" value="${entry.magicBanner || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="magicBanner"></label>
                <label>Champ Items: <input type="number" value="${entry.champItems || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="champItems"></label>
                <label>Max Magic Items: <input type="number" value="${entry.maxMagicItems || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="maxMagicItems"></label>
                <label>Max Relics: <input type="number" value="${entry.maxRelics || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="maxRelics"></label>
            </div>
        `;

        // --- END PHASE 3: COMPOSITION UNIT LOGIC ---


        let specialAddonsHtml = '';
        if (activeFilters.mainCategory === 'units' && entry.hasOwnProperty('specialAddons')) {
            specialAddonsHtml = '<h4>Unidades Complementarias (Addons)</h4><table><thead><tr><th>Nombre (name)</th><th>Coste (points)</th><th>Max (max)</th><th>Clave de Perfil (profileKey)</th><th></th></tr></thead><tbody>';
            (entry.specialAddons || []).forEach((addon, index) => {
                specialAddonsHtml += `<tr>
                    <td><input type="text" value="${addon.name || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="specialAddons[${index}].name"></td>
                    <td><input type="number" value="${addon.points || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="specialAddons[${index}].points" style="width: 70px;"></td>
                    <td><input type="number" value="${addon.max || 1}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="specialAddons[${index}].max" style="width: 70px;"></td>
                    <td><input type="text" value="${addon.profileKey || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="specialAddons[${index}].profileKey" placeholder="e.g., Fanático"></td>
                    <td><button class="delete-row-btn" data-action="delete-addon" data-db-key="${dbKey}" data-id="${entryName}" data-index="${index}">Delete</button></td>
                </tr>`;
            });
            specialAddonsHtml += '</tbody></table>';
            specialAddonsHtml += `<button class="add-row-btn" data-action="add-addon" data-db-key="${dbKey}" data-id="${entryName}">+ Add Addon</button>`;
        }
        
        let commandHtml = '';
        if (entry.command) {
            commandHtml = '<h4>Grupo de Mando</h4><div class="command-grid">';
            ['c', 's', 'm'].forEach(cmdType => {
                const cmd = entry.command[cmdType];
                if (cmd) {
                    commandHtml += `<div>
                        <label><b>${cmdType.toUpperCase()}:</b> Nombre: <input type="text" value="${cmd.n || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="command.${cmdType}.n"></label>
                        <label>Coste: <input type="number" value="${cmd.p || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="command.${cmdType}.p"></label>
                    </div>`;
                }
            });
            commandHtml += '</div>';
        }
        
        const textAreasHtml = `
            <div><label>Equipo:</label><textarea data-db-key="${dbKey}" data-id="${entryName}" data-prop="equipo">${entry.equipo || ''}</textarea></div>
            <div><label>Reglas Especiales:</label><textarea data-db-key="${dbKey}" data-id="${entryName}" data-prop="reglasEspeciales">${entry.reglasEspeciales || ''}</textarea></div>`;

        let optionsHtml = '<h4>Opciones</h4>';
        const optionsTableHead = `<table><thead><tr>
            <th>Nombre (n)</th>
            <th>Coste (p)</th>
            <th>Resumen (summary)</th>
            <th>Exclusive Group</th>
            <th></th>
        </tr></thead><tbody>`;
        
        const options = entry.options || [];
        let optionsTableBodyHtml = '';

        if (options.length > 0) {
            const exclusiveGroups = {};
            const nonGroupedOptions = [];

            options.forEach((opt, index) => {
                opt.originalIndex = index; 
                if (opt.exclusiveGroup) {
                    if (!exclusiveGroups[opt.exclusiveGroup]) {
                        exclusiveGroups[opt.exclusiveGroup] = [];
                    }
                    exclusiveGroups[opt.exclusiveGroup].push(opt);
                } else {
                    nonGroupedOptions.push(opt);
                }
            });

            const createRow = (opt) => {
                const index = opt.originalIndex;
                return `<tr>
                    <td><input type="text" value="${opt.n || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="options[${index}].n"></td>
                    <td><input type="number" value="${opt.p || 0}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="options[${index}].p" style="width: 70px;"></td>
                    <td><input type="text" value="${opt.summary || ''}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="options[${index}].summary"></td>
                    <td><input type="text" value="${opt.exclusiveGroup || ''}" placeholder="e.g., chaosMark" data-db-key="${dbKey}" data-id="${entryName}" data-prop="options[${index}].exclusiveGroup"></td>
                    <td><button class="delete-row-btn" data-action="delete-option" data-db-key="${dbKey}" data-id="${entryName}" data-index="${index}">Delete</button></td>
                </tr>`;
            };

            for (const groupName in exclusiveGroups) {
                optionsTableBodyHtml += `<fieldset class="exclusive-group-fieldset"><legend>${groupName}</legend>`;
                exclusiveGroups[groupName].forEach(opt => {
                    optionsTableBodyHtml += createRow(opt);
                });
                optionsTableBodyHtml += `</fieldset>`;
            }

            nonGroupedOptions.forEach(opt => {
                optionsTableBodyHtml += createRow(opt);
            });
            
            optionsHtml += optionsTableHead + optionsTableBodyHtml + '</tbody></table>';
        } else {
             optionsHtml += optionsTableHead + '</tbody></table>';
        }
        
        optionsHtml += `<button class="add-row-btn" data-action="add-option" data-db-key="${dbKey}" data-id="${entryName}">+ Add Option</button>`;

        const mountsHtml = entry.mounts ? `<div><label>Monturas (separadas por coma):</label><input type="text" value="${(entry.mounts || []).join(', ')}" data-db-key="${dbKey}" data-id="${entryName}" data-prop="mounts"></div>` : '';
        
        // Final Assembly of the card's inner HTML
        card.innerHTML = `${warningHtml}${header}
            <div class="unit-layout">
                <div>
                    ${profileHtml}
                </div>
                <div>
                    ${costAndSizeHtml}
                    ${commonAttributesHtml}
                    ${commandHtml}
                </div>
            </div>
            ${textAreasHtml}
            ${optionsHtml}
            ${specialAddonsHtml}
            ${mountsHtml}`;

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
        <input type="text" class="entry-title-input" value="${itemName}" data-db-key="${dbKey}" data-category="${categoryName}" data-id="${itemName}">
        <div class="header-buttons">
            <button class="raw-edit-btn" data-db-key="${dbKey}" data-category="${categoryName}" data-id="${itemName}">Edición Avanzada</button>
            <label><input type="checkbox" class="delete-checkbox" data-db-key="${dbKey}" data-category="${categoryName}" data-id="${itemName}"> Mark for Deletion</label>
        </div>
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
       card.innerHTML = `<div class="entry-header">
    <input type="text" class="entry-title-input" value="${itemName}" data-db-key="${dbKey}" data-id="${itemName}">
    <div class="header-buttons">
        <button class="raw-edit-btn" data-db-key="${dbKey}" data-id="${itemName}">Edición Avanzada</button>
        <label><input type="checkbox" class="delete-checkbox" data-db-key="${dbKey}" data-id="${itemName}"> Mark for Deletion</label>
    </div>
</div>
<label>Points: <input type="number" value="${item.points}" data-db-key="${dbKey}" data-id="${itemName}" data-prop="points"></label>
<label>Summary:</label><textarea data-db-key="${dbKey}" data-id="${itemName}" data-prop="summary">${item.summary || ''}</textarea>`;
        editorContainer.appendChild(card);
    }
}

// ===================================================================================
// --- DATA MANIPULATION ---
// ===================================================================================

// --- In the DATA MANIPULATION section ---

// REPLACE the existing handleDataChange function with this corrected version.
// The only change is the line that processes the 'prop' string to handle arrays correctly.
function handleDataChange(event) {
    const input = event.target;
    const { dbKey, category, id, prop } = input.dataset;
    let value = input.value;

    if (input.type === 'number') value = parseFloat(input.value) || 0;
    if (input.tagName === 'SELECT' && input.value === 'true') value = true;
    if (input.tagName === 'SELECT' && input.value === 'false') value = false;
    
    // OLD, INCORRECT LINE:
    // const keys = prop.replace(/$$(\d+)$$/g, '.\$1').split('.');
    
    // NEW, CORRECTED LINE: This correctly handles array paths like "perfiles[0].nombre"
    const keys = prop.replace(/\[(\d+)\]/g, '.$1').split('.');

    let target = category ? currentData[dbKey]?.[category]?.[id] : currentData[dbKey]?.[id];
    if (!target) return;

    // This loop now works correctly with the fixed 'keys' array
    for (let i = 0; i < keys.length - 1; i++) {
        // Safety check to create nested objects if they don't exist
        if (!target[keys[i]]) {
            // Check if the next key is a number, if so, create an array
            if (!isNaN(parseInt(keys[i+1], 10))) {
                 target[keys[i]] = [];
            } else {
                 target[keys[i]] = {};
            }
        }
        target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
}

/**
 * NEW: Opens the raw JSON editor modal with the data for the selected entry.
 */
function handleOpenRawEditor(event) {
    const button = event.target;
    const { dbKey, category, id } = button.dataset;

    const entry = category 
        ? currentData[dbKey]?.[category]?.[id] 
        : currentData[dbKey]?.[id];

    if (!entry) {
        alert("Could not find data for this entry.");
        return;
    }

    // Store the entry's location on the modal itself for the save function to find
    rawEditorModal.dataset.dbKey = dbKey;
    rawEditorModal.dataset.id = id;
    if (category) {
        rawEditorModal.dataset.category = category;
    } else {
        delete rawEditorModal.dataset.category; // Ensure it's clean for non-category items
    }

    // Populate the textarea and show the modal
    rawJsonTextarea.value = JSON.stringify(entry, null, 2);
    rawEditorModal.showModal();
}

/**
 * NEW: Saves the content of the raw JSON editor back to the main data object.
 */
function handleSaveRawEditor() {
    const { dbKey, category, id } = rawEditorModal.dataset;
    const jsonText = rawJsonTextarea.value;

    let newObject;
    try {
        newObject = JSON.parse(jsonText);
    } catch (error) {
        alert(`Error: Invalid JSON format.\n\n${error.message}`);
        return; // Don't save or close
    }

    // Update the data in the correct location
    if (category) {
        currentData[dbKey][category][id] = newObject;
    } else {
        currentData[dbKey][id] = newObject;
    }

    rawEditorModal.close();
    render(); // Re-render the entire UI to reflect potentially major changes
}
// Handles renaming of an entry (changing the object key)
function handleRename(event) {
    const input = event.target;
    const { dbKey, category } = input.dataset;
    const oldName = input.dataset.id;
    const newName = input.value.trim();

    if (newName === oldName || !newName) {
        input.value = oldName; // Revert if name is empty or unchanged
        return;
    }

    const targetDb = category ? currentData[dbKey][category] : currentData[dbKey];

    if (targetDb[newName]) {
        alert(`Error: An entry with the name "${newName}" already exists.`);
        input.value = oldName; // Revert
        return;
    }

    // Perform the rename
    targetDb[newName] = targetDb[oldName];
    delete targetDb[oldName];

    // CRITICAL: Re-render the entire UI.
    // This is necessary because all data attributes on child elements of the
    // renamed card are now incorrect (they still reference the old name).
    // A full re-render is the safest way to update everything.
    render();
}

// NEW: Handles adding/deleting rows in profiles/options arrays
function handleRowAction(event) {
    const button = event.target;
    const { action, dbKey, id, index } = button.dataset;

    const targetItem = currentData[dbKey]?.[id];
    if (!targetItem) return;

    switch (action) {
        case 'add-profile':
            if (!targetItem.perfiles) targetItem.perfiles = [];
            targetItem.perfiles.push({
                nombre: "Nuevo Perfil",
                stats: { M: 4, HA: 3, HP: 3, F: 3, R: 3, H: 1, I: 3, A: 1, L: 7 }
            });
            break;
        case 'delete-profile':
            targetItem.perfiles.splice(index, 1);
            break;
        case 'add-option':
             if (!targetItem.options) targetItem.options = [];
            targetItem.options.push({ n: 'Nueva Opción', p: 0, summary: '' });
            break;
        case 'delete-option':
            targetItem.options.splice(index, 1);
            break;
           // --- ADD THE TWO CASES BELOW ---
case 'add-addon':
    if (!targetItem.specialAddons) {
        targetItem.specialAddons = []; // Initialize if it doesn't exist
    }
    targetItem.specialAddons.push({ name: "Nuevo Addon", points: 0, max: 1, profileKey: "" });
    break;

case 'delete-addon':
    targetItem.specialAddons.splice(index, 1);
    break;
 

    }

    // Re-render to show the changes
    render();
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
    const mainCategory = activeFilters.mainCategory;
    const dbKey = getDbKeyForCategory(mainCategory);

    // Case 1: For nested structures like Magic Items / Runes
    if (mainCategory === 'magicItems') {
        const db = currentData[dbKey] || {};
        const existingCategories = Object.keys(db);
        const defaultValue = existingCategories.length > 0 ? existingCategories[0] : '';
        const promptMessage = `Enter the item category.\n\nExisting: ${existingCategories.join(', ')}\n\nOr type a new category name.`;
        let targetCategory = prompt(promptMessage, defaultValue);
        
        if (!targetCategory) return;
        targetCategory = targetCategory.trim();
        if (!targetCategory) return;

        if (!currentData[dbKey]) currentData[dbKey] = {};
        if (!currentData[dbKey][targetCategory]) {
            currentData[dbKey][targetCategory] = {};
        }

        for (let i = 0; i < count; i++) {
            const newName = `Nueva Entrada ${Object.keys(currentData[dbKey][targetCategory]).length + i + 1}`;
            currentData[dbKey][targetCategory][newName] = createNewTemplate(mainCategory);
        }

    } else if (mainCategory === 'armySkills') {
        const db = currentData[dbKey] || {};
        const existingSkills = Object.values(db);
        
        const categorizationKey = existingSkills.length > 0 && existingSkills[0].skillSource ? 'skillSource' : 'type';
        const existingCategories = [...new Set(existingSkills.map(skill => skill[categorizationKey]).filter(Boolean))];
        const defaultValue = existingCategories.length > 0 ? existingCategories[0] : '';
        const promptMessage = `Enter the skill category (${categorizationKey}).\n\nExisting: ${existingCategories.join(', ')}\n\nOr type a new category name.`;
        let targetCategory = prompt(promptMessage, defaultValue);

        if (!targetCategory) return;
        targetCategory = targetCategory.trim();
        if (!targetCategory) return;
        
        if (!currentData[dbKey]) currentData[dbKey] = {};

        for (let i = 0; i < count; i++) {
            const newName = `Nueva Entrada ${Object.keys(currentData[dbKey]).length + i + 1}`;
            const newSkill = createNewTemplate(mainCategory);
            
            newSkill[categorizationKey] = targetCategory;
            currentData[dbKey][newName] = newSkill;
        }

    } else if (mainCategory === 'demonicGifts') {
        const giftTypeInput = prompt("What type are you adding? Enter 'Regalo' or 'Icono'").toLowerCase().trim();
        let targetDbKey;

        if (giftTypeInput.startsWith('regalo')) {
            targetDbKey = 'regalosDemoniacosDB';
        } else if (giftTypeInput.startsWith('icono')) {
            targetDbKey = 'iconosDemoniacosDB';
        } else {
            alert("Invalid type. Please enter 'Regalo' or 'Icono'.");
            return;
        }

        if (!currentData[targetDbKey]) currentData[targetDbKey] = {};

        for (let i = 0; i < count; i++) {
            const newName = `Nueva Entrada ${Object.keys(currentData[targetDbKey]).length + i + 1}`;
            currentData[targetDbKey][newName] = createNewTemplate(mainCategory);
        }

    } else {
        if (!currentData[dbKey]) currentData[dbKey] = {};
        
        for (let i = 0; i < count; i++) {
            const newName = `Nueva Entrada ${Object.keys(currentData[dbKey]).length + i + 1}`;
            currentData[dbKey][newName] = createNewTemplate(mainCategory);
        }
    }

    render();
}

function createNewTemplate(category) {
    if (category === 'units') return { faction: "new", foc: "Core", points: 10, min: 1, max: 20, equipo: "", reglasEspeciales: "", options: [], perfiles: [{ nombre: "Nuevo Perfil", stats: { M: 4, HA: 3, HP: 3, F: 3, R: 3, H: 1, I: 3, A: 1, L: 7 } }] };
    if (category === 'mounts') return { foc: "Character", points: 15, equipo: "", reglasEspeciales: "", perfiles: [{ nombre: "Nueva Montura", stats: { M: 8, HA: 3, HP: 0, F: 4, R: 4, H: 1, I: 3, A: 1, L: 6 } }] };
      if (category === 'specialProfiles') return { perfiles: [{ nombre: "Nuevo Perfil", stats: {} }] };
    if (category === 'magicItems') return { points: 5, relic: false, summary: "Nueva descripción." };
    return { points: 5, summary: "Nueva descripción." };
}

function handleReset() {
    if (confirm("Are you sure you want to discard all changes since the last save?")) {
        currentData = JSON.parse(JSON.stringify(originalData));
        render();
    }
}

// DELETE your old getDbKeyForCategory() function and PASTE this one in its place.

function getDbKeyForCategory(category) {
    if (!currentData) return null; // Safety check

    if (category === 'units') {
        return Object.keys(currentData).find(k => k.startsWith('unitsDB')) || 'unitsDB';
    }
    if (category === 'mounts') {
        return Object.keys(currentData).find(k => k.startsWith('mountsDB')) || 'mountsDB';
    }
    if (category === 'specialProfiles') {
        return Object.keys(currentData).find(k => k.startsWith('specialProfilesDB')) || 'specialProfilesDB';
    }

    const keyMap = { 
        'magicItems': 'magicItemsDB', 
        'armySkills': 'armySkillsDB', 
        'demonicGifts': 'regalosDemoniacosDB' 
    };
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


// REPLACE the existing formatDataForSaving function with this one in admin.js

function formatDataForSaving(data) {
    const factionId = data.FACTION_ID || activeFilters.faction || 'comun';
    const generatedDate = new Date().toISOString();

    // --- START: NEW CLEANUP LOGIC ---
    // Create a deep copy to avoid modifying the live data object used by the UI
    const dataToSave = JSON.parse(JSON.stringify(data));

    // This helper function iterates through a DB (like unitsDB) and removes temporary properties
    const cleanupTemporaryProps = (db) => {
        if (!db) return;
        for (const entryKey in db) {
            const entry = db[entryKey];
            // Check for options arrays and clean them
            if (entry.options && Array.isArray(entry.options)) {
                entry.options.forEach(opt => {
                    delete opt.originalIndex; // Remove the temporary UI property
                });
            }
        }
    };
    
    // Apply the cleanup to all relevant databases before saving
    cleanupTemporaryProps(dataToSave.unitsDB);
    cleanupTemporaryProps(dataToSave.mountsDB);
    // --- END: NEW CLEANUP LOGIC ---


    // --- SPECIAL CASE: Saving the common magic items file (comun.js) ---
    if (factionId === 'comun') {
        const magicItemsString = JSON.stringify(dataToSave.magicItemsDB || {}, null, 2);
        return `// Guamahammer Common Magic Items\n// Generated by Admin Editor @ ${generatedDate}\n\nexport const commonMagicItemsDB = ${magicItemsString};\n`;
    }

    // --- STANDARD ARMY FILE SAVING LOGIC ---
    delete dataToSave.COMMON_MAGIC_ITEMS; // This was already here, just moved after the copy
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


