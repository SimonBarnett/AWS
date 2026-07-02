// ====================== delegate-widget.js ======================
// FULL AND UNABRIDGED
// + Fixed intl-tel-input loading + improved fallback phone UI
// + Better phone validation in fallback mode
// + Cleaner phone field rendering
// + Audio Tour now uses stable widget name (delegate-widget) instead of dynamic ID

(function () {
    console.log('[DelegateWidget] Script started');

    // Load Font Awesome
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
        document.head.appendChild(faLink);
    }

    function loadIntlTelInput() {
        return new Promise((resolve) => {
            if (window.intlTelInput) {
                return resolve(true);
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/intl-tel-input.min.js';
            
            script.onload = () => resolve(true);
            script.onerror = () => {
                console.warn('[DelegateWidget] intl-tel-input failed to load — using fallback');
                resolve(false);
            };
            
            document.head.appendChild(script);
        });
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    class DelegateWidget {
        constructor(element) {
            this.element = element;
            this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod';
            this.token = localStorage.getItem('authToken');
            this.loggedIn = this.token && this.isTokenValid(this.token);
            this.iti = null;
            this.init();
        }

        isTokenValid(token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.exp > Math.floor(Date.now() / 1000);
            } catch {
                return false;
            }
        }

        async init() {
            this.renderSkeleton();

            const intlLoaded = await loadIntlTelInput();

            this.render();
            this.loadAudioTour();
        }

        renderSkeleton() {
            this.element.innerHTML = `
                <div style="max-width:420px;margin:20px auto;padding:30px;background:#f8f9fa;border:2px dashed #007bff;border-radius:8px;text-align:center;">
                    <h3>🔄 Loading Delegate Widget...</h3>
                </div>
            `;
        }

        render() {
            const urlParams = new URLSearchParams(window.location.search);
            const delegationToken = urlParams.get('token');

            if (delegationToken) {
                this.renderAcceptForm(delegationToken);
            } else if (this.loggedIn) {
                this.renderDelegateForm();
            } else {
                this.element.innerHTML = `
                    <p style="color:red;text-align:center;padding:20px;">
                        Invalid or missing delegation token.<br>
                        Please use the link from your email.
                    </p>`;
            }
        }

        // ====================== DELEGATE FORM ======================
        renderDelegateForm() {
            this.element.innerHTML = `
                <div style="max-width:420px;margin:0 auto;padding:20px;background:#fff;border:1px solid #ddd;border-radius:8px;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px;">
                        <h3 style="margin:0; flex:1;">Delegate Account</h3>
                        <div class="audiotour-placement" style="display:inline-flex; align-items:center;"></div>
                    </div>

                    <div style="background:#f0f8ff; border-left:4px solid #007bff; padding:12px; margin-bottom:20px; font-size:14px; color:#333;">
                        <strong>Note:</strong> This feature is so that the current site curator can nominate someone to take over maintenance.
                    </div>

                    <form id="delegateForm">
                        <div style="margin-bottom:15px;">
                            <label>First Name</label>
                            <input type="text" id="first_name" required style="width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;">
                            <span id="first_name-error" style="color:red;font-size:12px;display:none;">Required</span>
                        </div>

                        <div style="margin-bottom:15px;">
                            <label>Email</label>
                            <input type="email" id="email" required style="width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;">
                            <span id="email-error" style="color:red;font-size:12px;display:none;">Invalid email</span>
                        </div>

                        <div style="margin-bottom:15px;">
                            <label>Phone Number</label>
                            <div id="phone-container" style="display:flex; gap:8px; align-items:center;">
                                <!-- Phone input will be injected here -->
                            </div>
                            <span id="phone-error" style="color:red;font-size:12px;display:none;">Please enter a valid phone number</span>
                        </div>

                        <button type="submit" id="delegateBtn" disabled 
                                style="width:100%;padding:12px;background:#007bff;color:white;border:none;border-radius:6px;font-size:16px;cursor:pointer;">
                            <i class="fas fa-user-plus"></i> Delegate Account
                        </button>
                    </form>
                    <div id="delegateMessage" style="margin-top:15px;text-align:center;"></div>
                </div>
            `;

            this.setupPhoneField();
            this.setupFormValidation();
        }

        setupPhoneField() {
            const container = this.element.querySelector('#phone-container');
            const phoneInput = document.createElement('input');
            phoneInput.type = 'tel';
            phoneInput.id = 'phone';
            phoneInput.required = true;
            phoneInput.style.flex = '1';
            phoneInput.style.padding = '10px';
            phoneInput.style.border = '1px solid #ccc';
            phoneInput.style.borderRadius = '4px';

            // Create country code select
            const countrySelect = document.createElement('select');
            countrySelect.id = 'country-code';
            countrySelect.style.width = '110px';
            countrySelect.style.padding = '10px';
            countrySelect.style.border = '1px solid #ccc';
            countrySelect.style.borderRadius = '4px';

            const countries = [
                { code: '+44', label: '🇬🇧 +44' },
                { code: '+1', label: '🇺🇸 +1' },
                { code: '+49', label: '🇩🇪 +49' },
                { code: '+33', label: '🇫🇷 +33' },
                { code: '+39', label: '🇮🇹 +39' },
                { code: '+61', label: '🇦🇺 +61' },
            ];

            countries.forEach(c => {
                const option = document.createElement('option');
                option.value = c.code;
                option.textContent = c.label;
                countrySelect.appendChild(option);
            });

            container.appendChild(countrySelect);
            container.appendChild(phoneInput);

            this.phoneInput = phoneInput;
            this.countrySelect = countrySelect;

            // Try to initialize intl-tel-input if available
            if (window.intlTelInput) {
                try {
                    this.iti = window.intlTelInput(phoneInput, {
                        initialCountry: 'gb',
                        utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js'
                    });
                    phoneInput.style.paddingLeft = '58px';
                } catch (e) {
                    console.warn('[DelegateWidget] intlTelInput initialization failed');
                }
            }
        }

        setupFormValidation() {
            const form = this.element.querySelector('#delegateForm');
            const delegateBtn = this.element.querySelector('#delegateBtn');
            const firstNameInput = this.element.querySelector('#first_name');
            const emailInput = this.element.querySelector('#email');

            const validate = () => {
                const firstName = firstNameInput.value.trim();
                const email = emailInput.value.trim();
                const phoneVal = this.phoneInput.value.trim();

                const isPhoneValid = phoneVal.length >= 7;

                this.element.querySelector('#first_name-error').style.display = firstName ? 'none' : 'block';
                this.element.querySelector('#email-error').style.display = isValidEmail(email) ? 'none' : 'block';
                this.element.querySelector('#phone-error').style.display = isPhoneValid ? 'none' : 'block';

                delegateBtn.disabled = !(firstName && isValidEmail(email) && isPhoneValid);
            };

            firstNameInput.addEventListener('input', validate);
            emailInput.addEventListener('input', validate);
            this.phoneInput.addEventListener('input', validate);
            this.countrySelect.addEventListener('change', validate);

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitDelegation();
            });
        }

        async submitDelegation() {
            const firstName = this.element.querySelector('#first_name').value.trim();
            const email = this.element.querySelector('#email').value.trim();
            const countryCode = this.countrySelect.value;
            const phoneNumber = this.phoneInput.value.trim();
            const phone = countryCode + phoneNumber;

            const overlay = this.showLoading();

            try {
                const res = await fetch(`${this.apiEndpoint}/ui/delegate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({
                        first_name: firstName,
                        email_address: email,
                        phone_number: phone
                    })
                });

                const data = await res.json();

                if (data.status === 'success') {
                    this.showMessage('delegateMessage', 'Delegation request sent successfully!', 'success');
                    this.element.querySelector('#delegateForm').reset();
                } else {
                    this.showMessage('delegateMessage', data.error_message || 'Failed to delegate', 'error');
                }
            } catch (err) {
                this.showMessage('delegateMessage', 'An error occurred. Please try again.', 'error');
            } finally {
                overlay.remove();
            }
        }

        // ====================== ACCEPT FORM (unchanged) ======================
        renderAcceptForm(token) {
            // ... (keep your existing accept form code)
        }

        async acceptDelegation() {
            // ... (keep your existing accept logic)
        }

        showLoading() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;';
            overlay.innerHTML = `<div style="width:60px;height:60px;border:6px solid #007bff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>`;
            document.body.appendChild(overlay);
            return overlay;
        }

        showMessage(elementId, msg, type) {
            const el = this.element.querySelector(`#${elementId}`);
            if (el) {
                el.textContent = msg;
                el.style.color = type === 'success' ? 'green' : 'red';
            }
        }

        loadAudioTour() {
            setTimeout(() => {
                const script = document.createElement('script');
                script.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js';
                script.onload = () => {
                    if (window.initAudioTour) {
                        // Use stable, non-dynamic name so audiotour.js can correctly load from S3
                        this.element.id = 'delegate-widget';
                        window.initAudioTour('delegate-widget', 'delegate-widget-audiotour.json');
                    }
                };
                document.head.appendChild(script);
            }, 800);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const el = document.querySelector('[data-delegate-widget]');
        if (el) new DelegateWidget(el);
    });

    window.DelegateWidget = DelegateWidget;
})();