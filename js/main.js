import * as THREE from 'three';
import { initDebug, logDebug, logError, clamp, isValidNumber } from './core/debug.js';
import { Engine } from './core/engine.js';
import { ParticleSystem } from './core/particles.js';
import { SpeechSystem } from './ai/speech.js';
import { PerformanceGovernor } from './core/performanceGovernor.js';
import { HandTracking } from './mediapipe/handTracking.js';
import { initControls } from './ui/controls.js';

class AICore {
    constructor() {
        initDebug();
        try {
            logDebug("AICore Booting Modular Architecture...");
            this.state = {
                intent: 0, theme: 'default', mode: 0, scale: 1.0, energy: 0.0,
                h1: new THREE.Vector3(), h2: new THREE.Vector3(), hd1: 0, hd2: 0,
                audioBass: 0, audioMid: 0, speechSync: 0, audioActive: false
            };
            this.clock = new THREE.Clock();

            this.loadUIComponents().then(() => {
                this.initSystems();
            }).catch(e => {
                logError("Failed to fetch UI Components. " + e);
            });

        } catch (e) { logError(e); }
    }

    async loadUIComponents() {
        try {
            const res = await fetch('components/ui.html');
            if (!res.ok) throw new Error("Could not load ui.html code: " + res.status);
            const html = await res.text();

            const uiLayer = document.getElementById('ui-layer');
            if (uiLayer) {
                uiLayer.innerHTML = html;
                logDebug("UI fully mounted into DOM.");
            } else {
                logError("ui-layer not found in index.html");
            }
        } catch (e) {
            logError("UI Fetch failed: " + e.message);
        }
    }

    initSystems() {
        // Ensuring Engine & Particles load blindly first
        this.engine = new Engine();
        this.particles = new ParticleSystem(this.engine);

        // Boot-time performance governor: detect GPU and apply conservative preset
        try {
            this.governor = new PerformanceGovernor(this.engine);
            this.activePreset = this.governor.applyPreset(this.particles);
        } catch (e) { /* non-fatal */ }

        // At this specific point, loadUIComponents was awaited. 
        // We know for a fact controls exist in the DOM now.
        this.speechSys = new SpeechSystem(this.state, this.engine, this.particles);

        // Send control logic. It grabs buttons by ID, so they must be in DOM!
        initControls(this.state, this.engine, this.speechSys);

        // Optionally skip MediaPipe if governor disabled it
        const shouldUseMediaPipe = (this.engine && this.engine.__enableMediaPipe !== false);
        if (shouldUseMediaPipe) {
            const handTracking = new HandTracking(this.state);
            handTracking.load().then(() => {
                logDebug('MediaPipe Loaded.');
                handTracking.init();
                this.completeBoot();
            }).catch(e => {
                logError('MediaPipe disabled. Proceeding.');
                this.completeBoot();
            });
        } else {
            logDebug('MediaPipe skipped by PerformanceGovernor.');
            this.completeBoot();
        }

        logDebug('Starting Frame Loop.');
        // FPS sampler state
        this._fpsBuffer = new Float32Array(60);
        this._fpsIdx = 0; this._fpsFilled = false; this._lastFpsSampleTime = performance.now();
        this._lastPixelRatio = this.engine.renderer.getPixelRatio();
        this.animate();
    }

