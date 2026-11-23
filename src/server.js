import { createServer } from 'node:http';
import app from './app.js';
import { initSocket } from './socket/index.js';

const PORT = process.env.PORT || 3000;

// Socket.io живе поверх того самого HTTP-сервера, що й Express
const httpServer = createServer(app);

await initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}`);
  console.log(`Документація API: http://localhost:${PORT}/api-docs`);
  console.log(`WebSocket: той самий порт (Socket.io), події — у README`);
});
