const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

// Track connected players
const players = new Map(); // playerId -> WebSocket connection
let nextPlayerId = 1;

// Basic HTTP endpoint for health checks
app.get('/', (req, res) => {
    res.json({ 
        status: 'running',
        players: players.size,
        message: 'Pico Park WebSocket Server'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: players.size });
});

console.log(`Server starting on port ${PORT}...`);

wss.on('connection', (ws) => {
    // Assign unique player ID
    const playerId = `player_${nextPlayerId++}`;
    players.set(playerId, ws);
    
    console.log(`Player connected: ${playerId} (${players.size} total)`);
    
    // Send welcome message with player ID
    ws.send(JSON.stringify({
        type: 'welcome',
        playerId: playerId
    }));
    
    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'playerUpdate') {
                // Broadcast player update to all other players
                const updateMsg = JSON.stringify({
                    type: 'playerUpdate',
                    playerId: data.playerId,
                    x: data.x,
                    y: data.y,
                    vx: data.vx,
                    vy: data.vy
                });
                
                // Send to all players except the sender
                players.forEach((clientWs, clientId) => {
                    if (clientWs !== ws && clientWs.readyState === 1) { // 1 = OPEN
                        clientWs.send(updateMsg);
                    }
                });
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    // Handle disconnection
    ws.on('close', () => {
        console.log(`Player disconnected: ${playerId} (${players.size - 1} remaining)`);
        players.delete(playerId);
        
        // Notify other players about disconnection
        const disconnectMsg = JSON.stringify({
            type: 'playerDisconnected',
            playerId: playerId
        });
        
        players.forEach((clientWs) => {
            if (clientWs.readyState === 1) { // 1 = OPEN
                clientWs.send(disconnectMsg);
            }
        });
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${playerId}:`, error);
    });
});

wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

// Start server
server.listen(PORT, () => {
    console.log(`HTTP server running on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
