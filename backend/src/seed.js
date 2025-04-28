import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/user.model.js';
import ChatRoom from './models/chatRoom.model.js';
import Message from './models/message.model.js';
import dotenv from 'dotenv';

dotenv.config();

const users = [
  {
    username: 'Diab',
    email: 'diab@example.com',
    password: 'password123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ahmed'
  },
  {
    username: 'mohammed',
    email: 'mohammed@example.com',
    password: 'password123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mohammed'
  },
  {
    username: 'sara',
    email: 'sara@example.com',
    password: 'password123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sara'
  },
  {
    username: 'fatima',
    email: 'fatima@example.com',
    password: 'password123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=fatima'
  }
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await ChatRoom.deleteMany({});
    await Message.deleteMany({});
    console.log('Cleared existing data');

    // Hash passwords and create users
    const hashedUsers = await Promise.all(
      users.map(async (user) => ({
        ...user,
        password: await bcrypt.hash(user.password, 10)
      }))
    );

    const createdUsers = await User.insertMany(hashedUsers);
    console.log('Added sample users');

    // Create chat rooms
    const chatRooms = [
      {
        name: 'General Chat',
        participants: createdUsers.map(user => user._id),
        creatorId: createdUsers[0]._id,
        isGroupChat: true
      },
      {
        name: 'Tech Talk',
        participants: [createdUsers[0]._id, createdUsers[1]._id],
        creatorId: createdUsers[0]._id,
        isGroupChat: false
      }
    ];

    const createdChatRooms = await ChatRoom.insertMany(chatRooms);
    console.log('Added chat rooms');

    // Create some initial messages
    const messages = [
      {
        senderId: createdUsers[0]._id,
        chatRoomId: createdChatRooms[0]._id,
        text: 'مرحباً بكم في الدردشة العامة!',
      },
      {
        senderId: createdUsers[1]._id,
        chatRoomId: createdChatRooms[0]._id,
        text: 'شكراً على الترحيب!',
      },
      {
        senderId: createdUsers[2]._id,
        chatRoomId: createdChatRooms[0]._id,
        text: 'أهلاً بالجميع!',
      }
    ];

    await Message.insertMany(messages);
    console.log('Added initial messages');

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase(); 