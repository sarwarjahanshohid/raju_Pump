const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

const wss = new WebSocket.Server({ server });

let esp32Client = null;
const webClients = new Set();

wss.on('connection', (ws) => {
    console.log('A client connected. Waiting for identification...');

    // A flag to check if the client has been identified
    ws.isIdentified = false;

    const identificationTimeout = setTimeout(() => {
        if (!ws.isIdentified) {
            console.log('Client did not identify. Assuming it is a web client.');
            webClients.add(ws);
            ws.isIdentified = true;
            // Send the current ESP32 status to the new web client
            const espStatus = (esp32Client && esp32Client.readyState === WebSocket.OPEN) ? 'online' : 'offline';
            ws.send(JSON.stringify({ type: 'espStatus', status: espStatus }));
        }
    }, 2000); // Wait 2 seconds for identification

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message.toString());
            return;
        }

        if (data.type === 'esp32-identify' && !ws.isIdentified) {
            clearTimeout(identificationTimeout);
            console.log('ESP32 client identified.');
            esp32Client = ws;
            ws.isIdentified = true;
            
            // Notify all web clients that the ESP32 is now online
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'espStatus', status: 'online' }));
                }
            });

        } else if (data.type === 'command' && ws !== esp32Client) {
            // Forward command from a web client to the ESP32
            if (esp32Client && esp32Client.readyState === WebSocket.OPEN) {
                console.log('Forwarding command to ESP32:', message.toString());
                esp32Client.send(message.toString());
            } else {
                 console.log('Command received, but ESP32 is not connected.');
            }
        } else if (data.type === 'statusUpdate' && ws === esp32Client) {
            // Forward status from ESP32 to all web clients
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                }
            });
        }
    });

    ws.on('close', () => {
        clearTimeout(identificationTimeout);
        if (ws === esp32Client) {
            console.log('ESP32 client disconnected.');
            esp32Client = null;
            // Notify all web clients that the ESP32 is now offline
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

