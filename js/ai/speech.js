import { logError, logDebug } from '../core/debug.js';
import { parseIntent } from './nlp.js';

export class SpeechSystem {
    constructor(state, engine, particles) {
        this.state = state;
        this.engine = engine;
        this.particles = particles;

        // Recognition & synthesis handles
        this.recog = null;
        this.synth = window.speechSynthesis || null;

        // control flags
        this.isRecogRunning = false;
        this.shouldListen = false; // desired state
        this.userGestureSeen = false; // only start after user gesture
        this.startInProgress = false;

        // auto-restart protection
        this.restartAttempts = [];
        this.maxRestarts = 4; // max restarts in window
        this.restartWindow = 60000; // 60s window

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            logError('Speech Recognition API is NOT supported in this browser.');
            return;
        }

        try {
            this.recog = new SpeechRec();
            this.recog.lang = 'ar-EG';
            this.recog.continuous = true;
            this.recog.interimResults = true;

            // events
            this.recog.onstart = () => {
                this.isRecogRunning = true;
                this.startInProgress = false;
                document.body.classList.add('listening');
                logDebug('Speech Rec: started');
                const el = document.getElementById('ai-speech-text'); if (el) el.innerText = '>> تم تفعيل الميكروفون... أستمع لك <<';
            };

            this.recog.onerror = (e) => {
                this.isRecogRunning = false;
                logError(`Speech Rec Error: [${e.error}] - ${e.message || ''}`);
                // permission denied - disable
                if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                    this.shouldListen = false;
                }
            };

            this.recog.onend = () => {
                this.isRecogRunning = false;
                document.body.classList.remove('listening');
                logDebug('Speech Rec: ended');

                // avoid restarts when tab hidden or user turned off
                if (!this.shouldListen) return;
                if (document.hidden) {
                    // will be restarted when visibility returns
                    return;
                }

                // throttle restarts with a sliding window
                const now = Date.now();
                this.restartAttempts.push(now);
                // keep only attempts within window
                this.restartAttempts = this.restartAttempts.filter(t => (now - t) < this.restartWindow);
                if (this.restartAttempts.length > this.maxRestarts) {
                    logError('Speech Rec: too many restart attempts, disabling auto-restart temporarily.');
                    this.shouldListen = false;
                    return;
                }

                // safe delayed restart
                setTimeout(() => {
                    if (this.shouldListen && !this.isRecogRunning) {
                        try {
                            logDebug('Speech Rec: auto-restarting');
                            this.recog.start();
                        } catch (err) { logError('Speech Auto-Restart Blocked: ' + err); }
                    }
                }, 500 + Math.floor(Math.random() * 600));
            };

            this.recog.onresult = (e) => {
                let text = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) text += e.results[i][0].transcript;
                const el = document.getElementById('ai-speech-text'); if (el && text) el.innerText = text;

                // quick visual feedback
                this.state.speechSync = 1.0;

