/* ================= 行测真题库 · 个人复习台 ================= */
'use strict';

const MODULES = [
  { code: 'm1', name: '政治理论', short: '政治' },
  { code: 'm2', name: '常识判断', short: '常识' },
  { code: 'm3', name: '言语理解与表达', short: '言语' },
  { code: 'm4', name: '数量关系', short: '数量' },
  { code: 'm5', name: '判断推理', short: '判断' },
  { code: 'm6', name: '资料分析', short: '资料' },
];
const MOD_NAME = Object.fromEntries(MODULES.map(m => [m.code, m.name]));
const MOD_SHORT = Object.fromEntries(MODULES.map(m => [m.code, m.short]));

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));

const store = {
  get(k, d) { try { const v = localStorage.getItem('xct.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('xct.' + k, JSON.stringify(v)); } catch (e) { } },
};

const S = {
  view: 'home',
  papers: [],
  groups: [],
  chunk: new Map(),
  searchIdx: null,
  session: null,
  pending: [],
  timer: null,
  elapsed: 0,
  stats: store.get('stats', { done: 0, ok: 0, byMod: {}, byTag: {} }),
  wrong: store.get('wrong', []),
  fav: store.get('fav', []),
  exams: store.get('exams', []),
  examResult: null,
  last: store.get('last', null),
  tags: null,
  regionMode: store.get('regionMode', 'gd'),
  fontScale: store.get('fontScale', 1),
  guideOff: store.get('guideOff', false),
  drill: { code: 'm5', year: 'all', count: 20, tag: 'all', src: 'mine' },
  papersFilter: { q: '', year: 'all', tier: 'mine' },
  wrongTab: 'wrong',
  cardFilter: 'all',
};

/* ---------------- 考区（广东考生视角） ---------------- */
const TIER_LABEL = { gk: '国考', gd: '广东省考', gz: '广州市考', sz: '深圳市考', xd: '广东选调', other: '外省/联考' };
const GD_SCOPE = new Set(['gk', 'gd', 'gz', 'sz']);

function tierOf(p) {
  const r = p.region || '';
  if (r === '国考') return 'gk';
  if (r === '广东') return (p.name && p.name.indexOf('选调') >= 0) ? 'xd' : 'gd';
  if (r === '广州市考') return 'gz';
  if (r === '深圳市考') return 'sz';
  return 'other';
}

function inScope(p) {
  if (S.regionMode === 'all') return true;
  return GD_SCOPE.has(tierOf(p));
}

function scopeLabel() {
  return S.regionMode === 'all' ? '全部考区' : '广东考生';
}

function isScopeOnly() {
  return S.papers.length > 0 && S.papers.every(p => GD_SCOPE.has(tierOf(p)));
}

/* ---------------- data ---------------- */
async function boot() {
  try {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error(res.status);
    S.papers = (await res.json()).papers;
  } catch (e) {
    $('#main').innerHTML = `<div class="wrap"><div class="empty"><b>数据没有加载出来</b>
      <p>请用本地服务器打开本页（双击 <code>启动题库.bat</code>，或运行 <code>python -m http.server 8765</code>）。<br>
      直接双击 index.html 时浏览器会拦截本地数据读取。</p></div></div>`;
    return;
  }
  buildGroups();
  const brandSub = document.querySelector('.brand-text i');
  if (brandSub) brandSub.textContent = '2016—2026 · ' + num(S.papers.reduce((a, b) => a + b.n, 0)) + ' 题';
  renderRail();
  renderFoot();
  applyFontSize();
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', applyFontSize);
  render();
  loadTags();
}

/* ---------------- 字号 / 关于 ---------------- */
const FONT_LABELS = ['小', '中', '大'];

function applyFontSize() {
  const base = window.innerWidth < 640 ? 16 : 17;
  const s = [0.94, 1, 1.1][S.fontScale] || 1;
  const root = document.documentElement.style;
  root.setProperty('--stem-size', (base * s).toFixed(1) + 'px');
  root.setProperty('--opt-size', (14.5 * s).toFixed(1) + 'px');
  root.setProperty('--exp-size', (13.5 * s).toFixed(1) + 'px');
  const el = $('#font-label');
  if (el) el.textContent = FONT_LABELS[S.fontScale] || '中';
}

function cycleFont() {
  S.fontScale = (S.fontScale + 1) % 3;
  store.set('fontScale', S.fontScale);
  applyFontSize();
  toast('字号：' + FONT_LABELS[S.fontScale]);
}

function openAbout() {
  const box = $('#modal-box');
  const total = S.papers.length ? S.papers.reduce((a, b) => a + b.n, 0) : 58890;
  box.innerHTML = `<h3>关于这个工具</h3>
    <p>一个本地跑的行测真题库：按考点抽题、整卷模考、错题本、弱项诊断。所有页面都是静态文件，没有后端。</p>
    <h4>数据来源</h4>
    <p>题目来自开源仓库 <b>ERRRC/xingcezhenti</b>（2016—2026，全库 515 套 / 58,890 题；本页收录其中 ${S.groups.length} 套 / ${total} 题），图片已本地化。
    答案与官方解析来自第三方题库，部分「网友回忆版」可能有缺题或错答案，遇到以解析的推理过程为准。</p>
    <h4>关于分数</h4>
    <p>模考分数是按模块权重折算的估算值（政治/常识 0.5、言语/判断 0.8、数量/资料 1.0），不是官方分值，只用于自我对比。</p>
    <h4>你的数据在哪</h4>
    <p>做题记录、错题本、模考成绩都只存在你自己浏览器的 localStorage（键名 <code>xct.*</code>），不会上传到任何服务器；换浏览器或清缓存会丢。</p>
    <h4>反馈</h4>
    <p>把用着别扭的地方直接发给分享给你的人；正式部署后会挂 GitHub Issues。</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
      <button class="btn ghost" data-clear-data>清除本机记录</button>
      <button class="btn primary" data-modal-close>知道了</button>
    </div>`;
  $('#modal').hidden = false;
}

function closeModal() { $('#modal').hidden = true; }

async function loadTags() {
  if (S.tags) return S.tags;
  try {
    const res = await fetch('data/tags.json');
    const data = await res.json();
    S.tags = data.tags;
    S.qtag = data.qtag || {};
  } catch (e) { S.tags = []; S.qtag = {}; }
  if (S.view === 'drill' || S.view === 'diag') render();
  return S.tags;
}

function tagsOf(code) {
  if (!S.tags) return [];
  const hasDerived = S.tags.some(x => x.code === code && x.derived);
  return S.tags
    .filter(t => t.code === code && t.n >= 15 && !t.tag.includes('·判断'))
    .filter(t => !(code === 'm4' && hasDerived && t.tag === '数学运算'))
    .sort((a, b) => b.n - a.n);
}

// 推断考点优先（目前只有数量关系），否则用题库原始题型
function tagOf(item) {
  if (!item || !item.q) return '未标注';
  const inferred = S.qtag && S.qtag[item.pid + '|' + item.q.id];
  return inferred || item.q.t || '未标注';
}

function dispTag(tag) { return String(tag || '').replace('·判断', ''); }

function buildGroups() {
  const map = new Map();
  for (const p of S.papers) {
    let g = map.get(p.name);
    if (!g) { g = { name: p.name, year: p.year, region: p.region, mods: {}, count: 0 }; map.set(p.name, g); }
    g.mods[p.code] = p.id;
    g.count += p.n;
  }
  S.groups = [...map.values()].sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name, 'zh'));
}

async function loadChunk(pid) {
  if (S.chunk.has(pid)) return S.chunk.get(pid);
  const p = S.papers.find(x => x.id === pid);
  const res = await fetch(p.f);
  const data = await res.json();
  S.chunk.set(pid, data);
  return data;
}

/* ---------------- rail ---------------- */
function renderRail() {
  $('#rail-modules').innerHTML = `<div class="rail-title">按模块</div>` + MODULES.map(m => {
    const n = S.papers.filter(p => p.code === m.code && inScope(p)).reduce((a, b) => a + b.n, 0);
    return `<button class="mod-item" data-mod="${m.code}"><em>${m.code.slice(1)}</em>${m.name}<span class="count">${num(n)}</span></button>`;
  }).join('');
  $('#rail-modules').querySelectorAll('.mod-item').forEach(b => b.onclick = () => {
    S.drill.code = b.dataset.mod; go('drill');
  });
  renderRegionPill();
  updateNav();
}

function renderRegionPill() {
  const pill = $('#region-toggle');
  if (!pill) return;
  pill.style.display = isScopeOnly() ? 'none' : '';
  pill.classList.toggle('all', S.regionMode === 'all');
  $('#region-label').textContent = '考区 · ' + scopeLabel();
}

function scopeStats() {
  const by = { gk: { p: 0, n: 0 }, gd: { p: 0, n: 0 }, gz: { p: 0, n: 0 }, sz: { p: 0, n: 0 }, xd: { p: 0, n: 0 }, other: { p: 0, n: 0 } };
  for (const g of S.groups) {
    const t = tierOf(g);
    by[t].p++; by[t].n += g.count;
  }
  return by;
}

function tierMatch(g, tier) {
  if (tier === 'all') return true;
  const t = tierOf(g);
  if (tier === 'mine') return GD_SCOPE.has(t);
  if (tier === 'gzsz') return t === 'gz' || t === 'sz';
  return t === tier;
}

function updateNav() {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  $('#badge-wrong').textContent = S.wrong.length;
  $('#badge-wrong').style.display = S.wrong.length ? '' : 'none';
}

function renderFoot() {
  $('#foot-done').textContent = num(S.stats.done);
  $('#foot-acc').textContent = S.stats.done ? Math.round(S.stats.ok / S.stats.done * 100) + '%' : '—';
}

function go(view) {
  if ((S.view === 'practice' || S.view === 'paper') && view !== S.view && !(S.session && S.session.mode === 'exam')) stopTimer();
  S.view = view;
  updateNav();
  render();
  $('#main').scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ---------------- router ---------------- */
function render() {
  const main = $('#main');
  const keep = (S.view === 'practice' || S.view === 'paper') ? main.scrollTop : 0;
  const focus = S._focus; S._focus = null;
  if (S.view === 'home') main.innerHTML = viewHome();
  else if (S.view === 'drill') main.innerHTML = viewDrill();
  else if (S.view === 'papers') main.innerHTML = viewPapers();
  else if (S.view === 'practice') { main.innerHTML = viewPractice(); afterPractice(); }
  else if (S.view === 'paper') { main.innerHTML = viewPaper(); afterPaper(); }
  else if (S.view === 'wrong') main.innerHTML = viewWrong();
  else if (S.view === 'diag') main.innerHTML = viewDiag();
  else if (S.view === 'cards') main.innerHTML = viewCards();
  else if (S.view === 'search') main.innerHTML = viewSearch();
  else if (S.view === 'summary') main.innerHTML = viewSummary();
  else if (S.view === 'exam') main.innerHTML = viewExam();
  renderSides();
  bindView();
  renderSheet();
  if (S.view === 'practice') {
    main.scrollTop = keep;
    if (focus) {
      const el = document.querySelector(focus);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
    }
  }
}

function bindView() {
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
  document.querySelectorAll('[data-start-paper]').forEach(b => b.onclick = () => {
    const g = S.groups.find(x => x.name === b.dataset.startPaper);
    if (g) startPaper(g);
  });
}

/* ---------------- 宽屏侧栏 ---------------- */
function progressCard() {
  const st = S.stats;
  const acc = st.done ? Math.round(st.ok / st.done * 100) : null;
  return `<div class="side-card">
    <div class="side-title">你的进度</div>
    <div class="side-kv"><span>累计已做</span><b>${num(st.done)}</b></div>
    <div class="side-kv"><span>正确率</span><b>${acc == null ? '—' : acc + '%'}</b></div>
    <div class="side-kv"><span>错题待清</span><b>${num(S.wrong.length)}</b></div>
    <button class="side-btn" data-nav="diag">弱项诊断 →</button>
  </div>`;
}

function examMiniCard() {
  if (!S.exams.length) {
    return `<div class="side-card"><div class="side-title">最近模考</div>
      <div class="side-note">还没有模考记录。整套做一遍，交卷后会记在这里，能看到分数趋势。</div></div>`;
  }
  return `<div class="side-card"><div class="side-title">最近模考</div>
    ${S.exams.slice(0, 3).map(x => `<button class="side-link" data-exam-ts="${x.ts}"><span class="sn">${x.score}</span>${esc(x.title.replace(/^\d{4}年?/, '').slice(0, 12))}</button>`).join('')}
    <div class="side-note">点一条回看成绩单。</div></div>`;
}

function sidePanels() {
  const v = S.view;
  let left = '', right = progressCard();

  if (v === 'home') {
    left = `<div class="side-card"><div class="side-title">今日清单</div>
      <button class="side-item" data-nav="drill"><b>① 专项 20 题</b><span>一个模块，做完看解析</span></button>
      <button class="side-item" data-nav="papers"><b>② 套卷模考</b><span>120 分钟，交卷出分</span></button>
      <button class="side-item" data-nav="wrong"><b>③ 错题回炉</b><span>${S.wrong.length ? S.wrong.length + ' 道待清' : '做错的题会自动到这里'}</span></button>
      <div class="side-note">顺序建议：资料 → 判断 → 言语 → 数量 → 常识。</div></div>`;
    right = progressCard() + examMiniCard();
  } else if (v === 'drill') {
    const d = S.drill;
    left = `<div class="side-card"><div class="side-title">当前范围</div>
      <div class="side-kv"><span>模块</span><b>${MOD_NAME[d.code]}</b></div>
      <div class="side-kv"><span>题源</span><b>${d.src === 'all' ? '全部考区' : '国考 + 广东'}</b></div>
      <div class="side-kv"><span>考点</span><b>${d.tag === 'all' ? '不限' : esc(d.tag)}</b></div>
      <div class="side-kv"><span>年份</span><b>${d.year === 'all' ? '不限' : d.year}</b></div>
      </div>`;
    right = `<div class="side-card"><div class="side-title">建议顺序</div>
      ${MODULES.map(m => `<button class="side-link" data-mod-start="${m.code}">${m.name}</button>`).join('')}
      <div class="side-note">先练能靠方法提分的（资料、判断），再补积累型的（常识）。</div></div>` + progressCard();
  } else if (v === 'cards') {
    const groups = MODULES.map(m => ({ m, list: CARDS.map((c, i) => ({ c, i })).filter(x => x.c.mod === m.code) })).filter(g => g.list.length);
    left = `<div class="side-card"><div class="side-title">卡片目录 · ${CARDS.length}</div>
      ${groups.map(g => `<div class="side-group">${g.m.short}</div>${g.list.map(x => `<button class="side-link" data-scroll="#card-${x.i}">${esc(x.c.title)}</button>`).join('')}`).join('')}</div>`;
    right = `<div class="side-card"><div class="side-title">按考点开练</div>
      ${['图形推理', '逻辑填空', '增长', '工程问题', '新思想'].map(t => `<button class="side-link" data-tag-drill="${esc(t)}">只刷「${esc(t)}」</button>`).join('')}
      <div class="side-note">卡片是方法，刷题才是检验；做完一组回来翻一遍卡片。</div></div>` + progressCard();
  } else if (v === 'papers') {
    const sc = scopeStats();
    const all = sc.gk.p + sc.gd.p + sc.gz.p + sc.sz.p + sc.xd.p + sc.other.p;
    left = `<div class="side-card"><div class="side-title">按考区筛</div>
      <button class="side-link" data-pick-tier="mine">我的考区 · ${sc.gk.p + sc.gd.p + sc.gz.p + sc.sz.p} 套</button>
      <button class="side-link" data-pick-tier="gk">国考 · ${sc.gk.p} 套</button>
      <button class="side-link" data-pick-tier="gd">广东省考 · ${sc.gd.p} 套</button>
      <button class="side-link" data-pick-tier="gzsz">广州 + 深圳 · ${sc.gz.p + sc.sz.p} 套</button>
      <button class="side-link" data-pick-tier="xd">广东选调 · ${sc.xd.p} 套</button>
      ${isScopeOnly() ? '' : `<button class="side-link" data-pick-tier="all">全部 · ${all} 套</button>`}
      </div>`;
    right = examMiniCard() + progressCard();
  } else if (v === 'wrong') {
    const byMod = MODULES.map(m => ({ m, n: S.wrong.filter(w => w.mod === m.code).length })).filter(x => x.n);
    left = `<div class="side-card"><div class="side-title">错题分布</div>
      ${byMod.length ? byMod.map(x => `<div class="side-kv"><span>${x.m.name}</span><b>${x.n}</b></div>`).join('') : '<div class="side-note">还没有错题。做错的题会自动收进来。</div>'}
      </div>`;
    right = progressCard();
  } else if (v === 'diag') {
    const rows = diagRows();
    const groups = MODULES.map(m => ({ m, list: rows.filter(r => r.module === m.name) })).filter(g => g.list.length);
    left = `<div class="side-card"><div class="side-title">考点目录</div>
      ${groups.length ? groups.map(g => `<div class="side-group">${g.m.short}</div>${g.list.slice(0, 4).map(r => `<button class="side-link" data-scroll="#diag-${g.m.name}">${esc(r.tag)} · ${Math.round(r.acc * 100)}%</button>`).join('')}`).join('') : '<div class="side-note">做过题之后，这里会出现考点列表。</div>'}
      </div>`;
    right = examMiniCard() + progressCard();
  } else if (v === 'search') {
    left = `<div class="side-card"><div class="side-title">常用关键词</div>
      ${['比重', '增长率', '图形推理', '村民委员会', '行政处罚', '成语'].map(k => `<button class="side-link" data-search-q="${esc(k)}">${esc(k)}</button>`).join('')}</div>`;
    right = `<div class="side-card"><div class="side-title">说明</div>
      <div class="side-note">搜索覆盖题干前 60 字，很长的题干可能搜不到后半段；结果按题干去重。<br><br>索引约 11 MB，第一次搜索时加载。</div></div>`;
  } else if (v === 'practice') {
    const s = S.session;
    if (s) {
      const it = s.items[s.idx];
      const tag = tagOf(it);
      const advice = TAG_ADVICE[tag] || TAG_ADVICE[MOD_NAME[it.mod]] || '先判断这道题在考什么，再动笔。';
      const years = [...new Set(s.items.map(i => {
        const p = S.papers.find(x => x.id === i.pid);
        return p ? p.year : '';
      }).filter(Boolean))].sort();
      const tagCnt = {};
      s.items.forEach(i => { const t = tagOf(i); tagCnt[t] = (tagCnt[t] || 0) + 1; });
      const distinct = Object.keys(tagCnt);
      const second = distinct.length > 1
        ? `<div class="side-card">
            <div class="side-title">本组构成</div>
            ${distinct.slice(0, 5).map(t => `<div class="side-kv"><span>${esc(t)}</span><b>${tagCnt[t]}</b></div>`).join('')}
            <div class="side-note">共 ${s.items.length} 题 · ${years.length} 个年份</div>
          </div>`
        : `<div class="side-card">
            <div class="side-title">本组信息</div>
            <div class="side-kv"><span>题源</span><b>${S.regionMode === 'all' ? '全部考区' : '国考 + 广东'}</b></div>
            <div class="side-kv"><span>年份</span><b>${years.length ? years[0] + '—' + years[years.length - 1] : '—'}</b></div>
            <div class="side-kv"><span>题量</span><b>${s.items.length}</b></div>
            <div class="side-note">题号导航在右边答题卡，点格子可以跳题。</div>
          </div>`;
      left = `<div class="side-card">
        <div class="side-title">方法提示 · ${esc(tag)}</div>
        <div class="side-note" style="color:var(--ink-2);font-size:12px">${esc(advice)}</div>
        <button class="side-btn" data-tag-jump="${esc(tag)}">只刷这一类 →</button>
      </div>` + second;
    }
    right = '';
  } else if (v === 'paper') {
    left = '';
    right = '';
  }
  return { left, right };
}

function renderSides() {
  const shell = document.querySelector('.shell');
  const l = $('#side-left'), r = $('#side-right');
  if (!l || !r) return;
  const { left, right } = sidePanels();
  l.innerHTML = left;
  r.innerHTML = right;
  shell.classList.toggle('no-left', !left);
  shell.classList.toggle('is-practice', S.view === 'practice' || S.view === 'paper');
}

/* ---------------- home ---------------- */
function viewHome() {
  const d = new Date();
  const last = S.last;
  const rows = diagRows();
  const weakTop = rows.filter(r => r.d >= 3 && r.acc < 0.7).sort((a, b) => a.acc - b.acc)[0];
  const scopePapers = S.groups.filter(inScope).length;
  const scopeTotal = S.papers.filter(inScope).reduce((a, b) => a + b.n, 0);
  const byMod = MODULES.map(m => {
    const s = S.stats.byMod[m.code] || { d: 0, ok: 0 };
    const total = S.papers.filter(p => p.code === m.code && inScope(p)).reduce((a, b) => a + b.n, 0);
    return `<button class="mod-card" data-mod="${m.code}"><b>${m.name}</b>
      <span>${num(s.d)} / ${num(total)} 题 · 正确率 ${s.d ? Math.round(s.ok / s.d * 100) + '%' : '—'}</span></button>`;
  }).join('');

  return `<div class="wrap">
    <div class="eyebrow">${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} · 个人复习台</div>
    <h1 class="page">今天从哪一道开始？</h1>
    <p class="sub">库里是 2016—2026 年国考、省考、联考行测真题 ${num(scopeTotal)} 道，按六大模块归档，题目带官方解析。选一条路径开始，做错的题会自动进错题本。</p>

    ${(S.stats.done === 0 && !S.guideOff) ? `<div class="guide">
      <div class="guide-head"><b>第一次来？三步上手</b><button data-guide-off>不再显示</button></div>
      <ol>
        <li><b>专项练习</b><span>挑一个模块，20 题一组，选完立刻出对错和解析。</span></li>
        <li><b>套卷模考</b><span>整卷 120 分钟倒计时，交卷才判分，出分模块成绩单。</span></li>
        <li><b>错题与诊断</b><span>做错的题自动进错题本；诊断页按考点告诉你最该补哪块。</span></li>
      </ol>
      <button class="btn primary" data-nav="drill">开始第一组 →</button>
    </div>` : ''}

    ${S.regionMode === 'gd' ? (() => {
      const sc = scopeStats();
      const core = sc.gk.p + sc.gd.p + sc.gz.p + sc.sz.p;
      const coreN = sc.gk.n + sc.gd.n + sc.gz.n + sc.sz.n;
      return `<div class="scope-card">
        <div class="scope-head"><span>广东考生 · 推荐范围</span><b>${core} 套 / ${num(coreN)} 题</b></div>
        <div class="scope-rows">
          <button class="scope-row" data-scope="gk"><b>国考</b><span>${sc.gk.p} 套 · ${num(sc.gk.n)} 题</span></button>
          <button class="scope-row" data-scope="gd"><b>广东省考</b><span>${sc.gd.p} 套 · ${num(sc.gd.n)} 题</span></button>
          <button class="scope-row" data-scope="gzsz"><b>广州 + 深圳</b><span>${sc.gz.p + sc.sz.p} 套 · ${num(sc.gz.n + sc.sz.n)} 题</span></button>
        </div>
        <div class="scope-note">${isScopeOnly()
          ? `分享版只打包了这 ${core} 套：国考 + 广东省考 + 广州/深圳。`
          : `抽题池只含这 ${core} 套（另有广东选调 ${sc.xd.p} 套可在试卷页挑）。外省 ${sc.other.p} 套共 ${num(sc.other.n)} 题仍保留，需要横向参考时可在「套卷模考 → 全部」里打开。`}</div>
      </div>`;
    })() : ''}

    <div class="stat-row">
      <div class="stat"><b>${num(S.stats.done)}</b><span>累计已做</span></div>
      <div class="stat"><b>${S.stats.done ? Math.round(S.stats.ok / S.stats.done * 100) + '%' : '—'}</b><span>总正确率</span></div>
      <div class="stat hot"><b>${num(S.wrong.length)}</b><span>错题待清</span></div>
      <div class="stat"><b>${num(S.fav.length)}</b><span>已收藏</span></div>
    </div>

    ${weakTop ? `<button class="diag-teaser" data-nav="diag">
      <span>最弱考点 <b>${esc(weakTop.tag)}</b> · 正确率 ${Math.round(weakTop.acc * 100)}%（${weakTop.d} 题）</span>
      <span class="go">看诊断 →</span></button>` : ''}

    <div class="entries">
      <button class="entry big dark" data-mod-start="m5">
        <div>
          <h3>专项练习</h3>
          <p>按模块、按年份抽题，一次 20 题。判断推理、资料分析这些大头，建议一天一个模块。</p>
        </div>
        <div class="big-num"><b>${num(scopeTotal)}</b><span>道题 · ${scopePapers} 套卷 · 10 年</span></div>
        <span class="go">选模块开始 →</span>
      </button>
      <button class="entry" data-nav="papers">
        <h3>套卷模考</h3>
        <p>取一整套真题，六个模块连做。</p>
        <span class="go">挑一套 →</span>
      </button>
      <button class="entry" data-nav="wrong">
        <h3>错题重做</h3>
        <p>${S.wrong.length ? `有 ${S.wrong.length} 道错题等你回炉。` : '还没有错题，做几道再说。'}</p>
        <span class="go">去清账 →</span>
      </button>
    </div>

    ${last ? `<div class="section-h"><h2>上次没做完</h2><button data-resume>继续</button></div>
      <div class="paper-list" style="margin-bottom:30px"><button class="paper-row" data-resume>
        <span class="yr">${esc(last.year || '')}</span><span class="nm">${esc(last.title)}</span>
        <span class="nq">${last.done}/${last.total}</span></button></div>` : ''}

    ${S.exams.length ? `<div class="section-h"><h2>最近模考</h2><button data-nav="papers">全部记录 →</button></div>
      <div class="paper-list" style="margin-bottom:30px"><button class="paper-row" data-exam-ts="${S.exams[0].ts}">
        <span class="yr">${S.exams[0].score} 分</span>
        <span class="nm">${esc(S.exams[0].title)}</span>
        <span class="nq">${S.exams[0].right}/${S.exams[0].n}</span>
        <span class="nq" style="width:56px">${mmss(S.exams[0].dur)}</span></button></div>` : ''}

    <div class="section-h"><h2>六个模块</h2><span class="count-note">按题库体量</span></div>
    <div class="mod-grid">${byMod}</div>

    <div class="section-h"><h2>最近真题</h2><button data-nav="papers">全部 ${scopePapers} 套 →</button></div>
    <div class="paper-list">${S.groups.filter(inScope).slice(0, 5).map(paperRow).join('')}</div>
  </div>`;
}

function paperRow(g) {
  const badges = MODULES.filter(m => g.mods[m.code]).map(m => `<i>${m.short}</i>`).join('');
  const t = tierOf(g);
  return `<button class="paper-row" data-start-paper="${esc(g.name)}">
    <span class="yr">${esc(g.year)}</span>
    <span class="tier-badge t-${t}">${TIER_LABEL[t]}</span>
    <span class="nm">${esc(g.name.replace(/^\d{4}年?/, ''))}</span>
    <span class="mt">${badges}</span>
    <span class="nq">${g.count} 题</span></button>`;
}

/* ---------------- drill picker ---------------- */
function availableYears() {
  return [...new Set(S.papers.map(p => p.year))].filter(Boolean).sort((a, b) => b - a);
}

function tagScopedCount(t, src) {
  if (src === 'all' || !t.tier) return t.n;
  return ['gk', 'gd', 'gz', 'sz'].reduce((a, k) => a + (t.tier[k] || 0), 0);
}

function viewDrill() {
  const d = S.drill;
  if (S.regionMode === 'all') d.src = 'all';
  const srcOk = p => d.src === 'all' || GD_SCOPE.has(tierOf(p));
  const pool = S.papers.filter(p => p.code === d.code && srcOk(p) && (d.year === 'all' || p.year === d.year));
  const total = pool.reduce((a, b) => a + b.n, 0);
  const years = [...new Set(S.papers.filter(srcOk).map(p => p.year))].filter(Boolean).sort((a, b) => b - a);
  const tg = tagsOf(d.code).map(t => ({ ...t, sn: tagScopedCount(t, d.src) })).filter(t => t.sn > 0);
  if (d.tag !== 'all' && tg.length && !tg.some(t => t.tag === d.tag)) d.tag = 'all';
  const tagObj = tg.find(t => t.tag === d.tag);
  const tagTotal = tagObj ? tagObj.sn : null;

  const tagRow = !S.tags
    ? `<div class="pick-label">考点</div><div class="pick-row"><span class="count-note">正在加载考点索引…</span></div>`
    : tg.length < 2
      ? `<div class="pick-label">考点</div><div class="pick-row"><span class="count-note">${MOD_NAME[d.code]}在原始题库里没有更细的考点标签${d.code === 'm4' ? '（全部记为「数学运算」）' : ''}，只能按年份抽题。</span></div>`
      : `<div class="pick-label">考点</div>
         <div class="pick-row">
           <button class="chip ${d.tag === 'all' ? 'on' : ''}" data-pick-tag="all">全部考点</button>
           ${tg.slice(0, 10).map(t => `<button class="chip ${d.tag === t.tag ? 'on' : ''}" data-pick-tag="${esc(t.tag)}">${esc(t.tag)} ${num(t.sn)}</button>`).join('')}
         </div>
         <div class="count-note" style="margin-top:6px">${[
          tg.some(t => t.derived) ? '数量关系的考点由题干关键词自动推断（原始题库只标了「数学运算」），个别题可能归错类' : '',
          tg.length > 10 ? `共 ${tg.length} 个考点，这里只显示前 10 个；诊断页可以按弱项直达` : '',
        ].filter(Boolean).join(' · ')}</div>`;

  return `<div class="wrap">
    <div class="eyebrow">专项练习</div>
    <h1 class="page">先挑模块，再定范围</h1>
    <p class="sub">从题库里随机抽题，答完立刻判分看解析。做错的题会留在错题本里，下次可以只刷错题。</p>

    <div class="pick-label">模块</div>
    <div class="pick-row">${MODULES.map(m => `<button class="chip ${d.code === m.code ? 'on' : ''}" data-pick-mod="${m.code}">${m.name}</button>`).join('')}</div>

    ${isScopeOnly() ? '' : `<div class="pick-label">题源</div>
    <div class="pick-row">
      <button class="chip ${d.src === 'mine' ? 'on' : ''}" data-pick-src="mine" ${S.regionMode === 'all' ? 'disabled' : ''}>我的考区（国考 + 广东）</button>
      <button class="chip ${d.src === 'all' ? 'on' : ''}" data-pick-src="all">全部考区</button>
    </div>`}

    ${tagRow}

    <div class="pick-label">年份</div>
    <div class="pick-row">
      <button class="chip ${d.year === 'all' ? 'on' : ''}" data-pick-year="all">全部</button>
      ${years.map(y => `<button class="chip ${d.year === y ? 'on' : ''}" data-pick-year="${y}">${y}</button>`).join('')}
    </div>

    <div class="pick-label">题量</div>
    <div class="pick-row">${[10, 20, 40].map(c => `<button class="chip ${d.count === c ? 'on' : ''}" data-pick-count="${c}">${c} 题</button>`).join('')}</div>

    <div class="count-note" style="margin-top:26px">当前范围：${d.src === 'all' ? '全部考区' : '国考 + 广东省考 + 广州/深圳'} · ${MOD_NAME[d.code]}${d.tag !== 'all' ? ' · ' + d.tag : ''}${d.year === 'all' ? '' : ' · ' + d.year + ' 年'} · ${d.tag !== 'all' ? num(tagTotal) + ' 题' : pool.length + ' 套卷 · 共 ' + num(total) + ' 题'}</div>
    <button class="launch" id="start-drill">
      <span><b>开始抽题</b><br><span>随机 ${Math.min(d.count, d.tag !== 'all' ? tagTotal : total)} 题 · 即时判分</span></span><span class="arrow">→</span>
    </button>
  </div>`;
}

/* ---------------- paper picker ---------------- */
function viewPapers() {
  const f = S.papersFilter;
  const years = availableYears();
  let list = S.groups.filter(g => tierMatch(g, f.tier));
  if (f.year !== 'all') list = list.filter(g => g.year === f.year);
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(g => g.name.toLowerCase().includes(q)); }
  const shown = list.slice(0, 120);
  const recent = S.exams.slice(0, 3);
  const trend = S.exams.slice(0, 10).slice().reverse().map(x => x.score);
  return `<div class="wrap">
    <div class="eyebrow">套卷模考</div>
    <h1 class="page">整套真题，六个模块连做</h1>
    <p class="sub">选一套卷子，按 政治理论 → 常识 → 言语 → 数量 → 判断 → 资料 的顺序成卷。限时 120 分钟，交卷后才判分、出解析。网友回忆版会有少量缺题或答案缺失，已在题面标出。</p>

    ${S.exams.length ? `<div class="section-h"><h2>最近模考</h2><span class="count-note">共 ${S.exams.length} 次 · 最高 ${Math.max(...S.exams.map(x => x.score))} 分</span></div>
      ${trend.length > 1 ? `<div class="trend-box" style="margin-bottom:12px">${sparkline(trend)}</div>` : ''}
      <div class="paper-list" style="margin-bottom:28px">
        ${recent.map(x => `<button class="paper-row" data-exam-ts="${x.ts}">
          <span class="yr" style="width:58px">${x.score} 分</span>
          <span class="nm">${esc(x.title)}</span>
          <span class="nq">${x.right}/${x.n}</span>
          <span class="nq" style="width:56px">${mmss(x.dur)}</span></button>`).join('')}
      </div>` : ''}

    ${(S.session && S.session.mode === 'exam') ? `<button class="resume-paper" data-resume-paper>
      继续「${esc(S.session.paper || S.session.title)}」 · 已答 ${Object.keys(S.session.answers).length}/${S.session.items.length}
      <span>回到卷面 →</span></button>` : ''}

    <div class="filterbar">
      <input class="search-input" id="paper-q" placeholder="搜试卷名，如「2024 国考」「江苏」「联考」" value="${esc(f.q)}">
    </div>
    <div class="pick-row">
      ${[['mine', '我的考区'], ['gk', '国考'], ['gd', '广东省考'], ['gzsz', '广州·深圳'], ['xd', '广东选调'], ['all', '全部考区']].filter(([k]) => !(isScopeOnly() && k === 'all')).map(([k, l]) =>
        `<button class="chip ${f.tier === k ? 'on' : ''}" data-pick-tier="${k}">${l}</button>`).join('')}
    </div>
    <div class="pick-row">
      <button class="chip ${f.year === 'all' ? 'on' : ''}" data-pick-pyear="all">全部年份</button>
      ${years.map(y => `<button class="chip ${f.year === y ? 'on' : ''}" data-pick-pyear="${y}">${y}</button>`).join('')}
    </div>
    <div class="count-note" style="margin-bottom:10px">${list.length} 套卷${f.tier === 'mine' ? '（国考 + 广东省考 + 广州/深圳）' : ''}${list.length > shown.length ? `（显示前 ${shown.length} 套，用搜索缩小范围）` : ''}</div>
    <div class="paper-list">${shown.map(paperRow).join('')}</div>
  </div>`;
}

/* ---------------- practice ---------------- */
function startSession(items, title, sub, opts = {}) {
  S.session = {
    items, title, sub,
    idx: 0,
    answers: {},
    pending: [],
    t0: Date.now(),
    elapsed: 0,
    mode: opts.mode || 'practice',
    limit: opts.limit || 0,
    paper: opts.paper || '',
    year: opts.year || '',
    tag: opts.tag || '',
  };
  S.pending = [];
  S.view = 'practice';
  updateNav();
  render();
  startTimer();
  persistLast();
}

function startTimer(offset = 0) {
  stopTimer();
  const t0 = Date.now() - offset * 1000;
  const s = S.session;
  S.timer = setInterval(() => {
    S.elapsed = Math.floor((Date.now() - t0) / 1000);
    const el = $('#timer');
    if (!el) return;
    if (s && s.limit) {
      const left = Math.max(0, s.limit - S.elapsed);
      el.textContent = mmss(left);
      el.classList.toggle('warn', left <= 600);
      if (left <= 0) { stopTimer(); toast('时间到，自动交卷'); finish(true); }
    } else {
      el.textContent = mmss(S.elapsed);
    }
  }, 1000);
}
function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }
function mmss(s) {
  s = Math.max(0, Math.floor(s || 0));
  const pad = n => String(n).padStart(2, '0');
  if (s >= 3600) return Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
}

