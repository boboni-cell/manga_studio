(function () {
  var pathMatch = location.pathname.match(/\/workspace\/([^/]+)/);
  var projectId = pathMatch ? decodeURIComponent(pathMatch[1]) : (new URLSearchParams(location.search).get('project_id') || '');
  var frames = {
    classic: document.getElementById('classicFrame'),
    canvas: document.getElementById('canvasFrame'),
  };
  var framesInitialized = { classic: false, canvas: false };
  var modeKey = projectId ? ('manga_workspace_mode:' + projectId) : 'manga_workspace_mode';
  // Canvas tab serves Canvas V2 by default; CANVAS_V2_ROLLBACK=1 on the
  // server falls back to the legacy /canvas workbench (old data untouched).
  var canvasTabMode = 'v2';
  var rollbackPromise = fetch('/api/canvas-v2/rollback', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.enabled) canvasTabMode = 'legacy'; })
    .catch(function () {});

  var projectPromise = null;
  var backLink = document.getElementById('wsBack');
  backLink.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    window.top.location.assign('/');
  });
  if (projectId) {
    backLink.href = '/';
    projectPromise = fetch('/api/projects/' + encodeURIComponent(projectId), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.project ? d.project : null; });
    projectPromise
      .then(function (d) {
        if (d && d.title) document.getElementById('wsProjectTitle').textContent = d.title;
      })
      .catch(function () {});
  }

  function ensureFrame(mode) {
    if (framesInitialized[mode]) return;
    framesInitialized[mode] = true;
    if (mode === 'classic') {
      var classicSrc = '/classic?embedded=1';
      if (projectId) classicSrc += '&project_id=' + encodeURIComponent(projectId);
      frames.classic.src = classicSrc;
      return;
    }
    rollbackPromise.finally(function () {
      var canvasSrc = (canvasTabMode === 'legacy' ? '/canvas' : '/canvas-v2') + '?embedded=1';
      if (projectId) canvasSrc += '&project_id=' + encodeURIComponent(projectId);
      frames.canvas.src = canvasSrc;
    });
  }

  function setSaveState(state) {
    var el = document.getElementById('wsSaveState');
    if (!el) return;
    if (state === 'saving') el.textContent = '保存中…';
    else if (state === 'saved') el.textContent = '已保存';
    else if (state === 'error') el.textContent = '保存失败';
    else el.textContent = '';
  }

  function activate(mode, persist) {
    if (mode !== 'classic' && mode !== 'canvas') return;
    if (projectId) sessionStorage.setItem(modeKey, mode);
    document.getElementById('workspace-choice').classList.add('hidden');
    ensureFrame(mode);
    Object.keys(frames).forEach(function (key) {
      var frame = frames[key];
      var active = key === mode;
      frame.classList.toggle('active', active);
      if (active && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'workspace:activated', mode: key }, location.origin);
      }
    });
    document.getElementById('tabClassic').classList.toggle('active', mode === 'classic');
    document.getElementById('tabCanvas').classList.toggle('active', mode === 'canvas');
    if (projectId && persist !== false) {
      fetch('/api/projects/' + encodeURIComponent(projectId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ last_mode: mode }) }).catch(function () {});
    }
  }

  document.querySelectorAll('.ws-choice-card').forEach(function (card) {
    card.addEventListener('click', function (event) {
      // Stop before the backdrop handler so the card's own mode wins.
      event.stopPropagation();
      activate(card.getAttribute('data-mode'));
    });
  });
  document.getElementById('tabClassic').addEventListener('click', function () { activate('classic'); });
  document.getElementById('tabCanvas').addEventListener('click', function () { activate('canvas'); });

  // Escape hatches so the mode-chooser overlay never traps the user:
  // 1) clicking the dark backdrop (not on a card) dismisses with the default;
  // 2) pressing Esc while the overlay is up dismisses with the default too.
  // This matters because boot() can leave the overlay visible when no mode
  // has been chosen yet, and without these the only way forward is clicking
  // the (relatively small) cards — everything else looks "都点不动".
  var choiceBackdrop = document.getElementById('workspace-choice');
  if (choiceBackdrop) {
    choiceBackdrop.addEventListener('click', function () { activate('classic'); });
  }
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var choice = document.getElementById('workspace-choice');
    if (!choice || choice.classList.contains('hidden')) return;
    activate('classic');
  });

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (me) {
      if (me && me.is_admin === true) {
        var adminLink = document.getElementById('wsAdmin');
        if (adminLink) adminLink.style.display = '';
      }
    })
    .catch(function () {});

  document.getElementById('wsLogout').addEventListener('click', function () {
    if (projectId) sessionStorage.removeItem(modeKey);
    else sessionStorage.removeItem('manga_workspace_mode');
    fetch('/api/auth/logout', { method: 'POST' }).catch(function () {}).finally(function () { location.href = '/'; });
  });

  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (data && data.type === 'canvas:save-state') setSaveState(data.state);
  });

  function boot() {
    var queryMode = new URLSearchParams(location.search).get('mode');
    if (queryMode === 'classic' || queryMode === 'canvas') { activate(queryMode, false); return; }
    if (projectId) {
      projectPromise
        .then(function (project) {
          var serverMode = project && project.last_mode;
          if (serverMode === 'classic' || serverMode === 'canvas') { activate(serverMode, false); return; }
          var saved = sessionStorage.getItem(modeKey);
          if (saved === 'classic' || saved === 'canvas') { activate(saved, false); return; }
          // choice layer stays visible
        })
        .catch(function () {
          var saved = sessionStorage.getItem(modeKey);
          if (saved === 'classic' || saved === 'canvas') activate(saved, false);
        });
      return;
    }
    var saved = sessionStorage.getItem(modeKey);
    if (saved === 'classic' || saved === 'canvas') activate(saved, false);
  }

  boot();
})();
