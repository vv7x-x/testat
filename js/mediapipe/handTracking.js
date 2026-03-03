import { logError } from '../core/debug.js';

export class HandTracking {
    constructor(state) {
        this.state = state;
    }
    load() {
        return new Promise((resolve, reject) => {
            const scr1 = document.createElement('script');
            scr1.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
            scr1.onerror = reject;
            scr1.onload = () => {
                const scr2 = document.createElement('script');
                scr2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
                scr2.onerror = reject;
                scr2.onload = resolve;
                document.body.appendChild(scr2);
            };
            document.body.appendChild(scr1);
        });
    }
    init() {
        if (!window.Hands || !window.Camera) { logError("MediaPipe missing."); return; }
        const video = document.getElementById('video');
        if (!video) return;
        const hands = new window.Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6 });
        hands.onResults((res) => {
            this.state.hd1 = 0; this.state.hd2 = 0;
            if (res.multiHandLandmarks?.length > 0) {
                let lm1 = res.multiHandLandmarks[0];
                if (lm1[9]) this.state.h1.set((lm1[9].x - 0.5) * 60, -(lm1[9].y - 0.5) * 60, 0);
                let open1 = 0; for (let tip of [8, 12, 16, 20]) if (lm1[tip] && lm1[tip].y < lm1[tip - 2].y) open1++;
                if (open1 === 0) { this.state.hd1 = -5.0; this.state.energy = 2.0; } else { this.state.hd1 = 2.0; this.state.energy = 0.0; }
                if (lm1[4] && lm1[8]) {
                    let dx = lm1[4].x - lm1[8].x, dy = lm1[4].y - lm1[8].y; let sq = dx * dx + dy * dy;
                    if (!isNaN(sq)) this.state.scale = Math.max(0.5, 1.0 + (0.1 - Math.sqrt(sq)) * 5.0);
                }
                if (res.multiHandLandmarks.length > 1) {
                    this.state.mode = 1; let lm2 = res.multiHandLandmarks[1];
                    if (lm2[9]) this.state.h2.set((lm2[9].x - 0.5) * 60, -(lm2[9].y - 0.5) * 60, 0);
                    let open2 = 0; for (let tip of [8, 12, 16, 20]) if (lm2[tip] && lm2[tip].y < lm2[tip - 2].y) open2++;
                    this.state.hd2 = (open2 === 0) ? -5.0 : 2.0;
                } else { if (this.state.mode === 1) this.state.mode = 0; }
            } else { if (!isNaN(this.state.scale)) this.state.scale += (1.0 - this.state.scale) * 0.1; }
        });
        try {
            const cam = new window.Camera(video, { onFrame: async () => await hands.send({ image: video }), width: 640, height: 480 });
            cam.start().catch(err => logError("Camera Blocked/Failed: " + err));
        } catch (e) { logError("Camera API error: " + e); }
    }
}
