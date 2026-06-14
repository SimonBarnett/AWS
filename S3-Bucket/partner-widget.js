// partner-widget.js
// Self-contained JavaScript widget for partner onboarding and sites management with international dial code support
// Hosted on S3 and included via <script> tag on partner websites
// Interacts with:
// /login/generate-onboarding-token
// /api-keys/add-role/validate-onboarding-token
// /login/myurls
// /login/buyurl endpoints
//
// NOTE: Role/permission logic now uses local JWT decoding (no longer calls deprecated /login/claims)
// Log storage for debugging
const logs = [];
// Utility function to add logs for debugging
function addLog(message, data = {}) {
    const logEntry = `[PartnerWidget] ${new Date().toISOString()} - ${message} ${JSON.stringify(data, null, 2)}`;
    logs.push(logEntry);
    if (logs.length > 100) logs.shift(); // Limit to 100 logs
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
// Load intl-tel-input script if not already loaded
function loadIntlTelInputScript() {
    if (window.intlTelInput) {
        return Promise.resolve();
    }
    if (document.querySelector('script[src*="intl-tel-input"]')) {
        return new Promise((resolve) => {
            const existingScript = document.querySelector('script[src*="intl-tel-input"]');
            existingScript.addEventListener('load', resolve);
        });
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/intlTelInput.min.js';
        script.onload = () => {
            addLog('intl-tel-input script loaded successfully');
            resolve();
        };
        script.onerror = (error) => {
            addLog('Error loading intl-tel-input script', { error: error.message });
            reject(error);
        };
        document.head.appendChild(script);
    });
}
// Load intl-tel-input CSS if not already loaded
function loadIntlTelInputCSS() {
    if (document.querySelector('link[href*="intl-tel-input"]')) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/css/intlTelInput.css';
        link.onload = () => {
            addLog('intl-tel-input CSS loaded successfully');
            resolve();
        };
        document.head.appendChild(link);
    });
}
// Load utils script for intl-tel-input
function loadIntlTelInputUtils() {
    if (window.intlTelInputUtils) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js';
        script.onload = () => {
            addLog('intl-tel-input utils loaded successfully');
            resolve();
        };
        script.onerror = (error) => {
            addLog('Error loading intl-tel-input utils', { error: error.message });
            reject(error);
        };
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
async function checkUrlResponse(url) {
    try {
        const response = await fetch(url, { method: 'GET', mode: 'no-cors' });
        // With no-cors, we can't access status, but if it doesn't throw, assume reachable
        addLog('URL GET check succeeded (no-cors mode)', { url });
        return true;
    } catch (error) {
        addLog('URL GET check failed', { url, error: error.message });
        return false;
    }
}
// Main widget class
class PartnerWidget {
    constructor(element) {
        this.element = element;
        this.apiEndpoint = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com';
        this.token = localStorage.getItem('authToken');
        this.userRoles = [];
        this.hasRequiredRole = false; // Tracks if user has 'partner' or 'admin'
        this.isAdminOrOwner = false;
        this.isPartnerOnly = false;
        this.myUrls = []; // To store myurls data
        this.blindReviews = []; // To store buyurl data
        this.iti = null; // To store the intlTelInput instance
        this.init();
    }
    async init() {
        addLog('Initializing PartnerWidget');
        await Promise.all([loadIntlTelInputScript(), loadIntlTelInputCSS(), loadIntlTelInputUtils()]);
        if (this.token && isTokenValid(this.token)) {
            await this.fetchUserRoles();
            if (this.hasRequiredRole) {
                await this.fetchMyUrls();
                if (this.isPartnerOnly) {
                    await this.fetchBuyUrls();
                }
            }
        } else {
            addLog('No valid token found');
        }
        this.render();
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

            this.isAdminOrOwner = this.userRoles.includes('admin') || 
                                  this.userRoles.includes('owner');

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
    async fetchMyUrls() {
        try {
            const response = await fetch(`${this.apiEndpoint}/prod/login/myurls`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    this.myUrls = data.urls || [];
                    addLog('My URLs fetched', { urlsCount: this.myUrls.length, myUrls: this.myUrls });
                } else {
                    addLog('Error in myurls response', { status: data.status });
                }
            } else {
                addLog('Failed to fetch myurls', { status: response.status });
            }
        } catch (error) {
            addLog('Error fetching myurls', { error: error.message });
        }
    }
    async fetchBuyUrls() {
        try {
            const response = await fetch(`${this.apiEndpoint}/prod/login/buyurl`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    this.blindReviews = data.blind_reviews || [];
                    addLog('Buy URLs fetched', { reviewsCount: this.blindReviews.length, blindReviews: this.blindReviews });
                } else {
                    addLog('Error in buyurl response', { status: data.status });
                }
            } else {
                addLog('Failed to fetch buyurl', { status: response.status });
            }
        } catch (error) {
            addLog('Error fetching buyurl', { error: error.message });
        }
    }
    async purchaseUrl(url) {
        try {
            const response = await fetch(`${this.apiEndpoint}/prod/login/buyurl`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    addLog('URL purchased successfully', { url });
                    return true;
                } else {
                    addLog('Error in purchase response', { url, status: data.status });
                    return false;
                }
            } else {
                addLog('Failed to purchase URL', { url, status: response.status });
                return false;
            }
        } catch (error) {
            addLog('Error purchasing URL', { url, error: error.message });
            return false;
        }
    }
    render() {
        if (this.hasRequiredRole) {
            this.element.innerHTML = `
                <div style="border: 1px solid #ccc; padding: 20px; border-radius: 5px; max-width: 400px; margin: auto; background: #f9f9f9; position: relative;">
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        #confirmModal, #successModal {
                            display: none;
                            position: fixed;
                            z-index: 1001;
                            left: 0;
                            top: 0;
                            width: 100%;
                            height: 100%;
                            background-color: rgba(0,0,0,0.4);
                        }
                        #confirmModal .modal-content, #successModal .modal-content {
                            background-color: #fefefe;
                            margin: 15% auto;
                            padding: 20px;
                            border: 1px solid #888;
                            width: 80%;
                            max-width: 300px;
                            text-align: center;
                        }
                        #confirmModal button, #successModal button {
                            padding: 10px 20px;
                            margin: 10px;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                        }
                        #confirmYes {
                            background-color: #28a745;
                            color: white;
                        }
                        #confirmNo {
                            background-color: #dc3545;
                            color: white;
                        }
                        #successOk {
                            background-color: #28a745;
                            color: white;
                        }
                    </style>
                    <div class="toggle-container" style="display: flex; margin: 0 5px 20px 5px; width: calc(100% - 10px);">
                        <button id="toggle-invite" class="toggle-button active" style="flex: 1; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px 0 0 5px; cursor: pointer;">Invite</button>
                        <button id="toggle-sites" class="toggle-button" style="flex: 1; padding: 10px; background: #ccc; color: white; border: none; border-radius: 0 5px 5px 0; cursor: pointer;">Sites</button>
                    </div>
                    <div id="invite-content"></div>
                    <div id="sites-content" style="display: none;"></div>
                    <div id="widgetLoadingOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 1000;">
                        <div style="position: relative; width: 200px; height: 200px;">
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                        </div>
                    </div>
                    <div id="confirmModal">
                        <div class="modal-content">
                            <p>Are you sure you want to purchase this report for £99.99 + VAT?</p>
                            <button id="confirmYes">Yes</button>
                            <button id="confirmNo">No</button>
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
            const toggleInvite = this.element.querySelector('#toggle-invite');
            const toggleSites = this.element.querySelector('#toggle-sites');
            toggleInvite.addEventListener('click', async () => {
                this.currentView = 'invite';
                toggleInvite.style.backgroundColor = '#007bff';
                toggleSites.style.backgroundColor = '#ccc';
                this.element.querySelector('#sites-content').style.display = 'none';
                this.element.querySelector('#invite-content').style.display = 'block';
                const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
                loadingOverlay.style.display = 'flex';
                await this.fetchMyUrls();
                this.renderInviteForm();
                loadingOverlay.style.display = 'none';
            });
            toggleSites.addEventListener('click', async () => {
                this.currentView = 'sites';
                toggleSites.style.backgroundColor = '#007bff';
                toggleInvite.style.backgroundColor = '#ccc';
                this.element.querySelector('#invite-content').style.display = 'none';
                this.element.querySelector('#sites-content').style.display = 'block';
                const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
                loadingOverlay.style.display = 'flex';
                // Reload site list
                await this.fetchMyUrls();
                if (this.isPartnerOnly) {
                    await this.fetchBuyUrls();
                }
                this.renderSitesContent();
                loadingOverlay.style.display = 'none';
            });
            // Initial load with invite tab
            toggleInvite.click();
        } else {
            this.renderValidateTokenIntro();
        }
    }
    async downloadFile(url, type, iconElement) {
        const originalIconClass = type === 'json' ? 'fa-file-code' : 'fa-file-pdf';
        iconElement.classList.remove(originalIconClass);
        iconElement.classList.add('fa-spinner', 'fa-spin');
        try {
            const response = await fetch(`${this.apiEndpoint}/prod/login/myurls?url=${encodeURIComponent(url)}&type=${type}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                const contentDisposition = response.headers.get('Content-Disposition');
                const filename = contentDisposition ? contentDisposition.split('filename=')[1].replace(/"/g, '') : `report.${type}`;
               
                if (type === 'pdf') {
                    const base64 = await response.text();
                    const byteCharacters = atob(base64);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'application/pdf' });
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(blobUrl);
                } else if (type === 'json') {
                    const text = await response.text();
                    const blob = new Blob([text], { type: 'application/json' });
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(blobUrl);
                }
                addLog(`${type.toUpperCase()} file downloaded successfully`, { url });
            } else {
                addLog('Failed to download file', { url, type, status: response.status });
                alert(`Failed to download ${type.toUpperCase()} file. Please try again.`);
            }
        } catch (error) {
            addLog('Error downloading file', { url, type, error: error.message });
            alert(`An error occurred while downloading the ${type.toUpperCase()} file. Please try again.`);
        } finally {
            iconElement.classList.remove('fa-spinner', 'fa-spin');
            iconElement.classList.add(originalIconClass);
        }
    }
    renderSitesContent() {
        const sitesContent = this.element.querySelector('#sites-content');
        if (!sitesContent) return;
        addLog('Rendering sites content', { myUrls: this.myUrls, blindReviews: this.blindReviews });
        let html = `
            <h3 style="font-size: 1.5em; margin-bottom: 10px;">My Sites</h3>
            <ul style="list-style: none; padding: 0; margin-bottom: 20px;">
        `;
        if (this.myUrls.length > 0) {
            this.myUrls.forEach(site => {
                addLog('Processing my site', { site });
                const displayUrl = site.Url.replace(/^https?:\/\//i, '');
                html += `
                    <li style="padding: 10px; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; align-items: center;">
                        <span><i class="fas fa-link" style="margin-right: 5px; color: #007bff;"></i> ${displayUrl}</span>
                        <div>
                            <i class="fas fa-file-code download-link" data-url="${site.Url}" data-type="json" style="color: #007bff; cursor: pointer; margin-right: 10px;" title="Download JSON"></i>
                            <i class="fas fa-file-pdf download-link" data-url="${site.Url}" data-type="pdf" style="color: #ff0000; cursor: pointer;" title="Download PDF"></i>
                        </div>
                    </li>
                `;
            });
        } else {
            html += `<li style="padding: 10px; color: #666;">No sites found.</li>`;
        }
        html += `</ul>`;
        if (this.isPartnerOnly) {
            html += `
                <h3 style="font-size: 1.5em; margin-bottom: 10px;">Available Sites to Buy</h3>
                <ul style="list-style: none; padding: 0;">
            `;
            if (this.blindReviews.length > 0) {
                this.blindReviews.forEach(review => {
                    addLog('Processing blind review', { review });
                    html += `
                        <li style="padding: 10px; border-bottom: 1px solid #ccc;">
                            <div style="margin-bottom: 5px;">${review.blind_review || 'No description'}</div>
                            <div style="text-align: right;">
                                <button class="purchase-btn" data-url="${review.url}" style="padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">Buy (£99.99 + VAT)</button>
                            </div>
                        </li>
                    `;
                });
            } else {
                html += `<li style="padding: 10px; color: #666;">No available sites to buy.</li>`;
            }
            html += `</ul>`;
        }
        sitesContent.innerHTML = html;
        // Add event listeners for purchase buttons
        const purchaseButtons = sitesContent.querySelectorAll('.purchase-btn');
        purchaseButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.dataset.url;
                this.showConfirmModal(url);
            });
        });
        // Add event listeners for download icons
        const downloadLinks = sitesContent.querySelectorAll('.download-link');
        downloadLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const url = e.target.dataset.url;
                const type = e.target.dataset.type;
                this.downloadFile(url, type, e.target);
            });
        });
    }
    showConfirmModal(url) {
        const modal = this.element.querySelector('#confirmModal');
        modal.style.display = 'block';
        const yesBtn = modal.querySelector('#confirmYes');
        const noBtn = modal.querySelector('#confirmNo');
        yesBtn.onclick = async () => {
            modal.style.display = 'none';
            const loadingOverlay = this.element.querySelector('#widgetLoadingOverlay');
            loadingOverlay.style.display = 'flex';
            const success = await this.purchaseUrl(url);
            loadingOverlay.style.display = 'none';
            if (success) {
                // Refresh the lists after purchase
                await this.fetchMyUrls();
                await this.fetchBuyUrls();
                this.renderSitesContent();
            } else {
                alert('Failed to purchase the URL. Please try again.');
            }
        };
        noBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }
    showSuccessModal() {
        const modal = this.element.querySelector('#successModal');
        modal.style.display = 'block';
        const okBtn = modal.querySelector('#successOk');
        okBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }
    renderInviteForm() {
        const inviteContent = this.element.querySelector('#invite-content');
        if (!inviteContent) return;
        addLog('Rendering invite form', { myUrls: this.myUrls });
        inviteContent.innerHTML = `
            <h3 style="font-size: 1.5em; margin-bottom: 10px;">Invite a New User</h3>
            <p style="margin-bottom: 15px;">Please select the role, and provide the email and Mobile number of the new user. We'll send them a token that's valid for 48 hours to join us.</p>
            <form id="generateTokenForm">
                <style>
                    .madeira-signup-options {
                        display: flex;
                        justify-content: space-around;
                        margin-bottom: 20px;
                    }
                    .madeira-signup-option {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 7.5px;
                        cursor: pointer;
                        border: 2.25px solid transparent;
                        padding: 7.5px;
                        transition: border-color 0.3s;
                    }
                    .madeira-signup-option input {
                        display: none;
                    }
                    .icon-wrapper {
                        width: 60px;
                        height: 60px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .madeira-signup-option i {
                        font-size: 45px;
                        display: inline-block;
                        color: #007bff;
                    }
                    .role-shield {
                        background-color: #ffcc00;
                        color: #000;
                        padding: 3.75px 7.5px;
                        border-radius: 3.75px;
                        font-weight: bold;
                        font-size: 10.5px;
                        margin-top: 7.5px;
                        min-width: 75px;
                        text-align: center;
                    }
                    .madeira-signup-option.selected {
                        border-color: #007bff;
                    }
                    .madeira-signup-option.selected .icon-wrapper {
                        animation: pulse 1.5s infinite ease-in-out;
                    }
                    @keyframes pulse {
                        0% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); }
                        50% { box-shadow: 0 0 0 22.5px rgba(0, 123, 255, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); }
                    }
                    .fa-icon {
                        color: #007bff;
                    }
                    #url-container, #site-container {
                        margin-bottom: 15px;
                        display: none;
                    }
                    #url-loading {
                        display: none;
                        margin-left: 10px;
                    }
                </style>
                <div class="madeira-signup-options">
                    ${this.getRoleOptionsHTML()}
                </div>
                <div id="url-container">
                    <label for="url" style="display: block; margin-bottom: 5px;">URL:</label>
                    <input type="url" id="url" name="url" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    <span id="url-error" style="color: red; display: none;"></span>
                    <span id="url-loading" class="fa fa-spinner fa-spin"></span>
                </div>
                <div id="site-container">
                    <label for="site" style="display: block; margin-bottom: 5px;">Select Site:</label>
                    <select id="site" name="site" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                        <option value="">Select a site</option>
                        ${this.myUrls.map(site => `<option value="${site.Url}">${site.Url}</option>`).join('')}
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
                    <div style="display: block;">
                        <input type="tel" id="mobile" name="mobile" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; margin-top: 5px;">
                    </div>
                    <span id="mobile-error" style="color: red; display: none;"></span>
                </div>
                <button type="submit" id="generateTokenButton" disabled style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">Generate Token</button>
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
        if (mobileInput) {
            this.iti = window.intlTelInput(mobileInput, {
                initialCountry: 'gb',
                utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js'
            });
            addLog('intl-tel-input initialized successfully', { iti: this.iti });
            if (this.iti) {
                addLog('iti instance created', { isUtilsLoaded: typeof window.intlTelInputUtils, isValidNumberAvailable: typeof this.iti.isValidNumber });
            } else {
                addLog('Failed to create iti instance');
            }
            mobileInput.style.paddingLeft = '60px'; // Ensure text starts after the dial code
            addLog('intl-tel-input initialized');
        } else {
            addLog('Failed to initialize intl-tel-input', { intlTelInputAvailable: typeof window.intlTelInput, MobileInputExists: !!mobileInput });
        }
        const emailInput = inviteContent.querySelector('#email');
        const urlInput = inviteContent.querySelector('#url');
        const urlError = inviteContent.querySelector('#url-error');
        const urlLoading = inviteContent.querySelector('#url-loading');
        const generateTokenButton = inviteContent.querySelector('#generateTokenButton');
        let isUrlResponseValid = false;
        if (urlInput) {
            urlInput.addEventListener('blur', async () => {
                const url = urlInput.value;
                if (isValidURL(url)) {
                    urlLoading.style.display = 'inline-block';
                    isUrlResponseValid = await checkUrlResponse(url);
                    urlLoading.style.display = 'none';
                    if (!isUrlResponseValid) {
                        urlError.textContent = 'URL did not respond with 200 OK';
                        urlError.style.display = 'block';
                    } else {
                        urlError.style.display = 'none';
                    }
                } else {
                    isUrlResponseValid = false;
                    urlError.textContent = 'Invalid URL format';
                    urlError.style.display = 'block';
                }
                validateForm();
            });
        }
        const validateForm = () => {
            const tokenType = inviteContent.querySelector('input[name="signup_type"]:checked')?.value || '';
            const email = emailInput.value;
            const isEmailValid = isValidEmail(email);
            let isMobileValid = false;
            let validationError = 'iti not initialized';
            let selectedCountryData = null;
            let number = mobileInput.value;
            let e164Number = '';
            let errorMessage = '';
            if (this.iti) {
                if (!window.intlTelInputUtils) {
                    errorMessage = 'Utils loading...';
                    isMobileValid = false;
                } else {
                    isMobileValid = this.iti.isValidNumber();
                    validationError = this.iti.getValidationError();
                    selectedCountryData = this.iti.getSelectedCountryData();
                    e164Number = this.iti.getNumber();
                    number = mobileInput.value;
                }
            }
            let isUrlValid = true;
            const isUrlRequired = tokenType === 'community' || (tokenType === 'partner' && !this.isAdminOrOwner);
            if (isUrlRequired) {
                isUrlValid = !!urlInput.value && isValidURL(urlInput.value) && isUrlResponseValid;
            } else if (urlInput.value) {
                isUrlValid = isValidURL(urlInput.value) && isUrlResponseValid;
            }
            if (urlError) {
                urlError.textContent = isUrlValid ? '' : (urlInput.value ? (isValidURL(urlInput.value) ? 'URL did not respond with 200 OK' : 'Invalid URL') : 'URL is required');
                urlError.style.display = isUrlValid ? 'none' : 'block';
            }
            let isSiteValid = true;
            if (tokenType === 'merchant' && this.isPartnerOnly) {
                const site = inviteContent.querySelector('#site').value;
                isSiteValid = !!site;
                inviteContent.querySelector('#site-error').textContent = isSiteValid ? '' : 'Please select a site';
                inviteContent.querySelector('#site-error').style.display = isSiteValid ? 'none' : 'block';
            }
            const isFormValid = isEmailValid && isMobileValid && isUrlValid && isSiteValid;
            addLog('Mobile validation debug', {
                inputValue: number,
                e164Number: e164Number,
                isValid: isMobileValid,
                validationErrorCode: validationError,
                errorMessage: window.intlTelInputUtils ? window.intlTelInputUtils.getValidationError(validationError, selectedCountryData) : errorMessage,
                selectedCountry: selectedCountryData,
                utilsLoaded: typeof window.intlTelInputUtils !== 'undefined'
            });
            inviteContent.querySelector('#email-error').textContent = isEmailValid ? '' : 'Invalid email address';
            inviteContent.querySelector('#email-error').style.display = isEmailValid ? 'none' : 'block';
            inviteContent.querySelector('#mobile-error').textContent = isMobileValid ? '' : (errorMessage || 'Invalid Mobile number');
            inviteContent.querySelector('#mobile-error').style.display = isMobileValid ? 'none' : 'block';
            generateTokenButton.disabled = !isFormValid;
        };
        emailInput.addEventListener('input', validateForm);
        mobileInput.addEventListener('input', () => {
            addLog('Mobile input changed', { value: mobileInput.value });
            validateForm();
        });
        mobileInput.addEventListener('countrychange', () => {
            addLog('Country changed', { country: this.iti ? this.iti.getSelectedCountryData() : 'iti not initialized' });
            validateForm();
        });
        inviteContent.querySelector('#site')?.addEventListener('change', validateForm);
        this.updateFormFields(inviteContent);
        validateForm();
        const generateForm = inviteContent.querySelector('#generateTokenForm');
        generateForm.addEventListener('submit', this.handleGenerateToken.bind(this));
    }
    getRoleOptionsHTML() {
        let options = '';
        if (this.isAdminOrOwner) {
            options += `
                <label class="madeira-signup-option selected" title="Community">
                    <input type="radio" name="signup_type" value="community" checked>
                    <div class="icon-wrapper">
                        <i class="fas fa-people-group fa-icon"></i>
                    </div>
                    <div class="role-shield">Community</div>
                </label>
                <label class="madeira-signup-option" title="Merchant">
                    <input type="radio" name="signup_type" value="merchant">
                    <div class="icon-wrapper">
                        <i class="fas fa-user-tie fa-icon"></i>
                    </div>
                    <div class="role-shield">Merchant</div>
                </label>
                <label class="madeira-signup-option" title="Partner">
                    <input type="radio" name="signup_type" value="partner">
                    <div class="icon-wrapper">
                        <i class="fas fa-handshake fa-icon"></i>
                    </div>
                    <div class="role-shield">Partner</div>
                </label>
            `;
        } else {
            options += `
                <label class="madeira-signup-option selected" title="Merchant">
                    <input type="radio" name="signup_type" value="merchant" checked>
                    <div class="icon-wrapper">
                        <i class="fas fa-user-tie fa-icon"></i>
                    </div>
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
        showValidateFormButton.addEventListener('click', () => this.showValidateTokenToS());
    }
    async showValidateTokenToS() {
        const tosUrl = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/partner_tos.txt';
        try {
            const response = await fetch(tosUrl);
            if (!response.ok) throw new Error(`Failed to load Terms of Service: HTTP ${response.status}`);
            const tosText = await response.text();
            this.element.innerHTML = `
                <style>
                    #tos-wrapper {
                        position: relative;
                        max-width: 400px;
                        margin: 20px auto;
                        padding: 20px;
                        border: 1px solid #ccc;
                        border-radius: 5px;
                        background-color: #f9f9f9;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        box-sizing: border-box;
                    }
                    #tos-container {
                        text-align: left;
                    }
                    #tos-content {
                        max-height: 300px;
                        overflow-y: auto;
                        border: 1px solid #ddd;
                        padding: 10px;
                        margin-bottom: 15px;
                        font-size: 14px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        background-color: #ffffff;
                    }
                    #tos-agree-container {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 15px;
                    }
                    #tos-agree-checkbox:disabled {
                        cursor: not-allowed;
                    }
                    #tos-button-container {
                        display: flex;
                        justify-content: flex-end;
                    }
                    #tos-proceed-button {
                        background-color: #007bff;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        transition: background-color 0.3s;
                    }
                    #tos-proceed-button:hover:not(:disabled) {
                        background-color: #0056b3;
                    }
                    #tos-proceed-button:disabled {
                        background-color: #ccc;
                        cursor: not-allowed;
                    }
                    #loadingOverlay {
                        display: none;
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(255, 255, 255, 0.8);
                        justify-content: center;
                        align-items: center;
                        z-index: 10;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .fa-icon {
                        color: #007bff;
                    }
                </style>
                <div id="tos-wrapper">
                    <div id="tos-container">
                        <h2 style="text-align: center;">Terms of Service</h2>
                        <div id="tos-content">${tosText}</div>
                        <div id="tos-agree-container">
                            <input type="checkbox" id="tos-agree-checkbox" disabled>
                            <label for="tos-agree-checkbox">I agree to the Terms of Service</label>
                        </div>
                        <div id="tos-button-container">
                            <button id="tos-proceed-button" disabled><i class="fas fa-arrow-right fa-icon" style="margin-right: 5px;"></i> Proceed</button>
                        </div>
                    </div>
                    <div id="loadingOverlay">
                        <div style="position: relative; width: 200px; height: 200px;">
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                            <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
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
                if (tosCheckbox.checked) {
                    this.renderValidateTokenForm();
                }
            });
        } catch (error) {
            addLog('ToS fetch error', { error: error.message });
            this.showMessage('validateTokenMessage', 'Failed to load Terms of Service. Please try again.', 'error');
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
                    <button type="submit" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                        Validate
                    </button>
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
        const email = emailInput.value;
        let mobile = '';
        if (this.iti) {
            mobile = this.iti.getNumber();
            addLog('Generating token with mobile', { rawInput: mobileInput.value, formattedMobile: mobile });
        } else {
            mobile = mobileInput.value; // Fallback if library fails to load
            addLog('Generating token with fallback mobile (iti not available)', { mobile });
        }
        const tokenType = form.querySelector('input[name="signup_type"]:checked').value;
        const url = (tokenType === 'community' || tokenType === 'partner') ? urlInput.value : '';
        const communityId = (tokenType === 'merchant' && this.isPartnerOnly) ? siteSelect.value : '';
        if (!isValidEmail(email) || !mobile || !tokenType) {
            this.showMessage('generateTokenMessage', 'Please enter a valid email, mobile number, and select a role', 'error');
            generateTokenButton.disabled = false;
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
        }
        if (tokenType === 'community' && !isValidURL(url)) {
            this.showMessage('generateTokenMessage', 'Please enter a valid URL for community', 'error');
            generateTokenButton.disabled = false;
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
        }
        if (tokenType === 'partner' && !this.isAdminOrOwner && !isValidURL(url)) {
            this.showMessage('generateTokenMessage', 'Please enter a valid URL for partner', 'error');
            generateTokenButton.disabled = false;
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
        }
        if (tokenType === 'partner' && this.isAdminOrOwner && url && !isValidURL(url)) {
            this.showMessage('generateTokenMessage', 'Invalid URL format for partner (optional)', 'error');
            generateTokenButton.disabled = false;
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
        }
        if (tokenType === 'merchant' && this.isPartnerOnly && !communityId) {
            this.showMessage('generateTokenMessage', 'Please select a site for the merchant', 'error');
            generateTokenButton.disabled = false;
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
        }
        const body = { email, mobile, tokenType };
        if (url) body.url = url;
        if (communityId) body.communityId = communityId;
        try {
            const response = await fetch(`${this.apiEndpoint}/prod/login/generate-onboarding-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (data.status === 'success') {
                this.showSuccessModal();
                // Reset form
                emailInput.value = '';
                if (urlInput) urlInput.value = '';
                if (siteSelect) siteSelect.value = '';
                if (this.iti) {
                    this.iti.setNumber('');
                } else {
                    mobileInput.value = '';
                }
                // Reset role to default
                const defaultOption = this.element.querySelector('.madeira-signup-option.selected') || this.element.querySelector('.madeira-signup-option');
                const options = this.element.querySelectorAll('.madeira-signup-option');
                options.forEach(opt => opt.classList.remove('selected'));
                defaultOption.classList.add('selected');
                defaultOption.querySelector('input').checked = true;
                this.updateFormFields();
                // Re-validate form
                const validateForm = () => {}; // Placeholder, actual in render
            } else {
                this.showMessage('generateTokenMessage', data.error_message || 'Oops, something went wrong generating the token.', 'error');
            }
        } catch (error) {
            this.showMessage('generateTokenMessage', 'An error occurred. Please try again later.', 'error');
            addLog('Error generating token', { error: error.message });
        } finally {
            generateTokenButton.disabled = false;
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }
    async handleValidateToken(event) {
        event.preventDefault();
        const form = event.target;
        const token = form.querySelector('#token').value.trim();
        const pin = form.querySelector('#pin').value.trim();
   
        // Validate input
        if (!token || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
            this.showMessage('validateTokenMessage', 'Please provide a valid token and a 6-digit PIN', 'error');
            return;
        }
   
        try {
            const response = await fetch(`${this.apiEndpoint}/prod/api-keys/add-role/validate-onboarding-token`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token || ''}`
                },
                body: JSON.stringify({ token, pin })
            });
            const data = await response.json();
   
            if (data.status === 'success') {
                // Store the new token in local storage
                localStorage.setItem('authToken', data.token);
                // Update the internal token
                this.token = data.token;
                // Fetch updated roles with the new token
                await this.fetchUserRoles();
                // Re-render the widget to reflect the new role
                this.render();
            } else {
                this.showMessage('validateTokenMessage', data.error_message || 'Sorry, that token or PIN didn’t work.', 'error');
            }
        } catch (error) {
            this.showMessage('validateTokenMessage', 'An error occurred. Please try again later.', 'error');
            addLog('Error validating token', { error: error.message });
        }
    }
    showMessage(elementId, message, type) {
        const messageElement = this.element.querySelector(`#${elementId}`);
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.style.color = type === 'success' ? 'green' : 'red';
        } else {
            // Fallback to ensure message is displayed
            const messageDiv = document.createElement('div');
            messageDiv.id = elementId;
            messageDiv.style.textAlign = 'center';
            messageDiv.style.marginTop = '10px';
            messageDiv.textContent = message;
            messageDiv.style.color = type === 'success' ? 'green' : 'red';
            this.element.appendChild(messageDiv);
        }
    }
}
// Initialize widget on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const widgetElement = document.querySelector('[data-partner-widget]');
    if (widgetElement) {
        new PartnerWidget(widgetElement);
    } else {
        addLog('Partner widget element not found. Please add <div data-partner-widget></div> to your HTML.');
    }
});