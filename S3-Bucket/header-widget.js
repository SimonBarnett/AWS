// ====================== header-widget.js ======================
// Self-contained JavaScript widget for header navigation
// Compatible with AWS Lambda authentication API
// Includes FontAwesome for icons, PWA support, and SVG sprite injection
//
// FULL AND UNABRIDGED VERSION
//
// Partner site CSS (page.css) now has FULL control:
//   - header background + foreground
//   - mobile menu background
//   - selected item background
//   - selected item ICON colour   ← this now works correctly
//
// Your page.css (recommended):
//   header { background-color: #508738; color: white; }
//   .menu-item.selected .menu-link { background-color: rgba(255,255,255,0.18); font-weight: 600; }
//   .menu-item.selected .menu-icon { color: #fc0404; }   /* ← your chosen icon colour */

if (!document.querySelector('link[href*="font-awesome"]')) {
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
    document.head.appendChild(faLink);
}

// Utility Functions
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
    if (!token) {
        console.log('No token provided for validation');
        return false;
    }
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
        console.log('Invalid token or no expiration:', decoded);
        return false;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    const isValid = decoded.exp > currentTime;
    console.log('Token validity check:', { isValid, expiresAt: decoded.exp, currentTime });
    return isValid;
}

// Overlay Management
const overlay = document.createElement('div');
overlay.id = 'loadingOverlay';
overlay.style.position = 'fixed';
overlay.style.top = '0';
overlay.style.left = '0';
overlay.style.width = '100vw';
overlay.style.height = '100vh';
overlay.style.background = 'rgba(255, 255, 255, 0.8)';
overlay.style.display = 'flex';
overlay.style.justifyContent = 'center';
overlay.style.alignItems = 'center';
overlay.style.zIndex = '9999';
overlay.innerHTML = `
    <div style="position: relative; width: 200px; height: 200px;">
        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px; animation-delay: 0s;"></div>
        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
    </div>
`;

if (document.body) {
    document.body.appendChild(overlay);
} else {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));
}

// Wait for Font Awesome to Load
function loadFontAwesome() {
    return new Promise((resolve, reject) => {
        const faLink = document.querySelector('link[href*="font-awesome"]');
        if (faLink && faLink.sheet) resolve();
        else if (faLink) {
            faLink.onload = resolve;
            faLink.onerror = reject;
        } else reject(new Error('Font Awesome link not found'));
    });
}

// Wait for DOM and Resources
const domReady = new Promise(resolve => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') resolve();
    else document.addEventListener('DOMContentLoaded', resolve);
});

const windowLoad = new Promise(resolve => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
});

// Hide Overlay and Update Header
Promise.all([domReady, loadFontAwesome(), document.fonts.ready, windowLoad]).then(() => {
    console.log('All resources loaded, preparing to update header');
    const updateHeader = () => {
        if (window.headerElement) {
            console.log('Header element found');
            requestAnimationFrame(() => {
                setTimeout(() => {
                    overlay.style.display = 'none';
                    const computedStyle = getComputedStyle(window.headerElement);
                    console.log('Computed background-color:', computedStyle.backgroundColor);
                }, 300);
            });
        } else {
            console.log('Header element not found, retrying...');
            setTimeout(updateHeader, 100);
        }
    };
    updateHeader();
}).catch(error => {
    console.error('Error loading resources:', error);
    overlay.style.display = 'none';
    if (window.headerElement) {
        const computedStyle = getComputedStyle(window.headerElement);
        console.log('Computed background-color (error fallback):', computedStyle.backgroundColor);
    }
});

// HeaderWidget Class
class HeaderWidget {
    constructor(element) {
        this.element = element;
        this.pageName = element.dataset.pageName || 'Dashboard';
        const requireTokenAttr = element.getAttribute('data-requireToken');
        this.requireToken = requireTokenAttr && requireTokenAttr.trim().toLowerCase() === 'true';
        console.log('data-requireToken raw value:', requireTokenAttr);
        console.log('data-requireToken trimmed:', requireTokenAttr ? requireTokenAttr.trim() : null);
        console.log('requireToken parsed as:', this.requireToken);

        this.menuItems = []; // will be populated in init() from JSON or default
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop();
        this.currentMenuItem = null; // will be set after menuItems loaded
        this.logoIcon = element.dataset.icon || 'fas fa-home';
        this.installPromptEvent = null;

        this.addPwaMetaTags();
        this.registerServiceWorker();
        this.setupInstallPrompt();
        this.injectStyles();
        this.init();
    }