    completeBoot() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                const uiLayer = document.getElementById('ui-layer');
                if (uiLayer) uiLayer.classList.remove('hidden');
            }, 1000);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        try {
            if (!this.engine || !this.particles) return;

            const dtR = this.clock.getDelta(); const timeR = this.clock.getElapsedTime();
            const dt = clamp(dtR, 0.001, 0.1); const time = clamp(timeR, 0.0, 100000.0);

            if (this.state.audioActive && this.state.analyser && this.state.freqData) {
                this.state.analyser.getByteFrequencyData(this.state.freqData);
                let b = 0, m = 0;
                for (let i = 0; i < 5; i++) if (this.state.freqData[i]) b += this.state.freqData[i];
                for (let i = 20; i < 40; i++) if (this.state.freqData[i]) m += this.state.freqData[i];
                this.state.audioBass += ((b / 5 / 255) - this.state.audioBass) * 0.2;
                this.state.audioMid += ((m / 20 / 255) - this.state.audioMid) * 0.2;
                if (this.particles.brainMat && this.particles.brainMat.uniforms.intensity)
                    this.particles.brainMat.uniforms.intensity.value = 1.0 + this.state.audioBass * 2.0;
                if (this.particles.coreGrp && this.particles.coreGrp.children[0]) {
                    const scaleC = clamp(1.0 + this.state.audioBass * 0.5, 0.1, 5.0);
                    this.particles.coreGrp.children[0].scale.set(scaleC, scaleC, scaleC);
                }
            }

            this.state.speechSync *= 0.95; this.state.energy *= 0.95;
            if (this.engine.bloomPass) this.engine.bloomPass.strength += (1.8 - this.engine.bloomPass.strength) * 0.05;
            if (this.engine.neuralPass) {
                this.engine.neuralPass.uniforms.uTime.value = time;
                this.engine.neuralPass.uniforms.uIntensity.value = Math.max(0, 1.0 + this.state.speechSync * 5.0 + this.state.energy);
                this.engine.neuralPass.uniforms.uDistortion.value = Math.max(0, this.state.speechSync);
            }

            if (this.particles.coreGrp && this.particles.coreGrp.children) {
                for (let i = 1; i <= 3; i++) {
                    let r = this.particles.coreGrp.children[i];
                    if (r && r.userData) {
                        let speedM = (this.state.intent === 2) ? 5.0 : 1.0;
                        r.rotation.x += (r.userData.rx || 0.001) * speedM; r.rotation.y += (r.userData.ry || 0.001) * speedM;
                    }
                }
            }
            this.particles.update(dt, time, this.state);

            const uiLayer = document.getElementById('ui-layer');
            if (uiLayer && uiLayer.classList.contains('hidden')) {
                this.engine.camera.position.x = Math.sin(time * 0.1) * 15;
                this.engine.camera.position.z = Math.cos(time * 0.1) * 30 + 10;
                this.engine.camera.lookAt(0, 0, 0);
            } else {
                this.engine.camera.position.x += (Math.sin(time * 0.5) * 2.0 - this.engine.camera.position.x) * 0.05;
                this.engine.camera.position.z += (40 - this.engine.camera.position.z) * 0.05;
                this.engine.camera.lookAt(0, 0, 0);
            }

            this.engine.render(time);

            // === Adaptive Dynamic Resolution (FPS sampler & DPR adjustment) ===
            // record an FPS sample into ring buffer
            const fps = Math.min(240, 1 / dt);
            this._fpsBuffer[this._fpsIdx] = fps; this._fpsIdx = (this._fpsIdx + 1) % this._fpsBuffer.length;
            if (this._fpsIdx === 0) this._fpsFilled = true;

            // sample at most once per second to make decisions
            const nowMs = performance.now();
            if ((nowMs - this._lastFpsSampleTime) >= 1000) {
                this._lastFpsSampleTime = nowMs;
                // compute average of buffer entries present
                const count = this._fpsFilled ? this._fpsBuffer.length : this._fpsIdx;
                let sum = 0; for (let i = 0; i < count; i++) sum += this._fpsBuffer[i] || 0;
                const avgFPS = (count > 0) ? (sum / count) : (1 / dt);

                // adjust pixel ratio adaptively
                let pr = this.engine.renderer.getPixelRatio();
                if (avgFPS < 35 && pr > 0.5) {
                    pr = Math.max(0.5, pr - 0.1);
                    this.engine.setPixelRatio(pr);
                } else if (avgFPS > 55 && pr < (window.devicePixelRatio || 1.0)) {
                    pr = Math.min(window.devicePixelRatio || 1.0, pr + 0.1);
                    this.engine.setPixelRatio(pr);
                }

                // gentle adaptive particle scaling based on fps (requests only)
                try {
                    if (this.governor && this.governor.preset && this.particles && typeof this.particles.setMaxDrawCount === 'function') {
                        const base = this.governor.preset.maxParticles || (512 * 512);
                        // scale target linearly between min and base
                        let scaleRatio = Math.min(1.0, avgFPS / 60.0);
                        // if very low FPS, aggressively reduce
                        if (avgFPS < 30) scaleRatio *= 0.6;
                        const newTarget = Math.max(this.particles.minDrawCount || 30000, Math.floor(base * scaleRatio));
                        this.particles.setMaxDrawCount(newTarget);
                    }
                } catch (e) { logError('Adaptive particle scaling failed: ' + e); }
            }

            // UI Rate Limiter
            if (Math.random() > 0.95) {
                const fpsVal = document.getElementById('fps-val');
                if (fpsVal) fpsVal.innerText = Math.round(1 / dt);

                const mdVal = document.getElementById('mode-val');
                if (mdVal) {
                    let mStr = ['CALM', 'SPLIT LINK', 'NEURAL TEXT'][this.state.mode];
                    mdVal.innerText = mStr || 'UNKNOWN';
                }
            }
        } catch (e) { logError("Render Loop Error: " + e.message); }
    }
}
window.onload = () => { new AICore(); };
