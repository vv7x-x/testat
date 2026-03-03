export function initDebug() {
    window.APP_ERRORS = [];
    window.onerror = function (msg, url, line, col, error) { logError(msg); return false; };
    window.onunhandledrejection = function (event) { logError(event.reason); };
}

export function logDebug(msg) {
    console.log('[SYSTEM INIT] ', msg);
    const debugLog = document.getElementById('debug-log');
    if (debugLog) {
        const div = document.createElement('div');
        div.innerText = `> ${msg}`;
        debugLog.appendChild(div);
        debugLog.scrollTop = debugLog.scrollHeight;
    }
}

export function logError(err) {
    console.error('[CRITICAL ERROR]', err);
    if (window.APP_ERRORS) window.APP_ERRORS.push(err);
    logDebug(`ERROR: ${err.message || err}`);
}

export function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
export function isValidNumber(n) { return typeof n === 'number' && !isNaN(n) && isFinite(n); }
