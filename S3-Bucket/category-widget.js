// ====================== categories-widget.js ======================
// FULL UNABRIDGED
// (All previous features preserved + layout reset fix when returning to main categories)
// + REINSTATED: iOS TTS permission dialog + unlockAudioOnGesture under user gesture
//   so that clicking "Read it" / Listen triggers the native Allow Sound prompt after interaction
// + FIXED: force dialog on every iOS page load until audioUnlocked under a real gesture this session
//   (localStorage "granted" alone is insufficient on Safari — no gesture = no audio)
// + TIMING FIX (2026-07-22): early page-open calls DISABLED with explicit reason comments.
//   Dialog now appears only when an AI response is about to be displayed / read
//   (via the existing paths in handleDialog / startDialogSpeech).
// + RESPONSE GATE (2026-07-22): primary permission check moved to top of handleDialog so the
//   dialog is shown and unlocked under gesture *before* any typeText or speak of the AI response.
// + RESTORED (2026-07-22): intermediate typeText of dialog while waiting / polling (the progressive
//   status messages). These are shown during processing. The permission ("Read it / Quiet") dialog
//   is still forced only when the final response is ready, inside handleDialog.
// + UNCONDITIONAL iOS FORCE (2026-07-22): On iOS there is NO short-circuit logic.
//   Before any AI response is played we ALWAYS show the Listen/Quiet dialog.
//   requestTTSPermission() is called directly (bypassing all granted/denied/audioUnlocked checks).
// + VOLUME FIX (2026-07-22): Explicitly force volume = 1 on every real SpeechSynthesisUtterance
//   and on the base64 Audio element *before* any play/speak call. The previous silent warm-ups
//   (volume=0) were leaving the engine in a low-volume state that caused the audible response
//   to start quiet and ramp up. That behaviour is now killed by setting volume=1 immediately
//   before playback.

