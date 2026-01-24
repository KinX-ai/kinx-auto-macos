const { BrowserWindow, session } = require("electron");

class RecaptchaSolver {
  constructor() {
    this.solverWindow = null;
  }

  findChrome() {
    return "Electron"; 
  }

 
  async createSolverWindow(targetUrl) {
    if (this.solverWindow && !this.solverWindow.isDestroyed()) {
      this.solverWindow.destroy();
    }

    this.solverWindow = new BrowserWindow({
      width: 1,
      height: 1,
      show: true, 
      x: -9999,
      y: -9999,
      frame: false,
      transparent: true,
      hasShadow: false,
      opacity: 0,
      skipTaskbar: true, 
      focusable: false,
      movable: false,
      resizable: false,
      alwaysOnTop: true,
      type: 'panel', 
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false, 
        session: session.defaultSession, 
        webSecurity: false, 
        backgroundThrottling: false,
        devTools: false 
      },
    });

    if (process.platform === 'darwin') {
      this.solverWindow.setWindowButtonVisibility(false);
    }
    this.solverWindow.setIgnoreMouseEvents(true);

    
    this.solverWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = Object.assign({}, details.responseHeaders);
     
      if (responseHeaders['content-security-policy']) delete responseHeaders['content-security-policy'];
      if (responseHeaders['x-frame-options']) delete responseHeaders['x-frame-options'];
      callback({ responseHeaders, cancel: false });
    });

  
    this.solverWindow.webContents.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
    );


    this.solverWindow.webContents.setAudioMuted(true);


    await this.solverWindow.loadURL(targetUrl);
  }

 
  async simulateHumanInteraction() {
    if (!this.solverWindow || this.solverWindow.isDestroyed()) return;
    
    const contents = this.solverWindow.webContents;
    try {
        // Human-like mouse movement with randomization
        const startX = 10 + Math.floor(Math.random() * 50);
        const startY = 10 + Math.floor(Math.random() * 50);
        contents.sendInputEvent({ type: 'mouseEnter', x: startX, y: startY });
        
        const midX = 100 + Math.floor(Math.random() * 100);
        const midY = 100 + Math.floor(Math.random() * 100);
        contents.sendInputEvent({ type: 'mouseMove', x: midX, y: midY });
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
        
        const targetX = 200 + Math.floor(Math.random() * 50);
        const targetY = 150 + Math.floor(Math.random() * 50);
        contents.sendInputEvent({ type: 'mouseMove', x: targetX, y: targetY });
        
        // Random click duration
        contents.sendInputEvent({ type: 'mouseDown', x: targetX, y: targetY, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
        contents.sendInputEvent({ type: 'mouseUp', x: targetX, y: targetY, button: 'left', clickCount: 1 });
    } catch (e) {
        // console.error("Interaction failed:", e);
    }
  }

  async getRecaptchaToken(websiteURL, websiteKey, pageAction) {
    try {
      
      await this.createSolverWindow(websiteURL);

      
      await this.simulateHumanInteraction();

      
      const token = await this.solverWindow.webContents.executeJavaScript(`
        (async function() {
          const siteKey = '${websiteKey}';
          const action = '${pageAction}';

         
          const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

         
          async function ensureLibrary() {
            // Masking common bot detection signals
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

            if (window.grecaptcha && window.grecaptcha.enterprise && window.grecaptcha.enterprise.execute) return;
            
            const old = document.getElementById('recaptcha-solver-script');
            if (old) old.remove();

            return new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.id = 'recaptcha-solver-script';
              script.src = 'https://www.google.com/recaptcha/enterprise.js?render=' + siteKey;
              script.onload = () => {
                  setTimeout(resolve, 1000);
              };
              script.onerror = () => reject("Load script failed");
              document.head.appendChild(script);
            });
          }

          try {
            await ensureLibrary();
            
            let attempts = 0;
            while (!window.grecaptcha || !window.grecaptcha.enterprise || !window.grecaptcha.enterprise.execute) {
                if (attempts++ > 20) throw new Error("Timeout waiting for grecaptcha enterprise");
                await wait(200);
            }

            return new Promise((resolve, reject) => {
               window.grecaptcha.enterprise.ready(() => {
                  window.grecaptcha.enterprise.execute(siteKey, { action: action })
                    .then(token => resolve(token))
                    .catch(err => reject("Execute Error: " + err.message));
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

      console.log(`[ElectronSolver] => OK (${token.length} chars)`);
      
      this.close();
      return token;

    } catch (error) {
      console.error("[ElectronSolver] Lỗi:", error.message);
      this.close();
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