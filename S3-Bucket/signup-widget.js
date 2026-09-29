// signup-widget.js
// Self-contained JavaScript widget for Club Madeira signup flow
// Handles ToS agreement → PIN validation → password setup
// Uses localStorage for auth data (no cookies)
// Loads config from /index.json

(function() {
    // Prevent duplicate initialization
    if (window.madeiraSignupLoaded) return;
    window.madeiraSignupLoaded = true;

    // Wait for DOM
    function waitForDom() {
        return new Promise(resolve => {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                resolve();
            } else {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            }
        });
    }

    // Fetch configuration with fallback
    async function fetchConfig() {
        try {
            const res = await fetch('/index.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.warn('Failed to load config, using defaults', err);
            return {
                loginUrl: '/login.html',
                dashboardLinkUrl: '/dashboard.html',
                affiliateCode: '',
                signupLinkUrl: '/signup.html'
            };
        }
    }

    // Basic JWT expiration check
    function isTokenExpired(token) {
        if (!token || typeof token !== 'string') return true;
        try {
            const [, payload] = token.split('.');
            const { exp } = JSON.parse(atob(payload));
            return exp && (Date.now() / 1000 > exp);
        } catch {
            return true;
        }
    }

    // Reusable loading overlay HTML
    const loadingOverlayHtml = `
        <div id="loadingOverlay" style="display:none; position:absolute; inset:0; background:rgba(255,255,255,0.8); z-index:10; justify-content:center; align-items:center;">
            <div style="position:relative; width:200px; height:200px;">
                <div class="spinner" style="position:absolute; inset:60px; border:8px solid transparent; border-top-color:#ff6f61; border-radius:50%; animation:spin 1.5s linear infinite;"></div>
                <div class="spinner" style="position:absolute; inset:70px; border:8px solid transparent; border-top-color:#6bff61; border-radius:50%; animation:spin 1.5s linear infinite 0.3s;"></div>
                <div class="spinner" style="position:absolute; inset:80px; border:8px solid transparent; border-top-color:#61cfff; border-radius:50%; animation:spin 1.5s linear infinite 0.6s;"></div>
                <div class="spinner" style="position:absolute; inset:90px; border:8px solid transparent; border-top-color:#ff61ff; border-radius:50%; animation:spin 1.5s linear infinite 0.9s;"></div>
            </div>
        </div>
        <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
    `;

    // Main logic
    waitForDom().then(async () => {
        const config = await fetchConfig();
        const { affiliateCode = '', loginUrl = '/login.html', dashboardLinkUrl = '/dashboard.html' } = config;

        const scriptEl = document.querySelector('script[data-signup-widget]');
        if (!scriptEl) return console.error('Signup widget script tag missing');

        const containerId = scriptEl.dataset.containerId || 'signup-widget';
        const container = document.getElementById(containerId);
        if (!container) return console.error(`Container #${containerId} not found`);

        if (!affiliateCode) {
            console.error('Missing affiliateCode in config');
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:#d32f2f;">Configuration error: Affiliate code missing</div>';
            return;
        }

        // Load Font Awesome once
        if (!document.querySelector('link[href*="fontawesome"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
            document.head.appendChild(link);
        }

        // **Inject Marked.js for ToS Markdown rendering (exact same fix as api-widget)**
        if (!document.querySelector('script[src*="marked"]')) {
            const markedScript = document.createElement('script');
            markedScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
            document.head.appendChild(markedScript);
        }

        // Helpers
        const getParam = name => new URLSearchParams(location.search).get(name);
        const isValidPassword = pw => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&=])[A-Za-z\d@$!%*?&=]{8,}$/.test(pw);

        const signupStatus = getParam('signup');
        const reason = getParam('reason');

        // ────────────────────────────────────────────────
        // Case 1: Signup failed
        // ────────────────────────────────────────────────
        if (signupStatus === 'fail') {
            container.innerHTML = `
                <style>
                    #fail-box { max-width:420px; margin:2rem auto; padding:1.5rem; border:1px solid #ccc; border-radius:8px; background:#fff8f8; text-align:center; box-shadow:0 2px 12px rgba(0,0,0,0.1); }
                    #fail-box button { background:#d32f2f; color:white; border:none; padding:0.8rem 1.8rem; border-radius:6px; cursor:pointer; font-size:1rem; }
                    #fail-box button:hover { background:#b71c1c; }
                </style>
                <div id="fail-box">
                    <h2>Signup Failed</h2>
                    <p>${reason || 'An unknown error occurred'}</p>
                    <button id="fail-ok">OK</button>
                </div>
            `;
            document.getElementById('fail-ok')?.addEventListener('click', () => {
                location.href = location.origin + location.pathname;
            });
            return;
        }

        // ────────────────────────────────────────────────
        // Case 2: Complete signup (password step)
        // ────────────────────────────────────────────────
        if (signupStatus === 'ok') {
            let authToken = localStorage.getItem('authToken');

            // Quick sanity check – prevent sending invalid token
            if (!authToken || authToken.includes('object Promise') || authToken.length < 30 || authToken === '[object Promise]') {
                localStorage.removeItem('authToken');
                container.innerHTML = `
                    <div style="max-width:420px;margin:2rem auto;padding:1.5rem;border:1px solid #ccc;border-radius:8px;background:#fff8f8;text-align:center;">
                        <h2>Invalid Session</h2>
                        <p>Your authentication session is invalid or has been corrupted.<br>Please start the signup process again.</p>
                        <a href="${location.origin + location.pathname}" style="display:inline-block;margin-top:1rem;padding:0.8rem 1.6rem;background:#1976d2;color:white;border-radius:6px;text-decoration:none;">Try Again</a>
                    </div>
                `;
                return;
            }

            if (!authToken) {
                location.href = `${location.origin}${location.pathname}?signup=fail&reason=No+Token`;
                return;
            }

            container.innerHTML = `
                <style>
                    #complete-box { max-width:420px; margin:2rem auto; padding:1.5rem; border:1px solid #ddd; border-radius:8px; background:#f9f9f9; box-shadow:0 2px 12px rgba(0,0,0,0.08); position:relative; }
                    .form-group { margin-bottom:1.2rem; }
                    label { display:flex; align-items:center; gap:6px; margin-bottom:0.4rem; font-weight:500; }
                    input { width:100%; padding:0.7rem; border:1px solid #ccc; border-radius:5px; font-size:1rem; box-sizing:border-box; }
                    input.invalid { border-color:#d32f2f; }
                    .error-text { color:#d32f2f; font-size:0.82rem; margin-top:0.3rem; display:none; }
                    .password-wrapper { position:relative; }
                    .toggle-eye { position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; color:#1976d2; }
                    button[type=submit] { width:100%; padding:0.9rem; background:#1976d2; color:white; border:none; border-radius:6px; font-size:1.05rem; cursor:pointer; transition:background 0.2s; }
                    button[type=submit]:hover:not(:disabled) { background:#1565c0; }
                    button:disabled { background:#ccc; cursor:not-allowed; }
                    #error-msg { color:#d32f2f; text-align:center; margin-bottom:1rem; min-height:1.3em; }
                </style>
                <div id="complete-box">
                    ${loadingOverlayHtml}
                    <h2 style="text-align:center;margin-bottom:1.5rem;">Complete Your Signup</h2>
                    <div id="error-msg"></div>
                    <form id="complete-form">
                        <div class="form-group">
                            <label for="pw"><i class="fas fa-lock"></i> Password</label>
                            <div class="password-wrapper">
                                <input type="password" id="pw" autocomplete="new-password" required>
                                <i class="fas fa-eye toggle-eye"></i>
                            </div>
                            <div id="pw-error" class="error-text"></div>
                        </div>
                        <div class="form-group">
                            <label for="pw2"><i class="fas fa-lock"></i> Confirm Password</label>
                            <div class="password-wrapper">
                                <input type="password" id="pw2" autocomplete="new-password" required>
                                <i class="fas fa-eye toggle-eye"></i>
                            </div>
                            <div id="pw2-error" class="error-text"></div>
                        </div>
                        <button type="submit" id="submit-btn" disabled>Complete Signup</button>
                    </form>
                </div>
            `;

            const form = container.querySelector('#complete-form');
            const pw1 = container.querySelector('#pw');
            const pw2 = container.querySelector('#pw2');
            const submitBtn = container.querySelector('#submit-btn');
            const errorMsg = container.querySelector('#error-msg');

            function validate() {
                let valid = true;

                [pw1, pw2].forEach(el => el.classList.remove('invalid'));
                container.querySelectorAll('.error-text').forEach(el => {
                    el.textContent = '';
                    el.style.display = 'none';
                });

                if (!pw1.value) {
                    valid = false;
                    pw1.classList.add('invalid');
                    container.querySelector('#pw-error').textContent = 'Password is required';
                    container.querySelector('#pw-error').style.display = 'block';
                } else if (!isValidPassword(pw1.value)) {
                    valid = false;
                    pw1.classList.add('invalid');
                    container.querySelector('#pw-error').textContent = 'Must be 8+ chars with uppercase, lowercase, number & special character';
                    container.querySelector('#pw-error').style.display = 'block';
                }

                if (!pw2.value) {
                    valid = false;
                    pw2.classList.add('invalid');
                    container.querySelector('#pw2-error').textContent = 'Confirmation is required';
                    container.querySelector('#pw2-error').style.display = 'block';
                } else if (pw1.value !== pw2.value) {
                    valid = false;
                    pw2.classList.add('invalid');
                    container.querySelector('#pw2-error').textContent = 'Passwords do not match';
                    container.querySelector('#pw2-error').style.display = 'block';
                }

                submitBtn.disabled = !valid;
            }

            pw1.addEventListener('input', validate);
            pw2.addEventListener('input', validate);
            validate();

            // Toggle password visibility
            container.querySelectorAll('.toggle-eye').forEach(icon => {
                icon.addEventListener('click', () => {
                    const input = icon.previousElementSibling;
                    const isPassword = input.type === 'password';
                    input.type = isPassword ? 'text' : 'password';
                    icon.classList.toggle('fa-eye', !isPassword);
                    icon.classList.toggle('fa-eye-slash', isPassword);
                });
            });

            // Prevent double submit
            let submitting = false;

            form.addEventListener('submit', async e => {
                e.preventDefault();
                if (submitting) return;
                submitting = true;
                submitBtn.disabled = true;

                errorMsg.textContent = '';

                const loading = container.querySelector('#loadingOverlay');
                if (loading) loading.style.display = 'flex';

                try {
                    const resp = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/complete-signup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            password: pw1.value,
                            confirm_password: pw2.value,
                            authToken,
                            signup_url: location.href
                        })
                    });

                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

                    const data = await resp.json();

                    if (data.status === 'success') {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('user_id', data.user_id);
                        localStorage.setItem('contact_name', data.contact_name);
                        location.href = dashboardLinkUrl;
                    } else {
                        errorMsg.textContent = data.error_message || data.message || 'Signup failed';
                    }
                } catch (err) {
                    console.error('Complete signup error', err);
                    errorMsg.textContent = 'An error occurred. Please try again or contact support.';
                } finally {
                    if (loading) loading.style.display = 'none';
                    submitting = false;
                    submitBtn.disabled = false;
                }
            });

            return;
        }

        // ────────────────────────────────────────────────
        // Case 3: Initial token flow (ToS → PIN)
        // ────────────────────────────────────────────────
        const token = getParam('token');
        if (!token) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;">No token provided in URL.</div>';
            return;
        }

        if (isTokenExpired(token)) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;">This invitation link has expired. Please request a new one.</div>';
            return;
        }

        container.innerHTML = `
            <div id="tos-wrapper" style="position:relative;max-width:420px;margin:2rem auto;padding:1.5rem;border:1px solid #ddd;border-radius:8px;background:#f9f9f9;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                ${loadingOverlayHtml}
            </div>
        `;

        const wrapper = container.querySelector('#tos-wrapper');
        const loading = wrapper.querySelector('#loadingOverlay');
        if (loading) loading.style.display = 'flex';

        try {
            const tosResp = await fetch(`https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/tos?token=${encodeURIComponent(token)}`);

            if (!tosResp.ok) {
                let msg = `Failed to load Terms of Service (${tosResp.status})`;
                if (tosResp.status === 404) msg = 'This invitation link has expired or is invalid.';
                throw new Error(msg);
            }

            const tosText = await tosResp.text();

            wrapper.innerHTML = `
                <style>
                    #tos-box { text-align:left; }
                    #tos-scroll { max-height:320px; overflow-y:auto; border:1px solid #ddd; padding:1rem; margin:1rem 0; font-size:0.94rem; line-height:1.5; }
                    #agree-row { display:flex; align-items:center; gap:10px; margin:1rem 0; }
                    #agree-row input:disabled { cursor:not-allowed; }
                    .btn { padding:0.8rem 1.6rem; background:#1976d2; color:white; border:none; border-radius:6px; cursor:pointer; transition:background 0.2s; }
                    .btn:hover:not(:disabled) { background:#1565c0; }
                    .btn:disabled { background:#ccc; cursor:not-allowed; }
                    #btn-row { display:flex; justify-content:space-between; margin-top:1.5rem; }
                </style>
                <div id="tos-box">
                    <h2 style="text-align:center;">Terms of Service</h2>
                    <div id="tos-scroll">${typeof marked !== 'undefined' ? marked.parse(tosText) : tosText}</div>
                    <div id="agree-row">
                        <input type="checkbox" id="agree" disabled>
                        <label for="agree">I agree to the Terms of Service</label>
                    </div>
                    <div id="btn-row">
                        <button class="btn" id="tos-back">Back</button>
                        <button class="btn" id="tos-next" disabled>Next</button>
                    </div>
                </div>
            `;

            if (loading) loading.style.display = 'none';

            const scrollBox = wrapper.querySelector('#tos-scroll');
            const checkbox = wrapper.querySelector('#agree');
            const nextBtn = wrapper.querySelector('#tos-next');

            scrollBox.addEventListener('scroll', () => {
                if (scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 10) {
                    checkbox.disabled = false;
                }
            });

            checkbox.addEventListener('change', () => {
                nextBtn.disabled = !checkbox.checked;
            });

            wrapper.querySelector('#tos-back').addEventListener('click', () => {
                location.href = loginUrl;
            });

            nextBtn.addEventListener('click', () => {
                if (!checkbox.checked) return;

                wrapper.innerHTML = `
                    <style>
                        #pin-box { text-align:center; }
                        #pin-input { width:100%; max-width:180px; padding:0.8rem; font-size:1.4rem; text-align:center; letter-spacing:0.5rem; border:1px solid #ccc; border-radius:6px; margin:1.2rem auto; }
                        #pin-input.invalid { border-color:#d32f2f; }
                        #pin-error { color:#d32f2f; min-height:1.3em; }
                        .btn { padding:0.8rem 2rem; background:#1976d2; color:white; border:none; border-radius:6px; cursor:pointer; }
                        .btn:disabled { background:#ccc; }
                    </style>
                    <div id="pin-box">
                        ${loadingOverlayHtml}
                        <h2>Enter 6-Digit PIN</h2>
                        <div id="pin-error"></div>
                        <form id="pin-form">
                            <input type="text" id="pin-input" maxlength="6" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" required>
                            <div style="margin-top:1.5rem;">
                                <button type="submit" class="btn" id="pin-submit" disabled>Submit</button>
                            </div>
                        </form>
                    </div>
                `;

                const pinInput = wrapper.querySelector('#pin-input');
                const pinSubmit = wrapper.querySelector('#pin-submit');
                const pinError = wrapper.querySelector('#pin-error');
                const pinLoading = wrapper.querySelector('#loadingOverlay');

                function checkPin() {
                    const val = pinInput.value.trim();
                    const ok = /^\d{6}$/.test(val);
                    pinInput.classList.toggle('invalid', !ok && val.length > 0);
                    pinSubmit.disabled = !ok;
                    pinError.textContent = '';
                }

                pinInput.addEventListener('input', e => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0,6);
                    checkPin();
                });

                checkPin();

                wrapper.querySelector('#pin-form').addEventListener('submit', async e => {
                    e.preventDefault();
                    if (pinSubmit.disabled) return;

                    pinSubmit.disabled = true;
                    if (pinLoading) pinLoading.style.display = 'flex';

                    try {
                        const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/validate-onboarding-token', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pin: pinInput.value, token })
                        });

                        if (!res.ok) throw new Error(`HTTP ${res.status}`);

                        const data = await res.json();

                        if (data.status === 'success' && data.account_link) {
                            location.href = data.account_link;
                        } else {
                            pinError.textContent = data.message || 'Invalid PIN or expired link';
                        }
                    } catch (err) {
                        console.error(err);
                        pinError.textContent = 'An error occurred. Please try again.';
                    } finally {
                        if (pinLoading) pinLoading.style.display = 'none';
                        pinSubmit.disabled = false;
                    }
                });
            });

        } catch (err) {
            console.error('ToS/PIN flow error', err);
            wrapper.innerHTML = `
                <div style="text-align:center;padding:2rem;color:#d32f2f;">
                    <h2>Error</h2>
                    <p>${err.message || 'Failed to load signup flow'}</p>
                </div>
            `;
        }
    });
})();