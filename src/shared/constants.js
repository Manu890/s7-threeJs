// ============================================
// Shared Constants
// ============================================

export const DEFAULT_PLC_CONFIG = {
    host: '192.168.0.10',  // nodes7 uses 'host' instead of 'ip'
    port: 102,             // S7 default port
    rack: 0,
    slot: 1,
    timeout: 5000
};

export const DEFAULT_WS_CONFIG = {
    port: 8080,
    maxPayload: 100 * 1024,
    clientTracking: true
};

export const DEFAULT_POLL_CONFIG = {
    interval: 50,
    readTimeout: 1000,
    retryAttempts: 3,
    retryDelay: 2000
};

export const LOG_LEVELS = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
};

// PLC Variable address formats
export const PLC_TYPES = {
    REAL: 'REAL',    // Float (4 bytes)
    INT: 'INT',      // Integer (2 bytes)
    DINT: 'DINT',    // Double Integer (4 bytes)
    BOOL: 'X'        // Boolean (bit)
};

// Default variables to read from PLC
// DB1001: status (system_byte), clock (clock_byte), pos (position)
export const DEFAULT_VARIABLES = {
    status: 'DB1001,BYTE0',    // System byte (MB1 → DBB0)
    clock: 'DB1001,BYTE1',     // Clock byte (MB0 → DBB1)
    pos: 'DB1001,BYTE2'        // Position (DBB2) - used for animations
};

// Variables for writing to PLC
// DB1002: write value
export const WRITE_VARIABLES = {
    read: 'DB1002,BYTE0'     // Writable value in DB1002 (variable "read" in TIA Portal)
};
