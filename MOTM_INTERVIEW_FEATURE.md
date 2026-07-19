# Feature: Man of the Match post-victory interview

## What changed

Only `index.html` was edited (verified additive-only: 0 functions removed;
new functions added: `showManOfTheMatchInterview`, `buildMotmScript`,
`motmPickRandom`, plus small internal helpers). `pixi-renderer.js` and
`pixi-input.js` are untouched, so they're not included in this zip.

**New assets** (`assets/motm/`) — all cut from the 11 photos you sent,
background removed and cropped on the 10 character shots, resized:
- `pakistan-batting-1/2/3.png`, `pakistan-bowling-1/2.png`
- `india-batting-1/2/3.png`, `india-bowling-1/2.png`
- `presenter.jpg` (kept its own stadium background, just resized)

## How it works

The game already computed a real Man of the Match (`computeMotm()` /
`applyMotm()` — highest-weighted combination of runs, wickets, and
catches from the winning team). That part was untouched; only extended
slightly to also remember:
- `state.motmDetails` — the full `{name, runs, wickets, catches}` record
- `state.motmRole` — `'batting'` or `'bowling'`, using the same
  runs-vs-(wickets×25+catches×10) weighting already used to pick the
  MOTM in the first place, so it's a **real** performance-based choice —
  a genuine bowling star gets bowling photos + bowling questions, a
  genuine batting star gets batting photos + batting questions.

**Sequence:** win celebration image → **Man of the Match interview**
(new) → final scorecard. Hooked into the same two places the game already
transitions from celebration to scorecard, so both a defended total and a
successful chase trigger it identically.

**The interview screen:**
- Presenter photo on one side, a **random** photo from the MOTM's
  team + role pool on the other (e.g. a Pakistani bowler MOTM always
  gets a Pakistan bowling photo, randomly one of the 2 available; a
  batting MOTM gets randomly one of 3).
- 3 questions from the commentator, each followed by the player's
  answer — all as subtitle-style text, with the real stat (runs or
  wickets) worked into the first answer.
- Closes with "Thank you very much for your time..." /
  "Thank you very much!"
- Each line is tap-to-advance (tap/click anywhere) **or** auto-advances
  after a few seconds if you don't tap — so it never gets stuck if
  someone walks away. "Skip ▶" in the corner jumps straight to the
  scorecard at any point, same convention as the celebration screen.

## How to test

1. Play a match to completion either way (defending or chasing).
2. After the celebration image, confirm the interview screen appears:
   presenter + a player photo matching the winning team's kit.
3. Check the role matches the performance — if your MOTM took wickets,
   you should see a bowling photo and bowling-themed questions; if they
   scored the runs, a batting photo and batting-themed questions.
4. Read through all 3 Q&A pairs + the closing thank-you, then confirm it
   transitions into the normal final scorecard.
5. Try "Skip ▶" — should jump straight to the scorecard.
6. Play a tied match — confirm it goes straight to the scorecard with no
   celebration or interview (unchanged existing behavior — there's no
   winner to interview).

## Note on the images

These are single still photos, not video/animated — the "interview" is
sold through the subtitle text and a light glow highlighting whoever is
currently "speaking," not lip-sync or gesture animation. Swapping in more
photos later (e.g. more variety per pool) is just a matter of adding file
names to the `MOTM_IMAGES` list in `index.html` — no other code changes
needed.
