import { PLCConnection } from './plc/connection.js';
import { PLCPolling } from './plc/polling.js';
import { WSServer } from './websocket/server.js';
import { MessageHandlers } from './websocket/handlers.js';
import { DEFAULT_VARIABLES } from '../shared/constants.js';

/**
 * Main Server Class
 */
export class Server {
    constructor(plcConfig, wsConfig, pollConfig, variables = DEFAULT_VARIABLES) {
        this.plcConnection = new PLCConnection(plcConfig);
        this.polling = new PLCPolling(this.plcConnection, pollConfig);
        this.wsServer = new WSServer(wsConfig);
        this.handlers = new MessageHandlers(this.plcConnection, this.polling);

        this.plcConnection.setVariables(variables);
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // PLC events
        this.plcConnection.onConnect(() => {
            console.log('✅ Connected to PLC');
            // Polling starts only after a recording request has selected its S7 read list.
            this.polling.start();
        });

        this.plcConnection.onDisconnect(() => {
            console.log('🔌 Disconnected from PLC');
            this.polling.stop();
        });

        this.plcConnection.onError((error) => {
            console.error('❌ PLC error:', error);
            if (this.polling.recordingRequested) this.reconnectPLC();
        });

        // Polling events
        this.polling.onData((data) => {
            this.wsServer.broadcast({
                timestamp: Date.now(),
                data: data
            });
        });

        this.polling.onError((error) => {
            console.error('❌ Polling error:', error);
            this.reconnectPLC();
        });

        // WebSocket events
        this.wsServer.onMessage((ws, message) => {
            this.handlers.handle(ws, this.wsServer, message);
        });
    }

    /**
     * Start server. The PLC connection is opened on demand when recording starts.
     */
    async start() {
        console.log('🏭 S7 PLC ↔ WebSocket Bridge');
        console.log('================================');
        console.log(`PLC: ${this.plcConnection.config.host}:${this.plcConnection.config.rack}/${this.plcConnection.config.slot}`);
        console.log(`WebSocket: ws://localhost:${this.wsServer.config.port}`);
        console.log(`Poll Interval: ${this.polling.config.interval}ms`);
        console.log('PLC polling is idle until Start Recording is pressed.');
        console.log('================================\n');
    }

    /**
     * Connect to PLC
     */
    async connectPLC() {
        if (this.plcConnection.isConnected) return;
        console.log(`🔌 Connecting to PLC ${this.plcConnection.config.host}...`);
        await this.plcConnection.connect();
    }

    /**
     * Reconnect to PLC
     */
    async reconnectPLC() {
        if (!this.polling.recordingRequested) return;
        console.log('⏳ Reconnecting to PLC in 2 seconds...');
        setTimeout(async () => {
            if (!this.polling.recordingRequested || this.plcConnection.isConnected) return;
            try {
                await this.connectPLC();
            } catch (error) {
                console.error('Reconnection failed:', error);
                if (this.polling.recordingRequested) this.reconnectPLC();
            }
        }, 2000);
    }

    /**
     * Stop server
     */
    async stop() {
        console.log('\n🛑 Stopping server...');

        this.polling.stop();
        await this.plcConnection.disconnect();
        await this.wsServer.close();

        console.log('✅ Server stopped');
    }
}
