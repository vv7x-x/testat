import { logError, logDebug } from '../core/debug.js';
import { parseIntent } from './nlp.js';

export class SpeechSystem {
    constructor(state, engine, particles) {
        this.state = state;
        this.engine = engine;
        this.particles = particles;
        this.isRecogRunning = false;
        this.shouldListen = false; // Source of truth

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            logError("Speech Recognition API is NOT supported in this browser.");
            return;
        }

        try {
            this.recog = new SpeechRec();
            this.recog.lang = 'ar-EG';
            this.recog.continuous = true;
            this.recog.interimResults = true;
            this.synth = window.speechSynthesis;

            // Events
            this.recog.onstart = () => {
                this.isRecogRunning = true;
                logDebug("Speech Rec: Started actively listening.");
                const el = document.getElementById('ai-speech-text');
                if (el) el.innerText = ">> تم تفعيل الميكروفون... أستمع لك <<";
            };

            this.recog.onerror = (e) => {
                this.isRecogRunning = false;
                logError(`Speech Rec Error: [${e.error}] - ${e.message || ''}`);
                // Stop trying if browser denied permission
                if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                    this.shouldListen = false;
                }
            };

            this.recog.onend = () => {
                this.isRecogRunning = false;
                logDebug("Speech Rec: Connection ended.");

                // Intelligent Auto-Restart with safety delay
                if (this.shouldListen && this.state.audioActive) {
                    setTimeout(() => {
                        if (this.shouldListen && !this.isRecogRunning) {
                            try {
                                logDebug("Speech Rec: Attempting Auto-restart...");
                                this.recog.start();
                            } catch (err) {
                                logError("Speech Auto-Restart System Blocked: " + err);
                            }
                        }
                    }, 400); // Prevents infinite loop freezing
                }
            };

            this.recog.onresult = (e) => {
                let text = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    text += e.results[i][0].transcript;
                }

                const el = document.getElementById('ai-speech-text');
                if (el && text) el.innerText = text;

                this.state.speechSync = 1.0;

                // Only trigger intent on final phrase
                if (e.results.length > 0 && e.results[e.results.length - 1].isFinal) {
                    this.onCommand(text);
                }
            };

            logDebug("SpeechSystem constructed successfully.");
        } catch (e) {
            logError("Speech Setup Critical Failure: " + e);
        }
    }

    onCommand(text) {
        logDebug("Detected Final Speech: " + text);
        parseIntent(text, this.state, this.engine, this.particles, (txt) => this.speak(txt));
        this.renderTextToParticles(text);
    }

    startListening() {
        if (!this.recog) {
            logError("Speech start failed: No recog engine.");
            return;
        }
        this.shouldListen = true;
        if (!this.isRecogRunning) {
            try {
                this.recog.start();
                logDebug("Speech Rec: Manual Start triggered by UI.");
            } catch (err) {
                logError("Speech Start Blocked: (" + err.name + ") " + err.message);
            }
        }
    }

    stopListening() {
        if (!this.recog) return;
        this.shouldListen = false;
        if (this.isRecogRunning) {
            try {
                this.recog.stop();
                logDebug("Speech Rec: Manual Stop triggered by UI.");
            } catch (err) {
                logError("Speech Stop Blocked: " + err);
            }
        }
    }

    speak(txt) {
        if (!this.synth) return;
        try {
            if (this.synth.speaking) this.synth.cancel();
            const u = new SpeechSynthesisUtterance(txt);
            u.lang = 'ar-SA';
            u.rate = 1.1;
            u.pitch = 0.8;
            this.synth.speak(u);
        } catch (e) {
            logError("Synthesis Failed: " + e);
        }
    }

    renderTextToParticles(text) {
        if (!this.particles || !this.particles.textTexture) return;
        try {
            this.state.mode = 2;
            const canvas = document.getElementById('text-canvas');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, 1024, 1024);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 120px Tajawal';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let lines = [];
            if (text.length > 20) {
                const mid = Math.floor(text.length / 2);
                lines.push(text.substring(0, mid));
                lines.push(text.substring(mid));
            } else {
                lines.push(text);
            }

            lines.forEach((l, i) => ctx.fillText(l, 512, 450 + (i * 140)));
            const imgData = ctx.getImageData(0, 0, 1024, 1024).data;
            const texData = this.particles.textTexture.image.data;

            let validPixels = [];
            for (let i = 0; i < imgData.length; i += 4) {
                if (imgData[i] > 100) validPixels.push({ x: (i / 4) % 1024, y: Math.floor((i / 4) / 1024) });
            }

            if (validPixels.length > 0) {
                for (let i = 0; i < texData.length; i += 4) {
                    let rp = validPixels[Math.floor(Math.random() * validPixels.length)];
                    texData[i] = (rp.x - 512) * 0.06;
                    texData[i + 1] = -(rp.y - 512) * 0.06;
                    texData[i + 2] = (Math.random() - 0.5) * 3.0;
                    texData[i + 3] = 1.0;
                }
            }
            this.particles.textTexture.needsUpdate = true;

            if (this.nlpTimeout) clearTimeout(this.nlpTimeout);
            this.nlpTimeout = setTimeout(() => { this.state.mode = 0; }, 4000);
        } catch (e) {
            logError("Text Render to Particles Failed: " + e);
        }
    }
}
