// ================================================================
//  PIXI INPUT — will translate pointer/tap/drag events on the Pixi
//  stage into calls to the EXISTING input-handling functions already
//  in index.html (startDrag/moveDrag/endDrag, tapShot(), the
//  bowling d-pad handlers, etc.) — never duplicate that logic here,
//  only route input to it.
//
//  STATUS: NOT STARTED. Character art (Step 3) is now in place, but
//  input wiring is still Step 7 in the build order — it comes after
//  fielders/stumps polish too. Right now #pixi-layer is
//  `pointer-events: none` in CSS, so even if this file attached
//  listeners today they'd never fire — all taps/drags correctly keep
//  going to the existing d-pad buttons and canvas as they do now.
//  This file is intentionally a no-op until Step 7 is picked up.
// ================================================================

(function () {
    // Intentionally empty. See CONVERSION_LOG.md for the input-routing
    // approach to implement here once needed.
})();
