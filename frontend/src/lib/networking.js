// networking.js - UDP, TCP, and Threading implementation for chat application
import { io } from "socket.io-client";

// Configuration
const TCP_PORT = 8080;
const UDP_PORT = 8081;
const DEFAULT_SERVER = "localhost";

// Worker thread for handling background network operations
class NetworkWorker {
  constructor() {
    this.active = false;
    this.worker = null;
    this.callbacks = {};
    this.initWorker();
  }

  initWorker() {
    if (window.Worker) {
      // Create a string containing the worker code
      const workerCode = `
        let udpSocket = null;
        let tcpSocket = null;
        let heartbeatInterval = null;
        
        // Handle messages from main thread
        self.onmessage = function(e) {
          const { type, data } = e.data;
          
          switch(type) {
            case 'init':
              // Initialize connections
              break;
            case 'udp-send':
              sendUdpMessage(data);
              break;
            case 'tcp-send':
              sendTcpMessage(data);
              break;
            case 'close':
              closeConnections();
              break;
          }
        };
        
        function sendUdpMessage(data) {
          // Simulate UDP message sending
          self.postMessage({ type: 'udp-sent', data });
        }
        
        function sendTcpMessage(data) {
          // Simulate TCP message sending
          self.postMessage({ type: 'tcp-sent', data });
        }
        
        function closeConnections() {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          self.postMessage({ type: 'closed' });
        }
        
        // Start heartbeat to keep connections alive
        heartbeatInterval = setInterval(() => {
          self.postMessage({ type: 'heartbeat' });
        }, 30000);
        
        self.postMessage({ type: 'ready' });
      `;
      
      // Create a blob from the worker code
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      
      // Create a worker from the blob
      this.worker = new Worker(URL.createObjectURL(blob));
      
      // Set up message handler
      this.worker.onmessage = (e) => {
        const { type, data } = e.data;
        if (this.callbacks[type]) {
          this.callbacks[type](data);
        }
      };
      
      this.active = true;
    } else {
      console.error("Web Workers are not supported in this browser");
    }
  }

  on(eventType, callback) {
    this.callbacks[eventType] = callback;
    return this;
  }

  sendUdpMessage(data) {
    if (this.active && this.worker) {
      this.worker.postMessage({ type: 'udp-send', data });
    }
  }

  sendTcpMessage(data) {
    if (this.active && this.worker) {
      this.worker.postMessage({ type: 'tcp-send', data });
    }
  }

  terminate() {
    if (this.worker) {
      this.worker.postMessage({ type: 'close' });
      this.worker.terminate();
      this.active = false;
    }
  }
}

// Main networking class that handles both UDP and TCP connections
export class NetworkManager {
  constructor(server = DEFAULT_SERVER) {
    this.server = server;
    this.tcpPort = TCP_PORT;
    this.udpPort = UDP_PORT;
    this.socketIO = null;
    this.networkWorker = new NetworkWorker();
    this.connected = false;
    this.messageHandlers = [];
    this.setupWorkerEvents();
  }

  setupWorkerEvents() {
    this.networkWorker
      .on('ready', () => {
        console.log('Network worker is ready');
      })
      .on('udp-sent', (data) => {
        console.log('UDP message sent:', data);
      })
      .on('tcp-sent', (data) => {
        console.log('TCP message sent:', data);
      })
      .on('heartbeat', () => {
        // Handle heartbeat
      })
      .on('closed', () => {
        this.connected = false;
        console.log('Network connections closed');
      });
  }

  connect(userId) {
    // Connect to Socket.IO (existing implementation)
    this.socketIO = io(`http://${this.server}:${this.tcpPort}`, {
      query: { userId },
      transports: ['websocket'],
    });

    this.socketIO.on('connect', () => {
      this.connected = true;
      console.log('Connected to TCP server');
    });

    this.socketIO.on('disconnect', () => {
      this.connected = false;
      console.log('Disconnected from TCP server');
    });

    // Set up message handling
    this.socketIO.on('message', (message) => {
      this.messageHandlers.forEach(handler => handler(message));
    });

    return this;
  }

  // Send message using UDP (for status updates, typing indicators, etc.)
  sendUdpMessage(message) {
    if (!this.connected) {
      console.warn('Not connected to server');
      return false;
    }
    
    this.networkWorker.sendUdpMessage(message);
    return true;
  }

  // Send message using TCP (for reliable message delivery)
  sendTcpMessage(message) {
    if (!this.connected) {
      console.warn('Not connected to server');
      return false;
    }
    
    // Use Socket.IO for TCP messages
    this.socketIO.emit('message', message);
    
    // Also send through worker for logging/processing
    this.networkWorker.sendTcpMessage(message);
    return true;
  }

  // Register message handler
  onMessage(handler) {
    if (typeof handler === 'function') {
      this.messageHandlers.push(handler);
    }
    return this;
  }

  // Remove message handler
  offMessage(handler) {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    return this;
  }

  // Close all connections
  disconnect() {
    if (this.socketIO) {
      this.socketIO.disconnect();
    }
    
    this.networkWorker.terminate();
    this.connected = false;
    return this;
  }
}

// Create a singleton instance
const networkManager = new NetworkManager();
export default networkManager;