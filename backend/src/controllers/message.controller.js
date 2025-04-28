import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import ChatRoom from "../models/chatroom.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { sendUdpMessage, sendFileViaTcp } from "../lib/network.js";
import { processChatOperations } from "../lib/threading.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;
    const { chatRoomId } = req.query;

    let messages;
    
    if (chatRoomId) {
      // Get messages from a chat room
      messages = await Message.find({ chatRoomId })
        .sort({ createdAt: 1 })
        .populate('senderId', 'fullName profilePic');
      
      // Mark messages as read by this user
      await Message.updateMany(
        { 
          chatRoomId,
          senderId: { $ne: myId },
          readBy: { $ne: myId }
        },
        { $addToSet: { readBy: myId } }
      );
    } else {
      // Get direct messages between two users
      messages = await Message.find({
        $or: [
          { senderId: myId, receiverId: userToChatId },
          { senderId: userToChatId, receiverId: myId },
        ],
      }).sort({ createdAt: 1 });
      
      // Mark messages as read by this user
      await Message.updateMany(
        { 
          senderId: userToChatId, 
          receiverId: myId,
          readBy: { $ne: myId }
        },
        { $addToSet: { readBy: myId } }
      );
    }

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, chatRoomId, useUdp, file } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // If UDP is requested, send via UDP for faster delivery
    if (useUdp && text) {
      await sendUdpMessage({
        senderId: senderId.toString(),
        receiverId,
        text
      });
      
      // Create a message record to track UDP messages
      const udpMessageData = {
        senderId,
        text,
        receiverId,
        isUdpMessage: true,
        readBy: [senderId]
      };
      
      const udpMessage = new Message(udpMessageData);
      await udpMessage.save();
      
      return res.status(201).json(udpMessage);
    }

    let imageUrl;
    if (image) {
      // Upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const messageData = {
      senderId,
      text,
      image: imageUrl,
      readBy: [senderId], // Sender has read the message
    };

    // If it's a chat room message
    if (chatRoomId) {
      messageData.chatRoomId = chatRoomId;
    } else {
      // Direct message
      messageData.receiverId = receiverId;
    }

    // Use threading for better performance when saving messages
    const operations = [
      {
        id: 'saveMessage',
        function: `async (data) => {
          const { messageData } = data;
          const Message = require('mongoose').model('Message');
          const newMessage = new Message(messageData);
          await newMessage.save();
          return newMessage;
        }`,
        data: { messageData }
      }
    ];

    const results = await processChatOperations(operations);
    const messageResult = results.find(r => r.id === 'saveMessage');
    
    if (!messageResult || !messageResult.success) {
      throw new Error(messageResult?.error || 'Failed to save message');
    }
    
    const newMessage = messageResult.result;

    // If it's a chat room message, notify all participants
    if (chatRoomId) {
      // Get the chat room to find all participants
      const chatRoom = await ChatRoom.findById(chatRoomId);
      if (chatRoom) {
        chatRoom.participants.forEach(participantId => {
          if (participantId.toString() !== senderId.toString()) {
            const participantSocketId = getReceiverSocketId(participantId);
            if (participantSocketId) {
              io.to(participantSocketId).emit("newMessage", newMessage);
            }
          }
        });
      }
    } else {
      // Direct message - notify the receiver
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", newMessage);
      }
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Send a file message using TCP for reliable delivery
export const sendFileMessage = async (req, res) => {
  try {
    const { fileName, fileType, chatRoomId } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileInfo = {
      senderId: senderId.toString(),
      receiverId,
      fileName: req.file.originalname,
      chatRoomId
    };
    
    // Send file via TCP
    await sendFileViaTcp(req.file.path, fileInfo);
    
    // Create a message record for the file
    const messageData = {
      senderId,
      text: `File: ${req.file.originalname}`,
      file: `/uploads/${Date.now()}-${req.file.originalname}`,
      readBy: [senderId]
    };
    
    if (chatRoomId) {
      messageData.chatRoomId = chatRoomId;
    } else {
      messageData.receiverId = receiverId;
    }
    
    const newMessage = new Message(messageData);
    await newMessage.save();
    
    // Notify recipients
    if (chatRoomId) {
      const chatRoom = await ChatRoom.findById(chatRoomId);
      if (chatRoom) {
        chatRoom.participants.forEach(participantId => {
          if (participantId.toString() !== senderId.toString()) {
            const participantSocketId = getReceiverSocketId(participantId);
            if (participantSocketId) {
              io.to(participantSocketId).emit("newMessage", newMessage);
            }
          }
        });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", newMessage);
      }
    }
    
    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendFileMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
