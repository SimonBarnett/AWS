// ====================== categories-widget.js ======================
// Full unabridged file
// Help Tour now waits for the FULL length of the base64 audio / speech
// Each hover stays visible until the audio finishes

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
    this.ttsEnabled = this.ttsPermission !== 'denied' && localStorage.getItem('ttsEnabled') !== 'false';
    this.sttPermission = localStorage.getItem('sttPermission') || 'prompt';
    this.sttEnabled = localStorage.getItem('sttEnabled') === 'true';
    this.helpTourRunning = false;
    this.tourAudio = {};
    this.helpHovers = [
      { text: 'Click a category to see its subcategories.', duration: 2, computePosition: () => ({ x: 30, y: 220 }) },
      { text: 'Remove unwanted categories by unticking them.', duration: 2, computePosition: () => ({ x: 550, y: 220}) },
      { text: 'Use the microphone button to talk to me...', duration: 2, computePosition: () => ({ x: 180, y: 180 }) },
      { text: 'Or write a prompt in the text box.', duration: 2, computePosition: () => ({ x: 30, y: 90 }) },
      { text: 'And click "Go" to submit.', duration: 2, computePosition: () => ({ x: 550, y: 90 }) }
    ];
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
    this.handleResetClick = this.handleResetClick.bind(this);
    this.typeText = this.typeText.bind(this);
    this.setupSpeechRecognition = this.setupSpeechRecognition.bind(this);
    this.toggleSpeechRecognition = this.toggleSpeechRecognition.bind(this);
    this.startDialogSpeech = this.startDialogSpeech.bind(this);
    this.stopDialogSpeech = this.stopDialogSpeech.bind(this);
    this.updateControlButton = this.updateControlButton.bind(this);
    this.updateSpeakerButton = this.updateSpeakerButton.bind(this);
    this.toggleTTS = this.toggleTTS.bind(this);
    this.requestTTSPermissionIfNeeded = this.requestTTSPermissionIfNeeded.bind(this);
    this.updateDialogText = this.updateDialogText.bind(this);
    this.updateErrorMessage = this.updateErrorMessage.bind(this);
    this.waitForVoices = this.waitForVoices.bind(this);
    this.handleDialog = this.handleDialog.bind(this);
    this.requestTTSPermission = this.requestTTSPermission.bind(this);
    this.isIOS = this.isIOS.bind(this);
    this.getBoundingClientRect = this.getBoundingClientRect.bind(this);
    this.startHelpTour = this.startHelpTour.bind(this);
    this.stopHelpTour = this.stopHelpTour.bind(this);
    this.warmUpTTS = this.warmUpTTS.bind(this);
    this.loadTourAudio = this.loadTourAudio.bind(this);
    this.playTourAudio = this.playTourAudio.bind(this);
  }

  async loadTourAudio() {
    try {
      const res = await fetch('tour_audio_base64.json');
      if (!res.ok) throw new Error('tour_audio_base64.json not found');
      const data = await res.json();
      this.tourAudio = data.messages || {};
      console.log('[CategoriesWidget] Tour audio base64 loaded successfully');
    } catch (e) {
      console.warn('[CategoriesWidget] Could not load tour_audio_base64.json — falling back to live TTS');
      this.tourAudio = {};
    }
  }

  async playTourAudio(index) {
    const entry = this.tourAudio[index];
    if (!entry || !entry.base64) {
      return false;
    }

    if (!this.ttsEnabled || this.ttsPermission === 'denied') {
      return false;
    }

    return new Promise((resolve) => {
      try {
        if (this.currentAudio) {
          this.currentAudio.pause();
          this.currentAudio = null;
        }

        const audio = new Audio(`data:audio/mp3;base64,${entry.base64}`);
        audio.volume = 1;

        audio.addEventListener('canplaythrough', () => {
          setTimeout(() => {
            if (this.ttsEnabled && this.ttsPermission !== 'denied') {
              audio.play().catch(() => resolve(false));
            } else {
              resolve(false);
            }
          }, 30);
        }, { once: true });

        this.currentAudio = audio;

        audio.onended = () => {
          this.currentAudio = null;
          resolve(true);
        };

        audio.onerror = () => {
          this.currentAudio = null;
          resolve(false);
        };

      } catch (e) {
        console.error('Tour base64 audio error:', e);
        resolve(false);
      }
    });
  }

  log(message, data = {}) { }
  getAuthToken() { return localStorage.getItem('authToken'); }
  validateToken() {
    const token = this.getAuthToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime > payload.exp) return false;
      return true;
    } catch (error) { return false; }
  }
  renderNotAuthenticated() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    container.innerHTML = `<div class="not-authenticated" style="max-width: 400px; margin: 0 auto; padding: 20px; text-align: center;"><p style="font-size: 1.2em; color: #333;"><i class="fas fa-user-lock" aria-hidden="true" style="margin-right: 5px;"></i> Please Login to manage your discount categories.</p></div>`;
    window.location.href = '/login.html';
  }
  async getCategories() {
    const token = this.getAuthToken();
    if (!token) return { status: 'error', error_message: 'Authentication required', categories: {}, exclude: [], dialog: '' };
    try {
      const response = await fetch(`${this.apiEndpoint}/ui/category`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) { localStorage.removeItem('authToken'); localStorage.removeItem('user_id'); localStorage.removeItem('contact_name'); window.location.href = '/login.html'; }
        throw new Error(`HTTP error: ${response.status}`);
      }
      const data = await response.json();
      console.log('GET /ui/category result:', data);
      return data;
    } catch (error) { return { status: 'error', error_message: `Failed to fetch categories: ${error.message}`, categories: {}, exclude: [], dialog: '' }; }
  }
  async postCategories(prompt = '', exclude = []) {
    const token = this.getAuthToken();
    if (!token) return { status: 'error', error_message: 'Authentication required', categories: {}, exclude: [], dialog: '' };
    try {
      const response = await fetch(`${this.apiEndpoint}/ui/category`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ prompt, exclude }) });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) { localStorage.removeItem('authToken'); localStorage.removeItem('user_id'); localStorage.removeItem('contact_name'); window.location.href = '/login.html'; }
        throw new Error(`HTTP error: ${response.status}`);
      }
      const data = await response.json();
      console.log('POST /ui/category result:', data);
      return data;
    } catch (error) { return { status: 'error', error_message: `Failed to fetch categories: ${error.message}`, categories: {}, exclude: [], dialog: '' }; }
  }
  async pollCategories() {
    while (true) {
      const data = await this.getCategories();
      console.log('Polling /ui/category result:', data);
      const status = data.status || 'complete';
      const promptInput = document.querySelector('#cw-prompt');
      if (promptInput && data.prompt !== undefined) { promptInput.value = data.prompt; this.speechBuffer = data.prompt; }
      const dialogSpan = document.querySelector('#cw-dialog-text');
      if (dialogSpan && data.dialog) { dialogSpan.textContent = ''; this.typeText(dialogSpan, data.dialog, () => { }); }
      if (status === 'failed' || status === 'timeout') { this.renderLowerArea(data); this.updateErrorMessage(data.error_message || ''); this.hideLoadingOverlay(); return; }
      if (status !== 'processing' && status !== 'queued' && status !== 'building_catalog') { this.renderLowerArea(data); this.updateErrorMessage(data.error_message || ''); this.hideLoadingOverlay(); await this.handleDialog(data); return; }
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
  }
  waitForVoices() { return new Promise((resolve) => { const voices = window.speechSynthesis.getVoices(); if (voices.length > 0) { resolve(); return; } const handler = () => { window.speechSynthesis.removeEventListener('voiceschanged', handler); resolve(); }; window.speechSynthesis.addEventListener('voiceschanged', handler); }); }
  async warmUpTTS() { try { await this.waitForVoices(); const silent = new SpeechSynthesisUtterance("warmup"); silent.volume = 0; silent.rate = 1; window.speechSynthesis.speak(silent); setTimeout(() => window.speechSynthesis.cancel(), 30); } catch (e) { } }
  isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
  getBoundingClientRect(element) { try { return element.getBoundingClientRect(); } catch (error) { return { top: 0, height: 0 }; } }
  renderInitialUI() { const container = document.getElementById(this.containerId); if (!container) return; container.style.margin = '0 0 30px 0'; container.style.padding = '0'; container.style.position = 'relative'; container.innerHTML = `<style>@keyframes cw-spin {0% { transform: rotate(0deg); }100% { transform: rotate(360deg); }}</style><div id="cw-loadingOverlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.85); justify-content: center; align-items: center; z-index: 1000;"><div style="position: relative; width: 200px; height: 200px;"><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div></div></div>`; }
  renderUpperArea() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const upperContainer = document.createElement('div'); upperContainer.id = 'cw-upper-container';
    upperContainer.innerHTML = `<style>#cw-upper-container {background: #fff;padding: 0px;box-sizing: border-box;width: 100%;max-width: 800px;margin: 0 auto;position: relative;z-index: 10;border-bottom: 1px solid transparent;}form { margin: 0; }#categories-widget .speech-bubble {background: #f1f1f1;border-radius: 10px;box-shadow: 0 2px 5px rgba(0,0,0,0.1);width: 100%;height: 6em;overflow-y: scroll;scrollbar-width: none;-ms-overflow-style: none;margin: 0;position: relative;display: flex;flex-direction: column;justify-content: flex-start;align-items: flex-start;font-family: monospace;}#categories-widget .speech-bubble::-webkit-scrollbar { display: none; }#categories-widget button[disabled] { opacity: 0.5; cursor: not-allowed; }#categories-widget textarea {box-sizing: border-box;white-space: pre-wrap;font-size: 1.2em;width: 100%;height: 3em;margin: 0;flex: 1;}#categories-widget .button-group {display: flex;justify-content: center;gap: 10px;margin-bottom: 0;margin-top: 10px;width: 100%;}#categories-widget .prompt-area {display: flex;align-items: center;gap: 10px;margin-bottom: 0;}#categories-widget .icon-button {padding: 10px;font-size: 1em;height: 50px;display: flex;align-items: center;justify-content: center;border: none;border-radius: 5px;transition: background-color 0.2s;color: white;text-align: center;white-space: nowrap;}#categories-widget .icon-button i { font-size: 1.5em; margin-right: 5px; }#categories-widget .icon-button#cw-control-button { background-color: #d3d3d3; }#categories-widget .icon-button#cw-speaker-button { background-color: #d3d3d3; }#categories-widget .icon-button#cw-submit-button { background-color: #007bff; }#categories-widget .icon-button#cw-reset-categories { background-color: #dc3545; }#categories-widget .icon-button#cw-help-button { background-color: #6c757d; }#categories-widget .icon-button:hover:not([disabled]) { background-color: #0056b3; }#categories-widget .icon-button#cw-reset-categories:hover:not([disabled]) { background-color: #c82333; }#categories-widget .icon-button#cw-help-button:hover:not([disabled]) { background-color: #5a6268; }@media (max-width: 600px) {#cw-upper-container {padding: 0;width: 100vw;position: fixed;left: 0;top: 0;margin: 0;z-index: 10;background: #fff;}#categories-widget .speech-bubble {margin: 0;border-radius: 0;width: 100%;height: 8em;box-sizing: border-box;}#categories-widget .robot-icon-container { display: none; }#categories-widget #cw-prompt {min-height: 3em;height: 3em;width: 100%;margin: 0;padding: 8px 8px 8px 0;box-sizing: border-box;}#categories-widget .dialog-area { width: 100%; margin: 0; margin-bottom: 0; }#categories-widget .prompt-area { margin: 0; width: 100%; flex-wrap: wrap; padding-left: 0; }#categories-widget .button-group { margin: 0; padding: 10px 0 10px 0; width: 100%; box-sizing: border-box; justify-content: flex-start; }#categories-widget .form-group { margin-bottom: 0; }}</style><form id="cw-category-form" class="form" style="margin-top: 80px;"><div class="form-group" style="margin-bottom: 15px;"><div class="dialog-area" style="margin-bottom: 15px; width: 100%; display: flex; align-items: flex-start;"><div class="robot-icon-container" style="margin-right: 10px;"><i class="fas fa-robot" style="font-size: 2em; color: #007bff;"></i></div><div id="cw-dialog-container" class="speech-bubble"><span id="cw-dialog-text"></span></div></div></div><div class="prompt-area" style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;"><textarea id="cw-prompt" name="prompt" placeholder="Type your instructions here..." style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; box-sizing: border-box; font-size: 1.2em; background: #fafafa;"></textarea><button type="submit" id="cw-submit-button" disabled class="icon-button"><i class="fas fa-robot"></i><span>Go</span></button></div><div class="button-group"><button type="button" id="cw-help-button" class="icon-button"><i class="fas fa-question-circle" style="color: white;"></i><span>Help</span></button><button type="button" id="cw-control-button" class="icon-button"><i class="fas fa-microphone" style="color: green;"></i><span>(off)</span></button><button type="button" id="cw-speaker-button" class="icon-button"><i class="fas fa-volume-up" style="color: green;"></i><span>(on)</span></button><button type="button" id="cw-reset-categories" class="icon-button" disabled><i class="fas fa-undo"></i><span>Reset</span></button><input type="hidden" id="cw-exclude" name="exclude" value="[]"><input type="hidden" id="cw-categories" name="categories" value="{}"></div></form>`;
    container.appendChild(upperContainer);
    this.setupSpeechRecognition();
    this.updateControlButton();
    this.updateSpeakerButton();
  }
  renderLowerArea(data) {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    let lowerContainer = container.querySelector('#cw-lower-container') || document.createElement('div');
    lowerContainer.id = 'cw-lower-container'; container.appendChild(lowerContainer);
    const { categories = {}, error_message = '' } = data;
    lowerContainer.innerHTML = `<style>#cw-lower-container {box-sizing: border-box;width: 100%;max-width: 800px;margin: 0 auto 40px auto;padding: 0;position: relative;z-index: 5;}#cw-categories-container {display: flex;justify-content: flex-start;width: 100%;position: relative;transition: transform 0.5s ease-in-out;min-height: 0;}@keyframes cw-spin {0% { transform: rotate(0deg); }100% { transform: rotate(360deg); }}#categories-widget .category-label:hover, #categories-widget .subcategory-label:hover { color: #007bff; }#categories-widget .label-container {flex: 1;display: flex;align-items: center;padding-right: 30px;}#categories-widget .category-label {color: black;text-decoration: none;padding-left: 5px;padding-right: 5px;white-space: nowrap;text-align: left;font-size: 1.2em;}#categories-widget .subcategory-label {color: black;padding-left: 2.5px;padding-right: 5px;white-space: nowrap;text-align: left;flex-grow: 1;font-size: 1.2em;}#categories-widget .category-icon { font-size: 2em; }#categories-widget .subcategory-item { display: flex; align-items: center; padding: 5px 0; width: 100%; }#categories-widget .icon-wrapper { width: 30px; text-align: center; cursor: pointer; margin-right: 8px; flex-shrink: 0; }#categories-widget .icon-placeholder { width: 30px; }#categories-widget .category-group {display: flex;align-items: center;padding: 5px 0;width: 100%;position: relative;min-height: 40px;}#categories-widget .category-group:nth-child(even) { background-color: #e6e6e6; }#categories-widget .category-group:nth-child(odd) { background-color: white; }#categories-widget .subcategory-item:nth-child(even) { background-color: #e6e6e6; }#categories-widget .subcategory-item:nth-child(odd) { background-color: white; }#categories-widget .category-checkbox {transform: scale(1.5);position: absolute;right: 5px;top: 50%;transform: translateY(-50%) scale(1.5);z-index: 2;}#categories-widget .subcategory-checkbox { transform: scale(1.5); margin-right: 10px; }#categories-widget .back-button {background: #007bff;color: white;border: none;border-radius: 50%;width: 45px;height: 45px;display: flex;align-items: center;justify-content: center;font-size: 1.5em;cursor: pointer;transition: background-color 0.2s;margin-right: 10px;}#categories-widget .subcategory-header { display: flex; align-items: center; margin-bottom: 15px; width: 100%; }#categories-widget .left-column, #categories-widget .right-column {width: 100%;position: absolute;top: 0;transition: transform 0.5s ease-in-out, visibility 0.5s;visibility: visible;}#categories-widget .left-column { transform: translateX(0); }#categories-widget .right-column { transform: translateX(101%); visibility: hidden; }#categories-widget .left-column.hidden { transform: translateX(-101%); visibility: hidden; }#categories-widget .right-column.visible { transform: translateX(0); visibility: visible; }#cw-loadingOverlay {display: none;position: fixed;top: 0;left: 0;width: 100%;height: 100%;background: rgba(255, 255, 255, 0.8);justify-content: center;align-items: center;z-index: 1000;}#categories-widget .cw-hover-text {position: absolute;background: rgba(255, 255, 224, 0.9);padding: 10px;border: 1px solid #000;border-radius: 5px;box-shadow: 0 2px 5px rgba(0,0,0,0.2);z-index: 1001;max-width: 200px;font-size: 1em;color: #000;}@media (max-width: 600px) {#cw-lower-container { width: 100vw; margin: 0 0 40px 0; padding: 0; position: relative; left: 0; }#categories-widget .subcategory-header { margin-bottom: 10px; padding: 0; }#categories-widget .category-group, #categories-widget .subcategory-item { padding: 5px 0; }#categories-widget .label-container { padding-right: 30px; padding-left: 0; }#categories-widget .category-checkbox { right: 5px; }#categories-widget .category-label { padding-left: 0; }#categories-widget .subcategory-label { padding-left: 0; }#categories-widget .icon-wrapper { margin-left: 0; }}</style><div id="cw-categories-container"><div class="left-column"></div><div class="right-column"></div></div><div id="cw-category-error" style="display: ${error_message ? 'block' : 'none'}; color: red; margin-top: 10px;">${error_message}</div><div id="cw-loadingOverlay"><div style="position: relative; width: 200px; height: 200px;"><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div></div></div>`;
    const upperContainer = document.getElementById('cw-upper-container');
    if (upperContainer && window.innerWidth <= 600) { const upperRect = this.getBoundingClientRect(upperContainer); lowerContainer.style.marginTop = `${upperRect.height}px`; } else { lowerContainer.style.marginTop = '0'; }
    const categoriesContainer = lowerContainer.querySelector('#cw-categories-container');
    const resetButton = container.querySelector('#cw-reset-categories');
    if (resetButton) resetButton.disabled = Object.keys(categories).length === 0;
    if (categoriesContainer && Object.keys(categories).length) {
      const leftColumn = categoriesContainer.querySelector('.left-column');
      const rightColumn = categoriesContainer.querySelector('.right-column');
      leftColumn.innerHTML = ''; rightColumn.innerHTML = '';
      const backButton = document.createElement('button'); backButton.innerHTML = '<i class="fas fa-arrow-left"></i>'; backButton.className = 'back-button';
      const updateExclude = () => { const excludeInput = container.querySelector('#cw-exclude'); if (excludeInput) excludeInput.value = JSON.stringify(this.sessionDeselectedItems); this.updateSubmitButtonState(); };
      const renderRightColumn = (category) => {
        if (!category || !categories[category]) { leftColumn.className = 'left-column'; rightColumn.className = 'right-column'; const leftHeight = leftColumn.scrollHeight; categoriesContainer.style.height = `${leftHeight}px`; return; }
        rightColumn.innerHTML = `<div class="subcategory-header">${backButton.outerHTML}<div style="display: flex; align-items: center;"><h3 style="margin: 0;">${category}</h3><i class="${this.getIconClass(categories[category].icon)}" style="font-size: 2em; color: #007bff; margin-left: 10px;"></i></div></div>`;
        const subs = categories[category].subcategories || [];
        subs.forEach((subItem) => {
          const subName = (subItem && typeof subItem === 'object') ? (subItem.name || subItem.label || subItem.subcategory || String(subItem)) : String(subItem || ''); 
          const subItemEl = document.createElement('div'); subItemEl.className = 'subcategory-item';
          const labelContainer = document.createElement('div'); labelContainer.className = 'label-container';
          const subLabel = document.createElement('span'); subLabel.textContent = subName; subLabel.className = 'subcategory-label'; subLabel.style.cursor = 'pointer';
          const subCheckbox = document.createElement('input'); subCheckbox.type = 'checkbox'; subCheckbox.className = 'subcategory-checkbox'; subCheckbox.checked = !this.sessionDeselectedItems.includes(subName); subCheckbox.value = subName;
          labelContainer.append(subLabel); subItemEl.append(subCheckbox, labelContainer); rightColumn.appendChild(subItemEl);
        });
        leftColumn.className = 'left-column hidden'; rightColumn.className = 'right-column visible';
        const rightHeight = rightColumn.scrollHeight; categoriesContainer.style.height = `${rightHeight}px`;
        const newBackButton = rightColumn.querySelector('.back-button');
        if (newBackButton) newBackButton.addEventListener('click', (e) => { e.preventDefault(); leftColumn.className = 'left-column'; rightColumn.className = 'right-column'; const leftHeight = leftColumn.scrollHeight; categoriesContainer.style.height = `${leftHeight}px`; });
      };
      Object.entries(categories).forEach(([category, categoryData]) => {
        if (!categoryData.icon || !categoryData.subcategories) return;
        const categoryDiv = document.createElement('div'); categoryDiv.className = 'category-group';
        const labelContainer = document.createElement('div'); labelContainer.className = 'label-container';
        const iconElement = document.createElement('i'); const iconClass = this.getIconClass(categoryData.icon); iconElement.className = `${iconClass} category-icon`; iconElement.style.color = '#007bff';
        const iconWrapper = document.createElement('span'); iconWrapper.className = 'icon-wrapper'; iconWrapper.appendChild(iconElement);
        iconWrapper.addEventListener('click', (e) => { e.preventDefault(); renderRightColumn(category); });
        const categoryLabel = document.createElement('a'); categoryLabel.href = '#'; categoryLabel.textContent = category; categoryLabel.className = 'category-label';
        categoryLabel.addEventListener('click', (e) => { e.preventDefault(); renderRightColumn(category); });
        labelContainer.appendChild(iconWrapper); labelContainer.appendChild(categoryLabel);
        const categoryCheckbox = document.createElement('input'); categoryCheckbox.type = 'checkbox'; categoryCheckbox.id = `cw-category-${category}`; categoryCheckbox.value = category; categoryCheckbox.className = 'category-checkbox'; categoryCheckbox.checked = !this.sessionDeselectedItems.includes(category);
        categoryCheckbox.addEventListener('change', () => {
          if (!categoryCheckbox.checked) { if (!this.sessionDeselectedItems.includes(category)) this.sessionDeselectedItems.push(category); renderRightColumn(''); } else { this.sessionDeselectedItems = this.sessionDeselectedItems.filter(item => item !== category); renderRightColumn(category); }
          updateExclude();
        });
        categoryDiv.appendChild(labelContainer); categoryDiv.appendChild(categoryCheckbox); leftColumn.appendChild(categoryDiv);
      });
      const leftHeight = leftColumn.scrollHeight; categoriesContainer.style.height = `${leftHeight}px`;
      const excludeInput = container.querySelector('#cw-exclude'); if (excludeInput) excludeInput.value = JSON.stringify(this.sessionDeselectedItems);
      const categoriesInput = container.querySelector('#cw-categories'); if (categoriesInput) categoriesInput.value = JSON.stringify(categories);
    }
    this.updateErrorMessage(error_message);
  }
  async updateDialogText(text, speak = false) { const dialogSpan = document.querySelector('#cw-dialog-text'); if (!dialogSpan) return; if (!this.isPageLoaded) return; this.dialogText = text; if (speak) await this.handleDialog({ dialog: text }); else this.typeText(dialogSpan, text, () => { }); }
  async handleDialog(dataOrDialog) {
    console.log('[CategoriesWidget] handleDialog received:', dataOrDialog);

    const dialogSpan = document.querySelector('#cw-dialog-text');
    if (!dialogSpan || !this.isPageLoaded) return;

    let dialog = '';
    let audioBase64 = null;

    if (typeof dataOrDialog === 'string') {
      dialog = dataOrDialog;
    } else if (dataOrDialog && typeof dataOrDialog === 'object') {
      dialog = dataOrDialog.dialog || '';
      audioBase64 = dataOrDialog.audio || null;
    }

    this.dialogText = dialog;

    if (audioBase64 && this.ttsEnabled && this.ttsPermission !== 'denied') {
      try {
        if (this.currentAudio) {
          this.currentAudio.pause();
          this.currentAudio = null;
        }

        const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
        audio.volume = 1;

        audio.addEventListener('canplaythrough', () => {
          setTimeout(() => {
            if (this.ttsEnabled && this.ttsPermission !== 'denied') {
              audio.play().catch(() => {});
            }
          }, 30);
        }, { once: true });

        this.currentAudio = audio;

        audio.onended = () => {
          this.currentAudio = null;
        };

      } catch (e) {
        console.error('Base64 audio error:', e);
      }
    } else if (this.ttsEnabled) {
      this.startDialogSpeech(dialog);
    }

    this.typeText(dialogSpan, dialog, () => { });
  }
  requestTTSPermission() { return new Promise((resolve) => { this.isPermissionPrompted = true; const permissionDialog = document.createElement('div'); permissionDialog.id = 'tts-permission-dialog'; permissionDialog.style.cssText = `position: fixed;top: 0;left: 0;width: 100vw;height: 100vh;background: rgba(0,0,0,0.5);display: flex;justify-content: center;align-items: center;z-index: 2000;`; permissionDialog.innerHTML = `<div style="background: white; padding: 30px; border-radius: 5px; text-align: center; max-width: 500px; width: 90%;"><p style="margin-bottom: 20px; font-size: 1.2em;">Would you like me to read my responses aloud?</p><button id="allow-tts" style="padding: 12px 24px; margin-right: 15px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 1.1em;"><i class="fas fa-volume-up" style="margin-right: 5px;"></i>Read it</button><button id="deny-tts" style="padding: 12px 24px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 1.1em;"><i class="fas fa-volume-mute" style="margin-right: 5px;"></i>Quiet</button></div>`; document.body.appendChild(permissionDialog); const allowButton = permissionDialog.querySelector('#allow-tts'); const denyButton = permissionDialog.querySelector('#deny-tts'); allowButton.addEventListener('click', () => { document.body.removeChild(permissionDialog); this.isPermissionPrompted = false; resolve(true); }); denyButton.addEventListener('click', () => { document.body.removeChild(permissionDialog); this.isPermissionPrompted = false; resolve(false); }); }); }
  async requestTTSPermissionIfNeeded() { if (this.ttsPermission === 'granted') return true; const permission = await this.requestTTSPermission(); if (permission) { this.ttsPermission = 'granted'; localStorage.setItem('ttsPermission', 'granted'); return true; } else { this.ttsPermission = 'denied'; localStorage.setItem('ttsPermission', 'denied'); return false; } }
  async startDialogSpeech(text) {
    if (!this.isPageLoaded || !this.ttsEnabled) return Promise.resolve();
    if (this.currentUtterance) window.speechSynthesis.cancel();
    await this.waitForVoices();
    for (let i = 0; i < 4; i++) { const p = new SpeechSynthesisUtterance(" "); p.volume = 0; window.speechSynthesis.speak(p); await new Promise(r => setTimeout(r, 25)); window.speechSynthesis.cancel(); }
    this.currentUtterance = new SpeechSynthesisUtterance(text || " ");
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find(v => v.name.includes('Daniel') && v.lang.includes('en-GB')) || voices.find(v => v.lang.includes('en-GB')) || voices.find(v => v.lang.includes('en-US')) || voices[0];
    this.currentUtterance.voice = selectedVoice; this.currentUtterance.rate = 0.84;
    return new Promise((resolve) => {
      this.currentUtterance.onend = () => { this.isSpeaking = false; resolve(); };
      this.currentUtterance.onerror = () => { this.isSpeaking = false; resolve(); };
      setTimeout(() => { this.requestTTSPermissionIfNeeded().then(allowed => { if (allowed) window.speechSynthesis.speak(this.currentUtterance); else resolve(); }); }, 450);
    });
  }
  stopDialogSpeech() {
    if (this.currentUtterance) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }
  typeText(element, text, callback) { if (this._currentTypingInterval) clearInterval(this._currentTypingInterval); element.textContent = ''; const words = text.split(' '); let index = 0; const typeNextWord = () => { if (index >= words.length) { clearInterval(this._currentTypingInterval); if (callback) callback(); return; } element.textContent += (index > 0 ? ' ' : '') + words[index]; index++; const container = element.parentNode; container.scrollTop = container.scrollHeight; }; this._currentTypingInterval = setInterval(typeNextWord, 100); }
  updateControlButton() { const controlButton = document.querySelector('#cw-control-button'); if (!controlButton) return; let iconClass = 'fa-microphone'; let color = 'green'; let text = '(off)'; let bgColor = '#d3d3d3'; if (this.isListening) { color = 'red'; text = '(on)'; bgColor = 'black'; } if (this.sttPermission === 'denied') { iconClass = 'fa-microphone-slash'; color = 'red'; text = '(denied)'; bgColor = '#d3d3d3'; } controlButton.innerHTML = `<i class="fas ${iconClass}" style="color: ${color};"></i><span>${text}</span>`; controlButton.style.backgroundColor = bgColor; controlButton.onclick = () => this.toggleSpeechRecognition(); }
  updateSpeakerButton() { const speakerButton = document.querySelector('#cw-speaker-button'); if (!speakerButton) return; let iconClass = 'fa-volume-up'; let color = 'green'; let text = '(on)'; let bgColor = '#d3d3d3'; if (!this.ttsEnabled) { iconClass = 'fa-volume-mute'; color = 'red'; text = '(off)'; bgColor = 'black'; } if (this.ttsPermission === 'denied') { iconClass = 'fa-volume-mute'; color = 'red'; text = '(muted)'; bgColor = '#d3d3d3'; } speakerButton.innerHTML = `<i class="fas ${iconClass}" style="color: ${color};"></i><span>${text}</span>`; speakerButton.style.backgroundColor = bgColor; speakerButton.onclick = () => this.toggleTTS(); }
  async toggleTTS() {
    if (this.ttsEnabled) {
      this.ttsEnabled = false;
      localStorage.setItem('ttsEnabled', 'false');
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }
      if (this.isSpeaking) this.stopDialogSpeech();
    } else {
      const allowed = await this.requestTTSPermissionIfNeeded();
      if (allowed) {
        this.ttsEnabled = true;
        localStorage.setItem('ttsEnabled', 'true');
        if (this.dialogText) await this.startDialogSpeech(this.dialogText);
      }
    }
    this.updateSpeakerButton();
  }
  getIconClass(iconData) { if (!iconData) return 'fa-solid fa-circle-question'; if (iconData.includes(' ')) return iconData; if (iconData.startsWith('fa-')) return `fa-solid ${iconData}`; return `fa-solid fa-${iconData}`; }
  setupSpeechRecognition() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    const promptTextarea = container.querySelector('#cw-prompt');
    if (!promptTextarea) return;
    this.recognition.onstart = () => { this.sttPermission = 'granted'; localStorage.setItem('sttPermission', 'granted'); };
    this.recognition.onresult = (event) => {
      let interimTranscript = ''; let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript + ' '; else interimTranscript += transcript;
      }
      if (finalTranscript) this.speechBuffer += finalTranscript;
      promptTextarea.value = this.speechBuffer + interimTranscript;
      promptTextarea.scrollTop = promptTextarea.scrollHeight;
      this.updateSubmitButtonState();
    };
    this.recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        if (event.error === 'not-allowed') { this.sttPermission = 'denied'; localStorage.setItem('sttPermission', 'denied'); this.sttEnabled = false; localStorage.setItem('sttEnabled', 'false'); this.isListening = false; this.updateControlButton(); }
      }
    };
    this.recognition.onend = () => {
      if (this.isListening) { try { this.recognition.start(); } catch (error) { this.isListening = false; this.updateControlButton(); } } else { this.isListening = false; this.updateControlButton(); }
    };
  }
  toggleSpeechRecognition() {
    if (!this.recognition) return;
    const promptTextarea = document.querySelector('#cw-prompt');
    if (this.isListening) {
      this.recognition.stop(); this.isListening = false; this.sttEnabled = false; localStorage.setItem('sttEnabled', 'false');
      if (promptTextarea) { promptTextarea.value = this.speechBuffer.trim(); promptTextarea.scrollTop = promptTextarea.scrollHeight; }
    } else {
      if (this.isSpeaking) this.stopDialogSpeech();
      if (promptTextarea) { this.speechBuffer = promptTextarea.value.trim(); if (this.speechBuffer && !this.speechBuffer.endsWith(' ')) this.speechBuffer += ' '; }
      try { this.recognition.start(); this.isListening = true; this.sttEnabled = true; localStorage.setItem('sttEnabled', 'true'); } catch (error) { }
    }
    this.updateControlButton();
  }
  waitForSpeechFinalization() {
    return new Promise((resolve) => {
      if (!this.isListening || !this.recognition) { resolve(); return; }
      this.recognition.stop(); this.isListening = false;
      const onEndHandler = () => { this.recognition.removeEventListener('end', onEndHandler); const promptTextarea = document.querySelector('#cw-prompt'); if (promptTextarea) { promptTextarea.value = this.speechBuffer.trim(); promptTextarea.scrollTop = promptTextarea.scrollHeight; } this.updateControlButton(); resolve(); };
      this.recognition.addEventListener('end', onEndHandler);
      setTimeout(() => { if (this.isListening) { this.recognition.removeEventListener('end', onEndHandler); this.isListening = false; this.updateControlButton(); resolve(); } }, 2000);
    });
  }
  showLoadingOverlay() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const existing = document.getElementById('cw-processingOverlay');
    if (existing) existing.remove();
    const dialogContainer = container.querySelector('#cw-dialog-container');
    if (!dialogContainer) { const overlay = container.querySelector('#cw-loadingOverlay'); if (overlay) overlay.style.display = 'flex'; this.isPageLoaded = false; return; }
    const dialogRect = dialogContainer.getBoundingClientRect(); const containerRect = container.getBoundingClientRect();
    const overlay = document.createElement('div'); overlay.id = 'cw-processingOverlay';
    overlay.style.cssText = `position: absolute;top: ${dialogRect.bottom - containerRect.top + 8}px;left: 0;width: 100%;height: calc(100% - ${dialogRect.bottom - containerRect.top + 8}px);background: rgba(255, 255, 255, 0.88);z-index: 999;display: flex;justify-content: center;align-items: center;border-radius: 0 0 8px 8px;`;
    overlay.innerHTML = `<div style="position: relative; width: 200px; height: 200px;"><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div><div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div></div>`;
    container.style.position = 'relative'; container.appendChild(overlay); this.isPageLoaded = false;
    const promptInput = container.querySelector('#cw-prompt'); if (promptInput) { promptInput.value = ''; this.speechBuffer = ''; }
  }
  hideLoadingOverlay() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const initialOverlay = container.querySelector('#cw-loadingOverlay'); if (initialOverlay) initialOverlay.style.display = 'none';
    const processingOverlay = document.getElementById('cw-processingOverlay'); if (processingOverlay) processingOverlay.remove();
    this.isPageLoaded = true;
  }
  updateSubmitButtonState() {
    const form = document.getElementById('cw-category-form');
    if (!form) return;
    const promptInput = form.querySelector('#cw-prompt');
    const excludeInput = form.querySelector('#cw-exclude');
    const submitButton = form.querySelector('#cw-submit-button');
    if (!promptInput || !excludeInput || !submitButton) return;
    const prompt = promptInput.value.trim();
    let exclude;
    try { exclude = JSON.parse(excludeInput.value || '[]'); } catch (error) { exclude = []; }
    submitButton.disabled = !(prompt.length > 0 || exclude.length > 0);
  }
  updateErrorMessage(error_message) {
    const errorDiv = document.querySelector('#cw-category-error');
    if (errorDiv) { errorDiv.style.display = error_message ? 'block' : 'none'; errorDiv.textContent = error_message || ''; }
  }
  async handleResetClick() {
    if (!this.validateToken()) { this.renderNotAuthenticated(); return; }
    const overlay = document.createElement('div'); overlay.id = 'cw-dialog-overlay'; overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 999;'; document.body.appendChild(overlay);
    const dialog = document.createElement('div'); dialog.id = 'cw-reset-dialog'; dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 2px solid red; border-radius: 5px; z-index: 1000; width: 80%; max-width: 400px;';
    dialog.innerHTML = `<p>Warning: Resetting will delete all existing categories. This action cannot be undone.</p><p>Type "confirm" to proceed:</p><input type="text" id="cw-confirm-input" style="width: 100%; padding: 5px; margin-bottom: 10px;"><button id="cw-confirm-reset" disabled style="padding: 10px 15px; font-size: 1.2em; background: #dc3545; color: white; border: none; border-radius: 3px;"><i class="fas fa-check" style="margin-right: 5px;"></i>Confirm</button><button id="cw-cancel-reset" style="padding: 10px 15px; font-size: 1.2em; background: #6c757d; color: white; border: none; border-radius: 3px; margin-left: 10px;"><i class="fas fa-times" style="margin-right: 5px;"></i>Cancel</button>`;
    document.body.appendChild(dialog);
    const confirmInput = dialog.querySelector('#cw-confirm-input');
    const confirmButton = dialog.querySelector('#cw-confirm-reset');
    const cancelButton = dialog.querySelector('#cw-cancel-reset');
    confirmInput.addEventListener('input', () => { confirmButton.disabled = confirmInput.value.toLowerCase() !== 'confirm'; });
    cancelButton.addEventListener('click', () => { document.body.removeChild(overlay); document.body.removeChild(dialog); });
    confirmButton.addEventListener('click', async () => {
      if (!this.validateToken()) { this.renderNotAuthenticated(); document.body.removeChild(overlay); document.body.removeChild(dialog); return; }
      this.showLoadingOverlay();
      try {
        const token = this.getAuthToken();
        const response = await fetch(`${this.apiEndpoint}/ui/category/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({}) });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) { localStorage.removeItem('authToken'); localStorage.removeItem('user_id'); localStorage.removeItem('contact_name'); window.location.href = '/login.html'; }
          throw new Error(`HTTP error: ${response.status}`);
        }
        const updatedData = await this.getCategories();
        this.sessionDeselectedItems = [];
        this.renderLowerArea(updatedData);
        this.hideLoadingOverlay();
        await this.handleDialog(updatedData);
      } catch (error) { this.hideLoadingOverlay(); }
      document.body.removeChild(overlay); document.body.removeChild(dialog);
    });
  }
  async startHelpTour() {
    if (this.helpTourRunning) { this.stopHelpTour(); return; }
    this.helpTourRunning = true;
    const container = document.getElementById(this.containerId);

    for (let i = 0; i < this.helpHovers.length; i++) {
      if (!this.helpTourRunning) break;

      const hover = this.helpHovers[i];
      const pos = hover.computePosition();
      const hoverDiv = document.createElement('div');
      hoverDiv.className = 'cw-hover-text';
      hoverDiv.style.left = `${pos.x}px`;
      hoverDiv.style.top = `${pos.y}px`;
      hoverDiv.textContent = hover.text;
      container.appendChild(hoverDiv);

      const dialogSpan = document.querySelector('#cw-dialog-text');
      if (dialogSpan) {
        dialogSpan.textContent = '';
        this.typeText(dialogSpan, hover.text, () => {});
      }

      // Wait for the FULL length of the speech/audio
      let played = false;
      if (this.ttsEnabled) {
        played = await this.playTourAudio(i);
      }

      if (!played) {
        if (this.ttsEnabled) {
          await this.startDialogSpeech(hover.text);
        } else {
          const wordCount = (hover.text.match(/\b\w+\b/g) || []).length;
          const estimatedMs = Math.max(3200, wordCount * 350);
          await new Promise(r => setTimeout(r, estimatedMs));
        }
      }

      if (container.contains(hoverDiv)) container.removeChild(hoverDiv);
      await new Promise(r => setTimeout(r, 450));
    }

    // Final long message (index 5)
    if (this.helpTourRunning) {
      const finalMessage = "Here's how to talk to me. You can say things like: 'add a new category called shop', 'delete the shop category', 'move the shop category under the main categories', or 'change the icon on the shop category to a bag'. Just describe what you want in plain English and I'll update everything nicely. Go on, give it a try!";

      const dialogSpan = document.querySelector('#cw-dialog-text');
      if (dialogSpan) {
        dialogSpan.textContent = '';
        this.typeText(dialogSpan, finalMessage, () => {});
      }

      let playedFinal = false;
      if (this.ttsEnabled) {
        playedFinal = await this.playTourAudio(5);
      }

      if (!playedFinal && this.ttsEnabled) {
        await this.startDialogSpeech(finalMessage);
      } else if (!this.ttsEnabled) {
        await new Promise(r => setTimeout(r, 8500));
      }
    }

    this.helpTourRunning = false;
  }
  stopHelpTour() {
    this.helpTourRunning = false;
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const hovers = container.querySelectorAll('.cw-hover-text');
    hovers.forEach(hover => container.removeChild(hover));
  }
  setupEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const form = container.querySelector('#cw-category-form');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!this.validateToken()) { this.renderNotAuthenticated(); return; }
      const submitButton = form.querySelector('#cw-submit-button');
      if (submitButton) submitButton.disabled = true;
      if (this.isListening) await this.waitForSpeechFinalization();
      const formData = new FormData(form);
      let userPrompt = formData.get('prompt')?.trim() || '';
      let exclude;
      try { exclude = JSON.parse(formData.get('exclude') || '[]'); } catch (error) { exclude = []; }
      let fullPrompt = userPrompt;
      if (exclude.length > 0) { const removeText = exclude.join(' '); fullPrompt = fullPrompt ? `${fullPrompt} remove ${removeText}` : `remove ${removeText}`; }
      const data = await this.postCategories(fullPrompt, exclude);
      if (data.status === 'processing' || data.status === 'success') {
        const dialogSpan = document.querySelector('#cw-dialog-text');
        if (dialogSpan && data.dialog) { dialogSpan.textContent = ''; this.typeText(dialogSpan, data.dialog, () => { }); }
        const promptInput = document.querySelector('#cw-prompt');
        if (promptInput && data.prompt !== undefined) { promptInput.value = data.prompt; this.speechBuffer = data.prompt; }
        if (data.status === 'processing') {
          this.showLoadingOverlay();
          await new Promise(resolve => setTimeout(resolve, 3000));
          await this.pollCategories();
        } else {
          this.hideLoadingOverlay();
          this.renderLowerArea(data);
          await this.handleDialog(data);
        }
        if (submitButton) submitButton.disabled = false;
        return;
      }
      this.hideLoadingOverlay();
      this.updateErrorMessage(data.error_message || 'Failed to submit request');
      if (submitButton) submitButton.disabled = false;
    });
    const promptInput = form.querySelector('#cw-prompt');
    if (promptInput) {
      promptInput.addEventListener('input', () => this.updateSubmitButtonState());
      promptInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.dispatchEvent(new Event('submit')); } });
    }
    container.addEventListener('click', (event) => { const target = event.target.closest('#cw-reset-categories'); if (target) { event.preventDefault(); this.handleResetClick(); } });
    const helpButton = container.querySelector('#cw-help-button');
    if (helpButton) helpButton.addEventListener('click', (event) => { event.preventDefault(); this.startHelpTour(); });
  }
  async initializeCategories() {
    if (!this.validateToken()) { this.renderNotAuthenticated(); return; }
    try { await loadCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css'); } catch (error) { }
    try {
      this.renderInitialUI();
      this.renderUpperArea();
      const data = await this.getCategories();
      this.renderLowerArea(data);
      this.setupEvents();
      this.hideLoadingOverlay();
      if (this.ttsEnabled) this.warmUpTTS();
      const status = data.status || 'complete';
      if (['processing', 'queued', 'building_catalog', 'generating_categories'].includes(status)) {
        this.showLoadingOverlay();
        const dialogSpan = document.querySelector('#cw-dialog-text');
        if (dialogSpan && data.dialog) { dialogSpan.textContent = ''; this.typeText(dialogSpan, data.dialog, () => { }); }
        await this.pollCategories();
      } else {
        await this.handleDialog(data);
      }
      if (this.sttEnabled && this.sttPermission !== 'denied') this.toggleSpeechRecognition();
    } catch (error) {
      this.hideLoadingOverlay();
      const container = document.getElementById(this.containerId);
      if (container && !container.querySelector('#cw-upper-container')) this.renderUpperArea();
    }
  }
  async init() {
    try {
      if (!this.validateToken()) { this.renderNotAuthenticated(); return; }
      await this.loadTourAudio();
      await this.initializeCategories();
      const promptInput = document.querySelector('#cw-prompt');
      if (promptInput) { promptInput.value = ''; this.speechBuffer = ''; }
      window.addEventListener('resize', () => {
        const data = { categories: JSON.parse(document.querySelector('#cw-categories')?.value || '{}'), exclude: this.sessionDeselectedItems, error_message: document.querySelector('#cw-category-error')?.textContent || '' };
        this.renderLowerArea(data);
      });
      const lowerContainer = document.getElementById('cw-lower-container');
      if (lowerContainer) lowerContainer.style.marginBottom = '60px';
    } catch (error) { }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const widget = new CategoriesWidget();
  await widget.init();
});