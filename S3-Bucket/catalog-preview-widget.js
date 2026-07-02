(function() {
    // Configuration
    const MADEIRA_SCRIPT_URL = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/madeira-widget.js';
    const CMS_PROVIDER_URL = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/cms-providers';
    const MARKED_CDN = 'https://cdn.jsdelivr.net/npm/marked@4.0.12/marked.min.js';
    const AUDIOTOUR_CDN = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js';

    // Stylesheet configurations
    const STYLESHEETS = [
        { name: 'Default', filename: 'madeira-widget.css' },
        { name: 'Dark', filename: 'madeira-dark.css' },
        { name: 'Transparent', filename: 'madeira-transp.css' }
    ];

    // Get the container
    const container = document.getElementById('catalog-preview-widget');
    if (!container) {
        console.error('Catalog Preview Widget: Container #catalog-preview-widget not found');
        return;
    }

    // Ensure container is full-width and flexible
    container.style.width = '100%';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.boxSizing = 'border-box';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.minHeight = '100%';

    // Check for user_id in localStorage
    const affiliateId = localStorage.getItem('user_id');
    if (!affiliateId) {
        container.innerHTML = `
            <div class="preview-error">
                <h2>Error</h2>
                <p>Sorry, we couldn't load the catalog preview. Please ensure you're logged in or contact support for assistance.</p>
            </div>
        `;
        console.error('user_id not found in localStorage');
        return;
    }

    // Check auth token
    function checkTokenAndRedirect() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('No auth token, redirecting to login');
            window.location.href = '/login.html';
            return false;
        }
        return true;
    }

    // Load marked.js for Markdown parsing
    const markedScript = document.createElement('script');
    markedScript.src = MARKED_CDN;
    markedScript.onload = () => console.log('Catalog Preview Widget: Loaded marked.js');
    markedScript.onerror = () => console.warn('Catalog Preview Widget: Failed to load marked.js');
    document.head.appendChild(markedScript);

    // Load Audio Tour script
    const audioTourScript = document.createElement('script');
    audioTourScript.src = AUDIOTOUR_CDN;
    audioTourScript.onload = () => console.log('Catalog Preview Widget: Loaded audiotour.js');
    audioTourScript.onerror = () => console.warn('Catalog Preview Widget: Failed to load audiotour.js');
    document.head.appendChild(audioTourScript);

    // Create widget HTML structure
    container.innerHTML = `
        <div class="preview-widget">
            <div class="config-section">
                <!-- Title + Audio Tour button directly after it -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                    <h2 style="margin: 0;">Catalogue Widget Setup</h2>
                    <div class="audiotour-placement"></div>
                </div>

                <div class="step">
                    <h3>Step 1: Choose Style</h3>
                    <div class="style-select-container">
                        <label for="style-select">Select Style:</label>
                        <select id="style-select"></select>
                    </div>
                    <div class="preview-section">
                        <h2>Preview</h2>
                        <iframe id="madeira-widget-iframe" class="madeira-preview"></iframe>
                    </div>
                </div>

                <div class="step">
                    <h3>Step 2: Copy HTML</h3>
                    <div class="script-container">
                        <textarea id="script-textarea" readonly></textarea>
                        <button id="copy-button" title="Copy to clipboard"><i class="fas fa-copy"></i> Copy</button>
                    </div>
                </div>

                <div class="step">
                    <h3>Step 3: Choose Provider Instructions</h3>
                    <div id="provider-radio-group" class="provider-radio-group"></div>
                    <div id="provider-error" class="error"></div>
                    <div id="instructions-content" class="instructions-content"></div>
                </div>
            </div>
        </div>
    `;

    // Add FontAwesome for icons
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
    faLink.onerror = () => console.warn('Catalog Preview Widget: Failed to load FontAwesome CSS');
    document.head.appendChild(faLink);

    // Widget elements
    const providerRadioGroup = document.getElementById('provider-radio-group');
    const providerError = document.getElementById('provider-error');
    const instructionsContent = document.getElementById('instructions-content');
    const copyButton = document.getElementById('copy-button');
    const scriptTextarea = document.getElementById('script-textarea');
    const styleSelect = document.getElementById('style-select');
    let cachedProviders = [];

    // Populate style select dropdown
    function populateStyleSelect() {
        styleSelect.innerHTML = '';
        STYLESHEETS.forEach(style => {
            const option = document.createElement('option');
            option.value = style.filename;
            option.textContent = style.name;
            styleSelect.appendChild(option);
        });
        updateScriptTag(STYLESHEETS[0].filename);
        updateIframe(STYLESHEETS[0].filename);
    }

    // Update script tag in textarea
    function updateScriptTag(cssFilename) {
        const scriptPath = MADEIRA_SCRIPT_URL.substring(0, MADEIRA_SCRIPT_URL.lastIndexOf('/') + 1);
        scriptTextarea.value = `<div id="madeira-container"></div><script data-affiliate="${affiliateId}" data-css="${cssFilename}" src="${MADEIRA_SCRIPT_URL}?v=1.0"></script>`;
    }

    // Update iframe with selected style
    function updateIframe(cssFilename) {
        const scriptPath = MADEIRA_SCRIPT_URL.substring(0, MADEIRA_SCRIPT_URL.lastIndexOf('/') + 1);
        const cssPath = `${scriptPath}${cssFilename}`;
        const iframe = document.getElementById('madeira-widget-iframe');
        iframe.srcdoc = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; overflow: hidden; }
                    #madeira-container { width: 100%; height: 100%; }
                </style>
                <link rel="stylesheet" href="${cssPath}">
            </head>
            <body>
                <div id="madeira-container"></div>
                <script data-affiliate="${affiliateId}" data-css="${cssFilename}" src="${MADEIRA_SCRIPT_URL}?v=1.0"></script>
            </body>
            </html>
        `;
    }

    // Input sanitization
    function sanitizeInput(input) {
        if (input == null) return '';
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    // Fetch handler
    async function handleFetch(url, options) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            return await response.text();
        } catch (error) {
            console.error('Catalog Preview Widget: Fetch error:', error);
            throw error;
        }
    }

    // Fetch CMS providers
    async function fetchProviders() {
        if (!checkTokenAndRedirect()) return;
        const token = localStorage.getItem('authToken');
        try {
            cachedProviders = await handleFetch(CMS_PROVIDER_URL, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            cachedProviders = JSON.parse(cachedProviders);
            if (!Array.isArray(cachedProviders) || cachedProviders.length === 0) {
                providerError.textContent = 'No providers available.';
                providerError.style.display = 'block';
                cachedProviders = [];
                instructionsContent.style.display = 'none';
            } else {
                providerError.style.display = 'none';
                renderProviderRadioGroup(cachedProviders);
            }
        } catch (error) {
            providerError.textContent = 'Failed to load providers.';
            providerError.style.display = 'block';
            cachedProviders = [];
            instructionsContent.style.display = 'none';
        }
    }

    // Render provider logos horizontally
    function renderProviderRadioGroup(providers) {
        providerRadioGroup.innerHTML = '';
        if (!providers || providers.length === 0) {
            providerRadioGroup.innerHTML = '<p>No providers available.</p>';
            instructionsContent.style.display = 'none';
            return;
        }
        providers.forEach((provider, index) => {
            if (!provider || !provider.Comment) return;
            const span = document.createElement('span');
            span.className = 'provider-logo';
            if (index === 0) span.classList.add('active');
            span.title = sanitizeInput(provider.Comment);
            const iconClass = sanitizeInput(provider.Icon || 'fas fa-cog');
            span.innerHTML = `<i class="${iconClass}"></i>`;
            span.style.cursor = 'pointer';
            providerRadioGroup.appendChild(span);
            span.addEventListener('click', () => {
                providerRadioGroup.querySelectorAll('.provider-logo').forEach(s => s.classList.remove('active'));
                span.classList.add('active');
                updateInstructions(provider.Comment);
            });
        });
    }

    // Update instructions
    async function updateInstructions(providerComment) {
        const provider = cachedProviders.find(p => p.Comment === providerComment);
        instructionsContent.innerHTML = '';
        if (!provider || !provider.docLinks) {
            instructionsContent.innerHTML = '<p>No instructions available.</p>';
            instructionsContent.style.display = 'block';
            adjustIframeHeight();
            return;
        }
        const readmeLink = provider.docLinks.find(link => link.Title === 'readme');
        if (readmeLink) {
            try {
                const markdown = await handleFetch(readmeLink.Link, {
                    method: 'GET',
                    headers: { 'Content-Type': 'text/plain' }
                });
                if (typeof marked === 'undefined') {
                    instructionsContent.innerHTML = '<p>Error: Markdown parser not loaded.</p>';
                } else {
                    instructionsContent.innerHTML = marked.parse(markdown);
                }
                instructionsContent.style.display = 'block';
            } catch (error) {
                instructionsContent.innerHTML = '<p>Failed to load instructions.</p>';
                instructionsContent.style.display = 'block';
            }
        } else {
            instructionsContent.innerHTML = '<p>No instructions available.</p>';
            instructionsContent.style.display = 'block';
        }
        adjustIframeHeight();
    }

    // Copy functionality
    copyButton.addEventListener('click', () => {
        scriptTextarea.select();
        try {
            document.execCommand('copy');
            copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
        } catch (err) {
            console.error('Catalog Preview Widget: Failed to copy:', err);
        }
    });

    // Style selection
    styleSelect.addEventListener('change', (event) => {
        const selectedFilename = event.target.value;
        updateScriptTag(selectedFilename);
        updateIframe(selectedFilename);
        adjustIframeHeight();
    });

    // Dynamically adjust iframe height
    function adjustIframeHeight() {
        const iframe = document.getElementById('madeira-widget-iframe');
        const configSection = document.querySelector('.config-section');
        const previewSection = document.querySelector('.preview-section');
        const previewHeader = previewSection.querySelector('h2');
        if (!iframe || !configSection || !previewSection || !previewHeader) return;

        const windowHeight = window.innerHeight;
        const header = document.querySelector('header');
        const footer = document.querySelector('footer');
        const headerHeight = header ? header.offsetHeight : 0;
        const footerHeight = footer ? footer.offsetHeight : 0;
        const configHeight = configSection.offsetHeight;
        const previewHeaderHeight = previewHeader.offsetHeight;
        const instructionsHeight = (instructionsContent && instructionsContent.style.display !== 'none') ? instructionsContent.offsetHeight : 0;
        const margins = 20;

        const availableHeight = windowHeight - headerHeight - footerHeight - configHeight - previewHeaderHeight - instructionsHeight - margins;
        iframe.style.height = `${Math.max(availableHeight, 300)}px`;
        iframe.style.width = '100%';
    }

    // Add inline CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .style-select-container {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }
        .provider-radio-group {
            display: flex;
            flex-direction: row;
            gap: 15px;
            align-items: center;
        }
        .provider-logo {
            cursor: pointer;
            padding: 5px;
        }
        .provider-logo i {
            font-size: 48px;
        }
        .provider-logo.active i {
            color: #4a90e2;
        }
        .preview-error, .error {
            color: #e0e0e0;
            background: #2a2a2a;
            padding: 10px;
            border-radius: 4px;
        }
        .script-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .script-container textarea {
            width: 100%;
            box-sizing: border-box;
        }
        .script-container button {
            align-self: flex-start;
        }
        .preview-section {
            width: 100%;
        }
        .madeira-preview {
            width: 100%;
            border: none;
        }
    `;
    document.head.appendChild(style);

    // Initialize Audio Tour
    function initAudioTourIfReady() {
        if (window.initAudioTour) {
            window.initAudioTour('catalog-preview-widget');
            console.log('Catalog Preview Widget: Audio Tour initialized');
        } else {
            setTimeout(() => {
                if (window.initAudioTour) {
                    window.initAudioTour('catalog-preview-widget');
                }
            }, 800);
        }
    }

    // Run on load and resize
    window.addEventListener('load', () => {
        populateStyleSelect();
        adjustIframeHeight();
        fetchProviders();
        initAudioTourIfReady();
    });

    window.addEventListener('resize', adjustIframeHeight);
})();