    // ==================== AUDIO MUTE FUNCTIONALITY ====================
    isAudioMuted() {
        return localStorage.getItem('audioMuted') === 'true';
    }

    setAudioMuted(muted) {
        localStorage.setItem('audioMuted', muted ? 'true' : 'false');
    }

    toggleAudioMute() {
        const newState = !this.isAudioMuted();
        this.setAudioMuted(newState);
        this.updateMuteButton();
    }

    updateMuteButton() {
        const muteBtn = this.element.querySelector('.mute-button');
        if (!muteBtn) return;

        const isMuted = this.isAudioMuted();

        if (isMuted) {
            muteBtn.classList.remove('fa-volume-up');
            muteBtn.classList.add('fa-volume-mute');
            muteBtn.style.color = '#ff5252';
        } else {
            muteBtn.classList.remove('fa-volume-mute');
            muteBtn.classList.add('fa-volume-up');
            muteBtn.style.color = '';
        }
    }

    // ==================== PWA DETECTION ====================
    // Hardened against false-positives on normal mobile browser tabs.
    // Explicit display-mode: browser forces "not PWA" so Install App remains available for installation.
    isRunningAsPWA() {
        // Explicit browser mode → definitely not running as installed PWA
        // This guards against any false-positive standalone reports on mobile browsers
        if (window.matchMedia('(display-mode: browser)').matches) {
            console.log('[HeaderWidget] display-mode: browser → not PWA');
            return false;
        }

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
        const isMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;
        const isIOSStandalone = (window.navigator.standalone === true);
        const isAndroidTWA = (typeof document.referrer === 'string' && document.referrer.startsWith('android-app://'));

        const result = isStandalone || isIOSStandalone || isFullscreen || isMinimalUI || isAndroidTWA;

        console.log('[HeaderWidget] PWA detection details:', {
            isStandalone,
            isFullscreen,
            isMinimalUI,
            isIOSStandalone,
            isAndroidTWA,
            result,
            userAgent: navigator.userAgent.substring(0, 80)
        });

        return result;
    }

