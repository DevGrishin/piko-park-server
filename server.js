// Simple TCP relay server: newline-delimited JSON messages
// Run: node server.js
const net = require('net');

const PORT = 3000;
let nextId = 1;
const clients = new Map(); // id -> { socket, buffer }

function sendJson(socket, obj) {
    try {
        socket.write(JSON.stringify(obj) + '\n');
    } catch (e) {
        // ignore
    }
}

const server = net.createServer((socket) => {
    const id = String(nextId++);
    clients.set(id, { socket, buffer: '' });

    // tell client its assigned id
    sendJson(socket, { type: 'welcome', id });

    // announce new player to others
    for (const [otherId, c] of clients) {
        if (otherId === id) continue;
        sendJson(c.socket, { type: 'join', id });
    }

    socket.on('data', (raw) => {
        const state = clients.get(id);
        if (!state) return;
        state.buffer += raw.toString('utf8');

        // split by newline to support message framing
        let idx;
        while ((idx = state.buffer.indexOf('\n')) >= 0) {
            const line = state.buffer.slice(0, idx).trim();
            state.buffer = state.buffer.slice(idx + 1);
            if (line.length === 0) continue;

            let msg;
            try {
                msg = JSON.parse(line);
            } catch (e) {
                // ignore bad JSON
                continue;
            }

            // Expect messages like:
            // { type: "update", pos: {x:.., y:..}, vel: {x:.., y:..} }
            if (msg.type === 'update') {
                // include sender id and broadcast to all OTHER clients
                const out = {
                    type: 'update',
                    id,
                    pos: msg.pos,
                    vel: msg.vel,
                    ts: Date.now()
                };
                for (const [otherId, c] of clients) {
                    if (otherId === id) continue;
                    sendJson(c.socket, out);
                }
            } else if (msg.type === 'ping') {
                sendJson(socket, { type: 'pong', ts: Date.now() });
            }
            // add other message types as needed
        }
    });

    socket.on('close', () => {
        clients.delete(id);
        // inform remaining clients
        for (const [, c] of clients) {
            sendJson(c.socket, { type: 'leave', id });
        }
    });

    socket.on('error', (err) => {
        // client errors are ignored; close will follow
    });
});

server.listen(PORT, () => {
    console.log(`Relay server listening on 0.0.0.0:${PORT}`);
});
