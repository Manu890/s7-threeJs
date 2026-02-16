import { MessageTypes } from '../../shared/types.js';

/**
 * WebSocket Message Handlers
 */
export class MessageHandlers {
    constructor(plcConnection, polling) {
        this.plcConnection = plcConnection;
        this.polling = polling;
    }

    /**
     * Handle incoming message
     */
    async handle(ws, wsServer, message) {
        switch (message.type) {
            case MessageTypes.PING:
                this.handlePing(ws, wsServer);
                break;

            case MessageTypes.GET_STATS:
                this.handleGetStats(ws, wsServer);
                break;

            case MessageTypes.WRITE:
                await this.handleWrite(ws, wsServer, message);
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Handle ping message
     */
    handlePing(ws, wsServer) {
        wsServer.send(ws, {
            type: MessageTypes.PONG,
            timestamp: Date.now()
        });
    }

    /**
     * Handle get stats request
     */
    handleGetStats(ws, wsServer) {
        const stats = {
            plc: {
                connected: this.plcConnection.isConnected,
                config: this.plcConnection.config
            },
            polling: this.polling.getStats(),
            websocket: wsServer.getStats()
        };

        wsServer.send(ws, {
            type: MessageTypes.STATS,
            data: stats,
            timestamp: Date.now()
        });
    }

    /**
     * Handle write request
     */
    async handleWrite(ws, wsServer, message) {
        try {
            await this.plcConnection.write(message.variable, message.value);
            
            wsServer.send(ws, {
                type: MessageTypes.WRITE_RESPONSE,
                success: true,
                variable: message.variable,
                value: message.value
            });

            console.log(`✅ Written ${message.variable} = ${message.value}`);
        } catch (error) {
            wsServer.send(ws, {
                type: MessageTypes.WRITE_RESPONSE,
                success: false,
                error: error.message
            });

            console.error(`❌ Write error:`, error);
        }
    }

    /**
     * Create status message
     */
    createStatusMessage() {
        return {
            type: MessageTypes.STATUS,
            plcConnected: this.plcConnection.isConnected,
            variables: Object.keys(this.plcConnection.variables),
            config: {
                pollInterval: this.polling.config.interval,
                plcHost: this.plcConnection.config.host
            }
        };
    }
}