function persistLast() {
  const s = S.session;
  if (!s) return;
  const done = Object.keys(s.answers).length;
  S.last = {
    title: s.title, total: s.items.length, done, idx: s.idx, year: s.year, at: Date.now(),
    items: s.items.map(i => ({ pid: i.pid, id: i.q.id })),
    answers: s.answers,
  };
  store.set('last', S.last);
}

async function startDrillRun() {
  const d = S.drill;
  const target = d.count;
  const items = [];

  // 按考点抽题：优先从该考点密度最高的卷里取
  if (d.tag !== 'all' && S.tags) {
    const t = S.tags.find(x => x.tag === d.tag);
    if (t) {
      let cand = t.papers;
      if (d.src !== 'all') {
        const ok = new Set(S.papers.filter(p => GD_SCOPE.has(tierOf(p))).map(p => p.id));
        cand = cand.filter(([pid]) => ok.has(pid));
      }
      if (d.year !== 'all') {
        const keep = new Set(S.papers.filter(p => p.year === d.year && p.code === t.code).map(p => p.id));
        cand = cand.filter(([pid]) => keep.has(pid));
      }
      if (!cand.length) return toast('这个范围里没有该考点的题');
      for (const [pid] of shuffle(cand.slice(0, Math.min(cand.length, 40)))) {
        if (items.length >= target) break;
        const c = await loadChunk(pid);
        const qs = shuffle(c.qs.filter(q => q.opts && q.opts.length &&
          ((S.qtag && S.qtag[pid + '|' + q.id]) || q.t || '未标注') === d.tag));
        for (const q of qs) {
          if (items.length >= target) break;
          items.push({ q, pid, paper: c.paper.name, mod: c.paper.code });
        }
      }
      if (!items.length) return toast('没抽到题，换个考点试试');
      return startSession(shuffle(items), `专项练习 · ${d.tag}`,
        `${MOD_NAME[t.code]} · ${d.year === 'all' ? '全年度' : d.year + ' 年'} · ${items.length} 题`,
        { year: d.year === 'all' ? '' : d.year, tag: d.tag });
    }
  }

  const pool = S.papers.filter(p => p.code === d.code
    && (d.src === 'all' || GD_SCOPE.has(tierOf(p)))
    && (d.year === 'all' || p.year === d.year));
  if (!pool.length) return toast('这个范围里没有题');
  const total = Math.min(target, pool.reduce((a, b) => a + b.n, 0));
  const picked = shuffle(pool.slice()).slice(0, Math.min(pool.length, Math.ceil(total / 4) + 2));
  for (const p of picked) {
    const c = await loadChunk(p.id);
    const qs = shuffle(c.qs.filter(q => q.opts && q.opts.length).slice());
    for (const q of qs) {
      if (items.length >= total) break;
      items.push({ q, pid: p.id, paper: p.name, mod: p.code });
    }
    if (items.length >= total) break;
  }
  startSession(shuffle(items), `专项练习 · ${MOD_NAME[d.code]}`, `${d.year === 'all' ? '全年度' : d.year + ' 年'} · ${items.length} 题`, { year: d.year === 'all' ? '' : d.year });
}

