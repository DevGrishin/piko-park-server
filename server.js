const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Map(); // id -> { ws, lastSeen, state }

function makeId() {
    return Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

function broadcast(obj, exceptId) {
    const raw = JSON.stringify(obj);
    for (const [pid, c] of clients) {
        if (pid === exceptId) continue;
        if (c.ws.readyState === WebSocket.OPEN) c.ws.send(raw);
    }
}

wss.on('connection', (ws) => {
    const id = makeId();
    clients.set(id, { ws, lastSeen: Date.now(), state: null });

    // send initial data (assigned id + known players)
    const players = {};
    for (const [pid, c] of clients) {
        if (c.state) players[pid] = c.state;
    }
    ws.send(JSON.stringify({ type: 'init', id, players }));

    // notify others that a new player joined
    broadcast({ type: 'player_join', id }, id);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }

        if (msg.type === 'update') {
            // Expect: { type: 'update', x: Number, y: Number, vx: Number, vy: Number }
            const state = { x: +msg.x, y: +msg.y, vx: +msg.vx, vy: +msg.vy, ts: Date.now() };
            const c = clients.get(id);
            if (c) { c.state = state; c.lastSeen = Date.now(); }
            // broadcast to everyone else
            broadcast({ type: 'player_update', id, ...state }, id);
        } else if (msg.type === 'ping' || msg.type === 'pong') {
            const c = clients.get(id);
            if (c) c.lastSeen = Date.now();
        } else if (msg.type === 'leave') {
            ws.close();
        }
    });

    ws.on('close', () => {
        clients.delete(id);
        broadcast({ type: 'player_leave', id });
    });

    ws.on('error', () => {
        // ignore per-connection errors
    });
});

// cleanup stale clients that stopped sending updates
setInterval(() => {
    const now = Date.now();
    for (const [pid, c] of clients) {
        if (now - c.lastSeen > 30_000) { // 30 sec timeout
            try { c.ws.terminate(); } catch (e) {}
            clients.delete(pid);
            broadcast({ type: 'player_leave', id: pid });
        }
    }
}, 5000);

console.log(`WebSocket server listening on port ${PORT}`);
