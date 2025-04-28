import { Worker } from 'worker_threads';
import os from 'os';

// تحديد الحد الأقصى لعدد العمال (Threads) بناءً على عدد وحدات المعالجة المركزية
const MAX_WORKERS = os.cpus().length;

/**
 * فئة لإدارة مجموعة من العمال (Thread Pool) للتعامل مع المهام المتزامنة
 * تستخدم هذه الفئة لتحسين أداء التطبيق عند التعامل مع العمليات المكثفة
 */
class ThreadPool {
  constructor(maxWorkers = MAX_WORKERS) {
    this.maxWorkers = maxWorkers;
    this.activeWorkers = 0;
    this.taskQueue = [];
  }

  /**
   * تنفيذ مهمة في خيط منفصل
   * @param {string} taskScript - كود المهمة المراد تنفيذها
   * @param {Object} taskData - البيانات المطلوبة للمهمة
   * @returns {Promise} وعد يتم حله عند اكتمال المهمة
   */
  executeTask(taskScript, taskData) {
    return new Promise((resolve, reject) => {
      const task = { taskScript, taskData, resolve, reject };
      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  /**
   * معالجة قائمة انتظار المهام
   * تقوم بتنفيذ المهام في قائمة الانتظار إذا كان هناك عمال متاحين
   */
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
        task.reject(new Error(`العامل توقف مع رمز خروج ${code}`));
        this.activeWorkers--;
        this.processQueue();
      }
    });
  }

  /**
   * تنفيذ مهمة معالجة ملف في خيط منفصل
   * @param {string} filePath - مسار الملف المراد معالجته
   * @param {Function} processingFunction - دالة المعالجة
   * @param {Object} additionalData - بيانات إضافية للمعالجة
   * @returns {Promise} وعد يتم حله عند اكتمال المهمة
   */
  processFile(filePath, processingFunction, additionalData = {}) {
    const taskScript = `
      const { parentPort, workerData } = require('worker_threads');
      const fs = require('fs');
      const path = require('path');
      
      const { filePath, processingFunction, additionalData } = workerData;
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          parentPort.postMessage({ success: false, error: err.message });
          return;
        }
        
        try {
          const result = eval(processingFunction)(data, additionalData);
          parentPort.postMessage({ success: true, result });
        } catch (error) {
          parentPort.postMessage({ success: false, error: error.message });
        }
      });
    `;
    
    return this.executeTask(taskScript, { filePath, processingFunction: processingFunction.toString(), additionalData });
  }

  /**
   * تنفيذ مجموعة من المهام بالتوازي
   * @param {Array} tasks - مصفوفة من المهام المراد تنفيذها
   * @returns {Promise} وعد يتم حله عند اكتمال جميع المهام
   */
  executeParallel(tasks) {
    return Promise.all(tasks.map(task => {
      return this.executeTask(task.script, task.data);
    }));
  }
}

// إنشاء مثيل واحد من مدير المهام للاستخدام في جميع أنحاء التطبيق
const threadPool = new ThreadPool();

export default threadPool;