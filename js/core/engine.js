import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { logError } from './debug.js';
import { distortionShader } from './shaders.js';

export class Engine {
    constructor() {
        try {
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.z = 40;

            this.renderer = new THREE.WebGLRenderer({
                antialias: false,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
                logarithmicDepthBuffer: false
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            document.body.insertBefore(this.renderer.domElement, document.body.firstChild);

            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));

            const bloomRes = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
            this.bloomPass = new UnrealBloomPass(bloomRes, 1.8, 0.4, 0.85);
            this.composer.addPass(this.bloomPass);

            this.neuralPass = new ShaderPass(distortionShader);
            this.composer.addPass(this.neuralPass);

            window.addEventListener('resize', this.onResize.bind(this));
        } catch (e) {
            logError("Engine Init Error: " + e);
        }
    }

    onResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
        if (this.bloomPass) {
            this.bloomPass.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
        }
    }

    render(time) {
        if (this.composer) this.composer.render();
    }
}
