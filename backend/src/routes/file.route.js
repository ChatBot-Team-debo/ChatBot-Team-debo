import express from 'express';
import multer from 'multer';
import path from 'path';
import { protectRoute } from '../middleware/auth.middleware.js';
import { uploadFile, sendUdpMessageController, getChatFiles } from '../controllers/file.controller.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'temp'));
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Create temp directory if it doesn't exist
import fs from 'fs';
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ storage });

// Routes for file operations
router.post('/upload/:receiverId', protectRoute, upload.single('file'), uploadFile);
router.post('/udp/:id', protectRoute, sendUdpMessageController);
router.get('/list/:id', protectRoute, getChatFiles);

export default router;