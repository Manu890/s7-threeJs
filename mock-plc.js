import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.MOCK_PLC_PORT || 8080);
const INTERVAL_MS = Number(process.env.MOCK_PLC_INTERVAL_MS || 50);
const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });

let tick = 0;
let writeValue = 0;
const customSignals = new Map();
const RESERVED_KEYS = new Set(['status', 'clock', 'pos', 'read']);

function getPLCData() {
    const phase = tick / 40;
    const data = {
        status: Math.round((Math.sin(phase) + 1) * 127.5),
        clock: tick % 256,
        pos: Math.round((Math.sin(phase * 0.55) + 1) * 127.5),
        read: writeValue
    };
    // Simulate values according to the selected nodes7 data type.
    for (const [key, signal] of customSignals) {
        const wave = (Math.sin(phase * (0.25 + (signal.index % 7) * 0.09) + signal.index) + 1) / 2;
        switch (signal.type) {
            case 'X': data[key] = wave >= 0.5; break;
            case 'C': data[key] = String.fromCharCode(65 + Math.floor(wave * 26) % 26); break;
            case 'S': data[key] = 'SIM-' + String(Math.round(wave * 999)).padStart(3, '0'); break;
            case 'DT':
            case 'DTZ':
            case 'DTL':
            case 'DTLZ': data[key] = new Date(Date.now() + Math.round(wave * 60000)).toISOString(); break;
            case 'I':
            case 'RI': data[key] = Math.round(wave * 65535 - 32768); break;
            case 'DI':
            case 'RDI': data[key] = Math.round(wave * 4294967295 - 2147483648); break;
            case 'W':
            case 'RW': data[key] = Math.round(wave * 65535); break;
            case 'D':
            case 'DW':
            case 'RD':
            case 'RDW': data[key] = Math.round(wave * 4294967295); break;
            case 'TMR':
            case 'CTR': data[key] = Math.round(wave * 9999); break;
            case 'R':
            case 'RR':
            case 'LR': data[key] = Math.round((wave * 200 - 100) * 1000) / 1000; break;
            default: data[key] = Math.round(wave * 255);
        }
    }
    return data;
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
        } else if (message.type === 'addSignal') {
            const key = String(message.key || '');
            if (/^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$/.test(key) && !RESERVED_KEYS.has(key)) {
                const allowedTypes = new Set(['X', 'B', 'C', 'S', 'I', 'DI', 'W', 'D', 'DW', 'R', 'RI', 'RDI', 'RW', 'RD', 'RDW', 'RR', 'LR', 'DT', 'DTZ', 'DTL', 'DTLZ', 'TMR', 'CTR']);
                const plcType = allowedTypes.has(String(message.plcType || '').toUpperCase()) ? String(message.plcType).toUpperCase() : 'B';
                const existing = customSignals.get(key);
                customSignals.set(key, { index: existing ? existing.index : customSignals.size, type: plcType });
                socket.send(JSON.stringify({ type: 'signalAdded', key, success: true }));
                console.log(`➕ Mock signal enabled: ${key}`);
            } else {
                socket.send(JSON.stringify({ type: 'signalAdded', key, success: false, error: 'Invalid or reserved signal key' }));
            }
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
