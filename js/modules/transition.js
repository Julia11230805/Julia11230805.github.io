/* module: transition
   The page change is a fade to the sheet's own paper colour — the softest
   cut available, and it never touches the video element (no scale, no
   transform), so the artwork cannot distort while leaving.                  */

RePoem.module('transition', function (app) {
  'use strict';

  var leaving = false;

  function veilDuration() {
    if (app.reducedMotion()) return 120;
    var raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--dur-veil')
      .trim();
    var ms = parseInt(raw, 10);
    return isNaN(ms) ? 620 : ms;
  }

  /**
   * Fade the cover out, then navigate.
   * @param {string} url
   */
  function fadeTo(url) {
    if (leaving) return;
    leaving = true;

    document.body.classList.add('is-leaving');

    // safety net: if the CSS transition never fires, still move on
    var done = false;
    var go = function () {
      if (done) return;
      done = true;
      window.location.href = url;
    };

    var veil = document.getElementById('veil');
    if (veil) {
      veil.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'opacity') go();
      }, { once: true });
    }
    window.setTimeout(go, veilDuration() + 140);
  }

  // returning with the browser's Back button must not show a veiled page
  window.addEventListener('pageshow', function (e) {
    if (e.persisted || document.body.classList.contains('is-leaving')) {
      leaving = false;
      document.body.classList.remove('is-leaving');
      if (e.persisted) window.location.reload();
    }
  });

  return { fadeTo: fadeTo };
});
