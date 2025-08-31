const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);

// আপনার HTML ড্যাশবোর্ডটি দেখানোর জন্য
app.use(express.static(path.join(__dirname, 'public')));

const wss = new WebSocket.Server({ 
    server,
    // যেকোনো ডোমেইন থেকে কানেকশন গ্রহণ করার জন্য
    verifyClient: (info, callback) => {
        callback(true);
    }
});

let esp32Client = null;
let webClients = new Set();

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        // ক্লায়েন্টটি ESP32 নাকি ওয়েব ড্যাশবোর্ড, তা শনাক্ত করা
        if (data.type === 'esp32-identify') {
            console.log('ESP32 identified and connected.');
            esp32Client = ws;
            // সকল ওয়েব ক্লায়েন্টকে জানানো যে ESP32 অনলাইন হয়েছে
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'espStatus', status: 'online' }));
                }
            });
        } else if (data.type === 'command' && esp32Client && esp32Client.readyState === WebSocket.OPEN) {
            // ওয়েব ক্লায়েন্ট থেকে আসা কমান্ড ESP32-কে পাঠানো
            console.log('Forwarding command to ESP32:', message.toString());
            esp32Client.send(message.toString());
        } else if (data.type === 'statusUpdate') {
            // ESP32 থেকে আসা স্ট্যাটাস সকল ওয়েব ক্লায়েন্টকে পাঠানো
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                }
            });
        } else {
            // এটি একটি ওয়েব ক্লায়েন্ট হিসেবে ধরে নেওয়া
            if (!webClients.has(ws) && ws !== esp32Client) {
                 console.log('Web client registered.');
                 webClients.add(ws);
                 // নতুন ওয়েব ক্লায়েন্টকে সাথে সাথেই ESP32-এর স্ট্যাটাস পাঠানো
                 const espStatus = (esp32Client && esp32Client.readyState === WebSocket.OPEN) ? 'online' : 'offline';
                 ws.send(JSON.stringify({ type: 'espStatus', status: espStatus }));
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (ws === esp32Client) {
            console.log('ESP32 has disconnected.');
            esp32Client = null;
            // সকল ওয়েব ক্লায়েন্টকে জানানো যে ESP32 অফলাইন হয়েছে
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'espStatus', status: 'offline' }));
                }
            });
        } else {
            webClients.delete(ws);
            console.log('Web client disconnected.');
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

