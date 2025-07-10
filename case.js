const { getMenu } = require('./menu');
const { MessageMedia } = require('whatsapp-web.js');

async function handleMessage(client, message, { bots, numberToClientId } = {}) {
    const body = message.body.toLowerCase();
    const command = body.split(' ')[0];
    const args = body.split(' ').slice(1).join(' ');

    let owners = [];
    let clientId;

    // 1. Coba ambil dari client.options.authStrategy.clientId (cara lama)
    if (client && client.options && client.options.authStrategy && client.options.authStrategy.clientId) {
        clientId = client.options.authStrategy.clientId;
        if (bots && bots[clientId]) {
            owners = bots[clientId].owners || [];
        }
    }

    // 2. Jika tidak dapat owners, cari berdasarkan nomor bot (mapping baru)
    if ((!owners || owners.length === 0) && client && client.info && client.info.wid && client.info.wid.user) {
        const botNumber = client.info.wid.user;
        if (numberToClientId && numberToClientId[botNumber] && bots && bots[numberToClientId[botNumber]]) {
            clientId = numberToClientId[botNumber];
            owners = bots[clientId].owners || [];
        }
    }

    // 3. Fallback: jika tetap tidak dapat, set owners ke array kosong
    if (!owners) owners = [];

    function isOwner(sender) {
        return owners.includes(sender);
    }

    switch (command) {
        case 'menu':
            await message.reply(getMenu());
            break;
        case 'ping':
            await message.reply('Pong!');
            break;
        case 'info':
            await message.reply('This bot was created by Kilo Code.');
            break;
        case 'sticker':
            if (message.hasMedia || (message.hasQuotedMsg && (await message.getQuotedMessage()).hasMedia)) {
                const media = message.hasMedia ? await message.downloadMedia() : await (await message.getQuotedMessage()).downloadMedia();
                if (media.mimetype.includes('image')) {
                    await message.reply(media, undefined, { sendMediaAsSticker: true });
                } else {
                    await message.reply('Please reply to an image or send an image with the command sticker.');
                }
            } else {
                await message.reply('Please reply to an image or send an image with the command sticker.');
            }
            break;
        case 'vn':
            if (message.hasQuotedMsg && (await message.getQuotedMessage()).hasMedia) {
                const quotedMsg = await message.getQuotedMessage();
                const media = await quotedMsg.downloadMedia();
                if (media.mimetype.includes('audio')) {
                    await client.sendMessage(message.from, media, { sendAudioAsVoice: true });
                } else {
                    await message.reply('Please reply to an audio file.');
                }
            } else {
                await message.reply('Please reply to an audio file.');
            }
            break;
        case 'tovn':
            if (message.hasQuotedMsg && (await message.getQuotedMessage()).hasMedia) {
                const quotedMsg = await message.getQuotedMessage();
                const media = await quotedMsg.downloadMedia();
                if (media.mimetype.includes('audio')) {
                    if (args && (args.endsWith('@c.us') || args.endsWith('@g.us'))) {
                        try {
                            await client.sendMessage(args, media, { sendAudioAsVoice: true });
                            await message.reply(`Voice note sent to ${args}`);
                        } catch (error) {
                            console.error(`[tovn] Error sending voice note to ${args}:`, error);
                            await message.reply(`Failed to send voice note to ${args}. Please ensure the ID is correct.`);
                        }
                    } else {
                        await message.reply('Please provide a valid contact or group ID. Example: tovn 6281234567890@c.us');
                    }
                } else {
                    await message.reply('Please reply to an audio file.');
                }
            } else {
                await message.reply('Please reply to an audio file.');
            }
            break;
        case 'postsw':
            const hasQuotedMsg = message.hasQuotedMsg;
            let quotedMsg;
            if (hasQuotedMsg) {
                quotedMsg = await message.getQuotedMessage();
            }

            const hasMedia = message.hasMedia || (hasQuotedMsg && quotedMsg.hasMedia);

            try {
                console.log(`[postsw] Received command with args: "${args}"`);
                if (hasMedia) {
                    console.log('[postsw] Media detected.');
                    const media = message.hasMedia ? await message.downloadMedia() : await quotedMsg.downloadMedia();
                    await client.sendMessage('status@broadcast', media, { caption: args });
                    console.log('[postsw] Status with media posted successfully.');
                    await message.reply('Status has been posted.');
                } else if (args && args.trim().length > 0) {
                    console.log('[postsw] Text detected.');
                    await client.sendMessage('status@broadcast', args);
                    console.log('[postsw] Status with text posted successfully.');
                    await message.reply('Status has been posted.');
                } else {
                    console.log('[postsw] No text or media provided.');
                    await message.reply('Please provide text or reply to media for your status update.');
                }
            } catch (error) {
                console.error('[postsw] Error posting status:', error);
                await message.reply('An error occurred while posting the status.');
            }
            break;
        case 'sw':
            if (args && args.trim().length > 0) {
                try {
                    // Cek apakah chat status@broadcast tersedia
                    const chats = await client.getChats();
                    const statusChat = chats.find(c => c.id && c.id._serialized === 'status@broadcast');
                    if (!statusChat) {
                        await message.reply('Fitur status WhatsApp tidak tersedia di akun ini atau WhatsApp Web API Anda.');
                        break;
                    }
                    // Kirim status
                    await client.sendMessage('status@broadcast', args);
                    await message.reply('Status has been posted.');
                } catch (error) {
                    console.error('[sw] Error posting status:', error);
                    await message.reply('Gagal post status. Fitur ini mungkin tidak didukung di WhatsApp Web API Anda.');
                }
            } else {
                await message.reply('Please provide text for your status update. Example: sw Hello World!');
            }
            break;
        case 'crategc':
            const [dateStr, ...groupNameParts] = args.split(' ');
            const groupName = groupNameParts.join(' ');

            if (!dateStr || !groupName) {
                await message.reply('Please provide a date and a group name. Example: creategroup 05-10-2019 My Awesome Group');
                return;
            }

            const dateParts = dateStr.split('-');
            if (dateParts.length !== 3) {
                await message.reply('Invalid date format. Please use dd-mm-yyyy.');
                return;
            }

            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed in JavaScript
            const year = parseInt(dateParts[2], 10);

            const creationDate = new Date(year, month, day);
            const now = new Date();

            if (isNaN(creationDate.getTime()) || creationDate > now) {
                await message.reply('Invalid date. Please provide a valid date in the past.');
                return;
            }

            try {
                const participants = [message.from];
                const group = await client.createGroup(groupName, participants);
                if (group.gid && group.gid._serialized) {
                    await message.reply(`Group "${groupName}" created successfully.`);
                    console.log(`[creategroup] Group "${groupName}" created. Group ID: ${group.gid._serialized}`);
                    await client.sendMessage(group.gid._serialized, `Welcome to ${groupName}!`);
                } else {
                    await message.reply('Failed to create group. The group might exist or there was an unknown error.');
                    console.log('[creategroup] client.createGroup did not return a group ID.');
                }
            } catch (error) {
                console.error('[creategroup] Error creating group:', error);
                await message.reply('An error occurred while creating the group.');
            }
            break;
        case 'lisgc':
            try {
                const chats = await client.getChats();
                const groups = chats.filter(chat => chat.isGroup);
                if (groups.length > 0) {
                    let response = '*Groups List*\n\n';
                    groups.forEach(group => {
                        response += `*Name:* ${group.name}\n*ID:* ${group.id._serialized}\n\n`;
                    });
                    await message.reply(response);
                } else {
                    await message.reply('The bot is not in any groups.');
                }
            } catch (error) {
                console.error('[listgroups] Error fetching groups:', error);
                await message.reply('An error occurred while fetching the groups list.');
            }
            break;
        case 'owner':
        case 'owners':
            if (owners.length === 0) {
                await message.reply('No owners set for this bot.');
            } else {
                // Kirim vCard untuk setiap owner
                for (const ownerJid of owners) {
                    const num = ownerJid.replace('@c.us', '');
                    const vcard =
`BEGIN:VCARD
VERSION:3.0
FN:Owner Bot
TEL;type=CELL;type=VOICE;waid=${num}:${num}
END:VCARD`;
                    await client.sendMessage(message.from, vcard, { sendMediaAsDocument: false, sendMediaAsSticker: false, sendMediaAsVcard: true });
                }
                // Tetap kirim list teks
                await message.reply(
                    '*Bot Owners:*\n' +
                    owners.map((o, i) => `${i + 1}. ${o.replace('@c.us', '')}`).join('\n')
                );
            }
            break;
    }
}

module.exports = { handleMessage };