(function () {
  var CATEGORIES = [
    { id: 'character', label: '人物', api: '/api/characters', kind: 'object', itemApi: '/api/assets/character/item' },
    { id: 'outfit', label: '服装', api: '/api/assets/outfits', kind: 'list', itemApi: '/api/assets/outfits/item' },
    { id: 'scene', label: '场景', api: '/api/assets/scenes', kind: 'list', itemApi: '/api/assets/scenes/item' },
    { id: 'audio', label: '音频', api: '/api/assets/audios', kind: 'list', itemApi: '/api/assets/audios/item' },
    { id: 'upload', label: '多图参考', api: '/api/assets/uploads', kind: 'list', itemApi: '/api/assets/uploads/item' },
    { id: 'style', label: '风格', api: '/api/styles', kind: 'style' },
    { id: 'history', label: '历史', api: '/api/history', kind: 'history' },
  ];
  var current = 'character';
  var items = [];
  var showDeleted = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function api(url, init) { return fetch(url, Object.assign({ credentials: 'same-origin' }, init)).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.error) || ('请求失败 ' + r.status)); return d; }); }); }

  function category() { return CATEGORIES.find(function (x) { return x.id === current; }); }

  async function load(cat) {
    var c = category();
    items = [];
    var data = await api(c.api);
    if (c.kind === 'object') {
      Object.keys(data || {}).forEach(function (key) {
        var ch = data[key] || {};
        var images = Array.isArray(ch.images) ? ch.images : [];
        var url = images.length ? String(images[0].url || '') : '';
        items.push({ id: key, name: ch.name || key, url: url, meta: '人物', deleted: Boolean(ch.deleted_at) });
      });
    } else if (c.kind === 'style') {
      (Array.isArray(data) ? data : []).forEach(function (s) {
        items.push({ id: s.id, name: s.name || s.id, url: String(s.thumbnail_url || ''), meta: '风格', deleted: Boolean(s.deleted_at), style: true });
      });
    } else if (c.kind === 'history') {
      (Array.isArray(data) ? data : []).forEach(function (h) {
        if (h.type === 'image' && h.image_url) items.push({ id: h.image_url, name: h.script || '历史图片', url: h.image_url, meta: '图片', history: true });
        if (h.type === 'video' && h.video_url) items.push({ id: h.video_url, name: h.script || '历史视频', url: h.video_url, meta: '视频', video: true, history: true });
      });
    } else {
      (Array.isArray(data) ? data : []).forEach(function (it) {
        items.push({ id: it.id, name: it.name || '', url: String(it.url || ''), meta: c.label, deleted: Boolean(it.deleted_at) });
      });
    }
    render();
  }

  function btn(label, cls, onClick) {
    var b = document.createElement('button');
    b.textContent = label;
    b.className = 'a-btn ' + cls;
    b.style.cssText = 'font-size:11px;padding:2px 6px;margin:2px 2px 0 0;cursor:pointer;';
    b.addEventListener('click', function (ev) { ev.stopPropagation(); onClick(); });
    return b;
  }

  function cardHtml(it) {
    var thumb = it.video
      ? '<div class="a-thumb-placeholder">▶</div>'
      : (it.url ? '<img class="a-thumb" src="' + esc(it.url) + '" alt="">' : '<div class="a-thumb-placeholder">无图</div>');
    var actions = '';
    if (!it.history) {
      if (it.deleted) {
        actions = '<div class="a-actions"><button class="a-btn" style="font-size:11px;padding:2px 6px;cursor:pointer;" data-restore="1">恢复</button></div>';
      } else {
        actions = '<div class="a-actions">' +
          (it.style ? '' : '<button class="a-btn" style="font-size:11px;padding:2px 6px;cursor:pointer;" data-rename="1">重命名</button>') +
          '<button class="a-btn" style="font-size:11px;padding:2px 6px;cursor:pointer;" data-delete="1">删除</button>' +
          '</div>';
      }
    }
    return '<div class="a-card' + (it.deleted ? ' a-deleted' : '') + '" data-id="' + esc(it.id) + '" style="' + (it.deleted ? 'opacity:.45;' : '') + '">' +
      thumb + '<div class="a-name">' + esc(it.name) + '</div><div class="a-meta">' + esc(it.meta) + '</div>' + actions + '</div>';
  }

  function render() {
    var q = document.getElementById('search').value.trim().toLowerCase();
    var grid = document.getElementById('grid');
    var list = items.filter(function (it) { return (!it.deleted || showDeleted) && it.name.toLowerCase().indexOf(q) >= 0; });
    grid.innerHTML = list.map(cardHtml).join('') || '<div style="padding:24px;color:#888;font-size:13px">暂无素材' + (showDeleted ? '' : '，可点击右上角「添加素材」') + '</div>';
    grid.querySelectorAll('[data-restore]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.a-card');
        restoreItem(card.getAttribute('data-id')).then(function () { load(current); });
      });
    });
    grid.querySelectorAll('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.a-card');
        if (window.confirm('确定删除该素材吗？（可随时恢复）')) softDeleteItem(card.getAttribute('data-id')).then(function () { load(current); });
      });
    });
    grid.querySelectorAll('[data-rename]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.a-card');
        var it = items.find(function (x) { return String(x.id) === card.getAttribute('data-id'); });
        var name = window.prompt('新的名称', it ? it.name : '');
        if (name == null || !name.trim()) return;
        renameItem(card.getAttribute('data-id'), name.trim()).then(function () { load(current); });
      });
    });
  }

  function addForm() {
    var old = document.getElementById('addForm');
    if (old) old.remove();
    var c = category();
    if (c.kind === 'history') { window.alert('历史记录不可手动添加'); return; }
    var wrap = document.createElement('div');
    wrap.id = 'addForm';
    wrap.style.cssText = 'padding:10px 16px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
    wrap.innerHTML =
      '<span style="font-size:13px;color:#555">添加' + c.label + '：</span>' +
      '<input id="addName" placeholder="名称" style="padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;width:140px" />' +
      '<input id="addUrl" placeholder="图片 URL" style="padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;width:320px" />' +
      '<button class="a-btn" id="addOk">添加</button>' +
      '<button class="a-btn" id="addCancel">取消</button>';
    document.querySelector('.a-tabs').after(wrap);
    document.getElementById('addCancel').addEventListener('click', function () { wrap.remove(); });
    document.getElementById('addOk').addEventListener('click', async function () {
      var name = document.getElementById('addName').value.trim();
      var url = document.getElementById('addUrl').value.trim();
      if (!name || !url) { window.alert('请填写名称和 URL'); return; }
      try {
        if (c.id === 'character') {
          await api('/api/assets/character/item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, images: [url] }) });
        } else if (c.id === 'style') {
          var existing = await api('/api/styles');
          if (!Array.isArray(existing)) existing = [];
          var sid = 'style_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          existing.push({ id: sid, name: name, thumbnail_url: url, prompt: '' });
          await api('/api/styles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(existing) });
        } else {
          await api(c.itemApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, url: url }) });
        }
        wrap.remove();
        load(current);
      } catch (e) { window.alert(e.message); }
    });
  }

  async function softDeleteItem(id) {
    var c = category();
    if (c.id === 'character') return api('/api/assets/character/item/' + encodeURIComponent(id), { method: 'DELETE' });
    if (c.id === 'style') { if (window.confirm('风格删除不可恢复，确定？')) return api('/api/styles/' + encodeURIComponent(id), { method: 'DELETE' }); return Promise.resolve(); }
    return api(c.itemApi + '/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  async function restoreItem(id) {
    var c = category();
    if (c.id === 'character') return api('/api/assets/character/item/' + encodeURIComponent(id) + '/restore', { method: 'POST' });
    if (c.id === 'style') return Promise.resolve();
    return api(c.itemApi + '/' + encodeURIComponent(id) + '/restore', { method: 'POST' });
  }

  async function renameItem(id, name) {
    var c = category();
    if (c.id === 'character') return api('/api/assets/character/item/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
    if (c.id === 'style') return Promise.resolve();
    return api(c.itemApi + '/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
  }

  function buildTabs() {
    var tabs = document.getElementById('tabs');
    tabs.innerHTML = CATEGORIES.map(function (c) {
      return '<button class="a-tab' + (c.id === current ? ' active' : '') + '" data-id="' + c.id + '">' + c.label + '</button>';
    }).join('');
    tabs.querySelectorAll('.a-tab').forEach(function (b) {
      b.addEventListener('click', function () { current = b.getAttribute('data-id'); buildTabs(); load(current); });
    });
  }

  document.getElementById('search').addEventListener('input', render);
  document.getElementById('refresh').addEventListener('click', function () { load(current); });
  var addBtn = document.createElement('button');
  addBtn.id = 'addAsset';
  addBtn.className = 'a-btn';
  addBtn.textContent = '添加素材';
  addBtn.style.cssText = 'margin-left:8px;';
  addBtn.addEventListener('click', addForm);
  document.getElementById('refresh').after(addBtn);
  var trashToggle = document.createElement('label');
  trashToggle.style.cssText = 'margin-left:8px;font-size:12px;color:#666;display:inline-flex;align-items:center;gap:4px;';
  trashToggle.innerHTML = '<input type="checkbox" id="showDeleted" /> 显示已删除';
  document.getElementById('addAsset').after(trashToggle);
  document.getElementById('showDeleted').addEventListener('change', function (e) { showDeleted = e.target.checked; render(); });
  buildTabs();
  load(current).catch(function (e) { window.alert(e.message); });
})();