async function startPaper(g) {
  toast('正在组卷…');
  const items = [];
  for (const m of MODULES) {
    const pid = g.mods[m.code];
    if (!pid) continue;
    const c = await loadChunk(pid);
    for (const q of c.qs) if (q.opts && q.opts.length) items.push({ q, pid, paper: g.name, mod: m.code });
  }
  if (!items.length) return toast('这套卷没有可用题目');
  S.session = {
    items, title: g.name, sub: `${g.region || ''} · ${g.year} · ${items.length} 题`,
    idx: 0, answers: {}, pending: [], pendingMulti: {},
    t0: 0, elapsed: 0,
    mode: 'exam', limit: 7200, paper: g.name, year: g.year, tag: '',
    started: false,
  };
  S.view = 'paper';
  S.last = null; store.set('last', null);
  updateNav();
  render();
}

function startTagDrill(tag) {
  const meta = (S.tags || []).find(x => x.tag === tag);
  if (meta) S.drill.code = meta.code;
  S.drill.tag = tag;
  S.drill.year = 'all';
  S.drill.count = 20;
  go('drill');
  startDrillRun();
}

async function startWrongIds(list) {  if (!list || !list.length) return toast('这套卷没有错题');
  const byPid = new Map();
  for (const w of list) {
    if (!byPid.has(w.pid)) byPid.set(w.pid, new Set());
    byPid.get(w.pid).add(w.id);
  }
  const items = [];
  for (const [pid, ids] of byPid) {
    const c = await loadChunk(pid);
    for (const q of c.qs) if (ids.has(q.id)) items.push({ q, pid, paper: c.paper.name, mod: c.paper.code });
  }
  if (!items.length) return toast('题目数据已失效');
  startSession(items, '错题重做 · 本卷', items.length + ' 题');
}

async function startWrongRun() {
  const list = S.wrongTab === 'wrong' ? S.wrong : S.fav;
  if (!list.length) return toast('这里还是空的');
  const byPid = new Map();
  for (const w of list) {
    if (!byPid.has(w.pid)) byPid.set(w.pid, new Set());
    byPid.get(w.pid).add(w.id);
  }
  const items = [];
  for (const [pid, ids] of byPid) {
    const c = await loadChunk(pid);
    for (const q of c.qs) if (ids.has(q.id)) items.push({ q, pid, paper: c.paper.name, mod: c.paper.code });
  }
  if (!items.length) return toast('题目数据已失效，可能题库更新过');
  startSession(items, S.wrongTab === 'wrong' ? '错题重做' : '收藏重做', `${items.length} 题`);
}

async function browseAt(pid, qid) {
  const c = await loadChunk(pid);
  const items = c.qs.filter(q => q.opts && q.opts.length).map(q => ({ q, pid, paper: c.paper.name, mod: c.paper.code }));
  const i = items.findIndex(x => x.q.id === qid);
  startSession(items, c.paper.name, `${c.paper.region} · ${c.paper.year} · ${MOD_NAME[c.paper.code]}`, { year: c.paper.year });
  if (i > 0) { S.session.idx = i; render(); }
}

