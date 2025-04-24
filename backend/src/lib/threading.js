import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import path from 'path';
import os from 'os';

// Maximum number of worker threads to use
const MAX_WORKERS = os.cpus().length;

// Worker pool for handling CPU-intensive tasks
class WorkerPool {
  constructor(maxWorkers = MAX_WORKERS) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers = 0;
  }

  // Execute a task in a worker thread
  runTask(taskScript, taskData) {
    return new Promise((resolve, reject) => {
      const task = { taskScript, taskData, resolve, reject };
      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  // Process the task queue
  processQueue() {
    if (this.taskQueue.length === 0) return;
    if (this.activeWorkers >= this.maxWorkers) return;

    const task = this.taskQueue.shift();
    this.activeWorkers++;

    const worker = new Worker(task.taskScript, {
      eval: true,
      workerData: task.taskData
    });

    worker.on('message', (result) => {
      task.resolve(result);
      this.activeWorkers--;
      worker.terminate();
      this.processQueue();
    });

    worker.on('error', (err) => {
      task.reject(err);
      this.activeWorkers--;
      worker.terminate();
      this.processQueue();
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        task.reject(new Error(`Worker stopped with exit code ${code}`));
        this.activeWorkers--;
        this.processQueue();
      }
    });
  }
}

// Create a singleton worker pool
const workerPool = new WorkerPool();

// Helper function to run a task in a worker thread
export const runInWorker = (taskScript, taskData) => {
  return workerPool.runTask(taskScript, taskData);
};

// Helper function to process files in a worker thread
export const processFileInWorker = (filePath, processingFunction, additionalData = {}) => {
  const taskScript = `
    const { parentPort, workerData } = require('worker_threads');
    const fs = require('fs');
    const path = require('path');
    
    const { filePath, processingFunction, additionalData } = workerData;
    
    // Read the file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        parentPort.postMessage({ success: false, error: err.message });
        return;
      }
      
      try {
        // Execute the processing function
        const result = eval(processingFunction)(data, additionalData);
        parentPort.postMessage({ success: true, result });
      } catch (error) {
        parentPort.postMessage({ success: false, error: error.message });
      }
    });
  `;
  
  return runInWorker(taskScript, { filePath, processingFunction: processingFunction.toString(), additionalData });
};

// Helper function to handle concurrent chat operations
export const processChatOperations = async (operations) => {
  const taskScript = `
    const { parentPort, workerData } = require('worker_threads');
    const { operations } = workerData;
    
    const results = [];
    
    // Process each operation sequentially within the worker
    const processOperations = async () => {
      for (const op of operations) {
        try {
          // Execute the operation function
          const result = await eval(op.function)(op.data);
          results.push({ success: true, id: op.id, result });
        } catch (error) {
          results.push({ success: false, id: op.id, error: error.message });
        }
      }
      
      return results;
    };
    
    // Run the operations and send results back
    processOperations().then(results => {
      parentPort.postMessage(results);
    }).catch(err => {
      parentPort.postMessage([{ success: false, error: err.message }]);
    });
  `;
  
  return runInWorker(taskScript, { operations });
};

// Export the worker pool for direct access if needed
export { workerPool };