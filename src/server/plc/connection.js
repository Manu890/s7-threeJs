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
    addVariable(name, address) {
        if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(name)) {
            throw new Error('Invalid signal key');
        }
        if (typeof address !== 'string' || !address.trim()) {
            throw new Error('A PLC address is required for real PLC signals');
        }

        // STEP 7 DBD denotes a 32-bit storage area; nodes7 uses DWORD for
        // an unsigned 32-bit read when no more specific symbol type is available.
        const normalizedAddress = address.trim().replace(/^(DB\\d+),DBD(\\d+)$/i, '$1,DWORD$2');
        if (this.variables[name] && this.variables[name] !== normalizedAddress) {
            throw new Error(`Signal key ${name} is already registered to ${this.variables[name]}`);
        }

        if (this.variables[name] === normalizedAddress) {
            // Already registered; leave activation to setReadVariables().
            return;
        }

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
                if (err) {
                    this.isConnected = false;
                    if (this.onErrorCallback) {
                        this.onErrorCallback(err);
                    }
                    reject(err);
                    return;
                }

                resolve(values);
            });
        });
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
