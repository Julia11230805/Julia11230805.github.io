/* module: autoplay
   Muted autoplay is allowed everywhere, but it still fails on iOS Low Power
   Mode and in a few enterprise policies. This keeps the loop alive and gives
   the cover a graceful path back.                                          */

RePoem.module('autoplay', function (app) {
  'use strict';

  var video = document.getElementById('coverVideo');
  if (!video) return null;

  video.muted = true;            // required for autoplay
  video.defaultMuted = true;
  video.playsInline = true;

  var gestureBound = false;

  function attempt() {
    var p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        // blocked: wait for the first real gesture, then start silently
        if (gestureBound) return;
        gestureBound = true;
        var kick = function () {
          video.play().catch(function () {});
          window.removeEventListener('pointerdown', kick);
          window.removeEventListener('keydown', kick);
          window.removeEventListener('touchstart', kick);
        };
        window.addEventListener('pointerdown', kick, { once: true, passive: true });
        window.addEventListener('keydown', kick, { once: true });
        window.addEventListener('touchstart', kick, { once: true, passive: true });
      });
    }
    return p;
  }

  // keep it looping if a browser drops the loop flag after a stall
  video.addEventListener('ended', function () {
    video.currentTime = 0;
    video.play().catch(function () {});
  });

  // don't burn battery in a background tab, and never resume on a stalled frame
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      video.pause();
    } else {
      video.play().catch(function () {});
    }
  });

  attempt();

  return { play: attempt };
});
