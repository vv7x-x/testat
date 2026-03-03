import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { logError, logDebug } from './debug.js';
import { distortionShader } from './shaders.js';

// Lightweight additive blend shader to composite bloom texture onto final scene
const AdditiveBlendShader = {
    uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        uStrength: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float uStrength; varying vec2 vUv;
        void main(){
            vec4 base = texture2D(tDiffuse, vUv);
            vec4 bloom = texture2D(tBloom, vUv) * uStrength;
            gl_FragColor = base + bloom;
        }
    `
};

export class Engine {
    constructor() {
        try {
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.z = 40;

            // Renderer tuned for performance by default
            this.renderer = new THREE.WebGLRenderer({
                antialias: false,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance',
                logarithmicDepthBuffer: false
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            // start with a safe pixel ratio; adaptive system will change this
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            document.body.insertBefore(this.renderer.domElement, document.body.firstChild);

            // Primary composer (final scene) - full resolution
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));

            // Bloom composer - render to a half-resolution render target and only process a dedicated layer
            const params = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
            this.bloomRenderTarget = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(window.innerWidth / 2)), Math.max(2, Math.floor(window.innerHeight / 2)), params);
            this.bloomComposer = new EffectComposer(this.renderer, this.bloomRenderTarget);
            this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.bloomRenderTarget.width, this.bloomRenderTarget.height), 1.8, 0.4, 0.85);
            this.bloomComposer.addPass(this.bloomPass);

            // Neural / distortion pass operates on final composer
            this.neuralPass = new ShaderPass(distortionShader);
            this.composer.addPass(this.neuralPass);

            // Additive blend pass to composite bloom into final image
            this.bloomBlendPass = new ShaderPass(AdditiveBlendShader);
            this.bloomBlendPass.renderToScreen = true;
            this.bloomBlendPass.uniforms.uStrength.value = this.bloomPass.strength || 1.0;
            this.composer.addPass(this.bloomBlendPass);

            // Bloom will process objects in this layer only (1)
            this.bloomLayer = 1;

            window.addEventListener('resize', this.onResize.bind(this));
        } catch (e) {
            logError('Engine Init Error: ' + e);
        }
    }

    onResize() {
        try {
            if (!this.camera || !this.renderer) return;
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();

            const w = window.innerWidth; const h = window.innerHeight;
            this.renderer.setSize(w, h);

            // Final composer full resolution
            if (this.composer) this.composer.setSize(w, h);

            // Bloom composer half resolution
            const bw = Math.max(2, Math.floor(w / 2)); const bh = Math.max(2, Math.floor(h / 2));
            if (this.bloomRenderTarget) {
                this.bloomRenderTarget.setSize(bw, bh);
            }
            if (this.bloomComposer) this.bloomComposer.setSize(bw, bh);
            if (this.bloomPass && this.bloomPass.resolution) this.bloomPass.resolution.set(bw, bh);
        } catch (e) { logError('Engine Resize Error: ' + e); }
    }

    // Convenience for external systems to change pixel ratio safely
    setPixelRatio(pr) {
        try {
            const clamped = Math.max(0.5, Math.min(window.devicePixelRatio || 1.0, pr));
            this.renderer.setPixelRatio(clamped);
            // composers need a resize call to pick up DPR changes
            this.onResize();
            logDebug('Pixel ratio set to ' + clamped);
        } catch (e) { logError('setPixelRatio error: ' + e); }
    }

    render(time) {
        try {
            if (!this.renderer || !this.camera) return;

            // 1) Render bloom composer with camera restricted to bloom layer
            this.renderer.autoClear = true;
            this.camera.layers.set(this.bloomLayer);
            this.bloomComposer.render();

            // 2) Render final scene (exclude bloom layer)
            this.camera.layers.set(0);
            // update bloom texture uniform for additive composite
            if (this.bloomBlendPass && this.bloomComposer) {
                this.bloomBlendPass.uniforms.tBloom.value = this.bloomComposer.readBuffer.texture;
                this.bloomBlendPass.uniforms.uStrength.value = this.bloomPass ? this.bloomPass.strength : 1.0;
            }
            this.composer.render();
        } catch (e) {
            logError('Render Error: ' + e);
        }
    }
}
