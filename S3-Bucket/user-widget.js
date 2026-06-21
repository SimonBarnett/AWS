// user-widget.js
// Self-contained JavaScript widget for user delegation and account deletion with international dial code support
// Hosted on S3 and included via <script> tag on delegate.html
// Interacts with the latest routes:
// /prod/ui/delegate
// /prod/acceptdelegation
// /prod/ui/delete
// /prod/ui/deleteconfirm
// /prod/ui/stripe (Reconnect Stripe)

const logs = [];

function addLog(message, data = {}) {
    const logEntry = `[UserWidget] ${new Date().toISOString()} - ${message} ${JSON.stringify(data, null, 2)}`;
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

// Load intl-tel-input resources
function loadIntlTelInputScript() {
    if (window.intlTelInput) return Promise.resolve();
    if (document.querySelector('script[src*="intl-tel-input"]')) {
        return new Promise((resolve) => {
            document.querySelector('script[src*="intl-tel-input"]').addEventListener('load', resolve);
        });
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/intlTelInput.min.js';
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function loadIntlTelInputCSS() {
    if (document.querySelector('link[href*="intl-tel-input"]')) return Promise.resolve();
    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/css/intlTelInput.css';
        link.onload = resolve;
        document.head.appendChild(link);
    });
}

function loadIntlTelInputUtils() {
    if (window.intlTelInputUtils) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js';
        script.onload = resolve();
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Utility functions
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
    if (!token) return false;
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return false;
    return decoded.exp > Math.floor(Date.now() / 1000);
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

class UserWidget {
    constructor(element) {
        this.element = element;
        // ====================== UPDATED BASE URL ======================
        this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod';
        this.token = localStorage.getItem('authToken');
        this.loggedIn = false;
        this.iti = null;
        this.deleting = false;
        this.init();
    }

    async init() {
        addLog('Initializing UserWidget');
        await Promise.all([
            loadIntlTelInputScript(),
            loadIntlTelInputCSS(),
            loadIntlTelInputUtils()
        ]);

        if (this.token && isTokenValid(this.token)) {
            this.loggedIn = true;
            addLog('User is logged in');
        } else {
            addLog('User is not logged in');
        }
        this.render();
    }

    render() {
        this.element.innerHTML = `
            <div style="border: 1px solid #ccc; padding: 20px; border-radius: 5px; max-width: 400px; margin: auto; background: #f9f9f9; position: relative;">
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    #widgetLoadingOverlay {
                        display: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background: rgba(255, 255, 255, 0.8);
                        justify-content: center;
                        align-items: center;
                        z-index: 1000;
                    }
                    .fa-icon {
                        margin-right: 5px;
                    }
                </style>
                <div id="content"></div>
                <div id="widgetLoadingOverlay">
                    <div style="position: relative; width: 200px; height: 200px;">
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                    </div>
                </div>
            </div>
        `;
        const content = this.element.querySelector('#content');

        // Check for Stripe return status on render
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('stripe')) {
            const status = urlParams.get('stripe');
            if (status === 'success') {
                alert('Stripe reconnection successful! Your account is now linked.');
            } else if (status === 'fail') {
                alert('Stripe reconnection failed or was cancelled. Please try again.');
            }
            // Clean URL after showing message
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (this.loggedIn) {
            this.renderDelegationForm(content);
        } else {
            this.renderAcceptDelegationForm(content);
        }
    }

    renderDelegationForm(content) {
        let deleteSection = '';
        if (!this.deleting) {
            deleteSection = `
                <h3 style="font-size: 1.5em; margin-bottom: 10px;">Delete Account</h3>
                <p style="margin-bottom: 15px;">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <button id="deleteButton" style="width: 100%; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;"><i class="fas fa-trash fa-icon"></i>Delete Account</button>
            `;
        } else {
            deleteSection = `
                <div id="deleteConfirm" style="margin-top: 20px;">
                    <label for="otp" style="display: block; margin-bottom: 5px;">Enter OTP:</label>
                    <input type="text" id="otp" name="otp" maxlength="6" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    <span id="otp-error" style="color: red; display: none;"></span>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                        <button id="confirmDelete" disabled style="flex: 1; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 5px;"><i class="fas fa-check fa-icon"></i>Confirm</button>
                        <button id="cancelDelete" style="flex: 1; padding: 10px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 5px;"><i class="fas fa-times fa-icon"></i>Cancel</button>
                    </div>
                </div>
            `;
        }

        content.innerHTML = `
            <h3 style="font-size: 1.5em; margin-bottom: 10px;">Delegate Account</h3>
            <p style="margin-bottom: 15px;">Use this form to delegate control of your account. Provide the details below to delegate.</p>
            <form id="delegateForm">
                <div style="margin-bottom: 15px;">
                    <label for="first_name" style="display: block; margin-bottom: 5px;">First Name:</label>
                    <input type="text" id="first_name" name="first_name" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    <span id="first_name-error" style="color: red; display: none;">First name is required</span>
                </div>
                <div style="margin-bottom: 15px;">
                    <label for="email" style="display: block; margin-bottom: 5px;">Email:</label>
                    <input type="email" id="email" name="email" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    <span id="email-error" style="color: red; display: none;">Invalid email address</span>
                </div>
                <div style="margin-bottom: 15px;">
                    <label for="phone" style="display: block; margin-bottom: 5px;">Phone Number:</label>
                    <input type="tel" id="phone" name="phone" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    <span id="phone-error" style="color: red; display: none;">Invalid phone number</span>
                </div>
                <button type="submit" id="delegateButton" disabled style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;"><i class="fas fa-user-plus fa-icon"></i>Delegate</button>
            </form>
            <div id="delegateMessage" style="margin-top: 10px; text-align: center;"></div>

            <hr style="margin: 20px 0;">

            <!-- ====================== RECONNECT STRIPE SECTION (SAME STYLING AS DELEGATE BUTTON) ====================== -->
            <h3 style="font-size: 1.5em; margin-bottom: 10px;">Reconnect Stripe</h3>
            <p style="margin-bottom: 15px;">Reconnect or update your Stripe account for payments and payouts.</p>
            <button id="reconnectStripeButton" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                <i class="fas fa-link fa-icon"></i> Reconnect Stripe
            </button>
            <div id="stripeMessage" style="margin-top: 10px; text-align: center;"></div>
            <!-- ===================================================================== -->

            <hr style="margin: 20px 0;">
            ${deleteSection}
            <div id="deleteMessage" style="margin-top: 10px; text-align: center;"></div>
        `;

        const phoneInput = content.querySelector('#phone');
        if (phoneInput) {
            this.iti = window.intlTelInput(phoneInput, {
                initialCountry: 'gb',
                utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js'
            });
            phoneInput.style.paddingLeft = '60px';
            addLog('intl-tel-input initialized for delegation');
        }

        const form = content.querySelector('#delegateForm');
        form.addEventListener('submit', this.handleDelegate.bind(this));

        const firstNameInput = form.querySelector('#first_name');
        const emailInput = form.querySelector('#email');
        const delegateButton = form.querySelector('#delegateButton');

        const validateForm = () => {
            const firstName = firstNameInput.value.trim();
            const email = emailInput.value.trim();
            let isPhoneValid = false;
            if (this.iti) {
                isPhoneValid = this.iti.isValidNumber();
            }
            const isValid = firstName && isValidEmail(email) && isPhoneValid;
            delegateButton.disabled = !isValid;

            content.querySelector('#first_name-error').style.display = firstName ? 'none' : 'block';
            content.querySelector('#email-error').style.display = isValidEmail(email) ? 'none' : 'block';
            content.querySelector('#phone-error').style.display = isPhoneValid ? 'none' : 'block';
        };

        firstNameInput.addEventListener('input', validateForm);
        emailInput.addEventListener('input', validateForm);
        phoneInput.addEventListener('input', validateForm);
        phoneInput.addEventListener('countrychange', validateForm);

        // Reconnect Stripe button (same style as Delegate button)
        const reconnectBtn = content.querySelector('#reconnectStripeButton');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', this.handleReconnectStripe.bind(this));
        }

        if (!this.deleting) {
            const deleteButton = content.querySelector('#deleteButton');
            if (deleteButton) {
                deleteButton.addEventListener('click', this.handleInitiateDelete.bind(this));
            }
        } else {
            const cancelDelete = content.querySelector('#cancelDelete');
            if (cancelDelete) {
                cancelDelete.addEventListener('click', () => {
                    this.deleting = false;
                    this.render();
                });
            }
            const confirmDelete = content.querySelector('#confirmDelete');
            if (confirmDelete) {
                confirmDelete.addEventListener('click', this.handleConfirmDelete.bind(this));
            }
            const otpInput = content.querySelector('#otp');
            if (otpInput) {
                otpInput.addEventListener('input', () => {
                    const otp = otpInput.value.trim();
                    confirmDelete.disabled = otp.length !== 6 || !/^\d{6}$/.test(otp);
                });
            }
        }
    }

    // ====================== NEW: RECONNECT STRIPE ======================
    async handleReconnectStripe() {
        const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
        loadingOverlay.style.display = 'flex';

        try {
            const response = await fetch(`${this.apiEndpoint}/ui/stripe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (data.status === 'success' && data.onboarding_url) {
                // Redirect directly to Stripe onboarding
                window.location.href = data.onboarding_url;
            } else {
                this.showMessage('stripeMessage', data.error_message || 'Failed to start Stripe reconnection', 'error');
            }
        } catch (error) {
            this.showMessage('stripeMessage', 'An error occurred. Please try again.', 'error');
            addLog('Error reconnecting Stripe', { error: error.message });
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    // ====================== UPDATED FETCH URLs ======================
    async handleDelegate(event) {
        event.preventDefault();
        const form = event.target;
        const firstName = form.querySelector('#first_name').value.trim();
        const email = form.querySelector('#email').value.trim();
        let phone = '';
        if (this.iti) {
            phone = this.iti.getNumber();
        } else {
            phone = form.querySelector('#phone').value.trim();
        }

        const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
        loadingOverlay.style.display = 'flex';

        try {
            const response = await fetch(`${this.apiEndpoint}/ui/delegate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    first_name: firstName,
                    phone_number: phone,
                    email_address: email
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                this.showMessage('delegateMessage', 'Delegation initiated successfully', 'success');
                form.reset();
                if (this.iti) this.iti.setNumber('');
            } else {
                this.showMessage('delegateMessage', data.error_message || 'Failed to initiate delegation', 'error');
            }
        } catch (error) {
            this.showMessage('delegateMessage', 'An error occurred. Please try again.', 'error');
            addLog('Error initiating delegation', { error: error.message });
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    async handleInitiateDelete() {
        const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
        loadingOverlay.style.display = 'flex';

        try {
            const response = await fetch(`${this.apiEndpoint}/ui/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (data.status === 'success') {
                this.deleting = true;
                this.render();
            } else {
                this.showMessage('deleteMessage', data.error_message || 'Failed to initiate deletion', 'error');
            }
        } catch (error) {
            this.showMessage('deleteMessage', 'An error occurred. Please try again.', 'error');
            addLog('Error initiating deletion', { error: error.message });
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    async handleConfirmDelete() {
        const otp = this.element.querySelector('#otp').value.trim();
        const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
        loadingOverlay.style.display = 'flex';

        try {
            const response = await fetch(`${this.apiEndpoint}/ui/deleteconfirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ otp })
            });

            const data = await response.json();

            if (data.status === 'success') {
                localStorage.removeItem('authToken');
                this.token = null;
                this.loggedIn = false;
                this.deleting = false;
                alert('Account deleted successfully');
                window.location.href = '/';
            } else {
                this.showMessage('deleteMessage', data.error_message || 'Failed to confirm deletion', 'error');
            }
        } catch (error) {
            this.showMessage('deleteMessage', 'An error occurred. Please try again.', 'error');
            addLog('Error confirming deletion', { error: error.message });
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    renderAcceptDelegationForm(content) {
        const urlParams = new URLSearchParams(window.location.search);
        const delegationToken = urlParams.get('token');

        if (!delegationToken) {
            content.innerHTML = `<p style="text-align: center; color: red;">No delegation token provided. Please check your invitation link.</p>`;
            return;
        }

        content.innerHTML = `
            <h3 style="font-size: 1.5em; margin-bottom: 10px;">Accept Delegation</h3>
            <form id="acceptForm">
                <input type="hidden" id="token" name="token" value="${delegationToken}">
                <div style="margin-bottom: 15px; position: relative;">
                    <label for="otp" style="display: block; margin-bottom: 5px;">OTP:</label>
                    <div style="position: relative;">
                        <i class="fas fa-key" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                        <input type="text" id="otp" name="otp" maxlength="6" required style="width: 100%; padding: 8px 10px 8px 35px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="margin-bottom: 15px; position: relative;">
                    <label for="newpassword" style="display: block; margin-bottom: 5px;">New Password:</label>
                    <div style="position: relative;">
                        <i class="fas fa-lock" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                        <input type="password" id="newpassword" name="newpassword" required style="width: 100%; padding: 8px 40px 8px 35px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                        <i class="fas fa-eye toggle-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #666;"></i>
                    </div>
                </div>
                <div style="margin-bottom: 15px; position: relative;">
                    <label for="confirmNewPassword" style="display: block; margin-bottom: 5px;">Confirm New Password:</label>
                    <div style="position: relative;">
                        <i class="fas fa-lock" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666;"></i>
                        <input type="password" id="confirmNewPassword" name="confirmNewPassword" required style="width: 100%; padding: 8px 40px 8px 35px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                        <i class="fas fa-eye toggle-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #666;"></i>
                    </div>
                </div>
                <button type="submit" id="acceptButton" disabled style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;"><i class="fas fa-check fa-icon"></i>Accept</button>
            </form>
            <div id="acceptMessage" style="margin-top: 10px; text-align: center;"></div>
        `;

        const form = content.querySelector('#acceptForm');
        form.addEventListener('submit', this.handleAcceptDelegation.bind(this));

        content.querySelectorAll('.toggle-password').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const input = e.target.previousElementSibling;
                if (input.type === 'password') {
                    input.type = 'text';
                    e.target.classList.remove('fa-eye');
                    e.target.classList.add('fa-eye-slash');
                } else {
                    input.type = 'password';
                    e.target.classList.remove('fa-eye-slash');
                    e.target.classList.add('fa-eye');
                }
            });
        });

        const otpInput = content.querySelector('#otp');
        const newPassword = content.querySelector('#newpassword');
        const confirmNewPassword = content.querySelector('#confirmNewPassword');
        const acceptButton = content.querySelector('#acceptButton');

        const validateForm = () => {
            const otp = otpInput.value.trim();
            const password = newPassword.value.trim();
            const confirmPassword = confirmNewPassword.value.trim();
            const isValid = otp.length === 6 && /^\d{6}$/.test(otp) && password && (password === confirmPassword);
            acceptButton.disabled = !isValid;

            const messageElement = content.querySelector('#acceptMessage');
            if (password !== confirmPassword && password && confirmPassword) {
                messageElement.textContent = 'Passwords do not match';
                messageElement.style.color = 'red';
            } else {
                messageElement.textContent = '';
            }
        };

        otpInput.addEventListener('input', validateForm);
        newPassword.addEventListener('input', validateForm);
        confirmNewPassword.addEventListener('input', validateForm);
    }

    async handleAcceptDelegation(event) {
        event.preventDefault();
        const form = event.target;
        const token = form.querySelector('#token').value.trim();
        const otp = form.querySelector('#otp').value.trim();
        const newpassword = form.querySelector('#newpassword').value.trim();

        const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
        loadingOverlay.style.display = 'flex';

        try {
            const response = await fetch(`${this.apiEndpoint}/acceptdelegation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token, otp, newpassword })
            });

            const data = await response.json();

            if (data.status === 'success') {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('contact_name', data.contact_name);
                if (data.lastlogin) {
                    localStorage.setItem('lastlogin', data.lastlogin);
                }

                addLog('Delegation accepted, session variables set', {
                    token: data.token,
                    user_id: data.user_id,
                    contact_name: data.contact_name,
                    lastlogin: data.lastlogin,
                    workflow: data.workflow
                });

                this.token = data.token;
                this.loggedIn = true;
                this.showMessage('acceptMessage', 'Delegation accepted successfully', 'success');
                window.location.href = '/dashboard.html';
            } else {
                this.showMessage('acceptMessage', data.error_message || 'Failed to accept delegation', 'error');
            }
        } catch (error) {
            this.showMessage('acceptMessage', 'An error occurred. Please try again.', 'error');
            addLog('Error accepting delegation', { error: error.message });
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    showMessage(elementId, message, type) {
        const messageElement = this.element.querySelector(`#${elementId}`);
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.style.color = type === 'success' ? 'green' : 'red';
        }
    }
}

// Initialize widget
document.addEventListener('DOMContentLoaded', () => {
    const widgetElement = document.querySelector('[data-user-widget]');
    if (widgetElement) {
        new UserWidget(widgetElement);
    } else {
        addLog('User widget element not found. Please add <div data-user-widget></div> to your HTML.');
    }
});