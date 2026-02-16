import { WSClient } from '../shared/websocket.js';
import { UIManager } from '../shared/ui.js';
import { SceneWebGPU } from './scene.js';

/**
 * WebGPU Client Application
 */
class ClientWebGPU {
    constructor() {
        this.wsClient = new WSClient();
        this.uiManager = new UIManager();
        this.scene = null;
        this.frameCount = 0;
        this.lastTime = performance.now();
    }

    /**
     * Initialize application
     */
    async init() {
        // Check WebGPU support
        if (!navigator.gpu) {
            console.error('WebGPU not supported');
            alert('WebGPU is not supported in your browser. Please use Chrome 113+ or Edge 113+');
            return;
        }

        // Initialize UI
        this.uiManager.init({
            statusDot: 'statusDot',
            statusText: 'statusText',
            status: 'status',      // Status byte
            clock: 'clock',        // Clock byte
            pos: 'pos',            // Position byte (for animations)
            fps: 'fps',
            latency: 'latency',
            writeInput: 'writeInput',
            writeButton: 'writeButton'
        });

        // Initialize Three.js WebGPU scene
        const canvas = document.getElementById('canvas');
        this.scene = new SceneWebGPU(canvas);
        
        try {
            await this.scene.init();
        } catch (error) {
            console.error('Failed to initialize WebGPU:', error);
            alert('Failed to initialize WebGPU. Please check console for details.');
            return;
        }

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

            // Update scene
            this.scene.updateData(data);
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

        // Render scene
        this.scene.render();

        // Continue animation
        requestAnimationFrame(() => this.animate());
    }
}

// Start application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        const app = new ClientWebGPU();
        await app.init();
    });
} else {
    const app = new ClientWebGPU();
    app.init();
}
