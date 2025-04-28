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
  try {
    // استخدام مدير المهام لتنفيذ العمليات بالتوازي
    const tasks = operations.map(operation => ({
      script: `
        const { parentPort, workerData } = require('worker_threads');
        
        const { id, function: fnString, data } = workerData;
        
        try {
          // تنفيذ الدالة المحددة
          const result = eval(fnString)(data);
          
          // إرسال النتيجة إلى الخيط الرئيسي
          if (result instanceof Promise) {
            result.then(value => {
              parentPort.postMessage({ id, success: true, result: value });
            }).catch(error => {
              parentPort.postMessage({ id, success: false, error: error.message });
            });
          } else {
            parentPort.postMessage({ id, success: true, result });
          }
        } catch (error) {
          parentPort.postMessage({ id, success: false, error: error.message });
        }
      `,
      data: operation
    }));
    
    // تنفيذ جميع المهام بالتوازي
    const results = await threadPool.executeParallel(tasks);
    
    return results;
  } catch (error) {
    console.error('Error in processChatOperations:', error);
    throw error;
  }
};
// تم استبدال الدالة القديمة بالإصدار المحسن أعلاه
/* 
export const processChatOperations_old = async (operations) => {
  const taskScript = `
    const { parentPort, workerData } = require('worker_threads');
    const { operations } = workerData;
    const results = [];
    
    // Process each operation
    for (const operation of operations) {
      try {
        const { id, function: fnString, data } = operation;
        
        // Execute the function
        const result = eval(fnString)(data);
        
        // Handle promises
        if (result instanceof Promise) {
          result.then(value => {
            results.push({ id, success: true, result: value });
          }).catch(error => {
            results.push({ id, success: false, error: error.message });
          });
        } else {
          results.push({ id, success: true, result });
        }
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }
    
    parentPort.postMessage(results);
  `;
  
  return runInWorker(taskScript, { operations });
};

/**
 * دالة مساعدة لمعالجة الملفات بشكل متزامن
 * @param {Array} files - مصفوفة من الملفات المراد معالجتها
 * @param {Function} processingFunction - دالة المعالجة
 * @returns {Promise} وعد يتم حله عند اكتمال المعالجة
 */
export const processFilesInParallel = async (files, processingFunction) => {
  try {
    const tasks = files.map(file => ({
      script: `
        const { parentPort, workerData } = require('worker_threads');
        const fs = require('fs');
        const path = require('path');
        
        const { filePath, processingFunction } = workerData;
        
        fs.readFile(filePath, (err, data) => {
          if (err) {
            parentPort.postMessage({ success: false, error: err.message, filePath });
            return;
          }
          
          try {
            const result = eval(processingFunction)(data, filePath);
            parentPort.postMessage({ success: true, result, filePath });
          } catch (error) {
            parentPort.postMessage({ success: false, error: error.message, filePath });
          }
        });
      `,
      data: { filePath: file, processingFunction: processingFunction.toString() }
    }));
    
    return await threadPool.executeParallel(tasks);
  } catch (error) {
    console.error('Error in processFilesInParallel:', error);
    throw error;
  }
};

// Export the worker pool for direct access if needed
export { workerPool };