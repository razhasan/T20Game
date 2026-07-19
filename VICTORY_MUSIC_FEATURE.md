# Feature: Team-specific victory music

## What changed (only `index.html` — `pixi-renderer.js` / `pixi-input.js` are untouched)

Added two new short victory fanfares, synthesized the same way the
existing whoosh/four/six/wicket/welcome sounds already are (embedded as
base64 WAV data — no external audio files, single self-contained file,
no build step):

- **India**: bright ascending major-key bell/brass fanfare (~3.6s, loops).
- **Pakistan**: dhol-drum groove with a distinct square-wave lead riff in
  a different scale (~6.3s, loops) — deliberately a different instrument
  feel and rhythm from India's, not just a transposed copy.

Both are clearly different from the existing looping `welcome` screen
music (which is stopped automatically before either one plays).

## Where it's hooked in

Single call site: `showWinCelebration(winningTeam, mode, callback)` — the
function that already shows the full-screen celebration photo + emoji
rain before the final scorecard. This one function is called from both
places a match can end (defending a total, and chasing one down), so both
paths are covered automatically.

- The moment the celebration overlay appears → `SoundFX.playVictoryMusic(winningTeam)`
  starts the correct team's fanfare, looped, after stopping any other
  music first.
- The moment the celebration finishes (auto-timeout or the player taps
  skip) → `SoundFX.stopVictoryMusic()` stops it, right before the
  `callback()` that reveals `result-screen` (the final scorecard).
- A tied match never shows the celebration screen at all (existing
  behavior, unchanged), so no victory music plays for a tie — there's no
  winner to celebrate.
- Respects the existing mute button/state, same as every other sound in
  the game.

## Verified

- Zero functions removed or renamed from the previous version — only two
  new functions added (`playVictoryMusic`, `stopVictoryMusic`), plus one
  new block inside `showWinCelebration()`.
- Full inline `<script>` block re-checked with `node --check` after every
  edit — valid JS throughout.

## How to test

1. Play a match to completion as India (either defending or chasing) —
   confirm the bright ascending fanfare plays as soon as the celebration
   photo appears, and stops cleanly when the scorecard shows.
2. Same for Pakistan — confirm it's the dhol/riff track, not India's, and
   that they sound clearly different from each other and from the
   welcome-screen music.
3. Tap "skip" during the celebration — music should stop immediately,
   not linger into the scorecard screen.
4. Mute the game before a match ends — no victory music should play.