                // final result triggers intent parsing
                if (e.results.length > 0 && e.results[e.results.length - 1].isFinal) {
                    this.onCommand(text.trim());
                }
            };

            // synth lifecycle handlers
            if (this.synth) {
                this.synth.onstart = () => { document.body.classList.add('speaking'); };
                this.synth.onend = () => { document.body.classList.remove('speaking'); };
                this.synth.oncancel = () => { document.body.classList.remove('speaking'); };
            }

            // visibility handler to avoid crashes on tab switch
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this._wasListeningBeforeHidden = this.isRecogRunning;
                    if (this.isRecogRunning) {
                        try { this.recog.stop(); } catch (e) { /*ignore*/ }
                    }
                } else {
                    if (this._wasListeningBeforeHidden && this.shouldListen) {
                        try { this.recog.start(); } catch (e) { /*ignore*/ }
                    }
                }
            });

            logDebug('SpeechSystem constructed');
        } catch (e) {
            logError('Speech Setup Failure: ' + e);
        }
    }

    // Must be called by UI in response to a user click gesture before starting recognition
    markUserGesture() { this.userGestureSeen = true; }

    async startListening(userInitiated = false) {
        if (!this.recog) { logError('Speech start failed: no recognition available'); return; }
        if (!this.userGestureSeen && !userInitiated) {
            logDebug('startListening deferred until user gesture');
            return;
        }
        if (this.isRecogRunning || this.startInProgress) {
            logDebug('startListening ignored: already running');
            return;
        }

        this.shouldListen = true; this.startInProgress = true;
        // cancel any ongoing synthesis to avoid conflicts
        try { if (this.synth && this.synth.speaking) this.synth.cancel(); } catch (e) { /* ignore */ }

        try {
            await this.recog.start();
            logDebug('Speech manual start requested');
        } catch (err) {
            this.startInProgress = false;
            logError('Speech Start Blocked: ' + (err && (err.name || err.message) ? (err.name + ' ' + err.message) : err));
            // if not-allowed, ensure we stop trying
            if (err && err.name === 'NotAllowedError') this.shouldListen = false;
        }
    }

    stopListening() {
        if (!this.recog) return;
        this.shouldListen = false;
        try {
            if (this.isRecogRunning) this.recog.stop();
            logDebug('Speech manual stop');
        } catch (err) { logError('Speech Stop Blocked: ' + err); }
    }

    speak(txt) {
        if (!this.synth) return;
        try {
            // Always cancel any previous speech to avoid overlap
            if (this.synth.speaking) this.synth.cancel();
            const u = new SpeechSynthesisUtterance(txt);
            u.lang = 'ar-SA'; u.rate = 1.05; u.pitch = 0.9;
            this.synth.speak(u);
        } catch (e) { logError('Synthesis Failed: ' + e); }
    }

    onCommand(text) {
        try {
            logDebug('Final speech detected: ' + text);
            // let parseIntent update state.intent and other side effects
            parseIntent(text, this.state, this.engine, this.particles, (reply) => { try { this.speak(reply); } catch (e) { logError(e); } });
            // state.intent might be set by parseIntent; ensure mode maps sensibly
            if (typeof this.state.intent === 'number') {
                // quick mapping: intent -> mode (preserve existing semantics)
                this.state.mode = Math.min(2, Math.max(0, this.state.intent));
            }
            // Render the final text into particles (non-blocking)
            try { this.renderTextToParticles(text); } catch (e) { logError('renderTextToParticles failed: ' + e); }
        } catch (e) { logError('onCommand failed: ' + e); }
    }

    renderTextToParticles(text) {
        if (!this.particles || !this.particles.textTexture) return;
        try {
            this.state.mode = 2;
            const canvas = document.getElementById('text-canvas'); if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 1024, 1024);
            ctx.fillStyle = 'white'; ctx.font = 'bold 120px Tajawal'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

            let lines = [];
            if (text.length > 20) {
                const mid = Math.floor(text.length / 2);
                lines.push(text.substring(0, mid)); lines.push(text.substring(mid));
            } else lines.push(text);

            lines.forEach((l, i) => ctx.fillText(l, 512, 450 + (i * 140)));
            const imgData = ctx.getImageData(0, 0, 1024, 1024).data;
            const texData = this.particles.textTexture.image.data;

            let validPixels = [];
            for (let i = 0; i < imgData.length; i += 4) if (imgData[i] > 100) validPixels.push({ x: (i / 4) % 1024, y: Math.floor((i / 4) / 1024) });

            if (validPixels.length > 0) {
                for (let i = 0; i < texData.length; i += 4) {
                    let rp = validPixels[Math.floor(Math.random() * validPixels.length)];
                    texData[i] = (rp.x - 512) * 0.06; texData[i + 1] = -(rp.y - 512) * 0.06; texData[i + 2] = (Math.random() - 0.5) * 3.0; texData[i + 3] = 1.0;
                }
            }
            this.particles.textTexture.needsUpdate = true;

            if (this.nlpTimeout) clearTimeout(this.nlpTimeout);
            this.nlpTimeout = setTimeout(() => { this.state.mode = 0; }, 4000);
        } catch (e) { logError('Text Render to Particles Failed: ' + e); }
    }
}
