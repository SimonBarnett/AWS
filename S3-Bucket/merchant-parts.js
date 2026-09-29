(function() {
    // **Configuration**
    const API_URL = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/merchant-parts';
    const DEFAULT_PAGE_LEN = 50;
    const PAGE_LEN_OPTIONS = [10, 25, 50, 100];
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 1000;
    const SCRIPT_URL = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/tagTracker.js';

    // **State Variables**
    let currentPage = 1;
    let pageLen = DEFAULT_PAGE_LEN;
    let totalRecords = 0;
    let totalPages = 1;
    let isLoading = false;
    let token = '';
    let userId = '';

    // **Get the Current Script Element**
    const script = document.currentScript;

    // **Determine Parent Element**
    let parentElement = script.parentElement;
    if (parentElement === document.body) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.bottom = '0';
        wrapper.style.overflow = 'hidden';
        document.body.appendChild(wrapper);
        parentElement = wrapper;
    }

    // **Retrieve and Validate Authentication Token from Local Storage**
    function getAuthToken() {
        return localStorage.getItem('authToken');
    }

    function validateToken() {
        const token = getAuthToken();
        if (!token) {
            console.error('[merchant-parts.js] No token present in localStorage');
            return false;
        }
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime > payload.exp) {
                console.error('[merchant-parts.js] Token expired');
                return false;
            }
            userId = payload.user_id;
            return true;
        } catch (error) {
            console.error('[merchant-parts.js] Invalid token', { error: error.message });
            return false;
        }
    }

    token = getAuthToken();
    console.log('Token retrieved from local storage:', token ? 'Yes' : 'No');
    if (!validateToken()) {
        showError('Authentication token is missing or invalid. Please log in again.');
        return;
    }

    // **Add FontAwesome CSS if not already loaded**
    const faHref = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    const existingFaLink = document.querySelector(`link[href="${faHref}"]`);
    if (!existingFaLink) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = faHref;
        faLink.onload = () => console.log('Font Awesome CSS loaded');
        faLink.onerror = () => console.error('Failed to load Font Awesome CSS');
        document.head.appendChild(faLink);
    } else {
        console.log('Font Awesome CSS already loaded');
    }

    // **Widget Styles**
    const widgetStyles = `
        #merchant-parts-widget {
            width: 100%;
            margin: 0;
            padding: 10px;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            position: relative;
        }
        #merchant-parts-widget #embed-section { margin-bottom: 10px; }
        #merchant-parts-widget #embed-section h1,
        #merchant-parts-widget h1 {
            text-align: left;
            color: #333;
            margin: 10px 0;
            font-size: 1.5em;
        }
        #merchant-parts-widget #embed-section p {
            margin: 5px 0;
            color: #666;
            font-size: 0.9em;
        }
        #merchant-parts-widget #embed-code {
            width: 100%;
            padding: 10px;
            font-family: monospace;
            resize: none;
            border: 1px solid #ccc;
            border-radius: 4px;
            min-height: 50px;
            box-sizing: border-box;
        }
        #merchant-parts-widget #copy-button {
            padding: 10px 15px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.2s;
            margin-top: 5px;
        }
        #merchant-parts-widget #copy-button:hover { background-color: #0056b3; }
        #merchant-parts-widget #parts-container {
            flex-grow: 1;
            margin-bottom: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            padding: 10px;
            box-sizing: border-box;
        }
        #merchant-parts-widget .part {
            width: 200px;
            border: 1px solid #ccc;
            padding: 10px;
            border-radius: 5px;
            background-color: #fff;
            cursor: pointer;
            transition: border-color 0.2s, box-shadow 0.3s ease, transform 0.3s ease;
            box-sizing: border-box;
        }
        #merchant-parts-widget .part:hover {
            border-color: #888;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            transform: scale(1.05);
        }
        #merchant-parts-widget .image-calculate {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 200px;
            overflow: hidden;
        }
        #merchant-parts-widget .part img {
            max-width: 100%;
            height: auto;
            border-radius: 3px;
        }
        #merchant-parts-widget .price-shield {
            position: absolute;
            top: 10px;
            right: 10px;
            background-color: #ffcc00;
            color: #000;
            padding: 5px;
            border-radius: 5px;
            font-weight: bold;
        }
        #merchant-parts-widget .part h3 {
            margin: 10px 0;
            font-size: 16px;
            color: #333;
        }
        #merchant-parts-widget .part p {
            margin: 5px 0;
            color: #666;
            font-size: 14px;
        }
        #merchant-parts-widget .loading-overlay {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(255,255,255,0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        #merchant-parts-widget .spinner-container { position: relative; width: 100px; height: 100px; }
        #merchant-parts-widget .spinner {
            position: absolute;
            border-radius: 50%;
            border: 4px solid transparent;
            animation: spin 1.5s linear infinite;
        }
        #merchant-parts-widget .spinner-1 { width:40px; height:40px; border-top-color:#ff6f61; top:30px; left:30px; }
        #merchant-parts-widget .spinner-2 { width:30px; height:30px; border-top-color:#6bff61; top:35px; left:35px; animation-delay:0.3s; }
        #merchant-parts-widget .spinner-3 { width:20px; height:20px; border-top-color:#61cfff; top:40px; left:40px; animation-delay:0.6s; }
        #merchant-parts-widget .spinner-4 { width:10px; height:10px; border-top-color:#ff61ff; top:45px; left:45px; animation-delay:0.9s; }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        #merchant-parts-widget #error {
            color: #d9534f;
            text-align: center;
            margin: 10px 0;
            font-size: 0.9em;
            display: none;
        }
        #merchant-parts-widget .message {
            text-align: center;
            color: #666;
            padding: 5px;
            font-size: 0.9em;
            width: 100%;
        }
        #merchant-parts-widget .catalog-count {
            display: inline-block;
            margin-left: 5px;
            color: #666;
            font-size: 0.9em;
            cursor: pointer;
        }
        #merchant-parts-widget .catalog-count .tooltip .tooltiptext {
            visibility: hidden;
            width: 200px;
            background-color: #555;
            color: #fff;
            text-align: center;
            border-radius: 6px;
            padding: 5px;
            position: absolute;
            z-index: 1;
            bottom: 125%;
            left: 50%;
            margin-left: -100px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        #merchant-parts-widget .catalog-count:hover .tooltip .tooltiptext,
        #merchant-parts-widget .catalog-count:active .tooltip .tooltiptext {
            visibility: visible;
            opacity: 1;
        }
        /* Pagination */
        #merchant-parts-widget #pagination-controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            margin: 15px 0 10px;
            flex-wrap: wrap;
        }
        #merchant-parts-widget #pagination-controls label { font-size: 0.9em; color: #666; }
        #merchant-parts-widget #pagination-controls select {
            padding: 8px 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 0.9em;
        }
        #merchant-parts-widget #pagination-controls button {
            padding: 8px 16px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.2s;
            font-size: 0.9em;
        }
        #merchant-parts-widget #pagination-controls button:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
        }
        #merchant-parts-widget #pagination-controls button:hover:not(:disabled) {
            background-color: #0056b3;
        }
        #merchant-parts-widget #page-info {
            font-size: 0.9em;
            color: #666;
            white-space: nowrap;
        }
        @media (max-width: 768px) {
            #merchant-parts-widget { padding: 5px; }
            #merchant-parts-widget #parts-container { gap: 15px; padding: 5px; }
            #merchant-parts-widget #pagination-controls { gap: 10px; }
        }
        @media (max-width: 480px) {
            #merchant-parts-widget #parts-container { gap: 10px; padding: 5px; }
        }
    `;
    const styleElement = document.createElement('style');
    styleElement.textContent = widgetStyles;
    document.head.appendChild(styleElement);

    // **Create Widget Container**
    const widget = document.createElement('div');
    widget.id = 'merchant-parts-widget';
    parentElement.appendChild(widget);

    // Embed Section
    const embedSection = document.createElement('div');
    embedSection.id = 'embed-section';
    embedSection.innerHTML = `
        <h1>Tracking Widget</h1>
        <p>To index your parts please copy your tracking reference into the &lt;HEAD&gt; of your website.</p>
    `;
    const textarea = document.createElement('textarea');
    textarea.id = 'embed-code';
    textarea.readOnly = true;
    textarea.value = `<script src="${SCRIPT_URL}" data-merchant-id="${userId}"></script>`;
    embedSection.appendChild(textarea);

    const copyButton = document.createElement('button');
    copyButton.id = 'copy-button';
    copyButton.textContent = 'Copy';
    copyButton.addEventListener('click', () => {
        textarea.select();
        document.execCommand('copy');
        copyButton.textContent = 'Copied!';
        setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
    });
    embedSection.appendChild(copyButton);
    widget.appendChild(embedSection);

    // Parts Title
    const partsTitle = document.createElement('h1');
    partsTitle.textContent = 'Merchant Parts';
    widget.appendChild(partsTitle);

    // Pagination Controls
    const paginationControls = document.createElement('div');
    paginationControls.id = 'pagination-controls';
    paginationControls.innerHTML = `
        <label>Items per page: </label>
        <select id="page-size-select"></select>
        <span id="page-info">Page <strong id="current-page">1</strong> of <strong id="total-pages">1</strong> (<span id="total-records">0</span> total)</span>
        <button id="prev-button">← Previous</button>
        <button id="next-button">Next →</button>
    `;
    widget.appendChild(paginationControls);

    // Parts Container
    const partsContainer = document.createElement('div');
    partsContainer.id = 'parts-container';
    widget.appendChild(partsContainer);

    // Loading Overlay
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading';
    loadingDiv.className = 'loading-overlay';
    loadingDiv.style.display = 'none';
    loadingDiv.innerHTML = `
        <div class="spinner-container">
            <div class="spinner spinner-1"></div>
            <div class="spinner spinner-2"></div>
            <div class="spinner spinner-3"></div>
            <div class="spinner spinner-4"></div>
        </div>
    `;
    widget.appendChild(loadingDiv);

    // Error Div
    const errorDiv = document.createElement('div');
    errorDiv.id = 'error';
    widget.appendChild(errorDiv);

    // **Fetch Function**
    async function fetchData(page = 1, pagelen = DEFAULT_PAGE_LEN, retries = MAX_RETRIES) {
        const url = new URL(API_URL);
        url.searchParams.append('page', page);
        url.searchParams.append('pagelen', pagelen);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                        localStorage.removeItem('authToken');
                        window.location.href = '/login.html';
                        return { parts: [], recordcount: 0 };
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const result = await response.json();
                let parts = [];
                let recordcount = 0;

                if (Array.isArray(result)) {
                    parts = result;
                } else if (result && typeof result === 'object') {
                    parts = result.data || result.parts || result.items || [];
                    recordcount = result.recordcount || result.total || result.count || 0;
                }

                return { parts, recordcount };
            } catch (error) {
                if (attempt === retries) throw error;
                await new Promise(r => setTimeout(r, RETRY_DELAY));
            }
        }
    }

    async function fetchAndDisplayParts(targetPage = 1, newPageLen = null) {
        if (isLoading) return;
        isLoading = true;
        showLoading(true);

        try {
            if (newPageLen !== null) {
                pageLen = newPageLen;
                targetPage = 1;
            }

            const { parts, recordcount } = await fetchData(targetPage, pageLen);

            totalRecords = recordcount;
            totalPages = Math.max(1, Math.ceil(totalRecords / pageLen));
            currentPage = Math.min(targetPage, totalPages);

            partsContainer.innerHTML = '';

            renderParts(parts);

            if (parts.length === 0 && totalRecords === 0) {
                const msg = document.createElement('div');
                msg.className = 'message';
                msg.textContent = 'No parts found';
                partsContainer.appendChild(msg);
            }

            updatePaginationUI();
        } catch (error) {
            showError(`Failed to load parts: ${error.message}`);
        } finally {
            isLoading = false;
            showLoading(false);
        }
    }

    function renderParts(parts) {
        const fieldsToDisplay = [
            { key: 'Discount', label: 'Discount' },
            { key: 'WasPrice', label: 'Was Price' },
            { key: 'Mpn', label: 'MPN' },
            { key: 'Brand', label: 'Brand' },
            { key: 'count_categories', label: 'Catalog Entries' }
        ];

        parts.forEach(part => {
            const partDiv = document.createElement('div');
            partDiv.className = 'part';
            partDiv.innerHTML = `
                <div class="image-calculate">
                    <img src="${part.ThumbnailUrl}" alt="${part.Title}">
                    ${part.Price && part.Price !== 'N/A' ? `<div class="price-shield">${part.Price}</div>` : ''}
                </div>
                <h3>${part.Title}</h3>
            `;

            fieldsToDisplay.forEach(field => {
                if (field.key === 'count_categories') {
                    const count = parseInt(part[field.key], 10) || 0;
                    const tooltipText = count > 0 
                        ? `This part is being shown on ${count} websites.` 
                        : "No matching categories found. Make sure your descriptions provide proper context, and we'll keep checking back to see if we can list it.";
                    const catalogDiv = document.createElement('div');
                    catalogDiv.className = 'catalog-count';
                    catalogDiv.innerHTML = `<strong>${field.label}:</strong> ${count} <span class="tooltip"><i class="fas fa-question-circle"></i><span class="tooltiptext">${tooltipText}</span></span>`;
                    catalogDiv.addEventListener('click', e => e.stopPropagation());
                    partDiv.appendChild(catalogDiv);
                } else {
                    const value = part[field.key];
                    if (value && value !== 'N/A') {
                        partDiv.innerHTML += `<p><strong>${field.label}:</strong> <span>${value}</span></p>`;
                    }
                }
            });

            partDiv.addEventListener('click', () => window.open(part.AffiliateUrl, '_blank'));
            partsContainer.appendChild(partDiv);
        });
    }

    function updatePaginationUI() {
        document.getElementById('current-page').textContent = currentPage;
        document.getElementById('total-pages').textContent = totalPages;
        document.getElementById('total-records').textContent = totalRecords;

        document.getElementById('prev-button').disabled = currentPage <= 1;
        document.getElementById('next-button').disabled = currentPage >= totalPages;
        document.getElementById('page-size-select').value = pageLen;
    }

    function showLoading(show) {
        const loadingDiv = widget.querySelector('#loading');
        if (loadingDiv) loadingDiv.style.display = show ? 'flex' : 'none';
    }

    function showError(message) {
        const errorDiv = widget.querySelector('#error');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    // **Pagination Event Listeners**
    function setupPaginationListeners() {
        const pageSizeSelect = document.getElementById('page-size-select');
        PAGE_LEN_OPTIONS.forEach(size => {
            const opt = document.createElement('option');
            opt.value = size;
            opt.textContent = size;
            if (size === DEFAULT_PAGE_LEN) opt.selected = true;
            pageSizeSelect.appendChild(opt);
        });

        document.getElementById('prev-button').addEventListener('click', () => {
            if (currentPage > 1) fetchAndDisplayParts(currentPage - 1);
        });

        document.getElementById('next-button').addEventListener('click', () => {
            if (currentPage < totalPages) fetchAndDisplayParts(currentPage + 1);
        });

        pageSizeSelect.addEventListener('change', (e) => {
            fetchAndDisplayParts(1, parseInt(e.target.value, 10));
        });
    }

    // **Initialization**
    async function init() {
        setupPaginationListeners();
        await fetchAndDisplayParts(1);
    }

    init();
})();