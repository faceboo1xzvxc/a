const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

// --- CẤU HÌNH ---
const TOKEN = '5250097913:AAFh1VmYhLZnjKIzSqG-LM-i5d7wgyEvdAc';
const CHAT_ID = '683643497';
const SAVE_DIR = process.cwd(); // thư mục hiện tại (tốt nhất cho Render)

// --- KHỞI TẠO BOT ---
const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 Bot Telegram đã khởi động. Đang đợi file gửi về...');

// --- NHẬN FILE ---
bot.on('document', async msg => {
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const ext = path.extname(fileName);
  const savePath = path.join(SAVE_DIR, fileName);

  try {
    const { file_path } = await bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${TOKEN}/${file_path}`;

    // TẢI FILE VỀ (GHI ĐÈ NẾU TỒN TẠI)
    const writer = fs.createWriteStream(savePath);
    const response = await axios({ method: 'GET', url, responseType: 'stream' });
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`✅ File ${fileName} đã lưu vào ${savePath}`);
    await bot.sendMessage(CHAT_ID, `📥 Đã lưu *${fileName}* vào máy chủ (ghi đè nếu có).`, { parse_mode: 'Markdown' });

    // --- NẾU FILE JS, TỰ CHẠY ---
    if (ext === '.js') {
      await bot.sendMessage(CHAT_ID, `🚀 Đang thực thi \`${fileName}\`...`, { parse_mode: 'Markdown' });

      exec(`node "${savePath}"`, { timeout: 20000 }, (err, stdout, stderr) => {
        if (err) {
          bot.sendMessage(CHAT_ID, `❌ Lỗi khi chạy:\n\`\`\`\n${err.message}\n\`\`\``, {
            parse_mode: 'Markdown'
          });
        } else {
          const output = stdout || stderr || '✅ Không có output.';
          bot.sendMessage(CHAT_ID, `📤 Kết quả:\n\`\`\`\n${output.slice(0, 3900)}\n\`\`\``, {
            parse_mode: 'Markdown'
          });
        }
      });
    }
  } catch (e) {
    console.error('❌ Lỗi khi xử lý file:', e.message);
    bot.sendMessage(CHAT_ID, `❌ Lỗi xử lý file: ${e.message}`);
  }
});
