import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { createChatRoom, updateChatControls, getChatInfo } from '../controllers/chat.controller.js';

const router = express.Router();

// Routes for chat room management
router.post('/create', protectRoute, createChatRoom);
router.post('/controls', protectRoute, updateChatControls);
router.get('/info/:chatId', protectRoute, getChatInfo);

export default router;