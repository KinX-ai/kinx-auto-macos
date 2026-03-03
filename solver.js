const { BrowserWindow, session } = require("electron");

const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

class RecaptchaSolver {
  constructor() {
    this.solverWindow = null;
    this.userAgent = DEFAULT_UA; 
    this.hardwareConcurrency = [2, 4, 6, 8, 12, 16][Math.floor(Math.random() * 6)];
    this.deviceMemory = [4, 8, 16][Math.floor(Math.random() * 3)];
    // Randomize screen dimensions for fingerprinting
    this.screenWidth = 1366 + Math.floor(Math.random() * 555);
    this.screenHeight = 768 + Math.floor(Math.random() * 312);
  }

  findChrome() {
    return "Electron"; 
  }

  async createSolverWindow(targetUrl, partitionId = null) {
    if (this.solverWindow && !this.solverWindow.isDestroyed()) {
      this.solverWindow.destroy();
    }

    const sessionOptions = partitionId 
      ? { session: session.fromPartition(`persist:${partitionId}`) } 
      : { session: session.defaultSession };

    this.solverWindow = new BrowserWindow({
      width: 400 + Math.floor(Math.random() * 50),
      height: 700 + Math.floor(Math.random() * 50),
      show: true,        
      x: -1500 + Math.floor(Math.random() * 200),
      y: -1500 + Math.floor(Math.random() * 200),
      frame: false,
      skipTaskbar: true, 
      focusable: false,  
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false, 
        ...sessionOptions, 
        webSecurity: false, 
        backgroundThrottling: false,
        devTools: false 
      },
    });

