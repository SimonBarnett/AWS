// Self-contained JavaScript widget for updating discount categories via AWS API Gateway
// Includes Font Awesome for icons, TTS for dialog with audio controls, and STT for prompt input
// Modified to retain entire user input in prompt during speech recognition with pauses
// Changes: Ensures clicking "Ask AI" with microphone on behaves identically to turning off microphone then clicking "Ask AI";
//          Waits for speech recognition to finalize prompt text before fetching; aligns main category checkboxes 5px from right edge;
//          Adds 30px bottom margin to container; updates microphone button to "off" on "Ask AI"; ensures cw-lower.top = cw-upper.top + cw-upper.height;
//          Uses existing TTS permission dialog for iOS; restores original dialog layout for small screens; delays dialog text animation;
//          Left-aligns subcategory text; prevents category icon/text wrapping
// New Changes: Reduces left margin of subcategory text by 50% (padding-left from 5px to 2.5px);
//              Adds 40px bottom margin to cw-lower div
// Latest Changes: Always request permission to speak for TTS;
//                 Do not load history of unselected categories; only track categories unselected in the current session
// Newest Changes: Remember audio/microphone settings; always show mute button for TTS; allow revoking permission via button;
//                 If TTS permission denied, show muted icon clickable to re-request; similar handling for STT permission
// Additional Changes: When audio is unmuted, read the response text;
//                      Replace "Ask AI" with "Go" and move to right of prompt textbox; center remaining buttons
// New Feature: Add help button to the left of audio controls; when clicked, show sequential hover texts at defined x,y coordinates for specified durations
// Fixes: Remove widget title; zero left margins/paddings for small screens; assume page header height 0 for AI response starting at top; fixed footer; content scrolls between fixed elements

// Utility function to load external CSS with promise
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

// Main widget class
class CategoriesWidget {
  constructor() {
    this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod';
    this.containerId = 'categories-widget';
    this.context = 'categories-widget.js';
    this.isListening = false;
    this.recognition = null;
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.dialogText = '';
    this.isInitialRender = true;
    this.isPageLoaded = false;
    this.isPermissionPrompted = false;
    this.speechBuffer = ''; // Buffer to accumulate speech input
    this.sessionDeselectedItems = []; // Track categories deselected in current session
    this.ttsPermission = localStorage.getItem('ttsPermission') || 'prompt'; // 'prompt', 'granted', 'denied'
    this.ttsEnabled = this.ttsPermission !== 'denied' && localStorage.getItem('ttsEnabled') !== 'false'; // default true unless denied or set false
    this.sttPermission = localStorage.getItem('sttPermission') || 'prompt'; // 'prompt', 'granted', 'denied'
    this.sttEnabled = localStorage.getItem('sttEnabled') === 'true'; // default false
    this.helpTourRunning = false;
    this.helpHovers = [
      { 
        text: 'Click a category to see its subcategories.', 
        duration: 2, 
        computePosition: () => {
          const container = document.getElementById('categories-widget');
          if (!container) return {x: 30, y: 50};
          const containerRect = container.getBoundingClientRect();
          let secondRow = container.querySelector('.left-column .category-group:nth-child(2)');
          if (!secondRow) {
            secondRow = container.querySelector('.left-column .category-group');
            if (!secondRow) return {x: 30, y: 50};
          }
          const iconWrapper = secondRow.querySelector('.icon-wrapper');
          if (!iconWrapper) return {x: 30, y: 50};
          const iconRect = iconWrapper.getBoundingClientRect();
          let x = iconRect.right - containerRect.left + 10;
          let y = iconRect.top - containerRect.top;
          const viewportY = containerRect.top + y;
          if (viewportY < 0) {
            y = iconRect.bottom - containerRect.top + 10;
          }
          return {x, y};
        }
      },
      { 
        text: 'Remove unwanted categories by unticking them.', 
        duration: 2, 
        computePosition: () => {
          const container = document.getElementById('categories-widget');
          if (!container) return {x: 280, y: 50};
          const containerRect = container.getBoundingClientRect();
          let secondRow = container.querySelector('.left-column .category-group:nth-child(2)');
          if (!secondRow) {
            secondRow = container.querySelector('.left-column .category-group');
            if (!secondRow) return {x: 300, y: 50};
          }
          const checkbox = secondRow.querySelector('.category-checkbox');
          if (!checkbox) return {x: 280, y: 50};
          const checkRect = checkbox.getBoundingClientRect();
          const assumedBubbleWidth = 250;
          let x = checkRect.left - containerRect.left - assumedBubbleWidth - 5;
          let y = checkRect.top - containerRect.top;
          const viewportY = containerRect.top + y;
          if (viewportY < 0) {
            y = checkRect.bottom - containerRect.top + 10;
          }
          return {x, y};
        }
      },
      { 
        text: 'Or write a prompt.', 
        duration: 2, 
        computePosition: () => {
          const container = document.getElementById('categories-widget');
          if (!container) return {x: 0, y: -100};
          const containerRect = container.getBoundingClientRect();
          const prompt = document.getElementById('cw-prompt');
          if (!prompt) return {x: 0, y: -100};
          const promptRect = prompt.getBoundingClientRect();
          let x = promptRect.left - containerRect.left;
          let y = promptRect.top - containerRect.top - 60;
          const viewportY = containerRect.top + y;
          if (viewportY < 0) {
            y = promptRect.bottom - containerRect.top + 10;
          }
          return {x, y};
        }
      },
      { 
        text: 'And click "Go" to submit.', 
        duration: 2, 
        computePosition: () => {
          const container = document.getElementById('categories-widget');
          if (!container) return {x: 280, y: -100};
          const containerRect = container.getBoundingClientRect();
          const goButton = document.getElementById('cw-submit-button');
          if (!goButton) return {x: 280, y: -100};
          const goRect = goButton.getBoundingClientRect();
          let x = goRect.left - containerRect.left;
          let y = goRect.top - containerRect.top - 60;
          const viewportY = containerRect.top + y;
          if (viewportY < 0) {
            y = goRect.bottom - containerRect.top + 10;
          }
          return {x, y};
        }
      }      
    ];

    // Bind methods
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
    this.log = this.log.bind(this);
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
  }

