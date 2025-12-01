const WebSocket = require('ws');

const PORT = 3000;
const wss = new WebSocket.Server({ port: PORT });

// Track connected players
const players = new Map(); // playerId -> WebSocket connection
let nextPlayerId = 1;

console.log(`WebSocket server running on ws://localhost:${PORT}`);

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
                    if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
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
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(disconnectMsg);
            }
        });
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${playerId}:`, error);
    });
});

wss.on('error', (error) => {
    console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    wss.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
