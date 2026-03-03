import { logError } from '../core/debug.js';

export function initControls(state, engine, speechSys) {
    const btnMic = document.getElementById('btn-mic');
    if(btnMic) {
        btnMic.onclick = async () => {
            btnMic.disabled = true;
            if(!state.audioCtx) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
                    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    state.analyser = state.audioCtx.createAnalyser();
                    state.analyser.fftSize = 256;
                    state.audioCtx.createMediaStreamSource(stream).connect(state.analyser);
                    state.freqData = new Uint8Array(state.analyser.frequencyBinCount);
                    state.audioActive = true;
                    if(speechSys && speechSys.recog && !speechSys.isRecogRunning) speechSys.recog.start();
                    btnMic.classList.add('active');
                    document.getElementById('audio-val').innerText = 'ON CORE';
                    speechSys.speak('تم ربط الشبكة العصبية بنجاح');
                } catch(e) { logError("Mic Error: " + e.message); alert("يجب السماح بالصوت لاستخدام وظائف الذكاء."); }
                finally { btnMic.disabled = false; }
            } else {
                try {
                    if(state.audioActive) {
                        await state.audioCtx.suspend(); state.audioActive = false;
                        if(speechSys && speechSys.recog && speechSys.isRecogRunning) speechSys.recog.stop();
                        btnMic.classList.remove('active'); document.getElementById('audio-val').innerText = 'OFF';
                    } else {
                        await state.audioCtx.resume(); state.audioActive = true;
                        if(speechSys && speechSys.recog && !speechSys.isRecogRunning) speechSys.recog.start();
                        btnMic.classList.add('active'); document.getElementById('audio-val').innerText = 'ON CORE';
                    }
                } catch(e) { logError("Audio Toggle Failed: " + e); }
                finally { btnMic.disabled = false; }
            }
        };
    }

    const btnSnap = document.getElementById('btn-screenshot');
    if(btnSnap) {
        btnSnap.onclick = () => {
            try {
                engine.renderer.render(engine.scene, engine.camera);
                const link = document.createElement('a');
                link.download = 'VisualBrain.png'; link.href = engine.renderer.domElement.toDataURL(); link.click();
            } catch(e) { logError("Screenshot Failed: "+e); }
        };
    }

    const btnRec = document.getElementById('btn-record');
    let recorder, chunks = [];
    if(btnRec) {
        btnRec.onclick = (e) => {
            try {
                if(recorder && recorder.state === 'recording') return;
                const stream = engine.renderer.domElement.captureStream(60);
                recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                recorder.ondataavailable = ev => chunks.push(ev.data);
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' }); chunks = [];
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); 
                    a.download = 'VisualBrain.webm'; a.click(); e.target.innerText = '🔴 تسجيل مرئي'; e.target.style.color = '';
                };
                recorder.start(); e.target.innerText = '...RECORDING...'; e.target.style.color = 'red';
                setTimeout(() => { if(recorder.state === 'recording') recorder.stop(); }, 30000);
            } catch(err) { logError("Recording Error: "+err); }
        };
    }
}