function viewPractice() {
  const s = S.session;
  if (!s) return `<div class="wrap"><div class="empty"><b>没有正在进行的练习</b><p>回「专项练习」开一组。</p></div></div>`;
  const item = s.items[s.idx];
  const q = item.q;
  const ans = s.answers[s.idx];
  const chunk = S.chunk.get(item.pid);
  const mat = q.mat && chunk ? chunk.mats[q.mat] : null;
  const multi = q.ans && q.ans.length > 1 && q.ans !== '?' && !/^[TF]$/.test(q.ans);
  const isFav = S.fav.some(f => f.id === q.id);
  const answeredCount = Object.keys(s.answers).length;
  const inferred = S.qtag && S.qtag[item.pid + '|' + q.id];
  const shownTag = inferred || q.t;

  const exam = s.mode === 'exam';
  const optHTML = q.opts.map(o => {
    let cls = 'opt';
    if (ans && !exam) {
      const correct = q.ans.includes(o.k) || (q.ans === '?' && o.c);
      if (correct) cls += ' correct';
      else if (ans.pick.includes(o.k)) cls += ' wrong';
    } else if (ans && exam) {
      if (ans.pick.includes(o.k)) cls += ' picked';
    } else if (S.pending.includes(o.k)) cls += ' picked';
    return `<button class="${cls}" data-opt="${o.k}" ${ans && !exam ? 'disabled' : ''}>
      <span class="k">${o.k}</span><span class="v">${o.v || '<span class="muted">（空）</span>'}</span></button>`;
  }).join('');

  const judge = q.ans === '?' ? null : (ans ? ans.ok : null);
  let fb = '';
  if (exam) {
    if (ans) fb = `<p class="exam-hint">已作答（${esc(ans.pick.join('') || '空')}）。模考模式不显示对错，交卷后统一看解析，可以改答案。</p>`;
  } else if (ans) {
    fb = `<div class="feedback">
      <div class="stamp ${judge ? 'ok' : ''}">${judge == null ? '?' : judge ? '对' : '错'}<span class="sub">${judge == null ? 'NO-KEY' : judge ? 'CORRECT' : 'WRONG'}</span></div>
      <div class="fb-body">
        <p class="fb-line">答案 <b>${esc(answerLabel(q))}</b> ${judge == null ? '<span class="muted">题库缺答案，按官方解析自评</span>' : judge ? '<span style="color:var(--ok)">答对了</span>' : `<span style="color:var(--red)">你选了 ${esc(ans.pick.join('') || '空')}</span>`}
          <span class="spacer"></span>
          <button class="icon-btn ${isFav ? 'on' : ''}" data-fav="${q.id}">${isFav ? '★ 已收藏' : '☆ 收藏'}</button>
        </p>
        <div class="explain"><span class="lab">官方解析</span><div class="body">${q.exp || '<span class="muted">题库未提供解析</span>'}</div></div>
      </div></div>`;
  } else if (multi) {
    fb = `<div class="feedback" style="border:0;padding-top:0;margin-top:-6px">
      <div class="fb-body"><p class="fb-line">多选题 · 选完点「确认」，共 ${q.opts.length} 个选项<span class="spacer"></span>
      <button class="btn primary" data-confirm ${S.pending.length ? '' : 'disabled'}>确认选择</button></p></div></div>`;
  }

  const timerText = s.limit ? mmss(Math.max(0, s.limit - S.elapsed)) : mmss(S.elapsed);
  const minLeft = s.limit ? s.limit - S.elapsed : 9999;

  return `<div class="wrap">
    <div class="q-head">
      <span class="crumb"><b>${esc(s.title)}</b>${s.paper ? ' · ' + esc(MOD_NAME[item.mod] || '') : ''}</span>
      <div class="q-tools">
        ${exam ? '<span class="q-type exam-badge">模考</span>' : ''}
        <button class="icon-btn" id="sheet-toggle">答题卡 · ${answeredCount}/${s.items.length}</button>
        <span class="q-prog">${String(s.idx + 1).padStart(2, '0')} / ${s.items.length}</span>
        <span class="timer ${minLeft <= 600 ? 'warn' : ''}" id="timer">${timerText}</span>
      </div>
    </div>

    <div class="q-progress"><i style="width:${s.items.length ? Math.round(answeredCount / s.items.length * 100) : 0}%"></i></div>

    ${mat ? `<div class="mat-wrap"><div class="material" id="material"><span class="mat-tag">材料 ${esc(q.mat)}</span>${mat}</div><button class="mat-toggle" id="mat-toggle">展开全部材料 ↓</button></div>` : ''}

    <div class="q-meta">
      <span class="q-num">第 ${q.n} 题</span>
      ${shownTag ? `<button class="q-type tag-btn" data-tag-jump="${esc(dispTag(shownTag))}" title="只练这个考点">${esc(dispTag(shownTag))}${inferred ? '<i class="infer">推断</i>' : ''}</button>` : ''}
      <span class="q-id">qid ${esc(q.id)}</span>
    </div>
    <div class="stem">${q.stem || '<span class="muted">（题干为空）</span>'}</div>

    <div class="opts">${optHTML}</div>
    ${fb}

    <div class="pager ${ans && !exam ? 'stick' : ''}">
      <button class="btn ghost" data-prev ${s.idx === 0 ? 'disabled' : ''}>← 上一题</button>
      <span class="spacer"></span>
      ${!ans && !exam ? `<button class="btn ghost" data-reveal>看答案</button>` : ''}
      ${exam
        ? `<button class="btn ghost" data-next>${s.idx === s.items.length - 1 ? '最后一题' : '下一题 →'}</button>
           <button class="btn primary" data-finish>交卷</button>`
        : `<button class="btn ghost" data-finish>交卷</button>
           <button class="btn primary" data-next>${s.idx === s.items.length - 1 ? '完成' : '下一题 →'}</button>`}
    </div>
    <div style="margin-top:14px;text-align:right" class="muted">键盘：A/B/C/D 选择 · ← → 翻题 · Enter 下一题 · F 收藏${exam ? ' · 限时 120 分钟，时间到自动交卷' : ''}</div>
  </div>`;
}

function afterPractice() {
  const s = S.session;
  if (!s) return;
  document.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => pick(b.dataset.opt));
  const prev = document.querySelector('[data-prev]'); if (prev) prev.onclick = () => jump(s.idx - 1);
  const next = document.querySelector('[data-next]'); if (next) next.onclick = () => {
    if (s.idx === s.items.length - 1) {
      if (s.mode === 'exam') { toast('已经是最后一题，点「交卷」结算'); return; }
      finish();
    } else jump(s.idx + 1);
  };
  const conf = document.querySelector('[data-confirm]'); if (conf) conf.onclick = () => answer();
  const rev = document.querySelector('[data-reveal]'); if (rev) rev.onclick = () => reveal();
  const fin = document.querySelector('[data-finish]'); if (fin) fin.onclick = () => finish();
  const fav = document.querySelector('[data-fav]'); if (fav) fav.onclick = () => toggleFav(fav.dataset.fav);
  const st = document.querySelector('#sheet-toggle'); if (st) st.onclick = () => $('#sheet').classList.toggle('open');
  const mat = document.querySelector('#material');
  if (mat) {
    const tg = document.querySelector('#mat-toggle');
    if (tg) {
      if (mat.scrollHeight <= 330) tg.style.display = 'none';
      let open = false;
      tg.onclick = () => {
        open = !open;
        mat.style.maxHeight = open ? 'none' : '340px';
        tg.textContent = open ? '收起材料 ↑' : '展开全部材料 ↓';
      };
    }
  }
}

/* ---------------- 整卷平铺（真题模考） ---------------- */
function paperQuestionHTML(it, i) {
  const q = it.q, s = S.session;
  const a = s.answers[i];
  const multi = q.ans && q.ans.length > 1 && q.ans !== '?' && !/^[TF]$/.test(q.ans);
  const inferred = S.qtag && S.qtag[it.pid + '|' + q.id];
  const tag = inferred || q.t || '';
  const opts = q.opts.map(o => {
    const on = a && a.pick.includes(o.k);
    return `<button class="opt ${on ? 'picked' : ''}" data-paper-opt="${o.k}" data-qi="${i}" ${s.started ? '' : 'disabled'}>
      <span class="k">${o.k}</span><span class="v">${o.v || '<span class="muted">（空）</span>'}</span></button>`;
  }).join('');
  return `<section class="pq" id="pq-${i}" data-qi="${i}">
    <div class="pq-head"><span class="pq-num">${i + 1}</span>${tag ? `<span class="q-type">${esc(dispTag(tag))}${inferred ? '<i class="infer">推断</i>' : ''}</span>` : ''}</div>
    <div class="stem">${q.stem || '<span class="muted">（题干为空）</span>'}</div>
    <div class="opts">${opts}</div>
    ${multi ? `<button class="pq-confirm" data-confirm-qi="${i}">确认选择（多选）</button>` : ''}
  </section>`;
}

function viewPaper() {
  const s = S.session;
  if (!s) return `<div class="wrap"><div class="empty"><b>没有正在进行的试卷</b><p>去「套卷模考」挑一套。</p></div></div>`;
  const answered = Object.keys(s.answers).length;
  const n = s.items.length;
  const matSeen = new Set();
  let body = '';
  s.items.forEach((it, i) => {
    const q = it.q;
    const chunk = S.chunk.get(it.pid);
    const mat = q.mat && chunk ? chunk.mats[q.mat] : null;
    const key = it.pid + ':' + q.mat;
    if (mat && !matSeen.has(key)) {
      matSeen.add(key);
      body += `<div class="paper-mat"><span class="paper-mat-tag">材料 ${esc(q.mat)}</span>${mat}</div>`;
    }
    body += paperQuestionHTML(it, i);
  });
  const title = s.paper || s.title;
  return `<div class="wrap paper-wrap">
    <div class="paper-intro">
      <div class="eyebrow">整卷模考 · ${esc(s.sub || '')}</div>
      <h1 class="paper-title">${esc(title)}</h1>
      <p class="paper-hint">${s.started ? '答题中。右侧点题号可跳题，交卷后统一判分。' : '这是整卷预览：可以先上下翻一遍卷面，右侧题号可跳转。点「开始做题」后计时开始、选项才可以点。'}</p>
    </div>
    <div class="paper-bar">
      <span class="pb-title">${esc(s.sub || '')}</span>
      <span class="pb-prog" id="paper-progress">已答 ${answered}/${n}</span>
      ${s.started
        ? `<span class="timer" id="timer">${mmss(Math.max(0, s.limit - s.elapsed))}</span>
           <button class="btn primary" data-submit-paper>交卷</button>`
        : `<button class="btn primary" data-start-exam>开始做题 · 120 分钟</button>`}
      <button class="icon-btn" id="sheet-toggle">答题卡</button>
    </div>
    <div class="paper-body ${s.started ? '' : 'locked'}">${body}</div>
    <div class="paper-end">${s.started ? '<button class="btn primary" data-submit-paper>交卷，看成绩</button>' : ''}</div>
  </div>`;
}

function paperRecord(i, pick) {
  const s = S.session, q = s.items[i].q;
  const ok = q.ans === '?' ? null : pick.slice().sort().join('') === q.ans.split('').sort().join('');
  s.answers[i] = { pick, ok };
  const cell = document.querySelector(`.cell[data-cell="${i}"]`);
  if (cell) cell.classList.add('done');
  const prog = document.querySelector('#paper-progress');
  if (prog) prog.textContent = `已答 ${Object.keys(s.answers).length}/${s.items.length}`;
  markSheetCurrent();
}

function paperSelect(i, k) {
  const s = S.session; if (!s) return;
  if (!s.started) return toast('先点「开始做题」');
  const q = s.items[i].q;
  const multi = q.ans && q.ans.length > 1 && q.ans !== '?' && !/^[TF]$/.test(q.ans);
  const sec = document.getElementById('pq-' + i);
  if (!sec) return;
  if (multi) {
    const set = s.pendingMulti[i] || (s.pendingMulti[i] = []);
    const at = set.indexOf(k);
    if (at >= 0) set.splice(at, 1); else set.push(k);
    sec.querySelectorAll('.opt').forEach(b => b.classList.toggle('picked', set.includes(b.dataset.paperOpt)));
    return;
  }
  sec.querySelectorAll('.opt').forEach(b => b.classList.toggle('picked', b.dataset.paperOpt === k));
  paperRecord(i, [k]);
}

function paperConfirm(i) {
  const set = (S.session.pendingMulti[i] || []).slice().sort();
  if (!set.length) return toast('先选至少一个选项');
  paperRecord(i, set);
}

function markSheetCurrent() {
  const s = S.session; if (!s) return;
  document.querySelectorAll('#sheet-grid .cell').forEach(c => c.classList.toggle('cur', +c.dataset.cell === s.idx));
}

function scrollToQ(i) {
  const s = S.session; if (!s) return;
  const el = document.getElementById('pq-' + i);
  if (!el) return;
  const main = $('#main');
  s.idx = i;
  markSheetCurrent();
  cancelPaperScroll();

  const start = main.scrollTop;
  const targetOf = () => Math.max(0, el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 88);
  const first = targetOf();
  const dist = first - start;
  if (Math.abs(dist) < 4) { main.scrollTop = first; return; }
  const dur = Math.min(680, Math.max(240, Math.abs(dist) * 0.28));
  const t0 = performance.now();
  main.classList.add('scrolling');

  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    main.scrollTop = start + (targetOf() - start) * e;
    if (p < 1) {
      paperScrollRAF = requestAnimationFrame(step);
    } else {
      paperScrollRAF = 0;
      main.classList.remove('scrolling');
      const fix = targetOf();
      if (Math.abs(fix - main.scrollTop) > 8) main.scrollTop = fix;
      cachePaperOffsets();
    }
  };
  paperScrollRAF = requestAnimationFrame(step);
  $('#sheet').classList.remove('open');
}

let paperScrollRAF = 0;
function cancelPaperScroll() {
  if (paperScrollRAF) { cancelAnimationFrame(paperScrollRAF); paperScrollRAF = 0; }
  const main = $('#main');
  if (main) main.classList.remove('scrolling');
}

let paperOffsets = [];
function cachePaperOffsets() {
  const main = $('#main');
  if (!main) return;
  const mt = main.getBoundingClientRect().top;
  paperOffsets = [...main.querySelectorAll('.pq')].map(el => el.getBoundingClientRect().top - mt + main.scrollTop);
}

