export const INTENTS = {
    COMBAT: { keys: ['قتال', 'معركة', 'أحمر', 'دمر', 'هجوم', 'combat'], intentId: 1, theme: 'combat', cA: 0xff003c, cB: 0xff5500, reply: 'تفعيل وضع القتال... الدروع جاهزة' },
    ANALYSIS: { keys: ['تحليل', 'حلل', 'فحص', 'بيانات', 'نظام', 'analysis'], intentId: 2, theme: 'analysis', cA: 0x0088ff, cB: 0x00ffff, reply: 'بدء تحليل طاقة النواة وعرض استهلاك البيانات' },
    DATA: { keys: ['مصفوفة', 'خوارزمية', 'أخضر'], intentId: 3, theme: 'data', cA: 0x00ff66, cB: 0x0088ff, reply: 'دمج المصفوفات وتحديث الخوارزمية المركزية' },
    CALM: { keys: ['هدوء', 'سكون', 'إيقاف', 'طبيعي', 'أزرق', 'calm'], intentId: 0, theme: 'default', cA: 0x00ffff, cB: 0x8a2be2, reply: 'إعادة ضبط الأنظمة لوضع السكون المؤقت' },
    CINEMATIC: { keys: ['سينمائي', 'عرض', 'تفعيل العرض', 'cinema'], intentId: 0, theme: 'default', action: 'cinema', cA: 0x00ffff, cB: 0x8a2be2, reply: 'تفعيل الواجهة السينمائية الكاملة' },
    EXPLOSION: { keys: ['انفجار', 'انفجر', 'بوم', 'explode', 'boom'], intentId: 1, action: 'explode', cA: 0xffaa00, cB: 0xff0000, reply: 'تحذير... تفريغ طاقة قصوى' },
    YAHYA: { keys: ['يحيى', 'يحيي', 'سيدي', 'yahya'], intentId: 0, theme: 'yahya', action: 'easterEgg', cA: 0xffd700, cB: 0xff00ff, reply: 'أهلاً بك يا هندسة، الأنظمة كلها تحت إمرتك' }
};

export function parseIntent(text, state, engine, particles, synth) {
    if (!text || typeof text !== 'string') return;
    let foundIntent = null;
    const txtLower = text.toLowerCase();
    for (const key in INTENTS) {
        if (INTENTS[key].keys.some(k => txtLower.includes(k))) { foundIntent = INTENTS[key]; break; }
    }
    if (foundIntent) {
        const intEl = document.getElementById('ai-intent');
        if (intEl) intEl.innerText = `INTENT: [${foundIntent.theme.toUpperCase()}] | ENGAGING: TRUE`;
        state.intent = foundIntent.intentId || 0;
        document.body.className = `theme-${foundIntent.theme}`;
        if (particles.pMat && particles.pMat.uniforms) {
            particles.pMat.uniforms.uColorA.value.setHex(foundIntent.cA);
            particles.pMat.uniforms.uColorB.value.setHex(foundIntent.cB);
            particles.brainMat.uniforms.color.value.setHex(foundIntent.cA);
        }
        if (foundIntent.reply && synth) synth(foundIntent.reply);
        if (foundIntent.action === 'cinema') {
            const ui = document.getElementById('ui-layer');
            const title = document.getElementById('cinematic-title');
            if (ui) ui.classList.add('hidden');
            if (title) title.style.opacity = 1;
            try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch (e) { }
        }
        if (foundIntent.action === 'explode') {
            state.energy = 5.0;
            if (engine.bloomPass) engine.bloomPass.strength = 3.0;
        }
        if (foundIntent.action === 'easterEgg') {
            if (engine.bloomPass) engine.bloomPass.strength = 4.0;
        }
    }
}
