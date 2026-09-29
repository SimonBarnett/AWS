// partner-signup-widget.js
// Self-contained JavaScript widget for public partner signup with token validation
// Hosted on S3 and included via <script> tag on public websites
// Interacts with /prod/api-keys/add-role/validate-onboarding-token endpoint
// Upon successful validation, redirects to Stripe onboarding

// Log storage for debugging
const logs = [];

// Utility function to add logs for debugging
function addLog(message, data = {}) {
    const logEntry = `[PartnerSignupWidget] ${new Date().toISOString()} - ${message} ${JSON.stringify(data, null, 2)}`;
    logs.push(logEntry);
    if (logs.length > 100) logs.shift(); // Limit to 100 logs
    console.log(logEntry);
}

// Load FontAwesome if not already loaded
if (!document.querySelector('link[href*="font-awesome"]')) {
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
    document.head.appendChild(faLink);
    addLog('FontAwesome loaded');
}

// Utility Functions
function decodeToken(token) {
    try {
        const payload = token.split('.')[1];
        const decoded = atob(payload);
        return JSON.parse(decoded);
    } catch (e) {
        addLog('Failed to decode token', { error: e.message });
        return null;
    }
}

function isTokenValid(token) {
    if (!token) {
        addLog('No token provided for validation');
        return false;
    }
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
        addLog('Invalid token or no expiration', { decoded });
        return false;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    const isValid = decoded.exp > currentTime;
    addLog('Token validity check', { isValid, expiresAt: decoded.exp, currentTime });
    return isValid;
}

// Main widget class
class PartnerSignupWidget {
    constructor(element) {
        this.element = element;
        this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com';
        this.token = localStorage.getItem('authToken');
        this.init();
    }

    async init() {
        addLog('Initializing PartnerSignupWidget');
        this.renderValidateTokenIntro();
    }

    renderValidateTokenIntro() {
        this.element.innerHTML = `
            <div style="text-align: center; max-width: 400px; margin: auto; padding: 20px;">
                <p style="margin-bottom: 20px;">Hey there! The partner role is special and by invitation only. If you’ve been given a token, let us know by clicking below.</p>
                <button id="showValidateForm" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                    <i class="fas fa-key" style="margin-right: 5px;"></i> I have a token
                </button>
                <div style="margin-top: 15px;">
                    <button id="backButton" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                        <i class="fas fa-arrow-left fa-icon" style="margin-right: 5px;"></i> Back
                    </button>
                </div>
            </div>
        `;

        const showValidateFormButton = this.element.querySelector('#showValidateForm');
        showValidateFormButton.addEventListener('click', () => this.showValidateTokenToS());

        const backButton = this.element.querySelector('#backButton');
        backButton.addEventListener('click', () => window.history.back());
    }

    async showValidateTokenToS() {
        const tosUrl = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/partner_tos.txt';
        try {
            const response = await fetch(tosUrl);
            if (!response.ok) throw new Error(`Failed to load Terms of Service: HTTP ${response.status}`);
            const tosText = await response.text();

            this.element.innerHTML = `
                <style>
                    #tos-wrapper {
                        position: relative;
                        max-width: 400px;
                        margin: 20px auto;
                        padding: 20px;
                        border: 1px solid #ccc;
                        border-radius: 5px;
                        background-color: #f9f9f9;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    #tos-container {
                        text-align: left;
                    }
                    #tos-content {
                        max-height: 300px;
                        overflow-y: auto;
                        border: 1px solid #ddd;
                        padding: 10px;
                        margin-bottom: 15px;
                        font-size: 14px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        background-color: #ffffff;
                    }
                    #tos-agree-container {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 15px;
                    }
                    #tos-agree-checkbox:disabled {
                        cursor: not-allowed;
                    }
                    #tos-button-container {
                        display: flex;
                        justify-content: space-between;
                    }
                    #tos-back-button, #tos-proceed-button {
                        background-color: #007bff;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        transition: background-color 0.3s;
                    }
                    #tos-back-button:hover, #tos-proceed-button:hover:not(:disabled) {
                        background-color: #0056b3;
                    }
                    #tos-proceed-button:disabled {
                        background-color: #ccc;
                        cursor: not-allowed;
                    }
                    #loadingOverlay {
                        display: none;
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(255, 255, 255, 0.8);
                        justify-content: center;
                        align-items: center;
                        z-index: 10;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .fa-icon {
                        color: #007bff;
                    }
                </style>
                <div id="tos-wrapper">
                    <div id="tos-container">
                        <h2 style="text-align: center;">Terms of Service</h2>
                        <div id="tos-content">${tosText}</div>
                        <div id="tos-agree-container">
                            <input type="checkbox" id="tos-agree-checkbox" disabled>
                            <label for="tos-agree-checkbox">I agree to the Terms of Service</label>
                        </div>
                        <div id="tos-button-container">
                            <button id="tos-back-button"><i class="fas fa-arrow-left fa-icon" style="margin-right: 5px;"></i> Back</button>
                            <button id="tos-proceed-button" disabled><i class="fas fa-arrow-right fa-icon" style="margin-right: 5px;"></i> Proceed</button>
                        </div>
                    </div>
                    <div id="loadingOverlay">
                        <div style="position: relative; width: 200px; height: 200px;">
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                        </div>
                    </div>
                </div>
            `;

            const tosContent = this.element.querySelector('#tos-content');
            const tosCheckbox = this.element.querySelector('#tos-agree-checkbox');
            const proceedButton = this.element.querySelector('#tos-proceed-button');

            tosContent.addEventListener('scroll', () => {
                if (tosContent.scrollTop + tosContent.clientHeight >= tosContent.scrollHeight - 5) {
                    tosCheckbox.disabled = false;
                }
            });

            tosCheckbox.addEventListener('change', () => {
                proceedButton.disabled = !tosCheckbox.checked;
                proceedButton.style.backgroundColor = tosCheckbox.checked ? '#007bff' : '#ccc';
                proceedButton.style.cursor = tosCheckbox.checked ? 'pointer' : 'not-allowed';
            });

            this.element.querySelector('#tos-back-button').addEventListener('click', () => {
                this.renderValidateTokenIntro();
            });

            proceedButton.addEventListener('click', () => {
                if (tosCheckbox.checked) {
                    this.renderValidateTokenForm();
                }
            });
        } catch (error) {
            addLog('ToS fetch error', { error: error.message });
            this.showMessage('validateTokenMessage', 'Failed to load Terms of Service. Please try again.', 'error');
            this.renderValidateTokenIntro();
        }
    }

