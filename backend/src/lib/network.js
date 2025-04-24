import dgram from 'dgram';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import { io, getReceiverSocketId } from './socket.js';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// UDP Server for quick message delivery
const udpServer = dgram.createSocket('udp4');

udpServer.on('error', (err) => {
  console.log(`UDP Server error:\n${err.stack}`);
  udpServer.close();
});

udpServer.on('message', (msg, rinfo) => {
  try {
    const data = JSON.parse(msg.toString());
    console.log(`UDP message from ${rinfo.address}:${rinfo.port}: ${data.text}`);
    
    // Forward the message to the appropriate socket.io client
    if (data.receiverId) {
      const receiverSocketId = getReceiverSocketId(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('udpMessage', {
          senderId: data.senderId,
          text: data.text,
          timestamp: new Date()
        });
      }
    }
  } catch (error) {
    console.error('Error processing UDP message:', error);
  }
});

udpServer.on('listening', () => {
  const address = udpServer.address();
  console.log(`UDP server listening on ${address.address}:${address.port}`);
});

// TCP Server for file transfers
const tcpServer = net.createServer((socket) => {
  console.log('Client connected to TCP server');
  
  let fileData = Buffer.alloc(0);
  let fileInfo = null;
  
  socket.on('data', (data) => {
    // If this is the first chunk, it contains file metadata
    if (!fileInfo) {
      const metaEndIndex = data.indexOf('\n');
      if (metaEndIndex !== -1) {
        const metaData = data.slice(0, metaEndIndex).toString();
        fileInfo = JSON.parse(metaData);
        
        // The rest is file data
        fileData = Buffer.concat([fileData, data.slice(metaEndIndex + 1)]);
        console.log(`Receiving file: ${fileInfo.fileName} for user: ${fileInfo.receiverId}`);
      }
    } else {
      fileData = Buffer.concat([fileData, data]);
    }
  });
  
  socket.on('end', () => {
    if (fileInfo) {
      const filePath = path.join(uploadsDir, `${Date.now()}-${fileInfo.fileName}`);
      
      // Save file using worker thread to avoid blocking the main thread
      const worker = new Worker(`
        const { parentPort, workerData } = require('worker_threads');
        const fs = require('fs');
        
        fs.writeFile(workerData.filePath, workerData.fileData, (err) => {
          if (err) {
            parentPort.postMessage({ success: false, error: err.message });
          } else {
            parentPort.postMessage({ success: true, filePath: workerData.filePath });
          }
        });
      `, { 
        eval: true,
        workerData: { 
          filePath, 
          fileData 
        }
      });
      
      worker.on('message', (result) => {
        if (result.success) {
          console.log(`File saved: ${result.filePath}`);
          
          // Notify the receiver about the file
          const receiverSocketId = getReceiverSocketId(fileInfo.receiverId);
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('fileReceived', {
              senderId: fileInfo.senderId,
              fileName: fileInfo.fileName,
              filePath: `/uploads/${path.basename(result.filePath)}`,
              timestamp: new Date()
            });
          }
        } else {
          console.error(`Error saving file: ${result.error}`);
        }
      });
      
      worker.on('error', (err) => {
        console.error('Worker error:', err);
      });
    }
    
    console.log('Client disconnected from TCP server');
  });
  
  socket.on('error', (err) => {
    console.error('TCP socket error:', err);
  });
});

// Initialize the network servers
export const initNetworkServers = (port = 3000) => {
  // Start UDP server on port+1
  udpServer.bind(port + 1);
  
  // Start TCP server on port+2
  tcpServer.listen(port + 2, () => {
    console.log(`TCP server listening on port ${port + 2}`);
  });
  
  return {
    udpServer,
    tcpServer
  };
};

// Client functions for sending messages and files
export const sendUdpMessage = (message, host = 'localhost', port = 3001) => {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const data = Buffer.from(JSON.stringify(message));
    
    client.send(data, 0, data.length, port, host, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
      client.close();
    });
  });
};

export const sendFileViaTcp = (filePath, fileInfo, host = 'localhost', port = 3002) => {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    
    client.connect(port, host, () => {
      console.log('Connected to TCP server');
      
      // First send file metadata
      const metaData = JSON.stringify(fileInfo) + '\n';
      client.write(metaData);
      
      // Then send the file data
      const fileStream = fs.createReadStream(filePath);
      
      fileStream.on('data', (chunk) => {
        client.write(chunk);
      });
      
      fileStream.on('end', () => {
        client.end();
        resolve();
      });
      
      fileStream.on('error', (err) => {
        client.destroy();
        reject(err);
      });
    });
    
    client.on('error', (err) => {
      reject(err);
    });
  });
};