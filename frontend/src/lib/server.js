// server.js - Backend server implementation with UDP, TCP, and Threading support
import { Server } from 'socket.io';
import dgram from 'dgram';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// Configuration
const TCP_PORT = 8080;
const UDP_PORT = 8081;
const MAX_WORKERS = 4; // Number of worker threads to handle connections

/**
 * Worker Thread Implementation
 * Each worker handles a subset of client connections
 */
class ConnectionWorker {
  constructor(workerId) {
    this.workerId = workerId;
    this.clients = new Map();
    this.active = true;
  }

  // Handle incoming messages from clients
  handleMessage(clientId, message) {
    console.log(`Worker ${this.workerId} handling message from client ${clientId}`);
    
    // Process message based on type
    switch(message.type) {
      case 'chat':
        this.broadcastMessage(clientId, message);
        break;
      case 'status':
        this.updateClientStatus(clientId, message);
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  // Broadcast message to relevant clients
  broadcastMessage(senderId, message) {
    // In a real implementation, this would determine which clients should receive the message
    this.clients.forEach((client, clientId) => {
      if (clientId !== senderId && client.active) {
        // Send message back to main thread for delivery
        parentPort.postMessage({
          type: 'send',
          clientId,
          message
        });
      }
    });
  }

  // Update client status
  updateClientStatus(clientId, statusData) {
    const client = this.clients.get(clientId);
    if (client) {
      client.status = statusData.status;
      console.log(`Client ${clientId} status updated to ${statusData.status}`);
    }
  }

  // Add a new client to this worker
  addClient(clientId, clientData) {
    this.clients.set(clientId, {
      ...clientData,
      active: true,
      lastSeen: Date.now()
    });
    console.log(`Worker ${this.workerId} added client ${clientId}`);
  }

  // Remove a client from this worker
  removeClient(clientId) {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      console.log(`Worker ${this.workerId} removed client ${clientId}`);
    }
  }
}

/**
 * If this is a worker thread, set up the worker
 */
if (!isMainThread) {
  const { workerId } = workerData;
  const worker = new ConnectionWorker(workerId);
  
  // Listen for messages from the main thread
  parentPort.on('message', (data) => {
    switch(data.type) {
      case 'add-client':
        worker.addClient(data.clientId, data.clientData);
        break;
      case 'remove-client':
        worker.removeClient(data.clientId);
        break;
      case 'message':
        worker.handleMessage(data.clientId, data.message);
        break;
      case 'shutdown':
        // Clean shutdown
        worker.active = false;
        parentPort.postMessage({ type: 'shutdown-complete', workerId });
        break;
    }
  });
  
  // Notify main thread that worker is ready
  parentPort.postMessage({ type: 'ready', workerId });
}

/**
 * Main Server Class
 * Handles both TCP and UDP connections and distributes work to worker threads
 */
export class ChatServer {
  constructor() {
    this.tcpServer = null;
    this.udpServer = null;
    this.workers = [];
    this.clientWorkerMap = new Map(); // Maps client IDs to worker IDs
    this.onlineUsers = new Set();
    this.isRunning = false;
  }

  // Initialize and start the server
  async start() {
    if (this.isRunning) return;
    
    try {
      // Initialize worker threads
      await this.initWorkers();
      
      // Start TCP server (Socket.IO)
      this.startTcpServer();
      
      // Start UDP server
      this.startUdpServer();
      
      this.isRunning = true;
      console.log(`Chat server running - TCP: ${TCP_PORT}, UDP: ${UDP_PORT}`);
    } catch (error) {
      console.error('Failed to start server:', error);
      this.shutdown();
    }
  }

  // Initialize worker threads
  async initWorkers() {
    const workerPromises = [];
    
    for (let i = 0; i < MAX_WORKERS; i++) {
      workerPromises.push(this.createWorker(i));
    }
    
    this.workers = await Promise.all(workerPromises);
    console.log(`Initialized ${this.workers.length} worker threads`);
  }

