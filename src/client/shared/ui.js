/**
 * UI Manager
 * Handles UI updates for all clients
 */
export class UIManager {
    constructor() {
        this.elements = {};
    }

    /**
     * Initialize UI elements
     */
    init(elementIds) {
        for (const [key, id] of Object.entries(elementIds)) {
            this.elements[key] = document.getElementById(id);
            if (!this.elements[key]) {
                console.warn(`Element with id '${id}' not found`);
            }
        }
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(connected) {
        if (this.elements.statusDot) {
            if (connected) {
                this.elements.statusDot.classList.add('connected');
            } else {
                this.elements.statusDot.classList.remove('connected');
            }
        }

        if (this.elements.statusText) {
            this.elements.statusText.textContent = connected 
                ? 'Connected to PLC' 
                : 'Reconnecting...';
        }
    }

    /**
     * Update PLC data display
     */
    updateData(data) {
        // For status, clock and pos
        if (this.elements.status && data.status !== undefined) {
            this.elements.status.textContent = data.status;
        }

        if (this.elements.clock && data.clock !== undefined) {
            this.elements.clock.textContent = data.clock;
        }

        if (this.elements.pos && data.pos !== undefined) {
            this.elements.pos.textContent = data.pos;
        }

        // Legacy support for old variables (byte1, byte2)
        if (this.elements.byte1 && data.byte1 !== undefined) {
            this.elements.byte1.textContent = data.byte1;
        }

        if (this.elements.byte2 && data.byte2 !== undefined) {
            this.elements.byte2.textContent = data.byte2;
        }

        // Legacy for position and speed
        if (this.elements.position && data.position !== undefined) {
            this.elements.position.textContent = data.position.toFixed(3);
        }

        if (this.elements.speed && data.speed !== undefined) {
            this.elements.speed.textContent = data.speed.toFixed(3);
        }

        if (this.elements.temperature && data.temperature !== undefined) {
            this.elements.temperature.textContent = data.temperature.toFixed(2);
        }
    }

    /**
     * Setup write input handler
     */
    setupWriteInput(wsClient, variableName = 'write1') {
        if (!this.elements.writeInput || !this.elements.writeButton) {
            console.warn('Write input elements not found');
            return;
        }

        const sendValue = () => {
            const value = parseInt(this.elements.writeInput.value, 10);
            
            if (isNaN(value) || value < 0 || value > 255) {
                alert('Enter a value from 0 to 255');
                return;
            }

            if (wsClient.write(variableName, value)) {
                console.log(`✅ Sent to PLC: ${variableName} = ${value}`);
                // Visual feedback
                this.elements.writeButton.textContent = '✓ Sent';
                setTimeout(() => {
                    this.elements.writeButton.textContent = 'Write';
                }, 1000);
            } else {
                alert('No connection to server');
            }
        };

        this.elements.writeButton.addEventListener('click', sendValue);
        
        // Enter key support
        this.elements.writeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendValue();
            }
        });
    }

    /**
     * Update FPS counter
     */
    updateFPS(fps) {
        if (this.elements.fps) {
            this.elements.fps.textContent = Math.round(fps);
        }
    }

    /**
     * Update latency display
     */
    updateLatency(latency) {
        if (this.elements.latency) {
            this.elements.latency.textContent = `${latency}ms`;
        }
    }

    /**
     * Update custom element
     */
    update(key, value) {
        if (this.elements[key]) {
            this.elements[key].textContent = value;
        }
    }

    /**
     * Get element
     */
    get(key) {
        return this.elements[key];
    }
}