    injectStyles() {
        console.log('[HeaderWidget] injectStyles() called');

        // === FORCE FRESH INJECTION ===
        const existing = document.getElementById('header-widget-styles');
        if (existing) {
            console.log('[HeaderWidget] Old #header-widget-styles found — REMOVING it to force fresh styles');
            existing.remove();
        } else {
            console.log('[HeaderWidget] No existing #header-widget-styles tag found');
        }

        const style = document.createElement('style');
        style.id = 'header-widget-styles';

        // Version stamp visible in DevTools
        const versionStamp = `/* HEADER-WIDGET STYLES v2.10 — PWA detection hardened (display-mode:browser first) — injected at ${new Date().toISOString()} */`;

        style.innerHTML = `
            ${versionStamp}

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            /* ========== FIXED HEADER ========== */
            header {
                position: fixed !important;
                top: 0;
                left: 0;
                width: 100%;
                z-index: 9998;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }

            .logo i,
            .logo-text,
            .menu-link,
            .mute-button {
                color: inherit !important;
            }

            .menu-icon {
                color: inherit;
            }

            .menu-list.show .menu-link,
            .menu-list.show .menu-text,
            .menu-list.show .hamburger,
            .menu-list.show .menu-item {
                color: inherit !important;
            }

            header nav {
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: relative;
            }

            .logo {
                display: flex;
                align-items: center;
                font-size: 1.35rem;
                font-weight: 600;
                white-space: nowrap;
            }

            .logo i {
                font-size: 1.6rem;
                margin-right: 10px;
            }

            .logo-text {
                display: inline-block;
            }

            .menu-group {
                display: flex;
                align-items: center;
                gap: 8px;
                position: relative;
            }

            .menu-list {
                display: flex;
                align-items: center;
                gap: 8px;
                list-style: none;
                margin: 0;
                padding: 0;
                flex-wrap: nowrap;
            }

            .menu-item {
                position: relative;
            }

            .menu-link {
                text-decoration: none;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border-radius: 6px;
                transition: background-color 0.15s ease, color 0.15s ease;
                white-space: nowrap;
            }

            /* ========== DESKTOP HOVER — icon hover only (all background hover rules removed) ========== */
            .menu-link:hover .menu-icon {
                transform: scale(1.25) !important;
                transition: transform 0.2s ease;
            }

            .menu-icon {
                font-size: 1.35rem;
                transition: transform 0.2s ease, color 0.2s ease;
            }

            .menu-text {
                display: none;
                font-size: 0.95rem;
            }

            .menu-item.selected .menu-link {
                font-weight: 600;
            }

            .hamburger {
                font-size: 1.7rem;
                cursor: pointer;
                padding: 8px 12px;
                color: inherit;
                display: none !important;
            }

            /* Desktop styles */
            @media (min-width: 1200px) {
                .hamburger {
                    display: none !important;
                }
                .menu-list {
                    display: flex !important;
                }
                .menu-link {
                    white-space: nowrap;
                    padding: 8px 6px;
                }
                .menu-item.selected .menu-link {
                    font-weight: 600;
                }
            }

            /* Mobile / Tablet styles — REDUCED VERTICAL SPACING BETWEEN ITEMS (mobile hover background rule removed) */
            @media (max-width: 1199px) {
                .hamburger {
                    display: block !important;
                }
                .menu-list {
                    display: none;
                    flex-direction: column;
                    position: absolute;
                    top: calc(100% + 10px);
                    right: 0;
                    background-color: inherit !important;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
                    padding: 4px 0;
                    min-width: 250px;
                    z-index: 9999;
                }
                .menu-list.show {
                    display: flex !important;
                }
                .menu-item {
                    width: 100%;
                }
                .menu-link {
                    text-decoration: none;
                    padding: 8px 16px !important;
                    display: flex;
                    align-items: center;
                    gap: 8px !important;
                    width: 100%;
                    white-space: nowrap;
                    color: inherit !important;
                    justify-content: flex-end !important;
                    flex-direction: row-reverse !important;
                }
                .menu-icon {
                    font-size: 1.5rem;
                    margin-left: 6px !important;
                }
                .menu-item.selected .menu-link {
                    font-weight: 600;
                }
                .menu-text {
                    display: block !important;
                    color: inherit !important;
                }
            }

            /* Circular Mute Button */
            .mute-button-wrapper {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 34px;
                height: 34px;
                background-color: rgba(255,255,255,0.15);
                border-radius: 50%;
                cursor: pointer;
                transition: background-color 0.2s ease, transform 0.2s ease;
                flex-shrink: 0;
                margin-right: 8px;
            }
            .mute-button-wrapper:hover {
                background-color: rgba(255,255,255,0.25);
                transform: scale(1.08);
            }
            .mute-button {
                font-size: 1.15rem;
            }

            .mute-button.fa-volume-mute {
                color: #ff5252 !important;
            }

            /* Hover Help Tooltip — background synced to partner header */
            .menu-hint {
                position: absolute;
                display: flex;
                align-items: center;
                background-color: rgba(0, 0, 0, 0.85);
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 0.85rem;
                white-space: nowrap;
                visibility: hidden;
                z-index: 10000;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                color: #fff;
            }
            .menu-hint.visible {
                visibility: visible;
            }
            .menu-hint .click-icon {
                margin-right: 6px;
                font-size: 1.1rem;
            }
        `;

        document.head.appendChild(style);

        console.log('[HeaderWidget] Fresh styles injected successfully');
        console.log('[HeaderWidget] Critical rule check:');
        console.log('  All hover background color rules removed (desktop + mobile)');
    }

