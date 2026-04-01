/* --- SÉLECTEURS --- */
const modeBtn = document.getElementById('mode-btn');
const saveBtn = document.getElementById('save-btn');
const runBtn = document.getElementById('run-btn');
const openBtn = document.getElementById('open-btn');
const fileInput = document.getElementById('file-input');
const newFileBtn = document.getElementById('new-file-btn');
const tabsContainer = document.getElementById('tabs-container');
const editorContainer = document.getElementById('editor-container');
const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const statusMode = document.getElementById('status-mode');
const statusPosition = document.getElementById('status-position');

/* --- ÉTAT DE L'APPLICATION --- */
window.isStudentMode = true;
window.isPyodideReady = false;
window.pyodide = null;
let isRunning = false;
let fileContent = {};
let savedFileContent = {}; 
let fileHandles = {};

// Fonction pour charger Pyodide au démarrage
async function initPyodide() {
    logToConsole("Chargement du moteur Python...", "info");
    try {
        window.pyodide = await loadPyodide({
            stdout: (text) => logToConsole(text, "info"),
            stderr: (text) => logToConsole(text, "error")
        });

        const response = await fetch("mrpython.zip");
        const buffer = await response.arrayBuffer();
        window.pyodide.unpackArchive(buffer, "zip");

        window.pyodide.runPython(`
import sys
import os
if os.path.exists('mrpython'):
    sys.path.append(os.path.abspath('mrpython'))
sys.path.append('.')
        `.trim());

        window.isPyodideReady = true;
        logToConsole("MrPython est prêt et chargé !", "success");
    } catch (err) {
        logToConsole("Erreur d'initialisation : " + err, "error");
    }
}

initPyodide();

/* --- FONCTIONS --- */

function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    lineNumbers.innerHTML = Array(lines).fill(0).map((_, i) => `<span>${i + 1}</span>`).join('');
}

function updateTabStatus(tabElement, fileName) {
    const titleSpan = tabElement.querySelector('.tab-title');
    const isDirty = fileContent[fileName] !== savedFileContent[fileName];
    titleSpan.innerText = isDirty ? fileName + "*" : fileName;
}

function activateTab(tabElement) {
    if (!tabElement) return;
    const titleSpan = tabElement.querySelector('.tab-title');
    const fileName = titleSpan.innerText.replace('*', '');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabElement.classList.add('active');
    editorContainer.style.display = 'flex';
    editor.value = fileContent[fileName] || "";
    updateTabStatus(tabElement, fileName);
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

function createNewTab(fileName) {
    const newTab = document.createElement('div');
    newTab.className = 'tab'; 
    newTab.innerHTML = `<span class="tab-title">${fileName}</span><span class="close-tab">×</span>`;
    newTab.addEventListener('click', () => activateTab(newTab));
    newTab.querySelector('.close-tab').addEventListener('click', (e) => {
        e.stopPropagation();
        if (newTab.querySelector('.tab-title').innerText.endsWith('*')) {
            if (!confirm("Fichier non sauvegardé. Fermer quand même ?")) return;
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

async function saveFile() {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;
    
    const titleSpan = activeTab.querySelector('.tab-title');
    const fileName = titleSpan.innerText.replace('*', '');
    const content = editor.value;

    // ESSAI MÉTHODE 1 : Sauvegarde directe
    if (window.showSaveFilePicker) {
        try {
            let handle = fileHandles[fileName];
            if (!handle) {
                handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: 'Python Files', accept: { 'text/x-python': ['.py'] } }],
                });
                fileHandles[fileName] = handle;
            }
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            
            confirmSave(activeTab, fileName, content);
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn("Méthode moderne bloquée, passage au téléchargement.");
        }
    }

    // MÉTHODE 2 : Téléchargement
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName; 
    link.click();
    URL.revokeObjectURL(link.href);
    
    confirmSave(activeTab, fileName, content);
}

function confirmSave(tabElement, fileName, content) {
    savedFileContent[fileName] = content;
    updateTabStatus(tabElement, fileName);
}

function handleOpenFile(name, content, handle) {
    if (!fileContent[name]) {
        fileContent[name] = content;
        savedFileContent[name] = content;
        if (handle) fileHandles[name] = handle;
        createNewTab(name);
    } else {
        const tabs = Array.from(document.querySelectorAll('.tab-title'));
        const existingTab = tabs.find(t => t.innerText.replace('*','') === name);
        if (existingTab) activateTab(existingTab.parentElement);
    }
}

/* --- ÉVÉNEMENTS --- */

editor.addEventListener('input', () => {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const titleSpan = activeTab.querySelector('.tab-title');
        const fileName = titleSpan.innerText.replace('*', '');
        fileContent[fileName] = editor.value;
        updateTabStatus(activeTab, fileName);
    }
    updateLineNumbers();
});

