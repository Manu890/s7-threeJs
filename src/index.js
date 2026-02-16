import { Server } from './server/index.js';
import { 
    DEFAULT_PLC_CONFIG, 
    DEFAULT_WS_CONFIG, 
    DEFAULT_POLL_CONFIG,
    DEFAULT_VARIABLES,
    WRITE_VARIABLES
} from './shared/constants.js';

// Merge read and write variables
const ALL_VARIABLES = {
    ...DEFAULT_VARIABLES,
    ...WRITE_VARIABLES
};

// Create and start server
const server = new Server(
    DEFAULT_PLC_CONFIG,
    DEFAULT_WS_CONFIG,
    DEFAULT_POLL_CONFIG,
    ALL_VARIABLES
);

// Start server
server.start();

// Graceful shutdown
process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
});
