/* --- SÉLECTEURS --- */
const modeBtn = document.getElementById('mode-btn');
const saveBtn = document.getElementById('save-btn');
const runBtn = document.getElementById('run-btn');
const openBtn = document.getElementById('open-btn');
const newFileBtn = document.getElementById('new-file-btn');
const tabsContainer = document.getElementById('tabs-container');
const editorContainer = document.getElementById('editor-container');
const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const statusMode = document.getElementById('status-mode');
const statusPosition = document.getElementById('status-position');

/* --- ÉTAT DE L'APPLICATION --- */
let isStudentMode = true;
let isRunning = false;
let fileContent = {}; 
let savedFileContent = {};
let fileHandles = {};

/* --- FONCTIONS --- */

function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    lineNumbers.innerHTML = Array(lines).fill(0).map((_, i) => `<span>${i + 1}</span>`).join('');
}

function activateTab(tabElement) {
    const fileName = tabElement.querySelector('.tab-title').innerText.replace('*', '');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    tabElement.classList.add('active');
    editorContainer.style.display = 'flex';
    editor.value = fileContent[fileName] || "";
    updateLineNumbers();
}

function updateCursorInfo() {
    const text = editor.value;
    const cursorPos = editor.selectionStart;
    
    const textBeforeCursor = text.substring(0, cursorPos);
    
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines.length;
    
    const currentCol = lines[lines.length - 1].length + 1;

    statusPosition.innerText = `Li ${currentLine}, Col ${currentCol}`;
}

async function saveFile() {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;

    const titleSpan = activeTab.querySelector('.tab-title');
    const fileName = titleSpan.innerText.replace('*', '');
    const content = editor.value;

    try {
        let handle = fileHandles[fileName];

        if (!handle) {
            handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'Fichier Python', accept: {'text/python': ['.py']} }]
            });
            fileHandles[fileName] = handle;
        }

        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();

        savedFileContent[fileName] = content;
        titleSpan.innerText = fileName; // Enlève l'astérisque
        console.log("Sauvegardé !");
    } catch (err) {
        console.warn("Sauvegarde annulée.");
    }
}

function createNewTab(fileName) {
    const newTab = document.createElement('div');
    newTab.className = 'tab'; 
    newTab.innerHTML = `<span class="tab-title">${fileName}</span><span class="close-tab">×</span>`;

    newTab.addEventListener('click', () => activateTab(newTab));

    newTab.querySelector('.close-tab').addEventListener('click', (e) => {
        e.stopPropagation();
        if (newTab.querySelector('.tab-title').innerText.endsWith('*')) {
            if (!confirm("Fermer sans sauvegarder ?")) return; 
        }
        delete fileContent[fileName];
        delete savedFileContent[fileName];
        delete fileHandles[fileName];
        newTab.remove();
        
        const remaining = document.querySelectorAll('.tab');
        if (remaining.length > 0) activateTab(remaining[remaining.length - 1]);
        else editorContainer.style.display = 'none';
    });

    tabsContainer.appendChild(newTab);
    activateTab(newTab);
}

/* --- ÉVÉNEMENTS --- */

editor.addEventListener('input', () => {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const titleSpan = activeTab.querySelector('.tab-title');
        const fileName = titleSpan.innerText.replace('*', '');
        fileContent[fileName] = editor.value;

        if (fileContent[fileName] !== savedFileContent[fileName]) {
            if (!titleSpan.innerText.endsWith('*')) titleSpan.innerText = fileName + "*";
        } else {
            titleSpan.innerText = fileName;
        }
    }
    updateLineNumbers();
});

editor.addEventListener('input', updateCursorInfo);
editor.addEventListener('click', updateCursorInfo);
editor.addEventListener('keyup', updateCursorInfo);

/* --- BOUTONS --- */

newFileBtn.addEventListener('click', () => {
    let name = prompt("Nom du fichier :");
    if (name && name.trim() !== "") {
        name = name.trim();
        if (!name.toLowerCase().endsWith(".py")) name += ".py";
        if (!fileContent[name]) {
            fileContent[name] = ""; 
            savedFileContent[name] = "";
            createNewTab(name);
        } else {
            alert("Ce fichier est déjà ouvert !");
        }
    }
});

openBtn.addEventListener('click', async () => {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Fichier Python', accept: {'text/python': ['.py']} }]
        });
        const file = await handle.getFile();
        const name = file.name;
        const content = await file.text();
        const tabs = Array.from(document.querySelectorAll('.tab-title'));
        const existing = tabs.find(t => t.innerText.replace('*','') === name);

        if (existing) {
            activateTab(existing.parentElement);
        } else {
            fileContent[name] = content;
            savedFileContent[name] = content;
            fileHandles[name] = handle;
            createNewTab(name);
        }
    } catch (err) { console.log("Ouverture annulée"); }
});

saveBtn.addEventListener('click', saveFile);

/* --- MODE & RUN --- */

modeBtn.addEventListener('click', () => {
    isStudentMode = !isStudentMode;
    modeBtn.src = isStudentMode ? "images/student_icon2.gif" : "images/pro_icon3.gif";
});

runBtn.addEventListener('click', () => {
    if (isRunning) return;

    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
        logToConsole("Erreur : Aucun fichier ouvert !", "error");
        return;
    }

    const fileName = activeTab.querySelector('.tab-title').innerText.replace('*', '');
    
    isRunning = true;
    runBtn.src = "images/stop_icon2.gif";

    logToConsole(`Lancement de ${fileName}...`, "info");

    setTimeout(() => {
        runBtn.src = "images/run_icon2.gif";
        isRunning = false;
        
        logToConsole(`Exécution de ${fileName} terminée avec succès.`, "success");
    }, 2000);
});

// Update mode
modeBtn.addEventListener('click', () => {
    isStudentMode = !isStudentMode;
    modeBtn.src = isStudentMode ? "images/student_icon2.gif" : "images/pro_icon3.gif";
    statusMode.innerText = isStudentMode ? "Mode Étudiant" : "Mode Expert";
});

/* --- RACCOURCIS CLAVIER --- */

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
    }
});