import { logDebug, logError } from './debug.js';

// PerformanceGovernor: safer, diagnostic-rich, and provides adaptive MediaPipe config
export class PerformanceGovernor {
    constructor(engine) {
        this.engine = engine;
        this.gpuInfo = this.getGPUInfo();
        this.hw = this.collectHardwareInfo();
        this.preset = this.determinePreset(this.gpuInfo, this.hw);
        logDebug(`Performance Governor Init: GPU [${this.gpuInfo}] Preset: [${this.preset.name}] hw=${JSON.stringify(this.hw)}`);
    }

    getGPUInfo() {
        try {
            const gl = this.engine && this.engine.renderer ? this.engine.renderer.getContext() : null;
            if (!gl) return 'Unknown GPU';
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const info = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            return info || 'Unknown GPU';
        } catch (e) {
            return 'Unknown GPU';
        }
    }

    collectHardwareInfo() {
        try {
            const nav = navigator || {};
            const concurrency = nav.hardwareConcurrency || 2;
            const platform = nav.platform || '';
            const userAgent = nav.userAgent || '';
            const gpuLimits = {};
            try {
                const gl = this.engine && this.engine.renderer ? this.engine.renderer.getContext() : null;
                if (gl) {
                    gpuLimits.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                    gpuLimits.maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
                }
            } catch (e) { /* ignore */ }
            return { concurrency, platform, userAgent, gpuLimits };
        } catch (e) { return {}; }
    }

    determinePreset(gpuStr, hw) {
        const lower = (gpuStr || '').toLowerCase();
        const ua = (hw.userAgent || '').toLowerCase();

        // Conservative heuristics but prefer adaptive enabling of MediaPipe
        // High-end detection
        if (lower.includes('nvidia') || lower.includes('rtx') || lower.includes('geforce') || ua.includes('apple m2') || ua.includes('apple m3')) {
            return { name: 'ULTRA', maxParticles: 262144, bloomStrength: 1.8, pixelRatio: Math.min(window.devicePixelRatio || 1.0, 2.0), mediapipe: { enabled: true, resolution: { width: 1280, height: 720 }, modelComplexity: 1 } };
        }

        // Mid-range
        if (lower.includes('gtx') || lower.includes('rx') || ua.includes('m1') || lower.includes('radeon')) {
            return { name: 'HIGH', maxParticles: 150000, bloomStrength: 1.4, pixelRatio: Math.min(window.devicePixelRatio || 1.0, 1.5), mediapipe: { enabled: true, resolution: { width: 640, height: 480 }, modelComplexity: 1 } };
        }

        // ANGLE or unknown integrated GPUs often appear as 'angle' + vendor string.
        // Do not fully disable MediaPipe; instead provide a reduced fallback config.
        if (lower.includes('angle') || lower.includes('intel') || lower.includes('iris') || lower.includes('uhd')) {
            const maxTex = (hw.gpuLimits && hw.gpuLimits.maxTextureSize) || 0;
            // If texture size is very small, be extra conservative
            if (maxTex > 4000) {
                return { name: 'MEDIUM', maxParticles: 100000, bloomStrength: 1.0, pixelRatio: 1.0, mediapipe: { enabled: true, resolution: { width: 480, height: 360 }, modelComplexity: 0 } };
            }
            return { name: 'LOW', maxParticles: 50000, bloomStrength: 0.8, pixelRatio: 1.0, mediapipe: { enabled: true, resolution: { width: 320, height: 240 }, modelComplexity: 0, restricted: true } };
        }

        // Default fallback: enable with conservative settings
        return { name: 'MEDIUM', maxParticles: 100000, bloomStrength: 1.2, pixelRatio: Math.min(window.devicePixelRatio || 1.0, 1.25), mediapipe: { enabled: true, resolution: { width: 640, height: 480 }, modelComplexity: 0 } };
    }

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

            // Expose MediaPipe config object on engine for runtime decision and adaptive fallback
            this.engine.__enableMediaPipe = this.preset.mediapipe || { enabled: false };

            logDebug(`Applied Governor Preset [${this.preset.name}] particles=${this.preset.maxParticles} bloom=${this.preset.bloomStrength} dpr=${this.preset.pixelRatio} mediapipe=${JSON.stringify(this.engine.__enableMediaPipe)}`);
        } catch (e) { logError('applyPreset failed: ' + e); }
        return this.preset;
    }
}