    renderValidateTokenForm() {
        this.element.innerHTML = `
            <div style="border: 1px solid #ccc; padding: 20px; border-radius: 5px; max-width: 400px; margin: auto; background: #f9f9f9;">
                <h3 style="font-size: 1.5em; margin-bottom: 10px;">Validate Token</h3>
                <form id="validateTokenForm">
                    <div style="margin-bottom: 15px;">
                        <label for="token" style="display: block; margin-bottom: 5px;">Token:</label>
                        <textarea id="token" name="token" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; height: 100px; box-sizing: border-box;"></textarea>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="pin" style="display: block; margin-bottom: 5px;">PIN (6 digits):</label>
                        <input type="text" id="pin" name="pin" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;" maxlength="6">
                    </div>
                    <button type="submit" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                        Validate
                    </button>
                </form>
                <div id="validateTokenMessage" style="margin-top: 10px; text-align: center;"></div>
                <div style="margin-top: 15px; text-align: center;">
                    <button id="backButton" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                        <i class="fas fa-arrow-left fa-icon" style="margin-right: 5px;"></i> Back
                    </button>
                </div>
            </div>
        `;

        const form = this.element.querySelector('#validateTokenForm');
        form.addEventListener('submit', this.handleValidateToken.bind(this));

        const backButton = this.element.querySelector('#backButton');
        backButton.addEventListener('click', () => this.showValidateTokenToS());
    }

    async handleValidateToken(event) {
        event.preventDefault();
        const form = event.target;
        const token = form.querySelector('#token').value.trim();
        const pin = form.querySelector('#pin').value.trim();
    
        // Validate input
        if (!token || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
            this.showMessage('validateTokenMessage', 'Please provide a valid token and a 6-digit PIN', 'error');
            return;
        }
    
        try {
            const response = await fetch(`${this.apiEndpoint}/prod/api-keys/add-role/validate-onboarding-token`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token || ''}`
                },
                body: JSON.stringify({ token, pin })
            });
            const data = await response.json();
    
            if (data.status === 'success') {
                // Store the new token in local storage
                localStorage.setItem('authToken', data.token);
                // Update the internal token
                this.token = data.token;
                // Proceed to Stripe signup
                await this.redirectToStripe(token);
            } else {
                this.showMessage('validateTokenMessage', data.error_message || 'Sorry, that token or PIN didn’t work.', 'error');
            }
        } catch (error) {
            this.showMessage('validateTokenMessage', 'An error occurred. Please try again later.', 'error');
            addLog('Error validating token', { error: error.message });
        }
    }

    async redirectToStripe(onboardingToken) {
        try {
            const decoded = decodeToken(onboardingToken);
            const affiliate_code = decoded.affiliate_code || ''; // Assume affiliate_code is in the onboarding token payload
            const signup_type = 'merchant'; // Assuming 'merchant' corresponds to 'partner'
            const signup_url = window.location.href;

            if (!affiliate_code) {
                this.showMessage('validateTokenMessage', 'Missing affiliate code in token.', 'error');
                return;
            }

            const response = await fetch(`${this.apiEndpoint}/prod/stripe/signup`, { // Assuming endpoint path based on context
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ signup_type, affiliate_code, signup_url })
            });
            const data = await response.json();

            if (data.status === 'success') {
                window.location.href = data.account_link;
            } else {
                this.showMessage('validateTokenMessage', data.message || 'Failed to initiate Stripe signup.', 'error');
            }
        } catch (error) {
            this.showMessage('validateTokenMessage', 'An error occurred during Stripe redirection.', 'error');
            addLog('Error redirecting to Stripe', { error: error.message });
        }
    }

    showMessage(elementId, message, type) {
        const messageElement = this.element.querySelector(`#${elementId}`);
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.style.color = type === 'success' ? 'green' : 'red';
        } else {
            // Fallback to ensure message is displayed
            const messageDiv = document.createElement('div');
            messageDiv.id = elementId;
            messageDiv.style.textAlign = 'center';
            messageDiv.style.marginTop = '10px';
            messageDiv.textContent = message;
            messageDiv.style.color = type === 'success' ? 'green' : 'red';
            this.element.appendChild(messageDiv);
        }
    }
}

// Initialize widget on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const widgetElement = document.querySelector('[data-partner-signup-widget]');
    if (widgetElement) {
        new PartnerSignupWidget(widgetElement);
    } else {
        addLog('Partner signup widget element not found. Please add <div data-partner-signup-widget></div> to your HTML.');
    }
});