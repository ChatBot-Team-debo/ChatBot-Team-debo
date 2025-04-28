import dgram from 'dgram';
import { getReceiverSocketId, io } from './socket.js';

/**
 * فئة لإدارة اتصالات UDP للرسائل السريعة
 * تستخدم هذه الفئة لإرسال واستقبال الرسائل عبر بروتوكول UDP
 * الذي يوفر سرعة أعلى ولكن بدون ضمان وصول الرسائل
 */
class UdpClient {
  constructor(port = 41234) {
    this.port = port;
    this.client = dgram.createSocket('udp4');
    this.serverAddress = '127.0.0.1';
    this.serverPort = port;
    this.setupClient();
  }

  /**
   * إعداد عميل UDP
   */
  setupClient() {
    this.client.on('error', (err) => {
      console.error(`خطأ في عميل UDP: ${err.stack}`);
      this.client.close();
    });

    this.client.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        console.log(`رسالة UDP من ${rinfo.address}:${rinfo.port}: ${data.text}`);
        
        // إعادة توجيه الرسالة إلى العميل المناسب عبر socket.io
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
        console.error('خطأ في معالجة رسالة UDP:', error);
      }
    });

    this.client.on('listening', () => {
      const address = this.client.address();
      console.log(`عميل UDP يستمع على ${address.address}:${address.port}`);
    });
  }

  /**
   * إرسال رسالة عبر UDP
   * @param {Object} messageData - بيانات الرسالة المراد إرسالها
   * @returns {Promise} وعد يتم حله عند إرسال الرسالة
   */
  sendMessage(messageData) {
    return new Promise((resolve, reject) => {
      const message = Buffer.from(JSON.stringify(messageData));
      this.client.send(message, 0, message.length, this.serverPort, this.serverAddress, (err) => {
        if (err) {
          console.error('خطأ في إرسال رسالة UDP:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * إغلاق اتصال UDP
   */
  close() {
    this.client.close();
  }
}

// إنشاء مثيل واحد من عميل UDP للاستخدام في جميع أنحاء التطبيق
const udpClient = new UdpClient();

export default udpClient;