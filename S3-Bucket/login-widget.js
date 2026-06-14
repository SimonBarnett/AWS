// login-widget.js
// Handles login, forgot password, and OTP verification for password reset
// Updated: June 2026 - Removed deprecated /login/claims, added local JWT decoding,
// and aligned reset-password calls with SystemOTPs refactor

(function() {
    const WIDGET_ID = 'login-widget';
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

    function isTokenValid(token) {
        if (!token) return false;
        const decoded = decodeToken(token);
        if (!decoded || !decoded.exp) return false;
        return decoded.exp > Math.floor(Date.now() / 1000);
    }

    // ====================== WIDGET INITIALIZATION ======================
    function init() {
        container = document.getElementById(WIDGET_ID);
        if (!container) {
            console.error('Login widget container not found:', WIDGET_ID);
            return;
        }

        // Render basic login form structure if not already present
        if (!container.querySelector('form')) {
            renderLoginForm();
        }

        attachEventListeners();
    }

    function renderLoginForm() {
        container.innerHTML = `
            <form id="login-form">
                <input type="email" id="login-email" placeholder="Email" required>
                <input type="password" id="login-password" placeholder="Password" required>
                <button type="submit">Login</button>
                <a href="#" id="forgot-password-link">Forgot password?</a>
            </form>

            <div id="reset-password-section" style="display:none;">
                <form id="reset-request-form">
                    <input type="email" id="reset-email" placeholder="Enter your email" required>
                    <button type="submit">Send Reset Code</button>
                </form>

                <form id="reset-verify-form" style="display:none;">
                    <input type="text" id="reset-otp" placeholder="Enter 6-digit code" maxlength="6" required>
                    <input type="password" id="new-password" placeholder="New Password" required>
                    <input type="password" id="confirm-new-password" placeholder="Confirm New Password" required>
                    <button type="submit">Reset Password</button>
                </form>
            </div>

            <div id="login-error" style="color:red; display:none;"></div>
        `;
    }

    function attachEventListeners() {
        const form = container.querySelector('#login-form');
        const forgotLink = container.querySelector('#forgot-password-link');
        const resetRequestForm = container.querySelector('#reset-request-form');
        const resetVerifyForm = container.querySelector('#reset-verify-form');

        if (form) {
            form.addEventListener('submit', handleLogin);
        }

        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                showResetPasswordSection();
            });
        }

        if (resetRequestForm) {
            resetRequestForm.addEventListener('submit', handleResetRequest);
        }

        if (resetVerifyForm) {
            resetVerifyForm.addEventListener('submit', handleResetVerify);
        }
    }

    // ====================== LOGIN ======================
    async function handleLogin(e) {
        e.preventDefault();

        const email = container.querySelector('#login-email').value;
        const password = container.querySelector('#login-password').value;
        const errorDiv = container.querySelector('#login-error');

        try {
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.status === 'success' && data.token) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('contact_name', data.contact_name || '');

                // Decode permissions locally instead of calling /login/claims
                const decoded = decodeToken(data.token);
                const permissions = decoded?.permissions || [];
                console.log('Login successful. Permissions:', permissions);

                // Redirect to dashboard or home
                window.location.href = '/dashboard.html';
            } else {
                showError(data.error_message || 'Login failed');
            }
        } catch (err) {
            showError('Network error during login');
            console.error(err);
        }
    }

    // ====================== RESET PASSWORD ======================
    function showResetPasswordSection() {
        const loginForm = container.querySelector('#login-form');
        const resetSection = container.querySelector('#reset-password-section');

        if (loginForm) loginForm.style.display = 'none';
        if (resetSection) resetSection.style.display = 'block';
    }

    async function handleResetRequest(e) {
        e.preventDefault();

        const email = container.querySelector('#reset-email').value;

        try {
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'request', 
                    email 
                })
            });

            const data = await res.json();

            if (data.status === 'success') {
                alert('If an account exists, a reset code has been sent.');
                // Show OTP + new password form
                container.querySelector('#reset-request-form').style.display = 'none';
                container.querySelector('#reset-verify-form').style.display = 'block';
            } else {
                showError(data.error_message || 'Failed to send reset code');
            }
        } catch (err) {
            showError('Error sending reset request');
        }
    }

    async function handleResetVerify(e) {
        e.preventDefault();

        const email = container.querySelector('#reset-email').value;
        const otp = container.querySelector('#reset-otp').value;
        const newPassword = container.querySelector('#new-password').value;
        const confirmPassword = container.querySelector('#confirm-new-password').value;

        if (newPassword !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        try {
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/verify-reset-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'verify',
                    email,
                    otp,
                    new_password: newPassword,
                    confirm_new_password: confirmPassword
                })
            });

            const data = await res.json();

            if (data.status === 'success' && data.token) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('contact_name', data.contact_name || '');

                // Decode locally instead of calling claims
                const decoded = decodeToken(data.token);
                console.log('Password reset successful. Permissions:', decoded?.permissions);

                alert('Password reset successful! You are now logged in.');
                window.location.href = '/dashboard.html';
            } else {
                showError(data.error_message || 'Password reset failed');
            }
        } catch (err) {
            showError('Error during password reset');
        }
    }

    function showError(message) {
        const errorDiv = container.querySelector('#login-error');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        } else {
            alert(message);
        }
    }

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();