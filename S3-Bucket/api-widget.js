(() => {
    // **Check if the Container Exists**
    const container = document.getElementById('api-keys-container');
    if (!container) {
        console.error('API Keys Widget: Container #api-keys-container not found');
        return;
    }
    console.log('API Keys Widget: Container found, initializing widget');

    // **Inject FontAwesome CSS**
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fontAwesome = document.createElement('link');
        fontAwesome.rel = 'stylesheet';
        fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
        fontAwesome.onerror = () => console.error('Failed to load FontAwesome CSS; FontAwesome icons will not display');
        document.head.appendChild(fontAwesome);
        console.log('API Keys Widget: Injected FontAwesome CSS');
    } else {
        console.log('API Keys Widget: FontAwesome CSS already present');
    }

    // **Inject Widget HTML with Loading Overlay Visible**
    container.innerHTML = `
        <div id="api-keys-wrapper">
            <h2><i class="fas fa-key"></i> API Keys</h2>
            <div id="api-keys-list">
                <div id="loadingOverlay" style="display: flex; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); justify-content: center; align-items: center; z-index: 10;">
                    <div style="position: relative; width: 200px; height: 200px;">
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 80px; height: 80px; border-top-color: #ff6f61; top: 60px; left: 60px;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 60px; height: 60px; border-top-color: #6bff61; top: 70px; left: 70px; animation-delay: 0.3s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 40px; height: 40px; border-top-color: #61cfff; top: 80px; left: 80px; animation-delay: 0.6s;"></div>
                        <div style="position: absolute; border-radius: 50%; border: 8px solid transparent; animation: spin 1.5s linear infinite; width: 20px; height: 20px; border-top-color: #ff61ff; top: 90px; left: 90px; animation-delay: 0.9s;"></div>
                    </div>
                </div>
            </div>
            <div class="add-key"><i class="fas fa-key"></i> Add Key</div>
            <div id="add-dialog" class="add-key-form">
                <div class="dialog-content">
                    <form id="add-key-form">
                        <div id="settings-methods"></div>
                        <div id="provider-description"></div>
                        <div class="description-container">
                            <span id="provider-icon"></span>
                            <input type="text" id="description-input" placeholder="My store name" autocomplete="off" required>
                        </div>
                        <div id="api-key-fields"></div>
                        <div id="error-message" class="error"></div>
                        <button type="button" id="submit-key" disabled><i class="fas fa-key"></i> Add Key</button>
                        <button type="button" class="cancel" id="cancel-dialog"><i class="fas fa-arrow-left"></i> Cancel</button>
                    </form>
                </div>
            </div>
            <div id="delete-dialog" class="delete-dialog">
                <div class="dialog-content">
                    <form id="delete-key-form">
                        <p>Warning: Deleting this API key cannot be undone.</p>
                        <p>Type "confirm" to proceed with deleting: <span id="key-to-delete"></span></p>
                        <input type="text" id="confirm-input" autocomplete="off">
                        <button type="button" id="confirm-delete" disabled><i class="fas fa-check"></i> Confirm</button>
                        <button type="button" id="cancel-delete"><i class="fas fa-arrow-left"></i> Cancel</button>
                    </form>
                </div>
            </div>
            <div id="tos-dialog" class="tos-dialog">
                <div class="dialog-content">
                    <h2>Merchant Terms of Service</h2>
                    <div id="tos-content" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-bottom: 15px; font-size: 14px; line-height: 1.5; white-space: pre-wrap;"></div>
                    <div class="tos-agree-container">
                        <div class="checkbox-wrapper">
                            <input type="checkbox" id="tos-agree" disabled>
                        </div>
                        <label for="tos-agree" class="tos-label">I agree to the Terms of Service</label>
                    </div>
                    <button id="add-role-btn" disabled>Add Merchant Role</button>
                    <button id="cancel-tos">Cancel</button>
                </div>
            </div>
        </div>
    `;
    console.log('API Keys Widget: Injected widget HTML with loading overlay visible');

    // **Inject Updated CSS**
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        #api-keys-wrapper {
            max-width: 600px;
            margin: 20px auto;
            padding: 20px;
            border: 2px solid #ccc;
            border-radius: 8px;
            background: #f9f9f9;
            font-family: Arial, sans-serif;
            position: relative;
            min-height: 500px;
        }
        #api-keys-wrapper h2 {
            margin-top: 0;
            font-size: 1.5em;
            color: #333;
        }
        #api-keys-wrapper h2 i {
            font-size: 2em;
            margin-right: 10px;
            vertical-align: middle;
            color: #007bff;
        }
        #api-keys-wrapper table {
            width: 100%;
            border-collapse: collapse;
        }
        #api-keys-wrapper th, #api-keys-wrapper td {
            padding: 5px;
            text-align: left;
        }
        #api-keys-wrapper th {
            background-color: #f8f9fa;
        }
        #api-keys-wrapper tr:nth-child(odd) {
            background-color: #ffffff;
        }
        #api-keys-wrapper tr:nth-child(even) {
            background-color: #fffde7;
        }
        #api-keys-wrapper .provider-icon {
            font-size: 36px;
            color: #007bff;
            margin-right: 5px;
        }
        #api-keys-wrapper .provider-icon svg {
            width: 1em;
            height: 1em;
        }
        #api-keys-wrapper .status-icon {
            text-align: center;
            width: 30px;
        }
        #api-keys-wrapper .status-icon .tooltip {
            position: relative;
            display: inline-block;
            cursor: pointer;
        }
        #api-keys-wrapper .status-icon .tooltip .tooltiptext {
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
        #api-keys-wrapper .status-icon .tooltip:hover .tooltiptext,
        #api-keys-wrapper .status-icon .tooltip:active .tooltiptext {
            visibility: visible;
            opacity: 1;
        }
        #api-keys-wrapper .status-icon i {
            font-size: 20px;
        }
        #api-keys-wrapper .fa-trash {
            cursor: pointer;
            color: #e74c3c;
            margin-left: 5px;
            font-size: 2em;
        }
        #api-keys-wrapper .add-key {
            position: absolute;
            bottom: 10px;
            left: 10px;
            padding: 12px 18px;
            font-size: 1.125em;
            background: #2ecc71;
            color: white;
            border-radius: 4px;
            cursor: pointer;
        }
        #api-keys-wrapper .add-key.disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: #ccc;
        }
        #api-keys-wrapper .add-key i {
            font-size: 1.125em;
            margin-right: 5px;
        }
        #request-merchant-role {
            padding: 12px 18px;
            font-size: 1.125em;
            background: #2ecc71;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            border: none;
            display: inline-block;
            margin-top: 10px;
        }
        #request-merchant-role i {
            font-size: 1.125em;
            margin-right: 5px;
        }
        #api-keys-wrapper .add-key-form, #api-keys-wrapper .delete-dialog, #api-keys-wrapper .tos-dialog {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 15;
        }
        #api-keys-wrapper .add-key-form.show, #api-keys-wrapper .delete-dialog.show, #api-keys-wrapper .tos-dialog.show {
            display: block;
        }
        #api-keys-wrapper .dialog-content {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            width: 90%;
            max-width: 400px;
            max-height: calc(100vh - 120px);
            overflow-y: auto;
            position: absolute;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
        }
        #api-keys-wrapper .dialog-content input, #api-keys-wrapper .dialog-content button {
            display: block;
            width: 100%;
            margin: 10px 0;
            padding: 8px;
            box-sizing: border-box;
        }
        #api-keys-wrapper .add-key-form .dialog-content button#submit-key {
            background: #3498db;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        #api-keys-wrapper .dialog-content button#cancel-dialog, #api-keys-wrapper .dialog-content button#cancel-tos {
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        #api-keys-wrapper .delete-dialog .dialog-content button#confirm-delete {
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        #api-keys-wrapper .dialog-content button#cancel-delete {
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        #api-keys-wrapper .dialog-content button#add-role-btn {
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        #api-keys-wrapper .dialog-content button[disabled] {
            opacity: 0.5;
            cursor: not-allowed;
            background: #ccc;
        }
        #api-keys-wrapper .error {
            color: #e74c3c;
            font-size: 0.9em;
            margin: 10px 0;
        }
        #settings-methods {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 10px 0;
        }
        #settings-methods input[type="radio"] {
            display: none;
        }
        #settings-methods .provider-radio-icon {
            font-size: 36px;
            color: #6c757d;
            cursor: pointer;
            transition: color 0.2s ease;
        }
        #settings-methods .provider-radio-icon svg {
            width: 1em;
            height: 1em;
        }
        #settings-methods .provider-radio-icon.active {
            color: #007bff;
        }
        #settings-methods .provider-radio-icon:hover {
            color: #007bff;
        }
        .description-container {
            display: flex;
            align-items: center;
            margin: 10px 0;
        }
        #provider-icon {
            margin-right: 10px;
            font-size: 36px;
            color: #007bff;
        }
        #provider-icon svg {
            width: 1em;
            height: 1em;
        }
        #provider-description {
            margin: 10px 0;
            font-size: 1em;
            color: #333;
        }
        #description-input {
            flex-grow: 1;
        }
        .tos-agree-container {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .tos-agree-container .checkbox-wrapper {
            width: 24px;
            padding: 2px;
        }
        .tos-agree-container input[type="checkbox"] {
            width: 20px;
            height: 20px;
        }
        .tos-agree-container .tos-label {
            white-space: nowrap;
            margin-left: 10px;
        }
        .password-input {
            position: relative;
            margin: 10px 0;
        }
        .password-input input {
            width: 100%;
            padding: 8px;
            box-sizing: border-box;
        }
        .password-input .toggle-password {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            cursor: pointer;
            font-size: 16px;
            color: #555;
        }
        #api-keys-list {
            position: relative;
            min-height: 200px;
        }
        @media (max-width: 768px) {
            .provider-name {
                display: none;
            }
        }
        #settings-methods .provider-radio-icon svg,
        #api-keys-wrapper .provider-icon svg,
        #provider-icon svg {
            fill: currentColor;
        }
    `;
    document.head.appendChild(style);

    // **Widget Logic**
    const BASE_API_URL = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod';
    const API_URL = `${BASE_API_URL}/ui/api-keys`;
    const widget = document.getElementById('api-keys-wrapper');
    const list = document.getElementById('api-keys-list');
    const addDialog = document.getElementById('add-dialog');
    const descriptionInput = document.getElementById('description-input');
    const settingsFields = document.getElementById('api-key-fields');
    const submitBtn = document.getElementById('submit-key');
    const cancelBtn = document.getElementById('cancel-dialog');
    const errorDiv = document.getElementById('error-message');
    const providerLabel = document.getElementById('provider-icon');
    const deleteDialog = document.getElementById('delete-dialog');
    const keyToDeleteSpan = deleteDialog.querySelector('#key-to-delete');
    const confirmInput = document.getElementById('confirm-input');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    const addKeyForm = document.getElementById('add-key-form');
    const radioGroup = document.getElementById('settings-methods');
    const tosDialog = document.getElementById('tos-dialog');
    const tosContent = document.getElementById('tos-content');
    const tosAgreeCheckbox = document.getElementById('tos-agree');
    const addRoleBtn = document.getElementById('add-role-btn');
    const cancelTosBtn = document.getElementById('cancel-tos');
    let cachedProviders = null;
    let keyToDelete = null;
    let userRoles = [];
    let customIconsCache = {};

    const customIconUrls = {
        'custom-magento': 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/magento.svg',
        'custom-bigcommerce': 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/bigcommerce.svg',
        'custom-awin': 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/awin.svg'
    };

    function sanitizeInput(input) {
        if (input == null) return '';
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    async function fetchSvgContent(url) {
        if (customIconsCache[url]) return customIconsCache[url];
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const svgContent = await response.text();
            customIconsCache[url] = svgContent;
            return svgContent;
        } catch (error) {
            console.error('fetchSvgContent error:', error);
            return '<span>⚠️</span>';
        }
    }

    function isCustomIcon(iconClass) {
        return customIconUrls[iconClass] !== undefined;
    }

    async function renderIcon(iconClass) {
        const sanitizedIcon = sanitizeInput(iconClass);
        if (!sanitizedIcon) return '<span>⚠️</span>';
        if (isCustomIcon(sanitizedIcon)) {
            try {
                return await fetchSvgContent(customIconUrls[sanitizedIcon]);
            } catch {
                return '<span>⚠️</span>';
            }
        }
        return document.querySelector('link[href*="font-awesome"]')
            ? `<i class="${sanitizedIcon}"></i>`
            : '<span>⚠️</span>';
    }

    function getStatusIconHtml(lastStatus, lastError) {
        let iconClass, color, title;
        if (lastStatus === 0) {
            iconClass = 'fas fa-spinner fa-spin';
            color = '#333';
            title = 'Waiting for index...';
        } else if (lastStatus !== 0 && lastStatus !== 200) {
            iconClass = 'fas fa-exclamation-circle';
            color = '#e74c3c';
            title = lastError || 'Error';
        } else {
            iconClass = 'fas fa-check-circle';
            color = '#2ecc71';
            title = lastError || 'Success';
        }
        return `
            <span class="tooltip">
                <i class="${iconClass}" style="color: ${color};"></i>
                <span class="tooltiptext">${sanitizeInput(title)}</span>
            </span>
        `;
    }

    async function resetAddDialog() {
        descriptionInput.value = '';
        settingsFields.innerHTML = '';
        errorDiv.textContent = '';
        providerLabel.innerHTML = '';
        document.getElementById('provider-description').textContent = '';
        descriptionInput.placeholder = 'My store name';
        submitBtn.disabled = true;
        addKeyForm.reset();
        const radioButtons = radioGroup.querySelectorAll('input[name="provider"]');
        if (radioButtons.length > 0) {
            radioButtons[0].checked = true;
            await repopulateForm(radioButtons[0].value);
        }
    }

    async function handleFetch(url, options) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    function checkTokenAndRedirect() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login.html';
            return false;
        }
        return true;
    }

    function decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decoded);
        } catch (e) {
            console.error('Token decoding failed:', e);
            return null;
        }
    }

    function isTokenValid(token) {
        if (!token) return false;
        const decoded = decodeToken(token);
        if (!decoded || !decoded.exp) return false;
        return decoded.exp > Math.floor(Date.now() / 1000);
    }

    function setAuthToken(token) {
        localStorage.setItem('authToken', token);
    }

    // ====================== FIXED: Local JWT Decoding ======================
    async function fetchUserRoles() {
        if (!checkTokenAndRedirect()) {
            userRoles = ['notoken'];
            return;
        }
        const token = localStorage.getItem('authToken');
        try {
            const decoded = decodeToken(token);
            userRoles = decoded?.permissions || decoded?.roles || [];

            const addKeyButton = document.querySelector('.add-key');
            if (addKeyButton) {
                addKeyButton.classList.toggle('disabled', !hasMerchantRole());
            }
        } catch (error) {
            console.error('fetchUserRoles: Error decoding token for roles:', error);
            userRoles = [];
            const addKeyButton = document.querySelector('.add-key');
            if (addKeyButton) addKeyButton.classList.add('disabled');
        }
    }

    function hasMerchantRole() {
        return userRoles.includes('merchant');
    }

    // ====================== Rest of the widget (unchanged) ======================

    async function showTosAgreement() {
        if (!checkTokenAndRedirect()) return;
        const token = localStorage.getItem('authToken');
        try {
            document.getElementById('loadingOverlay').style.display = 'flex';
            const response = await fetch(`${BASE_API_URL}/login/tos?service=merchant`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to load Terms of Service');
            tosContent.textContent = await response.text();
            tosDialog.classList.add('show');
            tosAgreeCheckbox.disabled = true;
            tosAgreeCheckbox.checked = false;
            addRoleBtn.disabled = true;

            tosContent.addEventListener('scroll', function handleScroll() {
                if (tosContent.scrollTop + tosContent.clientHeight >= tosContent.scrollHeight) {
                    tosAgreeCheckbox.disabled = false;
                }
            });
            tosAgreeCheckbox.addEventListener('change', () => {
                addRoleBtn.disabled = !tosAgreeCheckbox.checked;
            });
            addRoleBtn.addEventListener('click', async () => {
                if (!tosAgreeCheckbox.checked) return;
                const token = localStorage.getItem('authToken');
                try {
                    const response = await handleFetch(`${BASE_API_URL}/login/add-role`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: 'merchant', agreedToTos: true })
                    });
                    if (response.token) setAuthToken(response.token);
                    await fetchUserRoles();
                    tosDialog.classList.remove('show');
                    await initializeWidget();
                } catch (error) {
                    tosContent.textContent = 'Failed to add merchant role. Please try again.';
                }
            });
            cancelTosBtn.addEventListener('click', () => tosDialog.classList.remove('show'));
        } catch (error) {
            console.error('showTosAgreement: Error:', error);
            tosContent.textContent = 'Failed to load Terms of Service. Please try again.';
        } finally {
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }

    async function initializeWidget() {
        if (!checkTokenAndRedirect()) return;
        document.getElementById('loadingOverlay').style.display = 'flex';
        try {
            await fetchUserRoles();
            if (!hasMerchantRole()) {
                list.innerHTML = `
                    <p>You need the merchant role to manage API keys.</p>
                    <button id="request-merchant-role"><i class="fas fa-user-plus"></i> Request Merchant Role</button>
                `;
                document.getElementById('request-merchant-role').addEventListener('click', showTosAgreement);
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                return;
            }
            await fetchApiKeys();
        } catch (error) {
            console.error('initializeWidget: Failed to initialize:', error);
            list.innerHTML = `<p>Error initializing widget. Check console for details.</p>`;
        } finally {
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }

    async function fetchApiKeys() {
        if (!checkTokenAndRedirect()) return;
        const token = localStorage.getItem('authToken');
        document.getElementById('loadingOverlay').style.display = 'flex';
        try {
            const keys = await handleFetch(API_URL, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            await displayApiKeys(keys);
        } catch (err) {
            list.innerHTML = `<p class="error">Error: ${err.message}</p>`;
        } finally {
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }

    async function displayApiKeys(keys) {
        if (!Array.isArray(keys) || keys.length === 0) {
            list.innerHTML = '<p>No API keys found.</p>';
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
        }
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th></th>
                    <th class="provider-name">Provider</th>
                    <th>Description</th>
                    <th></th>
                    <th></th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        const iconHtmls = await Promise.all(keys.map(key => renderIcon(key.Icon)));
        keys.forEach((key, index) => {
            const statusIconHtml = getStatusIconHtml(key.LastStatus, key.LastError);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="provider-icon">${iconHtmls[index]}</td>
                <td class="provider-name">${sanitizeInput(key.api_key_type)}</td>
                <td>${sanitizeInput(key.Description)}</td>
                <td class="status-icon">${statusIconHtml}</td>
                <td><i class="fas fa-trash" data-type="${sanitizeInput(key.api_key_type)}" data-key-desc="${sanitizeInput(key.Description)}"></i></td>
            `;
            tbody.appendChild(row);
        });
        list.innerHTML = table.outerHTML;
        list.addEventListener('click', handleDeleteClick);
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    function handleDeleteClick(event) {
        if (event.target.classList.contains('fa-trash')) {
            const type = event.target.dataset.type;
            const desc = event.target.dataset.keyDesc;
            keyToDelete = { type, desc };
            keyToDeleteSpan.textContent = `${sanitizeInput(type)} - ${sanitizeInput(desc)}`;
            deleteDialog.classList.add('show');
            confirmInput.value = '';
            confirmDeleteBtn.disabled = true;
        }
    }

    async function deleteApiKey(apiKeyType, description) {
        if (!checkTokenAndRedirect()) return;
        const token = localStorage.getItem('authToken');
        const formData = new URLSearchParams();
        formData.append('api_key_type', sanitizeInput(apiKeyType));
        formData.append('Description', sanitizeInput(description));
        document.getElementById('loadingOverlay').style.display = 'flex';
        try {
            await handleFetch(API_URL, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });
            await fetchApiKeys();
        } finally {
            deleteDialog.classList.remove('show');
        }
    }

    async function fetchProviders() {
        if (!checkTokenAndRedirect()) return;
        const token = localStorage.getItem('authToken');
        document.getElementById('loadingOverlay').style.display = 'flex';
        try {
            cachedProviders = await handleFetch(`${API_URL}/providers`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!Array.isArray(cachedProviders) || cachedProviders.length === 0) {
                errorDiv.textContent = 'No providers available.';
                cachedProviders = [];
                submitBtn.disabled = true;
            } else {
                await renderProviderRadioGroup(cachedProviders);
                await repopulateForm(cachedProviders[0].Comment);
            }
        } catch (error) {
            errorDiv.textContent = 'Failed to load providers.';
            cachedProviders = [];
            await renderProviderRadioGroup(cachedProviders);
            submitBtn.disabled = true;
        } finally {
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }

    async function renderProviderRadioGroup(providers) {
        radioGroup.innerHTML = '';
        if (!providers || providers.length === 0) {
            radioGroup.innerHTML = '<p>No providers available.</p>';
            submitBtn.disabled = true;
            return;
        }
        const iconHtmls = await Promise.all(providers.map(provider => renderIcon(provider.Icon)));
        providers.forEach((provider) => {
            if (!provider || !provider.Comment) return;
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'provider';
            input.value = sanitizeInput(provider.Comment);
            const span = document.createElement('span');
            span.className = 'provider-radio-icon';
            span.title = sanitizeInput(provider.Comment);
            span.innerHTML = iconHtmls[providers.indexOf(provider)];
            label.appendChild(input);
            label.appendChild(span);
            radioGroup.appendChild(label);
            span.addEventListener('click', () => {
                input.checked = true;
                repopulateForm(provider.Comment);
            });
        });
        const firstProvider = radioGroup.querySelector('input[name="provider"]');
        if (firstProvider) {
            firstProvider.checked = true;
            firstProvider.nextElementSibling.classList.add('active');
        }
    }

    async function repopulateForm(apiKeyType) {
        descriptionInput.value = '';
        settingsFields.innerHTML = '';
        errorDiv.textContent = '';
        providerLabel.innerHTML = '';
        document.getElementById('provider-description').textContent = '';
        descriptionInput.placeholder = 'My store name';
        submitBtn.disabled = true;
        addKeyForm.reset();

        const provider = cachedProviders.find(p => p.Comment === apiKeyType);
        if (!provider) {
            errorDiv.textContent = 'Provider not found';
            return;
        }
        providerLabel.innerHTML = await renderIcon(provider.Icon);
        document.getElementById('provider-description').textContent = sanitizeInput(provider.Description || provider.Comment);
        descriptionInput.placeholder = `My ${sanitizeInput(provider.Comment)} store name`;

        let settings;
        try {
            settings = JSON.parse(provider.SettingsJson);
        } catch (e) {
            errorDiv.textContent = 'Invalid provider settings';
            return;
        }

        const forbiddenKeys = ['username', 'email', 'password', 'user', 'pass', 'login', 'credential'];
        Object.keys(settings).forEach(key => {
            if (!forbiddenKeys.includes(key.toLowerCase())) {
                const inputContainer = document.createElement('div');
                inputContainer.className = 'password-input';
                inputContainer.innerHTML = `
                    <input type="password" placeholder="${sanitizeInput(key)}" name="${sanitizeInput(key)}" data-key="${sanitizeInput(key)}" autocomplete="new-password" required>
                    <i class="fas fa-eye toggle-password"></i>
                `;
                settingsFields.appendChild(inputContainer);
                const input = inputContainer.querySelector('input');
                const toggle = inputContainer.querySelector('.toggle-password');
                toggle.addEventListener('click', () => {
                    input.type = input.type === 'password' ? 'text' : 'password';
                    toggle.classList.toggle('fa-eye');
                    toggle.classList.toggle('fa-eye-slash');
                });
                input.addEventListener('input', updateAddButtonState);
            }
        });
        updateAddButtonState();
    }

    function getSelectedProvider() {
        const selectedRadio = radioGroup.querySelector('input[name="provider"]:checked');
        return selectedRadio ? selectedRadio.value : null;
    }

    function updateAddButtonState() {
        const description = descriptionInput.value.trim();
        const settingsInputs = settingsFields.querySelectorAll('input');
        const allSettingsFilled = Array.from(settingsInputs).every(input => input.value.trim());
        const providerSelected = getSelectedProvider() !== null;
        submitBtn.disabled = !(description && allSettingsFilled && providerSelected);
    }

    submitBtn.addEventListener('click', async () => {
        if (submitBtn.disabled || !checkTokenAndRedirect()) return;
        const apiKeyType = getSelectedProvider();
        if (!apiKeyType) {
            errorDiv.textContent = 'No provider selected';
            return;
        }
        const description = descriptionInput.value.trim();
        const settings = {};
        settingsFields.querySelectorAll('input').forEach(input => {
            settings[sanitizeInput(input.dataset.key)] = sanitizeInput(input.value.trim());
        });
        if (!Object.keys(settings).length) {
            errorDiv.textContent = 'Please provide API key settings';
            return;
        }
        const token = localStorage.getItem('authToken');
        document.getElementById('loadingOverlay').style.display = 'flex';
        try {
            await handleFetch(API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key_type: sanitizeInput(apiKeyType), Description: sanitizeInput(description), settings })
            });
            addDialog.classList.remove('show');
            await resetAddDialog();
            await fetchApiKeys();
        } catch (error) {
            errorDiv.textContent = 'Failed to add API key.';
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    });

    widget.addEventListener('click', async (event) => {
        if (event.target.closest('.add-key')) {
            if (!checkTokenAndRedirect()) return;
            await fetchUserRoles();
            if (!hasMerchantRole()) {
                await showTosAgreement();
                return;
            }
            await resetAddDialog();
            addDialog.classList.add('show');
            await fetchProviders();
        }
    });

    cancelBtn.addEventListener('click', () => {
        addDialog.classList.remove('show');
        resetAddDialog();
    });

    confirmInput.addEventListener('input', () => {
        confirmDeleteBtn.disabled = confirmInput.value.toLowerCase() !== 'confirm';
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        if (keyToDelete) {
            await deleteApiKey(keyToDelete.type, keyToDelete.desc);
            keyToDelete = null;
        }
    });

    cancelDeleteBtn.addEventListener('click', () => {
        deleteDialog.classList.remove('show');
        keyToDelete = null;
    });

    descriptionInput.addEventListener('input', updateAddButtonState);

    // **Initialize**
    initializeWidget();
})();