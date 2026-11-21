/* module: cover
   Wires the only two behaviours module 01 owns: reveal the type once the
   film is actually running, and leave for module 02 on click.              */

RePoem.module('cover', function (app) {
  'use strict';

  var video = document.getElementById('coverVideo');
  var button = document.getElementById('startBtn');
  var body = document.body;

  /* ---- reveal the type when the artwork is really moving ------------------ */

  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    body.classList.add('is-ready');
  }

  if (video) {
    if (!video.paused && video.currentTime > 0) reveal();
    video.addEventListener('playing', reveal, { once: true });
    // if the film is slow to start (cold cache, slow disk) don't leave the
    // page blank — the poster frame is artwork too
    video.addEventListener('loadeddata', function () {
      window.setTimeout(reveal, 1400);
    }, { once: true });
    video.addEventListener('error', reveal, { once: true });
  }
  window.setTimeout(reveal, 2600);   // absolute fallback

  /* ---- leave ------------------------------------------------------------- */

  if (!button) return null;

  button.addEventListener('click', function (event) {
    event.preventDefault();
    var transition = app.use('transition');
    if (transition) {
      transition.fadeTo('poem.html');
    } else {
      window.location.href = 'poem.html';
    }
  });

  return { reveal: reveal };
});
