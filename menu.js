function getMenu() {
    return `
╭━━━〔 *🤖 BotWA Menu* 〕━━━╮

*🟢 Umum*
• *menu* — Tampilkan menu ini
• *ping* — Tes respon bot
• *info* — Info bot

*🖼️ Media*
• *sticker* — Jadikan gambar jadi stiker (reply/kirim gambar)
• *vn* — Ubah audio jadi voice note (reply audio)
• *tovn [ID]* — Kirim voice note ke ID (reply audio)

*📢 Status*
• *sw [teks]* — Post status teks
• *postsw [teks/media]* — Post status teks/media

*👥 Grup*
• *crategc [tgl-nama]* — Buat grup (cth: crategc 01-01-2024 Nama)
• *lisgc* — List semua grup bot

*👑 Owner*
• *owner* — Lihat kontak owner bot

━━━━━━━━━━━━━━━
_Bot WhatsApp Multi-Account_
`;
}

module.exports = { getMenu };