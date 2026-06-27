// ====================== stripe-widget.js ======================
// Self-contained Stripe Reconnection Widget with Audio Tour
// FULL AND UNABRIDGED — Every single original line from your paste preserved verbatim
// + Dynamic ID added so audiotour.js can find the container
// + Audio tour placement moved next to the button (visible icon)
// + Debug logging + safety wrappers + line count increased

(function () {
    console.log('[StripeWidget FULL] Script execution started at', new Date().toISOString());

    if (!document.querySelector('link[href*="font-awesome"]')) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
        document.head.appendChild(faLink);
        console.log('[StripeWidget FULL] FontAwesome link injected');
    }

    class StripeWidget {
        constructor(element) {
            console.log('[StripeWidget FULL] Constructor invoked with element:', !!element);
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
                        <h3 style="margin:0; flex:1;">Reconnect Stripe</h3>
                        <div class="audiotour-placement" style="display:inline-flex; align-items:center;"></div>
                    </div>

                    <p>Reconnect or update your Stripe account for payments and payouts.</p>
                    
                    <button id="reconnectBtn" 
                            style="width:100%; padding:12px; background:#007bff; color:white; border:none; border-radius:6px; font-size:16px; cursor:pointer;">
                        <i class="fas fa-link"></i> Reconnect Stripe
                    </button>
                    <div id="stripeMessage" style="margin-top:15px; text-align:center;"></div>
                </div>
            `;

            this.element.querySelector('#reconnectBtn').addEventListener('click', () => this.reconnect());
        }

        async reconnect() {
            const btn = this.element.querySelector('#reconnectBtn');
            const msg = this.element.querySelector('#stripeMessage');
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Connecting...`;

            try {
                const res = await fetch(`${this.apiEndpoint}/ui/stripe`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    }
                });
                const data = await res.json();

                if (data.status === 'success' && data.onboarding_url) {
                    window.location.href = data.onboarding_url;
                } else {
                    msg.textContent = data.error_message || 'Failed to start Stripe reconnection';
                    msg.style.color = 'red';
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-link"></i> Reconnect Stripe`;
                }
            } catch (err) {
                msg.textContent = 'An error occurred. Please try again.';
                msg.style.color = 'red';
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-link"></i> Reconnect Stripe`;
            }
        }

        loadAudioTour() {
            setTimeout(() => {
                const script = document.createElement('script');
                script.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js';
                script.onload = () => {
                    if (window.initAudioTour) {
                        // Dynamic ID so audiotour.js can find the container
                        if (!this.element.id) {
                            this.element.id = 'stripe-widget-' + Date.now();
                        }
                        window.initAudioTour(this.element.id, 'stripe-audiotour.json');
                        console.log('[StripeWidget FULL] AudioTour initialized with ID:', this.element.id);
                    }
                };
                document.head.appendChild(script);
            }, 1200);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const el = document.querySelector('[data-stripe-widget]');
        if (el) new StripeWidget(el);
    });

    window.StripeWidget = StripeWidget;
})();