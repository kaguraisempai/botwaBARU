const { Client, LocalAuth } = require('whatsapp-web.js');
const { handleMessage } = require('./case');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SESSION_DIR = path.join(__dirname, 'session');
const BOTS_CONFIG_PATH = path.join(__dirname, 'bots.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const bots = {}; // In-memory object
const numberToClientId = {}; // Mapping nomor bot ke clientId

app.use(cookieParser());

// Pastikan folder session ada
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// --- Persistence Functions ---
function getBotsConfig() {
    if (!fs.existsSync(BOTS_CONFIG_PATH)) return {};
    try {
        const rawData = fs.readFileSync(BOTS_CONFIG_PATH);
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Error reading bots.json:", error);
        return {};
    }
}

function saveBotsConfig() {
    const configToSave = {};
    for (const clientId in bots) {
        configToSave[clientId] = {
            owners: bots[clientId].owners,
            fromMeEnabled: bots[clientId].fromMeEnabled
        };
    }
    fs.writeFileSync(BOTS_CONFIG_PATH, JSON.stringify(configToSave, null, 2));
}

// --- Express Server ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Bot Management ---
function createBot(clientId, config = {}) {
    if (bots[clientId]) return;
    console.log(`[${clientId}] Creating bot...`);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-gpu', '--no-first-run', '--no-zygote',
                '--disable-accelerated-2d-canvas', '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'
            ]
        }
    });

    bots[clientId] = {
        client,
        status: 'Initializing',
        owners: config.owners || [],
        fromMeEnabled: config.fromMeEnabled || false,
        name: null, number: null, chatCount: null
    };

    client.on('qr', (qr) => {
        console.log(`[${clientId}] QR code received, generating image...`);
        qrcode.toDataURL(qr, (err, url) => {
            if (!err) io.emit('qr_image', { clientId, src: url });
        });
    });

    client.on('ready', async () => {
        console.log(`[${clientId}] Client is ready!`);
        const info = client.info;
        bots[clientId].status = 'Ready';
        bots[clientId].name = info.pushname;
        bots[clientId].number = info.wid.user;
        numberToClientId[info.wid.user] = clientId;
        const chats = await client.getChats();
        bots[clientId].chatCount = chats.length;
        // Ambil gambar profil
        try {
            const url = await client.getProfilePicUrl(info.wid._serialized);
            bots[clientId].profilePicUrl = url;
        } catch (e) {
            bots[clientId].profilePicUrl = '';
        }
        updateBotList();
    });

    client.on('disconnected', (reason) => {
        console.log(`[${clientId}] Client was logged out:`, reason);
        bots[clientId].status = 'Disconnected';
        updateBotList();
    });

    // Tambahkan event listener untuk pesan masuk
    client.on('message', async (message) => {
        try {
            await handleMessage(client, message, { bots, numberToClientId });
        } catch (err) {
            console.error(`[${clientId}] Error in handleMessage:`, err);
        }
    });

    client.initialize().catch(err => {
        console.error(`[${clientId}] Initialization error:`, err);
        bots[clientId].status = `Error: Init Failed`;
        updateBotList();
        // Kirim error ke frontend jika ada socket
        io.emit('bot_error', { clientId, error: err.message || String(err) });
    });

    updateBotList();
}

function deleteBot(clientId) {
    if (bots[clientId]) {
        bots[clientId].client.destroy().catch(e => console.error(`[${clientId}] Error destroying client:`, e));
        delete bots[clientId];
        console.log(`[${clientId}] Bot deleted.`);
        saveBotsConfig();
        updateBotList();
    }
}

function updateBotList() {
    const botListForFrontend = {};
    for (const clientId in bots) {
        const { status, name, number, chatCount, owners, fromMeEnabled, profilePicUrl } = bots[clientId];
        botListForFrontend[clientId] = { status, name, number, chatCount, owners, fromMeEnabled, profilePicUrl };
    }
    io.emit('updateBotList', botListForFrontend);
}

// --- Socket.io ---
io.on('connection', (socket) => {
    console.log('A user connected.');

    function updateUserBotList() {
        const botListForFrontend = {};
        for (const clientId in bots) {
            if (bots[clientId]) {
                const { status, name, number, chatCount, owners, fromMeEnabled, profilePicUrl } = bots[clientId];
                botListForFrontend[clientId] = { status, name, number, chatCount, owners, fromMeEnabled, profilePicUrl };
            }
        }
        socket.emit('updateBotList', botListForFrontend);
    }

    updateUserBotList();

    socket.on('addBot', ({ clientId }) => {
        if (!clientId.match(/^[a-zA-Z0-9 _-]+$/)) return;
        if (bots[clientId]) return;
        try {
            createBot(clientId);
            saveBotsConfig();
            updateUserBotList();
        } catch (err) {
            console.error(`[${clientId}] Error creating bot:`, err);
            socket.emit('bot_error', { clientId, error: err.message || String(err) });
        }
    });

    socket.on('deleteBot', ({ clientId }) => {
        deleteBot(clientId);
        updateUserBotList();
    });

    socket.on('reconnectBot', ({ clientId }) => {
        const config = {
            owners: bots[clientId]?.owners,
            fromMeEnabled: bots[clientId]?.fromMeEnabled
        };
        deleteBot(clientId);
        setTimeout(() => createBot(clientId, config), 1000);
    });

    socket.on('addOwner', ({ clientId, ownerNumber }) => {
        if (bots[clientId] && ownerNumber) {
            let num = ownerNumber.trim();
            if (num.startsWith('+')) num = num.slice(1);
            if (num.startsWith('08')) num = '62' + num.slice(1);
            num = num.replace(/\D/g, '');
            if (num.length < 8 || num.length > 15) return;
            let fullNumber = `${num}@c.us`;
            if (!bots[clientId].owners.includes(fullNumber)) {
                bots[clientId].owners.push(fullNumber);
                saveBotsConfig();
                updateUserBotList();
            }
        }
    });

    socket.on('removeOwner', ({ clientId, ownerNumber }) => {
        if (bots[clientId]) {
            bots[clientId].owners = bots[clientId].owners.filter(o => o !== ownerNumber);
            saveBotsConfig();
            updateUserBotList();
        }
    });

    socket.on('toggleFromMe', ({ clientId, isEnabled }) => {
        if (bots[clientId]) {
            bots[clientId].fromMeEnabled = isEnabled;
            saveBotsConfig();
            updateUserBotList();
        }
    });
});

// --- Server Initialization ---
function initializeBotsOnStartup() {
    const savedConfig = getBotsConfig();
    if (Array.isArray(savedConfig)) {
        console.log(`Old config format detected. Converting...`);
        savedConfig.forEach(clientId => createBot(clientId, {}));
        saveBotsConfig();
    } else {
        console.log(`Found ${Object.keys(savedConfig).length} saved bots. Initializing...`);
        for (const clientId in savedConfig) {
            createBot(clientId, savedConfig[clientId]);
        }
    }
}

const PORT = process.env.PORT || 3000;

// --- Vercel/Serverless support ---
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    module.exports = app;
} else {
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        initializeBotsOnStartup();
    });
}

module.exports = { bots };