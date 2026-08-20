const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    delay,
    makeCacheableSignalKeyStore
} = require('@adiwajshing/baileys');

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const config = require('../config');
const { loadMessage, saveMessage, saveChat } = require('./database/store');
const { Message, commands, PREFIX } = require('./index');
const { serialize } = require('./serialize');

const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

const cachedGroupMetadata = async (jid) => groupCache.get(jid);

const readAndRequireFiles = async (dirPath) => {
    try {
        const files = await fs.promises.readdir(dirPath);
        return Promise.all(
            files
                .filter(file => path.extname(file).toLowerCase() === '.js')
                .map(file => require(path.join(dirPath, file)))
        );
    } catch (error) {
        console.error('Error loading files:', error);
    }
};

async function initialize() {
    console.log('[izumi-md] WhatsApp Bot Initializing...');

    await readAndRequireFiles(path.join(__dirname, '../plugins'));
    if (config.DATABASE && typeof config.DATABASE.sync === 'function') {
        try {
            await config.DATABASE.sync();
            console.log('Database synchronized.');
        } catch (e) {
            console.log('Database sync bypassed/memory mode.');
        }
    }
    console.log('Plugins Installed!');

    async function startBot() {
        console.log('Connecting to WhatsApp...');
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });

        const conn = makeWASocket({
            logger: logger,
            printQRInTerminal: false,
            downloadHistory: false,
            syncFullHistory: false,
            browser: Browsers.macOS('Desktop'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            version: version,
            cachedGroupMetadata: cachedGroupMetadata
        });

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('====================================================');
                console.log('SCAN THIS QR CODE TO CONNECT THE BOT:');
                qrcode.generate(qr, { small: true });
                console.log('====================================================');
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log('Connection closed. Reason:', reason);
                if (reason !== DisconnectReason.loggedOut) {
                    console.log('Reconnecting to WhatsApp...');
                    await delay(3000);
                    startBot();
                } else {
                    console.log('Logged out from WhatsApp. Delete session folder and restart.');
                }
            } else if (connection === 'open') {
                console.log('CONNECTED TO WHATSAPP SUCCESSFULLY! ✅');
            }
        });

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('messages.upsert', async (m) => {
            try {
                if (m.type !== 'notify') return;
                let msg = m.messages[0];
                if (!msg.message) return;
                msg = await serialize(conn, msg);
                await saveMessage(msg);
                await Message(conn, msg);
            } catch (err) {
                console.error(err);
            }
        });

        return conn;
    }

    return startBot();
}

module.exports = { initialize };