  // Create a single worker thread
  createWorker(workerId) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { workerId }
      });
      
      worker.on('message', (message) => {
        if (message.type === 'ready') {
          resolve({
            id: workerId,
            worker,
            clientCount: 0
          });
        } else if (message.type === 'send') {
          // Forward messages to clients
          this.sendMessageToClient(message.clientId, message.message);
        }
      });
      
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker ${workerId} exited with code ${code}`);
        }
      });
    });
  }

  // Start TCP server using Socket.IO
  startTcpServer() {
    this.tcpServer = new Server(TCP_PORT, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    this.tcpServer.on('connection', (socket) => {
      const clientId = socket.id;
      const userId = socket.handshake.query.userId;
      
      console.log(`New TCP connection: ${clientId}, User: ${userId}`);
      
      // Add user to online users
      this.onlineUsers.add(userId);
      
      // Assign to least busy worker
      const workerId = this.assignWorker();
      this.clientWorkerMap.set(clientId, workerId);
      
      // Send client info to worker
      this.sendToWorker(workerId, {
        type: 'add-client',
        clientId,
        clientData: {
          userId,
          connectionType: 'tcp',
          socket: null // Can't send socket to worker
        }
      });
      
      // Broadcast online users
      this.broadcastOnlineUsers();
      
      // Handle messages
      socket.on('message', (message) => {
        const workerId = this.clientWorkerMap.get(clientId);
        if (workerId !== undefined) {
          this.sendToWorker(workerId, {
            type: 'message',
            clientId,
            message
          });
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`TCP client disconnected: ${clientId}`);
        
        // Remove from worker
        const workerId = this.clientWorkerMap.get(clientId);
        if (workerId !== undefined) {
          this.sendToWorker(workerId, {
            type: 'remove-client',
            clientId
          });
          this.clientWorkerMap.delete(clientId);
        }
        
        // Remove from online users
        this.onlineUsers.delete(userId);
        
        // Broadcast online users
        this.broadcastOnlineUsers();
      });
    });
  }

  // Start UDP server
  startUdpServer() {
    this.udpServer = dgram.createSocket('udp4');
    
    this.udpServer.on('error', (err) => {
      console.error(`UDP server error: ${err.message}`);
      this.udpServer.close();
    });
    
    this.udpServer.on('message', (msg, rinfo) => {
      try {
        const message = JSON.parse(msg.toString());
        const { clientId, userId } = message;
        
        // For UDP, we need to track the client's address and port
        if (!this.clientWorkerMap.has(clientId)) {
          // New UDP client
          const workerId = this.assignWorker();
          this.clientWorkerMap.set(clientId, workerId);
          
          // Send client info to worker
          this.sendToWorker(workerId, {
            type: 'add-client',
            clientId,
            clientData: {
              userId,
              connectionType: 'udp',
              address: rinfo.address,
              port: rinfo.port
            }
          });
        }
        
        // Process message
        const workerId = this.clientWorkerMap.get(clientId);
        if (workerId !== undefined) {
          this.sendToWorker(workerId, {
            type: 'message',
            clientId,
            message
          });
        }
      } catch (error) {
        console.error('Error processing UDP message:', error);
      }
    });
    
    this.udpServer.on('listening', () => {
      const address = this.udpServer.address();
      console.log(`UDP server listening on ${address.address}:${address.port}`);
    });
    
    this.udpServer.bind(UDP_PORT);
  }

  // Assign a client to the least busy worker
  assignWorker() {
    let leastBusyWorker = this.workers[0];
    
    for (const worker of this.workers) {
      if (worker.clientCount < leastBusyWorker.clientCount) {
        leastBusyWorker = worker;
      }
    }
    
    leastBusyWorker.clientCount++;
    return leastBusyWorker.id;
  }

  // Send a message to a worker
  sendToWorker(workerId, message) {
    const worker = this.workers.find(w => w.id === workerId);
    if (worker) {
      worker.worker.postMessage(message);
    }
  }

  // Send a message to a client
  sendMessageToClient(clientId, message) {
    // Find the client's socket or UDP info
    const socket = this.tcpServer.sockets.sockets.get(clientId);
    
    if (socket) {
      // TCP client
      socket.emit('message', message);
    } else {
      // Could be a UDP client - would need to track UDP client addresses
      // this.sendUdpMessage(clientAddress, clientPort, message);
    }
  }

  // Broadcast online users to all connected clients
  broadcastOnlineUsers() {
    const userIds = Array.from(this.onlineUsers);
    this.tcpServer.emit('getOnlineUsers', userIds);
  }

  // Gracefully shut down the server
  async shutdown() {
    if (!this.isRunning) return;
    
    console.log('Shutting down chat server...');
    
    // Close TCP server
    if (this.tcpServer) {
      await new Promise(resolve => this.tcpServer.close(resolve));
    }
    
    // Close UDP server
    if (this.udpServer) {
      await new Promise(resolve => this.udpServer.close(resolve));
    }
    
    // Terminate workers
    const workerShutdownPromises = this.workers.map(worker => {
      return new Promise(resolve => {
        worker.worker.on('message', (message) => {
          if (message.type === 'shutdown-complete' && message.workerId === worker.id) {
            resolve();
          }
        });
        
        worker.worker.postMessage({ type: 'shutdown' });
      });
    });
    
    await Promise.all(workerShutdownPromises);
    
    this.isRunning = false;
    console.log('Chat server shutdown complete');
  }
}

// Create a singleton instance
const chatServer = new ChatServer();
export default chatServer;