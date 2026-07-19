# Conversion Log

## Step 1 — blank Pixi canvas alongside the existing game (DONE)
## Step 2 — real ball sprite + four/six/wicket effects pack (DONE)
## Step 2 bugfixes #1–#3 — duplicate ball, offset, high-DPI drift (DONE)

See prior entries in this log for full detail on Steps 1–2; unchanged
in this package. Summary: PixiJS mounted alongside the original canvas,
a real animated ball sprite with trail/spin replaced the old dot, and
four/six/wicket trigger particle bursts + screen shake, all without
touching a single existing game function.

---

## Step 3 — real bowler/batsman character art (DONE, this package)

**What changed in `pixi-renderer.js`:**
- Added `loadCharacterArt()`, called once from `init()`, non-blocking.
  Loads 8 images total (2 poses x 2 teams x {bowler, batsman}) via
  `PIXI.Assets.load`. If any fail — missing file, offline, CDN blocked —
  the catch handler logs a warning and the old SVG stick figures
  (`#figure-bowler`, `#figure-batsman`) simply stay visible, exactly as
  before this step. Nothing else in the game is affected either way.
- Added `playBowlerRunUp(team)` and `playBatsmanShot(team, direction)`,
  both already called from the exact existing call sites in `index.html`
  (`runBowlerRunUp()` and `triggerBatSwing()`) — no HTML/game-logic edits
  were needed for this step, those hooks were already in place.
- Bowler: run-up pose fades in and steps toward the crease, swaps to the
  release pose at the 240ms "delivering" beat (matching the original
  stick-figure timing exactly), then fades out ~460ms later so the
  bowler doesn't stand frozen at the crease.
- Batsman: backlift pose shows immediately, swaps to follow-through
  ~140ms in (matching the swing animation's own timing curve) with a
  small lateral shift toward the shot direction and a quick scale
  "impact" pulse, then settles back to backlift for the next ball.
- Once character art finishes loading, `#pitch-stage` gets the
  `pixi-chars-active` class (CSS for this — fading the old stick figures
  to opacity 0 — already existed in `index.html`, unused until now).

**Known limitation, stated plainly:** this is a pose-swap between two
static frames per action, not a continuously tweened swing/run — that's
what the source images support. It looks substantially better than the
stick figures, but true fluid motion would need several in-between
frames per action.

---

## Image corrections (this package)

The original image set sent for Step 3 had **filenames that didn't match
their contents** (e.g. a file named `india-backlift.png` actually
contained a Pakistan batsman). All images were re-inspected individually
and renamed to match their actual content before being wired into the
code. A second batch filled remaining gaps (India bowler release-with-ball,
India batsman follow-through, a higher-quality wide stadium shot). A
third batch supplied the last missing pieces: Pakistan bowler release
and Pakistan batsman backlift/follow-through.

**Format:** all game-asset images were converted from `.png` to `.jpg`
per request (flattened onto a white background where needed; none of the
supplied images actually had transparency, so this was a straight format
conversion, no visual change).

**Final file → content mapping (`assets/` folder, all `.jpg`):**

| File | Content |
|---|---|
| `bowler/india-runup.jpg` | India bowler, blue kit, run-up stride, ball in hand |
| `bowler/india-release.jpg` | India bowler, blue kit, arm overhead, ball visibly leaving hand |
| `bowler/pakistan-runup.jpg` | Pakistan bowler, green kit #22, run-up stride, ball in hand |
| `bowler/pakistan-release.jpg` | Pakistan bowler, green kit #22, arm overhead, ball visibly leaving hand |
| `batsman/india-backlift.jpg` | India batsman, blue kit, bat raised, ready stance |
| `batsman/india-followthrough.jpg` | India batsman, blue kit, bat swung high overhead |
| `batsman/pakistan-backlift.jpg` | Pakistan batsman, green kit #7, bat raised over shoulder |
| `batsman/pakistan-followthrough.jpg` | Pakistan batsman, green kit #7, bat lowered post-adjustment (closest available to a follow-through — see note below) |
| `ui/umpire-out.jpg` | Umpire signaling out, pink polo, white hat |
| `ui/stadium-wide.jpg` | Wide match-action render (toss-screen background) |
| `ui/fielder-ready.jpg` | Fielder in ready/crouch stance, green kit |
| `extra/*.jpg` | Unused alternate poses/angles kept for future use — not referenced by any code |

**Honest caveat on `pakistan-followthrough.jpg`:** the regenerated image
for this slot ended up close in pose to the backlift frame rather than a
true full follow-through (bat swung around, weight forward). It's usable
— the animation still reads as "before/after the shot" — but it's visibly
less dynamic than the India follow-through. If you regenerate one more
image (prompt already provided earlier in conversation), swap it in at
this same path and no code changes are needed.

## Next steps (not started)
4. Fielder dive + catch animation.
7. Wire `pixi-input.js` for native drag-to-aim (currently a no-op stub;
   d-pad and existing canvas input are unaffected).
8. Polish: camera pan/zoom, background parallax (optional).