    this.solverWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = Object.assign({}, details.responseHeaders);
      if (responseHeaders['content-security-policy']) delete responseHeaders['content-security-policy'];
      if (responseHeaders['x-frame-options']) delete responseHeaders['x-frame-options'];
      callback({ responseHeaders, cancel: false });
    });

    this.solverWindow.webContents.setUserAgent(this.userAgent);
    this.solverWindow.webContents.setAudioMuted(true);

    await this.solverWindow.loadURL(targetUrl);
  }

  async simulateHumanInteraction() {
    if (!this.solverWindow || this.solverWindow.isDestroyed()) return;
    
    const contents = this.solverWindow.webContents;
    try {
        const moveMouse = async (tx, ty) => {
            let steps = 20 + Math.floor(Math.random() * 15);
            for (let i = 0; i <= steps; i++) {
                let progress = i / steps;
                let t = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                let x = Math.floor(tx * t) + (Math.random() * 3 - 1.5);
                let y = Math.floor(ty * t) + (Math.random() * 3 - 1.5);
                contents.sendInputEvent({ type: 'mouseMove', x, y });
                await new Promise(r => setTimeout(r, 8 + Math.random() * 12));
            }
        };

        const startX = 5 + Math.floor(Math.random() * 100);
        const startY = 5 + Math.floor(Math.random() * 100);
        contents.sendInputEvent({ type: 'mouseEnter', x: startX, y: startY });
        
        // Phase 1: Hover near target
        const hoverX = 200 + Math.random() * 40;
        const hoverY = 150 + Math.random() * 40;
        await moveMouse(hoverX, hoverY);
        await new Promise(r => setTimeout(r, 150 + Math.random() * 200));

        // Phase 2: Micro-jitter around target
        for(let j=0; j<3; j++) {
            contents.sendInputEvent({ type: 'mouseMove', x: hoverX + (Math.random()*4 - 2), y: hoverY + (Math.random()*4 - 2) });
            await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
        }
        
        // Phase 3: Final click
        contents.sendInputEvent({ type: 'mouseDown', x: hoverX, y: hoverY, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 70 + Math.random() * 100));
        contents.sendInputEvent({ type: 'mouseUp', x: hoverX, y: hoverY, button: 'left', clickCount: 1 });
    } catch (e) {}
  }

  async getRecaptchaToken(websiteURL, websiteKey, pageAction, partitionId = null) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Captcha Timeout (60s)")), 60000);
    });

    const solvePromise = (async () => {
      try {
        await this.createSolverWindow(websiteURL, partitionId);
        await this.simulateHumanInteraction();

        const token = await this.solverWindow.webContents.executeJavaScript(`
          (async function() {
            const siteKey = '${websiteKey}';
            const action = '${pageAction}';
            const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            async function ensureLibrary() {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${this.hardwareConcurrency} });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => ${this.deviceMemory} });
            
            // Mask Screen
            Object.defineProperty(screen, 'width', { get: () => ${this.screenWidth} });
            Object.defineProperty(screen, 'height', { get: () => ${this.screenHeight} });
            Object.defineProperty(screen, 'availWidth', { get: () => ${this.screenWidth} });
            Object.defineProperty(screen, 'availHeight', { get: () => ${this.screenHeight} - 40 });

            // WebGL Masking
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Google Inc. (NVIDIA)'; // UNMASKED_VENDOR_WEBGL
                if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002520) Direct3D11 vs_5_0 ps_5_0, D3D11)'; // UNMASKED_RENDERER_WEBGL
                return getParameter.apply(this, arguments);
            };

            // Audio Fingerprint Masking
            const origGetChannelData = AudioBuffer.prototype.getChannelData;
            AudioBuffer.prototype.getChannelData = function() {
                const res = origGetChannelData.apply(this, arguments);
                for (let i = 0; i < res.length; i += 100) { res[i] += (Math.random() - 0.5) * 0.0000001; }
                return res;
            };

            // Canvas Noise
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type) {
                return originalToDataURL.apply(this, arguments);
            };

            if (navigator.userAgentData) {
              const uaData = {
                brands: [
                  { brand: 'Google Chrome', version: '145' },
                  { brand: 'Chromium', version: '145' },
                  { brand: 'Not A(Brand', version: '24' }
                ],
                mobile: false,
                platform: 'Windows'
              };
              Object.defineProperty(navigator, 'userAgentData', { get: () => uaData });
            }

              if (window.grecaptcha && window.grecaptcha.enterprise && window.grecaptcha.enterprise.execute) return;
              
              const old = document.getElementById('recaptcha-solver-script');
              if (old) old.remove();

              return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.id = 'recaptcha-solver-script';
                script.src = 'https://www.google.com/recaptcha/enterprise.js?render=' + siteKey;
                script.onload = () => setTimeout(resolve, 800 + Math.random() * 500);
                script.onerror = () => reject("Load script failed");
                document.head.appendChild(script);
              });
            }

            try {
              await ensureLibrary();
              let attempts = 0;
              while (!window.grecaptcha || !window.grecaptcha.enterprise || !window.grecaptcha.enterprise.execute) {
                  if (attempts++ > 30) throw new Error("Timeout waiting for library");
                  await wait(200);
              }

              return new Promise((resolve, reject) => {
                 const t = setTimeout(() => reject("execute timeout"), 30000);
                 window.grecaptcha.enterprise.ready(() => {
                    window.grecaptcha.enterprise.execute(siteKey, { action: action })
                      .then(token => {
                        clearTimeout(t);
                        resolve(token);
                      })
                      .catch(err => {
                        clearTimeout(t);
                        reject("Execute Error: " + err.message);
                      });
                 });
              });
            } catch (e) {
              return "ERROR: " + e.message;
            }
          })();
        `, true); 

        if (!token || typeof token !== 'string' || token.startsWith("ERROR:")) {
           throw new Error("Token lỗi: " + token);
        }

        console.log(`[ElectronSolver] => OK (${token.length} chars) - UA: 145`);
        return { token, userAgent: this.userAgent };
      } finally {
        await this.close();
      }
    })();

    try {
      return await Promise.race([solvePromise, timeoutPromise]);
    } catch (error) {
      console.error("[ElectronSolver] Lỗi:", error.message);
      await this.close();
      return null;
    }
  }

  async close() {
    if (this.solverWindow && !this.solverWindow.isDestroyed()) {
      this.solverWindow.destroy();
      this.solverWindow = null;
    }
  }
}

module.exports = RecaptchaSolver;
