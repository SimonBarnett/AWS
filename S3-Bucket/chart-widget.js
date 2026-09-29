// ====================== routes/ui/chart-widget.js ======================
// FULL AND UNABRIDGED REWRITE 
// - Uses backend that returns roles + permittedViews WITH ICONS
// - Role radio selector (dynamic from backend)
// - Report radio selector (dynamic from backend)
// - Granularity radio at top
// - Container around each radio group + title BELOW the group
// - Consistent icon size across all groups (based on role style)
// - No text labels on role/report options (text used only as hover/title)
// - Period, Role and Report groups on a SINGLE LINE
// - Audio Tour icon placed to the RIGHT of the Report radio group
// - Every major feature from original preserved + improved
// - Audio Tour loads completely asynchronously — does NOT block chart loading
// - Help button only appears after Audio Tour data has finished loading (handled inside audiotour.js)
// - FIXED: Report selection now reliably triggers chart update on first click

(function () {
    // ====================== LOAD DEPENDENCIES ======================
    
    // Load Font Awesome icons if not already present
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

    // Wait for Chart.js to finish loading before initializing the widget
    chartJsScript.onload = function () {

        // ====================== FIND CONTAINER ======================
        const container = document.getElementById('madeira-charts');
        if (!container) {
            console.error('[ChartWidget] No container found with ID "madeira-charts"');
            return;
        }

        // ====================== INJECT HTML + CSS ======================
        container.innerHTML = `
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .madeira-charts-container {
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 24px;
                    border: 2px solid #e0e0e0;
                    border-radius: 12px;
                    background: #fff;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                    position: relative;
                }

                .controls {
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                    align-items: flex-start;
                    gap: 28px;
                    margin-bottom: 24px;
                }

                .control-group-container {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 6px;
                }

                .radio-group {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    flex-wrap: wrap;
                    padding: 10px 14px;
                    background: #f8f9fa;
                    border: 1px solid #e0e0e0;
                    border-radius: 10px;
                }

                .group-title {
                    font-size: 12px;
                    font-weight: 600;
                    color: #555;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    padding-left: 4px;
                }

                .frequency-radio,
                .role-radio,
                .report-radio {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    flex-wrap: wrap;
                }

                .frequency-radio input[type="radio"],
                .role-radio input[type="radio"],
                .report-radio input[type="radio"] {
                    display: none;
                }

                .frequency-radio label {
                    cursor: pointer;
                    font-size: 26px;
                    color: #aaa;
                    padding: 8px 12px;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                }

                .frequency-radio input:checked + label {
                    color: #007bff;
                    background: #e6f0ff;
                }

                .madeira-signup-option,
                .report-option {
                    cursor: pointer;
                    display: inline-flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 8px 10px;
                    border-radius: 10px;
                    transition: all 0.2s ease;
                    border: 2px solid transparent;
                }

                .madeira-signup-option:hover,
                .report-option:hover {
                    background: #f0f4f8;
                }

                .madeira-signup-option.selected,
                .report-option.selected {
                    border-color: #007bff;
                    background: #f0f7ff;
                }

                .icon-wrapper {
                    font-size: 28px;
                    color: #555;
                    line-height: 1;
                }

                .madeira-signup-option.selected .icon-wrapper,
                .report-option.selected .icon-wrapper {
                    color: #007bff;
                }

                .chart-wrapper {
                    position: relative;
                    height: 420px;
                    background: #fafafa;
                    border-radius: 8px;
                    padding: 12px;
                }

                .loading-overlay {
                    display: none;
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.85);
                    justify-content: center;
                    align-items: center;
                    z-index: 10;
                    border-radius: 8px;
                }

                .loading-overlay .spinner-container {
                    position: relative;
                    width: 160px;
                    height: 160px;
                }

                .loading-overlay .spinner {
                    position: absolute;
                    border-radius: 50%;
                    border: 6px solid transparent;
                    animation: spin 1.4s linear infinite;
                }

                .loading-overlay .spinner-1 { width: 70px; height: 70px; border-top-color: #ff6f61; top: 45px; left: 45px; }
                .loading-overlay .spinner-2 { width: 52px; height: 52px; border-top-color: #6bff61; top: 54px; left: 54px; animation-delay: 0.25s; }
                .loading-overlay .spinner-3 { width: 34px; height: 34px; border-top-color: #61cfff; top: 63px; left: 63px; animation-delay: 0.5s; }
                .loading-overlay .spinner-4 { width: 18px; height: 18px; border-top-color: #ff61ff; top: 71px; left: 71px; animation-delay: 0.75s; }

                .error-message {
                    text-align: center;
                    color: #d32f2f;
                    font-size: 15px;
                    margin-top: 12px;
                    padding: 12px;
                    background: #fff0f0;
                    border-radius: 6px;
                    white-space: pre-wrap;
                }

                .login-message {
                    text-align: center;
                    font-size: 18px;
                    color: #555;
                    margin-top: 40px;
                }

                /* Audio tour placement to the right of Report group */
                .audiotour-placement {
                    display: inline-flex;
                    align-items: center;
                    margin-left: 12px;
                    height: 52px;
                }
            </style>

            <div class="madeira-charts-container">
                <div id="chart-content" style="display: none;">
                    <div class="controls">

                        <!-- Period Group -->
                        <div class="control-group-container">
                            <div class="radio-group frequency-radio">
                                <input type="radio" id="granularity-daily" name="granularity" value="day" checked>
                                <label for="granularity-daily" title="Daily"><i class="fas fa-calendar-day"></i></label>
                                
                                <input type="radio" id="granularity-weekly" name="granularity" value="week">
                                <label for="granularity-weekly" title="Weekly"><i class="fas fa-calendar-week"></i></label>
                                
                                <input type="radio" id="granularity-monthly" name="granularity" value="month">
                                <label for="granularity-monthly" title="Monthly"><i class="fas fa-calendar-alt"></i></label>
                            </div>
                            <div class="group-title">Period</div>
                        </div>

                        <!-- Role Group -->
                        <div class="control-group-container">
                            <div class="radio-group role-radio" id="role-selector">
                                <!-- Populated dynamically by JavaScript -->
                            </div>
                            <div class="group-title">Role</div>
                        </div>

                        <!-- Report Group + Audio Tour (to the right) -->
                        <div style="display: flex; align-items: flex-start; gap: 8px;">
                            <div class="control-group-container">
                                <div class="radio-group report-radio" id="report-selector">
                                    <!-- Populated dynamically by JavaScript -->
                                </div>
                                <div class="group-title">Report</div>
                            </div>

                            <!-- Audio Tour Placement Element -->
                            <div class="audiotour-placement" container="madeira-charts-container"></div>
                        </div>

                    </div>

                    <div class="chart-wrapper">
                        <canvas id="madeiraChart"></canvas>
                        
                        <div class="loading-overlay" id="loading">
                            <div class="spinner-container">
                                <div class="spinner spinner-1"></div>
                                <div class="spinner spinner-2"></div>
                                <div class="spinner spinner-3"></div>
                                <div class="spinner spinner-4"></div>
                            </div>
                        </div>
                    </div>

                    <div class="error-message" id="errorMessage" style="display: none;"></div>

                </div>

                <div id="login-message" class="login-message" style="display: none;">
                    <i class="fas fa-sign-in-alt"></i> Please log in to view the chart.
                </div>
            </div>
        `;

        // ====================== DOM REFERENCES ======================
        const chartContent     = container.querySelector('#chart-content');
        const loginMessage     = container.querySelector('#login-message');
        const ctx              = container.querySelector('#madeiraChart').getContext('2d');
        const loadingOverlay   = container.querySelector('#loading');
        const errorMessage     = container.querySelector('#errorMessage');
        const roleSelector     = container.querySelector('#role-selector');
        const reportSelector   = container.querySelector('#report-selector');

        let chartInstance = null;
        let currentRole = null;
        let lastResponseData = null;
        let radiosBuilt = false;

        // ====================== AUTHENTICATION ======================
        function decodeToken(token) {
            try {
                return JSON.parse(atob(token.split('.')[1]));
            } catch (e) {
                return null;
            }
        }

        function isTokenValid() {
            const token = localStorage.getItem('authToken');
            if (!token) return false;

            const decoded = decodeToken(token);
            if (!decoded || !decoded.exp) return false;

            return decoded.exp > Math.floor(Date.now() / 1000);
        }

        if (!isTokenValid()) {
            loginMessage.style.display = 'block';
            window.location.href = '/login.html';
            return;
        }

        chartContent.style.display = 'block';

        // ====================== BUILD ROLE RADIOS ======================
        function buildRoleRadios(roles) {
            roleSelector.innerHTML = '';

            roles.forEach((roleObj, index) => {
                const roleName = roleObj.name;
                const icon = roleObj.icon || 'fa-user';

                const label = document.createElement('label');
                label.className = 'madeira-signup-option';
                label.title = roleName.charAt(0).toUpperCase() + roleName.slice(1);

                if (index === 0) {
                    label.classList.add('selected');
                    currentRole = roleName;
                }

                label.innerHTML = `
                    <input type="radio" name="role" value="${roleName}" ${index === 0 ? 'checked' : ''}>
                    <div class="icon-wrapper">
                        <i class="fas ${icon} fa-icon"></i>
                    </div>
                `;

                label.addEventListener('click', () => {
                    roleSelector.querySelectorAll('.madeira-signup-option').forEach(el => el.classList.remove('selected'));
                    label.classList.add('selected');

                    currentRole = roleName;
                    fetchChartDataWithRole(roleName);
                });

                roleSelector.appendChild(label);
            });
        }

        // ====================== BUILD REPORT RADIOS (FIXED) ======================
        function buildReportRadios(reports) {
            reportSelector.innerHTML = '';

            if (!reports || reports.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#999; font-size:13px; padding:8px 12px;';
                empty.textContent = 'No reports available';
                reportSelector.appendChild(empty);
                return;
            }

            reports.forEach((reportObj, index) => {
                const reportName = reportObj.name;
                const icon = reportObj.icon || 'fa-chart-bar';

                const label = document.createElement('label');
                label.className = 'report-option';
                label.title = reportName;

                if (index === 0) label.classList.add('selected');

                label.innerHTML = `
                    <input type="radio" name="report" value="${reportName}" ${index === 0 ? 'checked' : ''}>
                    <div class="icon-wrapper">
                        <i class="fas ${icon} fa-icon"></i>
                    </div>
                `;

                const radioInput = label.querySelector('input[type="radio"]');

                // FIXED: Ensure radio is checked immediately + pass value directly
                label.addEventListener('click', () => {
                    radioInput.checked = true;

                    reportSelector.querySelectorAll('.report-option').forEach(el => el.classList.remove('selected'));
                    label.classList.add('selected');

                    fetchChartData(reportName);
                });

                reportSelector.appendChild(label);
            });
        }

        // ====================== FETCH CHART DATA ======================
        async function fetchChartData(forcedReportType = null) {
            let granularity = 'day';
            const granularityInputs = container.querySelectorAll('[name="granularity"]');
            for (const input of granularityInputs) {
                if (input.checked) {
                    granularity = input.value;
                    break;
                }
            }

            let reportType = forcedReportType;
            if (!reportType) {
                const checkedReport = container.querySelector('[name="report"]:checked');
                reportType = checkedReport ? checkedReport.value : null;
            }

            loadingOverlay.style.display = 'flex';
            errorMessage.style.display = 'none';

            const token = localStorage.getItem('authToken');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            try {
                let url = `https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/chart-data?granularity=${granularity}`;
                if (reportType) {
                    url += `&report_type=${encodeURIComponent(reportType)}`;
                }

                const response = await fetch(url, { headers });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP ${response.status}`);
                }

                const data = await response.json();
                lastResponseData = data;

                loadingOverlay.style.display = 'none';

                if (!data.chartData || !data.chartData.labels || !data.chartData.datasets) {
                    throw new Error('Invalid chart data format from server');
                }

                // Only build radios on the very first load
                if (!radiosBuilt) {
                    if (data.roles && data.roles.length > 0) {
                        buildRoleRadios(data.roles);
                    }
                    if (data.permittedViews && data.permittedViews.length > 0) {
                        buildReportRadios(data.permittedViews);
                    }
                    radiosBuilt = true;
                }

                const rangeLabels = granularity === 'day' 
                    ? ['This Week', 'Last Week', 'Week Before']
                    : granularity === 'week' 
                        ? ['This Quarter', 'Last Quarter', 'Quarter Before']
                        : ['This Year', 'Last Year', 'Year Before'];

                if (chartInstance) {
                    chartInstance.destroy();
                }

                chartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.chartData.labels,
                        datasets: [
                            { label: rangeLabels[0], data: data.chartData.datasets[0].data, backgroundColor: '#007bff' },
                            { label: rangeLabels[1], data: data.chartData.datasets[1].data, backgroundColor: '#c0c0c0' },
                            { label: rangeLabels[2], data: data.chartData.datasets[2].data, backgroundColor: '#d3d3d3' }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { title: { display: true, text: granularity === 'day' ? 'Day of Week' : granularity === 'week' ? 'Week Number' : 'Month' } },
                            y: { title: { display: true, text: 'Count' }, beginAtZero: true }
                        },
                        plugins: { legend: { display: true } }
                    }
                });

            } catch (error) {
                loadingOverlay.style.display = 'none';
                errorMessage.style.display = 'block';
                errorMessage.innerHTML = `Error: ${error.message}`;
                console.error('[ChartWidget] Error fetching chart data:', error);
            }
        }

        function fetchChartDataForCurrentSelection() {
            const checkedReport = container.querySelector('[name="report"]:checked');
            if (checkedReport) {
                fetchChartData(checkedReport.value);
            } else {
                fetchChartData();
            }
        }

        // Helper: fetch data filtered by a specific role
        async function fetchChartDataWithRole(roleName) {
            let granularity = 'day';
            const granularityInputs = container.querySelectorAll('[name="granularity"]');
            for (const input of granularityInputs) {
                if (input.checked) {
                    granularity = input.value;
                    break;
                }
            }

            loadingOverlay.style.display = 'flex';
            errorMessage.style.display = 'none';

            const token = localStorage.getItem('authToken');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            try {
                const url = `https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/chart-data?granularity=${granularity}&role=${encodeURIComponent(roleName)}`;
                const response = await fetch(url, { headers });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP ${response.status}`);
                }

                const data = await response.json();
                lastResponseData = data;

                loadingOverlay.style.display = 'none';

                if (data.permittedViews && data.permittedViews.length > 0) {
                    buildReportRadios(data.permittedViews);
                }

                if (data.chartData && data.chartData.labels && data.chartData.datasets) {
                    const rangeLabels = granularity === 'day' 
                        ? ['This Week', 'Last Week', 'Week Before']
                        : granularity === 'week' 
                            ? ['This Quarter', 'Last Quarter', 'Quarter Before']
                            : ['This Year', 'Last Year', 'Year Before'];

                    if (chartInstance) {
                        chartInstance.destroy();
                    }

                    chartInstance = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: data.chartData.labels,
                            datasets: [
                                { label: rangeLabels[0], data: data.chartData.datasets[0].data, backgroundColor: '#007bff' },
                                { label: rangeLabels[1], data: data.chartData.datasets[1].data, backgroundColor: '#c0c0c0' },
                                { label: rangeLabels[2], data: data.chartData.datasets[2].data, backgroundColor: '#d3d3d3' }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { title: { display: true, text: granularity === 'day' ? 'Day of Week' : granularity === 'week' ? 'Week Number' : 'Month' } },
                                y: { title: { display: true, text: 'Count' }, beginAtZero: true }
                            },
                            plugins: { legend: { display: true } }
                        }
                    });
                }

            } catch (error) {
                loadingOverlay.style.display = 'none';
                errorMessage.style.display = 'block';
                errorMessage.innerHTML = `Error: ${error.message}`;
                console.error('[ChartWidget] Error fetching with role:', error);
            }
        }

        // ====================== EVENT LISTENERS ======================
        container.querySelectorAll('[name="granularity"]').forEach(input => {
            input.addEventListener('change', () => {
                fetchChartData();
            });
        });

        // ====================== INITIAL LOAD ======================
        // Always start filtered to the first role the user has
        fetchChartData().then(() => {
            if (lastResponseData && lastResponseData.roles && lastResponseData.roles.length > 0) {
                const firstRole = lastResponseData.roles[0].name;

                setTimeout(() => {
                    const firstRoleLabel = roleSelector.querySelector('.madeira-signup-option');
                    if (firstRoleLabel) {
                        roleSelector.querySelectorAll('.madeira-signup-option').forEach(el => el.classList.remove('selected'));
                        firstRoleLabel.classList.add('selected');
                        currentRole = firstRole;
                    }
                    fetchChartDataWithRole(firstRole);
                }, 50);
            }
        });

        // ====================== AUDIO TOUR - NON-BLOCKING ASYNC LOAD ======================
        function loadAudioTourAsync() {
            // If already loaded globally, just initialize
            if (window.initAudioTour) {
                try {
                    window.initAudioTour('madeira-charts', 'madeira-charts-audiotour.json?v=1.3');
                } catch (e) {
                    console.warn('[ChartWidget] Audio Tour init error:', e);
                }
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js';
            script.async = true;

            script.onload = () => {
                if (window.initAudioTour) {
                    window.initAudioTour('madeira-charts', 'madeira-charts-audiotour.json?v=1.3');
                }
            };

            script.onerror = () => {
                console.warn('[ChartWidget] Failed to load audiotour.js (non-blocking)');
            };

            document.head.appendChild(script);
        }

        // Load Audio Tour completely asynchronously — does NOT block chart functionality
        // The audiotour.js itself will only show the help button after its data has finished loading
        setTimeout(loadAudioTourAsync, 1200);

    };
})();