    addPwaMetaTags() {
        console.log('Adding PWA meta tags');

        if (!document.querySelector('link[rel="manifest"]')) {
            const manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            manifestLink.href = '/manifest.json';
            document.head.appendChild(manifestLink);
        }

        if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
            const metaAppleCapable = document.createElement('meta');
            metaAppleCapable.name = 'mobile-web-app-capable';
            metaAppleCapable.content = 'yes';
            document.head.appendChild(metaAppleCapable);
        }

        if (!document.querySelector('meta[name="mobile-web-app-status-bar-style"]')) {
            const metaAppleStatus = document.createElement('meta');
            metaAppleStatus.name = 'apple-mobile-web-app-status-bar-style';
            metaAppleStatus.content = 'black';
            document.head.appendChild(metaAppleStatus);
        }

        if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
            const metaAppleCapable = document.createElement('meta');
            metaAppleCapable.name = 'apple-mobile-web-app-capable';
            metaAppleCapable.content = 'yes';
            document.head.appendChild(metaAppleCapable);
        }

        if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
            const metaAppleTitle = document.createElement('meta');
            metaAppleTitle.name = 'apple-mobile-web-app-title';
            metaAppleTitle.content = 'Club Madeira';
            document.head.appendChild(metaAppleTitle);
        }

        if (!document.querySelector('link[rel="apple-touch-icon"]')) {
            const appleIconLink = document.createElement('link');
            appleIconLink.rel = 'apple-touch-icon';
            appleIconLink.href = '/images/icon-192.png';
            document.head.appendChild(appleIconLink);
        }

        if (!document.querySelector('meta[name="theme-color"]')) {
            const metaTheme = document.createElement('meta');
            metaTheme.name = 'theme-color';
            metaTheme.content = '#000000';
            document.head.appendChild(metaTheme);
        }
    }

    registerServiceWorker() {
        console.log('Registering service worker');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered:', reg))
                .catch(err => console.error('Service Worker registration failed:', err));
        } else {
            console.warn('Service Worker not supported in this browser');
        }
    }

    setupInstallPrompt() {
        console.log('Setting up install prompt listeners');
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('beforeinstallprompt event fired');
            e.preventDefault();
            this.installPromptEvent = e;
        });

        window.addEventListener('appinstalled', () => {
            console.log('App was installed');
            this.installPromptEvent = null;
            const installItem = this.element.querySelector('.install-item');
            if (installItem) {
                installItem.style.display = 'none';
            }
        });
    }

    injectSvgSprite() {
        if (!document.getElementById('custom-icons-sprite')) {
            const sprite = document.createElement('svg');
            sprite.id = 'custom-icons-sprite';
            sprite.style.display = 'none';
            sprite.setAttribute('aria-hidden', 'true');
            sprite.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            sprite.innerHTML = `
                <symbol id="magento-icon" viewBox="-2 0 24 24">
                    <path fill="currentColor" d="m17.7 19.368v-11.568l-7.5-4.632-7.5 4.632v11.568l-2.7-1.668v-11.4l10.2-6.3 10.2 6.3v11.4zm-9 1.306 1.5.926 1.5-.926v-13.412l3.3 2.038v11.735l-4.8 2.965-4.8-2.965v-11.735l3.3-2.038z"/>
                    <path fill="currentColor" d="m17.7 7.8-7.5-4.632-7.5 4.632v.009l-2.7-1.509 10.2-6.3 10.2 6.3-2.7 1.509zm-2.7 1.52-3.3 1.844v-3.902l3.3 2.038zm-6.3 1.844-3.3-1.846v-.018l3.3-2.038z"/>
                </symbol>
                <symbol id="bigcommerce-icon" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12.645 13.663h3.027c.861 0 1.406-.474 1.406-1.235 0-.717-.545-1.234-1.406-1.234h-3.027c-.1 0-.187.086-.187.172v2.125c.015.1.086.172.187.172zm0 4.896h3.128c.961 0 1.535-.488 1.535-1.35 0-.746-.545-1.35-1.535-1.35h-3.128c-.1 0-.187.087-.187.173v2.34c.015.115.086.187.187.187zM23.72.053l-8.953 8.93h1.464c2.281 0 3.63 1.435 3.63 3 0 1.235-.832 2.14-1.722 2.541-.143.058-.143.259.014.316 1.033.402 1.765 1.48 1.765 2.742 0 1.78-1.19 3.202-3.5 3.202h-6.342c-.1 0-.187-.086-.187-.172V13.85L.062 23.64c-.13.13-.043.359.143.359h23.631a.16.16 0 0 0 .158-.158V.182c.043-.158-.158-.244-.273-.13z"/>
                </symbol>
            `;
            document.body.appendChild(sprite);
            console.log('SVG sprite injected');
        } else {
            console.log('SVG sprite already exists');
        }
    }

    async init() {
        console.log('Initializing HeaderWidget');
        console.log('requireToken:', this.requireToken);

        this.injectSvgSprite();

        this.isPWA = this.isRunningAsPWA();
        console.log('Running as PWA:', this.isPWA);

        let config = {
            loginUrl: '/login.html',
            affiliateCode: ''
        };
        try {
            console.log('Fetching config from /index.json');
            const configResponse = await fetch('/index.json');
            if (!configResponse.ok) {
                throw new Error(`Failed to fetch index.json: ${configResponse.status} ${configResponse.statusText}`);
            }
            config = await configResponse.json();
            console.log('Config loaded:', config);
        } catch (error) {
            console.error('Error fetching index.json, using defaults:', error.message);
        }

        this.loginUrl = config.loginUrl || '/login.html';
        this.affiliateCode = config.affiliateCode || '';
        console.log('Login URL:', this.loginUrl);
        console.log('Affiliate Code:', this.affiliateCode);

        const token = localStorage.getItem('authToken');
        console.log('Auth token:', token ? 'Present' : 'Absent');

        if (token && isTokenValid(token)) {
            this.isAuthenticated = true;

            try {
                const decoded = decodeToken(token);
                this.userRoles = decoded?.permissions || [];
                console.log('User roles from JWT:', this.userRoles);
            } catch (error) {
                console.error('Error decoding token for roles:', error.message);
                this.userRoles = [];
            }

        } else {
            this.isAuthenticated = false;
            this.userRoles = ['notoken'];
            if (this.requireToken) {
                console.log('requireToken is true and no valid token, redirecting to login');
                localStorage.removeItem('authToken');
                localStorage.removeItem('user_id');
                localStorage.removeItem('contact_name');
                window.location.href = this.loginUrl;
                return;
            }
        }

        // ========== FULL DEFAULT MENU (used if /menu-config.json missing or invalid) ==========
        const defaultMenuItems = [
            { name: 'Home', icon: 'fas fa-home', href: '/index.html', roles: [] },
            { name: 'Clubs', icon: 'fas fa-users', href: '/madeira-clubs.html', roles: ['notoken'] },  
            { name: 'Merchants', icon: 'fas fa-user-tie', href: '/madeira-merchants.html', roles: ['notoken'] },  
            { name: 'Partners', icon: 'fas fa-handshake', href: '/madeira-partners.html', roles: ['notoken'] },  
            { name: 'Vouchers', icon: 'fas fa-ticket', href: '/madeira-vouchers.html', roles: ['notoken'] },  
            { name: 'Login', icon: 'fas fa-sign-in-alt', href: '/login.html', roles: ['notoken'] },            
            { name: 'Dashboard', icon: 'fas fa-chart-bar', href: '/dashboard.html', roles: ['self'] },
            { name: 'Smart Catalogue', icon: 'fas fa-robot', href: '/category.html', roles: ['community'] },
            { name: 'Embed Code', icon: 'fas fa-layer-group', href: '/catalog.html', roles: ['community'] },
            { name: 'API Keys', icon: 'fas fa-key', href: '/apikey.html', roles: ['self'] },
            { name: 'My Parts', icon: 'fas fa-box-open', href: '/parts.html', roles: ['merchant'] },     
            { name: 'Profile', icon: 'fas fa-images', href: '/partner.html', roles: ['partner'] },                               
            { name: 'Clubs', icon: 'fas fa-handshake', href: '/clubs.html', roles: ['partner','admin'] },            
            { name: 'Account', icon: 'fas fa-user-gear', href: '/delegate.html', roles: ['community'] },
            { name: 'Install App', icon: 'fas fa-mobile-alt', action: 'install', roles: [] },
            { name: 'Logout', icon: 'fas fa-sign-out-alt', href: '/login.html', roles: ['self'] }
        ];

        // ========== LOAD FROM PARTNER SITE JSON (FULLY EXTERNAL) ==========
        this.menuItems = defaultMenuItems; // start with full default
        try {
            console.log('Fetching menu config from /menu-config.json (partner site)');
            const menuResponse = await fetch('/menu-config.json');
            if (menuResponse.ok) {
                const menuData = await menuResponse.json();
                if (menuData.menuItems && Array.isArray(menuData.menuItems) && menuData.menuItems.length > 0) {
                    this.menuItems = menuData.menuItems;
                    console.log('Successfully loaded custom menuItems from /menu-config.json on partner site. Count:', this.menuItems.length);
                } else {
                    console.warn('/menu-config.json loaded but did not contain a valid non-empty menuItems array — using built-in default (full list preserved)');
                }
            } else {
                console.log('/menu-config.json not found or failed to load (HTTP ' + menuResponse.status + ') on partner site — using full built-in default menuItems');
            }
        } catch (error) {
            console.error('Error fetching /menu-config.json from partner site, falling back to full built-in default:', error.message);
        }

        // Re-apply the Smart Catalogue dynamic href (if needed)
        this.menuItems = this.menuItems.map(item => {
            if (item.name === 'Smart Catalogue') {
                return {
                    ...item,
                    href: `/category.html`
                };
            }
            return item;
        });

        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop();
        this.currentMenuItem = this.menuItems.find(item => item.href && item.href.split('/').pop() === currentPage);
        if (this.currentMenuItem && this.currentMenuItem.icon) {
            this.logoIcon = this.currentMenuItem.icon;
        }

        this.render();
    }

    render() {
        console.log('Rendering header');
        const currentPath = window.location.pathname;

        const menuHTML = this.menuItems
            .filter(item => {
                if (item.roles.length === 0) return true;
                if (item.roles.includes('notoken')) return !this.isAuthenticated;
                if (item.roles.includes('self')) return this.isAuthenticated;
                return this.isAuthenticated && item.roles.some(role => this.userRoles.includes(role));
            })
            .map(item => {
                if (item.action === 'install' && this.isPWA) {
                    return '';
                }

                if (item.action === 'install') {
                    return `<li class="menu-item install-item"><a href="#" class="menu-link" data-name="${item.name}"><span class="menu-text">${item.name}</span><i class="${item.icon} menu-icon"></i></a></li>`;
                }
                const isSelected = item.href.split('?')[0] === currentPath;
                return `<li class="menu-item${isSelected ? ' selected' : ''}"><a href="${item.href}" class="menu-link" data-name="${item.name}"><span class="menu-text">${item.name}</span><i class="${item.icon} menu-icon"></i></a></li>`;
            })
            .join('');

        const headerHTML = `        
            <header>
                <nav>
                    <div class="logo">
                        <i class="${this.logoIcon}"></i>
                        <span class="logo-text">${this.pageName}</span>
                    </div>
                    <div class="menu-group">
                        <ul class="menu-list">${menuHTML}</ul>
                        
                        <div class="mute-button-wrapper" style="margin-right: 8px;">
                            <i class="fas fa-volume-up mute-button"></i>
                        </div>
                        
                        <i class="fas fa-bars hamburger"></i>
                    </div>
                    <div class="menu-hint">
                        <i class="fas fa-hand-pointer click-icon"></i>
                        <span class="menu-name"></span>
                    </div>
                </nav>
            </header>
        `;

        this.element.innerHTML = headerHTML;
        this.header = this.element.querySelector('header');
        window.headerElement = this.header;

        // ========== NEW DIAGNOSTIC LOGS ==========
        if (this.header) {
            const cs = getComputedStyle(this.header);
            console.log('🔍 HEADER RENDERED — DIAGNOSTICS:');
            console.log('  tagName:', this.header.tagName);
            console.log('  id/class:', this.header.id, this.header.className);
            console.log('  position:', cs.position);
            console.log('  top:', cs.top);
            console.log('  z-index:', cs.zIndex);
            console.log('  display:', cs.display);
            console.log('  visibility:', cs.visibility);
            console.log('  height:', cs.height, 'offsetHeight:', this.header.offsetHeight);
            console.log('  width:', cs.width);
            console.log('  backgroundColor:', cs.backgroundColor);
            console.log('  color:', cs.color);
            console.log('  is in viewport?', this.header.getBoundingClientRect().top < window.innerHeight);
            console.log('  parent:', this.header.parentElement?.tagName, this.header.parentElement?.id);
        } else {
            console.error('❌ HEADER ELEMENT NOT FOUND after render!');
        }
        // =========================================

        // === EXTRA COMPUTED STYLE CHECKS FOR DEBUGGING ===
        setTimeout(() => {
            const firstLink = this.element.querySelector('.menu-link');
            if (firstLink) {
                const computed = getComputedStyle(firstLink);
                console.log('[HeaderWidget] COMPUTED gap on first .menu-link:', computed.gap);
                console.log('[HeaderWidget] COMPUTED padding on first .menu-link:', computed.padding);
            }
        }, 300);
        // =================================================

        const menuHint = this.element.querySelector('.menu-hint');
        const menuItems = this.element.querySelectorAll('.menu-item');
        const hamburger = this.element.querySelector('.hamburger');
        const menuList = this.element.querySelector('.menu-list');
        const nav = this.element.querySelector('nav');
        const muteBtn = this.element.querySelector('.mute-button');

        if (!nav) {
            console.error('Nav element not found');
            return;
        }

        // ========== EXTRA GLOBAL HOVER LOGGING FOR DEBUG ==========
        this.header.addEventListener('mouseenter', (e) => {
            const target = e.target;
            if (target.classList.contains('menu-link') || target.closest('.menu-link')) {
                const link = target.classList.contains('menu-link') ? target : target.closest('.menu-link');
                const computedBg = getComputedStyle(link).backgroundColor;
                console.log('[HeaderWidget] GLOBAL HOVER on menu-link (text hover area):', link.dataset.name || 'unknown');
                console.log('[HeaderWidget] Computed backgroundColor:', computedBg);
            } else {
                console.log('[HeaderWidget] GLOBAL HOVER on non-menu-link element:', target.tagName, target.className || target.id);
            }
        }, true);
        // =========================================================

        hamburger.addEventListener('click', () => {
            console.log('Hamburger clicked - toggling menu');
            menuList.classList.toggle('show');
            if (menuList.classList.contains('show')) {
                const headerBg = getComputedStyle(this.header).backgroundColor;
                menuList.style.setProperty('background-color', headerBg, 'important');
                console.log('🚀 MOBILE MENU SYNCED ON TOGGLE - headerBg:', headerBg, 'menuList now has:', getComputedStyle(menuList).backgroundColor);
                
                const firstLink = menuList.querySelector('.menu-link');
                if (firstLink) {
                    console.log('🔍 FIRST MENU LINK COLOUR:', getComputedStyle(firstLink).color);
                    console.log('🔍 FIRST MENU TEXT COLOUR:', getComputedStyle(firstLink.querySelector('.menu-text') || firstLink).color);
                }
                
                const selectedLink = this.element.querySelector('.menu-item.selected .menu-link');
                if (selectedLink) {
                    console.log('🔍 SELECTED ITEM BACKGROUND (partner respected?):', getComputedStyle(selectedLink).backgroundColor);
                    console.log('🔍 SELECTED ITEM ICON COLOUR (partner respected?):', getComputedStyle(selectedLink.querySelector('.menu-icon') || selectedLink).color);
                }
            } else {
                console.log('Mobile menu closed');
            }
        });

        document.addEventListener('click', (e) => {
            if (!menuList.contains(e.target) && !hamburger.contains(e.target)) {
                menuList.classList.remove('show');
            }
        });

        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.toggleAudioMute();
            });

            muteBtn.parentElement.addEventListener('mouseenter', () => {
                const isMuted = this.isAudioMuted();
                menuHint.querySelector('.menu-name').textContent = isMuted ? 'Unmute Audio' : 'Mute Audio';
                menuHint.classList.add('visible');
            });

            muteBtn.parentElement.addEventListener('mouseleave', () => {
                menuHint.classList.remove('visible');
            });
        }

        this.updateMuteButton();

        menuItems.forEach(item => {
            const link = item.querySelector('.menu-link');
            if (!link) return;

            const name = link.dataset.name;

            if (name === 'Install App') {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (this.installPromptEvent) {
                        this.installPromptEvent.prompt();
                        this.installPromptEvent.userChoice.then(() => {
                            this.installPromptEvent = null;
                        });
                    } else {
                        if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
                            alert('To install this app, tap the Share icon in your browser and select "Add to Home Screen".');
                        } else {
                            alert('Installation is not supported on this browser or the app is already installed.');
                        }
                    }
                });
            } else if (link.href && link.href !== '#') {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    menuList.classList.remove('show');
                    overlay.style.display = 'flex';
                    requestAnimationFrame(() => {
                        window.location.href = link.href;
                    });
                });
            }

            // ========== HOVER DEBUG LOGGING (TEXT HOVER AREA) + MENU HINT BACKGROUND SYNC ==========
            link.addEventListener('mouseenter', () => {
                const computedBg = getComputedStyle(link).backgroundColor;
                console.log('[HeaderWidget] HOVER triggered on TEXT area:', name);
                console.log('[HeaderWidget] Computed backgroundColor on text hover:', computedBg);

                // Sync menu hint background to partner header background
                if (this.header && menuHint) {
                    const headerBg = getComputedStyle(this.header).backgroundColor;
                    menuHint.style.backgroundColor = headerBg;
                    menuHint.style.color = '#fff';
                }
            });
            // ========================================

            link.addEventListener('mouseenter', (event) => {
                menuHint.querySelector('.menu-name').textContent = name;
                menuHint.classList.add('visible');
                const menuRect = menuList.getBoundingClientRect();
                const navRect = nav.getBoundingClientRect();
                const topOffset = menuRect.bottom - navRect.top + 5;
                menuHint.style.top = `${topOffset}px`;
                const mouseX = event.pageX;
                const navLeft = navRect.left;
                const hintWidth = menuHint.offsetWidth;
                menuHint.style.left = `${mouseX - navLeft - hintWidth}px`;
            });

            link.addEventListener('mousemove', (moveEvent) => {
                const navRect = nav.getBoundingClientRect();
                const mouseX = moveEvent.pageX;
                const navLeft = navRect.left;
                const hintWidth = menuHint.offsetWidth;
                menuHint.style.left = `${mouseX - navLeft - hintWidth}px`;
            });

            link.addEventListener('mouseleave', () => {
                menuHint.classList.remove('visible');
            });
        });

        const logoutLink = this.element.querySelector('a[data-name="Logout"]');
        if (logoutLink) {
            logoutLink.addEventListener('click', (event) => {
                event.preventDefault();
                localStorage.removeItem('authToken');
                localStorage.removeItem('user_id');
                localStorage.removeItem('contact_name');
                menuList.classList.remove('show');
                overlay.style.display = 'flex';
                requestAnimationFrame(() => {
                    window.location.href = this.loginUrl;
                });
            });
        }

        // FINAL DEBUG
        setTimeout(() => {
            const selectedLink = this.element.querySelector('.menu-item.selected .menu-link');
            if (selectedLink) {
                console.log('🔍 SELECTED ITEM FINAL BACKGROUND (partner respected?):', getComputedStyle(selectedLink).backgroundColor);
                console.log('🔍 SELECTED ITEM ICON COLOUR (partner respected?):', getComputedStyle(selectedLink.querySelector('.menu-icon') || selectedLink).color);
            }
        }, 100);
    }
}

// Initialize Widgets on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, initializing widgets');
    document.querySelectorAll('[data-header-widget]').forEach(element => {
        new HeaderWidget(element);
    });
});