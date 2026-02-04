# Stoma Chat Widget (No App Code Changes)

## Overview
This package runs a standalone chat server (Node.js + SQLite) and injects a chat UI into your existing app without modifying the app code.

Target domain: https://stoma.mediccopilot.com/

## Files
- `server/` Node.js app
- `public/` widget JS/CSS (served by the Node app)

## cPanel Steps

### 1) Upload the Node app
1. Open **cPanel → File Manager**.
2. Create a folder, e.g. `chat-server` (outside `public_html` recommended).
3. Upload contents of `chat-widget/server/` and `chat-widget/public/` into that folder.

### 2) Create a Node.js App
1. Go to **cPanel → Setup Node.js App**.
2. Create new app:
   - **Application Root**: `chat-server`
   - **Application URL**: `/chat`
   - **Application Startup File**: `server.js`
3. Add environment variables:
   - `BASE_PATH` = `/chat`
   - `CHAT_DB_PATH` = `/home/USER/chat-server/chat.db` (replace USER)
   - `CHAT_CORS_ORIGIN` = `https://stoma.mediccopilot.com`
4. Click **Create** and then **Start**.

### 3) Install dependencies
In the Node.js App screen, click **Run NPM Install**.

### 4) Inject the widget (no app code change)
Edit `public_html/.htaccess` and add at the **top**:

```
<IfModule mod_substitute.c>
  AddOutputFilterByType SUBSTITUTE text/html
  SubstituteMaxLineLength 10M
  Substitute "s|</body>|<script>window.ChatWidgetConfig={basePath:'/chat'};</script><script src='/chat/widget.js'></script></body>|i"
</IfModule>
```

This injects the widget into all HTML pages.

### 5) Test
Open the app and you should see a **Chat** menu item and a floating chat button.

## Notes
- The chat uses WebSockets (Socket.IO).
- If the menu doesn’t appear, hard refresh (Cmd+Shift+R).
- Username is auto-detected from the page; if it fails, it will show as `user`.

## Troubleshooting
- If the widget doesn’t load, check if `https://stoma.mediccopilot.com/chat/widget.js` opens in browser.
- If WebSockets fail, polling can be added easily.
