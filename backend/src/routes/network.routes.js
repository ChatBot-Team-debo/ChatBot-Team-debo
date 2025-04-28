import express from 'express';
import { uploadFile, sendUdpMessageController, getChatFiles } from '../controllers/file.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Routes for UDP and TCP functionality
router.post('/send-file/:id', protectRoute, upload.single('file'), uploadFile);
router.post('/send-udp/:id', protectRoute, sendUdpMessageController);
router.get('/files/:id', protectRoute, getChatFiles);

export default router;