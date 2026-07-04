// ====================== partner-widget.js ======================
// Self-contained JavaScript widget for inviting new users (Community / Merchant / Partner)
// Hosted on S3 and included via <script> tag on partner websites
// Pure invite mode - myurls, buyurl, Sites tab and toggle removed
// Interacts with:
// /login/generate-onboarding-token
// /api-keys/add-role/validate-onboarding-token
//
// REWRITTEN FOR DYNAMIC LOADING FROM clubs-widget.js
// - Safe to load multiple times (no duplicate identifier errors)
// - Exposes window.PartnerWidget class for manual instantiation
// - Works both on normal page load and inside dynamically opened modals

(function () {
    // Safe log storage (prevents duplicate declaration errors)
    if (!window.__partnerWidgetLogs) {
        window.__partnerWidgetLogs = [];
    }
    const logs = window.__partnerWidgetLogs;

    function addLog(message, data = {}) {
        const logEntry = `[PartnerWidget] ${new Date().toISOString()} - ${message} ${JSON.stringify(data, null, 2)}`;
        logs.push(logEntry);
        if (logs.length > 100) logs.shift();
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

    // Load intl-tel-input (only once, even on multiple script loads)
    function loadIntlTelInputScript() {
        if (window.intlTelInput) return Promise.resolve();
        if (document.querySelector('script[src*="intl-tel-input"]')) {
            return new Promise((resolve) => {
                const existing = document.querySelector('script[src*="intl-tel-input"]');
                existing.addEventListener('load', resolve, { once: true });
            });
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/intlTelInput.min.js';
            script.onload = () => { addLog('intl-tel-input script loaded successfully'); resolve(); };
            script.onerror = (error) => { addLog('Error loading intl-tel-input script', { error: error.message }); reject(error); };
            document.head.appendChild(script);
        });
    }

    function loadIntlTelInputCSS() {
        if (document.querySelector('link[href*="intl-tel-input"]')) return Promise.resolve();
        return new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/css/intlTelInput.css';
            link.onload = () => { addLog('intl-tel-input CSS loaded successfully'); resolve(); };
            document.head.appendChild(link);
        });
    }

    function loadIntlTelInputUtils() {
        if (window.intlTelInputUtils) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js';
            script.onload = () => { addLog('intl-tel-input utils loaded successfully'); resolve(); };
            script.onerror = (error) => { addLog('Error loading intl-tel-input utils', { error: error.message }); reject(error); };
            document.head.appendChild(script);
        });
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

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    // ====================== MAIN CLASS ======================
    class PartnerWidget {
        constructor(element) {
            if (!element) {
                addLog('PartnerWidget constructed with no element');
                return;
            }
            this.element = element;
            this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com';
            this.token = localStorage.getItem('authToken');
            this.userRoles = [];
            this.hasRequiredRole = false;
            this.isAdminOrOwner = false;
            this.isPartnerOnly = false;
            this.iti = null;

            this.init();
        }

        async init() {
            addLog('Initializing PartnerWidget');
            await Promise.all([loadIntlTelInputScript(), loadIntlTelInputCSS(), loadIntlTelInputUtils()]);
            if (this.token && isTokenValid(this.token)) {
                await this.fetchUserRoles();
            } else {
                addLog('No valid token found');
            }
            this.render();
            this.loadAudioTour();
        }

        async fetchUserRoles() {
            try {
                if (!this.token) {
                    this.hasRequiredRole = false;
                    addLog('No token available for role derivation');
                    return;
                }
                const decoded = decodeToken(this.token);
                if (!decoded) {
                    this.hasRequiredRole = false;
                    addLog('Failed to decode token for roles');
                    return;
                }
                this.userRoles = decoded.permissions || [];
                this.hasRequiredRole = this.userRoles.includes('partner') ||
                                       this.userRoles.includes('admin') ||
                                       this.userRoles.includes('owner');
                this.isAdminOrOwner = this.userRoles.includes('admin') || this.userRoles.includes('owner');
                this.isPartnerOnly = this.userRoles.includes('partner') && !this.isAdminOrOwner;

                addLog('User roles derived from JWT (local decode)', {
                    roles: this.userRoles,
                    hasRequiredRole: this.hasRequiredRole,
                    isAdminOrOwner: this.isAdminOrOwner,
                    isPartnerOnly: this.isPartnerOnly
                });
            } catch (error) {
                addLog('Error deriving user roles from token', { error: error.message });
                this.hasRequiredRole = false;
            }
        }

        render() {
            if (this.hasRequiredRole) {
                this.element.innerHTML = `
                    <div style="border: 1px solid #ccc; padding: 20px; border-radius: 5px; max-width: 420px; margin: auto; background: #f9f9f9; position: relative;">
                        <style>
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            #successModal { display: none; position: fixed; z-index: 1001; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.4); }
                            #successModal .modal-content { background-color: #fefefe; margin: 15% auto; padding: 20px; border: 1px solid #888; width: 80%; max-width: 300px; text-align: center; }
                            #successOk { background-color: #28a745; color: white; }
                        </style>
                        <div id="invite-content"></div>
                        <div id="widgetLoadingOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 1000;">
                            <div style="position: relative; width: 200px; height: 200px;">
                                <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                                <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                                <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                                <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                            </div>
                        </div>
                        <div id="successModal">
                            <div class="modal-content">
                                <p>Invite sent successfully!</p>
                                <button id="successOk">OK</button>
                            </div>
                        </div>
                    </div>
                `;
                this.renderInviteForm();
            } else {
                this.renderValidateTokenIntro();
            }
        }

        showSuccessModal() {
            const modal = this.element.querySelector('#successModal');
            if (!modal) return;
            modal.style.display = 'block';
            const okBtn = modal.querySelector('#successOk');
            if (okBtn) okBtn.onclick = () => { modal.style.display = 'none'; };
        }

        renderInviteForm() {
            const inviteContent = this.element.querySelector('#invite-content');
            if (!inviteContent) return;
            addLog('Rendering invite form');

            inviteContent.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                    <h3 style="font-size: 1.5em; margin-bottom: 10px; flex: 1;">Invite a New User</h3>
                    <div class="audiotour-placement"></div>
                </div>
                <p style="margin-bottom: 15px;">Please select the role, and provide the email and Mobile number of the new user. We'll send them a token that's valid for 48 hours to join us.</p>
                <form id="generateTokenForm">
                    <style>
                        .madeira-signup-options { display: flex; justify-content: space-around; margin-bottom: 20px; }
                        .madeira-signup-option { display: flex; flex-direction: column; align-items: center; gap: 7.5px; cursor: pointer; border: 2.25px solid transparent; padding: 7.5px; transition: border-color 0.3s; }
                        .madeira-signup-option input { display: none; }
                        .icon-wrapper { width: 60px; height: 60px; display: flex; justify-content: center; align-items: center; }
                        .madeira-signup-option i { font-size: 45px; display: inline-block; color: #007bff; }
                        .role-shield { background-color: #ffcc00; color: #000; padding: 3.75px 7.5px; border-radius: 3.75px; font-weight: bold; font-size: 10.5px; margin-top: 7.5px; min-width: 75px; text-align: center; }
                        .madeira-signup-option.selected { border-color: #007bff; }
                        .madeira-signup-option.selected .icon-wrapper { animation: pulse 1.5s infinite ease-in-out; }
                        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); } 50% { box-shadow: 0 0 0 22.5px rgba(0, 123, 255, 0); } 100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); } }
                        .fa-icon { color: #007bff; }
                        #url-container, #site-container { margin-bottom: 15px; display: none; }
                    </style>
                    <div class="madeira-signup-options">
                        ${this.getRoleOptionsHTML()}
                    </div>
                    <div id="url-container">
                        <label for="url" style="display: block; margin-bottom: 5px;">URL:</label>
                        <input type="url" id="url" name="url" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                        <span id="url-error" style="color: red; display: none;"></span>
                    </div>
                    <div id="site-container">
                        <label for="site" style="display: block; margin-bottom: 5px;">Select Site:</label>
                        <select id="site" name="site" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                            <option value="">Select a site (your sites)</option>
                        </select>
                        <span id="site-error" style="color: red; display: none;"></span>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="email" style="display: block; margin-bottom: 5px;">Email:</label>
                        <input type="email" id="email" name="email" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                        <span id="email-error" style="color: red; display: none;"></span>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="mobile" style="display: block; margin-bottom: 5px;">Mobile Number:</label>
                        <input type="tel" id="mobile" name="mobile" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; margin-top: 5px;">
                        <span id="mobile-error" style="color: red; display: none;"></span>
                    </div>
                    <button type="submit" id="generateTokenButton" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">Generate Token</button>
                </form>
                <div id="generateTokenMessage" style="margin-top: 10px; text-align: center;"></div>
                <div id="loadingOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 10;">
                    <div style="position: relative; width: 200px; height: 200px;">
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                    </div>
                </div>
            `;

            const options = inviteContent.querySelectorAll('.madeira-signup-option');
            options.forEach(option => {
                option.addEventListener('click', () => {
                    options.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    option.querySelector('input').checked = true;
                    this.updateFormFields(inviteContent);
                });
            });

            const mobileInput = inviteContent.querySelector('#mobile');
            if (mobileInput && window.intlTelInput) {
                this.iti = window.intlTelInput(mobileInput, {
                    initialCountry: 'gb',
                    utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js'
                });
                mobileInput.style.paddingLeft = '60px';
            }

            const generateForm = inviteContent.querySelector('#generateTokenForm');
            generateForm.addEventListener('submit', this.handleGenerateToken.bind(this));

            setTimeout(() => {
                this.updateFormFields(inviteContent);
            }, 50);
        }

        getRoleOptionsHTML() {
            let options = '';
            if (this.isAdminOrOwner) {
                options += `
                    <label class="madeira-signup-option selected" title="Community">
                        <input type="radio" name="signup_type" value="community" checked>
                        <div class="icon-wrapper"><i class="fas fa-people-group fa-icon"></i></div>
                        <div class="role-shield">Community</div>
                    </label>
                    <label class="madeira-signup-option" title="Merchant">
                        <input type="radio" name="signup_type" value="merchant">
                        <div class="icon-wrapper"><i class="fas fa-user-tie fa-icon"></i></div>
                        <div class="role-shield">Merchant</div>
                    </label>
                    <label class="madeira-signup-option" title="Partner">
                        <input type="radio" name="signup_type" value="partner">
                        <div class="icon-wrapper"><i class="fas fa-handshake fa-icon"></i></div>
                        <div class="role-shield">Partner</div>
                    </label>
                `;
            } else {
                options += `
                    <label class="madeira-signup-option selected" title="Merchant">
                        <input type="radio" name="signup_type" value="merchant" checked>
                        <div class="icon-wrapper"><i class="fas fa-user-tie fa-icon"></i></div>
                        <div class="role-shield">Merchant</div>
                    </label>
                `;
            }
            return options;
        }

        updateFormFields(container) {
            const tokenType = container.querySelector('input[name="signup_type"]:checked')?.value || '';
            const urlContainer = container.querySelector('#url-container');
            const siteContainer = container.querySelector('#site-container');

            if (urlContainer) urlContainer.style.display = (tokenType === 'community' || tokenType === 'partner') ? 'block' : 'none';
            if (siteContainer) siteContainer.style.display = (tokenType === 'merchant' && this.isPartnerOnly) ? 'block' : 'none';
        }

        renderValidateTokenIntro() {
            this.element.innerHTML = `
                <div style="text-align: center; max-width: 400px; margin: auto; padding: 20px;">
                    <p style="margin-bottom: 20px;">Hey there! This role is special and by invitation only. If you’ve been given a token, let us know by clicking below.</p>
                    <button id="showValidateForm" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                        <i class="fas fa-key" style="margin-right: 5px;"></i> I have a token
                    </button>
                </div>
            `;
            const showValidateFormButton = this.element.querySelector('#showValidateForm');
            if (showValidateFormButton) {
                showValidateFormButton.addEventListener('click', () => this.showValidateTokenToS());
            }
        }

        async showValidateTokenToS() {
            const tosUrl = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/partner_tos.txt';
            try {
                const response = await fetch(tosUrl);
                if (!response.ok) throw new Error(`Failed to load Terms of Service: HTTP ${response.status}`);
                const tosText = await response.text();

                this.element.innerHTML = `
                    <style>
                        #tos-wrapper { position: relative; max-width: 400px; margin: 20px auto; padding: 20px; border: 1px solid #ccc; border-radius: 5px; background-color: #f9f9f9; box-shadow: 0 2px 10px rgba(0,0,0,0.1); box-sizing: border-box; }
                        #tos-content { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-bottom: 15px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; background-color: #ffffff; }
                        #tos-agree-checkbox:disabled { cursor: not-allowed; }
                        #tos-proceed-button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.3s; }
                        #tos-proceed-button:hover:not(:disabled) { background-color: #0056b3; }
                        #tos-proceed-button:disabled { background-color: #ccc; cursor: not-allowed; }
                    </style>
                    <div id="tos-wrapper">
                        <div id="tos-container">
                            <h2 style="text-align: center;">Terms of Service</h2>
                            <div id="tos-content">${tosText}</div>
                            <div id="tos-agree-container" style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                                <input type="checkbox" id="tos-agree-checkbox" disabled>
                                <label for="tos-agree-checkbox">I agree to the Terms of Service</label>
                            </div>
                            <div id="tos-button-container" style="display:flex; justify-content:flex-end;">
                                <button id="tos-proceed-button" disabled><i class="fas fa-arrow-right fa-icon" style="margin-right:5px;"></i> Proceed</button>
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
                proceedButton.addEventListener('click', () => {
                    if (tosCheckbox.checked) this.renderValidateTokenForm();
                });
            } catch (error) {
                addLog('ToS fetch error', { error: error.message });
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
                        <button type="submit" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">Validate</button>
                    </form>
                    <div id="validateTokenMessage" style="margin-top: 10px; text-align: center;"></div>
                </div>
            `;
            const form = this.element.querySelector('#validateTokenForm');
            form.addEventListener('submit', this.handleValidateToken.bind(this));
        }

        async handleGenerateToken(event) {
            event.preventDefault();
            const form = event.target;
            const emailInput = form.querySelector('#email');
            const mobileInput = form.querySelector('#mobile');
            const urlInput = form.querySelector('#url');
            const siteSelect = form.querySelector('#site');
            const generateTokenButton = form.querySelector('#generateTokenButton');
            const loadingOverlay = this.element.querySelector('#loadingOverlay');

            generateTokenButton.disabled = true;
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            this.clearErrors(form);

            const email = emailInput.value.trim();
            let mobile = this.iti ? this.iti.getNumber() : mobileInput.value.trim();
            const tokenType = form.querySelector('input[name="signup_type"]:checked').value;
            const url = urlInput ? urlInput.value.trim() : '';
            const communityId = siteSelect ? siteSelect.value : '';

            let hasError = false;
            if (!isValidEmail(email)) { this.showFieldError(form, '#email-error', 'Invalid email address'); hasError = true; }
            if (!mobile || (this.iti && !this.iti.isValidNumber())) { this.showFieldError(form, '#mobile-error', 'Invalid Mobile number'); hasError = true; }
            if ((tokenType === 'community' || tokenType === 'partner') && !isValidURL(url)) { this.showFieldError(form, '#url-error', 'URL is required'); hasError = true; }
            if (tokenType === 'merchant' && this.isPartnerOnly && !communityId) { this.showFieldError(form, '#site-error', 'Please select a site'); hasError = true; }

            if (hasError) {
                generateTokenButton.disabled = false;
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                return;
            }

            const body = { email, mobile, tokenType };
            if (url) body.url = url;
            if (communityId) body.communityId = communityId;

            try {
                const response = await fetch(`${this.apiEndpoint}/prod/ui/invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                    body: JSON.stringify(body)
                });
                const data = await response.json();
                if (data.status === 'success') {
                    this.showSuccessModal();
                    form.reset();
                    if (this.iti) this.iti.setNumber('');
                } else {
                    this.showMessage('generateTokenMessage', data.error_message || 'Oops, something went wrong generating the token.', 'error');
                }
            } catch (error) {
                this.showMessage('generateTokenMessage', 'An error occurred. Please try again later.', 'error');
            } finally {
                generateTokenButton.disabled = false;
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            }
        }

        clearErrors(form) {
            form.querySelectorAll('span[id$="-error"]').forEach(span => { span.textContent = ''; span.style.display = 'none'; });
            const msg = this.element.querySelector('#generateTokenMessage');
            if (msg) msg.textContent = '';
        }

        showFieldError(form, selector, message) {
            const errorSpan = form.querySelector(selector);
            if (errorSpan) { errorSpan.textContent = message; errorSpan.style.display = 'block'; }
        }

        async handleValidateToken(event) {
            event.preventDefault();
            const form = event.target;
            const token = form.querySelector('#token').value.trim();
            const pin = form.querySelector('#pin').value.trim();

            if (!token || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
                this.showMessage('validateTokenMessage', 'Please provide a valid token and a 6-digit PIN', 'error');
                return;
            }

            try {
                const response = await fetch(`${this.apiEndpoint}/prod/login/validate-onboarding-token`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token || ''}` },
                    body: JSON.stringify({ token, pin })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    localStorage.setItem('authToken', data.token);
                    this.token = data.token;
                    await this.fetchUserRoles();
                    this.render();
                } else {
                    this.showMessage('validateTokenMessage', data.error_message || 'Sorry, that token or PIN didn’t work.', 'error');
                }
            } catch (error) {
                this.showMessage('validateTokenMessage', 'An error occurred. Please try again later.', 'error');
            }
        }

        showMessage(elementId, message, type) {
            const messageElement = this.element.querySelector(`#${elementId}`);
            if (messageElement) {
                messageElement.textContent = message;
                messageElement.style.color = type === 'success' ? 'green' : 'red';
            } else {
                const messageDiv = document.createElement('div');
                messageDiv.id = elementId;
                messageDiv.style.textAlign = 'center';
                messageDiv.style.marginTop = '10px';
                messageDiv.textContent = message;
                messageDiv.style.color = type === 'success' ? 'green' : 'red';
                this.element.appendChild(messageDiv);
            }
        }

        loadAudioTour() {
            setTimeout(() => {
                const script = document.createElement('script');
                script.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js';
                script.onload = () => {
                    if (window.initAudioTour) {
                        this.element.id = this.element.id || 'partner-widget-' + Date.now();
                        window.initAudioTour(this.element.id, 'partner-widget-audiotour.json');
                    }
                };
                document.head.appendChild(script);
            }, 1200);
        }
    }

    // ====================== EXPOSE FOR CLUBS-WIDGET ======================
    window.PartnerWidget = PartnerWidget;

    // Auto-init on normal page load (backward compatible)
    document.addEventListener('DOMContentLoaded', () => {
        const widgetElement = document.querySelector('[data-partner-widget]');
        if (widgetElement && !widgetElement._partnerWidgetInitialized) {
            widgetElement._partnerWidgetInitialized = true;
            new PartnerWidget(widgetElement);
        }
    });

})();