function afterPaper() {
  const s = S.session; if (!s) return;
  const startBtn = document.querySelector('[data-start-exam]');
  if (startBtn) startBtn.onclick = () => {
    s.started = true;
    s.t0 = Date.now();
    s.elapsed = 0;
    startTimer();
    render();
    setTimeout(() => scrollToQ(0), 60);
  };
  document.querySelectorAll('[data-submit-paper]').forEach(b => b.onclick = () => finish());
  document.querySelectorAll('[data-paper-opt]').forEach(b => b.onclick = () => paperSelect(+b.dataset.qi, b.dataset.paperOpt));
  document.querySelectorAll('[data-confirm-qi]').forEach(b => b.onclick = () => paperConfirm(+b.dataset.confirmQi));
  const st = document.querySelector('#sheet-toggle');
  if (st) st.onclick = () => $('#sheet').classList.toggle('open');

  const main = $('#main');
  cachePaperOffsets();
  main.addEventListener('wheel', cancelPaperScroll, { passive: true });
  main.addEventListener('touchstart', cancelPaperScroll, { passive: true });
  main.addEventListener('load', () => setTimeout(cachePaperOffsets, 160), true);
  let lastAt = 0;
  main.onscroll = () => {
    if (paperScrollRAF) return;
    const now = performance.now();
    if (now - lastAt < 90) return;
    lastAt = now;
    if (!paperOffsets.length) return;
    const y = main.scrollTop + 110;
    let lo = 0, hi = paperOffsets.length - 1, cur = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (paperOffsets[mid] <= y) { cur = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (cur !== S.session.idx) { S.session.idx = cur; markSheetCurrent(); }
  };
}

function answerLabel(q) {
  if (!q.ans || q.ans === '?') return '缺失';
  const isJudge = q.opts.length === 2 && /正确|错误/.test(q.opts[0].v + q.opts[1].v);
  if (isJudge) return q.ans === 'A' ? '正确' : '错误';
  return q.ans.split('').join('');
}

function pick(k) {
  const s = S.session; if (!s) return;
  const item = s.items[s.idx], q = item.q;
  const exam = s.mode === 'exam';
  if (s.answers[s.idx] && !exam) return;
  const multi = q.ans && q.ans.length > 1 && q.ans !== '?' && !/^[TF]$/.test(q.ans);
  if (multi) {
    const i = S.pending.indexOf(k);
    if (i >= 0) S.pending.splice(i, 1); else S.pending.push(k);
    render();
    return;
  }
  S.pending = [k];
  answer();
}

function answer() {
  const s = S.session; if (!s) return;
  const item = s.items[s.idx], q = item.q;
  const exam = s.mode === 'exam';
  if (s.answers[s.idx] && !exam) return;
  const pickSet = S.pending.slice().sort();
  const keySet = (q.ans || '').split('').sort();
  const ok = q.ans === '?' ? null : pickSet.join('') === keySet.join('');

  if (exam) {
    // 模考：只记答案，不判分、不显示对错，交卷时统一结算
    s.answers[s.idx] = { pick: pickSet, ok };
    S.pending = [];
    persistLast();
    render();
    return;
  }

  s.answers[s.idx] = { pick: pickSet, ok };
  S.stats.done++;
  if (ok) S.stats.ok++;
  const bm = S.stats.byMod[item.mod] || (S.stats.byMod[item.mod] = { d: 0, ok: 0 });
  bm.d++; if (ok) bm.ok++;
  const tag = tagOf(item);
  S.stats.byTag = S.stats.byTag || {};
  const bt = S.stats.byTag[tag] || (S.stats.byTag[tag] = { d: 0, ok: 0 });
  bt.d++; if (ok) bt.ok++;
  store.set('stats', S.stats);
  if (ok === false) pushWrong(item, q);
  S.pending = [];
  S._focus = '.feedback';
  renderFoot();
  persistLast();
  render();
}

function reveal() {
  const s = S.session; if (!s) return;
  if (s.mode === 'exam') return toast('模考模式不能看答案');
  const item = s.items[s.idx], q = item.q;
  if (s.answers[s.idx]) return;
  s.answers[s.idx] = { pick: [], ok: null, revealed: true };
  S.stats.done++;
  const bm = S.stats.byMod[item.mod] || (S.stats.byMod[item.mod] = { d: 0, ok: 0 });
  bm.d++;
  const tag = tagOf(item);
  S.stats.byTag = S.stats.byTag || {};
  const bt = S.stats.byTag[tag] || (S.stats.byTag[tag] = { d: 0, ok: 0 });
  bt.d++;
  store.set('stats', S.stats);
  S._focus = '.feedback';
  renderFoot(); render();
}

function pushWrong(item, q) {
  const exists = S.wrong.find(w => w.id === q.id);
  if (exists) { exists.cnt = (exists.cnt || 1) + 1; exists.ts = Date.now(); }
  else {
    S.wrong.unshift({
      id: q.id, pid: item.pid, mod: item.mod, paper: item.paper, n: q.n,
      ans: q.ans, t: q.t, stem: stripHTML(q.stem).slice(0, 80), ts: Date.now(), cnt: 1,
    });
    if (S.wrong.length > 600) S.wrong.length = 600;
  }
  store.set('wrong', S.wrong);
  updateNav();
}

async function toggleFav(qid) {
  const i = S.fav.findIndex(f => f.id === qid);
  const item = S.session.items[S.session.idx];
  if (i >= 0) { S.fav.splice(i, 1); toast('已取消收藏'); }
  else {
    S.fav.unshift({ id: qid, pid: item.pid, mod: item.mod, paper: item.paper, n: item.q.n, t: item.q.t, stem: stripHTML(item.q.stem).slice(0, 80), ts: Date.now() });
    toast('已收藏');
  }
  store.set('fav', S.fav);
  render();
}

function jump(i) {
  const s = S.session; if (!s) return;
  if (i < 0 || i >= s.items.length) return;
  s.idx = i; S.pending = [];
  render(); persistLast();
  $('#main').scrollTop = 0;
}

async function finish(force) {
  const s = S.session;
  if (!s) return;
  if (s.mode === 'exam') { stopTimer(); return finalizeExam(s, force); }
  stopTimer();
  S.view = 'summary'; updateNav(); render();
  store.set('last', null); S.last = null;
}

/* ---------------- 模考结算 ---------------- */
// 各模块每题权重（国考通用的估算口径），最终按本卷总权重折算成 100 分制
const SCORE_W = { m1: 0.5, m2: 0.5, m3: 0.8, m4: 1, m5: 0.8, m6: 1 };

function finalizeExam(s, force) {
  const n = s.items.length;
  const answered = Object.keys(s.answers).length;
  if (!force && answered < n && !confirm(`还有 ${n - answered} 题未作答，确定交卷？`)) {
    startTimer(S.elapsed);
    return;
  }
  const byMod = {}, byTag = {};
  const wrongIds = [];
  let right = 0, wrong = 0, unknown = 0, earned = 0, totalW = 0;
  s.items.forEach((it, i) => {
    const w = SCORE_W[it.mod] || 1;
    totalW += w;
    const a = s.answers[i];
    const tag = tagOf(it);
    if (a) {
      const mm = byMod[it.mod] || (byMod[it.mod] = { d: 0, ok: 0 });
      mm.d++;
      const bt = byTag[tag] || (byTag[tag] = { d: 0, ok: 0 });
      bt.d++;
      if (a.ok === true) { right++; earned += w; mm.ok++; bt.ok++; }
      else if (a.ok === false) { wrong++; pushWrong(it, it.q); wrongIds.push({ pid: it.pid, id: it.q.id }); }
      else unknown++;
    }
  });
  const score = totalW ? Math.round(earned / totalW * 1000) / 10 : 0;

  // 并入全局统计
  S.stats.done += right + wrong + unknown;
  S.stats.ok += right;
  S.stats.byTag = S.stats.byTag || {};
  for (const [code, v] of Object.entries(byMod)) {
    const g = S.stats.byMod[code] || (S.stats.byMod[code] = { d: 0, ok: 0 });
    g.d += v.d; g.ok += v.ok;
  }
  for (const [tag, v] of Object.entries(byTag)) {
    const g = S.stats.byTag[tag] || (S.stats.byTag[tag] = { d: 0, ok: 0 });
    g.d += v.d; g.ok += v.ok;
  }
  store.set('stats', S.stats);

  const rec = {
    ts: Date.now(), title: s.title, paper: s.paper, n,
    answered, right, wrong, skip: n - answered, unknown,
    score, dur: Math.floor((Date.now() - s.t0) / 1000),
    byMod, byTag, wrongIds,
  };
  S.exams.unshift(rec);
  if (S.exams.length > 30) S.exams.length = 30;
  store.set('exams', S.exams);
  S.examResult = rec;
  S.session = null;
  store.set('last', null); S.last = null;
  renderFoot();
  S.view = 'exam'; updateNav(); render();
}

function sparkline(values, w = 620, h = 96) {
  if (!values.length) return '';
  const n = values.length;
  const step = n > 1 ? (w - 24) / (n - 1) : 0;
  const pts = values.map((v, i) => {
    const x = 12 + i * step;
    const y = h - 12 - (v / 100) * (h - 24);
    return [x, y];
  });
  const poly = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === n - 1 ? 3.4 : 2}" class="${i === n - 1 ? 'hot' : ''}"/>`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="模考成绩趋势">
    <line x1="12" y1="${h - 12}" x2="${w - 12}" y2="${h - 12}" class="axis"/>
    <line x1="12" y1="${h - 12 - (60 / 100) * (h - 24)}" x2="${w - 12}" y2="${h - 12 - (60 / 100) * (h - 24)}" class="axis dash"/>
    <polyline points="${poly}" class="line"/>
    ${dots}
  </svg>`;
}

function viewExam() {
  const r = S.examResult || S.exams[0];
  if (!r) return `<div class="wrap"><div class="empty"><b>还没有模考成绩</b><p>去「套卷模考」挑一套。</p></div></div>`;
  const acc = r.answered ? Math.round(r.right / r.answered * 100) : 0;
  const weak = Object.entries(r.byTag || {}).filter(([, v]) => v.d >= 2 && v.ok / v.d < 0.7)
    .sort((a, b) => a[1].ok / a[1].d - b[1].ok / b[1].d).slice(0, 3);
  const trend = S.exams.slice(0, 10).slice().reverse().map(x => x.score);
  const d = new Date(r.ts);

  return `<div class="wrap">
    <div class="eyebrow">模考成绩单 · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}</div>
    <h1 class="page">${r.score}<span class="score-unit">/ 100 估算分</span></h1>
    <p class="sub">${esc(r.title)} · 用时 ${mmss(r.dur)} · 按模块权重折算（判断/言语 0.8、数量/资料 1.0、常识/政治 0.5），仅用于自我对比。</p>

    <div class="stat-row">
      <div class="stat"><b>${r.right}</b><span>答对</span></div>
      <div class="stat hot"><b>${r.wrong}</b><span>答错</span></div>
      <div class="stat"><b>${r.skip}</b><span>未作答</span></div>
      <div class="stat"><b>${acc}%</b><span>作答正确率</span></div>
    </div>

    <div class="section-h"><h2>分模块</h2><span class="count-note">得分 = 该模块权重 × 答对题数</span></div>
    <div class="paper-list" style="margin-bottom:26px">
      ${MODULES.filter(m => r.byMod[m.code]).map(m => {
        const v = r.byMod[m.code];
        const got = Math.round(v.ok * (SCORE_W[m.code] || 1) * 10) / 10;
        return `<div class="paper-row"><span class="yr" style="width:44px">${v.d} 题</span>
          <span class="nm">${m.name}</span>
          <span class="diag-bar" style="max-width:220px"><i class="diag-fill ${v.ok / v.d < 0.6 ? 'low' : v.ok / v.d < 0.8 ? 'mid' : ''}" style="width:${Math.round(v.ok / v.d * 100)}%"></i></span>
          <span class="nq">${v.ok}/${v.d}</span>
          <span class="nq" style="width:60px">${got} 分</span></div>`;
      }).join('')}
    </div>

    ${weak.length ? `<div class="section-h"><h2>这套卷暴露的弱项</h2></div>
      <div class="diag-cards" style="margin-bottom:26px">${weak.map(([tag, v]) => `<button class="entry" data-tag-drill="${esc(tag)}">
        <h3>${esc(tag)} <span style="font-family:var(--mono);font-size:13px;color:var(--red)">${Math.round(v.ok / v.d * 100)}%</span></h3>
        <p>${v.ok}/${v.d} 题正确 · ${esc(TAG_ADVICE[tag] || '回看方法卡，再刷 20 题。')}</p>
        <span class="go">只刷这一类 →</span></button>`).join('')}</div>` : ''}

    ${trend.length > 1 ? `<div class="section-h"><h2>最近 ${trend.length} 次模考</h2><span class="count-note">纵轴 0—100</span></div>
      <div class="trend-box">${sparkline(trend)}</div>` : ''}

    <div class="entries" style="margin-top:28px">
      <button class="entry" data-redo-exam><h3>重做这套的错题</h3><p>只重做这套卷里错的 ${r.wrong} 道，做对才算过。</p><span class="go">开始 →</span></button>
      <button class="entry" data-nav="papers"><h3>再挑一套</h3><p>换年份或换省份，看看分数稳不稳。</p><span class="go">去选卷 →</span></button>
    </div>
  </div>`;
}

function viewSummary() {
  const s = S.session;
  if (!s) return `<div class="wrap"><div class="empty"><b>没有成绩</b></div></div>`;
  const total = s.items.length;
  const answered = Object.keys(s.answers).length;
  const right = Object.values(s.answers).filter(a => a.ok === true).length;
  const wrong = Object.values(s.answers).filter(a => a.ok === false).length;
  const skip = total - answered;
  const acc = answered ? Math.round(right / answered * 100) : 0;
  const byMod = {};
  s.items.forEach((it, i) => {
    const a = s.answers[i]; if (!a) return;
    const m = byMod[it.mod] || (byMod[it.mod] = { d: 0, ok: 0 });
    m.d++; if (a.ok) m.ok++;
  });
  return `<div class="wrap">
    <div class="eyebrow">本次成绩</div>
    <h1 class="page">${acc}% <span style="font-size:16px;font-family:var(--sans);color:var(--ink-3)">正确率</span></h1>
    <p class="sub">${esc(s.title)} · 用时 ${mmss(Math.floor((Date.now() - s.t0) / 1000))}</p>
    <div class="stat-row">
      <div class="stat"><b>${right}</b><span>答对</span></div>
      <div class="stat hot"><b>${wrong}</b><span>答错</span></div>
      <div class="stat"><b>${skip}</b><span>未作答</span></div>
      <div class="stat"><b>${total}</b><span>总题数</span></div>
    </div>
    ${Object.keys(byMod).length ? `<div class="section-h"><h2>分模块</h2></div>
      <div class="paper-list" style="margin-bottom:26px">${MODULES.filter(m => byMod[m.code]).map(m => {
        const x = byMod[m.code];
        return `<div class="paper-row"><span class="yr"></span><span class="nm">${m.name}</span>
          <span class="nq">${x.ok}/${x.d}</span><span class="nq" style="width:52px">${Math.round(x.ok / x.d * 100)}%</span></div>`;
      }).join('')}</div>` : ''}
    <div class="entries">
      ${wrong ? `<button class="entry" data-redo-wrong><h3>只重做错题</h3><p>把这次错的 ${wrong} 道再刷一遍。</p><span class="go">开始 →</span></button>` : ''}
      <button class="entry" data-nav="home"><h3>回首页</h3><p>看累计数据，换一条路径。</p><span class="go">回去 →</span></button>
    </div>
  </div>`;
}

/* ---------------- answer sheet ---------------- */
function renderSheet() {
  const s = S.session;
  const sheet = $('#sheet');
  if (!s || (S.view !== 'practice' && S.view !== 'paper')) {
    sheet.style.display = 'none';
    document.querySelector('.shell').classList.add('no-sheet');
    return;
  }
  sheet.style.display = '';
  document.querySelector('.shell').classList.remove('no-sheet');
  const answered = Object.keys(s.answers).length;
  const right = Object.values(s.answers).filter(a => a.ok === true).length;
  const exam = s.mode === 'exam';
  $('#sheet-meta').innerHTML = exam
    ? `<span>${answered}/${s.items.length}</span><span>${S.view === 'paper' && !s.started ? '未开始' : '模考中'}</span>`
    : `<span>${answered}/${s.items.length}</span><span>对 ${right}</span>`;
  $('#sheet-grid').innerHTML = s.items.map((it, i) => {
    const a = s.answers[i];
    let cls = 'cell';
    if (a) cls += exam ? ' done' : (a.ok === true ? ' ok' : a.ok === false ? ' no' : ' skip');
    if (i === s.idx) cls += ' cur';
    return `<button class="${cls}" data-cell="${i}">${i + 1}</button>`;
  }).join('');
  $('#sheet-grid').querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
    if (S.view === 'paper') { scrollToQ(Number(b.dataset.cell)); return; }
    jump(Number(b.dataset.cell));
    $('#sheet').classList.remove('open');
  });
  const jumpBtn = $('#sheet-jump');
  if (jumpBtn) jumpBtn.onclick = () => {
    const i = s.items.findIndex((_, k) => !s.answers[k]);
    if (i >= 0) { if (S.view === 'paper') scrollToQ(i); else { jump(i); $('#sheet').classList.remove('open'); } }
    else toast('全部答完了，可以交卷');
  };
  $('#sheet-close').onclick = () => sheet.classList.remove('open');
}

/* ---------------- wrong book ---------------- */
function viewWrong() {
  const tab = S.wrongTab;
  const list = tab === 'wrong' ? S.wrong : S.fav;
  return `<div class="wrap">
    <div class="eyebrow">个人档案</div>
    <h1 class="page">${tab === 'wrong' ? '错题本' : '收藏夹'}</h1>
    <p class="sub">${tab === 'wrong' ? '做错的题自动收进来，按最近出错排序。清掉一道少一道。' : '手标的好题。适合反复看思路，不少解析里藏着通用解法。'}</p>
    <div class="pick-row">
      <button class="chip ${tab === 'wrong' ? 'on' : ''}" data-wtab="wrong">错题 ${S.wrong.length}</button>
      <button class="chip ${tab === 'fav' ? 'on' : ''}" data-wtab="fav">收藏 ${S.fav.length}</button>
    </div>
    ${list.length ? `
      <button class="launch" data-redo><span><b>${tab === 'wrong' ? '重做全部错题' : '看一遍收藏题'}</b><br><span>${list.length} 题 · 按记录顺序</span></span><span class="arrow">→</span></button>
      <div class="paper-list">${list.map(w => `<button class="paper-row" data-goto="${w.pid}|${w.id}">
        <span class="yr">${esc(MOD_SHORT[w.mod] || '')}</span>
        <span class="nm">${esc(w.stem || '')}</span>
        <span class="nq">${w.cnt > 1 ? '×' + w.cnt : ''}</span>
        <span class="nq" style="width:30px;color:var(--red)">${esc(w.ans)}</span></button>`).join('')}</div>
      <div style="margin-top:16px"><button class="btn ghost" data-clear>清空${tab === 'wrong' ? '错题本' : '收藏夹'}</button></div>
    ` : `<div class="empty"><b>${tab === 'wrong' ? '还没有错题' : '还没有收藏'}</b>
      <p>${tab === 'wrong' ? '做错的题会自动出现在这里。' : '做题时点右上角「☆ 收藏」。'}</p></div>`}
  </div>`;
}

/* ---------------- diagnosis ---------------- */
const TAG_ADVICE = {
  '图形推理': '图形题先判"元素关系"再数数量：位置→样式→数量→属性。每天 10 题，限时 40 秒一题。',
  '逻辑判断': '把"如果…那么""只有…才"一律翻译成箭头，再套肯前否后。加强削弱先找论点和论据之间的缺口。',
  '定义判断': '把定义拆成主体/对象/方式/目的/结果五要件，逐项排除，别凭语感。',
  '类比推理': '先看语义，再看逻辑（种属 vs 组成最容易混），最后看语法。两个选项都能造句时比"造句紧密度"。',
  '片段阅读': '先找"总"在哪：首句总起、尾句"因此"收口、对策句是重点。细节题盯偷换概念和绝对表述。',
  '逻辑填空': '不要凭语感选词，先找上下文的呼应（解释/并列/反义），再辨搭配、轻重、色彩、范围。',
  '语句表达': '排序题抓首句特征和指代词捆绑；衔接题抓话题一致，别选引入新概念的选项。',
  '资料分析': '先把"找数"练快：先看问法，再定位材料，最后套公式。单位（万/亿）和同比/环比是最大失分点。',
  '增长': '增长率、基期、增长量、间隔增长率、混合增长率五条公式要能双向推导，注意"下降"时 r 取负。',
  '比重': '两期比重差一定小于 |a−b|，选项里大于它的直接排除；先判升降再看数值。',
  '综合': '综合题是"公式链"：先把问题拆成两步（先求什么、再求什么），再回材料找中间量。',
  '人文常识': '人文占常识近六成：诗词、诸子、历史事件、传统节日。按主题整理，别零散背。',
  '科技常识': '航天、新能源、生物、生活理化是高频；记"原理"比记结论耐用。',
  '法律常识': '宪法（国家机构）、民法典（合同/侵权/婚姻继承）、行政法（处罚/复议/诉讼）三块为主。',
  '新思想': '记"十个明确、十四个坚持、中国式现代化"的骨架，细节题靠排除与官方表述一致性判断。',
  '时事政治': '按"会议—文件—成就"三类整理近一年时政，考前两周集中过一遍。',
  '工程问题': '设总工程量 = 各人时间的最小公倍数，算出效率再列等式；交替合作先算一个循环的量。',
  '行程问题': '相遇看速度和、追及看速度差；往返平均速度是 2v₁v₂/(v₁+v₂)，不是算术平均。',
  '几何问题': '先画图标注，再判"求面积还是求比例"；三角形三边关系、相似比与面积比是高频。',
  '概率问题': '先数样本空间，再看满足条件的情形；分步用乘法、分类用加法，注意"至少"要用正难则反。',
  '排列组合': '相邻捆绑、不相邻插空、相同物品分配用隔板；"至少一个"用总数减去一个都没有。',
  '容斥问题': '两集合 A+B−A∩B；三集合减去两两交集再加回三者交集。画韦恩图比套公式稳。',
  '最值抽屉': '看到"至少…才能保证"就是抽屉原理：最不利情况 +1；看到"最多/最少"先构造极端。',
  '数字推理': '先看差分（一阶、二阶），再看倍数/递推/幂次；分数数列看分子分母各自规律。',
  '年龄问题': '年龄差不变是唯一可靠的锚点，列"现在/几年后"两组式子。',
  '浓度问题': '溶质守恒：加水只增溶液，加盐两者同增；混合用十字交叉。',
  '钟表日历': '星期问题按 7 取余，闰年 366 天（2 月 29 日）；钟表问题算"追及角度"。',
  '比赛问题': '单循环场次 = n(n−1)/2，淘汰赛场次 = n−1；先判断是循环还是淘汰。',
  '周期问题': '找到最小循环周期，用总数除以周期看余数，余数决定落在周期的第几个。',
  '分段计费': '先确定分段点，逐段算再相加；注意"超出部分"只对超出量计价。',
  '统筹优化': '先列出所有可安排方案，再比较总耗时/总费用；"最短路径"从端点往中间推。',
  '计数问题': '整除看数字特性（3/9 看各位和，11 看奇偶位差），余数问题先找周期。',
  '等差数列': '先求首项与公差，再用 aₙ = a₁+(n−1)d、Sₙ = n(a₁+aₙ)/2。',
  '牛吃草': '设每头牛每天吃 1 份，草生长速度 =（多组吃法之差）/（天数之差），再求初始草量。',
};

function diagRows() {
  const byTag = S.stats.byTag || {};
  return Object.entries(byTag).map(([tag, v]) => {
    const meta = (S.tags || []).find(t => t.tag === tag);
    return {
      tag, d: v.d, ok: v.ok, acc: v.d ? v.ok / v.d : 0,
      code: meta ? meta.code : '', module: meta ? meta.module : '未标注',
    };
  }).filter(r => r.d > 0);
}

function viewDiag() {
  if (!S.tags) loadTags();
  const rows = diagRows();
  const totalD = rows.reduce((a, r) => a + r.d, 0);
  const totalOk = rows.reduce((a, r) => a + r.ok, 0);
  const tried = rows.filter(r => r.d >= 3).sort((a, b) => a.acc - b.acc);
  const weak = tried.filter(r => r.acc < 0.7);

  if (!rows.length) {
    return `<div class="wrap">
      <div class="eyebrow">弱项诊断</div>
      <h1 class="page">哪里在漏分</h1>
      <p class="sub">做过题之后，这里会按考点算出你的正确率，指出最该补的三块，并且能一键只刷那一类。</p>
      <div class="empty"><b>还没有数据</b><p>先去做一组专项练习（10 题就够看出苗头）。</p>
        <p style="margin-top:18px"><button class="btn primary" data-nav="drill">去专项练习 →</button></p></div>
    </div>`;
  }

  const modOrder = MODULES.map(m => m.name);
  const grouped = modOrder.map(name => ({
    name,
    list: rows.filter(r => r.module === name).sort((a, b) => a.acc - b.acc),
  })).filter(g => g.list.length);

  const weakCards = weak.slice(0, 3).map(r => `<button class="entry" data-tag-drill="${esc(r.tag)}">
      <h3>${esc(r.tag)} <span style="font-family:var(--mono);font-size:13px;color:var(--red)">${Math.round(r.acc * 100)}%</span></h3>
      <p>${esc(TAG_ADVICE[r.tag] || TAG_ADVICE[r.module] || '回看对应方法卡，再刷 20 题巩固。')}</p>
      <span class="go">只刷这一类 →</span>
    </button>`).join('');

  return `<div class="wrap">
    <div class="eyebrow">弱项诊断 · 样本 ≥3 题的考点才计入</div>
    <h1 class="page">哪里在漏分</h1>
    <p class="sub">按考点统计正确率，比"总分"更能指导下一步。正确率低于 70% 的会被标红，点一行就能只刷这一类题。</p>

    <div class="stat-row">
      <div class="stat"><b>${num(totalD)}</b><span>已做题数</span></div>
      <div class="stat"><b>${totalD ? Math.round(totalOk / totalD * 100) + '%' : '—'}</b><span>整体正确率</span></div>
      <div class="stat"><b>${rows.length}</b><span>已触及考点</span></div>
      <div class="stat hot"><b>${weak.length}</b><span>低于 70%</span></div>
    </div>

    ${weakCards ? `<div class="section-h"><h2>最该先补的</h2><span class="count-note">按正确率升序</span></div>
      <div class="diag-cards" style="margin-bottom:30px">${weakCards}</div>` :
      `<div class="entries" style="margin-bottom:30px"><div class="entry"><h3>暂时没有明显弱项</h3>
        <p>做过的考点正确率都在 70% 以上。可以加大题量（40 题一组）或做整卷模考暴露问题。</p>
        <span class="go">去模考 →</span></div></div>`}

    ${grouped.map(g => `<div class="section-h" id="diag-${esc(g.name)}"><h2>${g.name}</h2><span class="count-note">${g.list.length} 个考点</span></div>
      <div style="margin-bottom:26px">
        ${g.list.map(r => `<button class="diag-row" data-tag-drill="${esc(r.tag)}">
          <span class="diag-name">${esc(r.tag)}</span>
          <span class="diag-bar"><i class="diag-fill ${r.acc < 0.6 ? 'low' : r.acc < 0.8 ? 'mid' : ''}" style="width:${Math.max(2, Math.round(r.acc * 100))}%"></i></span>
          <span class="diag-num">${r.ok}/${r.d} · ${Math.round(r.acc * 100)}%</span>
          <span class="diag-go">刷</span>
        </button>`).join('')}
      </div>`).join('')}

    <div class="count-note" style="margin-top:8px">样本不足 3 题的考点暂不参与诊断；数据存在本机浏览器里。</div>
  </div>`;
}

const CARDS = [
  {
    mod: 'm6', tag: '核心公式', title: '增长率：一切资料分析的底盘', body: `
