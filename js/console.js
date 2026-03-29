const consoleContent = document.getElementById('console-content');
const clearBtn = document.getElementById('clear-console');
const evalInput = document.getElementById('eval-input');
const evalBtn = document.getElementById('eval-btn');

// --- GESTION DE L'HISTORIQUE ---
let historique = [];
let historiqueIndex = -1;

function logToConsole(message, type = 'info') {
    const line = document.createElement('div');
    line.className = `log-${type}`;
    
    line.innerHTML = `<span class="prompt">>>></span> ${message}`;
    
    consoleContent.appendChild(line);
    
    consoleContent.scrollTop = consoleContent.scrollHeight;
}

async function evaluerCommande() {
    const command = evalInput.value.trim();
    if (command === "" || !window.isPyodideReady) return;

    logToConsole(command, "info"); 
    evalInput.value = ""; 

    try {
        window.pyodide.globals.set("cmd_to_run", command);
        
        const resultJson = await window.pyodide.runPythonAsync(`
import main_web
import json
res = main_web.evaluate_console(cmd_to_run)
json.dumps(res)
        `.trim());

        const response = JSON.parse(resultJson);

        if (response.output) {
            logToConsole(response.output, "info");
        }

        if (response.result && response.result !== "None") {
            logToConsole(response.result, "info");
        }

        if (response.error) {
            logToConsole("Erreur : " + response.error, "error");
        }

    } catch (err) {
        logToConsole("Erreur console : " + err, "error");
    }
}

// --- ÉVÉNEMENTS ---

clearBtn.addEventListener('click', () => {
    consoleContent.innerHTML = '';
});

evalBtn.addEventListener('click', evaluerCommande);

evalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        evaluerCommande();
    } 
    else if (e.key === 'ArrowUp') {
        if (historique.length > 0 && historiqueIndex > 0) {
            historiqueIndex--;
            evalInput.value = historique[historiqueIndex];
            setTimeout(() => evalInput.setSelectionRange(evalInput.value.length, evalInput.value.length), 0);
        }
    } 
    else if (e.key === 'ArrowDown') {
        if (historiqueIndex < historique.length - 1) {
            historiqueIndex++;
            evalInput.value = historique[historiqueIndex];
        } else {
            historiqueIndex = historique.length;
            evalInput.value = "";
        }
    }
});