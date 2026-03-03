export const computePosShader = `
uniform float uDelta;
void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 posData = texture2D(texturePosition, uv);
    vec4 velData = texture2D(textureVelocity, uv);
    vec3 pos = posData.xyz + velData.xyz * max(uDelta, 0.001);
    if(length(pos) > 1000.0) { pos = normalize(pos) * 1000.0; }
    gl_FragColor = vec4(pos, 1.0);
}`;

export const computeVelShader = `
uniform float uTime; uniform float uDelta; uniform vec3 uTargetParams; uniform sampler2D uTextTex;
uniform vec3 uAudioData; uniform vec3 uHand1; uniform vec3 uHand2; uniform float uHandDist1; uniform float uHandDist2;
uniform int uIntent;
vec3 safeNormalize(vec3 v) { float len = length(v); return len > 0.0001 ? v / len : vec3(0.0); }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_*ns.x + ns.yyyy; vec4 y = y_*ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
vec3 curlNoise(vec3 p) {
    float e = 0.1;
    float x = snoise(p + vec3(0, e, 0)) - snoise(p - vec3(0, e, 0)) - snoise(p + vec3(0, 0, e)) + snoise(p - vec3(0, 0, e));
    float y = snoise(p + vec3(0, 0, e)) - snoise(p - vec3(0, 0, e)) - snoise(p + vec3(e, 0, 0)) + snoise(p - vec3(e, 0, 0));
    float z = snoise(p + vec3(e, 0, 0)) - snoise(p - vec3(e, 0, 0)) - snoise(p + vec3(0, e, 0)) + snoise(p - vec3(0, e, 0));
    return safeNormalize(vec3(x, y, z));
}
void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;
    vec3 force = vec3(0.0);
    float mode = max(0.0, uTargetParams.x); 
    float scale = max(0.1, uTargetParams.y);
    float energy = max(0.0, uTargetParams.z);

    if (mode <= 1.5) { 
        float r = 10.0 * scale; vec3 target1 = vec3(-15.0, 0.0, 0.0); vec3 target2 = vec3(15.0, 0.0, 0.0);
        float a = uv.x * 6.28318; float b = uv.y * 3.14159; vec3 spherePoint = vec3(sin(b)*cos(a), sin(b)*sin(a), cos(b)) * r;
        vec3 primeTarget = (mode > 0.5 && uv.x > 0.5) ? target2 : target1; primeTarget = (mode > 0.5) ? primeTarget : vec3(0.0); 
        primeTarget += spherePoint; force += (primeTarget - pos) * 2.0;

        if (uIntent == 1) force += curlNoise(pos * 0.2 + uTime) * 15.0;
        else if (uIntent == 2) force += vec3(0.0, sin(pos.x * 0.5 + uTime) * 5.0, 0.0);
    } else if (mode > 1.5) {
        vec4 tData = texture2D(uTextTex, uv);
        if (tData.w > 0.5) { force += (tData.xyz - pos) * 5.0; }
        else { force += curlNoise(pos * 0.05 + uTime) * (2.0 + uAudioData.z * 10.0); force += -pos * 0.2; }
    }
    if (energy > 1.0) { vec3 expDir = safeNormalize(pos) + curlNoise(pos * 0.1)*0.5; force += safeNormalize(expDir) * energy * 20.0; }
    if (uAudioData.x > 0.7) { force += safeNormalize(pos) * (uAudioData.x * 25.0); }
    vec3 dir1 = uHand1 - pos; float d1 = length(dir1);
    if (d1 > 0.001 && d1 < 15.0) force += (dir1/d1) * (15.0 - d1) * uHandDist1 * 5.0;
    vec3 dir2 = uHand2 - pos; float d2 = length(dir2);
    if (d2 > 0.001 && d2 < 15.0) force += (dir2/d2) * (15.0 - d2) * uHandDist2 * 5.0;
    force += curlNoise(pos * 0.5 + uTime) * (1.0 + uAudioData.y * 3.0 + uAudioData.z * 5.0);

    float dtSafe = max(uDelta, 0.001); vel += force * dtSafe; vel *= 0.90;
    float maxSpeed = (uIntent == 1 || energy > 1.0) ? 50.0 : 25.0;
    if(length(vel) > maxSpeed) vel = safeNormalize(vel) * maxSpeed;
    if(isnan(vel.x) || isnan(vel.y) || isnan(vel.z)) vel = vec3(0.0);
    gl_FragColor = vec4(vel, 1.0);
}`;

export const renderVsShader = `
uniform sampler2D tPos; uniform sampler2D tVel; uniform vec3 uColorA; uniform vec3 uColorB; varying vec4 vColor;
void main() {
    vec3 pos = texture2D(tPos, position.xy).xyz; vec3 vel = texture2D(tVel, position.xy).xyz;
    float speed = length(vel);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float safeZ = min(mvPosition.z, -0.01);
    gl_PointSize = clamp((4.0 + speed * 0.1) / -safeZ, 1.0, 30.0);
    gl_Position = projectionMatrix * mvPosition;
    float mixVal = clamp(smoothstep(0.0, 20.0, speed) * 0.5 + (sin(pos.y * 0.1) * 0.5 + 0.5), 0.0, 1.0);
    vColor = vec4(mix(uColorA, uColorB, mixVal), clamp(0.7 + speed * 0.01, 0.0, 1.0));
}`;

export const renderFsShader = `
varying vec4 vColor;
void main() {
    vec2 cxy = 2.0 * gl_PointCoord - 1.0; float r = dot(cxy, cxy); if (r > 1.0) discard;
    float glow = exp(-r * 3.0); gl_FragColor = vec4(vColor.rgb * glow * 1.5, vColor.a * glow);
}`;

export const brainVsShader = `
varying vec3 vNormal; varying vec3 vPos;
void main() { vNormal = normalize(normalMatrix * normal); vPos = (modelViewMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const brainFsShader = `
uniform vec3 color; uniform float intensity; varying vec3 vNormal; varying vec3 vPos;
void main() { float rim = 1.0 - max(dot(viewMatrix[2].xyz, normalize(vNormal)), 0.0); rim = smoothstep(0.5, 1.0, rim); gl_FragColor = vec4(color * rim * intensity * 2.0, rim * 0.8); }`;

export const distortionShader = {
    uniforms: { "tDiffuse": { value: null }, "uTime": { value: 0 }, "uIntensity": { value: 0 }, "uDistortion": { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime; uniform float uIntensity; uniform float uDistortion; varying vec2 vUv;
        void main(){
            vec2 uv=vUv; uv.y += sin(uv.x*20.0+uTime*5.0)*uDistortion*0.01; uv.x += cos(uv.y*20.0+uTime*5.0)*uDistortion*0.01;
            float caOffset = 0.002 * uIntensity; float r = texture2D(tDiffuse, uv + vec2(caOffset, 0.0)).r;
            float g = texture2D(tDiffuse, uv).g; float b = texture2D(tDiffuse, uv - vec2(caOffset, 0.0)).b; gl_FragColor = vec4(r,g,b,1.0);
        }
    `
};
