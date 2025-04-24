import User from "../models/user.model.js";
import Message from "../models/message.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

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

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, chatRoomId } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

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

    const newMessage = new Message(messageData);
    await newMessage.save();

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
