(function() {
  if (window.__stomaChatWidgetLoaded) {
    return;
  }
  window.__stomaChatWidgetLoaded = true;
  var config = window.ChatWidgetConfig || {};
  var basePath = (config.basePath || '/chat').replace(/\/$/, '');
  var apiBase = basePath;
  var username = config.username || '';

  function $(sel) { return document.querySelector(sel); }
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function detectUsername() {
    var candidates = [
      '.user-panel .info p',
      '.user-panel .info',
      '.navbar .user-menu .hidden-xs',
      '.navbar .user-menu span',
      '.navbar-nav .user-menu span',
      '.top-menu .user',
      '.profile-username'
    ];
    for (var i = 0; i < candidates.length; i++) {
      var el = $(candidates[i]);
      if (el && el.textContent) {
        var t = el.textContent.trim();
        if (t) return t;
      }
    }
    return 'user';
  }

  function injectCss() {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = apiBase + '/widget.css';
    document.head.appendChild(link);
  }

  function injectUi() {
    if (document.getElementById('stoma-chat-launcher') || document.getElementById('stoma-chat-panel')) {
      return;
    }
    var launcher = document.createElement('div');
    launcher.id = 'stoma-chat-launcher';
    launcher.textContent = 'Chat DCD';
    var badge = document.createElement('span');
    badge.className = 'stoma-chat-badge';
    badge.id = 'stoma-chat-badge';
    launcher.appendChild(badge);

    var panel = document.createElement('div');
    panel.id = 'stoma-chat-panel';
    panel.innerHTML = '' +
      '<div class="chat-header">Chat</div>' +
      '<div class="chat-body" id="stoma-chat-body"></div>' +
      '<div class="chat-footer">' +
      '  <input type="text" id="stoma-chat-input" placeholder="Scrie un mesaj...">' +
      '  <button id="stoma-chat-send">Trimite</button>' +
      '</div>';

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    launcher.addEventListener('click', function() {
      panel.style.display = (panel.style.display === 'flex' ? 'none' : 'flex');
      if (panel.style.display === 'flex') {
        panelOpen = true;
        unreadCount = 0;
        updateBadge();
        loadRoomsAndInit();
        startPolling();
      } else {
        panelOpen = false;
        stopPolling();
      }
    });
  }

  var roomId = null;
  var lastId = 0;
  var socket = null;
  var pollTimer = null;
  var unreadCount = 0;
  var panelOpen = false;
  var lastRenderedDateKey = null;

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function(r){ return r.json(); });
  }

  function loadRoomsAndInit() {
    return fetchJson(apiBase + '/rooms').then(function(resp) {
      if (!resp.rooms || !resp.rooms.length) return;
      roomId = resp.rooms[0].id;
      initSocket();
      loadMessages();
    });
  }

  function initSocket() {
    if (socket) return;
    var s = document.createElement('script');
    s.src = basePath + '/socket.io/socket.io.js';
    s.onload = function() {
      socket = window.io(basePath);
      socket.emit('chat:join', String(roomId));
      socket.on('chat:new', function(msg) {
        if (String(msg.room_id) !== String(roomId)) return;
        appendMessage(msg);
      });
    };
    document.body.appendChild(s);
  }

  function toDateKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function parseCreatedAt(createdAt) {
    var s = String(createdAt || '').trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
    if (m) {
      return {
        dateKey: m[1],
        time: m[2] + ':' + m[3]
      };
    }
    var d = new Date(s.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      return {
        dateKey: toDateKey(d),
        time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      };
    }
    return { dateKey: '', time: '' };
  }

  function formatDayLabel(dateKey) {
    if (!dateKey) return '';
    var now = new Date();
    var todayKey = toDateKey(now);
    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var yesterdayKey = toDateKey(yesterday);
    if (dateKey === todayKey) return 'Astazi';
    if (dateKey === yesterdayKey) return 'Ieri';
    return dateKey.slice(8, 10) + '.' + dateKey.slice(5, 7) + '.' + dateKey.slice(0, 4);
  }

  function appendDayDivider(body, dateKey) {
    if (!dateKey || dateKey === lastRenderedDateKey) return;
    var divider = document.createElement('div');
    divider.className = 'chat-day-divider';
    divider.innerHTML = '<span>' + escapeHtml(formatDayLabel(dateKey)) + '</span>';
    body.appendChild(divider);
    lastRenderedDateKey = dateKey;
  }

  function appendMessage(msg) {
    var body = $('#stoma-chat-body');
    if (!body) return;
    if (msg.id && msg.id <= lastId) {
      return;
    }
    lastId = Math.max(lastId, msg.id || 0);
    var dt = parseCreatedAt(msg.created_at);
    appendDayDivider(body, dt.dateKey);
    var row = document.createElement('div');
    var isMine = (String(msg.username || '').toLowerCase() === String(username || '').toLowerCase());
    row.className = 'chat-row ' + (isMine ? 'right' : 'left');
    row.innerHTML =
      '<div class="meta"><span class="chat-username">' + escapeHtml(msg.username || 'user') + '</span></div>' +
      '<div class="chat-bubble">' +
      '  <div class="chat-text">' + escapeHtml(msg.message) + '</div>' +
      '  <div class="chat-time">' + escapeHtml(dt.time) + '</div>' +
      '</div>';
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
    handleMention(msg);
  }

  function loadMessages() {
    if (!roomId) return;
    fetchJson(apiBase + '/messages?room_id=' + roomId + '&after_id=' + lastId)
      .then(function(resp) {
        (resp.messages || []).forEach(appendMessage);
      });
  }

  function handleMention(msg) {
    var text = String(msg.message || '');
    var mention = '@' + String(username || '').toLowerCase();
    if (!mention || mention === '@') return;
    if (text.toLowerCase().indexOf(mention) === -1) return;
    if (!panelOpen) {
      unreadCount += 1;
      updateBadge();
    }
    notifyUser(msg);
  }

  function updateBadge() {
    var badge = document.getElementById('stoma-chat-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = String(unreadCount);
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
    }
  }

  function notifyUser(msg) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
      return;
    }
    if (Notification.permission !== 'granted') return;
    var title = 'Mention in chat';
    var body = (msg.username ? msg.username + ': ' : '') + msg.message;
    try {
      new Notification(title, { body: body });
    } catch (e) {}
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(loadMessages, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function sendMessage() {
    var input = $('#stoma-chat-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    var ensureRoom = roomId ? Promise.resolve() : loadRoomsAndInit();
    ensureRoom.then(function() {
      fetchJson(apiBase + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          username: username,
          message: text
        })
      }).then(function() {
        input.value = '';
        loadMessages();
      });
    });
  }

  function bindSend() {
    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'stoma-chat-send') {
        sendMessage();
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.target && e.target.id === 'stoma-chat-input' && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function init() {
    username = config.username || detectUsername();
    injectCss();
    injectUi();
    bindSend();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
