import { logDebug, logError } from './debug.js';

export class PerformanceGovernor {
    constructor(engine) {
        this.engine = engine;
        this.gpuInfo = this.getGPUInfo();
        this.preset = this.determinePreset(this.gpuInfo);
        logDebug(`Performance Governor Init: GPU [${this.gpuInfo}] Preset: [${this.preset.name}]`);
    }

    // try to get a descriptive GPU string; fall back to renderer/unknown
    getGPUInfo() {
        try {
            const gl = this.engine.renderer.getContext();
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const info = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            return info || 'Unknown GPU';
        } catch (e) {
            return 'Unknown GPU';
        }
    }

    determinePreset(gpu) {
        const lowerGPU = (gpu || '').toLowerCase();
        // Very conservative, production-oriented presets
        if (lowerGPU.includes('apple m2') || lowerGPU.includes('apple m3') || lowerGPU.includes('rtx 3') || lowerGPU.includes('rtx 4') || lowerGPU.includes('rx 7')) {
            return { name: 'ULTRA', maxParticles: 262144, bloomStrength: 1.8, pixelRatio: Math.min(window.devicePixelRatio || 1.0, 2.0), enableMediaPipe: true };
        } else if (lowerGPU.includes('apple m1') || lowerGPU.includes('rtx 2') || lowerGPU.includes('rx 6') || lowerGPU.includes('gtx 1080')) {
            return { name: 'HIGH', maxParticles: 150000, bloomStrength: 1.5, pixelRatio: Math.min(window.devicePixelRatio || 1.0, 1.5), enableMediaPipe: true };
        } else if (lowerGPU.includes('intel') || lowerGPU.includes('uhd') || lowerGPU.includes('iris') || lowerGPU.includes('radeon vega')) {
            return { name: 'LOW', maxParticles: 50000, bloomStrength: 0.8, pixelRatio: 1.0, enableMediaPipe: false };
        }
        // default medium
        return { name: 'MEDIUM', maxParticles: 100000, bloomStrength: 1.2, pixelRatio: Math.min(window.devicePixelRatio || 1.0, 1.25), enableMediaPipe: true };
    }

    // apply preset to engine and optional particle system; returns applied preset
    applyPreset(particles) {
        try {
            if (!this.engine) return this.preset;
            // Pixel ratio
            if (typeof this.preset.pixelRatio === 'number') {
                if (this.engine.setPixelRatio) this.engine.setPixelRatio(this.preset.pixelRatio);
                else this.engine.renderer.setPixelRatio(this.preset.pixelRatio);
            }
            // Bloom strength
            if (this.engine.bloomPass) this.engine.bloomPass.strength = this.preset.bloomStrength;
            // Particle draw count
            if (particles && typeof particles.setMaxDrawCount === 'function') particles.setMaxDrawCount(this.preset.maxParticles);
            // MediaPipe control - expose a flag on engine for UI to inspect
            this.engine.__enableMediaPipe = !!this.preset.enableMediaPipe;
            logDebug(`Applied Governor Preset [${this.preset.name}] particles=${this.preset.maxParticles} bloom=${this.preset.bloomStrength} dpr=${this.preset.pixelRatio} mediapipe=${this.preset.enableMediaPipe}`);
        } catch (e) { logError('applyPreset failed: ' + e); }
        return this.preset;
    }
}
