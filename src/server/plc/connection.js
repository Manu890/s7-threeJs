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
     * Set variables to read from PLC
     * @param {Object} variables - Object with variable names and addresses
     */
    setVariables(variables) {
        this.variables = variables;
        this.conn.setTranslationCB((name) => this.variables[name]);
        this.conn.addItems(Object.keys(this.variables));
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
