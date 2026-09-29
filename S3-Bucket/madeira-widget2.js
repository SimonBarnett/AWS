(function() {

    // XAI, increment the version with each iteration
    const Version = '0.8';
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
    let lastId = null;
    let isLoading = false;
    let hasMore = true;
    let currentSortOrder = 'PriceDesc';

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
        // Set full height for html and body
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
    widget.style.height = '100%'; // Force widget height to 100% of parent
    widget.style.position = 'relative'; // Ensure relative positioning for absolute overlay
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

    // Add no-records div inside parts-container
    const partsContainer = document.getElementById('parts-container');
    partsContainer.style.flex = '1 1 auto';
    partsContainer.style.overflowY = 'auto';
    partsContainer.style.marginTop = '20px';
    partsContainer.style.display = 'grid';
    partsContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(min(300px, calc(50% - 5px)), 1fr))';
    partsContainer.style.gap = '10px';
    const noRecordsDiv = document.createElement('div');
    noRecordsDiv.id = 'no-records';
    noRecordsDiv.className = 'no-records';
    noRecordsDiv.style.display = 'none';
    noRecordsDiv.textContent = 'No products found in this category.';
    partsContainer.appendChild(noRecordsDiv);

    // Add controls (category select and icons for mobile, dropdowns for desktop) to controls-container
    const controlsContainer = document.getElementById('controls-container');
    controlsContainer.innerHTML = `
        <div id="mobile-controls" class="mobile-controls">
            <select id="mobile-menu-select" class="subcategory-filter"></select>
            <div class="icon-container">
                <i class="fas fa-filter" id="filter-icon" title="Filter"></i>
                <i class="fas fa-sort" id="sort-icon" title="Sort"></i>
            </div>
        </div>
        <div id="filter-dropdown" class="dropdown-menu" style="display: none;">
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
        <div id="desktop-controls" class="desktop-controls">
            <label for="subcategory-filter" class="filter-label">Filter:</label>
            <select id="subcategory-filter" class="subcategory-filter">
                <option value="">All</option>
            </select>
            <label for="sort-order" class="filter-label sort-label">Sort:</label>
            <select id="sort-order" class="subcategory-filter">
                <option value="PriceDesc">Price high to low</option>
                <option value="PriceAsc">Price low to high</option>
                <option disabled>──────────</option>
                <option value="DateDesc">Date newest to oldest</option>
                <option value="DateAsc">Date oldest to newest</option>
            </select>
            <div id="extension-widget-container" style="display: inline-block; margin-left: 10px; width: 200px; height: auto; vertical-align: middle;">
                <span>Loading extension...</span>
            </div>
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

    // Set up IntersectionObserver for infinite scrolling
    const observer = new IntersectionObserver(entries => {
        console.log('IntersectionObserver triggered, isIntersecting:', entries[0].isIntersecting, 'hasMore:', hasMore, 'isLoading:', isLoading, 'currentMainCategory:', currentMainCategory);
        if (entries[0].isIntersecting && hasMore && !isLoading && currentMainCategory) {
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
        console.log('Fetching data with query:', query);
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
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
        return fetchData(query);
    }

    async function fetchParts(userId, mainCategory, subCategory, lastSource, lastSubCategory, lastId, pageSize, sortOrder) {
        const subCatParam = subCategory ? `'${subCategory}'` : 'NULL';
        const lastSourceParam = lastSource ? `'${lastSource}'` : 'NULL';
        const lastSubCatParam = lastSubCategory ? `'${lastSubCategory}'` : 'NULL';
        const lastIdParam = lastId !== null ? lastId : 'NULL';
        const escapedMainCategory = mainCategory.replace(/'/g, "''");
        const query = `SELECT * FROM dbo.Part2('${userId}', '${escapedMainCategory}', ${subCatParam}, ${lastSourceParam}, ${lastSubCatParam}, ${lastIdParam}, ${pageSize}, '${sortOrder}')`;
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
        // Apply styles to make buttons stack vertically from the top with minimum required height
        menuContainer.style.flexDirection = 'column';
        menuContainer.style.flexWrap = 'nowrap';
        menuContainer.style.justifyContent = 'flex-start';
        menuContainer.style.alignItems = 'stretch';
        menuContainer.style.gap = '10px';
        menuContainer.style.padding = '10px';
        console.log('Menu buttons created, length:', menuItems.length);
    }

    function populateMobileMenu(menuItems) {
        const select = document.getElementById('mobile-menu-select');
        if (!select) {
            console.error('Mobile menu select not found');
            return;
        }
        select.innerHTML = '';
        let selectedSet = false;
        menuItems.sort((a, b) => a.SortOrder - b.SortOrder);
        menuItems.forEach(item => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ userId: item.UserId, category: item.Category });
            option.textContent = item.Category;
            if (item.Category === currentMainCategory && !selectedSet) {
                option.selected = true;
                selectedSet = true;
            }
            select.appendChild(option);
        });
        if (!selectedSet && menuItems.length > 0) {
            select.selectedIndex = 0;
            const { userId, category } = JSON.parse(select.value);
            currentMainCategory = category;
            console.log('Set mobile menu category to:', category);
        }
        console.log('populateMobileMenu completed');
        adjustLayout(); // Adjust layout after populating mobile menu
    }

    async function handleMenuClick(userId, mainCategory) {
        console.log('handleMenuClick called with userId:', userId, 'mainCategory:', mainCategory, 'previous category:', currentMainCategory);
        currentUserId = userId;
        currentMainCategory = mainCategory;
        currentSubCategory = null;
        lastSource = null;
        lastSubCategory = null;
        lastId = null;
        hasMore = true;
        currentSortOrder = 'PriceDesc';
        const sortSelect = document.getElementById('sort-order');
        if (sortSelect) {
            sortSelect.value = 'PriceDesc';
            console.log('Reset sort order to PriceDesc');
        }
        showLoading(true);
        console.log('showLoading(true) in handleMenuClick');
        try {
            console.log('Entering try in handleMenuClick');
            // Clear existing parts
            clearPartsContainer();
            console.log('Cleared parts container for category:', mainCategory);
            await fetchAndPopulateSubCategories(userId, mainCategory);
            await fetchAndDisplayParts(userId, mainCategory, null, false);
            // Update mobile category select to reflect current category
            const menuItems = await fetchTopLevelMenu(userId);
            populateMobileMenu(menuItems);
            console.log('Updated mobile menu, currentMainCategory:', currentMainCategory);
            console.log('Exiting try in handleMenuClick');
        } catch (error) {
            console.error(`Failed to handle menu click: ${error.message}`);
            showError(`Failed to load category data: ${error.message}`);
        } finally {
            console.log('Entering finally in handleMenuClick');
            setTimeout(() => {
                showLoading(false);
                console.log('showLoading(false) after timeout in handleMenuClick finally');
            }, 100);
        }
        scrollToTop();
    }

    async function fetchAndPopulateSubCategories(userId, mainCategory) {
        console.log('fetchAndPopulateSubCategories called');
        try {
            console.log('Entering try in fetchAndPopulateSubCategories');
            const subCategories = await fetchSubCategories(userId, mainCategory);
            const select = document.getElementById('subcategory-filter');
            const filterOptions = document.getElementById('filter-options');
            if (!select || !filterOptions) {
                console.error('Subcategory elements not found');
                return;
            }
            select.innerHTML = '<option value="">All</option>';
            filterOptions.innerHTML = '<li data-value="">All</li>';
            if (subCategories.length === 0) {
                console.warn(`No subcategories found for ${mainCategory}`);
            } else {
                subCategories.forEach(sub => {
                    const option = document.createElement('option');
                    option.value = sub.Category;
                    option.textContent = sub.Category;
                    select.appendChild(option);

                    const li = document.createElement('li');
                    li.dataset.value = sub.Category;
                    li.textContent = sub.Category;
                    filterOptions.appendChild(li);
                });
            }
            select.value = '';
            console.log('Populated subcategories for mainCategory:', mainCategory, 'subCategory count:', subCategories.length);
            adjustLayout(); // Adjust layout after populating subcategories
            console.log('Exiting try in fetchAndPopulateSubCategories');
        } catch (error) {
            console.error(`Failed to load subcategories for ${mainCategory}: ${error.message}`);
            showError(`Failed to load subcategories: ${error.message}`);
        }
    }

    async function fetchAndDisplayParts(userId, mainCategory, subCategory, append = false) {
        console.log('fetchAndDisplayParts called, append:', append);
        if (isLoading || !hasMore || !mainCategory) {
            console.warn('Skipping fetchAndDisplayParts: isLoading=', isLoading, 'hasMore=', hasMore, 'mainCategory=', mainCategory);
            return;
        }
        isLoading = true;
        console.log('Setting isLoading to true in fetchAndDisplayParts');
        try {
            console.log('Entering try in fetchAndDisplayParts');
            const parts = await fetchParts(userId, mainCategory, subCategory, lastSource, lastSubCategory, lastId, PAGE_SIZE, currentSortOrder);
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
                    lastId = lastPart.ID;
                }
            }
            console.log('Fetched and displayed parts for mainCategory:', mainCategory, 'subCategory:', subCategory, 'part count:', parts.length);
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

            partDiv.addEventListener('click', () => {
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

    // Event listeners for dropdown icons on mobile with top-right alignment and mutual exclusivity
    document.getElementById('filter-icon').addEventListener('click', (event) => {
        console.log('Filter icon clicked');
        const filterDropdown = document.getElementById('filter-dropdown');
        const sortDropdown = document.getElementById('sort-dropdown');
        if (filterDropdown.style.display === 'none') {
            sortDropdown.style.display = 'none'; // Hide sort when filter is shown
            filterDropdown.style.display = 'block';
            const rect = event.target.getBoundingClientRect();
            filterDropdown.style.top = rect.bottom + 'px';
            filterDropdown.style.right = (window.innerWidth - rect.right) + 'px';
            filterDropdown.style.left = 'auto';
        } else {
            filterDropdown.style.display = 'none';
        }
    });

    document.getElementById('sort-icon').addEventListener('click', (event) => {
        console.log('Sort icon clicked');
        const sortDropdown = document.getElementById('sort-dropdown');
        const filterDropdown = document.getElementById('filter-dropdown');
        if (sortDropdown.style.display === 'none') {
            filterDropdown.style.display = 'none'; // Hide filter when sort is shown
            sortDropdown.style.display = 'block';
            const rect = event.target.getBoundingClientRect();
            sortDropdown.style.top = rect.bottom + 'px';
            sortDropdown.style.right = (window.innerWidth - rect.right) + 'px';
            sortDropdown.style.left = 'auto';
        } else {
            sortDropdown.style.display = 'none';
        }
    });

    // Event listener for category select in mobile mode
    document.getElementById('mobile-menu-select').addEventListener('change', async (event) => {
        console.log('Mobile menu select changed');
        if (event.target.value) {
            const { userId, category } = JSON.parse(event.target.value);
            console.log('Setting category to:', category);
            await handleMenuClick(userId, category);
        }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        if (!event.target.matches('.fa-filter, .fa-sort')) {
            document.getElementById('filter-dropdown').style.display = 'none';
            document.getElementById('sort-dropdown').style.display = 'none';
        }
    });

    // Event listeners for selecting options from dropdowns
    document.getElementById('filter-options').addEventListener('click', async (event) => {
        if (event.target.tagName === 'LI') {
            currentSubCategory = event.target.dataset.value || null;
            document.getElementById('filter-dropdown').style.display = 'none';
            console.log('Mobile filter option selected, setting subCategory to:', currentSubCategory, 'for mainCategory:', currentMainCategory);
            console.log('Starting mobile filter change');
            showLoading(true);
            console.log('showLoading(true) in mobile filter change');
            try {
                console.log('Entering try in mobile filter change');
                clearPartsContainer();
                await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
                console.log('Exiting try in mobile filter change');
            } finally {
                console.log('Entering finally in mobile filter change');
                setTimeout(() => {
                    showLoading(false);
                    console.log('showLoading(false) after timeout in mobile filter change finally');
                }, 100);
            }
            scrollToTop();
        }
    });

    document.getElementById('sort-options').addEventListener('click', async (event) => {
        if (event.target.tagName === 'LI') {
            currentSortOrder = event.target.dataset.value;
            document.getElementById('sort-dropdown').style.display = 'none';
            console.log('Mobile sort option selected, setting to:', currentSortOrder, 'for mainCategory:', currentMainCategory);
            console.log('Starting mobile sort change');
            showLoading(true);
            console.log('showLoading(true) in mobile sort change');
            try {
                console.log('Entering try in mobile sort change');
                clearPartsContainer();
                await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
                console.log('Exiting try in mobile sort change');
            } finally {
                console.log('Entering finally in mobile sort change');
                setTimeout(() => {
                    showLoading(false);
                    console.log('showLoading(false) after timeout in mobile sort change finally');
                }, 100);
            }
            scrollToTop();
        }
    });

    // Desktop dropdown events
    document.getElementById('subcategory-filter').addEventListener('change', async (event) => {
        console.log('Desktop subcategory filter change event triggered');
        currentSubCategory = event.target.value || null;
        lastSource = null;
        lastSubCategory = null;
        lastId = null;
        hasMore = true;
        console.log('Desktop subcategory filter changed, setting subCategory to:', currentSubCategory, 'for mainCategory:', currentMainCategory);
        console.log('Starting desktop filter change');
        showLoading(true);
        console.log('showLoading(true) in desktop filter change');
        try {
            console.log('Entering try in desktop filter change');
            clearPartsContainer();
            console.log('Cleared parts container in desktop filter change');
            await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
            console.log('Completed fetchAndDisplayParts in desktop filter change');
            console.log('Exiting try in desktop filter change');
        } catch (error) {
            console.error('Error in desktop filter change:', error.message);
            showError(`Failed to load parts: ${error.message}`);
        } finally {
            console.log('Entering finally in desktop filter change');
            setTimeout(() => {
                showLoading(false);
                console.log('showLoading(false) after timeout in desktop filter change finally');
            }, 100);
        }
        scrollToTop();
    });

    document.getElementById('sort-order').addEventListener('change', async (event) => {
        console.log('Desktop sort order change event triggered');
        currentSortOrder = event.target.value;
        lastSource = null;
        lastSubCategory = null;
        lastId = null;
        hasMore = true;
        console.log('Desktop sort order changed, setting to:', currentSortOrder, 'for mainCategory:', currentMainCategory);
        console.log('Starting desktop sort change');
        showLoading(true);
        console.log('showLoading(true) in desktop sort change');
        try {
            console.log('Entering try in desktop sort change');
            clearPartsContainer();
            console.log('Cleared parts container in desktop sort change');
            await fetchAndDisplayParts(currentUserId, currentMainCategory, currentSubCategory, false);
            console.log('Completed fetchAndDisplayParts in desktop sort change');
            console.log('Exiting try in desktop sort change');
        } catch (error) {
            console.error('Error in desktop sort change:', error.message);
            showError(`Failed to load parts: ${error.message}`);
        } finally {
            console.log('Entering finally in desktop sort change');
            setTimeout(() => {
                showLoading(false);
                console.log('showLoading(false) after timeout in desktop sort change finally');
            }, 100);
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
                    const categorySelect = document.getElementById('mobile-menu-select');
                    const filterSelect = document.getElementById('subcategory-filter');
                    const sortSelect = document.getElementById('sort-order');
                    const extensionWidgetContainer = document.getElementById('extension-widget-container');
                    if (menuContainer && controlsContainer && partsContainer && categorySelect && filterSelect && sortSelect && extensionWidgetContainer) {
                        console.log('All widget elements found, including extension-widget-container');
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
                console.log(`Initialization attempt ${attempt}/${MAX_RETRIES} at ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })} BST, October 10, 2025`);
                console.log('Entering try in initializeWithRetry');
                const menuItems = await fetchTopLevelMenu(currentUserId);
                if (!menuItems || menuItems.length === 0) {
                    throw new Error('No top-level menu items returned');
                }
                createMenuButtons(menuItems);
                populateMobileMenu(menuItems);
                // Use the first menu item as the initial category only if no category is already set
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
                console.log('Exiting try in initializeWithRetry');

                // Add the extension widget script
                const extensionWidgetContainer = document.getElementById('extension-widget-container');
                const widgetScript = document.createElement('script');
                widgetScript.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/madeira-extension.js';
                widgetScript.setAttribute('data-width', '160px');
                widgetScript.async = true;
                widgetScript.onload = () => {
                    console.log('Extension widget script loaded successfully');
                    // Remove the loading span
                    const loadingSpan = extensionWidgetContainer.querySelector('span');
                    if (loadingSpan) {
                        extensionWidgetContainer.removeChild(loadingSpan);
                        console.log('Removed loading span');
                    }
                    // Move the added a from body to the container
                    const bodyChildren = document.body.children;
                    const lastA = bodyChildren[bodyChildren.length - 1];
                    if (lastA && lastA.tagName === 'A' && lastA.target === '_blank' && lastA.rel === 'noopener noreferrer') {
                        extensionWidgetContainer.appendChild(lastA);
                        console.log('Moved the extension link to the container');
                    } else {
                        console.warn('Extension link not found on body');
                        extensionWidgetContainer.innerHTML = '<span>Failed to load extension widget</span>';
                    }
                };
                widgetScript.onerror = (error) => {
                    console.error('Failed to load extension widget script:', error);
                    showError('Failed to load extension widget. Please try again later.');
                    extensionWidgetContainer.innerHTML = '<span>Failed to load extension widget</span>';
                };
                extensionWidgetContainer.appendChild(widgetScript);
                console.log('Added extension widget script to extension-widget-container');
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
                console.log('Entering finally in initializeWithRetry');
                setTimeout(() => {
                    showLoading(false);
                    console.log('showLoading(false) after timeout in initializeWithRetry finally');
                }, 100);
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

        // Add a resize listener to adjust layout
        window.addEventListener('resize', () => {
            adjustLayout();
        });
    }

    init();
})();