class SharkApp {
    constructor() {
        this.shark = document.getElementById('shark');
        this.pupil = document.getElementById('shark-pupil');
        this.ocean = document.getElementById('ocean');
        this.bubblesEl = document.getElementById('bubbles');
        this.fxLayer = document.getElementById('fx-layer');
        this.tailGroup = this.shark.querySelector('.tail-group');

        this.pos = { x: window.innerWidth * 0.3, y: window.innerHeight * 0.4 };
        this.vel = { x: 0.5, y: 0 };
        this.wanderAngle = 0;
        this.facing = 1; // 1 = right, -1 = left — dorsal fin always stays up
        this.pitch = 0;
        this.depth = 0;
        this.state = 'swim';
        this.stateTimer = 0;
        this.exitEdge = null;
        this.entryEdge = null;
        this.exitTarget = null;
        this.departBlend = 0;
        this.sharkSize = { w: 180, h: 82 };
        this.playTarget = null;
        this.lookAt = null;
        this.lookAtTimer = 0;
        this.tapCount = 0;
        this.lastTapTime = 0;
        this.lastPaletteIndex = -1;
        this.sharkRig = null;
        this._lastOpacity = null;
        this._lastFilter = null;
        this._lastTransform = null;
        this._lastTailDur = null;
        this._lastEyeTransform = null;

        this._bounds = { pad: 80, w: window.innerWidth, h: window.innerHeight };

        this.init();
    }

