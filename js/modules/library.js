/* re:poem — module 03: 关键词素材库
   词是别人的，选法是你自己的。这个模块只做四件事：给出词、让人挑、
   记住挑了什么、把挑好的交给下一个模块。                                    */

RePoem.module('library', function () {
  'use strict';

  var lex = RePoem.use('lexicon');
  var DATA = lex.data;
  var CATS = ['nature', 'life', 'emotion', 'action', 'custom'];
  var MOOD_TAGS = {
    '孤绝': ['lon'],
    '疼': ['lon'],
    '渴望': ['ten'],
    '倔强': ['reb'],
    '温柔': ['ten'],
    '不甘': ['reb']
  };

  var KEY_SEL = 'repoem:selected';
  var KEY_CUSTOM = 'repoem:custom';
  var KEY_MOOD = 'repoem:mood';
  var KEY_HANDOFF = 'repoem:handoff';

  var state = {
    active: 'nature',
    query: '',
    selected: [],
    custom: [],
    mood: null
  };

  var el = {};
  var picks = [];      // recommendation strip contents for this render

  /* -------------------------------------------------------------- helpers */

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key) || sessionStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /* four paper stocks — the walls of a poet's room are never one colour */
  var TINTS = [
    ['#fdf7f1', '#f3e4dc'],
    ['#fbf3ee', '#ecdfd6'],
    ['#fef9f2', '#f7ead9'],
    ['#faf1f3', '#e9dadd']
  ];

  /* word → category, and a flat list. Duplicates keep their first home. */
  var byWord = {};
  var allWords = [];

  function buildIndex() {
    CATS.forEach(function (cat) {
      DATA[cat].words.forEach(function (pair) {
        var w = pair[0], m = pair[1] || '';
        if (byWord[w]) return;
        byWord[w] = { word: w, cat: cat, mood: m };
        allWords.push(byWord[w]);
      });
    });
  }

  function catOf(word) {
    return byWord[word] ? byWord[word].cat : 'custom';
  }

  function isOn(word) {
    return state.selected.indexOf(word) !== -1;
  }

  function countIn(cat) {
    return state.selected.filter(function (w) { return catOf(w) === cat; }).length;
  }

  /* -------------------------------------------------------------- fragments */

  function scrapNode(w, opts) {
    var on = isOn(w.word);
    var h = hash(w.word);
    var tint = TINTS[(h >> 5) % TINTS.length];

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'scrap' + (on ? ' is-on' : '');
    b.dataset.word = w.word;
    b.style.setProperty('--rot', (((h % 11) - 5) * 0.62).toFixed(2) + 'deg');
    b.style.setProperty('--dy', ((((h >> 3) % 5) - 2) * 0.9).toFixed(1) + 'px');
    b.style.setProperty('--jx', (h >> 7) % 5 + 'px');
    b.style.setProperty('--jy', (h >> 2) % 3 + 'px');
    b.style.setProperty('--paper', tint[0]);
    b.style.setProperty('--paper-2', tint[1]);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? '取消选择' : '选上这个词';

    if (opts && opts.showCat) {
      var tag = document.createElement('span');
      tag.className = 'scrap__cat';
      tag.textContent = DATA[w.cat].label.slice(0, 2);
      b.appendChild(tag);
    }
    b.appendChild(document.createTextNode(w.word));
    return b;
  }

  /* -------------------------------------------------------------- render */

  function renderTabs() {
    el.tabs.textContent = '';
    CATS.forEach(function (cat) {
      var n = countIn(cat);
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tab' + (state.active === cat ? ' is-active' : '');
      t.dataset.cat = cat;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', state.active === cat ? 'true' : 'false');
      t.appendChild(document.createTextNode(DATA[cat].label));
      var badge = document.createElement('span');
      badge.className = 'tab__badge';
      badge.textContent = n ? n : '';
      t.title = DATA[cat].label + (n ? '　已选 ' + n + ' 个' : '');
      t.appendChild(badge);
      el.tabs.appendChild(t);
    });
  }

  function currentList() {
    if (state.query) {
      var q = state.query.trim();
      if (!q) return [];
      return allWords.filter(function (w) { return w.word.indexOf(q) !== -1; });
    }

    if (state.active === 'custom') {
      return state.custom.map(function (w) {
        return { word: w, cat: 'custom', mood: '' };
      }).reverse();
    }

    // words already offered in the recommendation strip are not repeated below
    return DATA[state.active].words.map(function (p) {
      return byWord[p[0]];
    }).filter(function (w) {
      return w && picks.indexOf(w) === -1;
    });
  }

  function renderField() {
    var list = currentList();
    var searching = !!state.query.trim();

    el.field.textContent = '';
    el.field.classList.toggle('is-searching', searching);

    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'field__empty';
      if (state.active === 'custom' && !searching) {
        empty.textContent = '这一页还空着——在下面写一个你自己的词。';
      } else if (searching) {
        empty.textContent = '没找到「' + state.query.trim() + '」。要不把它写进自定义？';
      } else {
        empty.textContent = '这一页还空着。';
      }
      el.field.appendChild(empty);
      return;
    }

    var frag = document.createDocumentFragment();
    list.forEach(function (w) {
      frag.appendChild(scrapNode(w, { showCat: searching }));
    });
    el.field.appendChild(frag);
  }

  /* which words the strip offers — computed once per render so the field below
     can skip them and nothing appears twice on screen */
  function computePicks() {
    var moods = [];
    if (state.mood && state.mood.tags) {
      state.mood.tags.forEach(function (t) {
        (MOOD_TAGS[t] || []).forEach(function (m) {
          if (moods.indexOf(m) === -1) moods.push(m);
        });
      });
    }
    if (!moods.length || state.query.trim()) return [];

    // keep the strip stable: a word you take stays here, inked over
    return allWords.filter(function (w) {
      return moods.indexOf(w.mood) !== -1;
    }).slice(0, 14);
  }

  function renderRecommend() {
    if (!picks.length) {
      el.recommend.hidden = true;
      return;
    }

    el.recommend.hidden = false;
    el.recommendLabel.textContent = '';

    var kicker = document.createElement('span');
    kicker.className = 'recommend__kicker';
    kicker.textContent = '为你推荐';
    el.recommendLabel.appendChild(kicker);

    var lead = document.createElement('span');
    lead.className = 'recommend__why';
    lead.textContent = '沿着《' + (state.mood.poem || '上一页') + '》的基调 · '
      + state.mood.tags.join(' · ');
    el.recommendLabel.appendChild(lead);

    el.recommendField.textContent = '';
    picks.forEach(function (w) {
      el.recommendField.appendChild(scrapNode(w, { showCat: true }));
    });
  }

  function renderBar() {
    el.count.querySelector('b').textContent = state.selected.length;
    el.count.setAttribute('aria-label', '已选 ' + state.selected.length + ' 个词');
    el.picked.textContent = '';

    state.selected.forEach(function (w) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.remove = w;
      chip.title = '取消选择';
      chip.appendChild(document.createTextNode(w));
      var x = document.createElement('span');
      x.className = 'chip__x';
      x.textContent = '✕';
      chip.appendChild(x);
      el.picked.appendChild(chip);
    });

    if (!state.selected.length) {
      var hint = document.createElement('span');
      hint.className = 'bar__hint';
      hint.textContent = '还没挑词 —— 看得上哪片，点一下。';
      el.picked.appendChild(hint);
    }

    el.go.disabled = state.selected.length === 0;
    el.go.textContent = state.selected.length
      ? '进入拼贴工作台 · ' + state.selected.length
      : '进入拼贴工作台';
  }

  function renderAll() {
    picks = computePicks();
    renderTabs();
    renderField();
    renderRecommend();
    renderBar();
    el.slip.hidden = state.active !== 'custom' || !!state.query.trim();
  }

  /* -------------------------------------------------------------- actions */

  function toggle(word) {
    var i = state.selected.indexOf(word);
    if (i === -1) state.selected.push(word);
    else state.selected.splice(i, 1);

    write(KEY_SEL, state.selected);
    renderAll();

    // keep the pressed scrap in view when re-rendering swaps the node
    var node = el.field.querySelector('.scrap[data-word="' + cssEscape(word) + '"]');
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function addCustom(raw) {
    var w = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!w) return;
    if (w.length > 12) w = w.slice(0, 12);

    if (!byWord[w] && state.custom.indexOf(w) === -1) {
      state.custom.unshift(w);
      write(KEY_CUSTOM, state.custom);
    }
    if (!isOn(w)) {
      state.selected.push(w);
      write(KEY_SEL, state.selected);
    }
    renderAll();
  }

  /* -------------------------------------------------------------- wiring */

  function bind() {
    el.tabs.addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t) return;
      state.active = t.dataset.cat;
      renderAll();
    });

    el.field.addEventListener('click', function (e) {
      var s = e.target.closest('.scrap');
      if (s) toggle(s.dataset.word);
    });

    el.recommendField.addEventListener('click', function (e) {
      var s = e.target.closest('.scrap');
      if (s) toggle(s.dataset.word);
    });

    el.picked.addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (c) toggle(c.dataset.remove);
    });

    var t = null;
    el.search.addEventListener('input', function () {
      clearTimeout(t);
      var v = el.search.value;
      el.searchWrap.classList.toggle('has-value', !!v);
      t = setTimeout(function () {
        state.query = v;
        renderAll();
      }, 90);
    });

    el.searchClear.addEventListener('click', function () {
      el.search.value = '';
      el.searchWrap.classList.remove('has-value');
      state.query = '';
      renderAll();
      el.search.focus();
    });

    el.customAdd.addEventListener('click', function () {
      addCustom(el.customInput.value);
      el.customInput.value = '';
      el.customInput.focus();
    });

    el.customInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustom(el.customInput.value);
        el.customInput.value = '';
      }
    });

    el.go.addEventListener('click', function () {
      if (!state.selected.length) return;
      write(KEY_HANDOFF, {
        words: state.selected,
        mood: state.mood,
        at: Date.now()
      });
      document.body.classList.add('is-leaving');
      setTimeout(function () { window.location.href = 'collage.html'; }, 460);
    });
  }

  /* -------------------------------------------------------------- boot */

  el.tabs = document.getElementById('tabs');
  el.field = document.getElementById('field');
  el.recommend = document.getElementById('recommend');
  el.recommendLabel = document.getElementById('recommendLabel');
  el.recommendField = document.getElementById('recommendField');
  el.search = document.getElementById('search');
  el.searchWrap = document.getElementById('searchWrap');
  el.searchClear = document.getElementById('searchClear');
  el.slip = document.getElementById('slip');
  el.customInput = document.getElementById('customInput');
  el.customAdd = document.getElementById('customAdd');
  el.count = document.getElementById('count');
  el.picked = document.getElementById('picked');
  el.go = document.getElementById('go');

  buildIndex();
  state.selected = read(KEY_SEL, []) || [];
  state.custom = read(KEY_CUSTOM, []) || [];
  // coming from the book, poem.html has already posted the tone; landing here
  // directly still needs a point of departure, and the site only has one poem
  state.mood = read(KEY_MOOD, null) || {
    poem: '唯独我，不是',
    tags: ['孤绝', '疼', '渴望'],
    from: 'default'
  };

  bind();
  renderAll();

  return {
    toggle: toggle,
    selected: function () { return state.selected.slice(); },
    state: state
  };
});
