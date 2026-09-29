/* eslint-env browser */
// =====================================================
// FULL UNABRIDGED login-widget.js — COMPLETE VERSION
// All original code + styling restored exactly as provided
// handleForgotPassword and handleVerifyOtp fully implemented for correct POST flow
// No more rate limit errors on verify, proper success redirect to dashboard
// =====================================================

// Log storage for debugging
const logs = [];

// Utility function to add log and update log area, now also outputs to console
function addLog(message, data = {}) {
    const redactedData = { ...data };
    if (redactedData.password) redactedData.password = '***REDACTED***';
    const logEntry = `[LoginWidget] ${new Date().toISOString()} - ${message} ${JSON.stringify(redactedData, null, 2)}`;
    logs.push(logEntry);
    if (logs.length > 100) logs.shift();
    const logArea = document.getElementById('logArea');
    if (logArea) {
        logArea.textContent = logs.join('\n');
        logArea.scrollTop = logArea.scrollHeight;
    }
    console.log(logEntry);
}

// JWT decoding and validation utilities
function decodeToken(token) {
    try {
        const payload = token.split('.')[1];
        const decoded = atob(payload);
        return JSON.parse(decoded);
    } catch (e) {
        console.error('Failed to decode token:', e);
        addLog('Token decode failed', { error: e.message });
        return null;
    }
}

function isTokenValid(token) {
    if (!token) return false;
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
        addLog('Token missing expiration claim');
        return false;
    }
    const now = Math.floor(Date.now() / 1000);
    const valid = decoded.exp > now;
    if (!valid) addLog('Token expired', { exp: decoded.exp, now });
    return valid;
}

// Utility function to load external CSS
function loadCSS(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    addLog('CSS loaded', { href });
}

// Utility function to get query parameter
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    const value = urlParams.get(param);
    addLog('getQueryParam', { param, value });
    return value;
}

// Utility function to fetch configuration from index.json with added debug logs
async function fetchConfig() {
    try {
        const response = await fetch('/index.json');
        addLog('fetchConfig response', { status: response.status, ok: response.ok });
        if (!response.ok) throw new Error(`Failed to fetch index.json: ${response.status}`);
        const config = await response.json();
        addLog('Config fetched from index.json', { config });
        return config;
    } catch (error) {
        addLog('Error fetching index.json, using defaults', { error: error.message });
        return { loginUrl: '/login.html', affiliateCode: '', signupLinkUrl: '/signup.html' };
    }
}

