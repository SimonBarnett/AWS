(function () {
    // Check if Font Awesome is loaded; if not, load it
    if (!document.querySelector('link[href*="fontawesome"]')) {
        const faLink = document.createElement('link');
        faLink.rel = 'stylesheet';
        faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
        document.head.appendChild(faLink);
    }

    // Load Chart.js
    const chartJsScript = document.createElement('script');
    chartJsScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    document.head.appendChild(chartJsScript);

    // Wait for Chart.js to load before initializing
    chartJsScript.onload = function () {
        // Inject UI container
        const container = document.getElementById('madeira-charts');
        if (!container) {
            console.error('Chart Widget: No container found with ID "madeira-charts"');
            return;
        }

        container.innerHTML = `
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .madeira-charts-container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    border: 2px solid #ccc;
                    border-radius: 8px;
                    background: #fff;
                    position: relative;
                }
                .controls {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                .control-group {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    margin: 0 10px;
                }
                .control-group label {
                    margin-right: 8px;
                    font-size: 14px;
                    text-align: right;
                }
                .control-group select {
                    padding: 5px;
                    font-size: 14px;
                    border-radius: 4px;
                }
                .frequency-radio {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .frequency-radio input[type="radio"] {
                    display: none;
                }
                .frequency-radio label {
                    cursor: pointer;
                    font-size: 36px;
                    color: #999999;
                    transition: all 0.2s ease;
                    margin: 0;
                }
                .frequency-radio input:checked + label {
                    font-size: 48px;
                    color: #007bff;
                }
                .chart-wrapper {
                    position: relative;
                    height: 400px;
                }
                .loading-overlay {
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
                .loading-overlay .spinner-container {
                    position: relative;
                    width: 200px;
                    height: 200px;
                }
                .loading-overlay .spinner {
                    position: absolute;
                    border-radius: 50%;
                    border: 8px solid transparent;
                    animation: spin 1.5s linear infinite;
                }
                .loading-overlay .spinner-1 {
                    width: 80px;
                    height: 80px;
                    border-top-color: #ff6f61;
                    top: 60px;
                    left: 60px;
                    animation-delay: 0s;
                }
                .loading-overlay .spinner-2 {
                    width: 60px;
                    height: 60px;
                    border-top-color: #6bff61;
                    top: 70px;
                    left: 70px;
                    animation-delay: 0.3s;
                }
                .loading-overlay .spinner-3 {
                    width: 40px;
                    height: 40px;
                    border-top-color: #61cfff;
                    top: 80px;
                    left: 80px;
                    animation-delay: 0.6s;
                }
                .loading-overlay .spinner-4 {
                    width: 20px;
                    height: 20px;
                    border-top-color: #ff61ff;
                    top: 90px;
                    left: 90px;
                    animation-delay: 0.9s;
                }
                .error-message {
                    text-align: center;
                    color: red;
                    font-size: 16px;
                    margin-top: 10px;
                    white-space: pre-wrap;
                }
                .login-message {
                    text-align: center;
                    font-size: 18px;
                    color: #333;
                    margin-top: 20px;
                }
            </style>
            <div class="madeira-charts-container">
                <div id="chart-content" style="display: none;">
                    <div class="controls">
                        <div class="control-group">
                            <div class="frequency-radio">
                                <input type="radio" id="granularity-daily" name="granularity" value="day" checked>
                                <label for="granularity-daily" title="Daily"><i class="fas fa-calendar-day"></i></label>
                                <input type="radio" id="granularity-weekly" name="granularity" value="week">
                                <label for="granularity-weekly" title="Weekly"><i class="fas fa-calendar-week"></i></label>
                                <input type="radio" id="granularity-monthly" name="granularity" value="month">
                                <label for="granularity-monthly" title="Monthly"><i class="fas fa-calendar-alt"></i></label>
                            </div>
                        </div>
                        <div class="control-group">
                            <select id="reportType">
                                <!-- Populated dynamically -->
                            </select>
                        </div>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="madeiraChart"></canvas>
                    </div>
                    <div class="error-message" id="errorMessage" style="display: none;"></div>
                    <div class="loading-overlay" id="loading">
                        <div class="spinner-container">
                            <div class="spinner spinner-1"></div>
                            <div class="spinner spinner-2"></div>
                            <div class="spinner spinner-3"></div>
                            <div class="spinner spinner-4"></div>
                        </div>
                    </div>
                </div>
                <div id="login-message" class="login-message" style="display: none;">
                    <i class="fas fa-sign-in-alt"></i> Please log in to view the chart.
                </div>
            </div>
        `;

        const chartContent = container.querySelector('#chart-content');
        const loginMessage = container.querySelector('#login-message');

        // **Authentication Functions**
        function decodeToken(token) {
            try {
                const payload = token.split('.')[1];
                const decoded = atob(payload);
                return JSON.parse(decoded);
            } catch (error) {
                console.error('Error decoding token:', error.message);
                return null;
            }
        }

        function isTokenValid() {
            const token = getAuthToken();
            if (!token) {
                console.log('No auth token found in localStorage');
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

        function getAuthToken() {
            return localStorage.getItem('authToken');
        }

        // Check token validity
        if (!isTokenValid()) {
            loginMessage.style.display = 'block';
            window.location.href = '/login.html';
            return;
        }

        chartContent.style.display = 'block';

        // **Chart Initialization**
        const ctx = container.querySelector('#madeiraChart').getContext('2d');
        let chartInstance = null;

        // **Utility Functions**
        function populateReportTypeDropdown(permittedViews, currentSelection) {
            const reportTypeSelect = container.querySelector('#reportType');
            reportTypeSelect.innerHTML = '';

            const options = Array.isArray(permittedViews) && permittedViews.length > 0 ? permittedViews : [];
            if (options.length === 0) {
                console.warn('No permitted views received; dropdown will be empty');
                reportTypeSelect.disabled = true;
                return false;
            }

            options.forEach(view => {
                const option = document.createElement('option');
                option.value = view;
                option.textContent = view;
                if (view === currentSelection) {
                    option.selected = true;
                }
                reportTypeSelect.appendChild(option);
            });

            if (!reportTypeSelect.value) {
                reportTypeSelect.value = options[0];
            }
            reportTypeSelect.disabled = false;
            return true;
        }

        // **Fetch and Render Chart Data**
        async function fetchChartData() {
            const granularityInputs = container.querySelectorAll('[name="granularity"]');
            let granularity = 'day';
            for (const input of granularityInputs) {
                if (input.checked) {
                    granularity = input.value;
                    break;
                }
            }

            let reportType = container.querySelector('#reportType').value;
            const reportTypeSelect = container.querySelector('#reportType');
            const loadingElement = container.querySelector('#loading');
            const errorElement = container.querySelector('#errorMessage');
            loadingElement.style.display = 'flex';
            errorElement.style.display = 'none';
            errorElement.innerHTML = '';

            const authToken = getAuthToken();
            const headers = new Headers();
            if (authToken) {
                headers.append('Authorization', `Bearer ${authToken}`);
            } else {
                console.error('No auth token available');
                errorElement.style.display = 'block';
                errorElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Authentication required';
                loadingElement.style.display = 'none';
                window.location.href = '/login.html';
                return;
            }

            try {
                const url = `https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/chart-data?granularity=${granularity}&report_type=${encodeURIComponent(reportType)}`;
                const response = await fetch(url, { method: 'GET', headers });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(`HTTP ${response.status}: ${err.message || 'Unknown error'}`);
                }
                const data = await response.json();
                loadingElement.style.display = 'none';

                if (data.chartData && Array.isArray(data.chartData.labels) && Array.isArray(data.chartData.datasets)) {
                    if (!populateReportTypeDropdown(data.permittedViews, reportType)) {
                        errorElement.style.display = 'block';
                        errorElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No permitted reports available';
                        return;
                    }

                    if (!reportType || !data.permittedViews.includes(reportType)) {
                        reportType = data.permittedViews[0];
                        reportTypeSelect.value = reportType;
                        console.log('Updated reportType to first permitted view:', reportType);
                        return fetchChartData();
                    }

                    const labels = data.chartData.labels;
                    const datasets = data.chartData.datasets;
                    const rangeLabels = granularity === 'day' ? 
                        ['This Week', 'Last Week', 'Week Before'] :
                        granularity === 'week' ? 
                        ['This Quarter', 'Last Quarter', 'Quarter Before'] :
                        ['This Year', 'Last Year', 'Year Before'];

                    if (chartInstance) {
                        chartInstance.destroy();
                    }

                    chartInstance = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels,
                            datasets: [
                                {
                                    label: rangeLabels[0],
                                    data: datasets[0].data,
                                    backgroundColor: '#007bff',
                                    borderColor: '#007bff',
                                    borderWidth: 1
                                },
                                {
                                    label: rangeLabels[1],
                                    data: datasets[1].data,
                                    backgroundColor: '#c0c0c0',
                                    borderColor: '#c0c0c0',
                                    borderWidth: 1
                                },
                                {
                                    label: rangeLabels[2],
                                    data: datasets[2].data,
                                    backgroundColor: '#d3d3d3',
                                    borderColor: '#d3d3d3',
                                    borderWidth: 1
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { 
                                    title: { 
                                        display: true, 
                                        text: granularity === 'day' ? 'Day of Week' : 
                                              granularity === 'week' ? 'Week Number' : 'Month' 
                                    } 
                                },
                                y: { 
                                    title: { display: true, text: 'Count' }, 
                                    beginAtZero: true,
                                    ticks: { 
                                        stepSize: 1,
                                        callback: function(value) { return Number.isInteger(value) ? value : ''; }
                                    }
                                }
                            },
                            plugins: {
                                legend: { display: true }
                            }
                        }
                    });
                } else {
                    throw new Error('Invalid response format');
                }
            } catch (error) {
                loadingElement.style.display = 'none';
                errorElement.style.display = 'block';
                errorElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error: ' + error.message + ' (Check server logs for details)';
            }
        }

        // **Event Listeners**
        const granularityInputs = container.querySelectorAll('[name="granularity"]');
        for (const input of granularityInputs) {
            input.addEventListener('change', fetchChartData);
        }

        container.querySelector('#reportType').addEventListener('change', fetchChartData);

        // Initial fetch
        fetchChartData();
    };
})();