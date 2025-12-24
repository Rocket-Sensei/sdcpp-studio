# WebSocket Pub-Sub Example

## Backend (Node.js + ws)

```bash
npm install ws
```

```js
import { WebSocketServer } from 'ws';
import http from 'http';

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Channel subscriptions
const channels = new Map(); // channelName -> Set<ws>

wss.on('connection', (ws) => {
  ws.subscriptions = new Set();

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    switch (msg.type) {
      case 'subscribe':
        subscribe(ws, msg.channel);
        break;
      case 'unsubscribe':
        unsubscribe(ws, msg.channel);
        break;
      case 'message':
        handleClientMessage(ws, msg);
        break;
    }
  });

  ws.on('close', () => {
    ws.subscriptions.forEach((ch) => unsubscribe(ws, ch));
  });
});

function subscribe(ws, channel) {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(ws);
  ws.subscriptions.add(channel);
}

function unsubscribe(ws, channel) {
  channels.get(channel)?.delete(ws);
  ws.subscriptions.delete(channel);
}

// Broadcast to channel
function broadcast(channel, payload) {
  const subs = channels.get(channel);
  if (!subs) return;
  const msg = JSON.stringify({ channel, ...payload });
  subs.forEach((ws) => ws.readyState === 1 && ws.send(msg));
}

// Handle incoming client messages
function handleClientMessage(ws, msg) {
  console.log(`Received from client:`, msg.payload);
  // Process and optionally respond
}

server.listen(3001);

// Usage: notify frontend when image generation completes
export { broadcast };
```

```js
// Example: call from your image generation code
import { broadcast } from './websocket.js';

async function generateImage(jobId) {
  // ... long running process ...
  broadcast('jobs', { type: 'job_complete', jobId, imageUrl: '/images/result.png' });
}
```

## Frontend (React + react-use-websocket)

```bash
npm install react-use-websocket
```

```tsx
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useCallback, useEffect } from 'react';

const WS_URL = 'ws://localhost:3001';

export function useJobUpdates(onJobComplete: (data: any) => void) {
  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
  });

  // Subscribe to channel on connect
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      sendJsonMessage({ type: 'subscribe', channel: 'jobs' });
    }
  }, [readyState, sendJsonMessage]);

  // Handle incoming messages
  useEffect(() => {
    if (lastJsonMessage?.type === 'job_complete') {
      onJobComplete(lastJsonMessage);
    }
  }, [lastJsonMessage, onJobComplete]);

  // Send message to server
  const sendToServer = useCallback(
    (payload: any) => {
      sendJsonMessage({ type: 'message', payload });
    },
    [sendJsonMessage]
  );

  return { sendToServer, isConnected: readyState === ReadyState.OPEN };
}
```

```tsx
// Usage in component
function ImageGenerator() {
  const [result, setResult] = useState(null);

  const { sendToServer, isConnected } = useJobUpdates((data) => {
    setResult(data.imageUrl);
    toast.success('Image ready!');
  });

  const handleClick = () => {
    sendToServer({ action: 'ping', timestamp: Date.now() });
  };

  return (
    <div>
      <span>{isConnected ? '🟢' : '🔴'}</span>
      <button onClick={handleClick}>Send to Server</button>
      {result && <img src={result} />}
    </div>
  );
}
```

## Message Protocol

| Direction | Type | Payload |
|-----------|------|---------|
| Client → Server | `subscribe` | `{ channel }` |
| Client → Server | `unsubscribe` | `{ channel }` |
| Client → Server | `message` | `{ payload: any }` |
| Server → Client | `job_complete` | `{ channel, jobId, imageUrl }` |
