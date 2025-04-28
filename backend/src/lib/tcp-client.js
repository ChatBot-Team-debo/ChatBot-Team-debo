import net from 'net';
import fs from 'fs';
import path from 'path';
import threadPool from './thread-pool.js';
import { getReceiverSocketId, io } from './socket.js';

/**
 * فئة لإدارة اتصالات TCP لنقل الملفات
 * تستخدم هذه الفئة لإرسال واستقبال الملفات عبر بروتوكول TCP
 * الذي يوفر نقل موثوق للبيانات
 */
class TcpClient {
  constructor(port = 41235) {
    this.port = port;
    this.serverAddress = '127.0.0.1';
    this.serverPort = port;
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    
    // إنشاء مجلد التحميلات إذا لم يكن موجودًا
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  /**
   * إرسال ملف عبر TCP
   * @param {string} filePath - مسار الملف المراد إرساله
   * @param {Object} fileInfo - معلومات الملف (المرسل، المستقبل، اسم الملف)
   * @returns {Promise} وعد يتم حله عند إرسال الملف
   */
  sendFile(filePath, fileInfo) {
    return new Promise((resolve, reject) => {
      // قراءة الملف باستخدام مجموعة العمال لتحسين الأداء
      threadPool.processFile(filePath, (fileData) => {
        return fileData;
      }).then(result => {
        if (!result.success) {
          return reject(new Error(`فشل في قراءة الملف: ${result.error}`));
        }
        
        const fileData = result.result;
        const client = new net.Socket();
        
        client.connect(this.serverPort, this.serverAddress, () => {
          console.log('متصل بخادم TCP');
          
          // إرسال معلومات الملف أولاً
          const metaData = JSON.stringify(fileInfo) + '\n';
          client.write(metaData);
          
          // ثم إرسال محتوى الملف
          client.write(fileData);
          client.end();
        });
        
        client.on('close', () => {
          console.log('تم إغلاق اتصال TCP');
          resolve();
        });
        
        client.on('error', (err) => {
          console.error('خطأ في اتصال TCP:', err);
          reject(err);
        });
      }).catch(err => {
        reject(err);
      });
    });
  }

  /**
   * معالجة ملف مستلم
   * @param {Buffer} fileData - بيانات الملف
   * @param {Object} fileInfo - معلومات الملف
   * @returns {Promise} وعد يتم حله عند معالجة الملف
   */
  processReceivedFile(fileData, fileInfo) {
    return new Promise((resolve, reject) => {
      const fileName = `${Date.now()}-${fileInfo.fileName}`;
      const filePath = path.join(this.uploadsDir, fileName);
      
      fs.writeFile(filePath, fileData, (err) => {
        if (err) {
          console.error('خطأ في حفظ الملف المستلم:', err);
          return reject(err);
        }
        
        console.log(`تم حفظ الملف: ${filePath}`);
        
        // إشعار المستلم بالملف
        const fileUrl = `/uploads/${fileName}`;
        
        if (fileInfo.chatRoomId) {
          // إذا كان الملف مرسل إلى غرفة دردشة
          // هنا يمكن إضافة منطق لإشعار جميع المشاركين في الغرفة
        } else {
          // إشعار المستلم المباشر
          const receiverSocketId = getReceiverSocketId(fileInfo.receiverId);
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('fileReceived', {
              senderId: fileInfo.senderId,
              fileName: fileInfo.fileName,
              fileUrl,
              timestamp: new Date()
            });
          }
        }
        
        resolve(fileUrl);
      });
    });
  }
}

// إنشاء مثيل واحد من عميل TCP للاستخدام في جميع أنحاء التطبيق
const tcpClient = new TcpClient();

export default tcpClient;