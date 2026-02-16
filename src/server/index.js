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
            this.polling.start();
        });

        this.plcConnection.onDisconnect(() => {
            console.log('🔌 Disconnected from PLC');
            this.polling.stop();
        });

        this.plcConnection.onError((error) => {
            console.error('❌ PLC error:', error);
            this.reconnectPLC();
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
     * Start server
     */
    async start() {
    console.log('🏭 S7 PLC ↔ WebSocket Bridge');
    console.log('================================');
    console.log(`PLC: ${this.plcConnection.config.host}:${this.plcConnection.config.rack}/${this.plcConnection.config.slot}`);
    console.log(`WebSocket: ws://localhost:${this.wsServer.config.port}`);
    console.log(`Poll Interval: ${this.polling.config.interval}ms`);
    console.log('================================\n');

        try {
            await this.connectPLC();
        } catch (error) {
            console.error('Failed to connect to PLC:', error);
            console.log('Will retry in 5 seconds...');
            setTimeout(() => this.connectPLC(), 5000);
        }
    }

    /**
     * Connect to PLC
     */
    async connectPLC() {
        console.log(`🔌 Connecting to PLC ${this.plcConnection.config.host}...`);
        try {
            await this.plcConnection.connect();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Reconnect to PLC
     */
    async reconnectPLC() {
        console.log('⏳ Reconnecting to PLC in 2 seconds...');
        setTimeout(async () => {
            try {
                await this.connectPLC();
            } catch (error) {
                console.error('Reconnection failed:', error);
                this.reconnectPLC();
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