<h4>四个量，一张网</h4>
<ul>
<li>现期量 A、基期量 B、增长量 M、增长率 r。核心关系：<code>A = B × (1 + r)</code>，<code>M = A − B</code>。</li>
<li>求基期：<code>B = A / (1 + r)</code>；求增长量：<code>M = A × r / (1 + r)</code>。</li>
<li>材料只给 M 和 r 时，<code>B = M / r</code>，先算基期再算其他。</li>
</ul>
<h4>三种常考增长</h4>
<ul>
<li>间隔增长率（隔一年）：<code>r = r₁ + r₂ + r₁r₂</code>，r₁、r₂ 很小乘积可直接忽略。</li>
<li>年均增长率：<code>(1 + r)^n = 末期 / 基期</code>。n 为年份差（2016—2020 是 4 年，不是 5 年）。</li>
<li>混合增长率：整体增速介于两部分之间，且偏向基期量大的一方。</li>
</ul>
<div class="fml">增长量比较速记：r 相近比 A；A 相近比 r；r 大且 A 大，增长量必大。</div>`
  },
  {
    mod: 'm6', tag: '高频考点', title: '比重、倍数、平均数：三条同源公式', body: `
<h4>现期比重</h4>
<div class="fml">比重 = 部分量 A / 整体量 B</div>
<h4>基期比重（最常考变形）</h4>
<div class="fml">基期比重 = (A / B) × (1 + b) / (1 + a)
a = 部分增速，b = 整体增速</div>
<ul><li>判断升降：a &gt; b 则比重上升，a &lt; b 则下降。</li>
<li>两期比重差 = <code>(A/B) × (a − b) / (1 + a)</code>，并且一定小于 <code>|a − b|</code>——选项里大于 |a−b| 的直接排。</li></ul>
<h4>倍数与平均数</h4>
<ul><li>“A 是 B 的几倍” = A/B；“A 比 B 多几倍” = A/B − 1，注意问法。</li>
<li>平均数增长率 = <code>(a − b) / (1 + b)</code>（a 为总量增速，b 为份数增速）。</li></ul>`
  },
  {
    mod: 'm6', tag: '速算', title: '能算对比算对更值钱：四种速算', body: `
