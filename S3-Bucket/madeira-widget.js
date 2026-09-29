(function() {

    // XAI — YOU MUST INCREMENT THE VERSION NUMBER WITH EVERY ITERATION (0.9 → 1.0, 1.1 etc.)
    const Version = '6.23';
    console.log(`Madeira Widget Version: ${Version}`);
    
    // Configuration
    const API_URL = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/query';
    const PAGE_SIZE = 50;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 1000;
    const MOBILE_BREAKPOINT = 768;

    // State variables
    let currentUserId = '';
    let currentMainCategory = '';
    let currentSubCategory = null;
    let lastSource = null;
    let lastSubCategory = null;
    let lastProductId = null;      // Real product ID (for catalogue lookup)
    let lastRowNumber = null;      // Row number from ROW_NUMBER() (for Part2 pagination)
    let isLoading = false;
    let hasMore = true;
    let currentSortOrder = 'PriceDesc';
    let currentSearchTerm = null;
    let isCategorySwitching = false;

    // Get the current script element
    const script = document.currentScript;

    // Determine the parent element to append the widget to
    let parentElement = script.parentElement;
    let isFullScreen = false;
    if (parentElement === document.body) {
        console.log('Parent is body, creating wrapper');
        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.bottom = '0';
        wrapper.style.overflow = 'hidden';
        document.body.appendChild(wrapper);
        parentElement = wrapper;
        isFullScreen = true;
        document.documentElement.style.height = '100%';
        document.body.style.height = '100%';
        document.body.style.margin = '0';
    } else {
        console.log('Parent is not body');
    }

    // Check for affiliate tag
    const affiliate = script.dataset.affiliate;
    if (!affiliate) {
        showError('Affiliate tag is missing. Please specify it in the script tag using data-affiliate.');
        return;
    }
    currentUserId = affiliate;
    console.log('Affiliate tag found:', affiliate);

    // Create widget container and append immediately
    const widget = document.createElement('div');
    widget.id = 'catalog-widget';
    widget.className = 'catalog-widget';
    widget.style.height = '100%';
    widget.style.position = 'relative';
    widget.style.display = 'flex';
    widget.style.flexDirection = 'column';
    parentElement.appendChild(widget);
    console.log('Widget container created and appended');

    // Set widget HTML structure
    widget.innerHTML = `
        <div id="menu-container" class="menu-container"></div>
        <div id="controls-container" class="controls-container"></div>
        <div id="parts-container" class="parts-container"></div>
        <div id="loading" class="loading-overlay">
            <div class="spinner-container">
                <div class="spinner spinner-1"></div>
                <div class="spinner spinner-2"></div>
                <div class="spinner spinner-3"></div>
                <div class="spinner spinner-4"></div>
            </div>
        </div>
        <div id="error" class="error"></div>
    `;
    console.log('Widget HTML structure set');

    // Declare ALL variables ONCE at top level
    const partsContainer = document.getElementById('parts-container');
    partsContainer.style.flex = '1 1 auto';
    partsContainer.style.overflowY = 'auto';
    partsContainer.style.marginTop = '20px';
    const noRecordsDiv = document.createElement('div');
    noRecordsDiv.id = 'no-records';
    noRecordsDiv.className = 'no-records';
    noRecordsDiv.style.display = 'none';
    noRecordsDiv.textContent = 'No products found in this category.';
    partsContainer.appendChild(noRecordsDiv);

    const controlsContainer = document.getElementById('controls-container');
    controlsContainer.innerHTML = `
        <div id="mobile-controls" class="mobile-controls" style="justify-content: center; gap: 12px; align-items: center;">
            <!-- Catalog icon for MAIN categories -->
            <i class="fas fa-list-ul" id="catalog-icon" title="Main Categories" style="cursor: pointer; padding: 8px; font-size: 18px;" tabindex="0" role="button" aria-label="Show main categories"></i>
            <!-- Filter icon for SUB categories -->
            <i class="fas fa-filter" id="filter-icon" title="Subcategory Filter"></i>
            <!-- Search button (moved to right of filter) -->
            <i class="fas fa-magnifying-glass" id="search-icon" title="Search" style="cursor: pointer; padding: 8px; font-size: 18px;" tabindex="0" role="button" aria-label="Open search"></i>
            <!-- Sort icon (standard A-Z with arrow) -->
            <i class="fas fa-sort-amount-down" id="sort-icon" title="Sort"></i>
        </div>
        <div id="filter-dropdown" class="dropdown-menu" style="display: none; left: 0; right: auto; min-width: 280px; width: 280px; max-width: 280px;">
            <ul id="filter-options"></ul>
        </div>
        <div id="sort-dropdown" class="dropdown-menu" style="display: none;">
            <ul id="sort-options">
                <li data-value="PriceDesc">Price high to low</li>
                <li data-value="PriceAsc">Price low to high</li>
                <li data-value="DateDesc">Date newest to oldest</li>
                <li data-value="DateAsc">Date oldest to newest</li>
            </ul>
        </div>
        <!-- Desktop controls with search button between filter and sort -->
        <div id="desktop-controls" class="desktop-controls">
            <label for="subcategory-filter" class="filter-label">Filter:</label>
            <select id="subcategory-filter" class="subcategory-filter" style="width: 220px;">
                <option value="">All</option>
            </select>
            <!-- Search button placed after filter, before sort -->
            <i class="fas fa-magnifying-glass" id="desktop-search-icon" title="Search" style="cursor: pointer; padding: 8px; font-size: 18px; margin-left: 6px;" tabindex="0" role="button" aria-label="Open search"></i>
            <label for="sort-order" class="filter-label sort-label">Sort:</label>
            <select id="sort-order" class="subcategory-filter" style="width: 180px;">
                <option value="PriceDesc">Price high to low</option>
                <option value="PriceAsc">Price low to high</option>
                <option disabled>──────────</option>
                <option value="DateDesc">Date newest to oldest</option>
                <option value="DateAsc">Date oldest to newest</option>
            </select>
        </div>
    `;
    console.log('Controls HTML added to controls-container');

    // Add sentinel for infinite scrolling
    const sentinel = document.createElement('div');
    sentinel.id = 'sentinel';
    sentinel.className = 'sentinel';
    sentinel.style.height = '10px';
    partsContainer.appendChild(sentinel);
    console.log('Sentinel added to parts-container');

    // Add FontAwesome CSS
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    faLink.as = 'style';
    document.head.appendChild(faLink);
    console.log('FontAwesome CSS added');

    // Parse script src for version query param
    const scriptUrl = new URL(script.src);
    const versionParam = scriptUrl.searchParams.get('v');
    let versionQuery = '';
    if (versionParam) {
        versionQuery = `?v=${versionParam}`;
        console.log('Version query parameter found:', versionQuery);
    }

    // Add common CSS with version if present
    const commonCssLink = document.createElement('link');
    commonCssLink.rel = 'stylesheet';
    commonCssLink.href = script.src.substring(0, script.src.lastIndexOf('/') + 1) + 'madeira-common.css' + versionQuery;
    commonCssLink.as = 'style';
    document.head.appendChild(commonCssLink);
    console.log('Common CSS added:', commonCssLink.href);

    // Add theme CSS with version if present
    const cssFileName = script.dataset.css || 'madeira-widget.css';
    const scriptPath = script.src.substring(0, script.src.lastIndexOf('/') + 1);
    const cssPath = scriptPath + cssFileName + versionQuery;
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = cssPath;
    cssLink.as = 'style';
    document.head.appendChild(cssLink);
    console.log('Theme CSS added:', cssPath);

    // Load FingerprintJS CDN
    const fpScript = document.createElement('script');
    fpScript.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js';
    fpScript.async = true;
    fpScript.as = 'script';
    document.head.appendChild(fpScript);
    console.log('FingerprintJS CDN added');

    // Load PostHog JS SDK
    const posthogScript = document.createElement('script');
    posthogScript.src = 'https://app.posthog.com/static/array.js';
    posthogScript.async = true;
    posthogScript.as = 'script';
    document.head.appendChild(posthogScript);

    posthogScript.onload = () => {
        try {
            posthog.init('phc_RDsbExoIQRl5Njr8dcumuO5xVGN6kfj0EiYg5qXC73k', {
                api_host: 'https://eu.i.posthog.com'
            });
            posthog.identify(currentUserId);
            console.log('PostHog initialized successfully');
        } catch (error) {
            console.error('PostHog initialization failed:', error.message);
            showError('Analytics initialization failed. Click tracking may not work.');
        }
    };
    posthogScript.onerror = () => {
        console.error('Failed to load PostHog script');
        showError('Failed to load analytics script. Click tracking may not work.');
    };
    console.log('PostHog script added');

    // ==================== STABLE FINGERPRINT ====================
    let cachedFingerprint = null;
    const fpReadyPromise = new Promise(resolve => {
        if (typeof FingerprintJS !== 'undefined') { resolve(); return; }
        fpScript.onload = () => { resolve(); console.log('FingerprintJS fully loaded'); };
        setTimeout(() => { resolve(); console.log('FingerprintJS timeout safety → stable fallback used'); }, 1200);
    });

    async function getFullFingerprint() {
        if (cachedFingerprint) {
            console.log('✅ Fingerprint cache hit — same ID for entire page load');
            return cachedFingerprint;
        }
        await fpReadyPromise;
        try {
            let visitorId, clientHash;
            if (typeof FingerprintJS === 'undefined') {
                console.warn('FingerprintJS not loaded → using stable IP+UA+userId fallback');
                const ip = 'client-ip-unknown';
                const ua = navigator.userAgent;
                const stableHash = btoa(ip + ua + currentUserId);
                visitorId = stableHash.substring(0, 32);
                clientHash = stableHash;
            } else {
                const fp = await FingerprintJS.load({ monitoring: false });
                const result = await fp.get({ extendedResult: true });
                const customSignals = {
                    userAgent: navigator.userAgent,
                    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    language: navigator.language,
                    canvasHash: result.components.canvas?.value || '',
                    webglHash: result.components.webgl || '',
                    audioHash: result.components.audio || '',
                    fonts: result.components.fonts?.value?.join(',') || '',
                    hardware: `${navigator.hardwareConcurrency || 'unk'}c_${navigator.deviceMemory || 'unk'}g`,
                    userId: currentUserId
                };
                clientHash = btoa(JSON.stringify(customSignals));
                visitorId = result.visitorId + '-' + currentUserId.substring(0,4);
                console.log('✅ FingerprintJS SUCCESS →', visitorId);
            }
            cachedFingerprint = { visitorId, clientHash };
            try { sessionStorage.setItem('madeiraFingerprint', JSON.stringify(cachedFingerprint)); } catch(e) {}
            return cachedFingerprint;
        } catch (e) {
            console.warn('Fingerprint generation failed → stable fallback');
            const ip = 'client-ip-unknown';
            const ua = navigator.userAgent;
            const stableHash = btoa(ip + ua + currentUserId);
            cachedFingerprint = { visitorId: stableHash.substring(0, 32), clientHash: stableHash };
            return cachedFingerprint;
        }
    }

    // Set up IntersectionObserver for infinite scrolling
    const observer = new IntersectionObserver(entries => {
        console.log('IntersectionObserver triggered, isIntersecting:', entries[0].isIntersecting, 'hasMore:', hasMore, 'isLoading:', isLoading, 'currentMainCategory:', currentMainCategory, 'isCategorySwitching:', isCategorySwitching);
        if (entries[0].isIntersecting && hasMore && !isLoading && currentMainCategory && !isCategorySwitching) {
            console.log('Fetching next page of parts for category:', currentMainCategory);
            showLoading(true);
            console.log('showLoading(true) in observer');
            fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, true).then(() => {
                setTimeout(() => {
                    showLoading(false);
                    console.log('showLoading(false) after timeout in observer then');
                }, 100);
            });
        }
    }, { threshold: 0.1, root: partsContainer });
    observer.observe(sentinel);
    console.log('IntersectionObserver set up');

    // Utility Functions
    function isValidAffiliateKey(source) {
        return /^[0-9A-Z]{8}$/.test(source);
    }

    function scrollToTop() {
        const partsContainer = document.getElementById('parts-container');
        if (partsContainer) {
            setTimeout(() => {
                partsContainer.scrollTop = 0;
            }, 0);
            console.log('Scrolled to top');
        } else {
            console.warn('parts-container not found for scrolling');
        }
    }

    function clearPartsContainer() {
        let child = partsContainer.firstChild;
        while (child && child !== sentinel) {
            const nextChild = child.nextSibling;
            if (child.id !== 'no-records') {
                partsContainer.removeChild(child);
            }
            child = nextChild;
        }
        console.log('Cleared parts container, preserving no-records div');
    }

    async function fetchData(query, retries = 3) {
        const fp = await getFullFingerprint();
        console.log('Fetching data with query:', query, 'fingerprint:', fp.visitorId, 'userId:', currentUserId);
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        query, 
                        fingerprint: fp.visitorId,
                        userId: currentUserId,
                        clientHash: fp.clientHash 
                    })
                });
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                if (!Array.isArray(data)) {
                    throw new Error('Invalid response structure: expected an array');
                }
                console.log(`Fetch successful for query: ${query}, data length: ${data.length}`);
                return data;
            } catch (error) {
                console.error(`Fetch attempt ${attempt} failed: ${error.message}`);
                if (attempt === retries) {
                    showError(`Failed to fetch data after ${retries} attempts: ${error.message}`);
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }

    async function fetchTopLevelMenu(userId) {
        const query = `SELECT * FROM dbo.Menu('${userId}', NULL) ORDER BY SortOrder`;
        console.log('Fetching top level menu with query:', query);
        return fetchData(query);
    }

    async function fetchSubCategories(userId, mainCategory) {
        const query = `SELECT * FROM dbo.Menu('${userId}', '${mainCategory}') ORDER BY SortOrder`;
        console.log('Fetching subcategories with query:', query);
        try {
            return await fetchData(query);
        } catch (error) {
            console.warn(`Subcategories fetch failed for ${mainCategory}, using empty list`);
            return [];
        }
    }

    async function fetchParts(userId, mainCategory, subCategory, lastSource, lastSubCategory, lastRowNumber, pageSize, sortOrder, searchTerm) {
        const subCatParam = subCategory ? `'${subCategory}'` : 'NULL';
        const lastSourceParam = lastSource ? `'${lastSource}'` : 'NULL';
        const lastSubCatParam = lastSubCategory ? `'${lastSubCategory}'` : 'NULL';
        const lastRowParam = lastRowNumber !== null ? lastRowNumber : 'NULL';
        const escapedMainCategory = mainCategory.replace(/'/g, "''");
        const searchParam = searchTerm ? `'${searchTerm.replace(/'/g, "''")}'` : 'NULL';

        const query = `SELECT * FROM dbo.Part2('${userId}', '${escapedMainCategory}', ${subCatParam}, ${lastSourceParam}, ${lastSubCatParam}, ${lastRowParam}, ${pageSize}, '${sortOrder}', ${searchParam})`;
        console.log('Fetching parts with query:', query);
        return fetchData(query);
    }

    function createMenuButtons(menuItems) {
        const menuContainer = document.getElementById('menu-container');
        if (!menuContainer) {
            console.error('Menu container not found');
            return;
        }
        menuContainer.innerHTML = '';
        menuItems.sort((a, b) => a.SortOrder - b.SortOrder);
        menuItems.forEach(item => {
            const button = document.createElement('button');
            button.className = 'menu-button';
            button.innerHTML = `<i class="fas ${item.icon}"></i> ${item.Category}`;
            button.dataset.userId = item.UserId;
            button.dataset.category = item.Category;
            button.addEventListener('click', () => {
                console.log('Menu button clicked, setting category to:', item.Category);
                handleMenuClick(item.UserId, item.Category);
            });
            menuContainer.appendChild(button);
        });
        menuContainer.style.flexDirection = 'column';
        menuContainer.style.flexWrap = 'nowrap';
        menuContainer.style.justifyContent = 'flex-start';
        menuContainer.style.alignItems = 'stretch';
        menuContainer.style.gap = '10px';
        menuContainer.style.padding = '10px';
        console.log('Menu buttons created, length:', menuItems.length);
    }

    function populateCategoriesDropdown(menuItems, isMain = true) {
        const filterOptions = document.getElementById('filter-options');
        if (!filterOptions) return;
        // Clear immediately before populating
        filterOptions.innerHTML = isMain ? '' : '<li data-value="">All</li>';
        menuItems.sort((a, b) => a.SortOrder - b.SortOrder);
        menuItems.forEach(item => {
            const li = document.createElement('li');
            li.dataset.value = item.Category;
            li.dataset.userId = item.UserId;
            li.dataset.isMain = isMain ? 'true' : 'false';
            li.innerHTML = `<i class="fas ${item.icon}"></i> ${item.Category}`;
            filterOptions.appendChild(li);
        });
        console.log(`Populated dropdown (isMain=${isMain}), item count:`, menuItems.length);
    }

    async function handleMenuClick(userId, mainCategory) {
        console.log('handleMenuClick called with userId:', userId, 'mainCategory:', mainCategory, 'previous category:', currentMainCategory);
        isCategorySwitching = true;
        currentUserId = userId;
        currentMainCategory = mainCategory;
        currentSubCategory = null;
        lastSource = null;
        lastSubCategory = null;
        lastProductId = null;
        lastRowNumber = null;
        hasMore = true;
        currentSortOrder = 'PriceDesc';
        currentSearchTerm = null;

        const sortSelect = document.getElementById('sort-order');
        if (sortSelect) {
            sortSelect.value = 'PriceDesc';
            console.log('Reset sort order to PriceDesc');
        }

        showLoading(true);
        console.log('showLoading(true) in handleMenuClick');
        try {
            console.log('Entering try in handleMenuClick');
            clearPartsContainer();
            console.log('Cleared parts container for category:', mainCategory);
            await fetchAndPopulateSubCategories(userId, mainCategory);
            isCategorySwitching = false;
            console.log('Guard released before main fetchAndDisplayParts');
            await fetchAndDisplayParts(userId, mainCategory, null, false);
            const menuItems = await fetchTopLevelMenu(userId);
            populateCategoriesDropdown(menuItems, true); // main = true
            console.log('Updated menus, currentMainCategory:', currentMainCategory);
            console.log('Exiting try in handleMenuClick');
        } catch (error) {
            console.error(`Failed to handle menu click: ${error.message}`);
            showError(`Failed to load category data: ${error.message}`);
        } finally {
            console.log('Entering finally in handleMenuClick');
            setTimeout(() => {
                showLoading(false);
                console.log('showLoading(false) after timeout in handleMenuClick finally');
            }, 150);
        }
        scrollToTop();
    }

    async function fetchAndPopulateSubCategories(userId, mainCategory) {
        console.log('fetchAndPopulateSubCategories called');
        try {
            console.log('Entering try in fetchAndPopulateSubCategories');
            const subCategories = await fetchSubCategories(userId, mainCategory);
            const select = document.getElementById('subcategory-filter');
            if (!select) {
                console.error('Subcategory select not found');
                return;
            }
            select.innerHTML = '<option value="">All</option>';
            if (subCategories.length === 0) {
                console.warn(`No subcategories found for ${mainCategory}`);
            } else {
                subCategories.forEach(sub => {
                    const option = document.createElement('option');
                    option.value = sub.Category;
                    option.textContent = sub.Category;
                    select.appendChild(option);
                });
            }
            select.value = '';
            console.log('Populated subcategories for mainCategory:', mainCategory, 'subCategory count:', subCategories.length);
            adjustLayout();
            console.log('Exiting try in fetchAndPopulateSubCategories');
        } catch (error) {
            console.error(`Failed to load subcategories for ${mainCategory}: ${error.message}`);
            const select = document.getElementById('subcategory-filter');
            if (select) select.innerHTML = '<option value="">All</option>';
            adjustLayout();
        }
    }

    async function fetchAndDisplayParts(userId, mainCategory, subCategory, append = false) {
        console.log('fetchAndDisplayParts called, append:', append, 'subCategory param:', subCategory, 'currentSubCategory state:', currentSubCategory, 'isCategorySwitching:', isCategorySwitching);
        if (isLoading || !hasMore || !mainCategory || isCategorySwitching) {
            console.warn('Skipping fetchAndDisplayParts: isLoading=', isLoading, 'hasMore=', hasMore, 'mainCategory=', mainCategory, 'isCategorySwitching=', isCategorySwitching);
            return;
        }
        isLoading = true;
        console.log('Setting isLoading to true in fetchAndDisplayParts');
        try {
            console.log('Entering try in fetchAndDisplayParts');
            const effectiveSub = (subCategory !== undefined) ? subCategory : currentSubCategory;
            const parts = await fetchParts(userId, mainCategory, effectiveSub, lastSource, lastSubCategory, lastRowNumber, PAGE_SIZE, currentSortOrder, currentSearchTerm);
            const noRecordsDiv = document.getElementById('no-records');
            if (parts.length === 0) {
                hasMore = false;
                if (!append) {
                    clearPartsContainer();
                    noRecordsDiv.style.display = 'block';
                    console.log('Showing no-records div');
                }
            } else {
                noRecordsDiv.style.display = 'none';
                console.log('Hiding no-records div');
                if (parts.length < PAGE_SIZE) {
                    hasMore = false;
                }
                if (!append) {
                    clearPartsContainer();
                    console.log('Cleared parts container in fetchAndDisplayParts');
                }
                renderParts(parts);
                if (parts.length > 0) {
                    const lastPart = parts[parts.length - 1];
                    lastSource = lastPart.Source;
                    lastSubCategory = lastPart.SubCategory;
                    lastProductId = lastPart.ID;
                    lastRowNumber = lastPart.rowid;
                }
            }
            console.log('Fetched and displayed parts for mainCategory:', mainCategory, 'effectiveSub:', effectiveSub, 'part count:', parts.length);
            console.log('Exiting try in fetchAndDisplayParts');
        } catch (error) {
            console.error(`Failed to load parts: ${error.message}`);
            showError(`Failed to load parts: ${error.message}`);
        } finally {
            console.log('Entering finally in fetchAndDisplayParts');
            isLoading = false;
            console.log('Setting isLoading to false in fetchAndDisplayParts finally');
            setTimeout(() => {
                showLoading(false);
                console.log('showLoading(false) after timeout in fetchAndDisplayParts finally');
            }, 100);
        }
    }

    function renderParts(parts) {
        console.log('renderParts called with parts length:', parts.length);
        const fieldsToDisplay = [
            { key: 'Discount', label: 'Discount' },
            { key: 'WasPrice', label: 'Was Price' },
            { key: 'Mpn', label: 'MPN' },
            { key: 'Brand', label: 'Brand' }
        ];

        parts.forEach(part => {
            let iconHtml = '';
            const sourceLower = part.Source ? part.Source.toLowerCase() : '';
            if (sourceLower === 'ebay') {
                iconHtml = `
                    <div class="source-icon" style="display: block; opacity: 1; visibility: visible; font-size: 24px;">
                        <i class="fab fa-ebay"></i>
                    </div>
                `;
            } else if (sourceLower === 'paapi') {
                iconHtml = `
                    <div class="source-icon" style="display: block; opacity: 1; visibility: visible; font-size: 24px;">
                        <i class="fab fa-amazon"></i>
                    </div>
                `;
            } else if (sourceLower === 'awin') {
                iconHtml = `
                    <div class="source-icon" style="display: block; opacity: 1; visibility: visible;">
                        <img src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/awin.svg" style="width:24px; height:24px;" alt="Awin">
                    </div>
                `;
            } else if (isValidAffiliateKey(part.Source)) {
                iconHtml = `
                    <div class="sponsor-icon" style="display: block; opacity: 1; visibility: visible; font-size: 24px;">
                        <i class="fas fa-crown" title="Club Sponsor"></i>
                    </div>
                `;
            }

            let priceHtml = '';
            if (part.Price && part.Price !== 'N/A') {
                let mainPrice = part.Price;
                let secondaryPrice = '';
                const match = part.Price.match(/^(.*)\s*\((.*)\)$/);
                if (match) {
                    mainPrice = match[1].trim();
                    secondaryPrice = `(${match[2].trim()})`;
                }
                priceHtml = `
                    <div class="price-shield" style="display: block; opacity: 1; visibility: visible;">
                        ${mainPrice}
                    </div>
                `;
                if (secondaryPrice) {
                    priceHtml += `
                        <div class="secondary-price-shield" style="display: block; opacity: 1; visibility: visible;">
                            ${secondaryPrice}
                        </div>
                    `;
                }
            }

            const partDiv = document.createElement('div');
            partDiv.className = 'part';
            partDiv.innerHTML = `
                <div class="image-container" style="position: relative;">
                    <img src="${part.ThumbnailUrl}" alt="${part.Title}" loading="lazy">
                    ${iconHtml}
                    ${priceHtml}
                </div>
                <h3>${part.Title}</h3>
            `;

            fieldsToDisplay.forEach(field => {
                const value = part[field.key];
                if (value && value !== 'N/A') {
                    partDiv.innerHTML += `<p><strong>${field.label}:</strong> ${value}</p>`;
                }
            });

            partDiv.addEventListener('click', async () => {
                const fp = await getFullFingerprint();
                const clickData = {
                    userId: currentUserId,
                    productId: part.ID,
                    fingerprint: fp.visitorId
                };
                fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(clickData),
                    keepalive: true
                }).catch(() => {});

                if (part.AffiliateUrl && part.AffiliateUrl !== 'null' && !part.AffiliateUrl.includes('/html/null')) {
                    if (window.posthog && isValidAffiliateKey(part.Source)) {
                        window.posthog.capture('click', {
                            source_user_id: currentUserId,
                            destination_user_id: part.Source,
                            source: window.location.href,
                            destination: part.AffiliateUrl
                        });
                    } else {
                        console.warn('PostHog unavailable or invalid Source, skipping click tracking:', part.Source);
                    }
                    window.open(part.AffiliateUrl, '_blank');
                } else {
                    console.error('Invalid AffiliateUrl for part:', {
                        title: part.Title,
                        affiliateUrl: part.AffiliateUrl,
                        source: part.Source
                    });
                    showError('Unable to open product link.');
                }
            });

            partsContainer.insertBefore(partDiv, sentinel);
        });
        console.log('renderParts completed');
    }

    function showLoading(show) {
        console.log('showLoading called with', show ? 'show' : 'hide');
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            console.log('Loading div found');
            if (show) {
                loadingDiv.style.display = 'flex';
                loadingDiv.style.opacity = 1;
                loadingDiv.style.visibility = 'visible';
                loadingDiv.style.backgroundColor = 'transparent';
            } else {
                loadingDiv.style.opacity = 0;
                loadingDiv.style.visibility = 'hidden';
                loadingDiv.style.display = 'none';
            }
            console.log('Loading div display set to', loadingDiv.style.display);
            console.log('Computed style display after set:', window.getComputedStyle(loadingDiv).display);
            console.log('Loading div visibility:', window.getComputedStyle(loadingDiv).visibility);
            console.log('Loading div opacity:', window.getComputedStyle(loadingDiv).opacity);
            console.log('Loading div parent:', loadingDiv.parentElement ? loadingDiv.parentElement.id : 'no parent');
            console.log('Document ready state:', document.readyState);
        } else {
            console.error('Loading div not found');
        }
    }

    function showError(message) {
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        } else {
            console.error('Error element not found:', message);
        }
    }

    function adjustLayout() {
        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
        const menuContainer = document.getElementById('menu-container');
        const mobileControls = document.getElementById('mobile-controls');
        const desktopControls = document.getElementById('desktop-controls');
        menuContainer.style.display = isMobile ? 'none' : 'flex';
        mobileControls.style.display = isMobile ? 'flex' : 'none';
        desktopControls.style.display = isMobile ? 'none' : 'flex';
        console.log('Adjusted layout, isMobile:', isMobile);
    }

    // Unified search container
    let isSearchActive = false;
    const searchContainer = document.createElement('div');
    searchContainer.style.position = 'relative';
    searchContainer.style.display = 'none';
    searchContainer.style.marginLeft = '12px';
    searchContainer.innerHTML = `
        <input type="text" id="unified-search-input" class="search-input" placeholder="Search products..." style="width: 220px; padding: 6px 24px 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; box-sizing: border-box;" aria-label="Search products">
        <i id="unified-clear-icon" class="fas fa-xmark" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #888; font-size: 16px; display: block;" tabindex="0" role="button" aria-label="Clear search / Cancel"></i>
    `;

    function activateSearch(isDesktop = false) {
        if (isSearchActive) return;
        
        console.log('Search activated', isDesktop ? '(desktop)' : '(mobile)');
        const mobileCatalogIcon = document.getElementById('catalog-icon');
        const desktopSearchIcon = document.getElementById('desktop-search-icon');
        const mobileSearchIcon = document.getElementById('search-icon');
        const filterIcon = document.getElementById('filter-icon');
        const sortIcon = document.getElementById('sort-icon');
        const filterLabel = document.querySelector('.filter-label');
        const subcategoryFilter = document.getElementById('subcategory-filter');
        
        if (!isDesktop) {
            // Mobile: hide catalog, filter; keep search + sort (search icon hidden)
            mobileCatalogIcon.style.display = 'none';
            if (filterIcon) filterIcon.style.display = 'none';
            if (mobileSearchIcon) mobileSearchIcon.style.display = 'none';
            if (sortIcon) sortIcon.style.display = 'inline-block';
            searchContainer.style.flex = '1';
            const input = searchContainer.querySelector('input');
            if (input) input.style.width = '100%';
        } else {
            if (filterLabel) filterLabel.style.display = 'inline';
            if (subcategoryFilter) subcategoryFilter.style.display = 'none';
            searchContainer.style.flex = '0 0 auto';
            const input = searchContainer.querySelector('input');
            if (input) input.style.width = '220px';
        }
        
        const targetControls = isDesktop ? document.getElementById('desktop-controls') : document.getElementById('mobile-controls');
        
        if (!searchContainer.parentNode) {
            if (isDesktop) {
                targetControls.insertBefore(searchContainer, document.getElementById('desktop-search-icon'));
            } else {
                targetControls.insertBefore(searchContainer, mobileSearchIcon);
            }
        }
        searchContainer.style.display = 'block';
        isSearchActive = true;
        
        const searchInput = document.getElementById('unified-search-input');
        searchInput.focus();
        setupSearchKeyboardHandlers(searchInput);

        setTimeout(() => {
            const input = document.getElementById('unified-search-input');
            const clear = document.getElementById('unified-clear-icon');
            if (input && clear) {
                const inputStyle = window.getComputedStyle(input);
                const clearStyle = window.getComputedStyle(clear);
                console.log('Desktop search input styles:', {
                    width: input.style.width,
                    paddingRight: input.style.paddingRight,
                    computedPaddingRight: inputStyle.paddingRight,
                    offsetWidth: input.offsetWidth
                });
                console.log('Clear icon styles:', {
                    right: clear.style.right,
                    display: clear.style.display,
                    computedRight: clearStyle.right,
                    offsetLeft: clear.offsetLeft
                });
            }
        }, 200);
    }

    function handleSearchClear(searchInputElement) {
        console.log('Search clear / cancel triggered');
        searchInputElement.value = '';
        currentSearchTerm = null;
        lastSource = null;
        lastSubCategory = null;
        lastProductId = null;
        lastRowNumber = null;
        hasMore = true;
        
        const clearIcon = document.getElementById('unified-clear-icon');
        if (clearIcon) clearIcon.style.display = 'block';
        
        const mobileCatalogIcon = document.getElementById('catalog-icon');
        const desktopSearchIcon = document.getElementById('desktop-search-icon');
        const mobileSearchIcon = document.getElementById('search-icon');
        const filterIcon = document.getElementById('filter-icon');
        const sortIcon = document.getElementById('sort-icon');
        const filterLabel = document.querySelector('.filter-label');
        const subcategoryFilter = document.getElementById('subcategory-filter');
        
        searchContainer.style.display = 'none';
        mobileCatalogIcon.style.display = 'block';
        if (mobileSearchIcon) mobileSearchIcon.style.display = 'inline-block';
        if (filterIcon) filterIcon.style.display = 'inline-block';
        if (sortIcon) sortIcon.style.display = 'inline-block';
        if (desktopSearchIcon) desktopSearchIcon.style.display = 'inline-block';
        if (filterLabel) filterLabel.style.display = 'inline';
        if (subcategoryFilter) subcategoryFilter.style.display = 'inline';
        isSearchActive = false;
        
        showLoading(true);
        clearPartsContainer();
        fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false).then(() => {
            showLoading(false);
        });
        scrollToTop();
    }

    function setupSearchKeyboardHandlers(searchInput) {
        let debounceTimer;
        const clearIcon = document.getElementById('unified-clear-icon');
        
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            if (clearIcon) clearIcon.style.display = 'block';
            
            debounceTimer = setTimeout(async () => {
                currentSearchTerm = searchInput.value.trim() || null;
                lastSource = null;
                lastSubCategory = null;
                lastProductId = null;
                lastRowNumber = null;
                hasMore = true;
                showLoading(true);
                clearPartsContainer();
                await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
                showLoading(false);
            }, 300);
        });
        
        searchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(debounceTimer);
                currentSearchTerm = searchInput.value.trim() || null;
                lastSource = null;
                lastSubCategory = null;
                lastProductId = null;
                lastRowNumber = null;
                hasMore = true;
                showLoading(true);
                clearPartsContainer();
                await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
                showLoading(false);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleSearchClear(searchInput);
            }
        });
        
        if (clearIcon) {
            clearIcon.addEventListener('click', () => handleSearchClear(searchInput));
            clearIcon.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSearchClear(searchInput);
                }
            });
        }
    }

    // Mobile catalog icon - MAIN categories
    const catalogIcon = document.getElementById('catalog-icon');
    catalogIcon.addEventListener('click', async (event) => {
        console.log('Catalog icon (main categories) clicked');
        const filterDropdown = document.getElementById('filter-dropdown');
        const sortDropdown = document.getElementById('sort-dropdown');
        // Clear before showing
        document.getElementById('filter-options').innerHTML = '';
        if (filterDropdown.style.display === 'none') {
            sortDropdown.style.display = 'none';
            filterDropdown.style.display = 'block';
            const rect = event.target.getBoundingClientRect();
            filterDropdown.style.top = rect.bottom + 'px';
            filterDropdown.style.left = '0';
            filterDropdown.style.right = 'auto';

            const menuItems = await fetchTopLevelMenu(currentUserId);
            populateCategoriesDropdown(menuItems, true); // main = true
        } else {
            filterDropdown.style.display = 'none';
        }
    });

    catalogIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const filterDropdown = document.getElementById('filter-dropdown');
            filterDropdown.style.display = filterDropdown.style.display === 'none' ? 'block' : 'none';
        }
    });

    // Filter icon - SUB categories of current main ONLY
    document.getElementById('filter-icon').addEventListener('click', async (event) => {
        console.log('Filter icon (subcategories) clicked');
        const filterDropdown = document.getElementById('filter-dropdown');
        const sortDropdown = document.getElementById('sort-dropdown');
        // Clear before showing
        document.getElementById('filter-options').innerHTML = '';
        if (filterDropdown.style.display === 'none') {
            sortDropdown.style.display = 'none';
            filterDropdown.style.display = 'block';
            const rect = event.target.getBoundingClientRect();
            filterDropdown.style.top = rect.bottom + 'px';
            filterDropdown.style.left = '0';
            filterDropdown.style.right = 'auto';

            const subCategories = await fetchSubCategories(currentUserId, currentMainCategory);
            populateCategoriesDropdown(subCategories, false); // main = false
        } else {
            filterDropdown.style.display = 'none';
        }
    });

    // SEPARATE listener for filter-options (SUB only)
    document.getElementById('filter-options').addEventListener('click', async (event) => {
        if (event.target.tagName === 'LI' || event.target.closest('li')) {
            const li = event.target.tagName === 'LI' ? event.target : event.target.closest('li');
            const value = li.dataset.value;
            const isMain = li.dataset.isMain === 'true';
            const userId = li.dataset.userId || currentUserId;
            document.getElementById('filter-dropdown').style.display = 'none';
            console.log('Filter option selected (value):', value, 'isMain:', isMain);
            
            if (isMain) {
                console.log('Treating as main category selection from filter-options');
                handleMenuClick(userId, value);
                return;
            }
            
            if (value === '') {
                currentSubCategory = null;
            } else {
                currentSubCategory = value;
            }
            
            // Reset pagination for new filter
            lastSource = null;
            lastSubCategory = null;
            lastProductId = null;
            lastRowNumber = null;
            hasMore = true;
            
            showLoading(true);
            try {
                clearPartsContainer();
                await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
            } finally {
                setTimeout(() => showLoading(false), 100);
            }
            scrollToTop();
        }
    });

    // Search icon listeners
    document.getElementById('search-icon').addEventListener('click', () => activateSearch(false));
    document.getElementById('search-icon').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateSearch(false);
        }
    });

    document.getElementById('desktop-search-icon').addEventListener('click', () => activateSearch(true));
    document.getElementById('desktop-search-icon').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateSearch(true);
        }
    });

    // Sort listeners
    document.getElementById('sort-icon').addEventListener('click', (event) => {
        console.log('Sort icon clicked');
        const sortDropdown = document.getElementById('sort-dropdown');
        const filterDropdown = document.getElementById('filter-dropdown');
        if (sortDropdown.style.display === 'none') {
            filterDropdown.style.display = 'none';
            sortDropdown.style.display = 'block';
            const rect = event.target.getBoundingClientRect();
            sortDropdown.style.top = rect.bottom + 'px';
            sortDropdown.style.right = (window.innerWidth - rect.right) + 'px';
            sortDropdown.style.left = 'auto';
        } else {
            sortDropdown.style.display = 'none';
        }
    });

    document.getElementById('sort-options').addEventListener('click', async (event) => {
        if (event.target.tagName === 'LI') {
            currentSortOrder = event.target.dataset.value;
            document.getElementById('sort-dropdown').style.display = 'none';
            showLoading(true);
            try {
                clearPartsContainer();
                await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
            } finally {
                setTimeout(() => showLoading(false), 100);
            }
            scrollToTop();
        }
    });

    document.getElementById('subcategory-filter').addEventListener('change', async (event) => {
        currentSubCategory = event.target.value || null;
        lastSource = null;
        lastSubCategory = null;
        lastProductId = null;
        lastRowNumber = null;
        hasMore = true;
        showLoading(true);
        try {
            clearPartsContainer();
            await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
        } finally {
            setTimeout(() => showLoading(false), 100);
        }
        scrollToTop();
    });

    document.getElementById('sort-order').addEventListener('change', async (event) => {
        currentSortOrder = event.target.value;
        lastSource = null;
        lastSubCategory = null;
        lastProductId = null;
        lastRowNumber = null;
        hasMore = true;
        showLoading(true);
        try {
            clearPartsContainer();
            await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
        } finally {
            setTimeout(() => showLoading(false), 100);
        }
        scrollToTop();
    });

    function init() {
        function waitForElements() {
            return new Promise((resolve) => {
                function checkElements(attempt = 1) {
                    const menuContainer = document.getElementById('menu-container');
                    const controlsContainer = document.getElementById('controls-container');
                    const partsContainer = document.getElementById('parts-container');
                    const categorySelect = document.getElementById('subcategory-filter');
                    const sortSelect = document.getElementById('sort-order');

                    if (menuContainer && controlsContainer && partsContainer && categorySelect && sortSelect) {
                        console.log('All widget elements found');
                        resolve(true);
                    } else if (attempt < MAX_RETRIES) {
                        console.warn(`Widget elements not found, retrying (${attempt}/${MAX_RETRIES})...`);
                        setTimeout(() => checkElements(attempt + 1), RETRY_DELAY);
                    } else {
                        console.error('Widget elements not found after max retries');
                        showError('Widget failed to initialize: Required elements not found.');
                        resolve(false);
                    }
                }
                checkElements();
            });
        }

        async function initializeWithRetry(attempt = 1) {
            showLoading(true);
            console.log('showLoading(true) in initializeWithRetry');
            try {
                console.log(`Initialization attempt ${attempt}/${MAX_RETRIES} at ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })} BST`);
                const menuItems = await fetchTopLevelMenu(currentUserId);
                if (!menuItems || menuItems.length === 0) {
                    throw new Error('No top-level menu items returned');
                }
                createMenuButtons(menuItems);
                populateCategoriesDropdown(menuItems, true);

                if (!currentMainCategory && menuItems.length > 0) {
                    currentMainCategory = menuItems[0].Category;
                    console.log('Set initial category during initialization:', currentMainCategory);
                }

                await fetchAndPopulateSubCategories(currentUserId, currentMainCategory);
                clearPartsContainer();
                await fetchAndDisplayParts(currentUserId, currentMainCategory, null, false);

                const parts = document.querySelectorAll('.part');
                if (parts.length === 0 && attempt < MAX_RETRIES) {
                    throw new Error('No parts loaded');
                }
                console.log('Initialization successful, currentMainCategory:', currentMainCategory);

            } catch (error) {
                console.error(`Initialization failed: ${error.message}`);
                if (attempt < MAX_RETRIES) {
                    console.log(`Retrying initialization (${attempt + 1}/${MAX_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    await initializeWithRetry(attempt + 1);
                } else {
                    showError(`Failed to initialize widget after ${MAX_RETRIES} attempts: ${error.message}`);
                }
            } finally {
                setTimeout(() => showLoading(false), 100);
                adjustLayout();
            }
        }

        document.addEventListener('DOMContentLoaded', async () => {
            console.log('DOM fully loaded, starting initialization');
            console.log('Current window width:', window.innerWidth);
            const elementsReady = await waitForElements();
            if (elementsReady) {
                await initializeWithRetry();
            }
        });

        window.addEventListener('resize', () => {
            adjustLayout();
        });
    }

    init();
})();