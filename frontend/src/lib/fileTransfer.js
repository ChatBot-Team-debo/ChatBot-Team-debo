// fileTransfer.js - File transfer implementation using UDP and TCP with threading
import networkManager from './networking';

// Constants for file transfer
const CHUNK_SIZE = 65536; // 64KB chunks for UDP
const MAX_RETRY_COUNT = 3;
const RETRY_TIMEOUT = 3000; // 3 seconds

/**
 * FileTransferManager handles sending and receiving files
 * Uses TCP for control messages and metadata
 * Uses UDP for actual file chunks (faster transfer)
 * Falls back to TCP for reliability when needed
 */
export class FileTransferManager {
  constructor() {
    this.transfers = new Map(); // Track ongoing transfers
    this.listeners = new Map(); // Event listeners
    this.initialized = false;
    this.transferWorker = null;
  }

  /**
   * Initialize the file transfer manager
   */
  init() {
    if (this.initialized) return;
    
    // Set up event listeners for incoming file transfers
    networkManager.onMessage(this.handleNetworkMessage.bind(this));
    
    // Initialize web worker for background processing
    this.initWorker();
    
    this.initialized = true;
  }

  /**
   * Initialize web worker for background file processing
   */
  initWorker() {
    if (!window.Worker) {
      console.warn('Web Workers not supported, file transfers will run in main thread');
      return;
    }
    
    // Create worker code as a blob
    const workerCode = `
      // File transfer worker
      let activeTransfers = new Map();
      
      // Handle messages from main thread
      self.onmessage = function(e) {
        const { type, data } = e.data;
        
        switch(type) {
          case 'process-file':
            processFile(data.fileId, data.file, data.receiverId);
            break;
          case 'process-chunk':
            processChunk(data.transferId, data.chunk, data.chunkIndex, data.metadata);
            break;
          case 'abort-transfer':
            abortTransfer(data.transferId);
            break;
        }
      };
      
      // Process a file for sending
      function processFile(fileId, file, receiverId) {
        const transferId = fileId + '-' + Date.now();
        const totalChunks = Math.ceil(file.size / ${CHUNK_SIZE});
        
        // Store transfer information
        activeTransfers.set(transferId, {
          fileId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          receiverId,
          totalChunks,
          sentChunks: 0,
          status: 'processing'
        });
        
        // Send metadata via TCP (reliable)
        self.postMessage({
          type: 'send-metadata',
          transferId,
          metadata: {
            transferId,
            fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            totalChunks,
            timestamp: Date.now()
          },
          receiverId
        });
        
        // Start reading file in chunks
        readFileChunks(transferId, file);
      }
      
      // Read file in chunks and send each chunk
      function readFileChunks(transferId, file) {
        const transfer = activeTransfers.get(transferId);
        if (!transfer || transfer.status === 'aborted') return;
        
        const fileReader = new FileReader();
        let chunkIndex = 0;
        
        fileReader.onload = function(e) {
          if (transfer.status === 'aborted') return;
          
          // Send chunk via UDP
          self.postMessage({
            type: 'send-chunk',
            transferId,
            chunkIndex,
            chunk: e.target.result,
            isLast: chunkIndex === transfer.totalChunks - 1,
            receiverId: transfer.receiverId
          });
          
          transfer.sentChunks++;
          
          // Update progress
          self.postMessage({
            type: 'progress-update',
            transferId,
            progress: Math.round((transfer.sentChunks / transfer.totalChunks) * 100)
          });
          
          // Read next chunk
          chunkIndex++;
          if (chunkIndex < transfer.totalChunks) {
            readNextChunk();
          } else {
            transfer.status = 'complete';
            self.postMessage({
              type: 'transfer-complete',
              transferId,
              success: true
            });
          }
        };
        
        fileReader.onerror = function() {
          transfer.status = 'error';
          self.postMessage({
            type: 'transfer-error',
            transferId,
            error: 'Error reading file'
          });
        };
        
        function readNextChunk() {
          const start = chunkIndex * ${CHUNK_SIZE};
          const end = Math.min(start + ${CHUNK_SIZE}, file.size);
          const chunk = file.slice(start, end);
          fileReader.readAsArrayBuffer(chunk);
        }
        
        // Start reading the first chunk
        readNextChunk();
      }
      
      // Process received chunk
      function processChunk(transferId, chunk, chunkIndex, metadata) {
        // In a real implementation, this would reassemble the file
        // For now, just report progress
        self.postMessage({
          type: 'chunk-received',
          transferId,
          chunkIndex,
          totalChunks: metadata.totalChunks,
          progress: Math.round((chunkIndex + 1) / metadata.totalChunks * 100)
        });
        
        // If this is the last chunk, complete the transfer
        if (chunkIndex === metadata.totalChunks - 1) {
          self.postMessage({
            type: 'receive-complete',
            transferId,
            metadata
          });
        }
      }
      
      // Abort an active transfer
      function abortTransfer(transferId) {
        const transfer = activeTransfers.get(transferId);
        if (transfer) {
          transfer.status = 'aborted';
          activeTransfers.delete(transferId);
          
          self.postMessage({
            type: 'transfer-aborted',
            transferId
          });
        }
      }
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.transferWorker = new Worker(URL.createObjectURL(blob));
    
    // Set up worker message handler
    this.transferWorker.onmessage = (e) => {
      const { type, ...data } = e.data;
      
      switch(type) {
        case 'send-metadata':
          this.sendFileMetadata(data.transferId, data.metadata, data.receiverId);
          break;
        case 'send-chunk':
          this.sendFileChunk(data.transferId, data.chunkIndex, data.chunk, 
                           data.isLast, data.receiverId);
          break;
        case 'progress-update':
          this.emitEvent('progress', {
            transferId: data.transferId,
            progress: data.progress
          });
          break;
        case 'transfer-complete':
          this.emitEvent('complete', {
            transferId: data.transferId,
            success: data.success
          });
          break;
        case 'transfer-error':
          this.emitEvent('error', {
            transferId: data.transferId,
            error: data.error
          });
          break;
        case 'chunk-received':
          this.emitEvent('receive-progress', {
            transferId: data.transferId,
            progress: data.progress
          });
          break;
        case 'receive-complete':
          this.completeFileReceive(data.transferId, data.metadata);
          break;
        case 'transfer-aborted':
          this.emitEvent('aborted', {
            transferId: data.transferId
          });
          break;
      }
    };
  }

  /**
   * Handle incoming network messages related to file transfers
   */
  handleNetworkMessage(message) {
    if (!message || typeof message !== 'object') return;
    
    switch(message.type) {
      case 'file-metadata':
        // Incoming file transfer metadata
        this.handleIncomingFileMetadata(message.metadata, message.senderId);
        break;
      case 'file-chunk':
        // Incoming file chunk
        this.handleIncomingFileChunk(
          message.transferId,
          message.chunkIndex,
          message.chunk,
          message.metadata
        );
        break;
      case 'file-chunk-ack':
        // Acknowledgment for a chunk
        this.handleChunkAcknowledgment(
          message.transferId,
          message.chunkIndex,
          message.status
        );
        break;
      case 'file-transfer-cancel':
        // Cancel a file transfer
        this.cancelTransfer(message.transferId);
        break;
    }
  }

  /**
   * Send a file to another user
   * @param {File} file - The file to send
   * @param {string} receiverId - Recipient's user ID
   * @returns {string} Transfer ID for tracking
   */
  sendFile(file, receiverId) {
    if (!this.initialized) this.init();
    
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.transferWorker) {
      // Use worker for background processing
      this.transferWorker.postMessage({
        type: 'process-file',
        data: {
          fileId,
          file,
          receiverId
        }
      });
    } else {
      // Fallback to main thread processing
      // This would implement similar logic to the worker
      console.warn('Using main thread for file transfer - may affect performance');
      // Implementation would mirror the worker's processFile function
    }
    
    return fileId;
  }

  /**
   * Send file metadata via TCP (reliable delivery)
   */
  sendFileMetadata(transferId, metadata, receiverId) {
    networkManager.sendTcpMessage({
      type: 'file-metadata',
      metadata,
      transferId,
      receiverId
    });
    
    // Store transfer information
    this.transfers.set(transferId, {
      ...metadata,
      status: 'sending',
      receiverId,
      sentChunks: new Set(),
      acknowledgedChunks: new Set(),
      retries: new Map()
    });
  }

  /**
   * Send a file chunk via UDP (faster but less reliable)
   */
  sendFileChunk(transferId, chunkIndex, chunk, isLast, receiverId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.status !== 'sending') return;
    
    // Mark chunk as sent
    transfer.sentChunks.add(chunkIndex);
    
    // Send via UDP for speed
    networkManager.sendUdpMessage({
      type: 'file-chunk',
      transferId,
      chunkIndex,
      chunk,
      isLast,
      metadata: {
        fileName: transfer.fileName,
        totalChunks: transfer.totalChunks
      },
      receiverId
    });
    
    // Set up retry timeout in case UDP fails
    const retryTimeout = setTimeout(() => {
      this.retryChunk(transferId, chunkIndex, receiverId);
    }, RETRY_TIMEOUT);
    
    transfer.retries.set(chunkIndex, {
      count: 0,
      timeout: retryTimeout
    });
  }

  /**
   * Retry sending a chunk if no acknowledgment received
   */
  retryChunk(transferId, chunkIndex, receiverId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.status !== 'sending') return;
    
    const retryInfo = transfer.retries.get(chunkIndex);
    if (!retryInfo) return;
    
    // Check if chunk was acknowledged while waiting
    if (transfer.acknowledgedChunks.has(chunkIndex)) {
      // Already acknowledged, no need to retry
      return;
    }
    
    // Increment retry count
    retryInfo.count++;
    
    if (retryInfo.count > MAX_RETRY_COUNT) {
      // Too many retries, fall back to TCP
      console.log(`Falling back to TCP for chunk ${chunkIndex} of transfer ${transferId}`);
      
      // Send via TCP for reliability
      networkManager.sendTcpMessage({
        type: 'file-chunk',
        transferId,
        chunkIndex,
        chunk: transfer.chunks[chunkIndex],
        isLast: chunkIndex === transfer.totalChunks - 1,
        metadata: {
          fileName: transfer.fileName,
          totalChunks: transfer.totalChunks
        },
        receiverId
      });
    } else {
      // Retry with UDP
      networkManager.sendUdpMessage({
        type: 'file-chunk',
        transferId,
        chunkIndex,
        chunk: transfer.chunks[chunkIndex],
        isLast: chunkIndex === transfer.totalChunks - 1,
        metadata: {
          fileName: transfer.fileName,
          totalChunks: transfer.totalChunks
        },
        receiverId
      });
      
      // Set up another retry timeout
      retryInfo.timeout = setTimeout(() => {
        this.retryChunk(transferId, chunkIndex, receiverId);
      }, RETRY_TIMEOUT);
    }
  }

  /**
   * Handle incoming file metadata
   */
  handleIncomingFileMetadata(metadata, senderId) {
    const { transferId } = metadata;
    
    // Store transfer information
    this.transfers.set(transferId, {
      ...metadata,
      status: 'receiving',
      senderId,
      receivedChunks: new Map(),
      missingChunks: new Set()
    });
    
    // Notify about incoming file
    this.emitEvent('incoming-file', {
      transferId,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      fileType: metadata.fileType,
      senderId
    });
    
    // Acknowledge metadata receipt
    networkManager.sendTcpMessage({
      type: 'file-metadata-ack',
      transferId,
      status: 'ready',
      receiverId: senderId
    });
  }

  /**
   * Handle incoming file chunk
   */
  handleIncomingFileChunk(transferId, chunkIndex, chunk, metadata) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.status !== 'receiving') return;
    
    // Store the chunk
    transfer.receivedChunks.set(chunkIndex, chunk);
    
    // Process chunk in worker if available
    if (this.transferWorker) {
      this.transferWorker.postMessage({
        type: 'process-chunk',
        data: {
          transferId,
          chunk,
          chunkIndex,
          metadata
        }
      });
    }
    
    // Send acknowledgment
    networkManager.sendTcpMessage({
      type: 'file-chunk-ack',
      transferId,
      chunkIndex,
      status: 'received',
      receiverId: transfer.senderId
    });
    
    // Check if all chunks received
    if (transfer.receivedChunks.size === transfer.totalChunks) {
      this.assembleFile(transferId);
    }
  }

  /**
   * Handle chunk acknowledgment
   */
  handleChunkAcknowledgment(transferId, chunkIndex, status) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.status !== 'sending') return;
    
    if (status === 'received') {
      // Mark chunk as acknowledged
      transfer.acknowledgedChunks.add(chunkIndex);
      
      // Clear retry timeout
      const retryInfo = transfer.retries.get(chunkIndex);
      if (retryInfo && retryInfo.timeout) {
        clearTimeout(retryInfo.timeout);
        transfer.retries.delete(chunkIndex);
      }
      
      // Check if all chunks acknowledged
      if (transfer.acknowledgedChunks.size === transfer.totalChunks) {
        transfer.status = 'complete';
        this.emitEvent('complete', {
          transferId,
          success: true
        });
      }
    }
  }

  /**
   * Assemble received file chunks into a complete file
   */
  assembleFile(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.status !== 'receiving') return;
    
    // In a real implementation, this would combine chunks into a file
    // and trigger a download or display the file
    
    transfer.status = 'complete';
    
    this.emitEvent('file-received', {
      transferId,
      fileName: transfer.fileName,
      fileType: transfer.fileType,
      fileSize: transfer.fileSize
    });
  }

  /**
   * Complete file receive process
   */
  completeFileReceive(transferId, metadata) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return;
    
    transfer.status = 'complete';
    
    this.emitEvent('file-received', {
      transferId,
      fileName: metadata.fileName,
      fileType: metadata.fileType,
      fileSize: metadata.fileSize
    });
  }

  /**
   * Cancel an ongoing transfer
   */
  cancelTransfer(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return;
    
    // Clean up resources
    if (transfer.status === 'sending') {
      // Clear all retry timeouts
      transfer.retries.forEach(retry => {
        if (retry.timeout) clearTimeout(retry.timeout);
      });
      
      // Notify the recipient
      networkManager.sendTcpMessage({
        type: 'file-transfer-cancel',
        transferId,
        receiverId: transfer.receiverId
      });
    } else if (transfer.status === 'receiving') {
      // Notify the sender
      networkManager.sendTcpMessage({
        type: 'file-transfer-cancel',
        transferId,
        receiverId: transfer.senderId
      });
    }
    
    // Abort in worker if available
    if (this.transferWorker) {
      this.transferWorker.postMessage({
        type: 'abort-transfer',
        data: { transferId }
      });
    }
    
    // Update status and notify
    transfer.status = 'cancelled';
    this.emitEvent('cancelled', { transferId });
    
    // Remove transfer after a delay
    setTimeout(() => {
      this.transfers.delete(transferId);
    }, 5000);
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return this;
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
    return this;
  }

  /**
   * Emit event to listeners
   */
  emitEvent(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in file transfer event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Cancel all active transfers
    this.transfers.forEach((transfer, transferId) => {
      this.cancelTransfer(transferId);
    });
    
    // Terminate worker
    if (this.transferWorker) {
      this.transferWorker.terminate();
      this.transferWorker = null;
    }
    
    // Clear listeners
    this.listeners.clear();
    this.initialized = false;
  }
}

// Create a singleton instance
const fileTransfer = new FileTransferManager();
export default fileTransfer;