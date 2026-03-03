import { logError, logDebug } from '../core/debug.js';

export function initControls(state, engine, speechSys) {
    const btnMic = document.getElementById('btn-mic');

    if (!btnMic) {
        logError("CRITICAL: btn-mic element not found in DOM! Controls binding failed.");
        return;
    }

    logDebug("btn-mic found. Binding Voice Controls.");

    btnMic.onclick = async () => {
        btnMic.disabled = true;

        if (!state.audioCtx) {
            // FIRST TIME CLICK - Browser needs explicit user interaction permission here
            try {
                logDebug("Requesting Mic Permission...");
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                state.analyser = state.audioCtx.createAnalyser();
                state.analyser.fftSize = 256;
                state.audioCtx.createMediaStreamSource(stream).connect(state.analyser);
                state.freqData = new Uint8Array(state.analyser.frequencyBinCount);

                state.audioActive = true;
                logDebug("Mic Authorized. Starting internal Speech Engine...");

                // Exclusively use standard APIs we defined
                if (speechSys) {
                    // Inform speech system that a user gesture occurred (required by browsers)
                    if (typeof speechSys.markUserGesture === 'function') speechSys.markUserGesture();
                    speechSys.startListening(true);
                    speechSys.speak('تم ربط الشبكة العصبية بنجاح');
                }

                btnMic.classList.add('active');
                const audVal = document.getElementById('audio-val');
                if (audVal) audVal.innerText = 'ON CORE';

            } catch (e) {
                logError("Mic Initialization Fatal Error: " + e.message);
                alert("للأسف، يجب إصدار الموافقة على استخدام الميكروفون.");
            } finally {
                btnMic.disabled = false;
            }
        } else {
            // TOGGLE ON/OFF
            try {
                if (state.audioActive) {
                    await state.audioCtx.suspend();
                    state.audioActive = false;

                    if (speechSys) speechSys.stopListening();

                    btnMic.classList.remove('active');
                    const audVal = document.getElementById('audio-val');
                    if (audVal) audVal.innerText = 'OFF';
                    logDebug("Audio System suspended via toggle.");
                } else {
                    await state.audioCtx.resume();
                    state.audioActive = true;

                    // Resume via Explicit method (user gesture already present)
                    if (speechSys) speechSys.startListening(true);

                    btnMic.classList.add('active');
                    const audVal = document.getElementById('audio-val');
                    if (audVal) audVal.innerText = 'ON CORE';
                    logDebug("Audio System resumed via toggle.");
                }
            } catch (e) {
                logError("Audio Toggle Framework Failed: " + e);
            } finally {
                btnMic.disabled = false;
            }
        }
    };

    const btnSnap = document.getElementById('btn-screenshot');
    if (btnSnap) {
        btnSnap.onclick = () => {
            try {
                engine.renderer.render(engine.scene, engine.camera);
                const link = document.createElement('a');
                link.download = 'Brain_Interface.png';
                link.href = engine.renderer.domElement.toDataURL();
                link.click();
            } catch (e) {
                logError("Screenshot Failed: " + e);
            }
        };
    }

    const btnRec = document.getElementById('btn-record');
    let recorder, chunks = [];
    if (btnRec) {
        btnRec.onclick = (e) => {
            try {
                if (recorder && recorder.state === 'recording') return;
                const stream = engine.renderer.domElement.captureStream(60);
                recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                recorder.ondataavailable = ev => chunks.push(ev.data);
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    chunks = [];
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'Brain_Interface.webm';
                    a.click();
                    e.target.innerText = '🔴 تسجيل مرئي';
                    e.target.style.color = '';
                };
                recorder.start();
                e.target.innerText = '...RECORDING...';
                e.target.style.color = 'red';
                setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 30000);
            } catch (err) {
                logError("Recording Error: " + err);
            }
        };
    }
}
