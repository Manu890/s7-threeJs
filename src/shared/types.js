// ============================================
// Shared Types and Interfaces
// ============================================

/**
 * @typedef {Object} PLCConfig
 * @property {string} ip - IP address of the PLC
 * @property {number} rack - Rack number (usually 0)
 * @property {number} slot - Slot number (usually 1)
 * @property {number} timeout - Connection timeout in ms
 */

/**
 * @typedef {Object} PLCData
 * @property {number} position - Position value
 * @property {number} speed - Speed value
 * @property {number} [temperature] - Temperature value (optional)
 * @property {number} [counter] - Counter value (optional)
 * @property {boolean} [enabled] - Enabled status (optional)
 */

/**
 * @typedef {Object} WebSocketMessage
 * @property {number} timestamp - Message timestamp
 * @property {PLCData} data - PLC data
 */

/**
 * @typedef {Object} StatusMessage
 * @property {'status'} type - Message type
 * @property {boolean} plcConnected - PLC connection status
 * @property {string[]} variables - List of variables
 * @property {Object} config - Configuration
 */

/**
 * @typedef {Object} WriteCommand
 * @property {'write'} type - Command type
 * @property {string} variable - Variable name
 * @property {any} value - Value to write
 */

export const MessageTypes = {
    DATA: 'data',
    STATUS: 'status',
    WRITE: 'write',
    WRITE_RESPONSE: 'writeResponse',
    PING: 'ping',
    PONG: 'pong',
    GET_STATS: 'getStats',
    STATS: 'stats',
    ERROR: 'error'
};

export const ConnectionState = {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error'
};
