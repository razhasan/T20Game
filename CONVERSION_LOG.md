# Conversion Log

## Steps 1–2 (unchanged) — blank Pixi canvas + real ball sprite + fx pack
See the game's live behavior: PixiJS mounted alongside the original
canvas, ball has trail/spin, four/six/wicket trigger particle bursts +
screen shake. Untouched in this update.

## Why the bowler photo wasn't showing (found and fixed)

The `index.html` you're running never actually called into the
character-art code — there was no `playBowlerRunUp()` /
`playBatsmanShot()` hook to `pixiRenderer`, and no popup `<img>` element
for it to draw into. The character-loading code existed in
`pixi-renderer.js` from an earlier package, but nothing in `index.html`
ever invoked it, so it silently did nothing. That's the actual root
cause — not a broken image path.

## Step 3 (redesigned) — replay-only character art

Per your last message, the design changed on purpose:

- **Live bowling/batting still uses the original SVG stick figures,
  100% untouched.** `#figure-bowler` / `#figure-batsman` and their CSS
  animations were not modified at all in this update.
- **Real character photos now only appear as a brief "action replay"
  flash** at the exact moment a four/six/wicket banner fires — the same
  `triggerEffect(type)` call site the particle effects already use, so
  no other game logic needed to change.
- The flash is a single reused `<img id="action-replay-popup">`
  (added to `index.html`), sized with `max-width: 34%; max-height: 46%`
  of the pitch stage — a percentage, not a fixed pixel height — so it
  can never dominate the frame the way a full pitch-scale sprite did in
  the earlier attempt. It fades/scales in, holds ~1.1–1.3s, then fades
  out, and the stick figures simply continue as normal underneath.
- Which photo shows: batsman follow-through (batting team) for
  four/six, umpire's out signal for a wicket.
- All 5 replay images are pre-loaded once in the background when the
  page loads (`preloadReplayImages()`), so the first four/six/wicket
  doesn't stall waiting on a network request. If loading fails for any
  reason (offline, missing file), the flash is silently skipped and the
  particle/shake effects still fire normally — never breaks the game.

**Image cropping:** the batsman/bowler/umpire images had large plain
studio-background margins in the original files, which would have made
them look small and washed-out inside a compact popup. All 5 replay
images were auto-trimmed to the character's actual bounding box before
being wired in, so they fill the popup frame properly at a glance.

## Developer photo — root cause and fix

`index.html` references `images/credit.JPG` (capital `.JPG`). This file
must be placed at the repo root in a folder literally named `images`,
containing a file literally named `credit.JPG` — **capitalization
matters**, GitHub Pages is served from a case-sensitive Linux filesystem,
so `credit.jpg` or `Credit.JPG` will 404 even though it looks fine
locally on a Mac/Windows machine. This wasn't something I could fix in
this package since it's your own personal photo — just double-check the
exact filename case when you upload it.

## Next steps (not started)
- Fielder dive + catch animation.
- `pixi-input.js` native drag-to-aim (still an intentional no-op stub).
- If you'd like the replay flash to show two frames (e.g. backlift →
  follow-through) instead of a single freeze-frame, the backlift images
  are already included in `assets/batsman/` and `assets/bowler/` and
  can be wired in without needing new artwork.
