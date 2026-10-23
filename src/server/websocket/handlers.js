import { MessageTypes } from '../../shared/types.js';

/**
 * WebSocket Message Handlers
 */
export class MessageHandlers {
    constructor(plcConnection, polling) {
        this.plcConnection = plcConnection;
        this.polling = polling;
        this.startingRecording = false;
    }

    /**
     * Handle incoming message
     */
    async handle(ws, wsServer, message) {
        switch (message.type) {
            case 'startRecording':
                await this.handleStartRecording(ws, wsServer, message);
                break;

            case 'stopRecording':
                await this.handleStopRecording(ws, wsServer);
                break;

            case MessageTypes.PING:
                this.handlePing(ws, wsServer);
                break;

            case MessageTypes.GET_STATS:
                this.handleGetStats(ws, wsServer);
                break;

            case MessageTypes.WRITE:
                await this.handleWrite(ws, wsServer, message);
                break;

            case 'addSignal':
                this.handleAddSignal(ws, wsServer, message);
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Start S7 polling for the selected registered signals.
     */
    async handleStartRecording(ws, wsServer, message) {
        if (this.startingRecording) {
            wsServer.send(ws, {
                type: 'recordingResponse',
                success: false,
                action: 'start',
                error: 'Recording is already starting. Please wait.'
            });
            return;
        }

        const requestedKeys = Array.isArray(message.keys)
            ? message.keys.filter(key => typeof key === 'string' && /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(key))
            : [];
        const activeKeys = this.plcConnection.setReadVariables(requestedKeys);

        if (activeKeys.length === 0) {
            this.polling.stop();
            wsServer.send(ws, {
                type: 'recordingResponse',
                success: false,
                action: 'start',
                error: 'No selected signals have registered PLC addresses. Add a PLC address to at least one signal first.'
            });
            return;
        }

        this.startingRecording = true;
        this.polling.recordingRequested = true;
        try {
            if (!this.plcConnection.isConnected) {
                await this.plcConnection.connect();
            }

            this.polling.start();
            console.log(`⏺ S7 recording started: ${activeKeys.join(', ')}`);
            wsServer.send(ws, {
                type: 'recordingResponse',
                success: true,
                action: 'start',
                keys: activeKeys
            });
        } catch (error) {
            this.polling.recordingRequested = false;
            this.polling.stop();
            this.plcConnection.setReadVariables([]);
            wsServer.send(ws, {
                type: 'recordingResponse',
                success: false,
                action: 'start',
                error: error.message
            });
            console.error('❌ Could not start S7 recording:', error.message);
        } finally {
            this.startingRecording = false;
        }
    }

    /**
     * Stop polling, clear the active S7 read list, and close the PLC connection.
     */
    async handleStopRecording(ws, wsServer) {
        this.polling.recordingRequested = false;
        this.polling.stop();
        this.plcConnection.setReadVariables([]);

        try {
            if (this.plcConnection.isConnected) {
                await this.plcConnection.disconnect();
            }
            console.log('⏹ S7 recording stopped; PLC disconnected and S7 read list cleared.');
            wsServer.send(ws, {
                type: 'recordingResponse',
                success: true,
                action: 'stop'
            });
        } catch (error) {
            wsServer.send(ws, {
                type: 'recordingResponse',
                success: false,
                action: 'stop',
                error: error.message
            });
            console.error('❌ Could not disconnect after stopping recording:', error.message);
        }
    }

    /**
     * Register a signal requested by the analyzer UI.
     */
    handleAddSignal(ws, wsServer, message) {
        const address = typeof message.address === 'string' ? message.address.trim() : '';

        // A key without a PLC address can still refer to data already present
        // in the WebSocket stream; it does not need dynamic PLC registration.
        if (!address) {
            wsServer.send(ws, {
                type: 'addSignalResponse',
                success: true,
                registered: false,
                key: message.key,
                message: 'No PLC address supplied; listening for this key in the existing stream.'
            });
            return;
        }

        try {
            this.plcConnection.addVariable(message.key, address, message.plcType);
            wsServer.send(ws, {
                type: 'addSignalResponse',
                success: true,
                key: message.key,
                address
            });
        } catch (error) {
            console.error('❌ Could not register PLC signal:', error.message);
            wsServer.send(ws, {
                type: 'addSignalResponse',
                success: false,
                key: message.key,
                error: error.message
            });
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

            console.error('❌ Write error:', error);
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
