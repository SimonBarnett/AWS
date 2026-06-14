// signup-widget.js
// Self-contained signup widget for new merchants, communities and partners
// Handles initial registration, onboarding token validation from email links,
// PIN verification, and password setup.
// Last major update: June 2026 - Removed deprecated /login/claims endpoint.
// Now decodes permissions locally from JWT. Aligned with SystemOTPs and consolidated onboarding routes.

(function() {
    'use strict';

    const WIDGET_ID = 'signup-widget';
    let container = null;
    let currentStep = 'initial';
    let onboardingData = {};

    // ====================== JWT DECODING (replaces /login/claims) ======================
    function decodeToken(token) {
        try {
            if (!token || typeof token !== 'string') return null;
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(atob(parts[1]));
            return payload;
        } catch (e) {
            console.error('Failed to decode JWT:', e);
            return null;
        }
    }

    function isTokenExpired(token) {
        const decoded = decodeToken(token);
        if (!decoded || !decoded.exp) return true;
        return decoded.exp < Math.floor(Date.now() / 1000);
    }

    // ====================== UTILITIES ======================
    function showError(message) {
        let errorEl = container.querySelector('#signup-error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'signup-error';
            errorEl.style.color = '#d32f2f';
            errorEl.style.marginTop = '10px';
            container.appendChild(errorEl);
        }
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    function hideError() {
        const errorEl = container.querySelector('#signup-error');
        if (errorEl) errorEl.style.display = 'none';
    }

    function showLoading(button) {
        if (button) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = 'Please wait...';
        }
    }

    function hideLoading(button) {
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || 'Submit';
        }
    }

    // ====================== INITIALIZATION ======================
    function init() {
        container = document.getElementById(WIDGET_ID);
        if (!container) {
            console.error('Signup widget container #' + WIDGET_ID + ' not found');
            return;
        }

        // Check for token in URL (from email magic link)
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const pin = params.get('pin');

        if (token) {
            onboardingData.token = token;
            renderValidateTokenStep(token, pin);
        } else {
            renderInitialForm();
        }
    }

    // ====================== STEP 1: INITIAL SIGNUP FORM ======================
    function renderInitialForm() {
        currentStep = 'initial';
        container.innerHTML = `
            <div class="signup-container">
                <h2>Create your account</h2>
                <p>Join Club Madeira as a community, merchant or partner.</p>

                <form id="initial-signup-form">
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="email" required placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="tel" id="phone" required placeholder="07123 456789">
                    </div>
                    <div class="form-group">
                        <label>I am a...</label>
                        <select id="role" required>
                            <option value="">Please select</option>
                            <option value="community">Community / Club</option>
                            <option value="merchant">Merchant</option>
                            <option value="partner">Partner / Agency</option>
                        </select>
                    </div>
                    <button type="submit" class="btn-primary">Continue</button>
                </form>
                <div id="signup-error" style="display:none;"></div>
            </div>
        `;

        const form = container.querySelector('#initial-signup-form');
        form.addEventListener('submit', handleInitialSignupSubmit);
    }

    async function handleInitialSignupSubmit(e) {
        e.preventDefault();
        hideError();

        const email = container.querySelector('#email').value.trim();
        const phone = container.querySelector('#phone').value.trim();
        const role = container.querySelector('#role').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if (!email || !phone || !role) {
            showError('Please fill in all fields');
            return;
        }

        showLoading(submitBtn);

        try {
            const response = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/generate-onboarding-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone, role })
            });

            const result = await response.json();

            if (result.status === 'success') {
                container.innerHTML = `
                    <div class="success-message">
                        <h3>Check your email</h3>
                        <p>We have sent a secure link to <strong>${email}</strong>.</p>
                        <p>Please click the link to continue setting up your account.</p>
                    </div>
                `;
            } else {
                showError(result.error_message || 'Something went wrong. Please try again.');
            }
        } catch (error) {
            showError('Network error. Please try again later.');
            console.error(error);
        } finally {
            hideLoading(submitBtn);
        }
    }

    // ====================== STEP 2: TOKEN VALIDATION + PASSWORD SETUP ======================
    function renderValidateTokenStep(token, prefilledPin = null) {
        currentStep = 'validate';
        onboardingData.token = token;

        container.innerHTML = `
            <div class="signup-container">
                <h2>Complete your signup</h2>
                <p>Enter the code we sent you and create a password.</p>

                <form id="validate-token-form">
                    <div class="form-group">
                        <label>Verification Code</label>
                        <input type="text" id="pin" maxlength="6" placeholder="123456" value="${prefilledPin || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>New Password</label>
                        <input type="password" id="password" required placeholder="Create a strong password">
                    </div>
                    <div class="form-group">
                        <label>Confirm Password</label>
                        <input type="password" id="confirm-password" required placeholder="Confirm your password">
                    </div>
                    <button type="submit" class="btn-primary">Create Account</button>
                </form>
                <div id="signup-error" style="display:none;"></div>
            </div>
        `;

        const form = container.querySelector('#validate-token-form');
        form.addEventListener('submit', handleTokenValidationSubmit);
    }

    async function handleTokenValidationSubmit(e) {
        e.preventDefault();
        hideError();

        const pin = container.querySelector('#pin').value.trim();
        const password = container.querySelector('#password').value;
        const confirmPassword = container.querySelector('#confirm-password').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            showError('Password must be at least 8 characters');
            return;
        }

        showLoading(submitBtn);

        try {
            // Validate token + complete signup
            const response = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/validate-onboarding-token', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: onboardingData.token,
                    pin: pin,
                    password: password
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.token) {
                // Store authentication data
                localStorage.setItem('authToken', result.token);
                localStorage.setItem('user_id', result.user_id);
                localStorage.setItem('contact_name', result.contact_name || '');

                // Decode permissions locally instead of calling /login/claims
                const decoded = decodeToken(result.token);
                const permissions = decoded?.permissions || [];
                console.log('Signup successful. User permissions:', permissions);

                // Success UI
                container.innerHTML = `
                    <div class="success-message">
                        <h3>Account created successfully!</h3>
                        <p>Welcome to Club Madeira.</p>
                    </div>
                `;

                // Redirect after short delay
                setTimeout(() => {
                    if (result.account_link) {
                        window.location.href = result.account_link; // Stripe onboarding etc.
                    } else {
                        window.location.href = '/dashboard.html';
                    }
                }, 1500);

            } else {
                showError(result.error_message || 'Invalid code or token expired. Please try again.');
            }
        } catch (error) {
            showError('Something went wrong. Please try again.');
            console.error(error);
        } finally {
            hideLoading(submitBtn);
        }
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();