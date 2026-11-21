/* module: stage
   The type must sit in the painting's own empty band, not at a fixed spot in
   the viewport — so the overlay is measured to the rectangle the artwork
   actually occupies under object-fit: cover.                                */

RePoem.module('stage', function (app) {
  'use strict';

  var video = document.getElementById('coverVideo');
  var stage = document.getElementById('stage');
  if (!video || !stage) return null;

  // must stay in sync with .cover__video { object-position } in cover.css
  var POS_X = 0.5;
  var POS_Y = 0.18;

  function measure() {
    var w = video.videoWidth;
    var h = video.videoHeight;
    if (!w || !h) return;

    var boxW = video.clientWidth;
    var boxH = video.clientHeight;
    if (!boxW || !boxH) return;

    var scale = Math.max(boxW / w, boxH / h);   // cover
    var artW = w * scale;
    var artH = h * scale;

    stage.style.width  = artW + 'px';
    stage.style.height = artH + 'px';
    stage.style.left   = ((boxW - artW) * POS_X) + 'px';
    stage.style.top    = ((boxH - artH) * POS_Y) + 'px';
  }

  var schedule = app.onFrame(measure);

  if (video.readyState >= 1) measure();
  video.addEventListener('loadedmetadata', measure);

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });

  if ('ResizeObserver' in window) {
    new ResizeObserver(schedule).observe(video);
  }

  // late metadata / decoded first frame can shift client sizes on some browsers
  video.addEventListener('loadeddata', schedule, { once: true });

  return { measure: measure };
});