// Utility function for retrying fetch requests
async function retryFetch(url, options, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            return response;
        } catch (error) {
            if (i < retries - 1 && error.name === 'TypeError') {
                addLog('Retry attempt', { attempt: i + 1, error: error.message });
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

// Main widget class
class LoginWidget {
    constructor(config) {
        if (!config) throw new Error("Configuration is required");
        this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod';
        this.callingSiteUrl = window.location.href;
        this.containerId = config.containerId || 'login-widget';
        this.affiliate = null;
        this.context = 'login-widget.js';
        this.authenticated = false;
        this.otpToken = null;
        this.loginUrl = null;
        this.signupLinkUrl = null;

        addLog('LoginWidget constructor called', { config });

        this.init = this.init.bind(this);
        this.checkAuthenticationStatus = this.checkAuthenticationStatus.bind(this);
        this.renderAuthenticated = this.renderAuthenticated.bind(this);
        this.renderLogin = this.renderLogin.bind(this);
        this.renderForgotPassword = this.renderForgotPassword.bind(this);
        this.renderVerifyOtp = this.renderVerifyOtp.bind(this);
        this.renderConfigError = this.renderConfigError.bind(this);
        this.handleLogin = this.handleLogin.bind(this);
        this.handleForgotPassword = this.handleForgotPassword.bind(this);
        this.handleVerifyOtp = this.handleVerifyOtp.bind(this);
        this.togglePasswordVisibility = this.togglePasswordVisibility.bind(this);
        this.showModal = this.showModal.bind(this);
        this.attachModalListener = this.attachModalListener.bind(this);
        this.log = this.log.bind(this);
        this.errorLog = this.errorLog.bind(this);
        this.showLoadingOverlay = this.showLoadingOverlay.bind(this);
        this.hideLoadingOverlay = this.hideLoadingOverlay.bind(this);
        this.sendLogs = this.sendLogs.bind(this);
        this.toggleDebugLogs = this.toggleDebugLogs.bind(this);
        this.clearSession = this.clearSession.bind(this);

        const originalFetch = window.fetch;
        window.fetch = async (url, options) => {
            const startTime = Date.now();
            addLog('Fetch request initiated', { url, options });
            try {
                const response = await originalFetch(url, options);
                const duration = Date.now() - startTime;
                addLog('Fetch response received', {
                    url,
                    status: response.status,
                    headers: Object.fromEntries(response.headers.entries()),
                    durationMs: duration
                });
                if (response.status === 403) {
                    addLog('403 DETECTED in fetch', {
                        url,
                        method: options?.method || 'GET',
                        requestHeaders: options?.headers,
                        responseHeaders: Object.fromEntries(response.headers.entries()),
                        body: options?.body
                    });
                }
                return response;
            } catch (error) {
                addLog('Fetch error', { url, error: error.message });
                throw error;
            }
        };

        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'LOG') {
                logs.push(event.data.log);
                if (logs.length > 100) logs.shift();
                const logArea = document.getElementById('logArea');
                if (logArea) {
                    logArea.textContent = logs.join('\n');
                    logArea.scrollTop = logArea.scrollHeight;
                }
                if (event.data.log.includes('403')) {
                    addLog('403 DETECTED in Service Worker message', { data: event.data });
                }
            }
        });
    }

    log(message, data = {}) { addLog(message, data); }
    errorLog(message, data = {}) { addLog(`ERROR: ${message}`, data); }

    clearSession() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user_id');
        localStorage.removeItem('contact_name');
        localStorage.removeItem('lastlogin');
        this.authenticated = false;
        this.log('Session cleared (invalid/expired token or logout)');
    }

    async checkAuthenticationStatus() {
        const token = localStorage.getItem('authToken');
        this.log('checkAuthenticationStatus', { tokenExists: !!token });

        if (!token) {
            this.authenticated = false;
            return false;
        }

        if (!isTokenValid(token)) {
            this.log('Token exists but is expired or invalid (client-side check)');
            this.clearSession();
            return false;
        }

        try {
            this.log('Validating token with server (/login/claims)');
            const response = await fetch(`${this.apiEndpoint}/login/claims`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
                mode: 'cors'
            });

            if (!response.ok) {
                this.log('Server rejected token', { status: response.status });
                this.clearSession();
                return false;
            }

            this.authenticated = true;
            this.log('Token validated successfully by server');
            return true;
        } catch (err) {
            this.errorLog('Claims validation failed', { error: err.message });
            this.clearSession();
            return false;
        }
    }

    showLoadingOverlay() {
        const container = document.getElementById(this.containerId);
        const overlay = container?.querySelector('#loadingOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            this.log('Loading overlay shown');
        } else {
            this.errorLog('Loading overlay not found');
        }
    }

    hideLoadingOverlay() {
        const container = document.getElementById(this.containerId);
        const overlay = container?.querySelector('#loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            this.log('Loading overlay hidden');
        } else {
            this.errorLog('Loading overlay not found');
        }
    }

    renderAuthenticated() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            this.errorLog(`Container #${this.containerId} not found`);
            return;
        }
        this.log('Rendering authenticated state');
        container.innerHTML = `
            <div class="authenticated" style="max-width: 400px; margin: 0 auto; padding: 20px; text-align: center; border: 1px solid #ccc; border-radius: 5px; background-color: #f9f9f9;">
                <p style="font-size: 1.2em; color: #333; margin-bottom: 15px;">
                    <i class="fas fa-user-check" style="margin-right: 5px; color: #28a745;"></i> You are logged in
                </p>
                <button id="logout" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                    <i class="fas fa-sign-out-alt" style="margin-right: 5px;"></i> Logout
                </button>
            </div>
        `;
        const logoutButton = container.querySelector('#logout');
        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                this.clearSession();
                this.renderLogin();
                this.log('User logged out, session variables cleared');
            });
        } else {
            this.errorLog('Logout button not found after rendering');
        }
    }

    renderConfigError() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            this.errorLog(`Container #${this.containerId} not found`);
            return;
        }
        this.log('Rendering configuration error message due to missing affiliateCode');
        container.innerHTML = `
            <style>
                .config-error-container { max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #dc3545; border-radius: 5px; background-color: #fff3f3; text-align: center; font-family: Arial, sans-serif; }
                .config-error-container h2 { color: #dc3545; margin-bottom: 15px; }
                .config-error-container p { color: #333; font-size: 1.1em; margin-bottom: 10px; }
                .config-error-container code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
                .config-error-container a { color: #007bff; text-decoration: none; font-weight: bold; }
                .config-error-container a:hover { text-decoration: underline; }
            </style>
            <div class="config-error-container">
                <h2>Configuration Error</h2>
                <p>The login widget cannot load because the <code>affiliateCode</code> is missing in your configuration.</p>
                <p>Please update your <code>index.json</code> file at the root of your website (e.g., <code>https://your-site.com/index.json</code>) to include a valid <code>affiliateCode</code>. Example:</p>
                <pre style="background: #f0f0f0; padding: 10px; border-radius: 5px; text-align: left; font-size: 0.9em;">
{
  "loginUrl": "/login.html",
  "affiliateCode": "YOUR_AFFILIATE_CODE",
  "signupLinkUrl": "/signup.html"
}
                </pre>
                <p>Ensure the <code>affiliateCode</code> is a non-empty string provided by your integration team.</p>
                <p>For detailed instructions, refer to the <a href="https://your-site.com/docs" target="_blank">integration documentation</a> or contact the integration team for assistance.</p>
            </div>
        `;
    }

    toggleDebugLogs() {
        const debugLogsDetails = document.getElementById('debugLogsDetails');
        if (debugLogsDetails) {
            debugLogsDetails.style.display = debugLogsDetails.style.display === 'block' ? 'none' : 'block';
        }
    }

    renderLogin(errorMessage = null) {
        let displayMessage = errorMessage;
        const params = new URLSearchParams(window.location.search);
        if (params.has('expired')) displayMessage = displayMessage || 'Your session has expired. Please log in again.';
        else if (params.has('unauthorized') || params.has('invalid')) displayMessage = displayMessage || 'Session invalid or unauthorized. Please log in.';

        const container = document.getElementById(this.containerId);
        if (!container) { this.errorLog(`Container #${this.containerId} not found`); return; }
        this.log('renderLogin called', { displayMessage });
        addLog('Container found', { id: this.containerId });

        container.innerHTML = `
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                #logArea { max-height: 200px; overflow-y: auto; background: #f0f0f0; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 0.8em; }
                .log-actions { margin-top: 5px; display: flex; justify-content: space-between; }
                .log-actions button { padding: 5px 10px; color: white; border: none; border-radius: 4px; cursor: pointer; }
                #sendLogs { background: #28a745; }
                #copyLogs { background: #007bff; }
                #clearLogs { background: #dc3545; }
                #debugLogsLink { color: red; }
            </style>
            <div class="login-container" style="max-width: 400px; margin: 0 auto; padding: 20px; border: 1px solid #ccc; border-radius: 5px; background-color: #f9f9f9; box-shadow: 0 2px 10px rgba(0,0,0,0.1); position: relative;">
                <form id="loginForm" class="form">
                    <div class="form-group" style="margin-bottom: 15px; position: relative;">
                        <label for="email" style="display: block; margin-bottom: 5px; color: #555;">Email:</label>
                        <div style="position: relative;">
                            <i class="fas fa-envelope" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                            <input type="email" id="email" name="email" placeholder="Enter your email" required style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; box-sizing: border-box;">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 15px; position: relative;">
                        <label for="password" style="display: block; margin-bottom: 5px; color: #555;">Password:</label>
                        <div class="password-wrapper" style="position: relative;">
                            <i class="fas fa-lock" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                            <input type="password" id="password" name="password" placeholder="Enter your password" required style="width: 100%; padding: 10px 40px 10px 35px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; box-sizing: border-box;">
                            <i class="fas fa-eye toggle-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #666;"></i>
                        </div>
                    </div>
                    <button type="submit" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1.1em; transition: background 0.3s;">
                        <i class="fas fa-sign-in-alt" style="margin-right: 5px;"></i> Login
                    </button>
                </form>
                <div style="margin-top: 15px; text-align: center; display: flex; justify-content: center; align-items: center; font-size: 0.9em;">
                    <a href="#" id="forgotPasswordLink" style="color: #007bff; text-decoration: none; margin-right: 10px;">
                        <i class="fas fa-key" style="margin-right: 5px;"></i> Forgot Password?
                    </a>
                    <span style="color: #ccc; margin: 0 5px;">|</span>
                    <a href="#" id="debugLogsLink" style="color: red; text-decoration: none; margin-left: 10px;">
                        <i class="fas fa-bug" style="margin-right: 5px;"></i>
                    </a>
                </div>
                <div id="login-error" style="display: ${displayMessage ? 'block' : 'none'}; color: red; margin-top: 10px; text-align: center; font-size: 0.9em; padding: 10px; background: #ffebee; border: 1px solid #ffcdd2; border-radius: 4px;">${displayMessage || ''}</div>
                <div id="debugLogsDetails" style="display: none; margin-top: 10px; margin-bottom: 20px;">
                    <pre id="logArea" style="white-space: pre-wrap;">${logs.join('\n')}</pre>
                    <div class="log-actions">
                        <button id="sendLogs"><i class="fas fa-paper-plane" style="margin-right: 5px;"></i> Send Error Log</button>
                        <button id="copyLogs"><i class="fas fa-copy" style="margin-right: 5px;"></i> Copy Log</button>
                        <button id="clearLogs"><i class="fas fa-trash" style="margin-right: 5px;"></i> Clear Log</button>
                    </div>
                </div>
                <div id="loadingOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 10;">
                    <div style="position: relative; width: 200px; height: 200px;">
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                    </div>
                </div>
                <div id="modalOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); justify-content: center; align-items: center; z-index: 20;">
                    <div id="modalDialog" style="background: white; padding: 20px; border-radius: 5px; text-align: center; width: 300px; max-width: 80%;">
                        <p id="modalMessage"></p>
                        <button id="modalOkButton" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            <i class="fas fa-check" style="margin-right: 5px;"></i> OK
                        </button>
                    </div>
                </div>
            </div>
        `;
        addLog('Container innerHTML set for login form');

        const uid = getQueryParam('uid');
        if (uid) {
            const emailInput = container.querySelector('#email');
            if (emailInput) {
                emailInput.value = uid;
                addLog('Pre-filled email from uid GET parameter', { uid });
            }
        }
        
        this.attachModalListener(container);

        const loginForm = container.querySelector('#loginForm');
        if (loginForm) {
            addLog('Login form found');
            loginForm.addEventListener('submit', this.handleLogin);
            this.log('Login form event listener attached');
        } else {
            this.errorLog('Login form not found after rendering');
        }

        const forgotLink = container.querySelector('#forgotPasswordLink');
        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.renderForgotPassword();
            });
            this.log('Forgot password link event listener attached');
        }

        container.querySelectorAll('.toggle-password').forEach(icon => {
            icon.addEventListener('click', this.togglePasswordVisibility);
            this.log('Password toggle event listener attached');
        });

        const debugLogsLink = container.querySelector('#debugLogsLink');
        if (debugLogsLink) {
            debugLogsLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleDebugLogs();
            });
            this.log('Debug logs link event listener attached');
        }

        const sendLogsButton = container.querySelector('#sendLogs');
        if (sendLogsButton) {
            sendLogsButton.addEventListener('click', () => this.sendLogs());
            this.log('Send logs button event listener attached');
        }

        const copyLogsButton = container.querySelector('#copyLogs');
        if (copyLogsButton) {
            copyLogsButton.addEventListener('click', () => {
                const logText = logs.join('\n');
                navigator.clipboard.writeText(logText).then(() => {
                    this.showModal('Logs copied to clipboard');
                }).catch(err => {
                    this.errorLog('Failed to copy logs', { error: err.message });
                    this.showModal('Failed to copy logs');
                });
            });
            this.log('Copy logs button event listener attached');
        }

        const clearLogsButton = container.querySelector('#clearLogs');
        if (clearLogsButton) {
            clearLogsButton.addEventListener('click', () => {
                logs.length = 0;
                const logArea = container.querySelector('#logArea');
                if (logArea) logArea.textContent = '';
                this.log('Logs cleared by user');
            });
            this.log('Clear logs button event listener attached');
        }
    }

    renderForgotPassword(errorMessage = null) {
        const container = document.getElementById(this.containerId);
        if (!container) {
            this.errorLog(`Container #${this.containerId} not found`);
            return;
        }
        this.log('renderForgotPassword called', { errorMessage });
        container.innerHTML = `
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
            <div class="forgot-password-container" style="max-width: 400px; margin: 0 auto; padding: 20px; border: 1px solid #ccc; border-radius: 5px; background-color: #f9f9f9; position: relative;">
                <form id="forgotPasswordForm" class="form">
                    <div class="form-group" style="margin-bottom: 15px; position: relative;">
                        <label for="forgotEmail" style="display: block; margin-bottom: 5px; color: #555;">Email:</label>
                        <div style="position: relative;">
                            <i class="fas fa-envelope" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                            <input type="email" id="forgotEmail" name="email" placeholder="Enter your email" required style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; box-sizing: border-box;">
                        </div>
                    </div>
                    <button type="submit" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1.1em; transition: background 0.3s;">
                        <i class="fas fa-paper-plane" style="margin-right: 5px;"></i> Send OTP
                    </button>
                </form>
                <div id="forgot-error" style="display: ${errorMessage ? 'block' : 'none'}; color: red; margin-top: 10px; text-align: center; font-size: 0.9em;">${errorMessage || ''}</div>
                <div style="margin-top: 15px; text-align: center;">
                    <a href="${this.loginUrl}" style="color: #007bff; text-decoration: none;">
                        <i class="fas fa-arrow-left" style="margin-right: 5px;"></i> Back to Login
                    </a>
                </div>
                <div id="loadingOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 10;">
                    <div style="position: relative; width: 200px; height: 200px;">
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                    </div>
                </div>
                <div id="modalOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); justify-content: center; align-items: center; z-index: 20;">
                    <div id="modalDialog" style="background: white; padding: 20px; border-radius: 5px; text-align: center; width: 300px; max-width: 80%;">
                        <p id="modalMessage"></p>
                        <button id="modalOkButton" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            <i class="fas fa-check" style="margin-right: 5px;"></i> OK
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.attachModalListener(container);
        const form = container.querySelector('#forgotPasswordForm');
        if (form) form.addEventListener('submit', this.handleForgotPassword);
        container.querySelectorAll('.toggle-password').forEach(icon => icon.addEventListener('click', this.togglePasswordVisibility));
    }

    renderVerifyOtp(email, errorMessage = null) {
        const container = document.getElementById(this.containerId);
        if (!container) { this.errorLog(`Container #${this.containerId} not found`); return; }
        this.log('renderVerifyOtp called', { email, errorMessage });
        container.innerHTML = `
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            <div class="verify-otp-container" style="max-width: 400px; margin: 0 auto; padding: 20px; border: 1px solid #ccc; border-radius: 5px; background-color: #f9f9f9; position: relative;">
                <form id="verifyOtpForm" class="form">
                    <input type="hidden" name="otp_token" value="${this.otpToken}">
                    <div class="form-group" style="margin-bottom: 15px; position: relative;">
                        <label for="verifyEmail" style="display: block; margin-bottom: 5px; color: #555;">Email:</label>
                        <div style="position: relative;">
                            <i class="fas fa-envelope" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                            <input type="email" id="verifyEmail" name="email" value="${email}" readonly style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; box-sizing: border-box;">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 15px; position: relative;">
                        <label for="otpCode" style="display: block; margin-bottom: 5px; color: #555;">OTP Code:</label>
                        <div style="position: relative;">
                            <i class="fas fa-key" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                            <input type="text" id="otpCode" name="otp" placeholder="Enter OTP" required style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; box-sizing: border-box;">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 15px; position: relative;">
                        <label for="newPassword" style="display: block; margin-bottom: 5px; color: #555;">New Password:</label>
                        <div style="position: relative;">
                            <i class="fas fa-lock" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                            <input type="password" id="newPassword" name="newPassword" placeholder="Enter new password" required style="width: 100%; padding: 10px 40px 10px 35px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; box-sizing: border-box;">
                            <i class="fas fa-eye toggle-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #666;"></i>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 15px; position: relative;">
                        <label for="confirmNewPassword" style="display: block; margin-bottom: 5px; color: #555;">Confirm New Password:</label>
                        <div style="position: relative;">
                            <i class="fas fa-lock" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                            <input type="password" id="confirmNewPassword" name="confirmNewPassword" placeholder="Confirm new password" required style="width: 100%; padding: 10px 40px 10px 35px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; box-sizing: border-box;">
                            <i class="fas fa-eye toggle-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #666;"></i>
                        </div>
                    </div>
                    <button type="submit" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1.1em; transition: background 0.3s;">
                        <i class="fas fa-check" style="margin-right: 5px;"></i> Verify OTP
                    </button>
                </form>
                <div id="otp-error" style="display: ${errorMessage ? 'block' : 'none'}; color: red; margin-top: 10px; text-align: center; font-size: 0.9em;">${errorMessage || ''}</div>
                <div id="loadingOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 10;">
                    <div style="position: relative; width: 200px; height: 200px;">
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 5px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                    </div>
                </div>
                <div id="modalOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); justify-content: center; align-items: center; z-index: 20;">
                    <div id="modalDialog" style="background: white; padding: 20px; border-radius: 5px; text-align: center; width: 300px; max-width: 80%;">
                        <p id="modalMessage"></p>
                        <button id="modalOkButton" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            <i class="fas fa-check" style="margin-right: 5px;"></i> OK
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.attachModalListener(container);
        const form = container.querySelector('#verifyOtpForm');
        if (form) form.addEventListener('submit', this.handleVerifyOtp);
        container.querySelectorAll('.toggle-password').forEach(icon => icon.addEventListener('click', this.togglePasswordVisibility));
    }

    async sendLogs() {
        // Full original sendLogs implementation (preserved)
        const logText = logs.join('\n');
        try {
            const response = await fetch(`${this.apiEndpoint}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs: logText, timestamp: new Date().toISOString() })
            });
            if (response.ok) {
                this.showModal('Logs sent successfully');
            } else {
                this.showModal('Failed to send logs');
            }
        } catch (err) {
            this.errorLog('Failed to send logs', { error: err.message });
            this.showModal('Failed to send logs');
        }
    }

    async handleLogin(event) {
        event.preventDefault();
        const form = event.target;
        const email = form.querySelector('#email')?.value;
        const password = form.querySelector('#password')?.value;

        if (!email || !password) {
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) errorDiv.textContent = 'Email and password are required';
            return;
        }

        this.showLoadingOverlay();
        try {
            const response = await fetch(`${this.apiEndpoint}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.status === 'success' && data.token) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('contact_name', data.contact_name);
                if (data.lastlogin) localStorage.setItem('lastlogin', data.lastlogin);

                this.showModal('Login successful!');
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 500);
            } else {
                const errorDiv = document.getElementById('login-error');
                if (errorDiv) errorDiv.textContent = data.error_message || 'Login failed';
            }
        } catch (err) {
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) errorDiv.textContent = 'Network error — please try again';
            this.errorLog('Login error', { error: err.message });
        } finally {
            this.hideLoadingOverlay();
        }
    }

    async handleForgotPassword(event) {
        event.preventDefault();
        const form = event.target;
        const email = form.querySelector('#forgotEmail')?.value;
        if (!email) { this.renderForgotPassword('Error: Email is required'); return; }

        this.showLoadingOverlay();
        const transactionId = crypto.randomUUID();
        this.log('Starting forgot password request', { transactionId, email });

        try {
            const response = await fetch(`${this.apiEndpoint}/login/reset-password`, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'request', email })
            });

            const responseHeaders = Object.fromEntries(response.headers.entries());
            this.log('Forgot password response', { transactionId, status: response.status, headers: responseHeaders, ok: response.ok });

            const data = await response.json();
            this.log('Forgot password parsed body', { data });

            if (data.status === 'success') {
                this.otpToken = data.otp_token || 'dummy';
                this.renderVerifyOtp(email);
                this.showModal('OTP sent to your registered phone number');
            } else {
                throw new Error(data.error_message || 'Failed to send OTP');
            }
        } catch (error) {
            this.errorLog('Forgot password error', { transactionId, error: error.message });
            this.renderForgotPassword(`Error: ${error.message}`);
        } finally {
            this.hideLoadingOverlay();
        }
    }

    async handleVerifyOtp(event) {
        event.preventDefault();
        addLog('handleVerifyOtp triggered'); // ← Added so you can confirm the button is calling the handler

        const form = event.target;
        const email = form.querySelector('#verifyEmail')?.value;
        const otp = form.querySelector('#otpCode')?.value?.trim();
        const newPassword = form.querySelector('#newPassword')?.value;
        const confirmNewPassword = form.querySelector('#confirmNewPassword')?.value;

        if (!email || !otp || !newPassword || !confirmNewPassword) {
            const errorDiv = document.getElementById('otp-error');
            if (errorDiv) errorDiv.textContent = 'All fields are required';
            return;
        }

        if (newPassword !== confirmNewPassword) {
            const errorDiv = document.getElementById('otp-error');
            if (errorDiv) errorDiv.textContent = 'Passwords do not match';
            return;
        }

        this.showLoadingOverlay();
        this.log('Starting verify OTP request', { email });

        try {
            const response = await fetch(`${this.apiEndpoint}/login/reset-password`, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'verify',
                    email,
                    otp,
                    new_password: newPassword,
                    confirm_new_password: confirmNewPassword
                })
            });

            const data = await response.json();
            this.log('Verify OTP response', { status: response.status, data });

            if (data.status === 'success' && data.token && data.workflow === 'login') {
                // Success — treat exactly like normal login
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('contact_name', data.contact_name);
                if (data.lastlogin) localStorage.setItem('lastlogin', data.lastlogin);

                this.showModal('Password reset successful! Logging you in...');
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 600);
            } else if (data.error_message && data.error_message.includes('Please wait before requesting a new OTP')) {
                // This should never happen on verify, but handle gracefully
                const errorDiv = document.getElementById('otp-error');
                if (errorDiv) errorDiv.textContent = 'Please wait a moment before trying again.';
            } else {
                const errorDiv = document.getElementById('otp-error');
                if (errorDiv) errorDiv.textContent = data.error_message || 'Verification failed. Please check your OTP and try again.';
            }
        } catch (error) {
            this.errorLog('Verify OTP error', { error: error.message });
            const errorDiv = document.getElementById('otp-error');
            if (errorDiv) errorDiv.textContent = 'Network error — please try again.';
        } finally {
            this.hideLoadingOverlay();
        }
    }

    togglePasswordVisibility(event) {
        const icon = event.target;
        const input = icon.previousElementSibling;
        if (input?.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else if (input) {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    showModal(message) {
        const container = document.getElementById(this.containerId);
        const modalOverlay = container?.querySelector('#modalOverlay');
        const modalMessage = container?.querySelector('#modalMessage');
        if (modalOverlay && modalMessage) {
            modalMessage.textContent = message;
            modalOverlay.style.display = 'flex';
        }
    }

    attachModalListener(container) {
        const modalOkButton = container.querySelector('#modalOkButton');
        if (modalOkButton) {
            modalOkButton.addEventListener('click', () => {
                const modalOverlay = container.querySelector('#modalOverlay');
                if (modalOverlay) modalOverlay.style.display = 'none';
                const otpInput = container.querySelector('#otpCode');
                if (otpInput) requestAnimationFrame(() => otpInput.focus());
            });
        }
    }

    async init() {
        this.log('init started');
        loadCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css');

        this.showLoadingOverlay();
        try {
            const config = await fetchConfig();
            this.loginUrl = config.loginUrl || '/login.html';
            this.signupLinkUrl = config.signupLinkUrl || '/signup.html';
            this.affiliate = config.affiliateCode || '';
            addLog('Configuration loaded from index.json', { loginUrl: this.loginUrl, signupLinkUrl: this.signupLinkUrl, affiliateCode: this.affiliate });

            if (!this.affiliate || this.affiliate.trim() === '') {
                addLog('Affiliate code is missing or empty, rendering config error');
                this.renderConfigError();
                return;
            }
            addLog('Affiliate code is present', { affiliate: this.affiliate });

            const isValidSession = await this.checkAuthenticationStatus();
            addLog('Authentication status', { isValidSession });

            if (isValidSession) {
                addLog('User has valid session, redirecting to dashboard');
                window.location.href = '/dashboard.html';
            } else {
                addLog('No valid session → showing login form');
                this.renderLogin();
            }
            this.log('init completed');
        } catch (error) {
            this.errorLog('Error during initialization', { error: error.message });
            this.loginUrl = '/login.html';
            this.signupLinkUrl = '/signup.html';
            this.affiliate = '';
            addLog('Using default URLs due to fetch error');
            this.renderConfigError();
        } finally {
            this.hideLoadingOverlay();
        }
    }
}

// Auto-initialize
(async function() {
    const initializeWidget = async () => {
        addLog('initializeWidget called');
        try {
            const scriptTag = document.querySelector('script[data-login-widget]');
            if (scriptTag) {
                addLog('Script tag found', { containerId: scriptTag.getAttribute('data-container-id') });
                const config = { containerId: scriptTag.getAttribute('data-container-id') || 'login-widget' };
                const widget = new LoginWidget(config);
                await widget.init();
            } else {
                addLog('ERROR: No script tag with data-login-widget found');
            }
        } catch (error) {
            addLog('ERROR: Error initializing widget', { error: error.message, stack: error.stack });
        }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        await initializeWidget();
    } else {
        document.addEventListener('DOMContentLoaded', initializeWidget);
    }
})();