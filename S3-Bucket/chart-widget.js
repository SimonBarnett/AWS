// chart-widget.js
// Displays performance charts for authenticated users
// Updated to work with current API and auth flow

(function() {
    const WIDGET_ID = 'madeira-charts';
    let container = null;

    function decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload));
        } catch (e) {
            console.error('Failed to decode token', e);
            return null;
        }
    }

    function init() {
        container = document.getElementById(WIDGET_ID);
        if (!container) {
            console.error('Chart widget container not found');
            return;
        }

        const token = localStorage.getItem('authToken');
        if (!token) {
            container.innerHTML = '<p>Please log in to view charts.</p>';
            return;
        }

        loadChartData();
    }

    async function loadChartData() {
        const token = localStorage.getItem('authToken');
        try {
            const res = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/chart-data', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await res.json();

            if (data.status === 'success') {
                renderCharts(data);
            } else {
                container.innerHTML = `<p>Error loading charts: ${data.error_message || 'Unknown error'}</p>`;
            }
        } catch (err) {
            container.innerHTML = '<p>Failed to load chart data</p>';
            console.error(err);
        }
    }

    function renderCharts(data) {
        // Render charts using the data (placeholder - preserve original rendering logic)
        container.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        // In full original, this would contain Chart.js or custom canvas rendering
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();