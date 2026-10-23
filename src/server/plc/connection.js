import nodes7 from 'nodes7';
import { DEFAULT_PLC_CONFIG } from '../../shared/constants.js';

/**
 * PLC Connection Manager
 * Handles connection to Siemens S7 PLC
 */
export class PLCConnection {
    constructor(config = DEFAULT_PLC_CONFIG) {
        this.config = config;
        this.conn = new nodes7();
        this.isConnected = false;
        this.variables = {};
        this.onConnectCallback = null;
        this.onDisconnectCallback = null;
        this.onErrorCallback = null;
    }

    /**
     * Set variables known to the PLC bridge.
     * Register their address mappings without activating them for S7 reads.
     * @param {Object} variables - Object with variable names and addresses
     */
    setVariables(variables) {
        this.variables = variables;
        this.conn.setTranslationCB((name) => this.variables[name]);
        // Do not call addItems here. Only setReadVariables() should activate
        // signals for reading, based on the user's current selection.
    }

    /**
     * Set the active S7 read list without removing signal address registrations.
     * nodes7 reads only the items in its current item list.
     * @param {string[]} keys - Registered variable keys to read
     * @returns {string[]} Keys that were activated
     */
    setReadVariables(keys) {
        const selected = [...new Set(Array.isArray(keys) ? keys : [])]
            .filter((key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(this.variables, key));

        this.conn.removeItems();
        this.conn.setTranslationCB((name) => this.variables[name]);

        if (selected.length > 0) {
            this.conn.addItems(selected);
        }

        console.log(`📡 S7 read list updated: ${selected.length ? selected.join(', ') : '(empty)'}`);
        return selected;
    }

    /**
     * Register an additional PLC variable while the bridge is running.
     * Registration stores the address mapping only; it does not activate S7 reads.
     * @param {string} name - WebSocket data key
     * @param {string} address - nodes7 PLC address
     */
    addVariable(name, address, plcType = '') {
        if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(name)) {
            throw new Error('Invalid signal key');
        }
        if (typeof address !== 'string' || !address.trim()) {
            throw new Error('A PLC address is required for real PLC signals');
        }

        // Keep the PLC data type when translating a generic DBD address.
        // REAL must be decoded as IEEE-754 float, not unsigned DWORD.
        const type = String(plcType || '').trim().toUpperCase();
        const normalizedAddress = address.trim().replace(
            /^(DB\d+),DBD(\d+)$/i,
            (_match, db, offset) => db + ',' +
                (type === 'R' || type === 'REAL' ? 'REAL' :
                 type === 'DI' || type === 'DINT' ? 'DINT' : 'DWORD') + offset
        );
        if (this.variables[name] === normalizedAddress) {
            return;
        }

        // A signal's selected data type can change in the analyzer. Updating
        // the translation for the same key lets the next S7 read use that type.
        this.variables[name] = normalizedAddress;
        this.conn.setTranslationCB((itemName) => this.variables[itemName]);
        console.log(`➕ Registered PLC signal ${name} → ${normalizedAddress}`);
    }

    /**
     * Connect to PLC
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            this.conn.initiateConnection(this.config, (err) => {
                if (err) {
                    this.isConnected = false;
                    if (this.onErrorCallback) {
                        this.onErrorCallback(err);
                    }
                    reject(err);
                    return;
                }

                this.isConnected = true;
                if (this.onConnectCallback) {
                    this.onConnectCallback();
                }
                resolve();
            });
        });
    }

    /**
     * Read all variables from PLC
     * @returns {Promise<Object>}
     */
    readAll() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('PLC not connected'));
                return;
            }

            this.conn.readAllItems((err, values) => {
                // nodes7 uses the first callback argument as a "bad quality exists"
                // flag as well as an error indicator. For per-item PLC failures it
                // still returns a data object containing the other signals.
                if (values && typeof values === 'object') {
                    this.lastReadErrors = this.collectReadErrors(values);
                    resolve(values);
                    return;
                }

                if (err) {
                    this.isConnected = false;
                    if (this.onErrorCallback) {
                        this.onErrorCallback(err);
                    }
                    reject(err instanceof Error ? err : new Error(String(err)));
                    return;
                }

                this.lastReadErrors = [];
                resolve({});
            });
        });
    }

    /**
     * Return per-signal quality errors reported by nodes7's parsed read items.
     * This uses nodes7 response metadata, not console text.
     */
    collectReadErrors(values = {}) {
        const errors = [];
        const blocks = Array.isArray(this.conn.globalReadBlockList)
            ? this.conn.globalReadBlockList
            : [];

        const seen = new Set();
        // The callback data is the most reliable public-facing signal mapping:
        // nodes7 returns "BAD ..." for individual items with invalid quality.
        for (const [key, value] of Object.entries(values || {})) {
            if (typeof value === 'string' && /^BAD(?:\\s|$)/i.test(value)) {
                errors.push({
                    key,
                    address: this.variables[key] || key,
                    reason: value
                });
                seen.add(key);
            }
        }

        // Include nodes7's parsed item metadata when available, without
        // duplicating any failures already reported through the callback data.
        for (const block of blocks) {
            const items = Array.isArray(block.itemReference) ? block.itemReference : [];
            for (const item of items) {
                const quality = item.quality;
                const goodQuality = quality === 'OK' || quality === ''
                    || (Array.isArray(quality) && quality.length > 0 && quality.every((part) => part === 'OK'));
                if (goodQuality) continue;

                const key = typeof item.useraddr === 'string' ? item.useraddr : '';
                const address = (key && this.variables[key]) || item.addr || '';
                if ((!key && !address) || (key && seen.has(key))) continue;

                errors.push({
                    key,
                    address,
                    reason: item.errCode || (Array.isArray(quality) ? quality.join(', ') : String(quality || 'Bad PLC quality'))
                });
                if (key) seen.add(key);
            }
        }

        return errors;
    }

    /**
     * Get the per-signal errors from the most recent completed read.
     */
    getLastReadErrors() {
        return Array.isArray(this.lastReadErrors) ? this.lastReadErrors : [];
    }

    /**
     * Read all variables from PLC (alias for readAll)
     * @returns {Promise<Object>}
     */
    read() {
        return this.readAll();
    }

    /**
     * Write value to PLC
     * @param {string} variable - Variable name
     * @param {any} value - Value to write
     * @returns {Promise<void>}
     */
    write(variable, value) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('PLC not connected'));
                return;
            }

            const address = this.variables[variable];
            if (!address) {
                reject(new Error(`Variable ${variable} not found. Available: ${Object.keys(this.variables).join(', ')}`));
                return;
            }

            // nodes7 API: writeItems(itemName, value, callback)
            this.conn.writeItems(variable, value, (err) => {
                if (err) {
                    if (this.onErrorCallback) {
                        this.onErrorCallback(err);
                    }
                    reject(err);
                    return;
                }

                resolve();
            });
        });
    }

    /**
     * Disconnect from PLC
     * @returns {Promise<void>}
     */
    disconnect() {
        return new Promise((resolve) => {
            this.conn.dropConnection(() => {
                this.isConnected = false;
                if (this.onDisconnectCallback) {
                    this.onDisconnectCallback();
                }
                resolve();
            });
        });
    }

    /**
     * Event handlers
     */
    onConnect(callback) {
        this.onConnectCallback = callback;
    }

    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }

    onError(callback) {
        this.onErrorCallback = callback;
    }
}
