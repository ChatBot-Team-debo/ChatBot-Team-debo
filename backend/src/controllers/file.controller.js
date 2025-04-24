import path from 'path';
import fs from 'fs';
import { sendFileViaTcp, sendUdpMessage } from '../lib/network.js';
import { getReceiverSocketId, io } from '../lib/socket.js';

// Controller for handling file uploads and transfers
export const uploadFile = async (req, res) => {
  try {
    const { receiverId } = req.params;
    const senderId = req.user._id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileInfo = {
      senderId: senderId.toString(),
      receiverId,
      fileName: req.file.originalname
    };
    
    // Send file via TCP
    await sendFileViaTcp(req.file.path, fileInfo);
    
    // Notify the sender that the file was sent successfully
    res.status(200).json({ 
      message: 'File sent successfully',
      fileName: req.file.originalname
    });
    
    // Clean up the temporary file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting temporary file:', err);
    });
    
  } catch (error) {
    console.error('Error in uploadFile controller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller for sending UDP messages
export const sendUdpMessageController = async (req, res) => {
  try {
    const { text } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;
    
    if (!text) {
      return res.status(400).json({ error: 'Message text is required' });
    }
    
    // Send message via UDP
    await sendUdpMessage({
      senderId: senderId.toString(),
      receiverId,
      text
    });
    
    res.status(200).json({ message: 'Message sent via UDP' });
    
  } catch (error) {
    console.error('Error in sendUdpMessage controller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to get a list of files for a chat
export const getChatFiles = async (req, res) => {
  try {
    const { id: chatPartnerId } = req.params;
    const myId = req.user._id;
    
    const uploadsDir = path.join(process.cwd(), 'uploads');
    
    // Read the uploads directory
    fs.readdir(uploadsDir, (err, files) => {
      if (err) {
        console.error('Error reading uploads directory:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      // Filter files based on filename pattern (we store user IDs in filenames)
      const chatFiles = files.filter(file => {
        // Check if filename contains both user IDs
        return (
          (file.includes(myId.toString()) && file.includes(chatPartnerId)) ||
          (file.includes(chatPartnerId) && file.includes(myId.toString()))
        );
      }).map(file => ({
        fileName: file.substring(file.indexOf('-') + 1), // Remove timestamp prefix
        filePath: `/uploads/${file}`,
        timestamp: new Date(parseInt(file.split('-')[0])) // Extract timestamp from filename
      }));
      
      res.status(200).json(chatFiles);
    });
    
  } catch (error) {
    console.error('Error in getChatFiles controller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};