/* re:poem — module 04: 让碎片成为诗
   三种做法，一套引擎：
     free       按用户原来的顺序排，句式只做"位次"连接
     recombine  按词性重新组合，句子有主语有谓语
     random     洗牌后随机套句型，每次都不一样

   生成物是原创示例，不是余秀华的诗 —— 页面上写清楚了。                    */

RePoem.module('make', function () {
  'use strict';

  var T = RePoem.use('templates');
  var lex = RePoem.use('lexicon');

  var KEY_HANDOFF = 'repoem:handoff';
  var KEY_POEMS = 'repoem:poems';
  var KEY_CHOSEN = 'repoem:chosen-poem';

  var MODES = [
    { id: 'free', label: '自由拼贴', hint: '按你排的顺序' },
    { id: 'recombine', label: '诗意重组', hint: '按词的类别重排' },
    { id: 'random', label: '随机生成', hint: '每次都不一样' }
  ];

  var el = {};
  var state = {
    words: [],
    pool: null,
    mode: 'recombine',
    title: '',
    lines: [],
    seed: 0,
    saved: [],
    editing: false,
    dirty: false,
    customTitle: false      // 标题被她亲手改过，就不再用自动生成的
  };

  /* ------------------------------------------------------------- random */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pick(arr, rnd) {
    return arr[Math.floor(rnd() * arr.length)];
  }

  /* -------------------------------------------------------------- pool */

  var byWord = {};

  function indexLexicon() {
    if (!lex) return;
    var data = lex.data;
    Object.keys(data).forEach(function (cat) {
      data[cat].words.forEach(function (pair) {
        if (!byWord[pair[0]]) byWord[pair[0]] = cat;
      });
    });
  }

  function kindOf(word) {
    if (T.PLACES[word]) return 'p';
    if (T.TIMES[word]) return 't';
    var cat = byWord[word];
    if (cat === 'emotion') return 'e';
    if (cat === 'action') return 'a';
    return 'n';                       // nature / life / 自定义 都当名词
  }

  function buildPool(words) {
    var pool = { n: [], p: [], t: [], e: [], a: [], all: [] };
    words.forEach(function (w) {
      var k = kindOf(w);
      if (pool[k].indexOf(w) === -1) pool[k].push(w);
      pool.all.push({ w: w, k: k });
    });
    return pool;
  }

  /* {p} 和 {t} 缺词时退回名词，句子仍然通顺，只是不那么贴题 */
  function bucket(kind) {
    if (kind === 'p' || kind === 't') {
      return state.pool[kind].length ? state.pool[kind] : state.pool.n;
    }
    return state.pool[kind];
  }

  /* -------------------------------------------------------------- fill */

  /* 一行之内不复用同一个词。{t}/{p} 缺词时会退回名词池，如果只按"槽位类别"
     去重就会漏掉这种情况（出现过"月光之后，孤独长成了月光"），所以这里按
     实际的词去重。 */
  function fillTemplate(tpl, rnd, used, lineUsed, forceWord) {
    var out = tpl;
    var inLine = lineUsed || [];
    var fail = false;
    var forced = false;

    out = out.replace(/\{(n2?|p|t|e|a)\}/g, function (_, kind, offset) {
      if (fail) return '';
      var base = kind === 'n2' ? 'n' : kind;
      var words = bucket(base);
      if (!words || !words.length) { fail = true; return ''; }

      // "我在{a}" "都在{a}" "我就{a}" —— 动词没有宾语位置，只能放不及物的
      if (base === 'a') {
        var before = tpl.slice(Math.max(0, offset - 3), offset);
        if (/(我在|都在|一直在|我就|边上)$/.test(before)) {
          var intr = words.filter(function (w) { return T.INTRANS[w]; });
          if (intr.length) words = intr;
        }
      }

      var options = words.filter(function (w) {
        return inLine.indexOf(w) === -1 && used.indexOf(w) === -1;
      });
      if (!options.length) {
        options = words.filter(function (w) { return inLine.indexOf(w) === -1; });
      }
      if (!options.length) { fail = true; return ''; }

      var w;
      if (forceWord && !forced && options.indexOf(forceWord) !== -1) {
        w = forceWord; forced = true;
      } else {
        w = pick(options, rnd);
      }
      inLine.push(w);
      used.push(w);
      return w;
    });

    return fail ? null : out;
  }

  function recentUsed() {
    return state.lines.slice(-2).join('').split('').length ? [] : [];
  }

  /* 选句型：最近三条用过的不再选，优先挑还没用过的 */
  function pickFrame(rnd, usedKinds, recent) {
    var eligible = T.FRAMES.filter(function (f) {
      return recent.indexOf(f.s) === -1 && frameUsable(f.s, {});
    });
    if (!eligible.length) {
      eligible = T.FRAMES.filter(function (f) {
        return frameKinds(f.s).every(function (k) { return bucket(k) && bucket(k).length; });
      });
    }
    if (!eligible.length) eligible = T.FRAMES;
    return pick(eligible, rnd).s;
  }

  /* -------------------------------------------------------- the三种做法 */

  /* 自由拼贴：严格按 words 顺序，用位次句型（{w0}{w1}{w2}） */
  function buildFree(words, rnd) {
    var lines = [];
    var i = 0;
    var recent = [];

    while (i < words.length) {
      var left = words.length - i;
      var arity = left >= 3 && rnd() < 0.16 ? 3 : (left >= 2 && rnd() < 0.55 ? 2 : 1);
      if (arity > left) arity = left;

      var pool = T.ORDINAL.filter(function (f) {
        var need = (f.s.match(/\{w\d\}/g) || []).length;
        return need === arity && recent.indexOf(f.s) === -1;
      });
      if (!pool.length) {
        pool = T.ORDINAL.filter(function (f) {
          return (f.s.match(/\{w\d\}/g) || []).length === arity;
        });
      }

      var tpl = pick(pool, rnd).s;
      var line = tpl.replace(/\{w(\d)\}/g, function (_, d) {
        return words[i + Number(d)] || '';
      });
      lines.push(line);
      recent.push(tpl);
      if (recent.length > 3) recent.shift();
      i += arity;
    }

    return lines;
  }

  function frameKinds(tpl) {
    return (tpl.match(/\{(n2?|p|t|e|a)\}/g) || []).map(function (m) {
      return m.slice(1, -1).replace('2', '');
    });
  }

  /* 池子里一个不及物动词都没有时，"我在{a}"这类句子必然读不顺
     （我在撕碎 / 我在挑水），直接把这类句型排除掉，换别的说。 */
  function hasIntrans() {
    return state.pool.a.some(function (w) { return T.INTRANS[w]; });
  }

  function frameUsable(tpl, usage, cap) {
    if ((usage[tpl] || 0) >= (cap || 1)) return false;
    if (!hasIntrans() && /(我在|都在|一直在|我就|边上)\{a\}/.test(tpl)) return false;
    return frameKinds(tpl).every(function (k) { return bucket(k) && bucket(k).length; });
  }

  /* 诗意重组：按类别出句，情绪与物象交替 */
  function buildRecombine(words, rnd) {
    var target = Math.max(8, Math.min(14, Math.round(words.length * 1.4)));
    var lines = [];
    var recent = [];
    var used = [];
    var usage = {};
    var kindsOrder = ['n', 'e', 'n', 'a', 'n', 'e', 'a', 'n'];
    var guard = 0;

    while (lines.length < target && guard < target * 14) {
      guard++;
      var want = kindsOrder[lines.length % kindsOrder.length];
      var tpl = null;

      // 先挑能塞进想要的词性的句型
      var candidates = T.FRAMES.filter(function (f) {
        if (recent.indexOf(f.s) !== -1) return false;
        if (f.s.indexOf('{' + want + '}') === -1) return false;
        return frameUsable(f.s, usage);
      });
      if (candidates.length) tpl = pick(candidates, rnd).s;
      else {
        var fallback = T.FRAMES.filter(function (f) {
          return recent.indexOf(f.s) === -1 && frameUsable(f.s, usage);
        });
        tpl = fallback.length ? pick(fallback, rnd).s : null;
      }
      if (!tpl) break;

      var line = fillTemplate(tpl, rnd, used);
      if (!line) { recent.push(tpl); continue; }
      lines.push(line);
      usage[tpl] = (usage[tpl] || 0) + 1;
      recent.push(tpl);
      if (recent.length > 6) recent.shift();
      if (used.length > 8) used.shift();
    }

    // 兜底：没被用到的词，找一个能装它的句型塞进去；实在没有就单独成行
    var missing = words.filter(function (w) {
      return !lines.some(function (l) { return l.indexOf(w) !== -1; });
    });
    missing.forEach(function (w) {
      var k = kindOf(w);
      var host = T.FRAMES.filter(function (f) {
        return frameUsable(f.s, usage) && frameKinds(f.s).indexOf(k) !== -1;
      })[0];
      var made = host ? fillTemplate(host.s, rnd, used, [], w) : null;
      if (made) {
        usage[host.s] = (usage[host.s] || 0) + 1;
        lines.splice(Math.min(lines.length, 2 + Math.floor(rnd() * lines.length)), 0, made);
      } else {
        lines.push(w);
      }
    });

    return lines;
  }

  /* 随机生成：洗牌 → 随机句型 → 随机分行 */
  function buildRandom(words, rnd) {
    var bag = shuffle(words, rnd);
    var idx = 0;
    var lines = [];
    var recent = [];
    var used = [];

    while (idx < bag.length || lines.length < 6) {
      var tpl = pickFrame(rnd, null, recent);
      var slots = (tpl.match(/\{(n2?|p|t|e|a)\}/g) || []).length;

      // 句型需要几个词，从洗好的包里切片；包空了就只补虚词式短句
      if (idx >= bag.length) {
        if (lines.length >= 6) break;
        tpl = pick(['{e}，还是{e}', '{n}，还是{n2}'], rnd);
        slots = 2;
        if (!state.pool.n.length) break;
      }

      var line = fillTemplate(tpl, rnd, used);
      if (!line) { recent.push(tpl); continue; }
      lines.push(line);
      recent.push(tpl);
      if (recent.length > 6) recent.shift();
      idx += Math.max(1, Math.floor(slots / 2));
    }

    return lines;
  }

  /* ------------------------------------------------------- 自由拼贴：拖字 */

  var KEY_LAYOUT = 'repoem:layout';
  var KEY_TITLE = 'repoem:title';

  /* 行距按词数算，让字片铺满整块布，而不是全挤在顶上 */
  function rowStep() {
    var rows = Math.max(1, Math.ceil(state.words.length / 3));
    return rows > 1 ? Math.min(0.33, 0.66 / (rows - 1)) : 0.12;
  }

  function rowY(k) {
    return Math.round((0.06 + k * rowStep()) * 1000) / 1000;
  }

  function defaultLayout() {
    var lay = {};
    var perRow = 3;
    state.words.forEach(function (w, i) {
      lay[w] = {
        x: Math.min(0.84, 0.05 + (i % perRow) * 0.29 + ((i * 13) % 7) * 0.005),
        y: Math.round((rowY(Math.floor(i / perRow)) + ((i * 29) % 5) * 0.004) * 1000) / 1000,
        r: (((i * 37) % 9) - 4) * 0.45
      };
    });
    return lay;
  }

  function paintSlip(node, p) {
    node.style.setProperty('--x', p.x);
    node.style.setProperty('--y', p.y);
    node.style.setProperty('--r', p.r + 'deg');
  }

  function buildClipboard() {
    if (!el.clipField) return;
    el.clipField.textContent = '';
    state.words.forEach(function (w) {
      var s = document.createElement('span');
      s.className = 'slip';
      s.dataset.word = w;
      s.tabIndex = 0;
      s.setAttribute('role', 'button');
      s.setAttribute('aria-label', w + '，可以拖动，或用方向键移动');
      s.textContent = w;
      paintSlip(s, state.layout[w]);
      el.clipField.appendChild(s);
    });
  }

  /* 同一行的字按从左到右连成一行诗；行与行之间按上下顺序 */
  function linesFromLayout() {
    var items = state.words.map(function (w) {
      return { w: w, x: state.layout[w].x, y: state.layout[w].y };
    });
    items.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });

    var rows = [];
    var cur = null;
    items.forEach(function (it) {
      if (!cur || Math.abs(it.y - cur.y) > 0.075) {
        cur = { y: it.y, items: [it] };
        rows.push(cur);
      } else {
        cur.items.push(it);
      }
    });

    return rows.map(function (row) {
      return row.items
        .sort(function (a, b) { return a.x - b.x; })
        .map(function (i) { return i.w; })
        .join('　');
    });
  }

  function saveLayout() {
    try { localStorage.setItem(KEY_LAYOUT, JSON.stringify(state.layout)); } catch (e) {}
  }

  function resetLayout() {
    state.layout = defaultLayout();
    Array.prototype.forEach.call(el.clipField.children, function (node) {
      if (node.classList && node.classList.contains('slip')) {
        paintSlip(node, state.layout[node.dataset.word]);
      }
    });
    saveLayout();
    afterMove();
  }

  function afterMove() {
    state.lines = linesFromLayout();
    state.seed = state.seed || 1;
    el.note.textContent = '由你选的 ' + state.words.length + ' 个词拼成 · 原创示例，非余秀华原作';

    if (el.clipRead) {
      el.clipRead.textContent = '';
      if (!state.lines.length) return;
      var lead = document.createElement('span');
      lead.textContent = '现在是这样 ' + state.lines.length + ' 行：';
      el.clipRead.appendChild(lead);
      state.lines.forEach(function (l) {
        var b = document.createElement('b');
        b.textContent = l;
        el.clipRead.appendChild(b);
      });
    }
  }

  var drag = null;

  function bindClipboard() {
    if (!el.clipField) return;

    el.clipField.addEventListener('pointerdown', function (e) {
      var s = e.target.closest ? e.target.closest('.slip') : null;
      if (!s) return;
      var box = el.clipField.getBoundingClientRect();
      var r = s.getBoundingClientRect();
      drag = {
        node: s,
        word: s.dataset.word,
        box: box,
        dx: e.clientX - r.left,
        dy: e.clientY - r.top,
        w: r.width / box.width,
        h: r.height / box.height
      };
      s.classList.add('is-dragging');
      if (s.setPointerCapture) s.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    el.clipField.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var pad = 4;
      var x = (e.clientX - drag.box.left - drag.dx) / drag.box.width;
      var y = (e.clientY - drag.box.top - drag.dy) / drag.box.height;
      x = Math.max(0, Math.min(1 - drag.w - pad / drag.box.width, x));
      y = Math.max(0, Math.min(1 - drag.h - pad / drag.box.height, y));

      var p = state.layout[drag.word];
      p.x = Math.round(x * 1000) / 1000;
      p.y = Math.round(y * 1000) / 1000;
      paintSlip(drag.node, p);
    });

    function snapToRow(word) {
      var p = state.layout[word];
      var k = Math.round((p.y - 0.06) / rowStep());
      var line = rowY(k);
      if (Math.abs(p.y - line) < 0.06) p.y = line;
    }

    function slipNode(word) {
      return el.clipField.querySelector('.slip[data-word="' + word + '"]');
    }

    /* 两张字片叠在一起，下面那张就"消失"了——落手时把重叠推开 */
    function overlapsAny(node, word) {
      var r = node.getBoundingClientRect();
      return state.words.some(function (o) {
        if (o === word) return false;
        var n = slipNode(o);
        if (!n) return false;
        var q = n.getBoundingClientRect();
        var ox = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        var oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (ox <= 0 || oy <= 0) return false;
        return ox * oy > 0.35 * Math.min(r.width * r.height, q.width * q.height);
      });
    }

    function resolveOverlap(node, word) {
      var box = el.clipField.getBoundingClientRect();
      var step = (node.getBoundingClientRect().width + 10) / box.width;
      var p = state.layout[word];
      var guard = 0;
      while (overlapsAny(node, word) && guard++ < 16) {
        p.x = Math.round((p.x + step) * 1000) / 1000;
        if (p.x > 0.9) {
          p.x = 0.03;
          p.y = Math.round(Math.min(0.86, p.y + 0.075) * 1000) / 1000;
        }
        paintSlip(node, p);
      }
    }

    function endDrag() {
      if (!drag) return;
      var node = drag.node;
      var word = drag.word;
      node.classList.remove('is-dragging');
      snapToRow(word);
      paintSlip(node, state.layout[word]);
      resolveOverlap(node, word);
      drag = null;
      saveLayout();
      afterMove();
    }

    el.clipField.addEventListener('pointerup', endDrag);
    el.clipField.addEventListener('pointercancel', endDrag);

    // 键盘也能挪（每次 2%）
    el.clipField.addEventListener('keydown', function (e) {
      var s = e.target.closest ? e.target.closest('.slip') : null;
      if (!s) return;
      var p = state.layout[s.dataset.word];
      var step = e.shiftKey ? 0.06 : 0.02;
      var moved = true;
      if (e.key === 'ArrowLeft') p.x = Math.max(0, p.x - step);
      else if (e.key === 'ArrowRight') p.x = Math.min(0.86, p.x + step);
      else if (e.key === 'ArrowUp') p.y = Math.max(0, p.y - step);
      else if (e.key === 'ArrowDown') p.y = Math.min(0.92, p.y + step);
      else moved = false;
      if (!moved) return;
      e.preventDefault();
      paintSlip(s, p);
      saveLayout();
      afterMove();
    });
  }

  /* ------------------------------------------------------------ stanzas */

  function toStanzas(lines, rnd) {
    var out = [];
    var cur = [];
    var i = 0;
    while (i < lines.length) {
      var take = rnd() < 0.28 ? 1 : (rnd() < 0.72 ? 2 : 3);
      cur = lines.slice(i, i + take);
      i += take;
      if (cur.length) out.push(cur);
    }
    return out;
  }

  /* -------------------------------------------------------------- title */

  function buildTitle(rnd) {
    var tries = 0;
    while (tries++ < 30) {
      var tpl = pick(T.TITLES, rnd);
      var used = [];
      var t = fillTemplate(tpl, rnd, used);
      if (!t) continue;
      if (t.length > 16) continue;
      return t;
    }
    return state.pool.n.length ? state.pool.n[0] : '无题';
  }

  /* -------------------------------------------------------------- build */

  function generate(mode, seed) {
    state.seed = seed == null ? Math.floor(Math.random() * 1e9) : seed;
    var rnd = mulberry32(state.seed);
    var words = state.words;
    var lines;

    if (mode === 'free') lines = buildFree(words, rnd);
    else if (mode === 'random') lines = buildRandom(words, rnd);
    else lines = buildRecombine(words, rnd);

    if (!lines.length) lines = words.slice();

    var wasFree = state.mode === 'free';
    state.mode = mode;
    if (mode === 'free' && !wasFree) revealClothBottom();

    if (mode === 'free') {
      // 自由拼贴不"生成"，诗就是你摆出来的样子
      state.layout = state.layout || defaultLayout();
      state.lines = linesFromLayout();
    } else {
      state.lines = lines;
    }

    if (!(state.customTitle && state.title)) {
      state.title = buildTitle(rnd);
    }
    state.dirty = false;
    renderPoem();
    renderRail();
    if (mode === 'free') afterMove();
  }

  /* -------------------------------------------------------------- render */

  function renderPoem() {
    el.title.textContent = state.title;
    el.body.textContent = '';

    var stanzas = toStanzas(state.lines, mulberry32(state.seed + 7));
    var n = 0;
    stanzas.forEach(function (st) {
      var p = document.createElement('p');
      p.className = 'stanza';
      st.forEach(function (line) {
        var span = document.createElement('span');
        span.className = 'line';
        span.style.setProperty('--i', n++);
        span.textContent = line;
        p.appendChild(span);
      });
      el.body.appendChild(p);
    });

    el.note.textContent = '由你选的 ' + state.words.length + ' 个词生成 · 原创示例，非余秀华原作';
    state.lineCount = n;
    syncStitch();
    sewAgain();
  }

  /* 自由拼贴的布比一屏高，底部会压在固定底栏后面，看着像绣线没包到底。
     进模式后把它滚进来，别让人以为框断了。 */
  function revealClothBottom() {
    requestAnimationFrame(function () {
      var c = el.cloth.getBoundingClientRect();
      var bar = document.querySelector('.make-bar');
      var barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      var need = Math.round(c.bottom - barTop + 20);
      if (need > 4) {
        try { window.scrollBy({ top: need, behavior: 'smooth' }); }
        catch (e) { window.scrollBy(0, need); }
      }
    });
  }

  /* 尺寸变了就重算：统一走这个防抖入口，避免布局还没稳定时量到旧值 */
  function scheduleSync() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncStitch, 60);
  }

  /* 布边那条绣线是 SVG，尺寸得跟布对齐；窗口变了也要重算 */
  function syncStitch() {
    var box = el.cloth.getBoundingClientRect();
    if (!box.width) return;
    var pad = 18;
    var w = Math.round(box.width - pad * 2);
    var h = Math.round(box.height - pad * 2);

    [el.stitchRect, el.stitchMask].forEach(function (r) {
      r.setAttribute('x', pad);
      r.setAttribute('y', pad);
      r.setAttribute('width', w);
      r.setAttribute('height', h);
    });

    el.cloth.style.setProperty('--sew-path',
      'path("M ' + pad + ' ' + pad + ' H ' + (pad + w) + ' V ' + (pad + h) +
      ' H ' + pad + ' Z")');
  }

  /* 拆掉再挂上，动画才会重播；绣线的遮罩是 SMIL 驱动，要单独开始 */
  function sewAgain() {
    el.cloth.classList.remove('is-sewing');
    void el.cloth.offsetWidth;
    el.cloth.classList.add('is-sewing');

    if (RePoem.reducedMotion && RePoem.reducedMotion()) {
      el.stitchMask.setAttribute('stroke-dashoffset', 0);
      return;
    }

    el.stitchMask.setAttribute('stroke-dashoffset', 100);
    if (el.sewAnim && el.sewAnim.beginElement) {
      try { el.sewAnim.beginElement(); } catch (e) {}
    }
  }

  /* 诗题她可以自己写；写过之后，"换一版"也不会把它盖掉 */
  function bindTitleEdit() {
    var t = el.title;
    t.setAttribute('contenteditable', 'plaintext-only');
    if (!t.isContentEditable) t.setAttribute('contenteditable', 'true');
    t.setAttribute('spellcheck', 'false');
    t.setAttribute('role', 'textbox');
    t.setAttribute('aria-label', '诗题，可以直接改');

    t.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); t.blur(); }
    });

    t.addEventListener('input', function () {
      var v = t.textContent.replace(/\s+/g, ' ').trim();
      state.title = v;
      state.customTitle = !!v;
      rememberTitle();
    });

    t.addEventListener('blur', function () {
      var v = t.textContent.replace(/\s+/g, ' ').trim();
      if (!v) {
        state.customTitle = false;
        state.title = buildTitle(mulberry32(state.seed || 1));
      } else {
        state.title = v;
        state.customTitle = true;
      }
      t.textContent = state.title;
      rememberTitle();
    });
  }

  /* 手写的标题刷新之后还在 */
  function rememberTitle() {
    try {
      if (state.customTitle && state.title) {
        localStorage.setItem(KEY_TITLE, state.title);
      } else {
        localStorage.removeItem(KEY_TITLE);
      }
    } catch (e) {}
  }

  function renderRail() {
    Array.prototype.forEach.call(el.modes.children, function (btn) {
      btn.classList.toggle('is-on', btn.dataset.mode === state.mode);
    });

    var free = state.mode === 'free';
    el.cloth.classList.toggle('is-free', free);
    if (el.clipboard) el.clipboard.hidden = !free;
    if (el.edit) el.edit.hidden = free;      // 自由拼贴里诗是摆出来的，没有"改字"

    // 拼贴板一出现/消失，布的高度就变了，绣线和针必须跟着重量一次，
    // 否则边框会停在旧尺寸上（这就是"版面和刺绣动画没对齐"）。
    scheduleSync();

    el.edit.textContent = state.editing ? '写完了' : '自己改几句';
    el.body.setAttribute('contenteditable', state.editing ? 'true' : 'false');
    el.body.classList.toggle('is-editing', state.editing);
    renderShelf();
  }

  function renderShelf() {
    el.shelf.textContent = '';
    if (!state.saved.length) {
      var empty = document.createElement('p');
      empty.className = 'shelf__empty';
      empty.textContent = '还没有存下的版本。';
      el.shelf.appendChild(empty);
      return;
    }

    state.saved.slice().reverse().forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'shelf__row';

      var load = document.createElement('button');
      load.type = 'button';
      load.className = 'shelf__title';
      load.dataset.load = item.id;
      load.textContent = item.title;

      var meta = document.createElement('span');
      meta.className = 'shelf__meta';
      var d = new Date(item.at);
      meta.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
        (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'shelf__del';
      del.dataset.del = item.id;
      del.setAttribute('aria-label', '删除这个版本');
      del.textContent = '✕';

      row.appendChild(load);
      row.appendChild(meta);
      row.appendChild(del);
      el.shelf.appendChild(row);
    });
  }

  /* ------------------------------------------------------------- actions */

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(KEY_POEMS) || '[]'); }
    catch (e) { return []; }
  }

  function writeSaved(list) {
    state.saved = list;
    try { localStorage.setItem(KEY_POEMS, JSON.stringify(list)); } catch (e) {}
  }

  function saveCurrent() {
    var item = {
      id: 'p' + Date.now(),
      title: state.title,
      lines: state.lines.slice(),
      mode: state.mode,
      at: Date.now()
    };
    writeSaved(readSaved().concat([item]));
    el.save.textContent = '存好了 ✓';
    setTimeout(function () { el.save.textContent = '存下这一版'; }, 1500);
    renderShelf();
  }

  function pullFromDom() {
    var raw = el.body.innerText.replace(/\u00a0/g, ' ');
    var lines = raw.split(/\n+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length; });
    if (lines.length) state.lines = lines;
  }

  function goDesign() {
    if (state.editing) pullFromDom();
    var payload = {
      title: el.title.textContent.trim(),
      lines: state.lines.slice(),
      mode: state.mode,
      words: state.words,
      at: Date.now()
    };
    try { localStorage.setItem(KEY_CHOSEN, JSON.stringify(payload)); } catch (e) {}
    document.body.classList.add('is-leaving');
    setTimeout(function () { window.location.href = 'design.html'; }, 420);
  }

  /* -------------------------------------------------------------- wiring */

  function bind() {
    el.modes.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      if (state.editing) { pullFromDom(); state.editing = false; }
      generate(b.dataset.mode);
    });

    el.regen.addEventListener('click', function () {
      if (state.editing) { pullFromDom(); state.editing = false; }
      generate(state.mode);
    });

    el.edit.addEventListener('click', function () {
      state.editing = !state.editing;
      if (!state.editing) pullFromDom();
      renderRail();
      if (state.editing) el.body.focus();
    });

    el.save.addEventListener('click', function () {
      if (state.editing) { pullFromDom(); state.editing = false; renderRail(); }
      saveCurrent();
    });

    el.shelf.addEventListener('click', function (e) {
      var load = e.target.closest('[data-load]');
      var del = e.target.closest('[data-del]');

      if (load) {
        var item = state.saved.filter(function (x) { return x.id === load.dataset.load; })[0];
        if (!item) return;
        state.title = item.title;
        state.customTitle = true;
        state.lines = item.lines.slice();
        state.mode = item.mode;
        state.editing = false;
        renderPoem();
        renderRail();
      }

      if (del) {
        writeSaved(state.saved.filter(function (x) { return x.id !== del.dataset.del; }));
        renderShelf();
      }
    });

    if (el.clipReset) el.clipReset.addEventListener('click', resetLayout);

    el.go.addEventListener('click', goDesign);
  }

  /* -------------------------------------------------------------- boot */

  el.cloth = document.querySelector('.cloth');
  el.stitchRect = document.getElementById('stitchRect');
  el.stitchMask = document.getElementById('stitchMask');
  el.sewAnim = document.getElementById('sewAnim');
  el.title = document.getElementById('poemTitle');
  el.body = document.getElementById('poemBody');
  el.clipboard = document.getElementById('clipboard');
  el.clipField = document.getElementById('clipField');
  el.clipRead = document.getElementById('clipRead');
  el.clipReset = document.getElementById('clipReset');
  el.note = document.getElementById('poemNote');
  el.modes = document.getElementById('modes');
  el.regen = document.getElementById('regen');
  el.edit = document.getElementById('edit');
  el.save = document.getElementById('save');
  el.shelf = document.getElementById('shelf');
  el.go = document.getElementById('goDesign');
  el.empty = document.getElementById('makeEmpty');
  el.stage = document.getElementById('makeStage');
  el.wordlist = document.getElementById('wordList');

  indexLexicon();

  var handoff = null;
  try { handoff = JSON.parse(localStorage.getItem(KEY_HANDOFF) || 'null'); } catch (e) {}

  if (!handoff || !handoff.words || !handoff.words.length) {
    el.stage.hidden = true;
    el.empty.hidden = false;
    return { regenerate: function () {} };
  }

  state.words = handoff.words.slice();
  state.pool = buildPool(state.words);
  state.saved = readSaved();

  state.words.forEach(function (w) {
    var s = document.createElement('span');
    s.className = 'wordlist__item';
    s.textContent = w;
    el.wordlist.appendChild(s);
  });

  var savedLayout = null;
  try { savedLayout = JSON.parse(localStorage.getItem(KEY_LAYOUT) || 'null'); } catch (e) {}

  state.layout = defaultLayout();
  if (savedLayout) {
    Object.keys(savedLayout).forEach(function (w) {
      if (state.layout[w]) state.layout[w] = savedLayout[w];
    });
  }

  var draftTitle = null;
  try { draftTitle = localStorage.getItem(KEY_TITLE); } catch (e) {}
  if (draftTitle) {
    state.title = draftTitle;
    state.customTitle = true;
  }

  buildClipboard();
  bindClipboard();
  bindTitleEdit();
  bind();
  generate('recombine');

  var syncTimer = null;
  window.addEventListener('resize', scheduleSync);

  // 布的任何尺寸变化都要重算绣线：切模式、字体重排、拼贴板换高都在这里兜住
  if (window.ResizeObserver) {
    new ResizeObserver(function () { scheduleSync(); }).observe(el.cloth);
  }

  return {
    generate: generate,
    get: function () { return { title: state.title, lines: state.lines.slice() }; }
  };
});
