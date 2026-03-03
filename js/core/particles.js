import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { logError } from './debug.js';
import { computePosShader, computeVelShader, renderVsShader, renderFsShader, brainVsShader, brainFsShader } from './shaders.js';
import { INTENTS } from '../ai/nlp.js';

export const FBO_WIDTH = 512;

export class ParticleSystem {
    constructor(engine) {
        this.engine = engine;
        this.gpu = null;
        this.textTexture = new THREE.DataTexture(new Float32Array(FBO_WIDTH * FBO_WIDTH * 4), FBO_WIDTH, FBO_WIDTH, THREE.RGBAFormat, THREE.FloatType);

        this.initBrainCore();
        this.initGPGPU();
    }

    initBrainCore() {
        try {
            this.coreGrp = new THREE.Group();
            this.engine.scene.add(this.coreGrp);

            const SphereGeo = new THREE.IcosahedronGeometry(6, 4);
            this.brainMat = new THREE.ShaderMaterial({
                vertexShader: brainVsShader, fragmentShader: brainFsShader,
                uniforms: { color: { value: new THREE.Color(0x00ffff) }, intensity: { value: 1.0 } },
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            });

            if (isNaN(SphereGeo.attributes.position.array[0])) logError("NaN in SphereGeo Position");
            const sphere = new THREE.Mesh(SphereGeo, this.brainMat);
            if (!sphere.geometry.boundingSphere) sphere.geometry.computeBoundingSphere();
            this.coreGrp.add(sphere);

            // enable bloom layer for brain core if engine exposes bloomLayer
            try { if (this.engine && typeof this.engine.bloomLayer === 'number') this.coreGrp.traverse(o => { o.layers.enable(this.engine.bloomLayer); }); } catch (e) { }

            for (let i = 0; i < 3; i++) {
                const rgeo = new THREE.RingGeometry(8 + i * 2, 8.2 + i * 2, 64);
                const rmat = new THREE.MeshBasicMaterial({ color: 0x8a2be2, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
                const ring = new THREE.Mesh(rgeo, rmat);
                ring.rotation.x = Math.random() * Math.PI; ring.rotation.y = Math.random() * Math.PI;
                ring.userData = { rx: Math.random() * 0.02, ry: Math.random() * 0.02 };
                this.coreGrp.add(ring);
            }
        } catch (e) { logError("InitBrainCore error: " + e); }
    }

    initGPGPU() {
        try {
            this.gpu = new GPUComputationRenderer(FBO_WIDTH, FBO_WIDTH, this.engine.renderer);
            const dtPos = this.gpu.createTexture();
            const dtVel = this.gpu.createTexture();

            const pArr = dtPos.image.data;
            for (let i = 0; i < pArr.length; i += 4) {
                pArr[i] = (Math.random() - 0.5) * 80; pArr[i + 1] = (Math.random() - 0.5) * 80;
                pArr[i + 2] = (Math.random() - 0.5) * 80; pArr[i + 3] = 1.0;
            }

            this.posVar = this.gpu.addVariable("texturePosition", computePosShader, dtPos);
            this.velVar = this.gpu.addVariable("textureVelocity", computeVelShader, dtVel);

            this.gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
            this.gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

            this.velUnif = this.velVar.material.uniforms;
            this.velUnif.uTime = { value: 0 }; this.velUnif.uDelta = { value: 0.016 };
            this.velUnif.uTargetParams = { value: new THREE.Vector3(0, 1, 0) };
            this.velUnif.uTextTex = { value: this.textTexture };
            this.velUnif.uAudioData = { value: new THREE.Vector3(0, 0, 0) };
            this.velUnif.uHand1 = { value: new THREE.Vector3(0, 0, 0) };
            this.velUnif.uHand2 = { value: new THREE.Vector3(0, 0, 0) };
            this.velUnif.uHandDist1 = { value: 0 }; this.velUnif.uHandDist2 = { value: 0 };
            this.velUnif.uIntent = { value: 0 };

            this.posVar.material.uniforms.uDelta = { value: 0.016 };

            const error = this.gpu.init();
            if (error !== null) { logError(`GPGPU Init Error: ${error}`); return; }

            const geo = new THREE.BufferGeometry();
            const uvs = new Float32Array(FBO_WIDTH * FBO_WIDTH * 2);
            let p = 0;
            for (let i = 0; i < FBO_WIDTH; i++) {
                for (let j = 0; j < FBO_WIDTH; j++) { uvs[p++] = (i + 0.5) / FBO_WIDTH; uvs[p++] = (j + 0.5) / FBO_WIDTH; }
            }
            geo.setAttribute('position', new THREE.BufferAttribute(uvs, 2));

            // Draw range control for adaptive particle scaling (use setDrawRange)
            this.fullParticleCount = FBO_WIDTH * FBO_WIDTH;
            this.currentDrawCount = this.fullParticleCount;
            this.targetDrawCount = this.fullParticleCount;
            this.minDrawCount = 30000; // never go below 30K
            this.lastParticleAdjustTime = 0;
            this.particleAdjustInterval = 1.0; // seconds - only adjust at this cadence

            this.pMat = new THREE.ShaderMaterial({
                vertexShader: renderVsShader, fragmentShader: renderFsShader,
                uniforms: {
                    tPos: { value: null }, tVel: { value: null },
                    uColorA: { value: new THREE.Color(INTENTS.CALM.cA) }, uColorB: { value: new THREE.Color(INTENTS.CALM.cB) }
                },
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            });

            this.points = new THREE.Points(geo, this.pMat);
            this.points.frustumCulled = false;
            // initially draw all particles
            this.points.geometry.setDrawRange(0, this.currentDrawCount);
            this.engine.scene.add(this.points);
        } catch (e) { logError("GPGPU Setup error: " + e); }
    }

    update(dt, time, state) {
        if (this.velUnif && this.gpu) {
            this.velUnif.uTime.value = time; this.velUnif.uDelta.value = dt;
            this.velUnif.uTargetParams.value.set(state.mode, state.scale, state.energy);
            this.velUnif.uAudioData.value.set(state.audioBass, state.audioMid, state.speechSync);
            this.velUnif.uHand1.value.copy(state.h1); this.velUnif.uHand2.value.copy(state.h2);
            this.velUnif.uHandDist1.value = state.hd1; this.velUnif.uHandDist2.value = state.hd2;
            this.velUnif.uIntent.value = state.intent;
            this.posVar.material.uniforms.uDelta.value = dt;
            this.gpu.compute();

            const posTex = this.gpu.getCurrentRenderTarget(this.posVar).texture;
            const velTex = this.gpu.getCurrentRenderTarget(this.velVar).texture;
            if (this.pMat && posTex && velTex) {
                this.pMat.uniforms.tPos.value = posTex; this.pMat.uniforms.tVel.value = velTex;
            }
        }
        // Adaptive particle draw-range adjustments only once per `particleAdjustInterval`
        try {
            if (!this.points) return;
            const now = time;
            if ((now - this.lastParticleAdjustTime) >= this.particleAdjustInterval) {
                this.lastParticleAdjustTime = now;
                if (this.currentDrawCount !== this.targetDrawCount) {
                    // smooth step towards target to avoid sudden pops
                    const delta = Math.sign(this.targetDrawCount - this.currentDrawCount) * Math.max(1, Math.floor(Math.abs(this.targetDrawCount - this.currentDrawCount) * 0.15));
                    this.currentDrawCount = Math.max(this.minDrawCount, Math.min(this.fullParticleCount, this.currentDrawCount + delta));
                    this.points.geometry.setDrawRange(0, this.currentDrawCount);
                }
            }
        } catch (e) { logError('Particle drawRange update error: ' + e); }
    }

    // Called by governor or external systems to request a new maximum particle draw count
    setMaxDrawCount(maxCount) {
        try {
            const clamped = Math.max(this.minDrawCount, Math.min(this.fullParticleCount, Math.floor(maxCount)));
            this.targetDrawCount = clamped;
        } catch (e) { logError('setMaxDrawCount error: ' + e); }
    }
}
