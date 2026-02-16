import { WSClient } from '../shared/websocket.js';
import { UIManager } from '../shared/ui.js';
import { Renderer2D } from './renderer.js';

/**
 * 2D Client Application
 */
class Client2D {
    constructor() {
        this.wsClient = new WSClient();
        this.uiManager = new UIManager();
        this.renderer = null;
        this.frameCount = 0;
        this.lastTime = performance.now();
    }

    /**
     * Initialize application
     */
    init() {
        // Initialize UI
        this.uiManager.init({
            statusDot: 'statusDot',
            statusText: 'statusText',
            status: 'status',      // Status byte (system)
            clock: 'clock',        // Clock byte
            pos: 'pos',            // Position byte (for animations)
            fps: 'fps',
            latency: 'latency',
            writeInput: 'writeInput',
            writeButton: 'writeButton'
        });

        // Initialize renderer
        const canvas = document.getElementById('canvas');
        this.renderer = new Renderer2D(canvas);

        // Setup WebSocket
        this.setupWebSocket();
        
        // Setup write input handler
        this.uiManager.setupWriteInput(this.wsClient, 'read');

        // Connect
        this.wsClient.connect();

        // Start render loop
        this.animate();
    }

    /**
     * Setup WebSocket event handlers
     */
    setupWebSocket() {
        this.wsClient.onConnect(() => {
            this.uiManager.updateConnectionStatus(true);
        });

        this.wsClient.onDisconnect(() => {
            this.uiManager.updateConnectionStatus(false);
        });

        this.wsClient.onData((data, timestamp) => {
            // Update UI
            this.uiManager.updateData(data);

            // Calculate latency
            const latency = Date.now() - timestamp;
            this.uiManager.updateLatency(latency);

            // Update renderer
            this.renderer.updateData(data);
        });

        this.wsClient.onStatus((status) => {
            console.log('Status:', status);
        });
    }

    /**
     * Animation loop
     */
    animate() {
        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;

        // Update FPS
        this.frameCount++;
        if (this.frameCount % 60 === 0) {
            const fps = 1000 / delta;
            this.uiManager.updateFPS(fps);
        }

        // Render
        this.renderer.render();

        requestAnimationFrame(() => this.animate());
    }
}

// Start application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const app = new Client2D();
        app.init();
    });
} else {
    const app = new Client2D();
    app.init();
}
