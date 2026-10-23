import { WebSocketServer } from 'ws';
import { DEFAULT_WS_CONFIG } from '../../shared/constants.js';
import { MessageTypes } from '../../shared/types.js';

/**
 * WebSocket Server Manager
 */
export class WSServer {
    constructor(config = DEFAULT_WS_CONFIG) {
        this.config = config;
        this.wss = new WebSocketServer({
            host: config.host || '0.0.0.0', // Listen on all interfaces
            port: config.port,
            ...config
        });
        
        this.clients = new Set();
        this.onMessageCallback = null;
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0
        };

        this.setupEventHandlers();
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.wss.on('connection', (ws, request) => {
            const clientIP = request.socket.remoteAddress;
            console.log(`🌐 New client connected: ${clientIP}`);
            console.log(`   Total clients: ${this.wss.clients.size}`);

            this.clients.add(ws);

            ws.on('message', (message) => {
                this.handleMessage(ws, message);
            });

            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(`👋 Client disconnected: ${clientIP}`);
                console.log(`   Remaining clients: ${this.wss.clients.size}`);
            });

            ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
                this.stats.errors++;
            });
        });

        this.wss.on('listening', () => {
            const address = this.wss.address();
            console.log(`🚀 WebSocket server listening on ${address.address}:${address.port}`);
            console.log(`   Accessible from other devices at: ws://<your-ip>:${address.port}`);
        });

        this.wss.on('error', (error) => {
            console.error('❌ WebSocket server error:', error);
            this.stats.errors++;
        });
    }

    /**
     * Handle incoming message from client
     */
    handleMessage(ws, message) {
        try {
            const data = JSON.parse(message.toString());
            this.stats.messagesReceived++;

            if (this.onMessageCallback) {
                this.onMessageCallback(ws, data);
            }
        } catch (error) {
            console.error('⚠️ Error parsing message:', error);
            this.stats.errors++;
        }
    }

    /**
     * Broadcast message to all connected clients
     */
    broadcast(data) {
        const payload = JSON.stringify(data);
        let sentCount = 0;

        this.wss.clients.forEach((client) => {
            if (client.readyState !== 1) return; // WebSocket.OPEN

            try {
                client.send(payload);
                sentCount++;
                this.stats.messagesSent++;
            } catch (error) {
                console.error('Error sending to client:', error);
                this.stats.errors++;
            }
        });

        return sentCount;
    }

    /**
     * Send message to specific client
     */
    send(ws, data) {
        if (ws.readyState === 1) {
            try {
                ws.send(JSON.stringify(data));
                this.stats.messagesSent++;
                return true;
            } catch (error) {
                console.error('Error sending to client:', error);
                this.stats.errors++;
                return false;
            }
        }
        return false;
    }

    /**
     * Close server
     */
    close() {
        return new Promise((resolve) => {
            this.wss.close(() => {
                console.log('✅ WebSocket server closed');
                resolve();
            });
        });
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            ...this.stats,
            connectedClients: this.wss.clients.size
        };
    }

    /**
     * Event handler for incoming messages
     */
    onMessage(callback) {
        this.onMessageCallback = callback;
    }
}