  // Logging utility (only for errors)
  log(message, data = {}) {
  }

  // Get authToken from localStorage
  getAuthToken() {
    return localStorage.getItem('authToken');
  }

  // Validate JWT token (client-side check)
  validateToken() {
    const token = this.getAuthToken();
    if (!token) {
      return false;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime > payload.exp) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // Render "Please Login" message
  renderNotAuthenticated() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="not-authenticated" style="max-width: 400px; margin: 0 auto; padding: 20px; text-align: center;">
        <p style="font-size: 1.2em; color: #333;">
          <i class="fas fa-user-lock" aria-hidden="true" style="margin-right: 5px;"></i> 
          Please Login to manage your discount categories.
        </p>
      </div>
    `;
    window.location.href = '/login.html';
  }

  async getCategories() {
    const token = this.getAuthToken();
    if (!token) {
      return {
        status: 'error',
        error_message: 'Authentication required',
        categories: {},
        exclude: [],
        dialog: ''
      };
    }
    try {
      const response = await fetch(`${this.apiEndpoint}/ui/category`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user_id');
          localStorage.removeItem('contact_name');
          window.location.href = '/login.html';
        }
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      console.log('GET /ui/category result:', data);
      return data;
    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to fetch categories: ${error.message}`,
        categories: {},
        exclude: [],
        dialog: ''
      };
    }
  }

  async postCategories(prompt = '', exclude = []) {
    const token = this.getAuthToken();
    if (!token) {
      return {
        status: 'error',
        error_message: 'Authentication required',
        categories: {},
        exclude: [],
        dialog: ''
      };
    }
    try {
      const response = await fetch(`${this.apiEndpoint}/ui/category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt, exclude })
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user_id');
          localStorage.removeItem('contact_name');
          window.location.href = '/login.html';
        }
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      console.log('POST /ui/category result:', data);
      return data;
    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to fetch categories: ${error.message}`,
        categories: {},
        exclude: [],
        dialog: ''
      };
    }
  }

  async pollCategories() {
    while (true) {
      const data = await this.getCategories();
      console.log('Polling /ui/category result:', data);

      // === FIX: Use clubscan.status instead of old isProcessing ===
      const status = data.clubscan_status || data.status || 'complete';
      if (status !== 'processing' && status !== 'queued' && status !== 'building_catalog') {
        this.renderLowerArea(data);
        this.updateErrorMessage(data.error_message || '');
        this.hideLoadingOverlay();
        await this.handleDialog(data.dialog || '');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Wait for TTS voices to be initialized with logging
  waitForVoices() {
    return new Promise((resolve) => {
      const checkVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          resolve();
        } else {
          window.speechSynthesis.onvoiceschanged = () => {
            const updatedVoices = window.speechSynthesis.getVoices();
            resolve();
          };
        }
      };
      checkVoices();
    });
  }

  // Detect iOS devices
  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  // Get bounding client rect with fallback
  getBoundingClientRect(element) {
    try {
      return element.getBoundingClientRect();
    } catch (error) {
      return { top: 0, height: 0 };
    }
  }

  // Render initial UI with loading overlay, reset container styles, and 30px bottom margin
  renderInitialUI() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    container.style.margin = '0 0 30px 0'; // 30px bottom margin
    container.style.padding = '0';
    container.style.position = 'relative'; // For absolute positioning of hover texts

    container.innerHTML = `
      <style>
        @keyframes cw-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
      <div id="cw-loadingOverlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 1000;">
        <div style="position: relative; width: 200px; height: 200px;">
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
        </div>
      </div>
    `;
  }

  // Render the static upper area (dialog, prompt, buttons) with small screen adjustments
  renderUpperArea() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    const upperContainer = document.createElement('div');
    upperContainer.id = 'cw-upper-container';
    upperContainer.innerHTML = `
      <style>
        #cw-upper-container {
          background: #fff;
          padding: 0px;          
          box-sizing: border-box;
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          position: relative;
          z-index: 10;
          border-bottom: 1px solid transparent;
        }
        form { margin: 0; }
        #categories-widget .speech-bubble {
          background: #f1f1f1;          
          border-radius: 10px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          width: 100%;
          height: 6em;
          overflow-y: scroll;
          scrollbar-width: none;
          -ms-overflow-style: none;
          margin: 0;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: flex-start;
          font-family: monospace;
        }
        #categories-widget .speech-bubble::-webkit-scrollbar { display: none; }
        #categories-widget button[disabled] { opacity: 0.5; cursor: not-allowed; }
        #categories-widget textarea {
          box-sizing: border-box;
          white-space: pre-wrap;
          font-size: 1.2em;
          width: 100%;
          height: 3em;
          margin: 0;
          flex: 1;
        }
        #categories-widget .button-group {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 0;
          margin-top: 10px;
          width: 100%;
        }
        #categories-widget .prompt-area {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 0;
        }
        #categories-widget .icon-button {
          padding: 10px;
          font-size: 1em;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 5px;
          transition: background-color 0.2s;
          color: white;
          text-align: center;
          white-space: nowrap;
        }
        #categories-widget .icon-button i { font-size: 1.5em; margin-right: 5px; }
        #categories-widget .icon-button#cw-control-button { background-color: #d3d3d3; }
        #categories-widget .icon-button#cw-speaker-button { background-color: #d3d3d3; }
        #categories-widget .icon-button#cw-submit-button { background-color: #007bff; }
        #categories-widget .icon-button#cw-reset-categories { background-color: #dc3545; }
        #categories-widget .icon-button#cw-help-button { background-color: #6c757d; }
        #categories-widget .icon-button:hover:not([disabled]) { background-color: #0056b3; }
        #categories-widget .icon-button#cw-reset-categories:hover:not([disabled]) { background-color: #c82333; }
        #categories-widget .icon-button#cw-help-button:hover:not([disabled]) { background-color: #5a6268; }
        @media (max-width: 600px) {
          #cw-upper-container {
            padding: 0;
            width: 100vw;
            position: fixed;
            left: 0;
            top: 0;
            margin: 0;
            z-index: 10;
            background: #fff;
          }
          #categories-widget .speech-bubble {
            margin: 0;            
            border-radius: 0;
            width: 100%;
            height: 8em;
            box-sizing: border-box;
          }
          #categories-widget .robot-icon-container { display: none; }
          #categories-widget #cw-prompt {
            min-height: 3em;
            height: 3em;
            width: 100%;
            margin: 0;
            padding: 8px 8px 8px 0;
            box-sizing: border-box;
          }
          #categories-widget .dialog-area { width: 100%; margin: 0; margin-bottom: 0; }
          #categories-widget .prompt-area { margin: 0; width: 100%; flex-wrap: wrap; padding-left: 0; }
          #categories-widget .button-group { margin: 0; padding: 10px 0 10px 0; width: 100%; box-sizing: border-box; justify-content: flex-start; }
          #categories-widget .form-group { margin-bottom: 0; }
        }
      </style>
      <form id="cw-category-form" class="form" style="margin-top: 80px;">
        <div class="form-group" style="margin-bottom: 15px;">
          <div class="dialog-area" style="margin-bottom: 15px; width: 100%; display: flex; align-items: flex-start;">
            <div class="robot-icon-container" style="margin-right: 10px;">
              <i class="fas fa-robot" style="font-size: 2em; color: #007bff;"></i>
            </div>
            <div id="cw-dialog-container" class="speech-bubble">
              <span id="cw-dialog-text"></span>
            </div>
          </div>
        </div>
        <div class="prompt-area" style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
          <textarea id="cw-prompt" name="prompt" placeholder="Describe your community" 
            style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; box-sizing: border-box; font-size: 1.2em; background: #fafafa;"></textarea>
          <button type="submit" id="cw-submit-button" disabled class="icon-button">
            <i class="fas fa-robot"></i><span>Go</span>
          </button>
        </div>
        <div class="button-group">
          <button type="button" id="cw-help-button" class="icon-button">
            <i class="fas fa-question-circle" style="color: white;"></i><span>Help</span>
          </button>
          <button type="button" id="cw-control-button" class="icon-button">
            <i class="fas fa-microphone" style="color: green;"></i><span>(off)</span>
          </button>
          <button type="button" id="cw-speaker-button" class="icon-button">
            <i class="fas fa-volume-up" style="color: green;"></i><span>(on)</span>
          </button>
          <button type="button" id="cw-reset-categories" class="icon-button" disabled>
            <i class="fas fa-undo"></i><span>Reset</span>
          </button>
          <input type="hidden" id="cw-exclude" name="exclude" value="[]">
          <input type="hidden" id="cw-categories" name="categories" value="{}">
        </div>
      </form>
    `;
    container.appendChild(upperContainer);

    this.setupSpeechRecognition();
    this.updateControlButton();
    this.updateSpeakerButton();
  }

  // Render the dynamic lower area (categories and subcategories) with small screen adjustments
  renderLowerArea(data) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    let lowerContainer = container.querySelector('#cw-lower-container');
    if (!lowerContainer) {
      lowerContainer = document.createElement('div');
      lowerContainer.id = 'cw-lower-container';
      container.appendChild(lowerContainer);
    }

    const { categories = {}, error_message = '' } = data;

    lowerContainer.innerHTML = `
      <style>
        #cw-lower-container {
          box-sizing: border-box;
          width: 100%;
          max-width: 800px;
          margin: 0 auto 40px auto; /* Added 40px bottom margin */
          padding: 0;
          position: relative;
          z-index: 5;
        }
        #cw-categories-container {
          display: flex;
          justify-content: flex-start;
          width: 100%;
          position: relative;
          transition: transform 0.5s ease-in-out;
          min-height: 0;
        }
        @keyframes cw-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        #categories-widget .category-label:hover, #categories-widget .subcategory-label:hover { color: #007bff; }
        #categories-widget .label-container {
          flex: 1;
          display: flex;
          align-items: center;
          padding-right: 30px;
        }
        #categories-widget .category-label {
          color: black;
          text-decoration: none;
          padding-left: 5px;
          padding-right: 5px;
          white-space: nowrap;
          text-align: left;
          font-size: 1.2em;
        }
        #categories-widget .subcategory-label {
          color: black;
          padding-left: 2.5px; /* Reduced from 5px to 2.5px (50% reduction) */
          padding-right: 5px;
          white-space: nowrap;
          text-align: left;
          flex-grow: 1;
          font-size: 1.2em;
        }
        #categories-widget .category-icon { font-size: 2em; }
        #categories-widget .subcategory-item { display: flex; align-items: center; padding: 5px 0; width: 100%; }
        #categories-widget .icon-wrapper { width: 30px; text-align: center; cursor: pointer; margin-right: 8px; flex-shrink: 0; }
        #categories-widget .icon-placeholder { width: 30px; }
        #categories-widget .category-group {
          display: flex;
          align-items: center;
          padding: 5px 0;
          width: 100%;
          position: relative;
          min-height: 40px;
        }
        #categories-widget .category-group:nth-child(even) { background-color: #e6e6e6; }
        #categories-widget .category-group:nth-child(odd) { background-color: white; }
        #categories-widget .subcategory-item:nth-child(even) { background-color: #e6e6e6; }
        #categories-widget .subcategory-item:nth-child(odd) { background-color: white; }
        #categories-widget .category-checkbox {
          transform: scale(1.5);
          position: absolute;
          right: 5px;
          top: 50%;
          transform: translateY(-50%) scale(1.5);
          z-index: 2;
        }
        #categories-widget .subcategory-checkbox { transform: scale(1.5); margin-right: 10px; }
        #categories-widget .back-button {
          background: #007bff;
          color: white;
          border: none;
          border-radius: 50%;
          width: 45px;
          height: 45px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5em;
          cursor: pointer;
          transition: background-color 0.2s;
          margin-right: 10px;
        }
        #categories-widget .subcategory-header { display: flex; align-items: center; margin-bottom: 15px; width: 100%; }
        #categories-widget .left-column, #categories-widget .right-column {
          width: 100%;
          position: absolute;
          top: 0;
          transition: transform 0.5s ease-in-out, visibility 0.5s;
          visibility: visible;
        }
        #categories-widget .left-column { transform: translateX(0); }
        #categories-widget .right-column { transform: translateX(101%); visibility: hidden; }
        #categories-widget .left-column.hidden { transform: translateX(-101%); visibility: hidden; }
        #categories-widget .right-column.visible { transform: translateX(0); visibility: visible; }
        #cw-loadingOverlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.8);
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        #categories-widget .cw-hover-text {
          position: absolute;
          background: rgba(255, 255, 224, 0.9); /* Light yellow background */
          padding: 10px;
          border: 1px solid #000;
          border-radius: 5px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          z-index: 1001;
          max-width: 200px;
          font-size: 1em;
          color: #000;
        }
        @media (max-width: 600px) {
          #cw-lower-container { 
            width: 100vw; 
            margin: 0 0 40px 0; /* Maintain 40px bottom margin for small screens */
            padding: 0; 
            position: relative; 
            left: 0; 
          }
          #categories-widget .subcategory-header { margin-bottom: 10px; padding: 0; }
          #categories-widget .category-group, #categories-widget .subcategory-item { padding: 5px 0; }
          #categories-widget .label-container { padding-right: 30px; padding-left: 0; }
          #categories-widget .category-checkbox { right: 5px; }
          #categories-widget .category-label { padding-left: 0; }
          #categories-widget .subcategory-label { padding-left: 0; }
          #categories-widget .icon-wrapper { margin-left: 0; }
        }
      </style>
      <div id="cw-categories-container">
        <div class="left-column"></div>
        <div class="right-column"></div>
      </div>
      <div id="cw-category-error" style="display: ${error_message ? 'block' : 'none'}; color: red; margin-top: 10px;">
        ${error_message}
      </div>
      <div id="cw-loadingOverlay">
        <div style="position: relative; width: 200px; height: 200px;">
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
          <div style="position: absolute; border-radius: 50%; border: 7px solid transparent; animation: cw-spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
        </div>
      </div>
    `;

    // Set margin-top for lower container based on upper height for small screens
    const upperContainer = document.getElementById('cw-upper-container');
    if (upperContainer && window.innerWidth <= 600) {
      const upperRect = this.getBoundingClientRect(upperContainer);
      lowerContainer.style.marginTop = `${upperRect.height}px`;
    } else {
      lowerContainer.style.marginTop = '0';
    }

    const categoriesContainer = lowerContainer.querySelector('#cw-categories-container');
    const resetButton = container.querySelector('#cw-reset-categories');
    if (resetButton) {
      resetButton.disabled = Object.keys(categories).length === 0;
    }

    if (categoriesContainer && Object.keys(categories).length) {
      const leftColumn = categoriesContainer.querySelector('.left-column');
      const rightColumn = categoriesContainer.querySelector('.right-column');

      leftColumn.innerHTML = '';
      rightColumn.innerHTML = '';

      const backButton = document.createElement('button');
      backButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
      backButton.className = 'back-button';

      const updateExclude = () => {
        const excludeInput = container.querySelector('#cw-exclude');
        if (excludeInput) {
          excludeInput.value = JSON.stringify(this.sessionDeselectedItems);
        }
        this.updateSubmitButtonState();
      };

      const renderRightColumn = (category) => {
        if (!category || !categories[category]) {
          leftColumn.className = 'left-column';
          rightColumn.className = 'right-column';
          const leftHeight = leftColumn.scrollHeight;
          categoriesContainer.style.height = `${leftHeight}px`;
          return;
        }
        rightColumn.innerHTML = `
          <div class="subcategory-header">
            ${backButton.outerHTML}
            <div style="display: flex; align-items: center;">
              <h3 style="margin: 0;">${category}</h3>
              <i class="${this.getIconClass(categories[category].icon)}" style="font-size: 2em; color: #007bff; margin-left: 10px;"></i>
            </div>
          </div>
        `;
        categories[category].subcategories.forEach((subcategory) => {
          const subItem = document.createElement('div');
          subItem.className = 'subcategory-item';

          const labelContainer = document.createElement('div');
          labelContainer.className = 'label-container';

          const iconPlaceholder = document.createElement('span');
          iconPlaceholder.className = 'icon-placeholder';

          const subLabel = document.createElement('span');
          subLabel.textContent = subcategory;
          subLabel.className = 'subcategory-label';
          subLabel.style.cursor = 'pointer';

          labelContainer.appendChild(iconPlaceholder);
          labelContainer.appendChild(subLabel);

          const subCheckbox = document.createElement('input');
          subCheckbox.type = 'checkbox';
          subCheckbox.id = `cw-subcategory-${category}-${subcategory}`;
          subCheckbox.value = subcategory;
          subCheckbox.className = 'subcategory-checkbox';
          subCheckbox.checked = !this.sessionDeselectedItems.includes(subcategory);

          subLabel.addEventListener('click', () => {
            subCheckbox.checked = !subCheckbox.checked;
            subCheckbox.dispatchEvent(new Event('change'));
          });

          subCheckbox.addEventListener('change', () => {
            if (!subCheckbox.checked) {
              if (!this.sessionDeselectedItems.includes(subcategory)) {
                this.sessionDeselectedItems.push(subcategory);
              }
            } else {
              this.sessionDeselectedItems = this.sessionDeselectedItems.filter(item => item !== subcategory);
            }
            updateExclude();
          });

          subItem.appendChild(subCheckbox);
          subItem.appendChild(labelContainer);
          rightColumn.appendChild(subItem);
        });
        leftColumn.className = 'left-column hidden';
        rightColumn.className = 'right-column visible';
        const rightHeight = rightColumn.scrollHeight;
        categoriesContainer.style.height = `${rightHeight}px`;
        const newBackButton = rightColumn.querySelector('.back-button');
        if (newBackButton) {
          newBackButton.addEventListener('click', (e) => {
            e.preventDefault();
            leftColumn.className = 'left-column';
            rightColumn.className = 'right-column';
            const leftHeight = leftColumn.scrollHeight;
            categoriesContainer.style.height = `${leftHeight}px`;
          });
        }
      };

      Object.entries(categories).forEach(([category, categoryData]) => {
        if (!categoryData.icon || !categoryData.subcategories) return;
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category-group';

        const labelContainer = document.createElement('div');
        labelContainer.className = 'label-container';

        const iconElement = document.createElement('i');
        const iconClass = this.getIconClass(categoryData.icon);
        iconElement.className = `${iconClass} category-icon`;
        iconElement.style.color = '#007bff';

        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'icon-wrapper';
        iconWrapper.appendChild(iconElement);

        iconWrapper.addEventListener('click', (e) => {
          e.preventDefault();
          renderRightColumn(category);
        });

        const categoryLabel = document.createElement('a');
        categoryLabel.href = '#';
        categoryLabel.textContent = category;
        categoryLabel.className = 'category-label';
        categoryLabel.addEventListener('click', (e) => {
          e.preventDefault();
          renderRightColumn(category);
        });

        labelContainer.appendChild(iconWrapper);
        labelContainer.appendChild(categoryLabel);

        const categoryCheckbox = document.createElement('input');
        categoryCheckbox.type = 'checkbox';
        categoryCheckbox.id = `cw-category-${category}`;
        categoryCheckbox.value = category;
        categoryCheckbox.className = 'category-checkbox';
        categoryCheckbox.checked = !this.sessionDeselectedItems.includes(category);

        categoryCheckbox.addEventListener('change', () => {
          if (!categoryCheckbox.checked) {
            if (!this.sessionDeselectedItems.includes(category)) {
              this.sessionDeselectedItems.push(category);
            }
            renderRightColumn('');
          } else {
            this.sessionDeselectedItems = this.sessionDeselectedItems.filter(item => item !== category);
            renderRightColumn(category);
          }
          updateExclude();
        });

        categoryDiv.appendChild(labelContainer);
        categoryDiv.appendChild(categoryCheckbox);
        leftColumn.appendChild(categoryDiv);
      });

      const leftHeight = leftColumn.scrollHeight;
      categoriesContainer.style.height = `${leftHeight}px`;

      const excludeInput = container.querySelector('#cw-exclude');
      if (excludeInput) excludeInput.value = JSON.stringify(this.sessionDeselectedItems);
      const categoriesInput = container.querySelector('#cw-categories');
      if (categoriesInput) categoriesInput.value = JSON.stringify(categories);
    }

    this.updateErrorMessage(error_message);
  }

  // Update dialog text without re-rendering upper area
  async updateDialogText(text, speak = false) {
    const dialogSpan = document.querySelector('#cw-dialog-text');
    if (!dialogSpan) {
      return;
    }
    if (!this.isPageLoaded) {
      return;
    }

    this.dialogText = text;

    if (speak) {
      await this.handleDialog(text);
    } else {
      this.typeText(dialogSpan, text, () => {});
    }
  }

  // Handle dialog writing and speaking
  async handleDialog(dialog) {
    const dialogSpan = document.querySelector('#cw-dialog-text');
    if (!dialogSpan) {
      return;
    }
    if (!this.isPageLoaded) {
      return;
    }

    this.dialogText = dialog;

    // Start TTS and wait for completion (including permission dialog)
    await this.startDialogSpeech(dialog);
    // Start text animation only after TTS (and permission dialog) is resolved
    this.typeText(dialogSpan, dialog, () => {});
  }

  // Request permission for TTS and wait for user response (screen modal)
  requestTTSPermission() {
    return new Promise((resolve) => {
      this.isPermissionPrompted = true;
      const permissionDialog = document.createElement('div');
      permissionDialog.id = 'tts-permission-dialog';
      permissionDialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
      `;
      permissionDialog.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 5px; text-align: center; max-width: 500px; width: 90%;">
          <p style="margin-bottom: 20px; font-size: 1.2em;">Would you like to me to read my responses aloud?</p>
          <button id="allow-tts" style="padding: 12px 24px; margin-right: 15px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 1.1em;">
            <i class="fas fa-volume-up" style="margin-right: 5px;"></i>Read it
          </button>
          <button id="deny-tts" style="padding: 12px 24px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 1.1em;">
            <i class="fas fa-volume-mute" style="margin-right: 5px;"></i>Quiet
          </button>
        </div>
      `;

      document.body.appendChild(permissionDialog);

      const allowButton = permissionDialog.querySelector('#allow-tts');
      const denyButton = permissionDialog.querySelector('#deny-tts');

      allowButton.addEventListener('click', () => {
        document.body.removeChild(permissionDialog);
        this.isPermissionPrompted = false;
        resolve(true);
      });

      denyButton.addEventListener('click', () => {
        document.body.removeChild(permissionDialog);
        this.isPermissionPrompted = false;
        resolve(false);
      });
    });
  }

  async requestTTSPermissionIfNeeded() {
    if (this.ttsPermission === 'granted') {
      return true;
    }

    const permission = await this.requestTTSPermission();
    if (permission) {
      this.ttsPermission = 'granted';
      localStorage.setItem('ttsPermission', 'granted');
      return true;
    } else {
      this.ttsPermission = 'denied';
      localStorage.setItem('ttsPermission', 'denied');
      return false;
    }
  }

  // Start dialog speech with error handling
  async startDialogSpeech(text) {
    if (!this.isPageLoaded || !this.ttsEnabled) {
      return;
    }

    if (this.currentUtterance) {
      window.speechSynthesis.cancel();
    }

    // Ensure voices are loaded
    await this.waitForVoices();

    this.currentUtterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    const danielVoice = voices.find(voice => voice.name.includes('Daniel') && voice.lang === 'en-GB');
    this.currentUtterance.voice = danielVoice || voices.find(voice => voice.lang === 'en-GB') || voices[0];
    this.currentUtterance.lang = this.currentUtterance?.voice?.lang || 'en-GB';

    this.currentUtterance.pitch = 1;
    this.currentUtterance.rate = 1;
    this.currentUtterance.volume = 1;

    this.currentUtterance.onstart = () => {
      this.isSpeaking = true;
    };
    this.currentUtterance.onend = () => {
      this.isSpeaking = false;
    };
    this.currentUtterance.onerror = (event) => {
      this.isSpeaking = false;
      if (event.error === 'not-allowed') {
        this.ttsPermission = 'denied';
        localStorage.setItem('ttsPermission', 'denied');
        this.ttsEnabled = false;
        localStorage.setItem('ttsEnabled', 'false');
        this.updateSpeakerButton();
      }
    };

    const allowed = await this.requestTTSPermissionIfNeeded();
    if (!allowed) {
      return;
    }

    window.speechSynthesis.speak(this.currentUtterance);
  }

  // Stop speech synthesis
  stopDialogSpeech() {
    if (this.currentUtterance) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }

  // Simplified typing animation for dialog text
  typeText(element, text, callback) {
    element.textContent = '';
    const words = text.split(' ');
    let index = 0;

    const typeNextWord = () => {
      if (index >= words.length) {
        clearInterval(interval);
        if (callback) callback();
        return;
      }
      element.textContent += (index > 0 ? ' ' : '') + words[index];
      index++;
      const container = element.parentNode;
      container.scrollTop = container.scrollHeight;
    };

    const interval = setInterval(typeNextWord, 100);
  }

  // Update control button state and icon based on speech recognition state and permission
  updateControlButton() {
    const controlButton = document.querySelector('#cw-control-button');
    if (!controlButton) return;

    let iconClass = 'fa-microphone';
    let color = 'green';
    let text = '(off)';
    let bgColor = '#d3d3d3';

    if (this.isListening) {
      color = 'red';
      text = '(on)';
      bgColor = 'black';
    }

    if (this.sttPermission === 'denied') {
      iconClass = 'fa-microphone-slash';
      color = 'red';
      text = '(denied)';
      bgColor = '#d3d3d3';
    }

    controlButton.innerHTML = `<i class="fas ${iconClass}" style="color: ${color};"></i><span>${text}</span>`;
    controlButton.style.backgroundColor = bgColor;
    controlButton.onclick = () => this.toggleSpeechRecognition();
  }

  // Update speaker button state and icon
  updateSpeakerButton() {
    const speakerButton = document.querySelector('#cw-speaker-button');
    if (!speakerButton) return;

    let iconClass = 'fa-volume-up';
    let color = 'green';
    let text = '(on)';
    let bgColor = '#d3d3d3';

    if (!this.ttsEnabled) {
      iconClass = 'fa-volume-mute';
      color = 'red';
      text = '(off)';
      bgColor = 'black';
    }

    if (this.ttsPermission === 'denied') {
      iconClass = 'fa-volume-mute';
      color = 'red';
      text = '(muted)';
      bgColor = '#d3d3d3';
    }

    speakerButton.innerHTML = `<i class="fas ${iconClass}" style="color: ${color};"></i><span>${text}</span>`;
    speakerButton.style.backgroundColor = bgColor;
    speakerButton.onclick = () => this.toggleTTS();
  }

  // Toggle TTS enabled state
  async toggleTTS() {
    if (this.ttsEnabled) {
      // Revoke/disable
      this.ttsEnabled = false;
      localStorage.setItem('ttsEnabled', 'false');
      if (this.isSpeaking) this.stopDialogSpeech();
    } else {
      // Enable, request permission if needed
      const allowed = await this.requestTTSPermissionIfNeeded();
      if (allowed) {
        this.ttsEnabled = true;
        localStorage.setItem('ttsEnabled', 'true');
        if (this.dialogText) {
          await this.startDialogSpeech(this.dialogText);
        }
      }
    }
    this.updateSpeakerButton();
  }

  // Get consistent icon class for Font Awesome 6.4.2
  getIconClass(iconData) {
    if (!iconData) return 'fa-solid fa-circle-question';
    if (iconData.includes(' ')) return iconData;
    if (iconData.startsWith('fa-')) return `fa-solid ${iconData}`;
    return `fa-solid fa-${iconData}`;
  }

  // Setup speech recognition for prompt input (append to existing text)
  setupSpeechRecognition() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;

    const promptTextarea = container.querySelector('#cw-prompt');
    if (!promptTextarea) return;

    this.recognition.onstart = () => {
      this.sttPermission = 'granted';
      localStorage.setItem('sttPermission', 'granted');
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.speechBuffer += finalTranscript;
      }

      promptTextarea.value = this.speechBuffer + interimTranscript;
      promptTextarea.scrollTop = promptTextarea.scrollHeight;
      this.updateSubmitButtonState();
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        if (event.error === 'not-allowed') {
          this.sttPermission = 'denied';
          localStorage.setItem('sttPermission', 'denied');
          this.sttEnabled = false;
          localStorage.setItem('sttEnabled', 'false');
          this.isListening = false;
          this.updateControlButton();
        }
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (error) {
          this.isListening = false;
          this.updateControlButton();
        }
      } else {
        this.isListening = false;
        this.updateControlButton();
      }
    };
  }

  // Toggle speech recognition (cancel TTS if starting STT)
  toggleSpeechRecognition() {
    if (!this.recognition) return;

    const promptTextarea = document.querySelector('#cw-prompt');

    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      this.sttEnabled = false;
      localStorage.setItem('sttEnabled', 'false');
      if (promptTextarea) {
        promptTextarea.value = this.speechBuffer.trim();
        promptTextarea.scrollTop = promptTextarea.scrollHeight;
      }
    } else {
      if (this.isSpeaking) this.stopDialogSpeech();
      if (promptTextarea) {
        this.speechBuffer = promptTextarea.value.trim();
        if (this.speechBuffer && !this.speechBuffer.endsWith(' ')) {
          this.speechBuffer += ' ';
        }
      }
      try {
        this.recognition.start();
        this.isListening = true;
        this.sttEnabled = true;
        localStorage.setItem('sttEnabled', 'true');
      } catch (error) {
      }
    }
    this.updateControlButton();
  }

  // Wait for speech recognition to finalize
  waitForSpeechFinalization() {
    return new Promise((resolve) => {
      if (!this.isListening || !this.recognition) {
        resolve();
        return;
      }

      // Stop recognition and wait for onend
      this.recognition.stop();
      this.isListening = false;

      const onEndHandler = () => {
        this.recognition.removeEventListener('end', onEndHandler);
        const promptTextarea = document.querySelector('#cw-prompt');
        if (promptTextarea) {
          promptTextarea.value = this.speechBuffer.trim();
          promptTextarea.scrollTop = promptTextarea.scrollHeight;
        }
        this.updateControlButton();
        resolve();
      };

      this.recognition.addEventListener('end', onEndHandler);

      // Fallback timeout in case onend doesn't fire
      setTimeout(() => {
        if (this.isListening) {
          this.recognition.removeEventListener('end', onEndHandler);
          this.isListening = false;
          this.updateControlButton();
          resolve();
        }
      }, 2000); // 2 seconds max wait
    });
  }

  // Show loading overlay
  showLoadingOverlay() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const overlay = container.querySelector('#cw-loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
    this.isPageLoaded = false;

    const promptInput = container.querySelector('#cw-prompt');
    if (promptInput) {
      promptInput.value = '';
      this.speechBuffer = '';
    }
  }

  // Hide loading overlay
  hideLoadingOverlay() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      return;
    }

    const overlay = container.querySelector('#cw-loadingOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
    this.isPageLoaded = true;
  }

  // Update submit button state
  updateSubmitButtonState() {
    const form = document.getElementById('cw-category-form');
    if (!form) return;

    const promptInput = form.querySelector('#cw-prompt');
    const excludeInput = form.querySelector('#cw-exclude');
    const submitButton = form.querySelector('#cw-submit-button');
    if (!promptInput || !excludeInput || !submitButton) return;

    const prompt = promptInput.value.trim();
    let exclude;
    try {
      exclude = JSON.parse(excludeInput.value || '[]');
    } catch (error) {
      exclude = [];
    }

    submitButton.disabled = !(prompt.length > 0 || exclude.length > 0);
  }

  // Update error message
  updateErrorMessage(error_message) {
    const errorDiv = document.querySelector('#cw-category-error');
    if (errorDiv) {
      errorDiv.style.display = error_message ? 'block' : 'none';
      errorDiv.textContent = error_message || '';
    }
  }

  // Handle reset button click with confirmation dialog
  async handleResetClick() {
    if (!this.validateToken()) {
      this.renderNotAuthenticated();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'cw-dialog-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 999;';
    document.body.appendChild(overlay);

    const dialog = document.createElement('div');
    dialog.id = 'cw-reset-dialog';
    dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 2px solid red; border-radius: 5px; z-index: 1000; width: 80%; max-width: 400px;';
    dialog.innerHTML = `
      <p>Warning: Resetting will delete all existing categories. This action cannot be undone.</p>
      <p>Type "confirm" to proceed:</p>
      <input type="text" id="cw-confirm-input" style="width: 100%; padding: 5px; margin-bottom: 10px;">
      <button id="cw-confirm-reset" disabled style="padding: 10px 15px; font-size: 1.2em; background: #dc3545; color: white; border: none; border-radius: 3px;">
        <i class="fas fa-check" style="margin-right: 5px;"></i>Confirm
      </button>
      <button id="cw-cancel-reset" style="padding: 10px 15px; font-size: 1.2em; background: #6c757d; color: white; border: none; border-radius: 3px; margin-left: 10px;">
        <i class="fas fa-times" style="margin-right: 5px;"></i>Cancel
      </button>
    `;
    document.body.appendChild(dialog);

    const confirmInput = dialog.querySelector('#cw-confirm-input');
    const confirmButton = dialog.querySelector('#cw-confirm-reset');
    const cancelButton = dialog.querySelector('#cw-cancel-reset');

    confirmInput.addEventListener('input', () => {
      confirmButton.disabled = confirmInput.value.toLowerCase() !== 'confirm';
    });

    cancelButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
      document.body.removeChild(dialog);
    });

    confirmButton.addEventListener('click', async () => {
      if (!this.validateToken()) {
        this.renderNotAuthenticated();
        document.body.removeChild(overlay);
        document.body.removeChild(dialog);
        return;
      }
      this.showLoadingOverlay();
      try {
        const token = this.getAuthToken();
        const response = await fetch(`${this.apiEndpoint}/ui/category/reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({})
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user_id');
            localStorage.removeItem('contact_name');
            window.location.href = '/login.html';
          }
          throw new Error(`HTTP error: ${response.status}`);
        }
        const updatedData = await this.getCategories();
        this.sessionDeselectedItems = []; // Reset session deselections on category reset
        this.renderLowerArea(updatedData);
        this.hideLoadingOverlay();
        await this.handleDialog(updatedData.dialog || '');
      } catch (error) {
        this.hideLoadingOverlay();
      }
      document.body.removeChild(overlay);
      document.body.removeChild(dialog);
    });
  }

  // Start the help tour by showing sequential hover texts
  startHelpTour() {
    if (this.helpTourRunning) {
      this.stopHelpTour();
      return;
    }

    this.helpTourRunning = true;
    this.helpTimeouts = []; // To store timeouts for stopping

    const container = document.getElementById(this.containerId);
    let index = 0;

    const showNext = () => {
      if (index >= this.helpHovers.length) {
        this.helpTourRunning = false;
        return;
      }

      const hover = this.helpHovers[index];
      const pos = hover.computePosition();
      const hoverDiv = document.createElement('div');
      hoverDiv.className = 'cw-hover-text';
      hoverDiv.style.left = `${pos.x}px`;
      hoverDiv.style.top = `${pos.y}px`;
      hoverDiv.textContent = hover.text;

      container.appendChild(hoverDiv);

      const timeout = setTimeout(() => {
        if (container.contains(hoverDiv)) {
          container.removeChild(hoverDiv);
        }
        index++;
        showNext();
      }, hover.duration * 1000);

      this.helpTimeouts.push(timeout);
    };

    showNext();
  }

  // Stop the help tour and clear any active hovers/timeouts
  stopHelpTour() {
    this.helpTourRunning = false;
    const container = document.getElementById(this.containerId);
    const hovers = container.querySelectorAll('.cw-hover-text');
    hovers.forEach(hover => container.removeChild(hover));
    this.helpTimeouts.forEach(timeout => clearTimeout(timeout));
    this.helpTimeouts = [];
  }

  // Setup form and reset events
  setupEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const form = container.querySelector('#cw-category-form');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!this.validateToken()) {
        this.renderNotAuthenticated();
        return;
      }

      const submitButton = form.querySelector('#cw-submit-button');
      if (submitButton) submitButton.disabled = true;

      // If speech recognition is active, stop it and wait for finalization
      if (this.isListening) {
        await this.waitForSpeechFinalization();
      }

      const formData = new FormData(form);
      let userPrompt = formData.get('prompt')?.trim() || '';
      let exclude;
      try {
        exclude = JSON.parse(formData.get('exclude') || '[]');
      } catch (error) {
        exclude = [];
      }

      let fullPrompt = userPrompt;
      if (exclude.length > 0) {
        const removeText = exclude.join(' ');
        fullPrompt = fullPrompt ? `${fullPrompt} remove ${removeText}` : `remove ${removeText}`;
      }

      this.showLoadingOverlay();
      await this.postCategories(fullPrompt, exclude);
      await this.pollCategories();
      if (submitButton) submitButton.disabled = false;
    });

    const promptInput = form.querySelector('#cw-prompt');
    if (promptInput) {
      promptInput.addEventListener('input', () => this.updateSubmitButtonState());
      promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          form.dispatchEvent(new Event('submit'));
        }
      });
    }

    container.addEventListener('click', (event) => {
      const target = event.target.closest('#cw-reset-categories');
      if (target) {
        event.preventDefault();
        this.handleResetClick();
      }
    });

    const helpButton = container.querySelector('#cw-help-button');
    if (helpButton) {
      helpButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.startHelpTour();
      });
    }
  }

  // Initialize categories UI
  async initializeCategories() {
    if (!this.validateToken()) {
      this.renderNotAuthenticated();
      return;
    }

    try {
      await loadCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css');
    } catch (error) {
    }

    try {
      this.renderInitialUI();
      this.renderUpperArea();
      const [data] = await Promise.all([this.getCategories(), this.waitForVoices()]);
      this.renderLowerArea(data);
      this.setupEvents();
      this.hideLoadingOverlay();
      await this.handleDialog(data.dialog || 'Enter a prompt to customize your categories.');
      if (this.sttEnabled && this.sttPermission !== 'denied') {
        this.toggleSpeechRecognition();
      }
    } catch (error) {
      this.hideLoadingOverlay();
      // Fallback UI to ensure widget visibility
      const container = document.getElementById(this.containerId);
      if (container && !container.querySelector('#cw-upper-container')) {
        this.renderUpperArea();
      }
    }
  }

  // Initialize the widget
  async init() {
    try {
      if (!this.validateToken()) {
        this.renderNotAuthenticated();
        return;
      }
      await this.initializeCategories();
      const promptInput = document.querySelector('#cw-prompt');
      if (promptInput) {
        promptInput.value = '';
        this.speechBuffer = '';
      }
      window.addEventListener('resize', () => {
        const data = {
          categories: JSON.parse(document.querySelector('#cw-categories')?.value || '{}'),
          exclude: this.sessionDeselectedItems, // Use session deselections for resize
          error_message: document.querySelector('#cw-category-error')?.textContent || ''
        };
        this.renderLowerArea(data);
      });

      // Adjust lower container bottom margin for footer
      const lowerContainer = document.getElementById('cw-lower-container');
      if (lowerContainer) {
        lowerContainer.style.marginBottom = '60px'; // Assume footer height ~50px + padding
      }
    } catch (error) {
    }
  }
}

// Auto-initialize on script load
document.addEventListener('DOMContentLoaded', () => {
  try {
    const scriptTag = document.querySelector('script[data-categories-widget]');
    if (scriptTag) {
      const widget = new CategoriesWidget();
      widget.init();
    } else {
    }
  } catch (error) {
  }
});