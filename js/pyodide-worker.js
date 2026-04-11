importScripts("https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js");

let pyodide;

async function loadPyodideAndPackages() {
    pyodide = await loadPyodide();

    try {
        const response = await fetch("../mrpython.zip");
        const buffer = await response.arrayBuffer();
        
        pyodide.unpackArchive(buffer, "zip");

        pyodide.runPython(`
import sys
import os
if os.path.exists('mrpython'):
    sys.path.append(os.path.abspath('mrpython'))
sys.path.append('.')
        `.trim());

        self.postMessage({ type: 'ready' });
    } catch (err) {
        self.postMessage({ type: 'error', content: "Erreur de chargement de l'archive: " + err });
    }
}

let pyodideReadyPromise = loadPyodideAndPackages();

self.onmessage = async (e) => {
    await pyodideReadyPromise;
    const { code, filename, is_student } = e.data;

    try {
        pyodide.globals.set("web_code", code);
        pyodide.globals.set("web_filename", filename);
        pyodide.globals.set("is_student", is_student);

        pyodide.setStdout({ batched: (text) => self.postMessage({ type: 'stdout', content: text }) });
        pyodide.setStderr({ batched: (text) => self.postMessage({ type: 'stderr', content: text }) });

        const result = await pyodide.runPythonAsync(`
import main_web
import json
res = main_web.run_from_web(web_filename, web_code, is_student)
json.dumps(res)
        `.trim());

        self.postMessage({ type: 'result', content: JSON.parse(result) });
    } catch (err) {
        self.postMessage({ type: 'error', content: err.message });
    }
};