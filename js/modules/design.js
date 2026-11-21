/* re:poem — module 05: 新生命
   把诗放到一张纸上做成海报。

   版式照第八张参考图：一行字一条白纸条，纸条压在底图右上方、彼此错落一点，
   四周留大片呼吸，星点散在天空那一带。
   DOM 预览和 canvas 导出用同一份坐标（computeLayout），所以存下来的 PNG
   和屏幕上看到的一模一样。                                              */

RePoem.module('design', function () {
  'use strict';

  var BG = RePoem.use('bgs');

  var KEY_CHOSEN = 'repoem:chosen-poem';
  var KEY_WORKS = 'repoem:works';

  /* 海报不写死 4:3。宽度固定 900（排版基准），高度按当前底图自己的比例算，
     这样画不会被裁。换图时 applyBg() 里改 H。 */
  var W = 900;
  var H = 675;          // 占位值，boot 时立刻被底图的真实比例覆盖
  var PAD_X = 14;       // 纸条左右内边距
  var PAD_Y = 7;
  var GAP = 11;         // 条与条的间距

  var FONTS = [
    { id: 'typeset', label: '仿宋', css: '"FangSong", "STFangsong", "Songti SC", serif' },
    { id: 'song', label: '宋体', css: '"SimSun", "Songti SC", "Songti TC", serif' },
    { id: 'kai', label: '楷体', css: '"KaiTi", "STKaiti", "Kaiti SC", serif' },
    { id: 'xing', label: '行楷', css: '"STXingkai", "Xingkai SC", "KaiTi", serif' },
    { id: 'mono', label: '等宽', css: '"Courier New", Consolas, "SimSun", monospace' }
  ];

  var el = {};
  var state = {
    title: '',
    lines: [],
    bg: 1,
    font: 'typeset',
    size: 19,
    align: 'center',
    free: {},          // 自由排版：每行的 left/top（比例）
    works: []
  };

  var measure = document.createElement('canvas').getContext('2d');

  /* ------------------------------------------------------------- helpers */

  function fontCss() {
    var f = FONTS.filter(function (x) { return x.id === state.font; })[0] || FONTS[0];
    return f.css;
  }

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }

  function stripFont(px) {
    return px + 'px ' + fontCss();
  }

  /* --------------------------------------------------------- the layout */

  /* 一行字一条纸，宽度按实际字宽算——DOM 和 canvas 都用这份结果 */
  function computeLayout() {
    var strips = [];
    var size = state.size;
    var titleSize = Math.round(size * 1.45);
    var all = [];

    if (state.title) all.push({ text: state.title, size: titleSize, isTitle: true });
    state.lines.forEach(function (l) { all.push({ text: l, size: size, isTitle: false }); });

    // 先量宽高
    all.forEach(function (it) {
      measure.font = stripFont(it.size);
      var w = measure.measureText(it.text).width;
      it.w = Math.ceil(w + PAD_X * 2);
      it.h = Math.ceil(it.size * 1.62 + PAD_Y * 2);
    });

    var maxW = all.reduce(function (m, it) { return Math.max(m, it.w); }, 0);
    var totalH = all.reduce(function (s, it) { return s + it.h + GAP; }, -GAP);
    var blockX = W - 74 - maxW;      // 右侧留出约 8% 安全边，竖幅也不贴边
    var blockY = Math.round((H - totalH) * 0.42);
    if (blockY < 40) blockY = 40;

    // 参考图那种"阶梯错落"：每行轻微左右偏移
    var stagger = [0, -38, 16, -22, 44, -30, 8, -46, 26, -12, 36, -26];
    var jitter = [0, 4, -3, 6, -2, 5, -4, 3, -5, 2, -3, 4];

    var y = blockY;
    all.forEach(function (it, i) {
      var x;
      if (state.free[i] != null) {
        x = state.free[i].x * W;
        y = state.free[i].y * H;
      } else if (state.align === 'left') {
        x = blockX;
      } else if (state.align === 'center') {
        x = blockX + (maxW - it.w) / 2 + stagger[i % stagger.length];
      } else {
        x = blockX + (maxW - it.w) / 2 + stagger[i % stagger.length];
      }
      if (state.free[i] == null) y += jitter[i % jitter.length];
      x = Math.max(10, Math.min(W - it.w - 10, Math.round(x)));
      y = Math.max(6, Math.min(H - it.h - 6, Math.round(y)));
      strips.push({
        text: it.text, size: it.size, isTitle: it.isTitle,
        x: Math.round(x), y: Math.round(y), w: it.w, h: it.h,
        rot: ((i % 5) - 2) * 0.5
      });
      if (state.free[i] == null) y += it.h + GAP;
    });

    return strips;
  }

  /* -------------------------------------------------------------- render */

  function render() {
    el.frame.style.backgroundImage = 'url("' + BG[state.bg] + '")';
    el.lines.textContent = '';

    var strips = computeLayout();
    strips.forEach(function (s, i) {
      var p = document.createElement('p');
      p.className = 'strip' + (s.isTitle ? ' strip--title' : '');
      p.style.left = (s.x / W * 100) + '%';
      p.style.top = (s.y / H * 100) + '%';
      p.style.width = (s.w / W * 100) + '%';
      p.style.height = (s.h / H * 100) + '%';
      p.style.font = stripFont(s.size * (el.frame.clientWidth / W || 1));
      p.style.setProperty('--rot', s.rot + 'deg');
      p.dataset.idx = i;
      p.textContent = s.text;
      el.lines.appendChild(p);
    });

    // 改过版式就不再是"已收藏"的那一版了
    if (state.saved) {
      state.saved = false;
      if (el.fav) el.fav.textContent = '收进作品集';
    }

    el.frame.classList.toggle('is-free', state.align === 'free');
    // 只有自由摆放时，这句话才有意义
    if (el.hint) el.hint.style.visibility = state.align === 'free' ? 'visible' : 'hidden';

    renderControls();
  }

  function renderControls() {
    Array.prototype.forEach.call(el.bgs.children, function (b) {
      b.classList.toggle('is-on', Number(b.dataset.bg) === state.bg);
    });
    Array.prototype.forEach.call(el.fonts.children, function (b) {
      b.classList.toggle('is-on', b.dataset.font === state.font);
    });
    Array.prototype.forEach.call(el.aligns.children, function (b) {
      b.classList.toggle('is-on', b.dataset.align === state.align);
    });
    el.size.value = state.size;
    el.sizeOut.textContent = state.size + 'px';
  }

  /* -------------------------------------------------------------- 自由拖 */

  var drag = null;

  function bindDrag() {
    el.lines.addEventListener('pointerdown', function (e) {
      if (state.align !== 'free') return;
      var p = e.target.closest('.strip');
      if (!p) return;
      var box = el.frame.getBoundingClientRect();
      drag = {
        node: p,
        idx: Number(p.dataset.idx),
        box: box,
        dx: e.clientX - (box.left + parseFloat(p.style.left) / 100 * box.width),
        dy: e.clientY - (box.top + parseFloat(p.style.top) / 100 * box.height)
      };
      p.classList.add('is-dragging');
      if (p.setPointerCapture) p.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    el.lines.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var b = drag.box;
      var x = Math.max(0, Math.min(0.9, (e.clientX - b.left - drag.dx) / b.width));
      var y = Math.max(0, Math.min(0.93, (e.clientY - b.top - drag.dy) / b.height));
      state.free[drag.idx] = { x: x, y: y };
      drag.node.style.left = (x * 100) + '%';
      drag.node.style.top = (y * 100) + '%';
    });

    function end() {
      if (!drag) return;
      drag.node.classList.remove('is-dragging');
      drag = null;
      render();
    }
    el.lines.addEventListener('pointerup', end);
    el.lines.addEventListener('pointercancel', end);
  }

  /* ------------------------------------------------------------- 出图 */

  function paint(k) {
    var c = document.createElement('canvas');
    c.width = Math.round(W * k);
    c.height = Math.round(H * k);
    var g = c.getContext('2d');

    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        // 底图按 cover 铺满
        var s = Math.max(c.width / img.width, c.height / img.height);
        var dw = img.width * s, dh = img.height * s;
        g.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);

        var strips = computeLayout();

        strips.forEach(function (st) {
          g.save();
          g.translate((st.x + st.w / 2) * k, (st.y + st.h / 2) * k);
          g.rotate(st.rot * Math.PI / 180);

          var w = st.w * k, h = st.h * k;
          g.shadowColor = 'rgba(60, 40, 30, 0.18)';
          g.shadowBlur = 6 * k;
          g.shadowOffsetY = 2 * k;
          g.fillStyle = '#fdfaf3';
          g.fillRect(-w / 2, -h / 2, w, h);
          g.shadowColor = 'transparent';

          g.font = stripFont(st.size * k);
          g.fillStyle = '#1c1a18';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(st.text, 0, 0.5 * k);
          g.restore();
        });

        resolve(c);
      };
      img.onerror = function () { resolve(c); };
      img.src = BG[state.bg];
    });
  }

  function thumbOf(canvas) {
    var t = document.createElement('canvas');
    t.width = 300;
    t.height = Math.round(300 * H / W);
    t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.62);
  }

  /* ------------------------------------------------------------- 保存窗 */

  function openSave() {
    el.sheet.hidden = false;
    document.body.classList.add('is-saved');
    el.shareImg.removeAttribute('src');
    el.shareNote.textContent = '正在出图…';

    paint(1400 / W).then(function (canvas) {
      state.lastCanvas = canvas;
      state.lastThumb = thumbOf(canvas);
      if (el.share) el.share.hidden = !navigator.share;
      el.shareImg.src = canvas.toDataURL('image/png');
      el.shareNote.textContent = 'PNG · 1400 × ' + Math.round(1400 * H / W) + ' px';
      el.shareCard.classList.add('is-ready');
    });
  }

  function closeSave() {
    el.sheet.hidden = true;
    document.body.classList.remove('is-saved');
  }

  /* 下载：优先走 Blob URL —— 3MB 的 data: URL 塞进 <a download> 在部分
     Chrome 版本上会被静默丢掉（页面毫无反应）。toBlob 拿不到时退回 data URL。 */
  function download() {
    if (!state.lastCanvas) return;
    var name = (state.title || 're-poem') + '.png';
    var canvas = state.lastCanvas;

    function save(url, revoke) {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }

    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (blob) save(URL.createObjectURL(blob), true);
        else save(canvas.toDataURL('image/png'), false);
      }, 'image/png');
    } else {
      save(canvas.toDataURL('image/png'), false);
    }
  }

  /* 有些浏览器把 file:// 页面发起的下载挡掉，给一个看得见的后路 */
  function openImage() {
    if (!state.lastCanvas) return;
    state.lastCanvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var w = window.open(url, '_blank');
      if (!w) el.shareNote.textContent = '浏览器挡住了新窗口，请允许弹出窗口再试';
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }, 'image/png');
  }

  function copyText(e) {
    var txt = state.title + '\n\n' + state.lines.join('\n') + '\n\n— re:poem';
    var done = function () {
      e.target.textContent = '已复制 ✓';
      setTimeout(function () { e.target.textContent = '复制这首诗'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, done);
    } else {
      var ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(ta);
      done();
    }
  }

  /* 系统分享面板：手机上能用就直接把图片甩给微信/相册；
     桌面上 Chrome 不支持 file:// 分享，按钮就不出现。 */
  function shareIt() {
    if (!state.lastCanvas || !navigator.share) return;
    state.lastCanvas.toBlob(function (blob) {
      if (!blob) return;
      var file = new File([blob], (state.title || 're-poem') + '.png', { type: 'image/png' });
      var payload = { title: state.title, text: state.title + '\n\n' + state.lines.join('\n'), files: [file] };
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        delete payload.files;
      }
      navigator.share(payload).catch(function () {});
    }, 'image/png');
  }

  function saveWork(e) {
    if (!state.lastThumb) return;
    var list = read(KEY_WORKS, []) || [];
    list.unshift({
      id: 'w' + Date.now(),
      title: state.title,
      lines: state.lines.slice(),
      thumb: state.lastThumb,
      bg: state.bg,
      font: state.font,
      size: state.size,
      align: state.align,
      at: Date.now()
    });
    var trimmed = list.slice(0, 24);
    try { localStorage.setItem(KEY_WORKS, JSON.stringify(trimmed)); } catch (err) {}
    state.works = trimmed;
    state.saved = true;
    renderWorks();
    e.target.textContent = '已收进作品集 ✓';
  }

  function renderWorks() {
    el.works.textContent = '';
    if (!state.works.length) {
      var p = document.createElement('p');
      p.className = 'works__empty';
      p.textContent = '还没有收藏的作品。';
      el.works.appendChild(p);
      return;
    }
    state.works.forEach(function (w) {
      var fig = document.createElement('figure');
      fig.className = 'work';
      var img = document.createElement('img');
      img.src = w.thumb;
      img.alt = w.title;
      var cap = document.createElement('figcaption');
      cap.textContent = w.title;
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'work__del';
      del.textContent = '✕';
      del.setAttribute('aria-label', '删除这件作品');
      del.addEventListener('click', function () {
        var rest = state.works.filter(function (x) { return x.id !== w.id; });
        state.works = rest;
        try { localStorage.setItem(KEY_WORKS, JSON.stringify(rest)); } catch (err) {}
        renderWorks();
      });
      fig.appendChild(img);
      fig.appendChild(del);
      fig.appendChild(cap);
      el.works.appendChild(fig);
    });
  }

  function restart() {
    window.location.href = 'library.html';
  }

  /* -------------------------------------------------------------- wiring */

  function bind() {
    el.bgs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-bg]');
      if (!b) return;
      state.bg = Number(b.dataset.bg);
      applyBg();
    });

    el.fonts.addEventListener('click', function (e) {
      var b = e.target.closest('[data-font]');
      if (!b) return;
      state.font = b.dataset.font;
      render();
    });

    el.aligns.addEventListener('click', function (e) {
      var b = e.target.closest('[data-align]');
      if (!b) return;
      state.align = b.dataset.align;
      state.free = {};      // 换排法就重排，别让上一次拖的位置残留
      render();
    });

    el.size.addEventListener('input', function () {
      state.size = Number(el.size.value);
      render();
    });

    el.openSave.addEventListener('click', openSave);
    el.closeSave.addEventListener('click', closeSave);
    el.sheet.addEventListener('click', function (e) {
      if (e.target === el.sheet) closeSave();
    });
    el.dl.addEventListener('click', download);
    if (el.openImg) el.openImg.addEventListener('click', openImage);
    el.copy.addEventListener('click', copyText);
    if (el.share) el.share.addEventListener('click', shareIt);
    el.fav.addEventListener('click', saveWork);
    el.restart.addEventListener('click', restart);
  }

  /* 底图尺寸表（宽高比不写死，第一次用到时量出来） */
  var NAT = {};

  /* 换底图：海报高度 = 900 × 图高/图宽，画一格不裁。
     cover + 完全相同的宽高比 = 等价于整幅铺满，不会有裁切或留边。 */
  function applyBg() {
    var k = state.bg;
    var done = function () {
      render();
      fitFrame();
    };
    if (NAT[k]) { H = Math.round(W * NAT[k].h / NAT[k].w); done(); return; }
    var img = new Image();
    img.onload = function () {
      NAT[k] = { w: img.naturalWidth, h: img.naturalHeight };
      H = Math.round(W * img.naturalHeight / img.naturalWidth);
      done();
    };
    img.onerror = done;
    img.src = BG[k];
  }

  function fitFrame() {
    var host = el.stage.getBoundingClientRect();
    var avail = Math.max(240, host.width - 8);
    // 高度不能拍脑袋按 0.72 算：海报下面还有提示行和固定底栏，
    // 要用「视口高度 - 海报起点」真正剩下的地方，否则下半首会被挡住。
    var docTop = host.top + window.scrollY;
    var availH = Math.max(280, window.innerHeight - docTop - 96);
    el.frame.style.width = W + 'px';
    el.frame.style.height = H + 'px';
    var scale = Math.min(avail / W, availH / H);
    el.holder.style.width = (W * scale) + 'px';
    el.holder.style.height = (H * scale) + 'px';
    el.frame.style.transform = 'scale(' + scale + ')';
    el.frame.style.left = '0px';
    el.frame.style.top = '0px';
    el.frame.style.transformOrigin = 'left top';
    // 注意：.frame 整体由 transform 缩放，里面所有字号保持 900px 版面的原值，
    // 不能再乘一次 scale，否则字会被二次放大。
  }

  /* ---------------------------------------------------------------- boot */

  el.stage = document.getElementById('stage');
  el.hint = document.getElementById('stageHint');
  el.holder = document.getElementById('holder');
  el.frame = document.getElementById('frame');
  el.lines = document.getElementById('lines');
  el.bgs = document.getElementById('bgList');
  el.fonts = document.getElementById('fontList');
  el.aligns = document.getElementById('alignList');
  el.size = document.getElementById('sizeRange');
  el.sizeOut = document.getElementById('sizeOut');
  el.openSave = document.getElementById('openSave');
  el.sheet = document.getElementById('saveSheet');
  el.closeSave = document.getElementById('closeSave');
  el.shareImg = document.getElementById('shareImg');
  el.shareNote = document.getElementById('shareNote');
  el.shareCard = document.getElementById('shareCard');
  el.dl = document.getElementById('dlBtn');
  el.copy = document.getElementById('copyBtn');
  el.share = document.getElementById('shareBtn');
  el.fav = document.getElementById('favBtn');
  el.works = document.getElementById('worksList');
  el.openImg = document.getElementById('openImgBtn');
  el.restart = document.getElementById('restartBtn');
  el.empty = document.getElementById('designEmpty');
  el.main = document.getElementById('designMain');

  var data = read(KEY_CHOSEN, null);
  if (!data || !data.lines || !data.lines.length) {
    el.main.hidden = true;
    el.empty.hidden = false;

    // 直接点开 design.html 的人是没带诗来的。给一首示例，先看清这个模块能做什么；
    // 这几句是本站自己的句型库生成的，不是余秀华的原作。
    var demo = document.getElementById('demoBtn');
    if (demo) {
      demo.addEventListener('click', function () {
        var payload = {
          title: '一个人的田埂',
          lines: ['雪落在拐杖上，', '孤独长出了根', '我在田埂上摇晃',
                  '月光把我抱膝的影子', '推回屋里', '疼，也是一种回声'],
          mode: 'demo', words: [], at: Date.now()
        };
        try { localStorage.setItem(KEY_CHOSEN, JSON.stringify(payload)); } catch (e) {}
        window.location.reload();
      });
    }
    return { paint: paint };
  }

  state.title = data.title || '';
  state.lines = data.lines.slice();
  state.works = read(KEY_WORKS, []) || [];

  // 底图缩略图
  Object.keys(BG).forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bgpick';
    b.dataset.bg = k;
    b.style.backgroundImage = 'url("' + BG[k] + '")';
    b.setAttribute('aria-label', '底图 ' + k);
    el.bgs.appendChild(b);
  });

  FONTS.forEach(function (f) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'fontpick';
    b.dataset.font = f.id;
    b.style.fontFamily = f.css;
    b.textContent = f.label;
    el.fonts.appendChild(b);
  });

  bind();
  bindDrag();
  renderWorks();
  render();                 // 先用占位高度画一遍，避免闪白
  applyBg();                // 量出底图真实比例 → 定 H → 重新排版
  el.frame.style.visibility = 'visible';

  var t = null;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () { fitFrame(); render(); }, 160);
  });

  return {
    paint: paint,
    get: function () { return { title: state.title, lines: state.lines.slice() }; }
  };
});
