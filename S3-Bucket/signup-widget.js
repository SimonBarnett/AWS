// signup-widget.js
// Handles new user signup, onboarding token validation, and password setup
// Updated: June 2026 - Removed deprecated /login/claims, aligned with consolidated onboarding routes
// and SystemOTPs refactor. Uses local JWT decoding.

(function() {
    const WIDGET_ID = 'signup-widget';
    let container = null;

    // ====================== JWT HELPER ======================
    function decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            const decoded = atob(payload);
            return JSON.parse(decoded);
        } catch (e) {
            console.error('Failed to decode token:', e.message);
            return null;
        }
    }

    // ====================== INITIALIZATION ======================
    function init() {
        container = document.getElementById(WIDGET_ID);
        if (!container) {
            console.error('Signup widget container not found');
            return;
        }

        // Check if we have a token in URL (from email link)
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (token) {
            renderTokenValidationStep(token);
        } else {
            renderInitialSignupForm();
        }
    }

    // ====================== INITIAL SIGNUP FORM ======================
    function renderInitialSignupForm() {
        container.innerHTML = `
            <form id="initial-signup-form">
                <input type="email" id="signup-email" placeholder="Email Address" required>
                <input type="tel" id="signup-phone" placeholder="Phone Number" required>
                <select id="signup-role" required>
                    <option value="">Select Role</option>
                    <option value="community">Community / Club</option>
                    <option value="merchant">Merchant</option>
                    <option value="partner">Partner</option>
                </select>
                <button type="submit">Continue</button>
            </form>
            <div id="signup-error" style="color: red; display: none;"></div>
        `;

        const form = container.querySelector('#initial-signup-form');
        form.addEventListener('submit', handleInitialSignup);
    }

    async function handleInitialSignup(e) {
        e.preventDefault();

        const email = container.querySelector('#signup-email').value;
        const phone = container.querySelector('#signup-phone').value;
        const role = container.querySelector('#signup-role').value;

        try {
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/generate-onboarding-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone, role })
            });

            const data = await res.json();

            if (data.status === 'success') {
                alert('Check your email for the signup link.');
                // In real flow, user clicks link in email which loads this widget with token
            } else {
                showError(data.error_message || 'Failed to start signup');
            }
        } catch (err) {
            showError('Network error during signup initiation');
        }
    }

    // ====================== TOKEN VALIDATION + PASSWORD SETUP ======================
    function renderTokenValidationStep(token) {
        container.innerHTML = `
            <div>
                <h3>Complete Your Signup</h3>
                <p>We've sent a code to your email/phone. Please enter it below along with your new password.</p>

                <form id="complete-signup-form">
                    <input type="text" id="onboarding-pin" placeholder="6-digit code" maxlength="6" required>
                    <input type="password" id="signup-password" placeholder="Create Password" required>
                    <input type="password" id="signup-confirm-password" placeholder="Confirm Password" required>
                    <button type="submit">Complete Signup</button>
                </form>
                <div id="signup-error" style="color: red; display: none;"></div>
            </div>
        `;

        const form = container.querySelector('#complete-signup-form');
        form.addEventListener('submit', (e) => handleCompleteSignup(e, token));
    }

    async function handleCompleteSignup(e, onboardingToken) {
        e.preventDefault();

        const pin = container.querySelector('#onboarding-pin').value;
        const password = container.querySelector('#signup-password').value;
        const confirmPassword = container.querySelector('#signup-confirm-password').value;

        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        try {
            // Validate onboarding token + complete signup
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/validate-onboarding-token', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: onboardingToken,
                    pin: pin,
                    password: password
                })
            });

            const data = await res.json();

            if (data.status === 'success' && data.token) {
                // Store auth data
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('contact_name', data.contact_name || '');

                // Decode permissions locally (no more /login/claims)
                const decoded = decodeToken(data.token);
                console.log('Signup complete. Permissions:', decoded?.permissions);

                alert('Signup successful! You are now logged in.');

                // Redirect to dashboard or Stripe onboarding if needed
                if (data.account_link) {
                    window.location.href = data.account_link;
                } else {
                    window.location.href = '/dashboard.html';
                }
            } else {
                showError(data.error_message || 'Signup failed');
            }
        } catch (err) {
            showError('Error completing signup');
            console.error(err);
        }
    }

    function showError(message) {
        let errorDiv = container.querySelector('#signup-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'signup-error';
            errorDiv.style.color = 'red';
            container.appendChild(errorDiv);
        }
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    // Auto initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();