<h4>1. 截位直除</h4>
<ul><li>看选项差距：差距 &gt; 10% 保留两位有效数字，&lt; 10% 保留三位。</li>
<li>分子分母同向截位，别一个截一个不截。</li></ul>
<h4>2. 化除为乘</h4>
<div class="fml">1 / (1 + r) ≈ 1 − r（|r| 较小时）
A / (1 + r) ≈ A × (1 − r)</div>
<h4>3. 特征分数（背下来省一半时间）</h4>
<div class="fml">1/6≈16.7%  1/7≈14.3%  1/8=12.5%  1/9≈11.1%  1/11≈9.1%
1/12≈8.3%  1/13≈7.7%  1/14≈7.1%  1/15≈6.7%  1/16=6.25%
1/17≈5.9%  1/18≈5.6%  1/19≈5.3%</div>
<h4>4. 差分比较（两个分数谁大）</h4>
<ul><li>用“差分数”与“小分数”比较：差分数 = (a−c)/(b−d)，若差分数 &gt; 小分数，则大分数 &gt; 小分数。</li></ul>`
  },
  {
    mod: 'm6', tag: '坑位清单', title: '资料分析十个坑，错一次记一条', body: `
<ul>
<li><b>单位</b>：万 / 亿 / 万亿；吨与公斤；公顷与亩。题目问“万亿元”，材料给“亿元”。</li>
<li><b>时间</b>：同比（对去年同期）、环比（对上期）；累计值 vs 当月值。</li>
<li><b>范围</b>：全国 vs 某省；城镇 vs 乡村；规模以上 vs 全部。</li>
<li><b>问法</b>：“增长最快”比的是增长率，“增长最多”比的是增长量。</li>
<li><b>倍数</b>：“是几倍”含本金，“多几倍”不含；翻一番 = 2 倍。</li>
<li><b>百分点</b>：比重、增长率的变化用“百分点”，不是“%”。</li>
<li><b>平均</b>：人均 = 总量/人数，注意人数是常住还是户籍。</li>
<li><b>排序</b>：问“从高到低”，选项顺序反了直接错。</li>
<li><b>缺口/差额</b>：进出口差额 = 出口 − 进口，不是相加。</li>
<li><b>“约”与“超过”</b>：问“超过”时严格大于，临界值要精算一格。</li>
</ul>`
  },
  {
    mod: 'm5', tag: '图形', title: '图形推理：按这个顺序找规律', body: `
<h4>先看图形“像不像”</h4>
<ul>
<li><b>元素相同</b> → 位置规律：平移（方向、步长）、旋转（顺/逆、角度）、翻转（左右/上下）。</li>
<li><b>元素相似</b> → 样式规律：叠加、相减、去同存异、去异存同、黑白运算。</li>
<li><b>元素凌乱</b> → 数量规律：点（交点）、线（笔画、直线曲线）、面（封闭区域）、素（种类、个数）、角。</li>
</ul>
<h4>再看“属性”</h4>
<ul><li>对称性（轴对称/中心对称/对称轴数量与方向）、曲直性、开闭性、凹凸性。</li></ul>
<h4>立体图形</h4>
<ul><li>六面体：相对面（同一直线上隔一个 / Z 字两端）、相邻面公共点、箭头法。</li>
<li>截面图：先看“一刀能切出几条边”，再排除不可能的形状。</li>
<li>三视图：注意“看不见的轮廓线用虚线”。</li></ul>
<div class="fml">九宫格优先横看，其次竖看、S 形、米字；分组题先看两组各自规律。</div>`
  },
  {
    mod: 'm5', tag: '逻辑', title: '翻译推理：把话换成箭头就不会错', body: `
<h4>四组固定翻译</h4>
<div class="fml">如果 A 那么 B          A → B
只有 A 才 B            B → A
除非 A 否则 B          ¬A → B
A 是 B 的必要条件      B → A
A 是 B 的充分条件      A → B</div>
<h4>两条推理规则</h4>
<ul><li>肯前必肯后：A → B，A 真则 B 真。</li>
<li>否后必否前：A → B，B 假则 A 假。（否前、肯后都不必然）</li></ul>
<h4>“且/或”与德摩根</h4>
<div class="fml">¬(A 且 B) = ¬A 或 ¬B
¬(A 或 B) = ¬A 且 ¬B
A 或 B 为真，否定一个可推出另一个</div>
<h4>真假话</h4>
<ul><li>先找矛盾关系（A 与 ¬A、“所有是”与“有的不是”），矛盾双方必一真一假，再套“只有一真/一假”。</li></ul>`
  },
  {
    mod: 'm5', tag: '论证', title: '加强削弱：先找论点，再看缺口', body: `
<h4>三步走</h4>
<ul><li>找论点（结论）→ 找论据 → 看论据到论点缺了哪一环。</li></ul>
<h4>加强的四种打法</h4>
<ul><li>搭桥：把论据和论点之间缺失的概念连起来（最强）。</li>
<li>补充论据：举正面例子、排除他因。</li>
<li>解释机制：说明“为什么”会这样。</li></ul>
<h4>削弱的五种打法</h4>
<ul><li>拆桥：指出论据推不出论点（最常考）。</li>
<li>因果倒置：不是 A 导致 B，而是 B 导致 A。</li>
<li>另有他因：还有 C 在起作用。</li>
<li>举反例：存在不符合结论的样本。</li>
<li>数据陷阱：样本不具代表性、绝对数替代比例。</li></ul>
<div class="fml">“最能削弱”一般选拆桥或因果倒置；“不能削弱”注意选无关项。</div>`
  },
  {
    mod: 'm5', tag: '定义', title: '定义判断与类比推理：拆要件、造句', body: `
<h4>定义判断</h4>
<ul><li>把定义拆成要件：主体、对象、方式、目的、结果、条件。</li>
<li>逐项比对，一项不符即排除；问“属于”时优先排除明显不符要件的选项。</li>
<li>警惕“同构项”：两个选项几乎一样，答案往往在剩下两个里。</li></ul>
<h4>类比推理</h4>
<ul><li>先看语义（近义/反义/象征），再看逻辑（种属/组成/对应/条件），最后看语法（主谓/动宾/偏正）。</li>
<li>种属：A 是 B 的一种；组成：A 是 B 的一部分 —— 这两者最容易混。</li>
<li>对应关系：材料、功能、场所、时间、因果、必要条件。</li>
<li>选项都能造句时，比较“造句的紧密度”，越直接越优。</li></ul>`
  },
  {
    mod: 'm4', tag: '工程', title: '工程问题：赋值是唯一解法', body: `
<h4>三步</h4>
<ul><li>设总工程量 = 各人单独完成时间的<b>最小公倍数</b>。</li>
<li>算出各自效率（总量 / 时间）。</li>
<li>按题意列“合作 / 交替 / 中途离开”的等式。</li></ul>
<div class="fml">例：甲 10 天、乙 15 天，设总量 30，则甲 3、乙 2。
合作：30 ÷ (3+2) = 6 天。</div>
<h4>变式</h4>
<ul><li>效率比：甲:乙 = 3:2 时，时间比 = 2:3。</li>
<li>“甲做 2 天、乙做 3 天完成” → 设总量为 1，列 2a + 3b = 1。</li>
<li>交替合作：先算一个循环的完成量，再看余量与收尾由谁做。</li></ul>`
  },
  {
    mod: 'm4', tag: '行程', title: '行程问题：抓住“和、差、比”', body: `
<div class="fml">相遇：路程和 = (v₁ + v₂) × t
追及：路程差 = (v₁ − v₂) × t
流水：顺流 = 船速 + 水速，逆流 = 船速 − 水速
往返平均速度 = 2v₁v₂ / (v₁ + v₂)（不是算术平均！）</div>
<h4>常用技巧</h4>
<ul><li>比例法：路程一定，速度与时间成反比。</li>
<li>画线段图，标出“同一时刻两人位置”。</li>
<li>环形跑道：同向相遇一次差一圈，反向相遇一次合一圈。</li>
<li>火车过桥：路程 = 车长 + 桥长；错车：路程 = 两车长之和。</li></ul>`
  },
  {
    mod: 'm4', tag: '经济', title: '利润与浓度：一个“十字交叉”通吃', body: `
<div class="fml">利润 = 售价 − 成本
利润率 = 利润 / 成本（折扣按售价算，不打折按标价）
售价 = 成本 × (1 + 利润率) × 折扣</div>
<h4>十字交叉（混合问题万能）</h4>
<div class="fml">两部分平均值为 a、b，混合后为 c：
(a − c) : (c − b) = 第二部分的量 : 第一部分的量</div>
<ul><li>适用：混合利润率、混合浓度、平均分、男女比例、增长率混合。</li>
<li>记忆口诀：差值交叉，比例反着来。</li></ul>
<h4>浓度</h4>
<div class="fml">浓度 = 溶质 / 溶液；加水溶质不变，加盐溶液与溶质同增。</div>`
  },
  {
    mod: 'm4', tag: '计数', title: '排列组合、概率、容斥：三个高频模型', body: `
<div class="fml">排列 A(n,m) = n!/(n−m)!    组合 C(n,m) = n!/(m!(n−m)!)
C(n,m) = C(n,n−m)（对称性最常用）</div>
<h4>四个套路</h4>
<ul><li>捆绑法：要求相邻，先捆成一个整体再内部排列。</li>
<li>插空法：要求不相邻，先排其余，再往空里插。</li>
<li>隔板法：n 个相同物品分给 m 人，每人至少 1 个 → C(n−1, m−1)。</li>
<li>正难则反：至少一个 = 总数 − 一个都没有。</li></ul>
<h4>容斥</h4>
<div class="fml">两集合：|A∪B| = |A| + |B| − |A∩B|
三集合：|A∪B∪C| = Σ|A| − Σ|A∩B| + |A∩B∩C|</div>
<h4>概率</h4>
<ul><li>古典概型 = 满足条件数 / 总数；分步用乘法，分类用加法。</li></ul>`
  },
  {
    mod: 'm4', tag: '技巧', title: '数量关系：不会做也要会选', body: `
<ul>
<li><b>代入排除</b>：年龄、余数、不定方程题，选项直接代，往往 30 秒出答案。</li>
<li><b>数字特性</b>：能被 3 整除看各位和；能被 9 整除看各位和；能被 11 整除看奇偶位差；偶数倍、5 的倍数看尾数。</li>
<li><b>奇偶性</b>：和差同奇偶；两个数之和为奇数则一奇一偶。</li>
<li><b>比例法</b>：出现分数、百分数、比例，优先设“份数”而不是具体值。</li>
<li><b>赋值法</b>：总量、路程、工程量未知且不影响结果时，直接赋值。</li>
<li><b>选项布局</b>：四个选项常有两个“近邻”是干扰，答案多在另两个里——但那两个也要验算。</li>
</ul>
<div class="fml">时间分配建议：数量 15 题别超过 15 分钟，超过就蒙同一个选项，把时间给资料分析。</div>`
  },
  {
    mod: 'm3', tag: '逻辑填空', title: '逻辑填空：先找语境，再辨词义', body: `
<h4>第一步：找呼应</h4>
<ul><li>横线处的词，答案一定在上下文里有“提示”。提示词三类：</li>
<li><b>解释类</b>：即、就是、也就是说、冒号、破折号。</li>
<li><b>并列类</b>：和、及、以及、顿号、句式整齐的并列分句。</li>
<li><b>反义类</b>：但是、反而、却、并非、不同于。</li></ul>
<h4>第二步：辨词义（四看）</h4>
<ul><li>看搭配：固定搭配最硬（“发挥作用”不是“发生作用”）。</li>
<li>看轻重：失望 &lt; 绝望；批评 &lt; 批判。</li>
<li>看色彩：褒贬中性；口语与书面。</li>
<li>看范围：边疆 &gt; 边境；局面 &gt; 形势。</li></ul>
<div class="fml">多空题：先做最有把握的一空，用排除法做减法，别逐空硬推。</div>`
  },
  {
    mod: 'm3', tag: '片段阅读', title: '中心理解：行文脉络只有五种', body: `
<h4>先找“总”在哪</h4>
<ul><li><b>总—分</b>：首句是观点，后面举例/解释。答案 = 首句。</li>
<li><b>分—总</b>：前面铺陈，尾句“因此/可见/所以”收口。答案 = 尾句。</li>
<li><b>总—分—总</b>：首尾呼应，答案 = 首尾共同点。</li>
<li><b>分—分</b>：并列结构，答案要“全面概括”，不能只抓一头。</li>
<li><b>提出问题—分析—解决</b>：答案 = 对策句（“应该/需要/必须”之后）。</li></ul>
<h4>标志词</h4>
<div class="fml">转折：但是、然而、其实、事实上（转折后是重点）
因果：因此、所以、可见、导致（结论是重点）
对策：应该、需要、必须、建议（对策是重点）</div>
<h4>细节判断</h4>
<ul><li>四类错法：偷换概念、无中生有、绝对表述（都、一定、只要）、因果倒置。</li></ul>`
  },
  {
    mod: 'm3', tag: '语句', title: '语句排序与衔接：抓首句、抓指代', body: `
<h4>排序四步</h4>
<ul><li>首句特征：引出话题、下定义、背景铺垫；不能是“这/那/他”指代句，不能是关联词后半句。</li>
<li>找捆绑：指代词（这、其、该）、关联词（但是、因此）、时间顺序。</li>
<li>看尾句：总结句、对策句适合收尾。</li>
<li>代入验证：读一遍，逻辑通不通。</li></ul>
<h4>语句衔接</h4>
<ul><li>横线在段中：承上启下，话题必须前后一致。</li>
<li>横线在段尾：总结前文或提出对策。</li>
<li>横线在段首：总起下文，不能出现后文才有的概念。</li></ul>`
  },
  {
    mod: 'm2', tag: '常识', title: '常识判断：会做的做，不会的猜得有道理', body: `
