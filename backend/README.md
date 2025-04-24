# Enhanced Chat Application Backend

This backend implements a full-featured chat application with support for UDP messaging, TCP file transfers, and multi-threading capabilities.

## Features

### Network Communication

- **UDP Messaging**: Fast, low-latency messaging for real-time chat
- **TCP File Transfers**: Reliable file sharing between users
- **Socket.IO Integration**: Real-time notifications and presence detection

### Threading Support

- **Worker Thread Pool**: Efficient handling of CPU-intensive tasks
- **Concurrent Operations**: Process multiple chat operations simultaneously
- **Non-blocking File Processing**: Handle large files without blocking the main thread

### Chat Management

- **Chat Rooms**: Create and manage group conversations
- **Typing Indicators**: Real-time typing status updates
- **Read Receipts**: Track message delivery and reading status

## API Endpoints

### File Operations

- `POST /api/files/upload/:receiverId` - Upload and send a file to another user
- `POST /api/files/udp/:id` - Send a UDP message to another user
- `GET /api/files/list/:id` - Get a list of files shared in a conversation

### Chat Management

- `POST /api/chats/create` - Create a new chat room
- `POST /api/chats/controls` - Update chat controls (typing, read receipts)
- `GET /api/chats/info/:chatId` - Get information about a chat

## Network Architecture

The application uses a multi-protocol approach:

1. **HTTP/WebSockets**: For standard API requests and real-time updates
2. **UDP**: For fast, low-latency messages where delivery guarantee isn't critical
3. **TCP**: For reliable file transfers and critical data exchange

## Threading Model

The application uses a worker thread pool to handle CPU-intensive tasks:

1. **File Processing**: File uploads, downloads, and processing
2. **Chat Operations**: Concurrent processing of chat-related operations
3. **Background Tasks**: Non-blocking execution of background tasks

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm run dev
   ```

3. The server will start on the configured port (default: 5173)
   - UDP server will run on PORT+1 (default: 5174)
   - TCP server will run on PORT+2 (default: 5175)

## Environment Variables

```
MONGO_URI=your_mongodb_connection_string
PORT=5173
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

## Directory Structure

- `/lib` - Core functionality (network, threading, database)
- `/controllers` - API endpoint handlers
- `/routes` - API route definitions
- `/models` - Database models
- `/middleware` - Express middleware
- `/uploads` - File storage for shared files
- `/temp` - Temporary storage for file uploads