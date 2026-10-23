import { DEFAULT_POLL_CONFIG } from '../../shared/constants.js';

/**
 * PLC Polling Manager
 * Handles periodic polling of PLC data
 */
export class PLCPolling {
    constructor(plcConnection, config = DEFAULT_POLL_CONFIG) {
        this.plcConnection = plcConnection;
        this.config = config;
        this.pollTimer = null;
        this.isPolling = false;
        this.recordingRequested = false;
        this.onDataCallback = null;
        this.onErrorCallback = null;
        this.stats = {
            totalReads: 0,
            successfulReads: 0,
            failedReads: 0,
            lastReadTime: null
        };
    }

    /**
     * Start polling
     */
    start() {
        if (this.isPolling) {
            console.warn('Polling already started');
            return;
        }

        this.isPolling = true;
        this.pollTimer = setInterval(async () => {
            await this.poll();
        }, this.config.interval);

        console.log(`🔄 Polling started (interval: ${this.config.interval}ms)`);
    }

    /**
     * Stop polling
     */
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.isPolling = false;
        console.log('🛑 Polling stopped');
    }

    /**
     * Poll PLC once
     */
    async poll() {
        if (!this.isPolling || !this.plcConnection.isConnected) {
            return;
        }

        this.stats.totalReads++;

        try {
            const data = await this.plcConnection.readAll();

            // A read may finish after Stop Recording was pressed. Do not broadcast it.
            if (!this.isPolling) return;

            this.stats.successfulReads++;
            this.stats.lastReadTime = Date.now();

            if (this.onDataCallback) {
                this.onDataCallback(data, this.plcConnection.getLastReadErrors());
            }
        } catch (error) {
            if (!this.isPolling) return;

            this.stats.failedReads++;

            if (this.onErrorCallback) {
                this.onErrorCallback(error);
            }

            // Stop polling on error; the recording request remains active so the
            // server can reconnect and resume the selected read list.
            this.stop();
        }
    }

    /**
     * Get polling statistics
     */
    getStats() {
        return {
            ...this.stats,
            isPolling: this.isPolling,
            interval: this.config.interval
        };
    }

    /**
     * Event handlers
     */
    onData(callback) {
        this.onDataCallback = callback;
    }

    onError(callback) {
        this.onErrorCallback = callback;
    }
}