<h4>高频板块</h4>
<ul><li><b>法律</b>：宪法（国家机构、公民权利）、民法典（合同、侵权、婚姻继承）、行政法（处罚、复议、诉讼）。</li>
<li><b>科技</b>：航天、新能源、生物医药、5G/芯片、生活常识（物理化学原理）。</li>
<li><b>人文</b>：诸子百家、唐诗宋词、四大名著、传统节日、天文历法。</li>
<li><b>地理</b>：中国地形三级阶梯、气候类型、主要河流、世界之最。</li>
<li><b>经济</b>：供求、通胀、货币政策（降准降息）、财政政策。</li></ul>
<h4>猜题五原则</h4>
<ul><li>绝对化表述（“都”“一定”“只有”）多为错。</li>
<li>与题干无关的“正确废话”不选。</li>
<li>两选项互斥，答案常在其中。</li>
<li>涉及国家成就、正面表述的，多对。</li>
<li>完全陌生的领域，选“最常见、最主流”的那个。</li></ul>`
  },
  {
    mod: 'm1', tag: '政治', title: '政治理论：考点其实很集中', body: `
<h4>四块内容</h4>
<ul><li><b>习近平新时代中国特色社会主义思想</b>：核心要义（十个明确、十四个坚持、十三个方面成就）、中国式现代化。</li>
<li><b>二十大及历次全会</b>：主要矛盾、中心任务、重大原则、改革部署。</li>
<li><b>党史</b>：重要会议（一大、遵义、七大、十一届三中全会、二十大）、重要事件时间线。</li>
<li><b>近一年时政</b>：中央经济工作会议、政府工作报告、重要主场外交、科技成就。</li></ul>
<h4>做题方法</h4>
<ul><li>“根本”“核心”“本质”类题目，答案往往是“党的领导”“人民”“发展”。</li>
<li>排除与官方表述冲突的选项（如“以经济建设为中心”被替换成别的）。</li>
<li>时政题记不住就选“最正面、最全面”的表述。</li></ul>`
  },
];

function viewCards() {
  const f = S.cardFilter;
  const list = f === 'all' ? CARDS : CARDS.filter(c => c.mod === f);
  return `<div class="wrap">
    <div class="eyebrow">考点速查</div>
    <h1 class="page">先有方法，再刷题</h1>
    <p class="sub">这是从题库里长出来的一套解法卡片：公式、判断顺序、坑位清单。做完一个模块回来翻一遍，比盲目多刷 50 题有用。</p>
    <div class="pick-row">
      <button class="chip ${f === 'all' ? 'on' : ''}" data-card-filter="all">全部 ${CARDS.length}</button>
      ${MODULES.map(m => { const n = CARDS.filter(c => c.mod === m.code).length; return n ? `<button class="chip ${f === m.code ? 'on' : ''}" data-card-filter="${m.code}">${m.name} ${n}</button>` : ''; }).join('')}
    </div>
    <div class="card-list">${list.map((c, i) => `<div class="kcard" id="card-${CARDS.indexOf(c)}" data-card="${CARDS.indexOf(c)}">
      <button><b>${esc(c.title)}</b><span class="tag">${esc(MOD_SHORT[c.mod])} · ${esc(c.tag)}</span><span class="chev">＋</span></button>
      <div class="kbody">${c.body}</div></div>`).join('')}</div>
  </div>`;
}

/* ---------------- search ---------------- */
function viewSearch() {
  return `<div class="wrap">
    <div class="eyebrow">搜题</div>
    <h1 class="page">按关键词找题</h1>
    <p class="sub">直接搜题干里的词，比如「比重」「村民委员会」「图形推理」。第一次搜索会加载全库索引（约 11 MB），稍等一下。</p>

    <div class="filterbar"><input class="search-input" id="sr-q" placeholder="输入关键词，回车搜索"></div>
    <div id="sr-out"><div class="empty"><b>输入关键词开始</b><p>支持题干文字，暂不支持按答案或解析搜。</p></div></div>
  </div>`;
}

async function doSearch(q) {
  const out = $('#sr-out');
  if (!q) { out.innerHTML = `<div class="empty"><b>输入关键词开始</b></div>`; return; }
  if (!S.searchIdx) {
    out.innerHTML = `<div class="empty"><b><span class="spinner"></span> 正在加载全库索引…</b><p>${num(S.groups.reduce((a, b) => a + b.count, 0))} 道题的题面索引，只需加载一次。</p></div>`;
    const res = await fetch('data/search.json');
    const raw = await res.json();
    S.searchIdx = raw.map(r => ({ id: r[0], mod: r[1], year: r[2], region: r[3], pid: r[4], n: r[5], txt: r[6] }));
  }
  const seen = new Set();
  const hits = [];
  for (const r of S.searchIdx) {
    if (!r.txt.includes(q)) continue;
    const key = r.txt.replace(/\s+/g, '').slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(r);
    if (hits.length >= 40) break;
  }
  if (!hits.length) { out.innerHTML = `<div class="empty"><b>没有匹配的题</b><p>换个更短的词试试。</p></div>`; return; }
  out.innerHTML = `<div class="count-note" style="margin-bottom:8px">${hits.length}${hits.length === 40 ? '+' : ''} 条结果（已按题干去重，最多 40 条）</div>
  <div class="sr-list">${hits.map(h => `<button class="sr" data-goto="${h.pid}|${h.id}">
    <span class="top"><span>${esc(MOD_SHORT[h.mod])}</span><span>${esc(h.year)}</span><span>${esc(h.region)}</span><span>第 ${h.n} 题</span></span>
    <span class="txt">${hl(h.txt, q)}</span></button>`).join('')}</div>`;
}

function hl(text, q) {
  const t = esc(text);
  const e = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return t.replace(new RegExp(e, 'g'), m => `<mark>${m}</mark>`);
}

/* ---------------- events ---------------- */
function onKey(e) {
  if (e.key === 'Escape' && $('#modal') && !$('#modal').hidden) { closeModal(); return; }
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (S.view !== 'practice' && S.view !== 'paper') return;
  const k = e.key.toUpperCase();
  if (/^[A-H]$/.test(k)) {
    if (S.view === 'paper') paperSelect(S.session.idx, k); else pick(k);
    e.preventDefault();
  }
  else if (S.view === 'paper') { /* 平铺模式下翻题用右侧题号或滚动 */ }
  else if (e.key === 'Enter' || e.key === ' ') {
    const s = S.session; if (!s) return;
    if (!s.answers[s.idx]) return;
    if (s.idx === s.items.length - 1) {
      if (s.mode === 'exam') { toast('已经是最后一题，点「交卷」结算'); }
      else finish();
    } else jump(s.idx + 1);
    e.preventDefault();
  }
  else if (e.key === 'ArrowRight') jump(S.session.idx + 1);
  else if (e.key === 'ArrowLeft') jump(S.session.idx - 1);
  else if (k === 'F') toggleFav(S.session.items[S.session.idx].q.id);
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach(b => b.onclick = () => {
    S.view = b.dataset.view; updateNav(); render();
  });

  document.addEventListener('click', async e => {
    if (e.target.id === 'modal') return closeModal();
    const t = e.target.closest('[data-mod], [data-pick-mod], [data-pick-tag], [data-tag-drill], [data-pick-year], [data-pick-count], [data-pick-pyear], [data-start-drill], #start-drill, [data-nav], [data-mod-start], [data-wtab], [data-redo], [data-clear], [data-card-filter], [data-card], [data-goto], [data-resume], [data-redo-wrong], [data-redo-exam], [data-exam-ts], [data-pick-tier], [data-pick-src], [data-scope], [data-font-cycle], [data-about], [data-guide-off], [data-modal-close], [data-clear-data], [data-tag-jump], [data-jump], [data-scroll], [data-search-q], [data-resume-paper], #region-toggle');
    if (!t) return;

    if (t.dataset.fontCycle !== undefined) return cycleFont();
    if (t.dataset.about !== undefined) return openAbout();
    if (t.dataset.guideOff !== undefined) { S.guideOff = true; store.set('guideOff', true); return render(); }
    if (t.dataset.modalClose !== undefined) return closeModal();
    if (t.dataset.clearData !== undefined) {
      if (!confirm('清除本机所有做题记录、错题本和模考成绩？')) return;
      try { Object.keys(localStorage).filter(k => k.indexOf('xct.') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { }
      location.reload(); return;
    }
    if (t.dataset.tagJump) return startTagDrill(t.dataset.tagJump);
    if (t.dataset.jump !== undefined) return jump(Number(t.dataset.jump));
    if (t.dataset.scroll) {
      const el = document.querySelector(t.dataset.scroll);
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        if (el.classList.contains('kcard')) {
          el.classList.add('open');
          const chev = el.querySelector('.chev'); if (chev) chev.textContent = '−';
        }
      }
      return;
    }
    if (t.dataset.resumePaper !== undefined) {
      if (!S.session) return;
      S.view = 'paper'; updateNav(); render();
      if (!S.timer) startTimer(S.session.elapsed || 0);
      return;
    }
    if (t.dataset.searchQ) {
      S.view = 'search'; render();
      const inp = document.querySelector('#sr-q'); if (inp) inp.value = t.dataset.searchQ;
      doSearch(t.dataset.searchQ);
      updateNav();
      return;
    }
    if (t.id === 'region-toggle') {
      S.regionMode = S.regionMode === 'gd' ? 'all' : 'gd';
      store.set('regionMode', S.regionMode);
      S.drill.src = S.regionMode === 'gd' ? 'mine' : 'all';
      S.papersFilter.tier = S.regionMode === 'gd' ? 'mine' : 'all';
      renderRail(); return render();
    }
    if (t.dataset.scope) { S.papersFilter.tier = t.dataset.scope; S.papersFilter.year = 'all'; return go('papers'); }
    if (t.dataset.nav) return go(t.dataset.nav);
    if (t.dataset.modStart) { S.drill.code = t.dataset.modStart; return go('drill'); }
    if (t.dataset.mod && !t.classList.contains('mod-card')) { S.drill.code = t.dataset.mod; return go('drill'); }
    if (t.classList.contains('mod-card') && t.dataset.mod) { S.drill.code = t.dataset.mod; return go('drill'); }
    if (t.dataset.pickMod) { S.drill.code = t.dataset.pickMod; S.drill.tag = 'all'; return render(); }
    if (t.dataset.pickTag) { S.drill.tag = t.dataset.pickTag; return render(); }
    if (t.dataset.tagDrill) return startTagDrill(t.dataset.tagDrill);
    if (t.dataset.pickYear) { S.drill.year = t.dataset.pickYear; return render(); }
    if (t.dataset.pickCount) { S.drill.count = Number(t.dataset.pickCount); return render(); }
    if (t.dataset.pickPyear) { S.papersFilter.year = t.dataset.pickPyear; return render(); }
    if (t.dataset.pickTier) { S.papersFilter.tier = t.dataset.pickTier; return render(); }
    if (t.dataset.pickSrc) { S.drill.src = t.dataset.pickSrc; return render(); }
    if (t.id === 'start-drill') return startDrillRun();
    if (t.dataset.startPaper) { const g = S.groups.find(x => x.name === t.dataset.startPaper); if (g) return startPaper(g); }
    if (t.dataset.wtab) { S.wrongTab = t.dataset.wtab; return render(); }
    if (t.dataset.redo !== undefined) return startWrongRun();
    if (t.dataset.clear !== undefined) {
      if (!confirm('确定清空？此操作不可撤销。')) return;
      if (S.wrongTab === 'wrong') { S.wrong = []; store.set('wrong', S.wrong); } else { S.fav = []; store.set('fav', S.fav); }
      updateNav(); return render();
    }
    if (t.dataset.cardFilter) { S.cardFilter = t.dataset.cardFilter; return render(); }
    if (t.dataset.card !== undefined) {
      const card = t.closest('.kcard');
      card.classList.toggle('open');
      const chev = card.querySelector('.chev');
      if (chev) chev.textContent = card.classList.contains('open') ? '−' : '＋';
      return;
    }
    if (t.dataset.goto) {
      const [pid, qid] = t.dataset.goto.split('|');
      return browseAt(pid, qid);
    }
    if (t.dataset.examTs) { const rec = S.exams.find(x => String(x.ts) === t.dataset.examTs); if (rec) { S.examResult = rec; return go('exam'); } return; }
    if (t.dataset.resume !== undefined) return resumeLast();
    if (t.dataset.redoWrong !== undefined) { S.wrongTab = 'wrong'; return startWrongRun(); }
    if (t.dataset.redoExam !== undefined) return startWrongIds(S.examResult ? S.examResult.wrongIds : []);
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'paper-q') {
      S.papersFilter.q = e.target.value;
      const list = S.groups.filter(g => tierMatch(g, S.papersFilter.tier) && (S.papersFilter.year === 'all' || g.year === S.papersFilter.year) &&
        (!S.papersFilter.q || g.name.toLowerCase().includes(S.papersFilter.q.toLowerCase()))).slice(0, 120);
      const wrap = e.target.closest('.wrap');
      const pl = wrap.querySelector('.paper-list');
      if (pl) pl.innerHTML = list.map(paperRow).join('');
    }
    if (e.target.id === 'sr-q') {
      clearTimeout(window.__srT);
      const q = e.target.value.trim();
      window.__srT = setTimeout(() => doSearch(q), 220);
    }
  });
}

async function resumeLast() {
  const l = S.last;
  if (!l || !l.items) return toast('没有可继续的记录');
  const byPid = new Map();
  for (const it of l.items) {
    if (!byPid.has(it.pid)) byPid.set(it.pid, new Set());
    byPid.get(it.pid).add(it.id);
  }
  const items = [];
  for (const [pid, ids] of byPid) {
    const c = await loadChunk(pid);
    for (const q of c.qs) if (ids.has(q.id)) items.push({ q, pid, paper: c.paper.name, mod: c.paper.code });
  }
  if (!items.length) return toast('记录已失效');
  startSession(items, l.title, '继续上次练习');
  S.session.idx = Math.min(l.idx || 0, items.length - 1);
  S.session.answers = l.answers || {};
  render();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => el.classList.remove('show'), 1800);
}

function stripHTML(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------------- init ---------------- */
bindEvents();
boot();