function loadCSS(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

class CategoriesWidget {
  constructor() {
    console.log('[CategoriesWidget] Constructor started');

    this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod';
    this.containerId = 'categories-widget';
    this._currentTypingInterval = null;
    this.isListening = false;
    this.recognition = null;
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.currentAudio = null;
    this.dialogText = '';
    this.isPageLoaded = false;
    this.isPermissionPrompted = false;
    this.speechBuffer = '';
    this.sessionDeselectedItems = [];
    this.ttsPermission = localStorage.getItem('ttsPermission') || 'prompt';
    this.ttsEnabled = this.ttsPermission !== 'denied' && localStorage.getItem('ttsEnabled') !== 'false' && localStorage.getItem('audioMuted') !== 'true';
    this.sttPermission = localStorage.getItem('sttPermission') || 'prompt';
    this.sttEnabled = localStorage.getItem('sttEnabled') === 'true';
    this.audioUnlocked = false; // session-only flag: true only after unlock under a real user gesture

    // === BIND SAFETY NET + LOGGING ===
    console.log('[CategoriesWidget] Starting safety net...');
    const ensureMethod = (name, fallback = function() {}) => {
      if (typeof this[name] !== 'function') {
        console.warn(`[CategoriesWidget] SAFETY NET created stub for missing method: ${name}`);
        this[name] = fallback;
      }
    };
    ensureMethod('init');
    ensureMethod('renderNotAuthenticated');
    ensureMethod('validateToken');
    ensureMethod('initializeCategories');
    ensureMethod('postCategories');
    ensureMethod('getCategories');
    ensureMethod('pollCategories');
    ensureMethod('renderUpperArea');
    ensureMethod('renderLowerArea');
    ensureMethod('renderInitialUI');
    ensureMethod('setupEvents');
    ensureMethod('showLoadingOverlay');
    ensureMethod('hideLoadingOverlay');
    ensureMethod('updateSubmitButtonState');
    ensureMethod('getIconClass');
    ensureMethod('typeText');
    ensureMethod('setupSpeechRecognition');
    ensureMethod('toggleSpeechRecognition');
    ensureMethod('startDialogSpeech');
    ensureMethod('stopDialogSpeech');
    ensureMethod('updateControlButton');
    ensureMethod('requestTTSPermissionIfNeeded');
    ensureMethod('updateDialogText', async () => {});
    ensureMethod('updateErrorMessage');
    ensureMethod('waitForVoices');
    ensureMethod('handleDialog');
    ensureMethod('requestTTSPermission');
    ensureMethod('isIOS');
    ensureMethod('getBoundingClientRect', () => ({ top: 0, height: 0 }));
    ensureMethod('warmUpTTS');
    ensureMethod('unlockAudioOnGesture');
    console.log('[CategoriesWidget] Safety net completed');

    console.log('[CategoriesWidget] Starting bind operations...');
    try {
      this.init = this.init.bind(this);
      this.renderNotAuthenticated = this.renderNotAuthenticated.bind(this);
      this.validateToken = this.validateToken.bind(this);
      this.initializeCategories = this.initializeCategories.bind(this);
      this.postCategories = this.postCategories.bind(this);
      this.getCategories = this.getCategories.bind(this);
      this.pollCategories = this.pollCategories.bind(this);
      this.renderUpperArea = this.renderUpperArea.bind(this);
      this.renderLowerArea = this.renderLowerArea.bind(this);
      this.renderInitialUI = this.renderInitialUI.bind(this);
      this.setupEvents = this.setupEvents.bind(this);
      this.showLoadingOverlay = this.showLoadingOverlay.bind(this);
      this.hideLoadingOverlay = this.hideLoadingOverlay.bind(this);
      this.updateSubmitButtonState = this.updateSubmitButtonState.bind(this);
      this.getIconClass = this.getIconClass.bind(this);
      this.typeText = this.typeText.bind(this);
      this.setupSpeechRecognition = this.setupSpeechRecognition.bind(this);
      this.toggleSpeechRecognition = this.toggleSpeechRecognition.bind(this);
      this.startDialogSpeech = this.startDialogSpeech.bind(this);
      this.stopDialogSpeech = this.stopDialogSpeech.bind(this);
      this.updateControlButton = this.updateControlButton.bind(this);
      this.requestTTSPermissionIfNeeded = this.requestTTSPermissionIfNeeded.bind(this);
      this.updateDialogText = this.updateDialogText.bind(this);
      this.updateErrorMessage = this.updateErrorMessage.bind(this);
      this.waitForVoices = this.waitForVoices.bind(this);
      this.handleDialog = this.handleDialog.bind(this);
      this.requestTTSPermission = this.requestTTSPermission.bind(this);
      this.isIOS = this.isIOS.bind(this);
      this.getBoundingClientRect = this.getBoundingClientRect.bind(this);
      this.warmUpTTS = this.warmUpTTS.bind(this);
      this.unlockAudioOnGesture = this.unlockAudioOnGesture.bind(this);
      console.log('[CategoriesWidget] All bind operations completed successfully');
    } catch (e) {
      console.error('[CategoriesWidget] BIND ERROR:', e);
    }
  }

  getAuthToken() { return localStorage.getItem('authToken'); }
  validateToken() {
    const token = this.getAuthToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Math.floor(Date.now() / 1000) <= payload.exp;
    } catch { return false; }
  }
  renderNotAuthenticated() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    container.innerHTML = `<div class="not-authenticated" style="max-width:400px;margin:0 auto;padding:20px;text-align:center;"><p style="font-size:1.2em;color:#333;"><i class="fas fa-user-lock" aria-hidden="true" style="margin-right:5px;"></i> Please Login to manage your discount categories.</p></div>`;
    window.location.href = '/login.html';
  }
  async getCategories() {
    const token = this.getAuthToken();
    if (!token) return { status: 'error', error_message: 'Authentication required', categories: {}, exclude: [], dialog: '' };
    try {
      const r = await fetch(`${this.apiEndpoint}/ui/category`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) { localStorage.removeItem('authToken'); localStorage.removeItem('user_id'); localStorage.removeItem('contact_name'); window.location.href = '/login.html'; }
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    } catch (e) { return { status: 'error', error_message: e.message, categories: {}, exclude: [], dialog: '' }; }
  }
  async postCategories(prompt = '', exclude = []) {
    const token = this.getAuthToken();
    if (!token) return { status: 'error', error_message: 'Authentication required', categories: {}, exclude: [], dialog: '' };
    try {
      const r = await fetch(`${this.apiEndpoint}/ui/category`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ prompt, exclude }) });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) { localStorage.removeItem('authToken'); localStorage.removeItem('user_id'); localStorage.removeItem('contact_name'); window.location.href = '/login.html'; }
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    } catch (e) { return { status: 'error', error_message: e.message, categories: {}, exclude: [], dialog: '' }; }
  }
  async pollCategories() {
    while (true) {
      const data = await this.getCategories();
      const status = data.status || 'complete';
      const promptInput = document.querySelector('#cw-prompt');
      if (promptInput && data.prompt !== undefined) { promptInput.value = data.prompt; this.speechBuffer = data.prompt; }
      const dialogSpan = document.querySelector('#cw-dialog-text');
      // RESTORED: intermediate dialog texts while waiting / processing (progressive status messages).
      // The final "Read it / Quiet" permission dialog is still shown only when the response is ready,
      // inside the primary gate of handleDialog.
      if (dialogSpan && data.dialog) { dialogSpan.textContent = ''; this.typeText(dialogSpan, data.dialog, () => {}); }
      if (status === 'failed' || status === 'timeout') { this.renderLowerArea(data); this.updateErrorMessage(data.error_message || ''); this.hideLoadingOverlay(); return; }
      if (status !== 'processing' && status !== 'queued' && status !== 'building_catalog') { this.renderLowerArea(data); this.updateErrorMessage(data.error_message || ''); this.hideLoadingOverlay(); await this.handleDialog(data); return; }
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  waitForVoices() { return new Promise(resolve => { const v = window.speechSynthesis.getVoices(); if (v.length) { resolve(); return; } window.speechSynthesis.addEventListener('voiceschanged', () => resolve(), { once: true }); }); }
  async warmUpTTS() { 
    if (localStorage.getItem('audioMuted') === 'true') return;
    try { await this.waitForVoices(); const s = new SpeechSynthesisUtterance(" "); s.volume = 0; window.speechSynthesis.speak(s); setTimeout(() => window.speechSynthesis.cancel(), 30); } catch {} 
  }
  isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }

  // === REINSTATED: unlock under a real user gesture so iOS shows Allow Sound and enables playback ===
  unlockAudioOnGesture() {
    if (localStorage.getItem('audioMuted') === 'true') return;
    try {
      // Silent speechSynthesis unlock — MUST run inside the user-gesture call stack on iOS
      if (window.speechSynthesis) {
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0;
        silent.rate = 1;
        window.speechSynthesis.speak(silent);
        setTimeout(() => { try { window.speechSynthesis.cancel(); } catch {} }, 50);
      }
      // Also unlock HTML5 Audio for the Grok base64 MP3 path
      try {
        const a = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        a.volume = 0;
        a.play().catch(() => {});
      } catch {}
      this.audioUnlocked = true; // mark that we have a real gesture unlock this session
      console.log('[CategoriesWidget] Audio unlocked under user gesture');
    } catch (e) {
      console.warn('[CategoriesWidget] unlockAudioOnGesture failed', e);
    }
  }

  renderInitialUI() { const c = document.getElementById(this.containerId); if (!c) return; c.style.margin = '0 0 30px 0'; c.style.padding = '0'; c.style.position = 'relative'; c.innerHTML = `<style>@keyframes cw-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style><div id="cw-loadingOverlay" style="display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,.85);justify-content:center;align-items:center;z-index:1000;"><div style="position:relative;width:200px;height:200px;"><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:80px;height:80px;border-top-color:#ff6f61;top:60px;left:60px;animation-delay:0s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:60px;height:60px;border-top-color:#6bff61;top:70px;left:70px;animation-delay:0.3s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:40px;height:40px;border-top-color:#61cfff;top:80px;left:80px;animation-delay:0.6s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:20px;height:20px;border-top-color:#ff61ff;top:90px;left:90px;animation-delay:0.9s;"></div></div></div>`; }

  renderUpperArea() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const upper = document.createElement('div'); upper.id = 'cw-upper-container';
    upper.innerHTML = `<style>
#cw-upper-container{background:#fff;padding:0;box-sizing:border-box;width:100%;max-width:800px;margin:0 auto;position:relative;z-index:10;border-bottom:1px solid transparent;}
form{margin:0;}
#categories-widget .speech-bubble{background:#f1f1f1;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,.1);width:100%;height:6em;overflow-y:scroll;scrollbar-width:none;-ms-overflow-style:none;margin:0;position:relative;display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;font-family:monospace;}
#categories-widget .speech-bubble::-webkit-scrollbar{display:none;}
#categories-widget button[disabled]{opacity:.5;cursor:not-allowed;}
#categories-widget textarea{box-sizing:border-box;white-space:pre-wrap;font-size:1.2em;width:100%;height:3em;margin:0;flex:1;}
#categories-widget .button-group{display:flex;justify-content:center;gap:10px;margin-bottom:0;margin-top:10px;width:100%;}
#categories-widget .prompt-area{display:flex;align-items:center;gap:10px;margin-bottom:0;}
#categories-widget .icon-button{padding:10px;font-size:1em;height:50px;display:flex;align-items:center;justify-content:center;border:none;border-radius:5px;transition:background-color .2s;color:white;text-align:center;white-space:nowrap;}
#categories-widget .icon-button i{font-size:1.5em;margin-right:5px;}
#categories-widget .icon-button#cw-submit-button{background:#007bff;}
@media(max-width:600px){
  #cw-upper-container{padding:0;width:100vw;position:fixed;left:0;top:0;margin:0;z-index:10;background:#fff;}
  #categories-widget .speech-bubble{margin:0;border-radius:0;width:100%;height:8em;box-sizing:border-box;}
  #categories-widget .robot-icon-container{display:none;}
  #categories-widget #cw-prompt{min-height:3em;height:3em;width:100%;margin:0;padding:8px 8px 8px 0;box-sizing:border-box;}
  #categories-widget .dialog-area{width:100%;margin:0;margin-bottom:0;}
  #categories-widget .prompt-area{margin:0;width:100%;flex-wrap:wrap;padding-left:0;}
  #categories-widget .button-group{margin:0;padding:10px 0 10px 0;width:100%;box-sizing:border-box;justify-content:flex-start;}
  #categories-widget .form-group{margin-bottom:0;}
}
</style>
<form id="cw-category-form" class="form" style="margin-top:80px;">
  <div class="form-group" style="margin-bottom:15px;">
    <div class="dialog-area" style="margin-bottom:15px;width:100%;display:flex;align-items:flex-start;">
      <div class="robot-icon-container" style="margin-right:10px;"><i class="fas fa-robot" style="font-size:2em;color:#007bff;"></i></div>
      <div id="cw-dialog-container" class="speech-bubble"><span id="cw-dialog-text"></span></div>
    </div>
  </div>
  <div class="prompt-area" style="margin-bottom:10px;display:flex;align-items:center;gap:10px;">
    <textarea id="cw-prompt" name="prompt" placeholder="Type your instructions here..." style="padding:8px;border:1px solid #ccc;border-radius:4px;resize:vertical;box-sizing:border-box;font-size:1.2em;background:#fafafa;"></textarea>
    <button type="submit" id="cw-submit-button" disabled class="icon-button"><i class="fas fa-robot"></i><span>Go</span></button>
  </div>
  <div class="button-group">
    <input type="hidden" id="cw-exclude" name="exclude" value="[]">
    <input type="hidden" id="cw-categories" name="categories" value="{}">
  </div>
</form>`;
    container.appendChild(upper);
    this.setupSpeechRecognition();
  }

  renderLowerArea(data) {
    console.log('[CategoriesWidget] renderLowerArea called');
    const container = document.getElementById(this.containerId);
    if (!container) return;
    let lower = container.querySelector('#cw-lower-container') || document.createElement('div');
    lower.id = 'cw-lower-container';
    container.appendChild(lower);

    lower.style.marginLeft = '0';
    lower.style.paddingLeft = '0';
    lower.style.marginRight = '0';
    lower.style.paddingRight = '0';
    lower.style.width = '100%';
    lower.style.boxSizing = 'border-box';

    const { categories = {}, error_message = '' } = data;
    lower.innerHTML = `<style>
#cw-lower-container{box-sizing:border-box;width:100%;max-width:800px;margin:0 0 40px 0!important;padding:0 0 70px 0!important;position:relative;z-index:5;margin-left:0!important;padding-left:0!important;}
#cw-categories-container{display:flex;justify-content:flex-start;width:100%;position:relative;transition:transform .5s ease-in-out;min-height:0;margin:0;padding:0;}
@keyframes cw-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
#categories-widget .category-label:hover,#categories-widget .subcategory-label:hover{color:#007bff;}
#categories-widget .label-container{flex:1;display:flex;align-items:center;padding-right:8px;}
#categories-widget .category-label{color:black;text-decoration:none;padding-left:5px;padding-right:5px;white-space:nowrap;text-align:left;font-size:1.2em;}
#categories-widget .subcategory-label{color:black;padding-left:2.5px;padding-right:5px;white-space:nowrap;text-align:left;flex-grow:1;font-size:1.2em;}
#categories-widget .category-icon{font-size:2em;}
#categories-widget .subcategory-item{display:flex;align-items:center;padding:5px 0;width:100%;position:relative;padding-right:55px;box-sizing:border-box;}
#categories-widget .icon-wrapper{width:30px;text-align:center;cursor:pointer;margin-right:8px;flex-shrink:0;}
#categories-widget .category-group{display:flex;align-items:center;padding:5px 0;width:100%;position:relative;min-height:40px;padding-right:55px;box-sizing:border-box;}
#categories-widget .category-group:nth-child(even){background:#e6e6e6;}
#categories-widget .category-group:nth-child(odd){background:white;}
#categories-widget .subcategory-item:nth-child(even){background:#e6e6e6;}
#categories-widget .subcategory-item:nth-child(odd){background:white;}
#categories-widget .category-checkbox{transform:scale(1.5);position:absolute;right:8px;top:50%;transform:translateY(-50%) scale(1.5);z-index:2;}
#categories-widget .subcategory-checkbox{transform:scale(1.5);margin-right:10px;}
#categories-widget .back-button{background:#007bff;color:white;border:none;border-radius:50%;width:45px;height:45px;display:flex;align-items:center;justify-content:center;font-size:1.5em;cursor:pointer;transition:background-color .2s;margin-right:10px;}
#categories-widget .subcategory-header{display:flex;align-items:center;margin-bottom:15px;width:100%;}
#categories-widget .left-column,#categories-widget .right-column{width:100%;position:absolute;top:0;transition:transform .5s ease-in-out,visibility .5s;visibility:visible;margin:0;padding:0;}
#categories-widget .left-column{transform:translateX(0);}
#categories-widget .right-column{transform:translateX(101%);visibility:hidden;}
#categories-widget .left-column.hidden{transform:translateX(-101%);visibility:hidden;}
#categories-widget .right-column.visible{transform:translateX(0);visibility:visible;}
#cw-loadingOverlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,.8);justify-content:center;align-items:center;z-index:1000;}
#categories-widget .cw-hover-text{position:absolute;background:rgba(255,255,224,.9);padding:10px;border:1px solid #000;border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,.2);z-index:1001;max-width:200px;font-size:1em;color:#000;}
@media(max-width:600px){
  #cw-lower-container{width:100vw;margin:0 0 40px 0;padding:0 0 70px 0!important;position:relative;left:0;margin-left:0!important;padding-left:0!important;}
  #categories-widget .category-group,#categories-widget .subcategory-item{padding:5px 0;padding-right:55px;}
  #categories-widget .label-container{padding-right:8px;padding-left:0;}
  #categories-widget .category-checkbox{right:8px;}
  #categories-widget .category-label,#categories-widget .subcategory-label{padding-left:0;}
  #cw-categories-container{width:100%;margin:0;padding:0;}
}
</style><div id="cw-categories-container"><div class="left-column"></div><div class="right-column"></div></div><div id="cw-category-error" style="display:${error_message?'block':'none'};color:red;margin-top:10px;">${error_message}</div><div id="cw-loadingOverlay"><div style="position:relative;width:200px;height:200px;"><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:80px;height:80px;border-top-color:#ff6f61;top:60px;left:60px;animation-delay:0s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:60px;height:60px;border-top-color:#6bff61;top:70px;left:70px;animation-delay:0.3s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:40px;height:40px;border-top-color:#61cfff;top:80px;left:80px;animation-delay:0.6s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:20px;height:20px;border-top-color:#ff61ff;top:90px;left:90px;animation-delay:0.9s;"></div></div></div>`;

    const cats = lower.querySelector('#cw-categories-container');

    // === TIGHT CATALOG POSITIONING (directly underneath instruction box) ===
    const positionCatalog = () => {
      const upper = document.getElementById('cw-upper-container');
      if (upper && window.innerWidth <= 600) {
        const h = upper.offsetHeight || 360;
        lower.style.setProperty('margin-top', `${h + 20}px`, 'important');
        lower.style.paddingTop = '0';
        console.log('[CategoriesWidget] Catalog positioned below upper area:', `${h + 20}px`);
      } else {
        lower.style.marginTop = '0';
      }
    };

    requestAnimationFrame(positionCatalog);
    setTimeout(positionCatalog, 80);
    setTimeout(positionCatalog, 220);
    setTimeout(positionCatalog, 500);
    setTimeout(positionCatalog, 900);

    /* ORIGINAL SCROLLING SUBCATEGORIES UI */
    const resetBtn = container.querySelector('#cw-reset-categories');
    if (resetBtn) resetBtn.disabled = Object.keys(categories).length === 0;

    if (cats && Object.keys(categories).length) {
      const left = cats.querySelector('.left-column');
      const right = cats.querySelector('.right-column');
      left.innerHTML = ''; 
      right.innerHTML = '';

      const back = document.createElement('button'); 
      back.innerHTML = '<i class="fas fa-arrow-left"></i>'; 
      back.className = 'back-button';

      const updEx = () => { 
        const ex = container.querySelector('#cw-exclude'); 
        if (ex) ex.value = JSON.stringify(this.sessionDeselectedItems); 
        this.updateSubmitButtonState(); 
      };

      const renderRight = (cat) => {
        if (!cat || !categories[cat]) { 
          left.className = 'left-column'; 
          right.className = 'right-column'; 
          right.style.visibility = 'hidden';
          right.style.transform = 'translateX(101%)';
          cats.style.height = left.scrollHeight + 'px'; 
          return; 
        }
        right.innerHTML = `<div class="subcategory-header">${back.outerHTML}<div style="display:flex;align-items:center;"><h3 style="margin:0;">${cat}</h3><i class="${this.getIconClass(categories[cat].icon)}" style="font-size:2em;color:#007bff;margin-left:10px;"></i></div></div>`;
        
        (categories[cat].subcategories || []).forEach(sub => {
          const name = (sub && typeof sub === 'object') ? (sub.name || sub.label || sub.subcategory || String(sub)) : String(sub || '');
          const el = document.createElement('div'); el.className = 'subcategory-item';
          const lc = document.createElement('div'); lc.className = 'label-container';
          const lbl = document.createElement('span'); lbl.textContent = name; lbl.className = 'subcategory-label'; lbl.style.cursor = 'pointer';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'subcategory-checkbox'; cb.checked = !this.sessionDeselectedItems.includes(name); cb.value = name;
          lc.append(lbl); el.append(cb, lc); right.appendChild(el);
        });
        
        left.className = 'left-column hidden'; 
        right.className = 'right-column visible';
        right.style.visibility = 'visible';
        right.style.transform = 'translateX(0)';
        cats.style.height = right.scrollHeight + 'px';

        const nb = right.querySelector('.back-button');
        if (nb) nb.addEventListener('click', e => { 
          e.preventDefault(); 
          // === FULL RESET TO INITIAL MAIN CATEGORIES VIEW ===
          right.innerHTML = '';
          left.className = 'left-column';
          right.className = 'right-column';
          right.style.visibility = 'hidden';
          right.style.transform = 'translateX(101%)';
          cats.style.height = left.scrollHeight + 'px';
        });
      };

      Object.entries(categories).forEach(([cat, d]) => {
        if (!d.icon || !d.subcategories) return;
        const div = document.createElement('div'); div.className = 'category-group';
        const lc = document.createElement('div'); lc.className = 'label-container';
        const ic = document.createElement('i'); ic.className = this.getIconClass(d.icon) + ' category-icon'; ic.style.color = '#007bff';
        const iw = document.createElement('span'); iw.className = 'icon-wrapper'; iw.append(ic);
        iw.addEventListener('click', e => { e.preventDefault(); renderRight(cat); });
        const lbl = document.createElement('a'); lbl.href = '#'; lbl.textContent = cat; lbl.className = 'category-label';
        lbl.addEventListener('click', e => { e.preventDefault(); renderRight(cat); });
        lc.append(iw, lbl);
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = `cw-category-${cat}`; cb.value = cat; cb.className = 'category-checkbox'; cb.checked = !this.sessionDeselectedItems.includes(cat);
        cb.addEventListener('change', () => {
          if (!cb.checked) { if (!this.sessionDeselectedItems.includes(cat)) this.sessionDeselectedItems.push(cat); renderRight(''); } else { this.sessionDeselectedItems = this.sessionDeselectedItems.filter(x => x !== cat); renderRight(cat); }
          updEx();
        });
        div.append(lc, cb); left.appendChild(div);
      });
      cats.style.height = left.scrollHeight + 'px';
      const exIn = container.querySelector('#cw-exclude'); if (exIn) exIn.value = JSON.stringify(this.sessionDeselectedItems);
      const catIn = container.querySelector('#cw-categories'); if (catIn) catIn.value = JSON.stringify(categories);
    }
    this.updateErrorMessage(error_message);
  }

  async updateDialogText(t, speak = false) { const s = document.querySelector('#cw-dialog-text'); if (!s || !this.isPageLoaded) return; this.dialogText = t; if (speak) await this.handleDialog({ dialog: t }); else this.typeText(s, t, () => {}); }

  async handleDialog(d) {
    const s = document.querySelector('#cw-dialog-text');
    if (!s || !this.isPageLoaded) return;
    let txt = '', aud = null;
    if (typeof d === 'string') txt = d; else if (d && typeof d === 'object') { txt = d.dialog || ''; aud = d.audio || null; }
    this.dialogText = txt;

    if (localStorage.getItem('audioMuted') === 'true') {
      this.typeText(s, txt, () => {});
      return;
    }

    // UNCONDITIONAL iOS FORCE — NO LOGIC, NO SHORT-CIRCUITS
    // Before we play any AI response on iOS we MUST display the Listen/Quiet dialog.
    // We call requestTTSPermission() directly so every previous granted/denied/audioUnlocked check is bypassed.
    if (this.isIOS()) {
      const ok = await this.requestTTSPermission();
      if (ok) {
        this.ttsPermission = 'granted';
        localStorage.setItem('ttsPermission', 'granted');
        this.ttsEnabled = true;
        localStorage.setItem('ttsEnabled', 'true');
        // unlock already ran inside the allow-tts click handler
      } else {
        this.ttsPermission = 'denied';
        localStorage.setItem('ttsPermission', 'denied');
        this.ttsEnabled = false;
        localStorage.setItem('ttsEnabled', 'false');
        this.typeText(s, txt, () => {});
        return;
      }
    }

    if (aud && this.ttsEnabled && this.ttsPermission !== 'denied') {
      try {
        if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio = null; }
        const a = new Audio(`data:audio/mp3;base64,${aud}`);
        a.preload = 'auto';
        a.volume = 1; // FORCE full volume BEFORE any play
        this.currentAudio = a;
        a.onended = () => { this.currentAudio = null; };
        const playAttempt = () => {
          a.volume = 1; // re-assert volume immediately before play
          a.play().catch(err => console.warn('[CategoriesWidget] Grok MP3 play attempt failed', err));
        };
        a.addEventListener('loadeddata', playAttempt, { once: true });
        a.addEventListener('canplaythrough', playAttempt, { once: true });
        a.load();
        playAttempt();
      } catch (e) {
        console.error('[CategoriesWidget] Base64 audio setup failed', e);
      }
    } else if (this.ttsEnabled) { 
      this.startDialogSpeech(txt); 
    }
    this.typeText(s, txt, () => {});
  }
  requestTTSPermission() { return new Promise(r => { this.isPermissionPrompted = true; const dlg = document.createElement('div'); dlg.id = 'tts-permission-dialog'; dlg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.5);display:flex;justify-content:center;align-items:center;z-index:2000;'; dlg.innerHTML = `<div style="background:white;padding:30px;border-radius:5px;text-align:center;max-width:500px;width:90%;"><p style="margin-bottom:20px;font-size:1.2em;">Would you like me to read my responses aloud?</p><button id="allow-tts" style="padding:12px 24px;margin-right:15px;background:#007bff;color:white;border:none;border-radius:3px;cursor:pointer;font-size:1.1em;"><i class="fas fa-volume-up" style="margin-right:5px;"></i>Read it</button><button id="deny-tts" style="padding:12px 24px;background:#dc3545;color:white;border:none;border-radius:3px;cursor:pointer;font-size:1.1em;"><i class="fas fa-volume-mute" style="margin-right:5px;"></i>Quiet</button></div>`; document.body.appendChild(dlg); dlg.querySelector('#allow-tts').onclick = () => { 
        // CRITICAL for iOS: unlock audio WHILE still inside the user gesture so the browser shows "Allow Sound"
        this.unlockAudioOnGesture();
        document.body.removeChild(dlg); 
        this.isPermissionPrompted = false; 
        r(true); 
      }; dlg.querySelector('#deny-tts').onclick = () => { document.body.removeChild(dlg); this.isPermissionPrompted = false; r(false); }; }); }
  async requestTTSPermissionIfNeeded() { 
    if (localStorage.getItem('audioMuted') === 'true' || !this.ttsEnabled) return true;
    // On iOS we must still show the dialog (and run unlock under the click) every page load
    // until we have successfully unlocked under a user gesture this session.
    // localStorage 'granted' alone is not enough on Safari.
    if (this.ttsPermission === 'granted' && (!this.isIOS() || this.audioUnlocked)) return true; 
    if (this.ttsPermission === 'denied') return false;
    const ok = await this.requestTTSPermission(); 
    if (ok) { 
      this.ttsPermission = 'granted'; 
      localStorage.setItem('ttsPermission', 'granted'); 
      return true; 
    } 
    this.ttsPermission = 'denied'; 
    localStorage.setItem('ttsPermission', 'denied'); 
    return false; 
  }
  async startDialogSpeech(txt) {
    if (localStorage.getItem('audioMuted') === 'true') return Promise.resolve();
    if (!this.isPageLoaded || !this.ttsEnabled) return Promise.resolve();
    if (this.currentUtterance) window.speechSynthesis.cancel();
    await this.waitForVoices();
    // Minimal silent warm-up only (kept for unlock reliability). Volume is forced to 1 on the real utterance below so there is no quiet-start / ramp.
    for (let i = 0; i < 2; i++) { const p = new SpeechSynthesisUtterance(" "); p.volume = 0; window.speechSynthesis.speak(p); await new Promise(r => setTimeout(r, 20)); window.speechSynthesis.cancel(); }
    this.currentUtterance = new SpeechSynthesisUtterance(txt || " ");
    const vs = window.speechSynthesis.getVoices();
    this.currentUtterance.voice = vs.find(v => v.name.includes('Daniel') && v.lang.includes('en-GB')) || vs.find(v => v.lang.includes('en-GB')) || vs.find(v => v.lang.includes('en-US')) || vs[0];
    this.currentUtterance.rate = 0.84;
    this.currentUtterance.volume = 1; // FORCE full volume BEFORE any speak call
    return new Promise(res => {
      this.currentUtterance.onend = () => { this.isSpeaking = false; res(); };
      this.currentUtterance.onerror = () => { this.isSpeaking = false; res(); };
      setTimeout(() => { 
        this.requestTTSPermissionIfNeeded().then(a => { 
          if (a) {
            // Re-assert volume immediately before the actual speak
            this.currentUtterance.volume = 1;
            window.speechSynthesis.speak(this.currentUtterance); 
          } else res(); 
        }); 
      }, 450);
    });
  }
  stopDialogSpeech() { if (this.currentUtterance) { window.speechSynthesis.cancel(); this.isSpeaking = false; } if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio = null; } }

  stopCatalogAudio() {
    this.stopDialogSpeech();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  typeText(el, txt, cb) { if (this._currentTypingInterval) clearInterval(this._currentTypingInterval); el.textContent = ''; const w = txt.split(' '); let i = 0; const next = () => { if (i >= w.length) { clearInterval(this._currentTypingInterval); if (cb) cb(); return; } el.textContent += (i > 0 ? ' ' : '') + w[i]; i++; el.parentNode.scrollTop = el.parentNode.scrollHeight; }; this._currentTypingInterval = setInterval(next, 100); }

  updateControlButton() {
    const b = document.getElementById('cw-control-button');
    if (!b) return;

    let ic = 'fa-microphone', col = 'green', t = '(off)', bg = '#d3d3d3';
    if (this.isListening) { col = 'red'; t = '(on)'; bg = 'black'; }
    if (this.sttPermission === 'denied') { ic = 'fa-microphone-slash'; col = 'red'; t = '(denied)'; bg = '#d3d3d3'; }

    b.innerHTML = `<i class="fas ${ic}" style="color:${col}; font-size:1.6em;"></i>`;
    b.style.backgroundColor = bg;
    b.onclick = () => this.toggleSpeechRecognition();
  }

  getIconClass(d) { if (!d) return 'fa-solid fa-circle-question'; if (d.includes(' ')) return d; if (d.startsWith('fa-')) return `fa-solid ${d}`; return `fa-solid fa-${d}`; }
  setupSpeechRecognition() {
    const c = document.getElementById(this.containerId); if (!c) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    this.recognition = new SR(); this.recognition.lang = 'en-US'; this.recognition.interimResults = true; this.recognition.continuous = true;
    const ta = c.querySelector('#cw-prompt'); if (!ta) return;
    ta.addEventListener('click', () => {
      if (this.isListening) {
        console.log('[CategoriesWidget] Text entry clicked — turning microphone OFF');
        this.toggleSpeechRecognition();
      }
    });
    this.recognition.onstart = () => { this.sttPermission = 'granted'; localStorage.setItem('sttPermission', 'granted'); };
    this.recognition.onresult = e => {
      let f = '', it = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) f += t + ' '; else it += t; }
      if (f) this.speechBuffer += f; ta.value = this.speechBuffer + it; ta.scrollTop = ta.scrollHeight; this.updateSubmitButtonState();
    };
    this.recognition.onerror = e => { if (e.error === 'not-allowed') { this.sttPermission = 'denied'; localStorage.setItem('sttPermission', 'denied'); this.sttEnabled = false; localStorage.setItem('sttEnabled', 'false'); this.isListening = false; this.updateControlButton(); } };
    this.recognition.onend = () => { if (this.isListening) { try { this.recognition.start(); } catch { this.isListening = false; this.updateControlButton(); } } else { this.isListening = false; this.updateControlButton(); } };
  }
  toggleSpeechRecognition() {
    if (!this.recognition) return;
    const ta = document.querySelector('#cw-prompt');
    if (this.isListening) {
      this.recognition.stop(); this.isListening = false; this.sttEnabled = false; localStorage.setItem('sttEnabled', 'false');
      if (ta) { ta.value = this.speechBuffer.trim(); ta.scrollTop = ta.scrollHeight; }
    } else {
      if (this.isSpeaking) this.stopDialogSpeech();
      if (ta) { 
        this.speechBuffer = ta.value.trim(); 
        if (this.speechBuffer && !this.speechBuffer.endsWith(' ')) this.speechBuffer += ' '; 
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
      try { this.recognition.start(); this.isListening = true; this.sttEnabled = true; localStorage.setItem('sttEnabled', 'true'); } catch {}
    }
    this.updateControlButton();
  }
  waitForSpeechFinalization() { return new Promise(r => { if (!this.isListening || !this.recognition) { r(); return; } this.recognition.stop(); this.isListening = false; const h = () => { this.recognition.removeEventListener('end', h); const ta = document.querySelector('#cw-prompt'); if (ta) { ta.value = this.speechBuffer.trim(); ta.scrollTop = ta.scrollHeight; } this.updateControlButton(); r(); }; this.recognition.addEventListener('end', h); setTimeout(() => { if (this.isListening) { this.recognition.removeEventListener('end', h); this.isListening = false; this.updateControlButton(); r(); } }, 2000); }); }
  showLoadingOverlay() {
    const c = document.getElementById(this.containerId); if (!c) return;
    const ex = document.getElementById('cw-processingOverlay'); if (ex) ex.remove();
    const dlg = c.querySelector('#cw-dialog-container');
    if (!dlg) { const o = c.querySelector('#cw-loadingOverlay'); if (o) o.style.display = 'flex'; this.isPageLoaded = false; return; }
    const r = dlg.getBoundingClientRect(); const cr = c.getBoundingClientRect();
    const o = document.createElement('div'); o.id = 'cw-processingOverlay';
    o.style.cssText = `position:absolute;top:${r.bottom - cr.top + 8}px;left:0;width:100%;height:calc(100% - ${r.bottom - cr.top + 8}px);background:rgba(255,255,255,.88);z-index:999;display:flex;justify-content:center;align-items:center;border-radius:0 0 8px 8px;`;
    o.innerHTML = `<div style="position:relative;width:200px;height:200px;"><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:80px;height:80px;border-top-color:#ff6f61;top:60px;left:60px;animation-delay:0s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:60px;height:60px;border-top-color:#6bff61;top:70px;left:70px;animation-delay:0.3s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:40px;height:40px;border-top-color:#61cfff;top:80px;left:80px;animation-delay:0.6s;"></div><div style="position:absolute;border-radius:50%;border:7px solid transparent;animation:cw-spin 1.5s linear infinite;width:20px;height:20px;border-top-color:#ff61ff;top:90px;left:90px;animation-delay:0.9s;"></div></div>`;
    c.style.position = 'relative'; c.appendChild(o); this.isPageLoaded = false;
    const p = c.querySelector('#cw-prompt'); if (p) { p.value = ''; this.speechBuffer = ''; }
  }
  hideLoadingOverlay() {
    const c = document.getElementById(this.containerId); if (!c) return;
    const i = c.querySelector('#cw-loadingOverlay'); if (i) i.style.display = 'none';
    const p = document.getElementById('cw-processingOverlay'); if (p) p.remove();
    this.isPageLoaded = true;
  }
  updateSubmitButtonState() {
    const f = document.getElementById('cw-category-form'); if (!f) return;
    const p = f.querySelector('#cw-prompt'); const e = f.querySelector('#cw-exclude'); const b = f.querySelector('#cw-submit-button');
    if (!p || !e || !b) return;
    let ex = []; try { ex = JSON.parse(e.value || '[]'); } catch {}
    b.disabled = !(p.value.trim().length > 0 || ex.length > 0);
  }
  updateErrorMessage(m) { const d = document.querySelector('#cw-category-error'); if (d) { d.style.display = m ? 'block' : 'none'; d.textContent = m || ''; } }
  setupEvents() {
    const c = document.getElementById(this.containerId); if (!c) return;
    const f = c.querySelector('#cw-category-form'); if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!this.validateToken()) { this.renderNotAuthenticated(); return; }
      const b = f.querySelector('#cw-submit-button'); if (b) b.disabled = true;
      if (this.isListening) await this.waitForSpeechFinalization();
      const fd = new FormData(f); let p = (fd.get('prompt') || '').trim(); let ex = []; try { ex = JSON.parse(fd.get('exclude') || '[]'); } catch {}
      let fp = p; if (ex.length) fp = fp ? `${fp} remove ${ex.join(' ')}` : `remove ${ex.join(' ')}`;
      const d = await this.postCategories(fp, ex);
      if (d.status === 'processing' || d.status === 'success') {
        // RESTORED: intermediate dialog text while the request is being processed.
        // The final permission dialog still appears only when the response is ready (inside handleDialog).
        const ds = document.querySelector('#cw-dialog-text'); if (ds && d.dialog) { ds.textContent = ''; this.typeText(ds, d.dialog, () => {}); }
        const pi = document.querySelector('#cw-prompt'); if (pi && d.prompt !== undefined) { pi.value = d.prompt; this.speechBuffer = d.prompt; }
        if (d.status === 'processing') { this.showLoadingOverlay(); await new Promise(r => setTimeout(r, 3000)); await this.pollCategories(); } else { this.hideLoadingOverlay(); this.renderLowerArea(d); await this.handleDialog(d); }
        if (b) b.disabled = false; return;
      }
      this.hideLoadingOverlay(); this.updateErrorMessage(d.error_message || 'Failed'); if (b) b.disabled = false;
    });
    const pi = f.querySelector('#cw-prompt');
    if (pi) { pi.addEventListener('input', () => this.updateSubmitButtonState()); pi.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.dispatchEvent(new Event('submit')); } }); }
  }

  async loadAudioTourScript() {
    return new Promise((resolve, reject) => {
      if (window.initAudioTour) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load audiotour.js'));
      document.head.appendChild(script);
    });
  }

  async initializeCategories() {
    console.log('[CategoriesWidget] initializeCategories started');
    if (!this.validateToken()) { this.renderNotAuthenticated(); return; }
    try { await loadCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css'); } catch {}
    try {
      this.renderInitialUI();
      this.renderUpperArea();

      const oldMic = document.getElementById('cw-control-button');
      if (oldMic) oldMic.remove();

      const micBtn = document.createElement('button');
      micBtn.id = 'cw-control-button';
      micBtn.className = 'icon-button';
      micBtn.style.cssText = `
        position: fixed;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        width: 78px;
        height: 78px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 6px 16px rgba(0,0,0,0.35);
        border: none;
        background: #d3d3d3;
        cursor: pointer;
        font-size: 1.4em;
      `;
      document.body.appendChild(micBtn);

      const style = document.createElement('style');
      style.innerHTML = `
        @media (max-width: 600px) {
          #cw-control-button { bottom: 60px !important; z-index: 200 !important; }
        }
        @media (min-width: 601px) {
          #cw-control-button { bottom: 90px !important; z-index: 9999; }
        }
        .audiotour-placement {
          position: fixed;
          bottom: 60px;
          left: calc(50% + 55px);
          z-index: 300;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 600px) {
          .audiotour-placement { bottom: 60px !important; }
        }
        @media (min-width: 601px) {
          .audiotour-placement { bottom: 90px !important; }
        }
      `;
      document.head.appendChild(style);

      this.updateControlButton();

      const widgetContainer = document.getElementById(this.containerId);
      const helpContainer = document.createElement('div');
      helpContainer.className = 'audiotour-placement';
      helpContainer.setAttribute('container', 'categories-widget');
      widgetContainer.appendChild(helpContainer);

      try {
        await this.loadAudioTourScript();
        if (window.initAudioTour) {
          window.initAudioTour('categories-widget', 'categories-widget-audiotour.json');
        }
      } catch (audioError) {
        console.warn('[CategoriesWidget] Could not load Audio Tour:', audioError);
      }

      window.stopCatalogAudio = () => this.stopCatalogAudio();

      // DISABLED: early page-load permission dialog (2026-07-22)
      // Reason: User requires the dialog to appear only immediately before the AI response is displayed / read,
      // not on every page open. The force-on-iOS logic inside requestTTSPermissionIfNeeded + the existing
      // calls inside handleDialog (MP3 path) and startDialogSpeech now provide the correct timing.
      // if (this.isIOS() && localStorage.getItem('audioMuted') !== 'true' && this.ttsEnabled) {
      //   await this.requestTTSPermissionIfNeeded();
      // }

      const d = await this.getCategories();
      this.renderLowerArea(d);

      setTimeout(() => {
        const lower = document.getElementById('cw-lower-container');
        const upper = document.getElementById('cw-upper-container');
        if (lower && upper && window.innerWidth <= 600) {
          const h = upper.offsetHeight || 360;
          lower.style.setProperty('margin-top', `${h + 20}px`, 'important');
        }
      }, 120);

      this.setupEvents();
      this.hideLoadingOverlay();
      if (this.ttsEnabled) this.warmUpTTS();
      const st = d.status || 'complete';
      if (['processing', 'queued', 'building_catalog', 'generating_categories'].includes(st)) {
        this.showLoadingOverlay();
        const ds = document.querySelector('#cw-dialog-text'); if (ds && d.dialog) { ds.textContent = ''; this.typeText(ds, d.dialog, () => {}); }
        await this.pollCategories();
      } else { await this.handleDialog(d); }
    } catch {
      this.hideLoadingOverlay();
      const c = document.getElementById(this.containerId);
      if (c && !c.querySelector('#cw-upper-container')) this.renderUpperArea();
    }
  }

  async init() {
    try {
      if (!this.validateToken()) { this.renderNotAuthenticated(); return; }
      // DISABLED: early page-load permission dialog (2026-07-22)
      // Reason: User requires the dialog to appear only immediately before the AI response is displayed / read,
      // not on every page open. The force-on-iOS logic inside requestTTSPermissionIfNeeded + the existing
      // calls inside handleDialog (MP3 path) and startDialogSpeech now provide the correct timing.
      // if (this.isIOS() && localStorage.getItem('audioMuted') !== 'true' && this.ttsEnabled) {
      //   await this.requestTTSPermissionIfNeeded();
      // }
      await this.initializeCategories();
      const pi = document.querySelector('#cw-prompt'); if (pi) { pi.value = ''; this.speechBuffer = ''; }
      window.addEventListener('resize', () => {
        const d = { categories: JSON.parse(document.querySelector('#cw-categories')?.value || '{}'), exclude: this.sessionDeselectedItems, error_message: document.querySelector('#cw-category-error')?.textContent || '' };
        this.renderLowerArea(d);
      });
      const lc = document.getElementById('cw-lower-container'); if (lc) lc.style.marginBottom = '60px';
      window.addEventListener('storage', e => { 
        if (e.key === 'audioMuted') {
          this.ttsEnabled = e.newValue !== 'true';
          console.log('[CategoriesWidget] audioMuted changed — ttsEnabled now', this.ttsEnabled);
        }
      });
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const w = new CategoriesWidget();
  await w.init();
});
// ====================== END FULL UNABRIDGED FILE ======================