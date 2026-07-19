// ================================================================
//  PIXI RENDERER — owns the Pixi layer only. Reads `state` from the
//  existing game (index.html) and draws it. NEVER mutates game
//  state — it is called from the end of drawPitch(), which remains
//  the authoritative, unmodified game render.
//
//  STATUS:
//   Step 2 — real ball sprite + four/six/wicket particle fx (DONE)
//   Step 3 — real bowler/batsman character art, wired to the
//            existing playBowlerRunUp(state.bowlingTeam) and
//            playBatsmanShot(state.battingTeam, direction) call
//            sites already present in index.html (DONE, this file)
//
//  Character art lives in assets/bowler/, assets/batsman/, assets/ui/
//  as .jpg files. If any fail to load (missing file, offline, CDN
//  blocked), the old SVG stick figures simply stay visible — this
//  file never removes them from the DOM, it only toggles
//  #pitch-stage's "pixi-chars-active" class once real art is
//  confirmed ready, and CSS (index.html) fades the stick figures out
//  only while that class is present.
// ================================================================

const pixiRenderer = (function () {
    let app = null;
    let world = null;          // everything scales/shakes together inside this
    let layers = {};
    let ready = false;
    let charsReady = false;    // true once bowler+batsman art has loaded

    const BASE_WIDTH = 500;
    const BASE_HEIGHT = 560;
    // Matches the striker's stumps position computed in drawPitch()
    // (stumpX = W*0.48, stumpY = H*0.76) — kept as a constant here since
    // that layout is fixed, not per-frame data from `state`.
    const STUMP_POS = { x: BASE_WIDTH * 0.48 + 6, y: BASE_HEIGHT * 0.76 + 10 };

    // Mirrors the CSS positions of #figure-bowler / #figure-batsman in
    // index.html (left/top percentages), converted into the same
    // BASE_WIDTH x BASE_HEIGHT world coordinate space the ball uses.
    const BOWLER_POS = { x: BASE_WIDTH * 0.48, y: BASE_HEIGHT * 0.09 };
    const BATSMAN_POS = { x: BASE_WIDTH * 0.48, y: BASE_HEIGHT * 0.70 };

    const basePos = { x: 0, y: 0 };
    const shakeOffset = { x: 0, y: 0 };

    let layerEl = null;
    let refCanvas = null;
    let pitchStageEl = null;

    async function init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) throw new Error(`pixiRenderer.init: #${containerId} not found`);
        if (typeof PIXI === 'undefined') throw new Error('pixiRenderer.init: PIXI not loaded (CDN blocked?)');

        layerEl = container;
        pitchStageEl = document.getElementById('pitch-stage');
        refCanvas = document.getElementById('pitch-canvas');

        app = new PIXI.Application();
        await app.init({
            resizeTo: container,
            backgroundAlpha: 0,   // transparent — existing canvas/SVG stays visible underneath
            antialias: true,
        });
        container.appendChild(app.canvas);

        world = new PIXI.Container();
        app.stage.addChild(world);

        // Layer order: background < pitch < fielders < bowler < batsman
        // < ball < stumps < fx, so the ball always draws over both
        // characters and fx (particles/dust) always draws over everything.
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
        showBadge('Pixi ✓ (Step 2 — animated ball + fx)');

        // Character art loads separately and is non-blocking: if it fails,
        // the game is completely unaffected and the SVG stick figures
        // simply remain visible (never toggled off).
        loadCharacterArt().then(() => {
            charsReady = true;
            if (pitchStageEl) pitchStageEl.classList.add('pixi-chars-active');
            showBadge('Pixi ✓ (Step 3 — bowler/batsman art loaded)');
        }).catch((err) => {
            console.warn('[pixiRenderer] character art failed to load, stick figures remain active:', err);
        });
    }

    // ---- Force #pixi-layer to match #pitch-canvas's live box -------------
    function syncLayerToPitchCanvas() {
        if (!layerEl) return null;
        if (!refCanvas || !document.body.contains(refCanvas)) {
            refCanvas = document.getElementById('pitch-canvas');
        }
        if (!refCanvas) return null;

        const canvasRect = refCanvas.getBoundingClientRect();
        if (!canvasRect.width || !canvasRect.height) return null; // hidden screen — try again next frame

        const offsetParent = layerEl.offsetParent;
        const parentRect = offsetParent
            ? offsetParent.getBoundingClientRect()
            : canvasRect;

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

    // ---- Ball sprite (Step 2) -------------------------------------------
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

    // ---- Particle / screen-shake effects pack ----------------------------
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
        if (typeof gsap === 'undefined') { return; }
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

    function triggerEffect(type) {
        if (!ready) return;
        const origin = lastBallPos;
        if (type === 'six') {
            spawnBurst(origin.x, origin.y, {
                count: 34, colors: [0xffd54f, 0xffffff, 0xff7043, 0x4fc3f7],
                speed: 6.5, life: 55, size: 5,
            });
            screenShake(7, 0.35);
        } else if (type === 'four') {
            spawnBurst(origin.x, origin.y, {
                count: 16, colors: [0xffffff, 0xffd54f], speed: 4, life: 35, size: 4,
            });
        } else if (type === 'out') {
            spawnBurst(STUMP_POS.x, STUMP_POS.y, {
                count: 14, colors: [0xd7ccc8, 0xbcaaa4], speed: 2.4,
                gravity: 0.02, life: 40, size: 6, shape: 'circle', spread: Math.PI,
            });
            screenShake(9, 0.4);
        }
    }

    // ---- Character art (Step 3) ------------------------------------------
    // File layout (relative to index.html):
    //   assets/bowler/india-runup.jpg     assets/bowler/india-release.jpg
    //   assets/bowler/pakistan-runup.jpg  assets/bowler/pakistan-release.jpg
    //   assets/batsman/india-backlift.jpg      assets/batsman/india-followthrough.jpg
    //   assets/batsman/pakistan-backlift.jpg   assets/batsman/pakistan-followthrough.jpg
    const CHAR_ASSETS = {
        bowler: {
            india: { runup: 'assets/bowler/india-runup.jpg', release: 'assets/bowler/india-release.jpg' },
            pakistan: { runup: 'assets/bowler/pakistan-runup.jpg', release: 'assets/bowler/pakistan-release.jpg' },
        },
        batsman: {
            india: { backlift: 'assets/batsman/india-backlift.jpg', followthrough: 'assets/batsman/india-followthrough.jpg' },
            pakistan: { backlift: 'assets/batsman/pakistan-backlift.jpg', followthrough: 'assets/batsman/pakistan-followthrough.jpg' },
        },
    };

    const bowlerSprites = { india: {}, pakistan: {} };
    const batsmanSprites = { india: {}, pakistan: {} };
    let activeBowlerSprite = null;
    let activeBatsmanSprite = null;
    let bowlerRunToken = null;
    let batsmanShotToken = null;

    async function loadCharacterArt() {
        const urls = [];
        Object.values(CHAR_ASSETS.bowler).forEach((v) => urls.push(v.runup, v.release));
        Object.values(CHAR_ASSETS.batsman).forEach((v) => urls.push(v.backlift, v.followthrough));

        const textures = await Promise.all(urls.map((u) => PIXI.Assets.load(u)));
        const texByUrl = {};
        urls.forEach((u, i) => { texByUrl[u] = textures[i]; });

        ['india', 'pakistan'].forEach((team) => {
            const bCfg = CHAR_ASSETS.bowler[team];
            bowlerSprites[team].runup = makeCharSprite(texByUrl[bCfg.runup], BOWLER_POS, 90);
            bowlerSprites[team].release = makeCharSprite(texByUrl[bCfg.release], BOWLER_POS, 90);
            layers.bowler.addChild(bowlerSprites[team].runup, bowlerSprites[team].release);

            const sCfg = CHAR_ASSETS.batsman[team];
            batsmanSprites[team].backlift = makeCharSprite(texByUrl[sCfg.backlift], BATSMAN_POS, 130);
            batsmanSprites[team].followthrough = makeCharSprite(texByUrl[sCfg.followthrough], BATSMAN_POS, 130);
            layers.batsman.addChild(batsmanSprites[team].backlift, batsmanSprites[team].followthrough);
        });
    }

    // Builds a sprite anchored at bottom-center (feet on the crease),
    // pre-scaled to a target on-screen height in world units.
    function makeCharSprite(texture, pos, targetHeight) {
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5, 1);
        sprite.position.set(pos.x, pos.y);
        const scale = targetHeight / sprite.texture.height;
        sprite.scale.set(scale, scale);
        sprite.visible = false;
        sprite.alpha = 0;
        return sprite;
    }

    function swapVisible(container, newSprite) {
        Object.keys(container).forEach((k) => { /* no-op placeholder for clarity */ });
    }

    // ---- Public: called from runBowlerRunUp() at 0/240/520ms beats -------
    function playBowlerRunUp(team) {
        if (!charsReady) return;
        team = (team === 'pakistan') ? 'pakistan' : 'india';
        const set = bowlerSprites[team];
        if (!set || !set.runup || !set.release) return;

        const myToken = (bowlerRunToken = {});
        // Hide the other team's bowler immediately, and the currently
        // active sprite from any previous over.
        ['india', 'pakistan'].forEach((t) => {
            if (bowlerSprites[t].runup) { bowlerSprites[t].runup.visible = false; bowlerSprites[t].runup.alpha = 0; }
            if (bowlerSprites[t].release) { bowlerSprites[t].release.visible = false; bowlerSprites[t].release.alpha = 0; }
        });

        // 0ms: run-up pose fades in, small step-in motion toward the crease.
        set.runup.visible = true;
        set.runup.alpha = 0;
        set.runup.position.x = BOWLER_POS.x - 10;
        if (typeof gsap !== 'undefined') {
            gsap.to(set.runup, { alpha: 1, duration: 0.12 });
            gsap.to(set.runup.position, { x: BOWLER_POS.x, duration: 0.24, ease: 'power1.out' });
        } else {
            set.runup.alpha = 1;
        }
        activeBowlerSprite = set.runup;

        // 240ms: swap to the release pose (matches the 'delivering' CSS beat).
        setTimeout(() => {
            if (bowlerRunToken !== myToken) return;
            set.runup.visible = false;
            set.release.visible = true;
            set.release.alpha = 1;
            set.release.position.x = BOWLER_POS.x;
            activeBowlerSprite = set.release;
        }, 240);

        // ~700ms: fade the release pose back out so the bowler isn't stuck
        // standing at the crease once the ball is already in play.
        setTimeout(() => {
            if (bowlerRunToken !== myToken) return;
            if (typeof gsap !== 'undefined') {
                gsap.to(set.release, { alpha: 0, duration: 0.25, onComplete: () => { set.release.visible = false; } });
            } else {
                set.release.visible = false;
            }
        }, 700);
    }

    // ---- Public: called from triggerBatSwing() on every shot -------------
    function playBatsmanShot(team, direction) {
        if (!charsReady) return;
        team = (team === 'pakistan') ? 'pakistan' : 'india';
        const set = batsmanSprites[team];
        if (!set || !set.backlift || !set.followthrough) return;

        const myToken = (batsmanShotToken = {});
        ['india', 'pakistan'].forEach((t) => {
            if (batsmanSprites[t].backlift) { batsmanSprites[t].backlift.visible = false; }
            if (batsmanSprites[t].followthrough) { batsmanSprites[t].followthrough.visible = false; }
        });

        let lateral = 0;
        if (direction === 'left') lateral = -18;
        else if (direction === 'right') lateral = 18;

        // Backlift shown immediately (mirrors bat animation start).
        set.backlift.visible = true;
        set.backlift.alpha = 1;
        set.backlift.position.x = BATSMAN_POS.x;

        // ~140ms (roughly the 0.4 point of the 350ms swing): swap to
        // follow-through with a small lateral shift matching shot direction.
        setTimeout(() => {
            if (batsmanShotToken !== myToken) return;
            set.backlift.visible = false;
            set.followthrough.visible = true;
            set.followthrough.alpha = 1;
            set.followthrough.position.x = BATSMAN_POS.x + lateral;
            if (typeof gsap !== 'undefined') {
                gsap.fromTo(set.followthrough.scale,
                    { x: set.followthrough.scale.x * 1.05, y: set.followthrough.scale.y * 1.05 },
                    { x: set.followthrough.scale.x, y: set.followthrough.scale.y, duration: 0.18 });
            }
        }, 140);

        // ~600ms: settle back to the idle backlift pose, ready for next ball.
        setTimeout(() => {
            if (batsmanShotToken !== myToken) return;
            set.followthrough.visible = false;
            set.backlift.visible = true;
            set.backlift.position.x = BATSMAN_POS.x;
        }, 600);
    }

    // ---- Public: called once per frame from the end of drawPitch() ------
    function renderMatchFrame(state) {
        if (!ready || !app) return;
        fitStage();

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
        playBowlerRunUp,
        playBatsmanShot,
        isBallActive: () => ready,
        isCharArtActive: () => charsReady,
        resize: fitStage,
        get app() { return app; },
        get layers() { return layers; },
    };
})();

window.pixiRenderer = pixiRenderer;
