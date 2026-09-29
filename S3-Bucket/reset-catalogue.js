// ====================== reset-catalogue.js ======================
// Self-contained Reset Catalogue Widget
// Updated to use the unified /ui/reset route (action=initiate + action=confirm)
// Follows the same pattern as gdpr-delete.js
// FULL AND UNABRIDGED — Structure and logic preserved + updated for new backend

(function () {
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
        document.head.appendChild(faLink);
    }

    class ResetCatalogueWidget {
        constructor(element) {
            this.element = element;
            this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod';
            this.token = localStorage.getItem('authToken');
            this.render();
            this.loadAudioTour();
        }

        render() {
            this.element.innerHTML = `
                <div style="max-width:420px;margin:0 auto;padding:20px;background:#fff;border:1px solid #ddd;border-radius:8px;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px;">
                        <h3 style="margin:0; color:#dc3545; flex:1;">Reset Catalogue</h3>
                        <div class="audiotour-placement" style="display:inline-flex; align-items:center;"></div>
                    </div>

                    <p style="color:#555;">
                        This feature will begin the onboarding process, rescanning the website and creating the catalogue from scratch. 
                        It removes all existing parts and categories and may take up to 24 hours to complete.
                    </p>
                    
                    <button id="resetBtn" 
                            style="width:100%; padding:12px; background:#dc3545; color:white; border:none; border-radius:6px; font-size:16px; cursor:pointer;">
                        <i class="fas fa-redo"></i> Reset Catalogue
                    </button>

                    <div id="resetSection" style="display:none; margin-top:20px;">
                        <label>Enter the OTP sent to your phone</label>
                        <input type="text" id="otp" maxlength="6" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; margin:10px 0;">
                        
                        <div style="display:flex; gap:10px; margin-top:10px;">
                            <button id="confirmReset" disabled 
                                    style="flex:1; padding:10px; background:#dc3545; color:white; border:none; border-radius:6px;">
                                Confirm Reset
                            </button>
                            <button id="cancelReset" 
                                    style="flex:1; padding:10px; background:#6c757d; color:white; border:none; border-radius:6px;">
                                Cancel
                            </button>
                        </div>
                    </div>
                    <div id="resetMessage" style="margin-top:15px; text-align:center;"></div>
                </div>
            `;

            this.element.querySelector('#resetBtn').addEventListener('click', () => this.initiateReset());
        }

        async initiateReset() {
            const overlay = this.showLoading();
            try {
                const res = await fetch(`${this.apiEndpoint}/ui/reset`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ action: 'initiate' })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    this.element.querySelector('#resetBtn').style.display = 'none';
                    this.element.querySelector('#resetSection').style.display = 'block';

                    const otpInput = this.element.querySelector('#otp');
                    const confirmBtn = this.element.querySelector('#confirmReset');

                    otpInput.addEventListener('input', () => {
                        confirmBtn.disabled = otpInput.value.length !== 6;
                    });

                    this.element.querySelector('#cancelReset').onclick = () => location.reload();
                    confirmBtn.onclick = () => this.confirmReset(otpInput.value);
                } else {
                    this.showMessage(data.error_message || 'Failed to start catalogue reset', 'error');
                }
            } catch (err) {
                this.showMessage('An error occurred. Please try again.', 'error');
            } finally {
                overlay.remove();
            }
        }

        async confirmReset(otp) {
            const overlay = this.showLoading();
            try {
                const res = await fetch(`${this.apiEndpoint}/ui/reset`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ 
                        action: 'confirm', 
                        otp: otp 
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    this.showMessage('Catalogue has been reset successfully.', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } else {
                    this.showMessage(data.error_message || 'Reset failed', 'error');
                }
            } catch (err) {
                this.showMessage('An error occurred. Please try again.', 'error');
            } finally {
                overlay.remove();
            }
        }

        showLoading() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;';
            overlay.innerHTML = `<div style="width:60px;height:60px;border:6px solid #dc3545;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>`;
            document.body.appendChild(overlay);
            return overlay;
        }

        showMessage(msg, type) {
            const el = this.element.querySelector('#resetMessage');
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
                        this.element.id = 'reset-catalogue';
                        window.initAudioTour('reset-catalogue', 'reset-catalogue-audiotour.json');
                    }
                };
                document.head.appendChild(script);
            }, 1200);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const el = document.querySelector('[data-reset-catalogue]');
        if (el) new ResetCatalogueWidget(el);
    });

    window.ResetCatalogueWidget = ResetCatalogueWidget;
})();