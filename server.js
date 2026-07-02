// PaintLead Pro — static site + xAI realtime chat relay.
//
// The browser widget connects to ws(s)://<host>/ws/chat on this server;
// each connection is proxied 1:1 to the xAI realtime agent with the
// XAI_API_KEY attached server-side, so the key never reaches the client.
//
//   XAI_API_KEY=xai-... node server.js

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const XAI_AGENT_ID = process.env.XAI_AGENT_ID || 'agent_0gJ5xvSLvE2l3Z3w';
const XAI_REALTIME_URL = `wss://api.x.ai/v1/realtime?agent_id=${XAI_AGENT_ID}`;

if (!process.env.XAI_API_KEY) {
  console.warn('WARNING: XAI_API_KEY is not set — chat relay will refuse connections.');
}

const server = http.createServer((req, res) => {
  // Single-page static site: serve index.html for everything.
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws/chat' });

wss.on('connection', (client) => {
  if (!process.env.XAI_API_KEY) {
    client.send(JSON.stringify({ type: 'relay.error', message: 'Chat is not configured on the server.' }));
    client.close(1011, 'XAI_API_KEY not configured');
    return;
  }

  const upstream = new WebSocket(XAI_REALTIME_URL, {
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
  });

  const queue = [];

  upstream.on('open', () => {
    for (const msg of queue.splice(0)) upstream.send(msg);
  });

  // Browser -> xAI. Only pass through the message shapes the widget uses.
  client.on('message', (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (event.type !== 'conversation.item.create' && event.type !== 'response.create') return;

    const msg = JSON.stringify(event);
    if (upstream.readyState === WebSocket.OPEN) upstream.send(msg);
    else if (upstream.readyState === WebSocket.CONNECTING) queue.push(msg);
  });

  // xAI -> browser.
  upstream.on('message', (raw) => {
    if (client.readyState === WebSocket.OPEN) client.send(raw.toString());
  });

  const closeBoth = () => {
    if (client.readyState === WebSocket.OPEN) client.close();
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
    }
  };

  upstream.on('close', closeBoth);
  upstream.on('error', (err) => {
    console.error('xAI upstream error:', err.message);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'relay.error', message: 'Chat service unavailable.' }));
    }
    closeBoth();
  });
  client.on('close', closeBoth);
  client.on('error', closeBoth);
});

server.listen(PORT, () => {
  console.log(`PaintLead Pro running on http://localhost:${PORT}`);
});
