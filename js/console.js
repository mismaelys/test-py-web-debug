/* --- SÉLECTEURS --- */
const consoleContent = document.getElementById('console-content');
const clearBtn = document.getElementById('clear-console');
const evalInput = document.getElementById('eval-input');
const evalBtn = document.getElementById('eval-btn');

/* --- GESTION DE L'HISTORIQUE --- */
let historique = [];
let historiqueIndex = -1;

/**
 * Affiche un message dans la console.
 * Chaque ligne du message aura son propre prompt >>>
 */
function logToConsole(message, type = 'info') {
    if (message === null || message === undefined) return;

    const lines = message.toString().trim().split('\n');

    lines.forEach(lineText => {
        const line = document.createElement('div');
        line.className = `log-${type}`;
        
        const promptHTML = '<span class="prompt">>>></span> ';
        line.innerHTML = `${promptHTML}${lineText}`;
        
        consoleContent.appendChild(line);
    });
    
    consoleContent.scrollTop = consoleContent.scrollHeight;
}

/**
 * Envoie la commande à Python
 */
async function evaluerCommande() {
    const command = evalInput.value.trim();
    if (command === "" || !window.isPyodideReady) return;

    historique.push(command);
    historiqueIndex = historique.length;

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
            logToConsole(response.error, "error");
        }

    } catch (err) {
        logToConsole("Erreur interne : " + err, "error");
    }
}

/* --- ÉVÉNEMENTS --- */

// Bouton Clear
clearBtn.addEventListener('click', () => {
    consoleContent.innerHTML = '<div class="log-info"><span class="prompt">>>></span> Console effacée.</div>';
});

// Bouton Eval
evalBtn.addEventListener('click', evaluerCommande);

// Gestion du clavier (Entrée et Flèches)
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
        e.preventDefault();
    } 
    else if (e.key === 'ArrowDown') {
        if (historiqueIndex < historique.length - 1) {
            historiqueIndex++;
            evalInput.value = historique[historiqueIndex];
        } else {
            historiqueIndex = historique.length;
            evalInput.value = "";
        }
        e.preventDefault();
    }
});