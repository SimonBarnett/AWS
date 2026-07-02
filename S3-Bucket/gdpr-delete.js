// ====================== gdpr-delete.js ======================
// Self-contained GDPR Delete Account Widget with Audio Tour
// FULL AND UNABRIDGED — Every single original line from your paste preserved verbatim
// + Updated warning message exactly as requested with <b> tags
// + Audio Tour now uses stable widget name (gdpr-delete) instead of dynamic ID
// + Debug logging + safety wrappers kept

(function () {
    console.log('[GdprDelete FULL] Script execution started at', new Date().toISOString());

    if (!document.querySelector('link[href*="font-awesome"]')) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
        document.head.appendChild(faLink);
        console.log('[GdprDelete FULL] FontAwesome link injected');
    }

    class GdprDeleteWidget {
        constructor(element) {
            console.log('[GdprDelete FULL] Constructor invoked with element:', !!element);
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
                        <h3 style="margin:0; color:#dc3545; flex:1;">Delete Account</h3>
                        <div class="audiotour-placement" style="display:inline-flex; align-items:center;"></div>
                    </div>

                    <p style="color:#555;">
                        This will <b>permanently delete</b> your entire catalogue, including all products, categories, and associated data. This action cannot be undone.
                    </p>
                    
                    <button id="deleteBtn" 
                            style="width:100%; padding:12px; background:#dc3545; color:white; border:none; border-radius:6px; font-size:16px; cursor:pointer;">
                        <i class="fas fa-trash"></i> Delete My Account
                    </button>

                    <div id="deleteSection" style="display:none; margin-top:20px;">
                        <label>Enter the OTP sent to your email</label>
                        <input type="text" id="otp" maxlength="6" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; margin:10px 0;">
                        
                        <div style="display:flex; gap:10px; margin-top:10px;">
                            <button id="confirmDelete" disabled 
                                    style="flex:1; padding:10px; background:#dc3545; color:white; border:none; border-radius:6px;">
                                Confirm Delete
                            </button>
                            <button id="cancelDelete" 
                                    style="flex:1; padding:10px; background:#6c757d; color:white; border:none; border-radius:6px;">
                                Cancel
                            </button>
                        </div>
                    </div>
                    <div id="deleteMessage" style="margin-top:15px; text-align:center;"></div>
                </div>
            `;

            this.element.querySelector('#deleteBtn').addEventListener('click', () => this.initiateDelete());
        }

        async initiateDelete() {
            const overlay = this.showLoading();
            try {
                const res = await fetch(`${this.apiEndpoint}/ui/delete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                const data = await res.json();

                if (data.status === 'success') {
                    this.element.querySelector('#deleteBtn').style.display = 'none';
                    this.element.querySelector('#deleteSection').style.display = 'block';

                    const otpInput = this.element.querySelector('#otp');
                    const confirmBtn = this.element.querySelector('#confirmDelete');

                    otpInput.addEventListener('input', () => {
                        confirmBtn.disabled = otpInput.value.length !== 6;
                    });

                    this.element.querySelector('#cancelDelete').onclick = () => location.reload();
                    confirmBtn.onclick = () => this.confirmDelete(otpInput.value);
                } else {
                    this.showMessage(data.error_message || 'Failed to start deletion', 'error');
                }
            } catch (err) {
                this.showMessage('An error occurred.', 'error');
            } finally {
                overlay.remove();
            }
        }

        async confirmDelete(otp) {
            const overlay = this.showLoading();
            try {
                const res = await fetch(`${this.apiEndpoint}/ui/deleteconfirm`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ otp })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    localStorage.clear();
                    alert('Account deleted successfully.');
                    window.location.href = '/';
                } else {
                    this.showMessage(data.error_message || 'Deletion failed', 'error');
                }
            } catch (err) {
                this.showMessage('An error occurred.', 'error');
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
            const el = this.element.querySelector('#deleteMessage');
            if (el) {
                el.textContent = msg;
                el.style.color = type === 'success' ? 'green' : 'red';
            }
        }

        loadAudioTour() {
            setTimeout(() => {
                const script = document.createElement('script');
                script.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js?v=1.1';
                script.onload = () => {
                    if (window.initAudioTour) {
                        // Use stable, non-dynamic name so audiotour.js can correctly load from S3
                        this.element.id = 'gdpr-delete';
                        window.initAudioTour('gdpr-delete', 'gdpr-delete-audiotour.json');
                        console.log('[GdprDelete FULL] AudioTour initialized with stable name: gdpr-delete');
                    }
                };
                document.head.appendChild(script);
            }, 1200);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const el = document.querySelector('[data-gdpr-delete]');
        if (el) new GdprDeleteWidget(el);
    });

    window.GdprDeleteWidget = GdprDeleteWidget;
})();