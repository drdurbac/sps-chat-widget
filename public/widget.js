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

  function appendMessage(msg) {
    var body = $('#stoma-chat-body');
    if (!body) return;
    if (msg.id && msg.id <= lastId) {
      return;
    }
    lastId = Math.max(lastId, msg.id || 0);
    var row = document.createElement('div');
    var isMine = (String(msg.username || '').toLowerCase() === String(username || '').toLowerCase());
    row.className = 'chat-row ' + (isMine ? 'right' : 'left');
    row.innerHTML =
      '<div class="meta">' + escapeHtml(msg.username) + ' · ' + escapeHtml(msg.created_at) + '</div>' +
      '<div class="chat-bubble">' + escapeHtml(msg.message) + '</div>';
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

  function injectMenuLink() {
    if (document.getElementById('stoma-chat-menu')) {
      return;
    }
    var menu = document.querySelector('.nav.navbar-nav');
    if (!menu) return;
    var li = document.createElement('li');
    li.innerHTML = '<a href="#" id="stoma-chat-menu"><i class="fa fa-comments"></i> <span>Chat</span></a>';
    menu.appendChild(li);
    li.querySelector('a').addEventListener('click', function(e) {
      e.preventDefault();
      var panel = document.getElementById('stoma-chat-panel');
      if (panel) {
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
      }
    });
  }

  function init() {
    username = config.username || detectUsername();
    injectCss();
    injectUi();
    injectMenuLink();
    bindSend();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
