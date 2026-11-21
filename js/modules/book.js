/* module: book
   Turns the pages of module 02.

   Reading order: cover → 照片 | 介绍 → 标题（跨页）→ 诗 → next.
   Two layouts from the same markup: a spread on desktop, one page at a time on
   a phone (a two-column spread on a 390px screen would be ~180px of Chinese
   per page, which is not a book, it's a wall).                              */

RePoem.module('book', function (app) {
  'use strict';

  var book = document.getElementById('book');
  var host = document.getElementById('pages');
  var source = document.getElementById('bookData');
  var live = document.getElementById('live');
  var nextBtn = document.getElementById('nextBtn');
  if (!book || !host || !source) return null;

  var pages = Array.prototype.slice.call(source.querySelectorAll('.page'));
  var narrow = window.matchMedia('(max-width: 899px)');

  var mode = null;      // 'spread' | 'single'
  var leaves = [];      // spread mode: [{ el, front, back }]
  var sheets = [];      // single mode: [{ el }]
  var cursor = 0;       // spread: leaves turned · single: page index
  var busy = false;
  var leaving = false;

  /* ------------------------------------------------------------- build ---- */

  function buildSpread() {
    leaves = [];
    host.innerHTML = '';

    for (var i = 0; i < pages.length; i += 2) {
      var leaf = document.createElement('article');
      leaf.className = 'leaf';

      var front = document.createElement('div');
      front.className = 'face face--front';
      front.appendChild(pages[i]);

      var back = document.createElement('div');
      back.className = 'face face--back';
      if (pages[i + 1]) back.appendChild(pages[i + 1]);

      leaf.appendChild(front);
      leaf.appendChild(back);
      host.appendChild(leaf);
      leaves.push({ el: leaf });
    }
  }

  function buildSingle() {
    sheets = [];
    host.innerHTML = '';

    var pager = document.createElement('div');
    pager.className = 'pager';

    pages.forEach(function (page, i) {
      var sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.appendChild(page);
      pager.appendChild(sheet);
      sheets.push({ el: sheet });
    });

    host.appendChild(pager);
  }

  function build() {
    var want = narrow.matches ? 'single' : 'spread';
    if (want === mode) return false;
    mode = want;
    cursor = 0;
    busy = false;
    book.classList.toggle('is-single', mode === 'single');
    if (mode === 'spread') buildSpread(); else buildSingle();
    return true;
  }

  /* ------------------------------------------------------------- paint ---- */

  function paintSpread(animate) {
    leaves.forEach(function (leaf, i) {
      var turned = i < cursor;
      leaf.el.classList.toggle('is-turned', turned);
      leaf.el.classList.remove('is-lifting');
      // turned leaves stack behind, so the next one to lift is always on top
      leaf.el.style.zIndex = turned ? i + 1 : leaves.length - i + 10;
      if (!animate) leaf.el.style.transition = 'none';
    });
    // eslint-disable-next-line no-unused-expressions
    host.offsetHeight;
    leaves.forEach(function (leaf) { leaf.el.style.transition = ''; });

    // only the outer pages take clicks: right half = next, left half = previous
    leaves.forEach(function (leaf, i) {
      leaf.el.style.pointerEvents = (i === cursor || i === cursor - 1) ? 'auto' : 'none';
    });

    book.classList.toggle('is-closed', cursor === 0);
    book.classList.toggle('is-finished', cursor >= leaves.length);
  }

  function paintSingle(animate) {
    sheets.forEach(function (sheet, i) {
      var on = i === cursor;
      sheet.el.classList.toggle('is-shown', on);
      if (!animate) sheet.el.classList.remove('is-out');
      sheet.el.style.zIndex = on ? 2 : 1;
    });
  }

  function paint(animate) {
    if (mode === 'spread') paintSpread(animate); else paintSingle(animate);
  }

  /* ------------------------------------------------------------ moving ---- */

  function announce(text) {
    if (live) live.textContent = text;
  }

  function forward() {
    if (busy) return;
    if (mode === 'spread') {
      if (cursor >= leaves.length) return;
      var leaf = leaves[cursor];
      busy = true;
      leaf.el.classList.add('is-lifting');
      cursor += 1;
      paint(true);
      announce('第 ' + (cursor * 2 + 1) + ' 页');
      window.setTimeout(function () { leaf.el.classList.remove('is-lifting'); busy = false; }, 1000);
    } else {
      if (cursor >= sheets.length - 1) return;
      var out = sheets[cursor].el;
      busy = true;
      out.classList.add('is-out');
      cursor += 1;
      window.setTimeout(function () {
        out.classList.remove('is-out', 'is-shown');
        paint(false);
        busy = false;
      }, 620);
      announce('第 ' + (cursor + 1) + ' 页');
    }
  }

  function backward() {
    if (busy) return;
    if (mode === 'spread') {
      if (cursor <= 0) return;
      var leaf = leaves[cursor - 1];
      busy = true;
      cursor -= 1;
      paint(true);
      announce('第 ' + (cursor * 2 + 1) + ' 页');
      window.setTimeout(function () { busy = false; }, 1000);
      return;
    }
    if (cursor <= 0) return;
    var out = sheets[cursor].el;
    busy = true;
    out.classList.remove('is-shown');
    cursor -= 1;
    var back = sheets[cursor].el;
    back.classList.add('is-shown', 'is-out');
    window.setTimeout(function () {
      back.classList.remove('is-out');
      paint(false);
      busy = false;
    }, 620);
    announce('第 ' + (cursor + 1) + ' 页');
  }

  /* ------------------------------------------------------------- input ---- */

  book.addEventListener('click', function (event) {
    // the big button and its arrow own themselves
    if (event.target.closest('.next') || event.target.closest('.next__arrow')) return;
    var rect = book.getBoundingClientRect();
    var x = event.clientX - rect.left;
    if (mode === 'spread') {
      if (x > rect.width / 2) forward(); else backward();
    } else {
      if (x > rect.width * 0.32) forward(); else backward();
    }
  });

  document.addEventListener('keydown', function (event) {
    var key = event.key;
    if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
      event.preventDefault(); forward();
    } else if (key === 'ArrowLeft' || key === 'PageUp') {
      event.preventDefault(); backward();
    } else if (key === 'Home') {
      event.preventDefault();
      cursor = 0; paint(true);
    } else if (key === 'End') {
      event.preventDefault();
      cursor = mode === 'spread' ? leaves.length : sheets.length - 1; paint(true);
    }
  });

  /* drag or swipe: the leaf follows the hand, then completes or falls back */
  var drag = null;

  book.addEventListener('pointerdown', function (event) {
    if (busy || event.button > 0) return;
    if (event.target.closest('.next') || event.target.closest('.next__arrow')) return;
    var rect = book.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var dir = mode === 'spread'
      ? (x > rect.width / 2 ? 1 : -1)
      : (x > rect.width * 0.32 ? 1 : -1);
    var leaf = mode === 'spread'
      ? (dir > 0 ? leaves[cursor] : leaves[cursor - 1])
      : null;
    drag = { startX: event.clientX, dir: dir, leaf: leaf, width: rect.width / 2, moved: 0 };
    if (leaf) {
      leaf.el.classList.add('is-dragging');
      book.setPointerCapture && book.setPointerCapture(event.pointerId);
    }
  });

  book.addEventListener('pointermove', function (event) {
    if (!drag || !drag.leaf) return;
    var dx = event.clientX - drag.startX;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    var p = Math.min(1, Math.max(0, (drag.dir > 0 ? -dx : dx) / drag.width));
    var angle = -180 * p * drag.dir;
    drag.leaf.el.style.transform = 'rotateY(' + angle + 'deg)';
    drag.p = p;
  });

  function endDrag() {
    if (!drag) return;
    var leaf = drag.leaf;
    if (leaf) {
      leaf.el.classList.remove('is-dragging');
      leaf.el.style.transform = '';
      if (drag.p > 0.35) {
        if (drag.dir > 0) { drag = null; forward(); return; }
        drag = null; backward(); return;
      }
    }
    var moved = drag.moved;
    drag = null;
    if (moved < 8) return;                    // a tap, handled by click
  }

  book.addEventListener('pointerup', endDrag);
  book.addEventListener('pointercancel', endDrag);
  book.addEventListener('pointerleave', function (event) {
    if (drag && drag.leaf) endDrag();
  });

  /* the big NEXT: hand the poem's基调 to module 03, then leave the book.
     The arrow is a separate element in the markup — it is the thing people
     actually aim at, so it has to fire the same action. */
  function leaveBook(event) {
    if (event) event.stopPropagation();
    if (leaving) return;
    leaving = true;

    // 《唯独我，不是》的基调：孤绝、疼、渴望。模块 03 用它做推荐。
    try {
      sessionStorage.setItem('repoem:mood', JSON.stringify({
        poem: '唯独我，不是',
        tags: ['孤绝', '疼', '渴望'],
        from: 'poem.html'
      }));
    } catch (e) {}

    document.body.classList.add('is-leaving');
    setTimeout(function () {
      window.location.href = 'library.html';
    }, 420);
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', leaveBook);
  }

  /* The arrow is a plain <p> next to the button, and the book rebuilds its
     leaves on every layout pass, so a listener bound to the node can go
     missing. Listen in the capture phase on the document instead: nothing the
     book does can swallow it, and it fires before the page-turn handler. */
  document.addEventListener('click', function (event) {
    var t = event.target;
    if (!t || !t.closest) return;
    if (t.closest('.next__arrow') || t.closest('.page--next .next')) {
      leaveBook(event);
    }
  }, true);

  Array.prototype.forEach.call(
    document.querySelectorAll('.next__arrow, .page--next .next'),
    function (el) { el.style.cursor = 'pointer'; }
  );

  /* -------------------------------------------------------------- boot ---- */

  if (build()) paint(false);

  var relayout = app.onFrame(function () {
    if (build()) paint(false);
  });
  if (narrow.addEventListener) narrow.addEventListener('change', relayout);
  else if (narrow.addListener) narrow.addListener(relayout);
  window.addEventListener('resize', relayout, { passive: true });

  document.body.classList.add('is-book-ready');

  return { forward: forward, backward: backward, mode: function () { return mode; } };
});
