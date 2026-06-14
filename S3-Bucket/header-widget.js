// header-widget.js
// Self-contained JavaScript widget for header navigation
// Compatible with AWS Lambda authentication API
// Includes FontAwesome for icons, PWA support, and SVG sprite injection

// Load Font Awesome if not already loaded
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

        this.menuItems = [
            { name: 'Home', icon: 'fas fa-home', href: '/index.html', roles: [] },
            { name: 'Login', icon: 'fas fa-sign-in-alt', href: '/login.html', roles: ['notoken'] },            
            { name: 'Dashboard', icon: 'fas fa-chart-bar', href: '/dashboard.html', roles: ['self'] },
            { name: 'Account', icon: 'fas fa-user-gear', href: '/delegate.html', roles: ['community'] },
            { name: 'Smart Catalogue', icon: 'fas fa-robot', href: '/category.html', roles: ['community'] },
            { name: 'Embed Code', icon: 'fas fa-layer-group', href: '/catalog.html', roles: ['community'] },
            { name: 'API Keys', icon: 'fas fa-key', href: '/apikey.html', roles: ['self'] },
            { name: 'My Parts', icon: 'fas fa-box-open', href: '/parts.html', roles: ['merchant'] },                        
            { name: 'Partner', icon: 'fas fa-handshake', href: '/partner.html', roles: ['partner','admin'] },            
            { name: 'Install App', icon: 'fas fa-mobile-alt', action: 'install', roles: [] },
            { name: 'Logout', icon: 'fas fa-sign-out-alt', href: '/login.html', roles: ['self'] }
        ];
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop();
        this.currentMenuItem = this.menuItems.find(item => item.href && item.href.split('/').pop() === currentPage);
        this.logoIcon = element.dataset.icon || (this.currentMenuItem ? this.currentMenuItem.icon : 'fas fa-home');
        this.installPromptEvent = null;

        this.addPwaMetaTags();
        this.registerServiceWorker();
        this.setupInstallPrompt();
        this.injectStyles();
        this.init();
    }

    injectStyles() {
        if (!document.getElementById('header-widget-styles')) {
            const style = document.createElement('style');
            style.id = 'header-widget-styles';
            style.innerHTML = `
/* Define spin animation for overlay */
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
            `;
            document.head.appendChild(style);
            console.log('Header widget styles injected');
        } else {
            console.log('Header widget styles already exist');
        }
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

            // ✅ Claims fix: Read permissions directly from JWT instead of calling removed /login/claims endpoint
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

        this.menuItems = this.menuItems.map(item => {
            if (item.name === 'Smart Catalogue') {
                return {
                    ...item,
                    href: `/category.html`
                };
            }
            return item;
        });

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
                if (item.action === 'install') {
                    return `<li class="menu-item install-item"><a href="#" class="menu-link" data-name="${item.name}"><span class="menu-text">${item.name}</span><i class="${item.icon} menu-icon"></i></a></li>`;
                }
                const isSelected = item.href.split('?')[0] === currentPath;
                return `<li class="menu-item${isSelected ? ' selected' : ''}"><a href="${item.href}" class="menu-link" data-name="${item.name}"><span class="menu-text">${item.name}</span><i class="${item.icon} menu-icon"></i></a></li>`;
            })
            .join('');

        const headerHTML = `        
            <header>
                <div style="width: 95vw; position: fixed; top: 3; left: 3; bottom: 3; ">
                    <nav>
                        <div class="logo">
                            <i class="${this.logoIcon}"></i>
                            <span class="logo-text">${this.pageName}</span>
                        </div>
                        <div class="menu-group">
                            <ul class="menu-list">${menuHTML}</ul>
                            <i class="fas fa-bars hamburger"></i>
                        </div>
                        <div class="menu-hint">
                            <i class="fas fa-hand-pointer click-icon"></i>
                            <span class="menu-name"></span>
                        </div>
                    </nav>
                </div>
            </header>
        `;

        this.element.innerHTML = headerHTML;
        this.header = this.element.querySelector('header');
        window.headerElement = this.header;

        const menuHint = this.element.querySelector('.menu-hint');
        const menuItems = this.element.querySelectorAll('.menu-item');
        const hamburger = this.element.querySelector('.hamburger');
        const menuList = this.element.querySelector('.menu-list');
        const nav = this.element.querySelector('nav');

        if (!nav) {
            console.error('Nav element not found');
            return;
        }

        hamburger.addEventListener('click', () => {
            menuList.classList.toggle('show');
        });

        menuItems.forEach(item => {
            const link = item.querySelector('.menu-link');
            const name = link.dataset.name;

            if (name === 'Install App') {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    console.log('Install App clicked, installPromptEvent:', this.installPromptEvent);
                    if (this.installPromptEvent) {
                        console.log('Triggering install prompt');
                        this.installPromptEvent.prompt();
                        this.installPromptEvent.userChoice.then((choiceResult) => {
                            console.log('User choice:', choiceResult.outcome);
                            if (choiceResult.outcome === 'accepted') {
                                console.log('User accepted the install prompt');
                            } else {
                                console.log('User dismissed the install prompt');
                            }
                            this.installPromptEvent = null;
                        });
                    } else {
                        console.log('Install prompt not available');
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
                    console.log(`Navigating to ${link.href}`);
                    overlay.style.display = 'flex';
                    requestAnimationFrame(() => {
                        window.location.href = link.href;
                    });
                });
            }

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
                menuHint.querySelector('.menu-name').textContent = '';
                menuHint.classList.remove('visible');
            });
        });

        const logoutLink = this.element.querySelector('a[data-name="Logout"]');
        if (logoutLink) {
            logoutLink.addEventListener('click', (event) => {
                event.preventDefault();
                console.log('Logout clicked');
                localStorage.removeItem('authToken');
                localStorage.removeItem('user_id');
                localStorage.removeItem('contact_name');
                overlay.style.display = 'flex';
                requestAnimationFrame(() => {
                    window.location.href = this.loginUrl;
                });
            });
        }
    }
}

// Initialize Widgets on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, initializing widgets');
    document.querySelectorAll('[data-header-widget]').forEach(element => {
        new HeaderWidget(element);
    });
});