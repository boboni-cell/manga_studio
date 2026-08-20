(function () {
  var trashMode = false;

  async function api(url, options) {
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
    const body = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((body && body.error) || ('请求失败 ' + res.status));
    return body;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function timeText(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  async function render() {
    const data = await api('/api/projects' + (trashMode ? '?trash=1' : ''));
    const grid = document.getElementById('projectGrid');
    const projects = data.projects || [];
    document.getElementById('navTrash').classList.toggle('active', trashMode);
    document.getElementById('navProjects').classList.toggle('active', !trashMode);
    const cards = [];
    if (!trashMode) cards.push('<div class="p-card p-new" id="newCard">＋</div>');
    for (const p of projects) {
      const menu = trashMode
        ? '<div class="p-card-actions"><button class="p-card-menu" data-restore="' + esc(p.id) + '" title="恢复">↩</button><button class="p-card-menu danger" data-perm="' + esc(p.id) + '" title="删除">🗑</button></div>'
        : '<div class="p-card-actions"><button class="p-card-menu" data-rename="' + esc(p.id) + '" title="重命名">✎</button><button class="p-card-menu danger" data-del="' + esc(p.id) + '" title="移入回收站">🗑</button></div>';
      cards.push(
        '<div class="p-card" data-id="' + esc(p.id) + '">' + menu +
        '<div class="p-cover">' + (p.cover_url ? '<img src="' + esc(p.cover_url) + '" alt="">' : '') + '</div>' +
        '<div class="p-card-body"><div class="p-card-title">' + esc(p.title || '未命名项目') + '</div><div class="p-card-time">' + esc(timeText(p.last_opened_at || p.updated_at)) + '</div></div>' +
        '</div>'
      );
    }
    grid.innerHTML = cards.join('');
    const newCard = document.getElementById('newCard');
    if (newCard) newCard.addEventListener('click', openCreateModal);
    document.querySelectorAll('.p-card[data-id]').forEach(function (card) {
      card.addEventListener('click', function (event) { if (event.target.closest('.p-card-menu')) return; openProject(card.getAttribute('data-id')); });
    });
    document.querySelectorAll('[data-rename]').forEach(function (btn) {
      btn.addEventListener('click', function (event) { event.stopPropagation(); renameProject(btn.getAttribute('data-rename')); });
    });
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function (event) { event.stopPropagation(); deleteProject(btn.getAttribute('data-del')); });
    });
    document.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function (event) { event.stopPropagation(); restoreProject(btn.getAttribute('data-restore')); });
    });
    document.querySelectorAll('[data-perm]').forEach(function (btn) {
      btn.addEventListener('click', function (event) { event.stopPropagation(); permanentDeleteProject(btn.getAttribute('data-perm')); });
    });
  }

  function openCreateModal() {
    const old = document.getElementById('createModal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'createModal';
    modal.className = 'modal-bg';
    modal.innerHTML =
      '<div class="modal-card">' +
      '<h2>新建项目</h2>' +
      '<input id="createTitle" placeholder="项目名称" value="未命名项目" />' +
      '<div class="mode-cards">' +
      '<button class="mode-card active" data-mode="classic"><b>经典工作台</b><p>传统剧本、素材、图片和视频工作流</p></button>' +
      '<button class="mode-card" data-mode="canvas"><b>画布工作台</b><p>节点式剧本、素材、图片和视频工作流</p></button>' +
      '</div>' +
      '<div class="modal-btns"><button id="cancelCreate">取消</button><button id="confirmCreate" class="primary">创建并进入</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    var mode = 'classic';
    modal.querySelectorAll('.mode-card').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.getAttribute('data-mode');
        modal.querySelectorAll('.mode-card').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    });
    function closeCreateModal() {
      modal.remove();
      document.removeEventListener('keydown', escHandler);
    }
    function escHandler(e) { if (e.key === 'Escape') closeCreateModal(); }
    // Dismiss on backdrop click AND on Esc so users are never trapped by the
    // modal — clicks on the modal-card itself must NOT bubble up to dismiss.
    modal.addEventListener('click', function (e) { if (e.target === modal) closeCreateModal(); });
    document.addEventListener('keydown', escHandler);
    var titleInput = document.getElementById('createTitle');
    if (titleInput) titleInput.focus();
    document.getElementById('cancelCreate').addEventListener('click', closeCreateModal);
    document.getElementById('confirmCreate').addEventListener('click', async function () {
      var btn = this;
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = '创建中…';
      const title = document.getElementById('createTitle').value.trim() || '未命名项目';
      try {
        const r = await api('/api/projects', { method: 'POST', body: JSON.stringify({ title: title, initial_mode: mode }) });
        modal.remove();
        document.removeEventListener('keydown', escHandler);
        location.href = '/workspace/' + r.project.id + '?mode=' + mode;
      } catch (e) {
        btn.disabled = false; btn.textContent = '创建并进入';
        window.alert('创建项目失败：' + (e && e.message || e));
      }
    });
  }

  async function openProject(id) {
    // Single round trip: /open returns the full project (incl. last_mode).
    const r = await api('/api/projects/' + id + '/open', { method: 'POST' });
    const mode = (r.project && r.project.last_mode) || 'classic';
    location.href = '/workspace/' + id + '?mode=' + mode;
  }

  async function renameProject(id) {
    const name = window.prompt('项目名称', '');
    if (name == null) return;
    await api('/api/projects/' + id, { method: 'PUT', body: JSON.stringify({ title: name }) });
    render();
  }

  async function deleteProject(id) {
    // Use the already-rendered card title instead of a GET round trip.
    var name = '未命名项目';
    var card = document.querySelector('.p-card[data-id="' + id + '"]');
    if (card) {
      var titleEl = card.querySelector('.p-card-title');
      if (titleEl) name = titleEl.textContent.trim() || name;
    }
    if (!window.confirm('确定把《' + name + '》移入回收站吗？项目画布、草稿、资产和历史不会永久删除。')) return;
    await api('/api/projects/' + id, { method: 'DELETE' });
    render();
  }

  async function restoreProject(id) {
    await api('/api/projects/' + id + '/restore', { method: 'POST' });
    render();
  }

  async function permanentDeleteProject(id) {
    if (!window.confirm('确定永久删除该项目吗？此操作不可恢复。')) return;
    await api('/api/projects/' + id + '/permanent', { method: 'POST' });
    render();
  }

  document.getElementById('createProject').addEventListener('click', openCreateModal);
  document.getElementById('navTrash').addEventListener('click', function () { trashMode = !trashMode; render(); });
  document.getElementById('navProjects').addEventListener('click', function () { trashMode = false; render(); });
  document.getElementById('navLogout').addEventListener('click', async function () {
    sessionStorage.removeItem('manga_workspace_mode');
    await fetch('/api/auth/logout', { method: 'POST' }).catch(function () {});
    location.href = '/';
  });

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (me) {
      if (me && me.is_admin === true) {
        var adminBtn = document.getElementById('navAdmin');
        if (adminBtn) {
          adminBtn.hidden = false;
          adminBtn.addEventListener('click', function () { location.href = '/admin'; });
        }
      }
    })
    .catch(function () {});

  async function importProject(file) {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { window.alert('JSON 解析失败'); return; }
    const nodeCount = Array.isArray(data.nodes) ? data.nodes.length : 0;
    const edgeCount = Array.isArray(data.edges) ? data.edges.length : 0;
    const summary = '项目名称：' + (data.title || '未命名项目') + '\n节点数量：' + nodeCount + '\n连线数量：' + edgeCount + '\n格式：' + (data.format || '未知') + '\nSchema：' + (data.schema_version || '未知');
    if (!window.confirm(summary + '\n\n确认导入？导入会创建新项目，不会覆盖当前项目。')) return;
    const r = await api('/api/projects/import', { method: 'POST', body: text });
    location.href = '/workspace/' + r.project.id + '?mode=canvas';
  }

  document.getElementById('importProject').addEventListener('click', function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = function () {
      const file = input.files && input.files[0];
      if (file) importProject(file);
    };
    input.click();
  });

  render().catch(function (e) { window.alert(e.message); });
})();
