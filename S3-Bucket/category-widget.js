// category-widget.js
// Smart Catalogue / Category management widget
// Updated: June 2026 - Replaced old isProcessing logic with clubscan.status
// Removed deprecated /login/claims calls. Uses local JWT decoding.

(function() {
    'use strict';

    const WIDGET_ID = 'categories-widget';
    let container = null;
    let pollInterval = null;

    // ====================== JWT HELPER ======================
    function decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload));
        } catch (e) {
            console.error('Failed to decode token', e);
            return null;
        }
    }

    // ====================== STATUS HELPERS (NEW) ======================
    function getStatusDisplay(status) {
        const statusMap = {
            'queued': 'Queued for processing...',
            'building_catalog': 'Building your catalogue...',
            'catalog_complete': 'Catalogue ready!',
            'complete': 'Complete',
            'error': 'An error occurred'
        };
        return statusMap[status] || 'Processing...';
    }

    function shouldShowSpinner(status) {
        // Only show spinner while actively processing
        return ['queued', 'building_catalog'].includes(status);
    }

    // ====================== INITIALIZATION ======================
    function init() {
        container = document.getElementById(WIDGET_ID);
        if (!container) {
            console.error('Category widget container not found');
            return;
        }

        const token = localStorage.getItem('authToken');
        if (!token || decodeToken(token) === null) {
            container.innerHTML = '<p>Please log in to manage categories.</p>';
            return;
        }

        renderCategoryUI();
        loadCategories();
    }

    function renderCategoryUI() {
        container.innerHTML = `
            <div class="category-widget">
                <h3>Smart Catalogue</h3>
                <div id="status-banner" style="display:none; padding:10px; background:#f0f0f0; margin-bottom:15px;"></div>

                <div id="category-list"></div>

                <div class="add-category-section">
                    <input type="text" id="new-category" placeholder="New category name">
                    <button id="add-category-btn">Add Category</button>
                </div>

                <div id="category-error" style="color:red; display:none;"></div>
            </div>
        `;

        const addBtn = container.querySelector('#add-category-btn');
        if (addBtn) {
            addBtn.addEventListener('click', addNewCategory);
        }
    }

    // ====================== LOAD CATEGORIES ======================
    async function loadCategories() {
        const token = localStorage.getItem('authToken');
        const errorDiv = container.querySelector('#category-error');
        const statusBanner = container.querySelector('#status-banner');
        const listContainer = container.querySelector('#category-list');

        try {
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/category', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await res.json();

            if (data.status === 'success') {
                // New status handling
                const clubscanStatus = data.clubscan_status || data.status || 'complete';

                if (statusBanner) {
                    statusBanner.style.display = 'block';
                    statusBanner.innerHTML = `<strong>Status:</strong> ${getStatusDisplay(clubscanStatus)}`;

                    if (shouldShowSpinner(clubscanStatus)) {
                        statusBanner.innerHTML += ' <span class="spinner"></span>';
                    }
                }

                // Render categories
                if (listContainer && data.categories) {
                    renderCategoryList(data.categories, listContainer);
                }

                // Continue polling if still processing
                if (shouldShowSpinner(clubscanStatus)) {
                    startStatusPolling();
                } else {
                    stopStatusPolling();
                }

            } else {
                if (errorDiv) {
                    errorDiv.textContent = data.error_message || 'Failed to load categories';
                    errorDiv.style.display = 'block';
                }
            }
        } catch (err) {
            console.error('Error loading categories:', err);
            if (errorDiv) {
                errorDiv.textContent = 'Network error loading categories';
                errorDiv.style.display = 'block';
            }
        }
    }

    function renderCategoryList(categories, containerEl) {
        containerEl.innerHTML = '';

        if (!categories || categories.length === 0) {
            containerEl.innerHTML = '<p>No categories yet. Add your first one above.</p>';
            return;
        }

        const ul = document.createElement('ul');
        categories.forEach(cat => {
            const li = document.createElement('li');
            li.textContent = cat.name || cat;
            ul.appendChild(li);
        });
        containerEl.appendChild(ul);
    }

    // ====================== ADD NEW CATEGORY ======================
    async function addNewCategory() {
        const input = container.querySelector('#new-category');
        const errorDiv = container.querySelector('#category-error');
        const token = localStorage.getItem('authToken');

        if (!input || !input.value.trim()) return;

        try {
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/category', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: input.value.trim() })
            });

            const result = await res.json();

            if (result.status === 'success') {
                input.value = '';
                loadCategories(); // Refresh list
            } else {
                if (errorDiv) {
                    errorDiv.textContent = result.error_message || 'Failed to add category';
                    errorDiv.style.display = 'block';
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    // ====================== STATUS POLLING ======================
    function startStatusPolling() {
        stopStatusPolling();
        pollInterval = setInterval(() => {
            loadCategories();
        }, 5000); // Poll every 5 seconds
    }

    function stopStatusPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    // Auto init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();