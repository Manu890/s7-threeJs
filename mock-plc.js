import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.MOCK_PLC_PORT || 8080);
const INTERVAL_MS = Number(process.env.MOCK_PLC_INTERVAL_MS || 50);
const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });

let tick = 0;
let writeValue = 0;

function getPLCData() {
    const phase = tick / 40;
    return {
        status: Math.round((Math.sin(phase) + 1) * 127.5),
        clock: tick % 256,
        pos: Math.round((Math.sin(phase * 0.55) + 1) * 127.5),
        read: writeValue
    };
}

wss.on('connection', (socket) => {
    console.log('🌐 Visualization client connected');
    socket.on('message', (raw) => {
        let message;
        try { message = JSON.parse(raw.toString()); } catch { return; }

        if (message.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        } else if (message.type === 'getStats') {
            socket.send(JSON.stringify({
                type: 'stats', timestamp: Date.now(),
                data: { plc: { connected: true, config: { host: 'mock-plc', port: 102 } } }
            }));
        } else if (message.type === 'write') {
            const value = Number(message.value);
            if (message.variable === 'read' && Number.isInteger(value) && value >= 0 && value <= 255) {
                writeValue = value;
                socket.send(JSON.stringify({ type: 'writeResponse', success: true, variable: message.variable, value }));
                console.log(`✍️ Simulated write: ${message.variable} = ${value}`);
            } else {
                socket.send(JSON.stringify({ type: 'writeResponse', success: false, error: 'Mock PLC accepts variable "read" with a BYTE value (0-255)' }));
            }
        }
    });
    socket.on('error', (error) => console.error('WebSocket client error:', error.message));
});

const timer = setInterval(() => {
    tick++;
    const payload = JSON.stringify({ timestamp: Date.now(), data: getPLCData() });
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
}, INTERVAL_MS);

wss.on('listening', () => {
    console.log('🧪 Mock PLC simulator');
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`   Update interval: ${INTERVAL_MS}ms`);
    console.log('   No physical PLC or PLCSIM Advanced required.');
});
function shutdown() {
    clearInterval(timer);
    wss.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
wss.on('error', (error) => {
    console.error(`Mock PLC WebSocket server error: ${error.message}`);
    process.exitCode = 1;
});