editor.addEventListener('click', updateCursorInfo);
editor.addEventListener('keyup', updateCursorInfo);

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
    // MÉTHODE 1 : Chrome, Edge
    if (window.showOpenFilePicker) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{ description: 'Python Files', accept: { 'text/x-python': ['.py'] } }],
                multiple: false
            });
            const file = await handle.getFile();
            const content = await file.text();
            handleOpenFile(file.name, content, handle);
            return;
        } catch (err) {
            if (err.name !== 'AbortError') console.error(err);
        }
    }
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        handleOpenFile(file.name, event.target.result, null);
    };
    reader.readAsText(file);
    fileInput.value = "";
});

saveBtn.addEventListener('click', saveFile);

modeBtn.addEventListener('click', () => {
    window.isStudentMode = !window.isStudentMode;
    modeBtn.src = window.isStudentMode ? "images/student_icon2.gif" : "images/pro_icon3.gif";
    statusMode.innerText = window.isStudentMode ? "Mode Étudiant" : "Mode Expert";
    logToConsole(`Passage en ${window.isStudentMode ? "Mode Étudiant" : "Mode Expert"}`, "info");
});

runBtn.addEventListener('click', async () => {
    if (!window.isPyodideReady || isRunning) return;
    
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;

    const fileName = activeTab.querySelector('.tab-title').innerText.replace('*', '');
    const code = editor.value;

    isRunning = true;
    runBtn.src = "images/stop_icon2.gif";
    logToConsole(`Analyse et exécution de ${fileName}...`, "info");

    try {
        window.pyodide.globals.set("web_code", code);
        window.pyodide.globals.set("web_filename", fileName);
        window.pyodide.globals.set("is_student", window.isStudentMode);

        const result = await window.pyodide.runPythonAsync(`
import main_web
import json
res = main_web.run_from_web(web_filename, web_code, is_student)
json.dumps(res)
        `.trim());

        const response = JSON.parse(result);

        if (response.errors_list) {
            response.errors_list.forEach(err => logToConsole(err, "error"));
        }

        if (response.feedback) {
            response.feedback.forEach(msg => logToConsole(msg, "success"));
        }

        if (response.output) {
            logToConsole(response.output, "info");
        }

        if (window.isStudentMode && response.success) {
            logToConsole(`==> Les ${response.nb_tests} tests sont passés avec succès`, "success");
        }

    } catch (err) {
        logToConsole("Erreur : " + err, "error");
    } finally {
        runBtn.src = "images/run_icon2.gif";
        isRunning = false;
    }
});

/* --- RACCOURCIS CLAVIER --- */
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
    }
});

/* --- SÉCURITÉ FERMETURE FENÊTRE --- */

window.addEventListener('beforeunload', (e) => {
    const filenames = Object.keys(fileContent);
    const hasUnsavedChanges = filenames.some(name => {
        return fileContent[name] !== savedFileContent[name];
    });

    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; 
        return ''; 
    }
});