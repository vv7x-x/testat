import { logError } from '../core/debug.js';
import { parseIntent } from './nlp.js';

export class SpeechSystem {
    constructor(state, engine, particles) {
        this.state = state; this.engine = engine; this.particles = particles;
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) { logError("Speech Recognition API is NOT supported."); return; }
        try {
            this.recog = new SpeechRec(); this.recog.lang = 'ar-EG';
            this.recog.continuous = true; this.recog.interimResults = true;
            this.synth = window.speechSynthesis; this.isRecogRunning = false;

            this.recog.onstart = () => { this.isRecogRunning = true; };
            this.recog.onerror = (e) => { this.isRecogRunning = false; };
            this.recog.onend = () => {
                this.isRecogRunning = false;
                if (this.state.audioActive && !this.isRecogRunning) {
                    try { this.recog.start(); } catch (err) { }
                }
            };
            this.recog.onresult = (e) => {
                let text = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) text += e.results[i][0].transcript;
                const el = document.getElementById('ai-speech-text');
                if (el && text) el.innerText = text;
                this.state.speechSync = 1.0;
                if (e.results.length > 0 && e.results[e.results.length - 1].isFinal) {
                    parseIntent(text, this.state, this.engine, this.particles, (txt) => this.speak(txt));
                    this.renderTextToParticles(text);
                }
            };
        } catch (e) { logError("Speech Setup Failed: " + e); }
    }
    speak(txt) {
        if (!this.synth) return;
        try {
            if (this.synth.speaking) this.synth.cancel();
            const u = new SpeechSynthesisUtterance(txt);
            u.lang = 'ar-SA'; u.rate = 1.1; u.pitch = 0.8;
            this.synth.speak(u);
        } catch (e) { }
    }
    renderTextToParticles(text) {
        if (!this.particles || !this.particles.textTexture) return;
        try {
            this.state.mode = 2;
            const canvas = document.getElementById('text-canvas');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 1024, 1024);
            ctx.fillStyle = 'white'; ctx.font = 'bold 120px Tajawal';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            let lines = [];
            if (text.length > 20) { lines.push(text.substring(0, Math.floor(text.length / 2))); lines.push(text.substring(Math.floor(text.length / 2))); }
            else lines.push(text);
            lines.forEach((l, i) => ctx.fillText(l, 512, 450 + (i * 140)));
            const imgData = ctx.getImageData(0, 0, 1024, 1024).data;
            const texData = this.particles.textTexture.image.data;
            let validPixels = [];
            for (let i = 0; i < imgData.length; i += 4) if (imgData[i] > 100) validPixels.push({ x: (i / 4) % 1024, y: Math.floor((i / 4) / 1024) });
            if (validPixels.length > 0) {
                for (let i = 0; i < texData.length; i += 4) {
                    let rp = validPixels[Math.floor(Math.random() * validPixels.length)];
                    texData[i] = (rp.x - 512) * 0.06; texData[i + 1] = -(rp.y - 512) * 0.06;
                    texData[i + 2] = (Math.random() - 0.5) * 3.0; texData[i + 3] = 1.0;
                }
            }
            this.particles.textTexture.needsUpdate = true;
            if (this.nlpTimeout) clearTimeout(this.nlpTimeout);
            this.nlpTimeout = setTimeout(() => { this.state.mode = 0; }, 4000);
        } catch (e) { logError("Text Render Failed: " + e); }
    }
}
