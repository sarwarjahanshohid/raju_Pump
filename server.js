const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve the static HTML dashboard
app.use(express.static(path.join(__dirname, 'public')));

const wss = new WebSocket.Server({ 
    server,
    // ** FIX: This allows connections from any origin/domain **
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

        // Identify if the client is an ESP32 or a web dashboard
        if (data.type === 'esp32-identify') {
            console.log('ESP32 identified and connected.');
            esp32Client = ws;
            // Notify all web clients that ESP32 is online
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'espStatus', status: 'online' }));
                }
            });
        } else if (data.type === 'command' && esp32Client && esp32Client.readyState === WebSocket.OPEN) {
            // Forward command from web client to ESP32
            console.log('Forwarding command to ESP32:', message.toString());
            esp32Client.send(message.toString());
        } else if (data.type === 'statusUpdate') {
            // Forward status from ESP32 to all web clients
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                }
            });
        } else if (data.type === 'gsmFeedback') {
             // Forward GSM feedback from ESP32 to all web clients
             webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                }
            });
        }
         else {
            // Assume it's a web client
            if (!webClients.has(ws) && ws !== esp32Client) {
                 console.log('Web client registered.');
                 webClients.add(ws);
                 // Immediately send ESP status to the new web client
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
            // Notify all web clients that ESP32 is offline
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
