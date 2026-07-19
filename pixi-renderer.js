// ================================================================
//  PIXI RENDERER — owns the Pixi layer only. Reads `state` from the
//  existing game (index.html) and draws it. NEVER mutates game
//  state — it is called from the end of drawPitch(), which remains
//  the authoritative, unmodified game render.
//
//  Live bowling/batting keeps using the SVG stick figures
//  (#figure-bowler, #figure-batsman) completely untouched — real
//  character photos only ever appear as a brief "action replay"
//  flash via the single reused <img id="action-replay-popup">:
//   - every delivery: bowler's release photo, offset right of the
//     stumps (pos-bowler), fired from runBowlerRunUp()'s existing
//     240ms "delivering" beat via playBowlerBallReplay()
//   - four/six: batting team's follow-through photo, offset left of
//     the stumps (pos-batsman), fired from triggerEffect()
//   - wicket: umpire's out-signal photo, positioned below the "OUT"
//     result-banner text so neither one covers the other (pos-umpire),
//     fired from triggerEffect()
// ================================================================

const pixiRenderer = (function () {
    let app = null;
    let world = null;
    let layers = {};
    let ready = false;
    let replayArtReady = false;

    const BASE_WIDTH = 500;
    const BASE_HEIGHT = 560;
    const STUMP_POS = { x: BASE_WIDTH * 0.48 + 6, y: BASE_HEIGHT * 0.76 + 10 };

    const basePos = { x: 0, y: 0 };
    const shakeOffset = { x: 0, y: 0 };

    let layerEl = null;
    let refCanvas = null;

    // Cached every frame from renderMatchFrame(state) so triggerEffect()/
    // playBowlerBallReplay() — called with no team argument — still pick
    // the correct team's photo.
    let lastBattingTeam = 'india';
    let lastBowlingTeam = 'pakistan';

    async function init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) throw new Error(`pixiRenderer.init: #${containerId} not found`);
        if (typeof PIXI === 'undefined') throw new Error('pixiRenderer.init: PIXI not loaded (CDN blocked?)');

        layerEl = container;
        refCanvas = document.getElementById('pitch-canvas');

        app = new PIXI.Application();
        await app.init({
            resizeTo: container,
            backgroundAlpha: 0,
            antialias: true,
        });
        container.appendChild(app.canvas);

        world = new PIXI.Container();
        app.stage.addChild(world);

        layers.background = new PIXI.Container();
        layers.pitch = new PIXI.Container();
        layers.fielders = new PIXI.Container();
        layers.bowler = new PIXI.Container();
        layers.batsman = new PIXI.Container();
        layers.ball = new PIXI.Container();
        layers.stumps = new PIXI.Container();
        layers.fx = new PIXI.Container();
        Object.values(layers).forEach((l) => world.addChild(l));

        buildBallSprite();
        buildOutBallSprite();
        fitStage();
        window.addEventListener('resize', fitStage);
        app.ticker.add(updateParticles);

        ready = true;
        showBadge('Pixi ✓ (ball + fx active)');

        preloadReplayImages().then(() => {
            replayArtReady = true;
        }).catch((err) => {
            console.warn('[pixiRenderer] replay images failed to preload (particles/shake still work):', err);
        });
    }

    function syncLayerToPitchCanvas() {
        if (!layerEl) return null;
        if (!refCanvas || !document.body.contains(refCanvas)) {
            refCanvas = document.getElementById('pitch-canvas');
        }
        if (!refCanvas) return null;

        const canvasRect = refCanvas.getBoundingClientRect();
        if (!canvasRect.width || !canvasRect.height) return null;

        const offsetParent = layerEl.offsetParent;
        const parentRect = offsetParent ? offsetParent.getBoundingClientRect() : canvasRect;

        const left = canvasRect.left - parentRect.left;
        const top = canvasRect.top - parentRect.top;

        layerEl.style.left = left + 'px';
        layerEl.style.top = top + 'px';
        layerEl.style.width = canvasRect.width + 'px';
        layerEl.style.height = canvasRect.height + 'px';

        return { width: canvasRect.width, height: canvasRect.height };
    }

    function fitStage() {
        if (!app || !world) return;
        const synced = syncLayerToPitchCanvas();
        const w = synced ? synced.width : app.screen.width;
        const h = synced ? synced.height : app.screen.height;
        if (!w || !h) return;

        if (app.renderer &&
            (Math.round(app.screen.width) !== Math.round(w) ||
             Math.round(app.screen.height) !== Math.round(h))) {
            app.renderer.resize(w, h);
        }

        const scaleX = w / BASE_WIDTH;
        const scaleY = h / BASE_HEIGHT;
        world.scale.set(scaleX, scaleY);
        basePos.x = 0;
        basePos.y = 0;
        applyWorldPosition();
    }

    function applyWorldPosition() {
        if (!world) return;
        world.position.set(basePos.x + shakeOffset.x, basePos.y + shakeOffset.y);
    }

    function showBadge(text) {
        const badge = document.getElementById('pixi-status-badge');
        if (!badge) return;
        badge.textContent = text;
        badge.style.display = 'block';
    }

    // ---- Ball sprite -------------------------------------------------
    let ballGfx = null;
    const TRAIL_POOL_SIZE = 16;
    let trailPool = [];
    let lastBallPos = { x: STUMP_POS.x, y: STUMP_POS.y };

    function buildBallSprite() {
        ballGfx = new PIXI.Graphics();
        ballGfx.visible = false;
        layers.ball.addChild(ballGfx);
        for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
            const g = new PIXI.Graphics();
            g.visible = false;
            layers.ball.addChildAt(g, 0);
            trailPool.push(g);
        }
    }

    function drawBallGraphic(g) {
        g.clear();
        g.circle(0, 0, 7).fill({ color: 0xffffff });
        g.circle(0, 0, 7).fill({ color: 0xc9c9c9, alpha: 0.25 });
        g.circle(-2.3, -2.3, 1.8).fill({ color: 0xffffff, alpha: 0.95 });
        g.stroke({ width: 1.2, color: 0xe53935 });
        g.arc(0, 0, 5, Math.PI * 0.15, Math.PI * 0.85);
        g.arc(0, 0, 5, Math.PI * 1.15, Math.PI * 1.85);
    }

    let outBallGfx = null;
    function buildOutBallSprite() {
        outBallGfx = new PIXI.Graphics();
        outBallGfx.visible = false;
        drawBallGraphic(outBallGfx);
        layers.ball.addChild(outBallGfx);
    }

    function positionBallAndTrail(b) {
        if (!ballGfx.visible) drawBallGraphic(ballGfx);
        ballGfx.visible = true;
        ballGfx.position.set(b.x, b.y);
        const dx = b.x - lastBallPos.x, dy = b.y - lastBallPos.y;
        ballGfx.rotation += Math.hypot(dx, dy) * 0.04;
        lastBallPos = { x: b.x, y: b.y };

        const trail = b.trail || [];
        for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
            const g = trailPool[i];
            const t = trail[i];
            if (!t) { g.visible = false; continue; }
            g.visible = true;
            g.clear();
            g.circle(0, 0, 4).fill({ color: 0xffffff, alpha: (i / trail.length) * 0.25 });
            g.position.set(t.x, t.y);
        }
    }

    function hideBallAndTrail() {
        ballGfx.visible = false;
        trailPool.forEach((g) => { g.visible = false; });
    }

    // ---- Particle / screen-shake effects pack -------------------------
    let particles = [];

    function spawnBurst(x, y, opts) {
        const {
            count = 18, colors = [0xffd54f, 0xffffff, 0xff7043],
            speed = 4, spread = Math.PI * 2, gravity = 0.12,
            life = 45, size = 4, shape = 'rect',
        } = opts;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * spread - spread / 2 - Math.PI / 2;
            const v = speed * (0.5 + Math.random() * 0.8);
            const g = new PIXI.Graphics();
            const color = colors[Math.floor(Math.random() * colors.length)];
            if (shape === 'rect') g.rect(-size / 2, -size / 2, size, size).fill({ color });
            else g.circle(0, 0, size / 2).fill({ color, alpha: 0.8 });
            g.position.set(x, y);
            g.rotation = Math.random() * Math.PI * 2;
            layers.fx.addChild(g);
            particles.push({
                gfx: g,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v,
                gravity, life, maxLife: life,
                spin: (Math.random() - 0.5) * 0.3,
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.vy += p.gravity;
            p.gfx.position.x += p.vx;
            p.gfx.position.y += p.vy;
            p.gfx.rotation += p.spin;
            p.life -= 1;
            p.gfx.alpha = Math.max(0, p.life / p.maxLife);
            if (p.life <= 0) {
                layers.fx.removeChild(p.gfx);
                p.gfx.destroy();
                particles.splice(i, 1);
            }
        }
    }

    function screenShake(magnitude = 6, duration = 0.32) {
        if (typeof gsap === 'undefined') return;
        gsap.killTweensOf(shakeOffset);
        const tl = gsap.timeline({
            onUpdate: applyWorldPosition,
            onComplete: () => { shakeOffset.x = 0; shakeOffset.y = 0; applyWorldPosition(); },
        });
        const steps = 6;
        for (let i = 0; i < steps; i++) {
            const decay = 1 - i / steps;
            tl.to(shakeOffset, {
                x: (Math.random() * 2 - 1) * magnitude * decay,
                y: (Math.random() * 2 - 1) * magnitude * decay,
                duration: duration / steps,
                ease: 'sine.inOut',
            });
        }
    }

    // ---- Replay-only character art -------------------------------------
    const REPLAY_IMAGES = {
        batsman: {
            india: 'assets/batsman/india-followthrough.jpg',
            pakistan: 'assets/batsman/pakistan-followthrough.jpg',
        },
        bowler: {
            india: 'assets/bowler/india-release.jpg',
            pakistan: 'assets/bowler/pakistan-release.jpg',
        },
        umpireOut: 'assets/ui/umpire-out.jpg',
    };

    async function preloadReplayImages() {
        const urls = [
            REPLAY_IMAGES.batsman.india, REPLAY_IMAGES.batsman.pakistan,
            REPLAY_IMAGES.bowler.india, REPLAY_IMAGES.bowler.pakistan,
            REPLAY_IMAGES.umpireOut,
        ];
        await Promise.all(urls.map((u) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(u);
            img.onerror = () => reject(new Error('failed to load ' + u));
            img.src = u;
        })));
    }

    const POS_CLASSES = ['pos-bowler', 'pos-batsman', 'pos-umpire'];
    let replayHideTimer = null;

    function playActionReplay(src, holdMs, posClass) {
        const el = document.getElementById('action-replay-popup');
        if (!el || !src) return;
        clearTimeout(replayHideTimer);
        el.src = src;
        el.classList.remove('show', ...POS_CLASSES);
        void el.offsetWidth; // restart transition cleanly even if re-triggered mid-flash
        if (posClass) el.classList.add(posClass);
        el.classList.add('show');
        replayHideTimer = setTimeout(() => {
            el.classList.remove('show');
        }, holdMs || 1000);
    }

    // ---- Public: called from runBowlerRunUp()'s 240ms "delivering" beat -
    function playBowlerBallReplay() {
        if (!replayArtReady) return;
        playActionReplay(REPLAY_IMAGES.bowler[lastBowlingTeam], 480, 'pos-bowler');
    }

    // ---- Public: triggered from showResultBanner(text, type) ------------
    function triggerEffect(type) {
        if (!ready) return;
        const origin = lastBallPos;
        if (type === 'six') {
            spawnBurst(origin.x, origin.y, {
                count: 34, colors: [0xffd54f, 0xffffff, 0xff7043, 0x4fc3f7],
                speed: 6.5, life: 55, size: 5,
            });
            screenShake(7, 0.35);
            if (replayArtReady) playActionReplay(REPLAY_IMAGES.batsman[lastBattingTeam], 1200, 'pos-batsman');
        } else if (type === 'four') {
            spawnBurst(origin.x, origin.y, {
                count: 16, colors: [0xffffff, 0xffd54f], speed: 4, life: 35, size: 4,
            });
            if (replayArtReady) playActionReplay(REPLAY_IMAGES.batsman[lastBattingTeam], 1000, 'pos-batsman');
        } else if (type === 'out') {
            spawnBurst(STUMP_POS.x, STUMP_POS.y, {
                count: 14, colors: [0xd7ccc8, 0xbcaaa4], speed: 2.4,
                gravity: 0.02, life: 40, size: 6, shape: 'circle', spread: Math.PI,
            });
            screenShake(9, 0.4);
            if (replayArtReady) playActionReplay(REPLAY_IMAGES.umpireOut, 1300, 'pos-umpire');
        }
    }

    // ---- Public: called once per frame from the end of drawPitch() ------
    function renderMatchFrame(state) {
        if (!ready || !app) return;
        fitStage();

        if (state) {
            if (state.battingTeam === 'india' || state.battingTeam === 'pakistan') {
                lastBattingTeam = state.battingTeam;
            }
            if (state.bowlingTeam === 'india' || state.bowlingTeam === 'pakistan') {
                lastBowlingTeam = state.bowlingTeam;
            }
        }

        if (state && state.ball && typeof state.ball.x === 'number') {
            positionBallAndTrail(state.ball);
        } else {
            hideBallAndTrail();
        }

        if (state && state.outBall && typeof state.outBall.x === 'number') {
            outBallGfx.visible = true;
            outBallGfx.position.set(state.outBall.x, state.outBall.y);
            lastBallPos = { x: state.outBall.x, y: state.outBall.y };
        } else {
            outBallGfx.visible = false;
        }
    }

    return {
        init,
        renderMatchFrame,
        triggerEffect,
        playBowlerBallReplay,
        isBallActive: () => ready,
        isReplayArtActive: () => replayArtReady,
        resize: fitStage,
        get app() { return app; },
        get layers() { return layers; },
    };
})();

window.pixiRenderer = pixiRenderer;
