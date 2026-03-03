import { logDebug, logError } from './debug.js';

export class PerformanceGovernor {
    constructor(engine) {
        this.engine = engine;
        this.gpuInfo = this.getGPUInfo();
        this.preset = this.determinePreset(this.gpuInfo);
        logDebug(`Performance Governor Init: GPU [${this.gpuInfo}] Preset: [${this.preset.name}]`);
    }

    getGPUInfo() {
        try {
            const gl = this.engine.renderer.getContext();
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Unknown GPU';
        } catch (e) {
            return 'Unknown GPU';
        }
    }

    determinePreset(gpu) {
        const lowerGPU = gpu.toLowerCase();
        if (lowerGPU.includes('apple m2') || lowerGPU.includes('apple m3') || lowerGPU.includes('rtx 3') || lowerGPU.includes('rtx 4') || lowerGPU.includes('rx 7')) {
            return { name: 'ULTRA', maxParticles: 262144, bloomStrength: 1.8, pixelRatio: Math.min(window.devicePixelRatio, 2.0), enableMediaPipe: true };
        } else if (lowerGPU.includes('apple m1') || lowerGPU.includes('rtx 2') || lowerGPU.includes('rx 6') || lowerGPU.includes('gtx 1080')) {
            return { name: 'HIGH', maxParticles: 150000, bloomStrength: 1.5, pixelRatio: Math.min(window.devicePixelRatio, 1.5), enableMediaPipe: true };
        } else if (lowerGPU.includes('intel') || lowerGPU.includes('uhd') || lowerGPU.includes('iris') || lowerGPU.includes('radeon vega')) {
            return { name: 'LOW', maxParticles: 50000, bloomStrength: 0.8, pixelRatio: 1.0, enableMediaPipe: false };
        }
        return { name: 'MEDIUM', maxParticles: 100000, bloomStrength: 1.2, pixelRatio: Math.min(window.devicePixelRatio, 1.25), enableMediaPipe: true };
    }

    applyPreset(particles) {
        this.engine.renderer.setPixelRatio(this.preset.pixelRatio);
        if (this.engine.bloomPass) {
            this.engine.bloomPass.strength = this.preset.bloomStrength;
        }
        if (particles) {
            particles.setMaxDrawCount(this.preset.maxParticles);
        }
        return this.preset;
    }
}
