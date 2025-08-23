// server.js
// =================================================================
// Node.js Real-time Server for ESP32 Motor Controller
// =================================================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const path = require('path');

// --- Configuration ---
const MONGODB_URI = 'mongodb+srv://atifsupermart202199:FGzi4j6kRnYTIyP9@cluster0.bfulggv.mongodb.net/?retryWrites=true&w=majority'; // আপনার MongoDB Atlas URI দিন
const PORT = process.env.PORT || 3000;

// --- Database Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Database Schema ---
const DeviceStatusSchema = new mongoose.Schema({
    deviceId: { type: String, default: 'esp32-motor-1' },
    motorStatus: String,
    systemMode: String,
    lastAction: String,
    registeredNumbers: [String],
    // Add other fields as needed
}, { timestamps: true });

const DeviceStatus = mongoose.model('DeviceStatus', DeviceStatusSchema);

// --- Express App Setup ---
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // 'public' ফোল্ডারে আপনার HTML ফাইলটি রাখুন

// --- HTTP Server ---
const server = http.createServer(app);

// --- WebSocket Server ---
const wss = new WebSocket.Server({ server });

let esp32Socket = null; // ESP32 এর কানেকশন রাখার জন্য

wss.on('connection', (ws) => {
    console.log('A new client connected.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Identify the client type
            if (data.type === 'esp32-identify') {
                console.log('ESP32 device connected.');
                esp32Socket = ws;
                ws.isEsp32 = true;
            } 
            else if (data.type === 'statusUpdate' && ws.isEsp32) {
                // ESP32 থেকে স্ট্যাটাস আসলে, সকল ড্যাশবোর্ড ক্লায়েন্টকে পাঠানো হবে
                console.log('Received status from ESP32:', data.payload);
                broadcastToDashboards(JSON.stringify({ type: 'statusUpdate', payload: data.payload }));
            }
            else if (data.type === 'command') {
                // ড্যাশবোর্ড থেকে কমান্ড আসলে, ESP32-কে পাঠানো হবে
                if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN) {
                    console.log('Forwarding command to ESP32:', data.command);
                    esp32Socket.send(JSON.stringify({ type: 'command', command: data.command }));
                }
            }
        } catch (e) {
            console.error('Failed to parse message or invalid message format:', message);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        if (ws.isEsp32) {
            esp32Socket = null;
            console.log('ESP32 device disconnected.');
        }
    });
});

// Function to broadcast data to all connected dashboard clients
function broadcastToDashboards(data) {
    wss.clients.forEach((client) => {
        if (client !== esp32Socket && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// --- API Endpoints (Optional, for fetching initial data) ---
app.get('/api/latest-status', async (req, res) => {
    try {
        const status = await DeviceStatus.findOne({ deviceId: 'esp32-motor-1' }).sort({ createdAt: -1 });
        res.json(status);
    } catch (err) {
        res.status(500).send('Error     dd fetching status');
    }  
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