    init() {
        this.sharkRig = this.shark.querySelector('.shark-rig');
        this.bodyGradTop = document.getElementById('bodyGradTop');
        this.bodyGradMid = document.getElementById('bodyGradMid');
        this.bodyGradDeep = document.getElementById('bodyGradDeep');
        this.bellyGradLight = document.getElementById('bellyGradLight');
        this.bellyGradMid = document.getElementById('bellyGradMid');

        window.addEventListener('resize', () => {
            this._bounds.w = window.innerWidth;
            this._bounds.h = window.innerHeight;
        }, { passive: true });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this._paused) {
                this._paused = false;
                requestAnimationFrame((t) => this.loop(t));
            }
            this._paused = document.hidden;
        }, { passive: true });



        this.bindInteraction();
        this.loop();
        this.spawnAmbientRipple();
        this.spawnBubbleLoop();
        if (SharkApp.isNightTime()) {
            // Night mode: appear once, depart, never return
            this.scheduleHide();          // first (and only) hide
            // Override requestDepart so after the first depart it goes permanently dead
            const _orig = this.requestDepart.bind(this);
            this.requestDepart = () => {
                _orig();
                // After this depart completes, mark dead so approach never fires
                const watchForHidden = setInterval(() => {
                    if (this.state === 'hidden') {
                        clearInterval(watchForHidden);
                        this.state = 'dead';
                        this.shark.style.opacity = 0;
                        this.shark.style.pointerEvents = 'none';
                    }
                }, 300);
            };
        } else {
            // Normal mode: swim freely, but hard-stop after 10 minutes
            this.scheduleHide();
            this.schedulePermamentHide();
        }
    }

    /** Original teal shark — used on first load only */
    static DEFAULT_PALETTE = {
        bodyTop: '#5CAAA0', bodyMid: '#3D8B80', bodyDeep: '#1B5E55',
        bellyLight: '#E8F5F3', bellyMid: '#B2DFDB',
        fin: '#1A4D45', finMid: '#2A6B62', detail: '#0D3D36', accent: '#4DB6AC'
    };

    /** Child-safe random palettes — applied after first hide/reappear */
    static PALETTES = [
        { bodyTop: '#FFD54F', bodyMid: '#FFCA28', bodyDeep: '#FFA000', bellyLight: '#FFFDE7', bellyMid: '#FFF9C4', fin: '#FF8F00', finMid: '#FFB300', detail: '#E65100', accent: '#FFE082' },
        { bodyTop: '#F48FB1', bodyMid: '#EC407A', bodyDeep: '#D81B60', bellyLight: '#FCE4EC', bellyMid: '#F8BBD0', fin: '#AD1457', finMid: '#C2185B', detail: '#880E4F', accent: '#F48FB1' },
        { bodyTop: '#81C784', bodyMid: '#66BB6A', bodyDeep: '#43A047', bellyLight: '#E8F5E9', bellyMid: '#C8E6C9', fin: '#2E7D32', finMid: '#388E3C', detail: '#1B5E20', accent: '#A5D6A7' },
        { bodyTop: '#9575CD', bodyMid: '#7E57C2', bodyDeep: '#5E35B1', bellyLight: '#EDE7F6', bellyMid: '#D1C4E9', fin: '#4527A0', finMid: '#512DA8', detail: '#311B92', accent: '#B39DDB' },
        { bodyTop: '#4FC3F7', bodyMid: '#29B6F6', bodyDeep: '#039BE5', bellyLight: '#E1F5FE', bellyMid: '#B3E5FC', fin: '#0277BD', finMid: '#0288D1', detail: '#01579B', accent: '#81D4FA' },
        { bodyTop: '#FFAB91', bodyMid: '#FF8A65', bodyDeep: '#FF7043', bellyLight: '#FBE9E7', bellyMid: '#FFCCBC', fin: '#E64A19', finMid: '#F4511E', detail: '#BF360C', accent: '#FFAB91' },
        { bodyTop: '#AED581', bodyMid: '#9CCC65', bodyDeep: '#7CB342', bellyLight: '#F1F8E9', bellyMid: '#DCEDC8', fin: '#558B2F', finMid: '#689F38', detail: '#33691E', accent: '#C5E1A5' },
        { bodyTop: '#4DD0E1', bodyMid: '#26C6DA', bodyDeep: '#00ACC1', bellyLight: '#E0F7FA', bellyMid: '#B2EBF2', fin: '#00838F', finMid: '#0097A7', detail: '#006064', accent: '#80DEEA' }
    ];

    applyPalette(palette) {
        if (this.bodyGradTop) {
            this.bodyGradTop.setAttribute('stop-color', palette.bodyTop);
            this.bodyGradMid.setAttribute('stop-color', palette.bodyMid);
            this.bodyGradDeep.setAttribute('stop-color', palette.bodyDeep);
            this.bellyGradLight.setAttribute('stop-color', palette.bellyLight);
            this.bellyGradMid.setAttribute('stop-color', palette.bellyMid);
        }

        if (!this.sharkRig) {
            return;
        }
        const r = this.sharkRig.style;
        r.setProperty('--shark-fin', palette.fin);
        r.setProperty('--shark-fin-mid', palette.finMid);
        r.setProperty('--shark-detail', palette.detail);
        r.setProperty('--shark-accent', palette.accent);
    }

    applyRandomPalette() {
        const palettes = SharkApp.PALETTES;
        let index = Math.floor(Math.random() * palettes.length);
        if (palettes.length > 1 && index === this.lastPaletteIndex) {
            index = (index + 1 + Math.floor(Math.random() * (palettes.length - 1))) % palettes.length;
        }
        this.lastPaletteIndex = index;
        this.applyPalette(palettes[index]);
    }

    bindInteraction() {
        this.shark.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.onSharkTap(e.clientX, e.clientY);
        });

        this.ocean.addEventListener('pointerdown', (e) => {
            if (e.target.closest('#shark')) {
                return;
            }
            this.onOceanTap(e.clientX, e.clientY);
        });
    }

    /** Tap the shark — startled dart, bubbles, and a silly wiggle */
    onSharkTap(x, y) {
        if (this.state === 'depart' || this.state === 'hidden' || this.state === 'approach') {
            return;
        }

        const now = performance.now();
        const isDoubleTap = now - this.lastTapTime < 450;
        this.lastTapTime = now;
        this.tapCount++;

        const dx = this.pos.x - x;
        const dy = this.pos.y - y;
        const dist = Math.hypot(dx, dy) || 1;
        const burst = isDoubleTap ? 3.6 : 2.4;

        this.vel.x = (dx / dist) * burst;
        this.vel.y = (dy / dist) * burst;
        this.state = 'startled';
        this.stateTimer = isDoubleTap ? 70 : 50;
        this.lookAt = { x, y };
        this.lookAtTimer = 90;
        this.playTarget = null;

        this.shark.classList.remove('boop', 'happy');
        void this.shark.offsetWidth;
        this.shark.classList.add(isDoubleTap ? 'happy' : 'boop');
        setTimeout(() => this.shark.classList.remove('boop', 'happy'), 700);

        this.spawnRipple(x, y, 1.3);
        this.spawnTapBurst(x, y, isDoubleTap ? 10 : 6);
        for (let i = 0; i < (isDoubleTap ? 8 : 4); i++) {
            this.spawnBubbleAt(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30);
        }
    }

    /** Tap the water — shark swims over to say hello */
    onOceanTap(x, y) {
        if (this.state === 'depart' || this.state === 'hidden' || this.state === 'approach') {
            return;
        }

        this.playTarget = { x, y };
        this.state = 'playful';
        this.stateTimer = 200;
        this.lookAt = { x, y };
        this.lookAtTimer = 120;

        this.spawnTapMarker(x, y);
        this.spawnRipple(x, y, 0.9);
        this.spawnTapBurst(x, y, 3);
    }

    spawnTapMarker(x, y) {
        const m = document.createElement('div');
        m.className = 'tap-marker';
        m.style.left = `${x}px`;
        m.style.top = `${y}px`;
        this.fxLayer.appendChild(m);
        m.addEventListener('animationend', () => m.remove());
    }

    spawnTapBurst(x, y, count) {
        const icons = ['\u2728', '\u2B50', '\u{1F4A7}', '\u{1F499}', '\u{1F988}'];
        for (let i = 0; i < count; i++) {
            const p = document.createElement('span');
            p.className = 'tap-particle';
            p.textContent = icons[Math.floor(Math.random() * icons.length)];
            p.style.left = `${x}px`;
            p.style.top = `${y}px`;
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const dist = 35 + Math.random() * 45;
            p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
            p.style.setProperty('--dy', `${Math.sin(angle) * dist - 30}px`);
            p.style.setProperty('--spin', `${(Math.random() - 0.5) * 60}deg`);
            this.fxLayer.appendChild(p);
            p.addEventListener('animationend', () => p.remove());
        }
    }

    spawnBubbleAt(x, y) {
        const b = document.createElement('div');
        b.className = 'bubble';
        const size = 8 + Math.random() * 16;
        b.style.width = `${size}px`;
        b.style.height = `${size}px`;
        b.style.left = `${x}px`;
        b.style.top = `${y}px`;
        b.style.bottom = 'auto';
        b.style.setProperty('--drift', `${(Math.random() - 0.5) * 40}px`);
        b.style.animationDuration = `${2 + Math.random() * 3}s`;
        this.bubblesEl.appendChild(b);
        b.addEventListener('animationend', () => b.remove());
    }

    scheduleHide() {
        const delay = 14000 + Math.random() * 16000;
        setTimeout(() => this.requestDepart(), delay);
    }
    
    /** Called once on init — sets the 10-min kill timer */
    schedulePermamentHide() {
        const TEN_MINUTES = 10 * 60 * 1000;
        setTimeout(() => this.permanentlyHide(), TEN_MINUTES);
    }
    
    /** Returns true if current LOCAL hour is in the night window (20:00–06:59) */
    static isNightTime() {
        const h = new Date().getHours();
        return h >= 20 || h < 7;
    }

    /** Wait for active movement to settle slightly before exiting */
    requestDepart() {
        if (this.state === 'depart' || this.state === 'hidden' || this.state === 'approach') {
            return;
        }

        const busy = this.state === 'startled' || this.state === 'playful' || this.state === 'happy';
        const speed = Math.hypot(this.vel.x, this.vel.y);

        if (busy || speed > 1.8) {
            setTimeout(() => this.requestDepart(), 800 + Math.random() * 600);
            return;
        }

        this.beginDepart();
    }

    pickEdgePoint(preferDifferentFrom) {
        const b = this._bounds;
        const edges = [
            { name: 'left', x: -b.pad * 1.2, y: b.h * (0.25 + Math.random() * 0.5) },
            { name: 'right', x: b.w + b.pad * 1.2, y: b.h * (0.25 + Math.random() * 0.5) },
            { name: 'top', x: b.w * (0.25 + Math.random() * 0.5), y: -b.pad * 1.2 },
            { name: 'bottom', x: b.w * (0.25 + Math.random() * 0.5), y: b.h + b.pad * 1.2 }
        ];

        const speed = Math.hypot(this.vel.x, this.vel.y);
        const mx = speed > 0.08 ? this.vel.x / speed : Math.cos(this.wanderAngle);
        const my = speed > 0.08 ? this.vel.y / speed : Math.sin(this.wanderAngle);
        const maxDist = Math.max(b.w, b.h);

        return edges
            .filter((e) => e.name !== preferDifferentFrom)
            .map((e) => {
                const dx = e.x - this.pos.x;
                const dy = e.y - this.pos.y;
                const dist = Math.hypot(dx, dy) || 1;
                const alignment = (dx / dist) * mx + (dy / dist) * my;
                const score = alignment * 0.65 + (1 - dist / maxDist) * 0.35;
                return { ...e, dist, score };
            })
            .sort((a, b) => b.score - a.score)[0] || edges[0];
    }

    beginDepart() {
        if (this.state === 'depart' || this.state === 'hidden' || this.state === 'approach') {
            return;
        }

        const exit = this.pickEdgePoint(null);
        this.exitEdge = exit.name;
        this.exitTarget = { x: exit.x, y: exit.y };
        this.state = 'depart';
        this.stateTimer = 0;
        this.departBlend = 0;
        this.playTarget = null;

        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > 0.08) {
            this.wanderAngle = Math.atan2(this.vel.y, this.vel.x);
        }
    }

    beginHidden() {
        this.state = 'hidden';
        this.stateTimer = 120 + Math.random() * 150;
        this.depth = 1;
        this.vel.x = 0;
        this.vel.y = 0;
    }

    beginApproach() {
        this.applyRandomPalette();

        const entry = this.pickEdgePoint(this.exitEdge);
        this.entryEdge = entry.name;
        this.pos.x = entry.x;
        this.pos.y = entry.y;
        this.depth = 1;
        this.state = 'approach';
        this.stateTimer = 0;

        const b = this._bounds;
        const aimX = b.w * (0.3 + Math.random() * 0.4);
        const aimY = b.h * (0.3 + Math.random() * 0.4);
        const dx = aimX - this.pos.x;
        const dy = aimY - this.pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = 0.55 + Math.random() * 0.25;

        this.vel.x = (dx / dist) * speed;
        this.vel.y = (dy / dist) * speed;
        this.wanderAngle = Math.atan2(this.vel.y, this.vel.x);
        this.facing = this.vel.x >= 0 ? 1 : -1;
    }

    steerToward(tx, ty, strength) {
        const dx = tx - this.pos.x;
        const dy = ty - this.pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.vel.x += (dx / dist) * strength;
        this.vel.y += (dy / dist) * strength;
    }

    updateDepart(now) {
        this.stateTimer++;
        this.departBlend = Math.min(1, this.departBlend + 0.014);

        if (!this.exitTarget) {
            this.beginHidden();
            return;
        }

        const blend = this.departBlend;
        const steerStrength = 0.006 + blend * 0.04;
        const wanderWeight = Math.max(0, 1 - blend * 1.8);

        if (wanderWeight > 0.05) {
            this.wanderAngle += (Math.random() - 0.5) * 0.05 * wanderWeight;
            const cruise = 0.55 + Math.sin(now * 0.0008) * 0.15;
            this.vel.x += Math.cos(this.wanderAngle) * 0.013 * cruise * wanderWeight;
            this.vel.y += Math.sin(this.wanderAngle) * 0.013 * cruise * wanderWeight;
        }

        this.steerToward(this.exitTarget.x, this.exitTarget.y, steerStrength);
        if (this.exitEdge !== 'top') {
            this.vel.y += 0.004 * blend;
        }

        const dampFactor = 0.993 - blend * 0.008;
        this.dampVelocity(dampFactor);

        const b = this._bounds;
        const exitDist = Math.hypot(this.exitTarget.x - this.pos.x, this.exitTarget.y - this.pos.y);
        const progress = 1 - Math.min(1, exitDist / Math.max(b.w, b.h));
        const depthRamp = Math.max(0, (blend - 0.3) / 0.7);
        this.depth = Math.min(1, progress * 1.1 * depthRamp + this.stateTimer * 0.001 * depthRamp);

        const offScreen =
            this.pos.x < -b.pad * 0.5 ||
            this.pos.x > b.w + b.pad * 0.5 ||
            this.pos.y < -b.pad * 0.5 ||
            this.pos.y > b.h + b.pad * 0.5;

        if ((offScreen && this.depth > 0.75 && blend > 0.6) || (this.depth >= 1 && blend > 0.85)) {
            this.beginHidden();
        }
    }

    updateHidden() {
        this.stateTimer--;
        if (this.stateTimer <= 0) {
            this.beginApproach();
        }
    }

    updateApproach() {
        this.stateTimer++;

        this.steerToward(
            this.pos.x + this.vel.x * 40,
            this.pos.y + this.vel.y * 40,
            0.012
        );
        this.wanderAngle += (Math.random() - 0.5) * 0.03;
        this.vel.x += Math.cos(this.wanderAngle) * 0.004;
        this.vel.y += Math.sin(this.wanderAngle) * 0.004;
        this.dampVelocity(0.988);

        const b = this._bounds;
        const inView =
            this.pos.x > b.pad * 0.6 &&
            this.pos.x < b.w - b.pad * 0.6 &&
            this.pos.y > b.pad * 0.6 &&
            this.pos.y < b.h - b.pad * 0.6;

        const targetDepth = inView ? 0 : 0.55;
        this.depth += (targetDepth - this.depth) * (inView ? 0.018 : 0.008);

        if (inView && this.depth < 0.04 && this.stateTimer > 100) {
            this.spawnRipple(this.pos.x, this.pos.y, 0.7);
            this.state = 'swim';
            this.depth = 0;
            this.exitEdge = null;
            this.entryEdge = null;
            this.exitTarget = null;
            this.scheduleHide();
        }
    }

    /** Organic wander — smooth S-curves like a cruising fish */
    wander(now) {
        this.wanderAngle += (Math.random() - 0.5) * 0.08;
        const speed = 0.55 + Math.sin(now * 0.0008) * 0.15;
        this.vel.x += Math.cos(this.wanderAngle) * 0.015 * speed;
        this.vel.y += Math.sin(this.wanderAngle) * 0.015 * speed;

        // Gentle pull toward mid-depth (fish prefer mid-water)
        const b = this._bounds;
        const midY = b.h * 0.45;
        this.vel.y += (midY - this.pos.y) * 0.00004;

        // Soft boundary steering — turn away from edges
        if (this.pos.x < b.pad) { this.vel.x += 0.02; }
        if (this.pos.x > b.w - b.pad) { this.vel.x -= 0.02; }
        if (this.pos.y < b.pad) { this.vel.y += 0.02; }
        if (this.pos.y > b.h - b.pad) { this.vel.y -= 0.02; }
    }

    /** Occasional glide — fish coast with minimal tail use */
    maybeGlide() {
        if (this.state !== 'swim') {
            return;
        }
        if (Math.random() < 0.002) {
            this.state = 'glide';
            this.stateTimer = 90 + Math.random() * 120;
        }
    }

    dampVelocity(factor) {
        this.vel.x *= factor;
        this.vel.y *= factor;
    }

    updateSwim(now) {
        this.wander(now);
        this.dampVelocity(0.985);
        this.maybeGlide();

        if (this.state === 'glide') {
            this.stateTimer--;
            this.dampVelocity(0.992);
            if (this.stateTimer <= 0) { this.state = 'swim'; }
        }
    }

    updateStartled() {
        this.stateTimer--;
        this.dampVelocity(0.965);
        if (this.stateTimer <= 0) { this.state = 'swim'; }
    }

    updatePlayful() {
        this.stateTimer--;
        if (!this.playTarget) {
            this.state = 'swim';
            return;
        }

        const dx = this.playTarget.x - this.pos.x;
        const dy = this.playTarget.y - this.pos.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 50) {
            this.state = 'happy';
            this.stateTimer = 55;
            this.playTarget = null;
            this.vel.x *= 0.5;
            this.vel.y *= 0.5;
            this.shark.classList.add('happy');
            this.spawnTapBurst(this.pos.x, this.pos.y, 5);
            setTimeout(() => this.shark.classList.remove('happy'), 700);
            return;
        }

        if (this.stateTimer <= 0) {
            this.state = 'swim';
            this.playTarget = null;
            return;
        }

        const chase = 0.11;
        this.vel.x += (dx / dist) * chase;
        this.vel.y += (dy / dist) * chase;
        this.dampVelocity(0.97);
    }

    updateHappy(now) {
        this.stateTimer--;
        this.wander(now);
        this.dampVelocity(0.97);
        if (this.stateTimer <= 0) { this.state = 'swim'; }
    }

    getDisplayPos() {
        const b = this._bounds;
        const bleedX = this.sharkSize.w * 0.5;
        const bleedY = this.sharkSize.h * 0.5;
        return {
            x: Math.max(-bleedX, Math.min(b.w + bleedX, this.pos.x)),
            y: Math.max(-bleedY, Math.min(b.h + bleedY, this.pos.y))
        };
    }

    spawnRipple(x, y, scale = 1) {
        const b = this._bounds;
        if (x < -20 || x > b.w + 20 || y < -20 || y > b.h + 20) {
            return;
        }

        const r = document.createElement('div');
        r.className = 'ripple';
        const size = (40 + Math.random() * 60) * scale;
        r.style.width = `${size}px`;
        r.style.height = `${size}px`;
        r.style.left = `${x - size / 2}px`;
        r.style.top = `${y - size / 2}px`;
        this.fxLayer.appendChild(r);
        r.addEventListener('animationend', () => r.remove(), { once: true });
    }

    spawnWake(x, y) {
        const b = this._bounds;
        if (x < 0 || x > b.w || y < 0 || y > b.h) {
            return;
        }

        const w = document.createElement('div');
        w.className = 'wake';
        w.style.left = `${x}px`;
        w.style.top = `${y}px`;
        this.fxLayer.appendChild(w);
        w.addEventListener('animationend', () => w.remove(), { once: true });
    }

    spawnAmbientRipple() {
        const b = this._bounds;
        this.spawnRipple(
            Math.random() * b.w,
            Math.random() * b.h,
            0.6 + Math.random() * 0.4
        );
        setTimeout(() => this.spawnAmbientRipple(), 2500 + Math.random() * 3500);
    }

    spawnBubble() {
        const b = document.createElement('div');
        b.className = 'bubble';
        const size = 4 + Math.random() * 14;
        b.style.width = `${size}px`;
        b.style.height = `${size}px`;
        b.style.left = `${Math.random() * 100}vw`;
        b.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
        b.style.animationDuration = `${6 + Math.random() * 10}s`;
        this.bubblesEl.appendChild(b);
        b.addEventListener('animationend', () => b.remove());
    }

    spawnBubbleLoop() {
        this.spawnBubble();
        setTimeout(() => this.spawnBubbleLoop(), 400 + Math.random() * 1200);
    }

    /** Keep dorsal fin up: pitch only, never full velocity-angle rotation */
    updateOrientation(speed) {
        const targetPitch = Math.max(
            -22,
            Math.min(22, Math.atan2(this.vel.y, Math.abs(this.vel.x) + 0.05) * (180 / Math.PI))
        );
        this.pitch += (targetPitch - this.pitch) * 0.06;

        if (speed > 0.12 && Math.abs(this.vel.x) > 0.06) {
            const targetFacing = this.vel.x >= 0 ? 1 : -1;
            if (targetFacing !== this.facing) {
                this.shark.dataset.turn = targetFacing > 0 ? 'right' : 'left';
                setTimeout(() => delete this.shark.dataset.turn, 600);
            }
            this.facing += (targetFacing - this.facing) * 0.04;
            if (Math.abs(this.facing - targetFacing) < 0.05) {
                this.facing = targetFacing;
            }
        }
    }

    permanentlyHide() {
        this.state = 'depart';
        this.beginDepart();
        // After depart animation finishes, kill the loop entirely
        const checkGone = setInterval(() => {
            if (this.state === 'hidden') {
                clearInterval(checkGone);
                this.state = 'dead';          // sentinel — loop will bail out
                this.shark.style.opacity = 0;
                this.shark.style.pointerEvents = 'none';
            }
        }, 500);
    }


    loop(now = performance.now()) {
        if (this._paused || this.state === 'dead') {
            return;
        }
        // 1. declare parameter with fallback
        const speed = Math.hypot(this.vel.x, this.vel.y);

        if (this.state === 'depart') { this.updateDepart(now); }
        else if (this.state === 'hidden') { this.updateHidden(); }
        else if (this.state === 'approach') { this.updateApproach(); }
        else if (this.state === 'startled') { this.updateStartled(); }
        else if (this.state === 'playful') { this.updatePlayful(); }
        else if (this.state === 'happy') { this.updateHappy(now); }
        else { this.updateSwim(now); }

        if (this.state !== 'hidden') {
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;
        }
        this.updateOrientation(speed);

        const depthFade = this.depth * this.depth;
        const depthScale = 1 - depthFade * 0.4;
        const opacity = this.state === 'hidden' ? 0 : (1 - depthFade * 0.92);
        const blur = depthFade * 4;
        const w = this.sharkSize.w * depthScale;
        const h = this.sharkSize.h * depthScale;
        const bleedX = this.sharkSize.w * 0.5;
        const bleedY = this.sharkSize.h * 0.5;
        const b = this._bounds;
        const cx = Math.max(-bleedX, Math.min(b.w + bleedX, this.pos.x)) - w / 2;
        const cy = Math.max(-bleedY, Math.min(b.h + bleedY, this.pos.y)) - h / 2;
        const facingSnap = this.facing >= 0 ? 1 : -1;

        // Opacity
        if (opacity !== this._lastOpacity) {
            this.shark.style.opacity = opacity;
            this._lastOpacity = opacity;
        }

        // Filter
        const shadowY    = (8  + this.depth * 12).toFixed(1);
        const shadowBlur = (16 + this.depth * 8).toFixed(1);
        const shadowAlpha = (0.2 + this.depth * 0.2).toFixed(3);
        const blurVal    = blur.toFixed(3);
        const newFilter  = `drop-shadow(0 ${shadowY}px ${shadowBlur}px rgba(0,0,0,${shadowAlpha})) blur(${blurVal}px)`;
        if (newFilter !== this._lastFilter) {
            this.shark.style.filter = newFilter;
            this._lastFilter = newFilter;
        }

        // Transform
        const newTransform =
            `translate(${cx.toFixed(2)}px,${cy.toFixed(2)}px) ` +
            `scale(${depthScale.toFixed(4)}) ` +
            `rotate(${this.pitch.toFixed(3)}deg) ` +
            `scaleX(${facingSnap})`;
        if (newTransform !== this._lastTransform) {
            this.shark.style.transform = newTransform;
            this._lastTransform = newTransform;
        }

        if (speed > 0.4 && Math.random() < 0.08 && this.depth < 0.5) {
            this.spawnWake(this.pos.x, this.pos.y);
        }
        if (speed > 0.7 && Math.random() < 0.02 && this.depth < 0.3) {
            this.spawnRipple(this.pos.x, this.pos.y, 0.5);
        }

        let ex = 0;
        let ey = 0;
        if (this.lookAt && this.lookAtTimer > 0) {
            const ldx = this.lookAt.x - this.pos.x;
            const ldy = this.lookAt.y - this.pos.y;
            const facing = this.facing >= 0 ? 1 : -1;
            ex = Math.max(-3, Math.min(3, (ldx / 80) * facing * 3));
            ey = Math.max(-2, Math.min(2, ldy / 60 * 2));
            this.lookAtTimer--;
        } else {
            const eyeTime = now * 0.001;
            ex = Math.sin(eyeTime * 1.3) * 2;
            ey = Math.cos(eyeTime * 0.7) * 1.2;
        }

        if (this.state !== 'hidden') {
            const eyeTransform = `translate(${ex.toFixed(3)}px,${ey.toFixed(3)}px)`;
            if (eyeTransform !== this._lastEyeTransform) {
                this.pupil.style.transform = eyeTransform;
                this._lastEyeTransform = eyeTransform;
            }
        }

        if (this.tailGroup) {
            // ✅ Round speed contribution so string only changes on meaningful speed shifts
            const tailDur = `${Math.max(0.55, 1.2 - speed * 0.25).toFixed(3)}s`;
            if (tailDur !== this._lastTailDur) {
                this.tailGroup.style.animationDuration = tailDur;
                this._lastTailDur = tailDur;
            }
        }

        // schedule next frame — rAF passes its timestamp as the argument
        requestAnimationFrame((t) => this.loop(t));

    }
}

window.onload = () => new SharkApp();
