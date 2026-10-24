import { ConnectionState } from "../../shared/types.js";

/**
 * WebSocket Client Manager
 * Shared WebSocket client for all visualizations
 */
export class WSClient {
  constructor(url = null) {
    // Automatically determine WebSocket URL based on current host
    if (!url) {
      const hostname = window.location.hostname || "localhost";
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const port = 8080; // WebSocket port
      url = `${protocol}//${hostname}:${port}`;
    }

    this.url = url;
    this.socket = null;
    this.state = ConnectionState.DISCONNECTED;
    this.reconnectInterval = 3000;
    this.reconnectTimer = null;

    // Callbacks
    this.onDataCallback = null;
    this.onStatusCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
    this.onErrorCallback = null;

    console.log(`🌐 WebSocket will connect to: ${this.url}`);
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.warn("Already connected");
      return;
    }

    this.state = ConnectionState.CONNECTING;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      console.log("✅ WebSocket connected");
      this.state = ConnectionState.CONNECTED;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.onConnectCallback) {
        this.onConnectCallback();
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };

    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.state = ConnectionState.ERROR;

      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    };

    this.socket.onclose = () => {
      console.log("🔌 WebSocket disconnected");
      this.state = ConnectionState.DISCONNECTED;

      if (this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }

      // Auto-reconnect
      this.scheduleReconnect();
    };
  }

  /**
   * Handle incoming message
   */
  handleMessage(message) {
    switch (message.type) {
      case "status":
        if (this.onStatusCallback) {
          this.onStatusCallback(message);
        }
        break;

      default:
        // Data message
        if (message.data && this.onDataCallback) {
          this.onDataCallback(message.data, message.timestamp);
        }
    }
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.state = ConnectionState.RECONNECTING;
    console.log(`⏳ Reconnecting in ${this.reconnectInterval / 1000}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Send message to server
   */
  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Ping server
   */
  ping() {
    return this.send({ type: "ping" });
  }

  /**
   * Request statistics
   */
  getStats() {
    return this.send({ type: "getStats" });
  }

  /**
   * Write value to PLC
   */
  write(variable, value) {
    return this.send({
      type: "write",
      variable,
      value,
    });
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.state = ConnectionState.DISCONNECTED;
  }

  /**
   * Event handlers
   */
  onData(callback) {
    this.onDataCallback = callback;
  }

  onStatus(callback) {
    this.onStatusCallback = callback;
  }

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
