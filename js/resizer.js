const resizer = document.getElementById('resizer');
const consoleContainer = document.getElementById('console-container');
const statusBarHeight = 22;

let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
});

window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    let newHeight = window.innerHeight - e.clientY - statusBarHeight;

    if (newHeight > 50 && newHeight < window.innerHeight * 0.8) {
        consoleContainer.style.height = `${newHeight}px`;
    }
});

window.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
});