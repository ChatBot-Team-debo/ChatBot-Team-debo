import { processChatOperations } from '../lib/threading.js';
import { getReceiverSocketId, io } from '../lib/socket.js';
import User from '../models/user.model.js';
import Message from '../models/message.model.js';
import ChatRoom from '../models/chatroom.model.js';

// Controller for creating and managing chat rooms
export const createChatRoom = async (req, res) => {
  try {
    const { name, participants } = req.body;
    const creatorId = req.user._id;
    
    // Validate input
    if (!name || !participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'Invalid chat room data' });
    }
    
    // Add creator to participants if not already included
    if (!participants.includes(creatorId.toString())) {
      participants.push(creatorId.toString());
    }
    
    // Verify all participants exist
    const users = await User.find({ _id: { $in: participants } });
    if (users.length !== participants.length) {
      return res.status(400).json({ error: 'One or more participants do not exist' });
    }
    
    // Create a new chat room
    const isGroupChat = participants.length > 2;
    
    const newChatRoom = new ChatRoom({
      name,
      participants,
      creatorId,
      isGroupChat
    });
    
    // Save the chat room using threading for better performance
    const operations = [
      {
        id: 'saveRoom',
        function: `async (data) => {
          const { chatRoomData } = data;
          
          // In a real implementation, this would be a database save operation
          // We're simulating the save operation here
          const chatRoom = chatRoomData;
          chatRoom.id = chatRoom._id;
          
          return chatRoom;
        }`,
        data: { chatRoomData: newChatRoom }
      }
    ];
    
    // Save the chat room to the database
    await newChatRoom.save();
    
    const results = await processChatOperations(operations);
    const roomResult = results.find(r => r.id === 'saveRoom');
    
    if (!roomResult || !roomResult.success) {
      throw new Error(roomResult?.error || 'Failed to process chat room');
    }
    
    const chatRoom = newChatRoom;
    
    // Notify all participants about the new chat room
    participants.forEach(participantId => {
      const socketId = getReceiverSocketId(participantId);
      if (socketId) {
        io.to(socketId).emit('newChatRoom', chatRoom);
      }
    });
    
    res.status(201).json(chatRoom);
    
  } catch (error) {
    console.error('Error in createChatRoom controller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller for managing chat controls (typing indicators, read receipts, etc.)
export const updateChatControls = async (req, res) => {
  try {
    const { chatId, action, data } = req.body;
    const userId = req.user._id;
    
    // Validate input
    if (!chatId || !action) {
      return res.status(400).json({ error: 'Invalid chat control data' });
    }
    
    // Handle different chat control actions
    switch (action) {
      case 'typing':
        // Notify chat participants that user is typing
        const typingData = {
          userId: userId.toString(),
          chatId,
          isTyping: data?.isTyping || true
        };
        
        // Get all participants in this chat (in a real app, you'd query the ChatRoom model)
        // For now, we'll use a dummy list with the receiver ID from the request
        const participants = [data.receiverId];
        
        participants.forEach(participantId => {
          if (participantId !== userId.toString()) {
            const socketId = getReceiverSocketId(participantId);
            if (socketId) {
              io.to(socketId).emit('typingIndicator', typingData);
            }
          }
        });
        
        res.status(200).json({ success: true });
        break;
        
      case 'readReceipt':
        // Mark messages as read
        // In a real implementation, you would update the Message model
        // For now, we'll just notify the sender
        
        if (!data.messageIds || !Array.isArray(data.messageIds)) {
          return res.status(400).json({ error: 'Invalid message IDs' });
        }
        
        // Get the sender ID of these messages (in a real app, query the Message model)
        // For now, we'll use the receiverId from the request data
        const senderId = data.senderId;
        
        const readReceiptData = {
          userId: userId.toString(),
          chatId,
          messageIds: data.messageIds,
          timestamp: new Date()
        };
        
        const senderSocketId = getReceiverSocketId(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('readReceipt', readReceiptData);
        }
        
        res.status(200).json({ success: true });
        break;
        
      default:
        res.status(400).json({ error: 'Unknown action' });
    }
    
  } catch (error) {
    console.error('Error in updateChatControls controller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller for getting chat statistics and information
export const getChatInfo = async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Find the chat room by ID
    const chatRoom = await ChatRoom.findById(chatId).populate('participants', '-password');
    
    if (!chatRoom) {
      // If no chat room found, this might be a direct chat
      // Get message count between two users
      const messageCount = await Message.countDocuments({
        $or: [
          { senderId: req.user._id, receiverId: chatId },
          { senderId: chatId, receiverId: req.user._id }
        ]
      });
      
      // Get the first message timestamp
      const firstMessage = await Message.findOne({
        $or: [
          { senderId: req.user._id, receiverId: chatId },
          { senderId: chatId, receiverId: req.user._id }
        ]
      }).sort({ createdAt: 1 });
      
      // Get chat partner info
      const chatPartner = await User.findById(chatId).select('-password');
      
      if (!chatPartner) {
        return res.status(404).json({ error: 'Chat partner not found' });
      }
      
      const chatInfo = {
        chatId,
        chatPartner,
        messageCount,
        firstMessageAt: firstMessage?.createdAt || null,
        chatDuration: firstMessage ? Date.now() - new Date(firstMessage.createdAt).getTime() : 0,
        isGroupChat: false
      };
      
      return res.status(200).json(chatInfo);
    }
    
    // For group chats, get message count
    const messageCount = await Message.countDocuments({
      $or: [
        // Messages sent to this chat room would need a chatRoomId field
        // This is a simplified version
        { chatRoomId: chatId }
      ]
    });
    
    const chatInfo = {
      chatId: chatRoom._id,
      name: chatRoom.name,
      participants: chatRoom.participants,
      creatorId: chatRoom.creatorId,
      messageCount,
      createdAt: chatRoom.createdAt,
      isGroupChat: chatRoom.isGroupChat,
      lastUpdated: chatRoom.updatedAt
    };
    
    res.status(200).json(chatInfo);
    
  } catch (error) {
    console.error('Error in getChatInfo controller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};