// ====================== clubs-widget.js ======================
// Self-contained Clubs Management Widget
// Uses the project's standard 4-color multi-spinner
// Hosted on S3 and loaded on partner sites

(function () {
    // Load Font Awesome
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
        document.head.appendChild(fa);
    }

    // Helper to load Chart.js dynamically (only once)
    let chartJsLoaded = false;
    async function ensureChartJsLoaded() {
        if (chartJsLoaded || window.Chart) {
            chartJsLoaded = true;
            return;
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => {
                chartJsLoaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });
    }

    class ClubsWidget {
        constructor(containerId = 'clubs-widget') {
            this.container = document.getElementById(containerId);
            if (!this.container) {
                console.error('ClubsWidget: Container not found');
                return;
            }

            this.apiBase = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/clubs';
            this.token = localStorage.getItem('authToken');
            this.currentPage = 1;
            this.pageSize = 10;
            this.clubs = [];
            this.currentClub = null;
            this.chartInstance = null;
            this.activeTab = 'details';

            this.render();
            this.loadClubs();
        }

        render() {
            this.container.innerHTML = `
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }

                    .loading-overlay {
                        display: none;
                        position: absolute;
                        inset: 0;
                        background: rgba(255,255,255,0.85);
                        justify-content: center;
                        align-items: center;
                        z-index: 100;
                        border-radius: 12px;
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

                    .tab-button {
                        padding: 16px 24px;
                        cursor: pointer;
                        border-bottom: 3px solid transparent;
                        font-weight: 600;
                        transition: all 0.2s ease;
                    }

                    .tab-button.active {
                        border-bottom: 3px solid #3b82f6;
                        color: #1f2937;
                    }

                    .tab-button:hover:not(.active) {
                        background: #f3f4f6;
                    }

                    .recommendation-card {
                        background: white;
                        border: 1px solid #e5e7eb;
                        border-radius: 12px;
                        margin-bottom: 20px;
                        overflow: hidden;
                        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                    }

                    .recommendation-header {
                        background: #f8fafc;
                        padding: 16px 20px;
                        border-bottom: 1px solid #e5e7eb;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .recommendation-body {
                        padding: 20px;
                        display: flex;
                        gap: 20px;
                        align-items: flex-start;
                    }

                    .recommendation-logo {
                        width: 80px;
                        height: 80px;
                        object-fit: contain;
                        border: 1px solid #e5e7eb;
                        border-radius: 8px;
                        padding: 8px;
                        background: white;
                    }

                    .recommendation-content {
                        flex: 1;
                    }

                    .why-section, .join-section {
                        margin-bottom: 16px;
                    }

                    .section-label {
                        font-weight: 600;
                        color: #374151;
                        margin-bottom: 8px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .copy-btn {
                        background: #f1f5f9;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 6px;
                        font-size: 13px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        transition: all 0.2s;
                    }

                    .copy-btn:hover {
                        background: #e2e8f0;
                    }

                    .join-button {
                        display: inline-block;
                        background: #00c853;
                        color: white;
                        padding: 12px 32px;
                        border-radius: 9999px;
                        text-decoration: none;
                        font-weight: 700;
                        font-size: 15px;
                        box-shadow: 0 4px 12px rgba(0, 200, 83, 0.4);
                        transition: all 0.3s ease;
                    }

                    .join-button:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 16px rgba(0, 200, 83, 0.5);
                    }

                    .stats-header {
                        display: flex;
                        gap: 32px;
                        margin-bottom: 24px;
                        flex-wrap: wrap;
                    }

                    .stats-group {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .stats-group-title {
                        font-size: 12px;
                        font-weight: 600;
                        color: #555;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    .stats-pills {
                        display: flex;
                        gap: 8px;
                        background: #f8f9fa;
                        padding: 6px;
                        border-radius: 12px;
                        border: 1px solid #e5e7eb;
                    }

                    .stats-pill {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 18px;
                        border-radius: 9999px;
                        cursor: pointer;
                        font-size: 15px;
                        transition: all 0.2s ease;
                        border: 2px solid transparent;
                    }

                    .stats-pill.active {
                        background: white;
                        border-color: #3b82f6;
                        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
                    }

                    .stats-pill i {
                        font-size: 18px;
                    }

                    .invite-btn {
                        background: linear-gradient(135deg, #3b82f6, #2563eb);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 9999px;
                        font-weight: 600;
                        font-size: 15px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        cursor: pointer;
                        box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
                        transition: all 0.3s ease;
                    }

                    .invite-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
                    }

                    .modal {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(15, 23, 42, 0.7);
                        display: none;
                        align-items: center;
                        justify-content: center;
                        z-index: 9999;
                    }

                    .modal-content {
                        background: white;
                        border-radius: 16px;
                        width: 100%;
                        max-width: 580px;
                        box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
                        overflow: hidden;
                        max-height: 85vh;
                        display: flex;
                        flex-direction: column;
                    }
                </style>

                <div style="max-width: 1200px; margin: 0 auto; position: relative; font-family: system-ui, -apple-system, sans-serif;">
                    
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #1f2937;">
                            <i class="fas fa-handshake"></i> My Clubs
                        </h2>
                        
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <!-- Invite Button -->
                            <button id="inviteBtn" class="invite-btn">
                                <i class="fas fa-handshake"></i>
                                <span>Invite</span>
                            </button>

                            <select id="pageSize" style="padding: 8px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;">
                                <option value="10">10 per page</option>
                                <option value="25">25 per page</option>
                                <option value="50">50 per page</option>
                            </select>
                        </div>
                    </div>

                    <!-- List View -->
                    <div id="listView">
                        <div id="clubsList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;"></div>
                        
                        <div style="display: flex; justify-content: center; gap: 16px; margin-top: 24px;">
                            <button id="prevBtn" style="padding: 10px 20px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer;">← Previous</button>
                            <span id="pageInfo" style="align-self: center; color: #6b7280; font-size: 14px;"></span>
                            <button id="nextBtn" style="padding: 10px 20px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer;">Next →</button>
                        </div>
                    </div>

                    <!-- Detail View -->
                    <div id="detailView" style="display: none; position: relative;">
                        <button id="backToList" style="margin-bottom: 16px; padding: 10px 18px; background: #f3f4f6; border: none; border-radius: 8px; cursor: pointer;">
                            <i class="fas fa-arrow-left"></i> Back to List
                        </button>

                        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; position: relative;">
                            <!-- Tabs -->
                            <div style="display: flex; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                                <div class="tab-button" data-tab="details">
                                    <i class="fas fa-info-circle"></i> Details
                                </div>
                                <div class="tab-button" data-tab="widget">
                                    <i class="fas fa-puzzle-piece"></i> Widget
                                </div>
                                <div class="tab-button" data-tab="stats">
                                    <i class="fas fa-chart-bar"></i> Stats
                                </div>
                                <div class="tab-button" data-tab="gallery">
                                    <i class="fas fa-images"></i> Gallery
                                </div>
                                <div class="tab-button" data-tab="promote">
                                    <i class="fas fa-bullhorn"></i> Promote
                                </div>
                            </div>

                            <div id="tabContent" style="padding: 24px;"></div>
                        </div>
                    </div>

                    <!-- Global Loading Overlay -->
                    <div id="globalLoading" class="loading-overlay" style="position: absolute; inset: 0; border-radius: 12px;">
                        <div class="spinner-container">
                            <div class="spinner spinner-1"></div>
                            <div class="spinner spinner-2"></div>
                            <div class="spinner spinner-3"></div>
                            <div class="spinner spinner-4"></div>
                        </div>
                    </div>
                </div>

                <!-- Invite Modal -->
                <div id="inviteModal" class="modal">
                    <div class="modal-content">
                        <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                            <h3 style="margin: 0; font-size: 18px; color: #1f2937;">
                                <i class="fas fa-handshake" style="color:#3b82f6; margin-right:10px;"></i> 
                                Invite a New Club
                            </h3>
                            <button id="closeInviteModal" style="background:none; border:none; font-size:26px; cursor:pointer; color:#64748b; line-height:1;">&times;</button>
                        </div>
                        
                        <div style="padding: 24px; min-height: 380px;">
                            <div id="inviteContainer"></div>
                        </div>
                    </div>
                </div>
            `;

            this.attachListeners();
        }

        attachListeners() {
            const pageSizeSelect = this.container.querySelector('#pageSize');
            pageSizeSelect.addEventListener('change', () => {
                this.pageSize = parseInt(pageSizeSelect.value);
                this.currentPage = 1;
                this.loadClubs();
            });

            this.container.querySelector('#prevBtn').addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadClubs();
                }
            });

            this.container.querySelector('#nextBtn').addEventListener('click', () => {
                this.currentPage++;
                this.loadClubs();
            });

            this.container.querySelector('#backToList').addEventListener('click', () => this.showListView());

            const inviteBtn = this.container.querySelector('#inviteBtn');
            inviteBtn.addEventListener('click', () => this.showInviteModal());

            this.container.querySelector('#closeInviteModal').addEventListener('click', () => {
                this.container.querySelector('#inviteModal').style.display = 'none';
            });
        }

        showInviteModal() {
            const modal = this.container.querySelector('#inviteModal');
            const container = this.container.querySelector('#inviteContainer');

            container.innerHTML = `<div data-partner-widget style="min-height: 420px; width: 100%;"></div>`;
            modal.style.display = 'flex';

            const scriptSrc = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/partner-widget.js';
            const oldScript = document.querySelector(`script[src*="${scriptSrc}"]`);
            if (oldScript) oldScript.remove();

            const fresh = document.createElement('script');
            fresh.src = scriptSrc + '?t=' + Date.now();
            fresh.async = true;

            fresh.onload = () => {
                setTimeout(() => {
                    const target = container.querySelector('[data-partner-widget]');
                    if (target && typeof window.PartnerWidget === 'function') {
                        new window.PartnerWidget(target);
                    }
                }, 250);
            };

            document.head.appendChild(fresh);
        }

        showLoading() {
            this.container.querySelector('#globalLoading').style.display = 'flex';
        }

        hideLoading() {
            this.container.querySelector('#globalLoading').style.display = 'none';
        }

        async loadClubs() {
            this.showLoading();
            try {
                const res = await fetch(this.apiBase, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const data = await res.json();

                if (data.status === 'success') {
                    this.clubs = data.clubs || [];
                    this.renderClubsList();
                } else {
                    this.showError(data.error_message || 'Failed to load clubs');
                }
            } catch (err) {
                this.showError('Failed to load clubs');
            } finally {
                this.hideLoading();
            }
        }

        renderClubsList() {
            const listContainer = this.container.querySelector('#clubsList');
            listContainer.innerHTML = '';

            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            const pageClubs = this.clubs.slice(start, end);

            if (pageClubs.length === 0) {
                listContainer.innerHTML = `<p style="padding: 40px; text-align: center; color: #6b7280;">No clubs found.</p>`;
                return;
            }

            pageClubs.forEach(club => {
                const card = document.createElement('div');
                card.style.cssText = 'background:white; border:1px solid #e5e7eb; border-radius:12px; padding:20px; cursor:pointer; transition: all 0.2s ease;';
                
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:48px; height:48px; background:#3b82f6; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px;">
                            <i class="fas fa-users"></i>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:600; font-size:16px; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${club.Name || 'Unnamed'}</div>
                            <div style="color:#6b7280; font-size:13px;">${club.Sector || ''}</div>
                        </div>
                        <a href="${club.Url}" target="_blank" style="color:#3b82f6; font-size:18px;" onclick="event.stopImmediatePropagation();">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                `;

                card.addEventListener('click', () => this.showDetail(club.ClubID));
                listContainer.appendChild(card);
            });

            this.updatePagination(start, end);
        }

        updatePagination(start, end) {
            const prevBtn = this.container.querySelector('#prevBtn');
            const nextBtn = this.container.querySelector('#nextBtn');
            const pageInfo = this.container.querySelector('#pageInfo');

            prevBtn.disabled = this.currentPage === 1;
            nextBtn.disabled = end >= this.clubs.length;
            pageInfo.textContent = `Page ${this.currentPage} • Showing ${start + 1}–${Math.min(end, this.clubs.length)} of ${this.clubs.length}`;
        }

        async showDetail(clubId) {
            this.showLoading();
            try {
                const res = await fetch(this.apiBase, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ action: 'detail', clubId })
                });

                const data = await res.json();
                if (data.status === 'success') {
                    this.currentClub = data.club;
                    this.showDetailView();
                } else {
                    this.showError(data.error_message || 'Failed to load details');
                }
            } catch (err) {
                this.showError('Failed to load details');
            } finally {
                this.hideLoading();
            }
        }

        showDetailView() {
            this.container.querySelector('#listView').style.display = 'none';
            this.container.querySelector('#detailView').style.display = 'block';

            const tabContainer = this.container.querySelector('#detailView .tab-button')?.parentElement;
            if (tabContainer) {
                const tabs = tabContainer.querySelectorAll('.tab-button');
                tabs.forEach(tab => {
                    tab.onclick = () => {
                        const tabName = tab.dataset.tab;
                        this.activeTab = tabName;
                        this.setActiveTab(tabName);
                        this.renderTabContent(tabName);
                    };
                });
            }

            const tabToShow = this.activeTab || 'details';
            this.setActiveTab(tabToShow);
            this.renderTabContent(tabToShow);
        }

        setActiveTab(tabName) {
            const tabs = this.container.querySelectorAll('.tab-button');
            tabs.forEach(tab => {
                if (tab.dataset.tab === tabName) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
        }

        showListView() {
            this.container.querySelector('#listView').style.display = 'block';
            this.container.querySelector('#detailView').style.display = 'none';
            this.currentClub = null;
        }

        renderTabContent(tabName) {
            const content = this.container.querySelector('#tabContent');
            const club = this.currentClub;
            if (!club) return;

            content.innerHTML = '';

            if (tabName === 'details') this.renderDetailsTab();
            else if (tabName === 'widget') this.renderWidgetTab(club);
            else if (tabName === 'stats') this.renderStatsTab(club);
            else if (tabName === 'gallery') this.renderGalleryTab(club);
            else if (tabName === 'promote') this.renderPromoteTab(club);
            else content.innerHTML = `<p style="color:#6b7280; padding: 40px 20px; text-align:center;">${tabName} section coming soon...</p>`;
        }

        // ====================== STATS TAB (FIXED - matches backend) ======================
        renderStatsTab(club) {
            const content = this.container.querySelector('#tabContent');
            const clubId = club.ClubID;

            content.innerHTML = `
                <div style="max-width: 1100px; position: relative;">
                    <h3 style="margin-bottom: 20px; font-size: 22px;"><i class="fas fa-chart-bar"></i> Stats for ${club.Name}</h3>

                    <div class="stats-header">
                        <div class="stats-group">
                            <div class="stats-group-title">Granularity</div>
                            <div class="stats-pills">
                                <div class="stats-pill active" data-granularity="day"><i class="fas fa-calendar-day"></i> Day</div>
                                <div class="stats-pill" data-granularity="week"><i class="fas fa-calendar-week"></i> Week</div>
                                <div class="stats-pill" data-granularity="month"><i class="fas fa-calendar-alt"></i> Month</div>
                            </div>
                        </div>
                        <div class="stats-group">
                            <div class="stats-group-title">Report Type</div>
                            <div class="stats-pills">
                                <div class="stats-pill active" data-report="Catalogue Views"><i class="fas fa-eye"></i> Catalogue Views</div>
                                <div class="stats-pill" data-report="Catalogue Clicks"><i class="fas fa-mouse-pointer"></i> Catalogue Clicks</div>
                                <div class="stats-pill" data-report="Catalogue Visitors"><i class="fas fa-users"></i> Catalogue Visitors</div>
                            </div>
                        </div>
                    </div>

                    <div style="position: relative; height: 420px; background: #f8fafc; border-radius: 12px; border: 1px solid #e5e7eb; padding: 20px;">
                        <canvas id="statsChart"></canvas>
                        <div id="statsLoading" class="loading-overlay" style="display: flex; border-radius: 12px;">
                            <div class="spinner-container">
                                <div class="spinner spinner-1"></div>
                                <div class="spinner spinner-2"></div>
                                <div class="spinner spinner-3"></div>
                                <div class="spinner spinner-4"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const ctx = content.querySelector('#statsChart');
            const loading = content.querySelector('#statsLoading');
            let chartInstance = null;

            const fetchAndRender = async () => {
                loading.style.display = 'flex';

                try {
                    await ensureChartJsLoaded();
                } catch (err) {
                    console.error('Failed to load Chart.js:', err);
                    loading.style.display = 'none';
                    return;
                }

                const activeGran = content.querySelector('.stats-pill.active[data-granularity]');
                const activeReport = content.querySelector('.stats-pill.active[data-report]');

                const granularity = activeGran ? activeGran.dataset.granularity : 'day';
                const reportType = activeReport ? activeReport.dataset.report : 'Catalogue Views';

                try {
                    const res = await fetch(this.apiBase, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({
                            action: 'chartdata',
                            clubId,
                            granularity,
                            report_type: reportType
                        })
                    });

                    const data = await res.json();

                    if (data.chartData) {
                        if (chartInstance) chartInstance.destroy();

                        const rangeLabels = granularity === 'day' 
                            ? ['This Week', 'Last Week', 'Week Before']
                            : granularity === 'week' 
                                ? ['This Quarter', 'Last Quarter', 'Quarter Before']
                                : ['This Year', 'Last Year', 'Year Before'];

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
                                scales: { y: { beginAtZero: true } }
                            }
                        });
                    }
                } catch (err) {
                    console.error('Stats chart error:', err);
                } finally {
                    loading.style.display = 'none';
                }
            };

            fetchAndRender();

            content.querySelectorAll('.stats-pill[data-granularity]').forEach(pill => {
                pill.addEventListener('click', () => {
                    content.querySelectorAll('.stats-pill[data-granularity]').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    fetchAndRender();
                });
            });

            content.querySelectorAll('.stats-pill[data-report]').forEach(pill => {
                pill.addEventListener('click', () => {
                    content.querySelectorAll('.stats-pill[data-report]').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    fetchAndRender();
                });
            });
        }

        // ====================== PROMOTE TAB ======================
        async renderPromoteTab(club) {
            const content = this.container.querySelector('#tabContent');
            const clubId = club.ClubID;

            content.innerHTML = `
                <div style="max-width: 900px;">
                    <h3 style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-bullhorn" style="color:#3b82f6;"></i> 
                        Promote ${club.Name}
                    </h3>
                    <p style="color:#6b7280; margin-bottom: 24px;">Here are your personalized recommendations for this club.</p>
                    
                    <div id="promote-content">
                        <div style="text-align:center; padding: 60px 20px; color:#6b7280;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px;"></i>
                            <p>Loading recommendations...</p>
                        </div>
                    </div>
                </div>
            `;

            try {
                const res = await fetch(this.apiBase, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}` 
                    },
                    body: JSON.stringify({ action: 'promote', clubId })
                });

                const data = await res.json();
                const promoteDiv = content.querySelector('#promote-content');

                if (data.status === 'success' && data.recommendations.length > 0) {
                    promoteDiv.innerHTML = data.recommendations.map(rec => `
                        <div class="recommendation-card">
                            <div class="recommendation-header">
                                <div>
                                    <div style="font-weight:700; font-size:18px; color:#111827;">${rec.Name}</div>
                                    <div style="color:#64748b; font-size:14px; margin-top:4px;">
                                        <i class="fas fa-tag"></i> ${rec.primarySector || 'N/A'}
                                    </div>
                                </div>
                            </div>

                            <div class="recommendation-body">
                                <div>
                                    ${rec.logoUrl 
                                        ? `<img src="${rec.logoUrl}" class="recommendation-logo" alt="${rec.Name}">` 
                                        : `<div class="recommendation-logo" style="display:flex;align-items:center;justify-content:center;background:#f1f5f9;">
                                            <i class="fas fa-image" style="font-size:28px;color:#94a3b8;"></i>
                                           </div>`}
                                </div>

                                <div class="recommendation-content">
                                    <div class="why-section">
                                        <div class="section-label">
                                            <i class="fas fa-lightbulb" style="color:#f59e0b;"></i> 
                                            <strong>Why it fits this club</strong>
                                        </div>
                                        <div style="color:#374151; line-height:1.6; font-size:15px;">
                                            ${rec.whyHtml || rec.whyItFits || 'No description available.'}
                                        </div>
                                    </div>

                                    <div class="join-section">
                                        <div class="section-label">
                                            <i class="fas fa-envelope" style="color:#3b82f6;"></i> 
                                            <strong>Join Message</strong>
                                        </div>
                                        <div style="background:#f8fafc; padding:16px; border-radius:8px; border-left:4px solid #3b82f6; margin-bottom:12px;">
                                            <div id="join-text-${rec.MerchantId}" style="color:#334155; line-height:1.6; font-size:15px;">
                                                ${rec.joinHtml || rec.joinRequestMessage || 'No join message available.'}
                                            </div>
                                        </div>
                                        
                                        <div style="display:flex; gap:12px; flex-wrap:wrap;">
                                            <button onclick="navigator.clipboard.writeText(document.getElementById('join-text-${rec.MerchantId}').innerText).then(() => { 
                                                const btn = event.currentTarget; 
                                                const original = btn.innerHTML; 
                                                btn.innerHTML = '<i class=\\'fas fa-check\\'></i> Copied!'; 
                                                setTimeout(() => btn.innerHTML = original, 2000); 
                                            })" class="copy-btn">
                                                <i class="fas fa-copy"></i> Copy Join Message
                                            </button>

                                            <a href="https://ui.awin.com/awin/affiliate/2889699/merchant-profile/${rec.MerchantId}" 
                                               target="_blank" class="join-button">
                                                <i class="fas fa-external-link-alt"></i> Join on AWIN
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    promoteDiv.innerHTML = `
                        <div style="text-align:center; padding:60px 20px; background:#f8fafc; border-radius:12px;">
                            <i class="fas fa-bullhorn" style="font-size:48px; color:#94a3b8; margin-bottom:16px;"></i>
                            <h4 style="margin:0 0 8px 0; color:#475569;">No recommendations yet</h4>
                            <p style="color:#64748b; max-width:400px; margin:0 auto;">Recommendations will appear here once they are generated for this club.</p>
                        </div>
                    `;
                }
            } catch (err) {
                console.error(err);
                content.querySelector('#promote-content').innerHTML = `
                    <div style="color:#ef4444; text-align:center; padding:40px;">
                        Failed to load recommendations.
                    </div>
                `;
            }
        }

        // ====================== WIDGET TAB ======================
        renderWidgetTab(club) {
            const content = this.container.querySelector('#tabContent');

            const clubId = club.ClubID;
            const MADEIRA_SCRIPT_URL = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/madeira-widget.js';
            const VOUCHER_SCRIPT_URL = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/madeira-voucher-widget.js';

            const STYLESHEETS = [
                { name: 'Default', filename: 'madeira-widget.css' },
                { name: 'Dark', filename: 'madeira-dark.css' },
                { name: 'Transparent', filename: 'madeira-transp.css' }
            ];

            content.innerHTML = `
                <div style="max-width: 700px;">
                    <!-- CATALOG WIDGET -->
                    <h3 style="margin-bottom: 8px;">Catalog widget for ${club.Name}</h3>
                    <p style="color: #6b7280; margin-bottom: 20px;">Use this code on your website to embed the catalogue.</p>

                    <div style="margin-bottom: 20px;">
                        <label style="display:block; font-weight:600; margin-bottom:6px;">Select Style</label>
                        <select id="widget-style-select" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:15px;">
                            ${STYLESHEETS.map(s => `<option value="${s.filename}">${s.name}</option>`).join('')}
                        </select>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label style="display:block; font-weight:600; margin-bottom:6px;">Widget Code</label>
                        <textarea id="widget-code" readonly 
                            style="width:100%; height:120px; font-family:monospace; padding:12px; border:1px solid #d1d5db; border-radius:8px; background:#f9fafb; font-size:13px; resize:vertical;"></textarea>
                    </div>

                    <button id="copy-widget-btn" 
                        style="background:#3b82f6; color:white; border:none; padding:12px 24px; border-radius:8px; font-size:15px; cursor:pointer; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-copy"></i> Copy to Clipboard
                    </button>

                    <!-- VOUCHER WIDGET -->
                    <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                        <h3 style="margin-bottom: 8px;">Voucher widget for ${club.Name}</h3>
                        <p style="color: #6b7280; margin-bottom: 20px;">Use this code on your website to embed the vouchers.</p>

                        <div style="margin-bottom: 12px;">
                            <label style="display:block; font-weight:600; margin-bottom:6px;">Voucher Widget Code</label>
                            <textarea id="voucher-widget-code" readonly 
                                style="width:100%; height:100px; font-family:monospace; padding:12px; border:1px solid #d1d5db; border-radius:8px; background:#f9fafb; font-size:13px; resize:vertical;"></textarea>
                        </div>

                        <button id="copy-voucher-btn" 
                            style="background:#3b82f6; color:white; border:none; padding:12px 24px; border-radius:8px; font-size:15px; cursor:pointer; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-copy"></i> Copy to Clipboard
                        </button>
                    </div>
                </div>
            `;

            // === CATALOG WIDGET LOGIC (unchanged) ===
            const styleSelect = content.querySelector('#widget-style-select');
            const codeTextarea = content.querySelector('#widget-code');
            const copyBtn = content.querySelector('#copy-widget-btn');

            const updateWidgetCode = (cssFile) => {
                codeTextarea.value = 
`<div id="madeira-container"></div>
<script data-affiliate="${clubId}" data-css="${cssFile}" src="${MADEIRA_SCRIPT_URL}?v=1.0"></script>`;
            };

            updateWidgetCode(STYLESHEETS[0].filename);

            styleSelect.addEventListener('change', () => {
                updateWidgetCode(styleSelect.value);
            });

            copyBtn.addEventListener('click', () => {
                codeTextarea.select();
                document.execCommand('copy');

                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            });

            // === VOUCHER WIDGET LOGIC (new - no CSS, no dropdown) ===
            const voucherCodeTextarea = content.querySelector('#voucher-widget-code');
            const copyVoucherBtn = content.querySelector('#copy-voucher-btn');

            const updateVoucherCode = () => {
                voucherCodeTextarea.value = 
`<div id="madeira-vouchers-container"></div>
<script data-affiliate="${clubId}" src="${VOUCHER_SCRIPT_URL}?v=1.0"></script>`;
            };

            updateVoucherCode();

            copyVoucherBtn.addEventListener('click', () => {
                voucherCodeTextarea.select();
                document.execCommand('copy');

                const originalText = copyVoucherBtn.innerHTML;
                copyVoucherBtn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
                setTimeout(() => {
                    copyVoucherBtn.innerHTML = originalText;
                }, 2000);
            });
        }

        // ====================== GALLERY TAB ======================
        renderGalleryTab(club) {
            const content = this.container.querySelector('#tabContent');
            const clubId = club.ClubID;

            content.innerHTML = `
                <div style="max-width: 900px;">
                    <h3 style="margin-bottom: 8px;">Club Gallery</h3>
                    
                    <div style="background: #f0f7ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                        <strong>Instructions:</strong><br>
                        • Upload a high-quality screenshot of your club homepage or catalogue.<br>
                        • Add a short comment or quote from your club.<br>
                        • Click <strong>Save Screenshot</strong> or <strong>Save Comment</strong> after making changes.
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <div>
                            <h4 style="margin-bottom: 12px;">Screenshot</h4>
                            <div id="drop-zone" class="drop-zone">
                                <i class="fas fa-cloud-upload-alt" style="font-size: 48px; color: #9ca3af; margin-bottom: 12px;"></i>
                                <p style="margin: 0 0 8px 0; font-weight: 600;">Drag & drop screenshot here</p>
                                <p style="margin: 0; color: #6b7280; font-size: 14px;">or click to browse</p>
                                <input type="file" id="file-input" accept="image/*" style="display: none;">
                            </div>
                            <div id="screenshot-preview" style="margin-top: 15px;">
                                ${club.Screenshot ? 
                                    `<img src="${club.Screenshot}" class="screenshot-preview" style="max-height: 280px;">` : 
                                    `<p style="color:#9ca3af; font-style: italic;">No screenshot uploaded yet.</p>`
                                }
                            </div>
                            <button id="upload-btn" style="margin-top: 12px; background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; display: none;">
                                <i class="fas fa-upload"></i> Save Screenshot
                            </button>
                        </div>

                        <div>
                            <h4 style="margin-bottom: 12px;">Club Comment / Quote</h4>
                            <textarea id="comment-textarea" placeholder="Enter a short comment or quote..." 
                                style="width: 100%; height: 180px; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; resize: vertical;">${club.Comment || ''}</textarea>
                            <button id="save-comment-btn" style="margin-top: 12px; background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                                <i class="fas fa-save"></i> Save Comment
                            </button>
                        </div>
                    </div>
                </div>
            `;

            this.setupGalleryListeners(clubId);
        }

        setupGalleryListeners(clubId) {
            const dropZone = this.container.querySelector('#drop-zone');
            const fileInput = this.container.querySelector('#file-input');
            const uploadBtn = this.container.querySelector('#upload-btn');
            const previewContainer = this.container.querySelector('#screenshot-preview');
            const commentTextarea = this.container.querySelector('#comment-textarea');
            const saveCommentBtn = this.container.querySelector('#save-comment-btn');

            let selectedFile = null;

            dropZone.addEventListener('click', () => fileInput.click());

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    handleFile(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0) {
                    handleFile(fileInput.files[0]);
                }
            });

            const handleFile = (file) => {
                if (!file.type.startsWith('image/')) {
                    alert('Please select an image file.');
                    return;
                }

                selectedFile = file;

                const reader = new FileReader();
                reader.onload = (e) => {
                    previewContainer.innerHTML = `<img src="${e.target.result}" class="screenshot-preview" style="max-height: 280px;">`;
                    uploadBtn.style.display = 'inline-block';
                };
                reader.readAsDataURL(file);
            };

            uploadBtn.addEventListener('click', async () => {
                if (!selectedFile) return;

                this.showLoading();

                const reader = new FileReader();
                reader.onload = async () => {
                    const base64 = reader.result;

                    try {
                        const res = await fetch(this.apiBase, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${this.token}`
                            },
                            body: JSON.stringify({
                                action: 'upload-screenshot',
                                clubId: clubId,
                                screenshot: base64
                            })
                        });

                        const result = await res.json();

                        if (result.status === 'success') {
                            alert('Screenshot uploaded successfully!');
                            await this.refreshCurrentClub(clubId);
                            this.renderGalleryTab(this.currentClub);
                        } else {
                            alert(result.error_message || 'Upload failed');
                        }
                    } catch (err) {
                        alert('Failed to upload screenshot');
                    } finally {
                        this.hideLoading();
                    }
                };
                reader.readAsDataURL(selectedFile);
            });

            saveCommentBtn.addEventListener('click', async () => {
                const comment = commentTextarea.value.trim();

                this.showLoading();

                try {
                    const res = await fetch(this.apiBase, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({
                            action: 'save-comment',
                            clubId: clubId,
                            comment: comment
                        })
                    });

                    const result = await res.json();

                    if (result.status === 'success') {
                        alert('Comment saved successfully!');
                        await this.refreshCurrentClub(clubId);
                    } else {
                        alert(result.error_message || 'Failed to save comment');
                    }
                } catch (err) {
                    alert('Failed to save comment');
                } finally {
                    this.hideLoading();
                }
            });
        }

        async refreshCurrentClub(clubId) {
            try {
                const res = await fetch(this.apiBase, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ action: 'detail', clubId })
                });

                const data = await res.json();
                if (data.status === 'success') {
                    this.currentClub = data.club;
                }
            } catch (err) {
                console.error('Failed to refresh club data');
            }
        }

        renderDetailsTab() {
            const content = this.container.querySelector('#tabContent');
            const club = this.currentClub;

            let interestsHTML = '';
            try {
                const interests = club.Interests ? JSON.parse(club.Interests) : [];
                interestsHTML = interests.map(i => 
                    `<span style="background:#e0e7ff; color:#3730a3; padding:4px 14px; border-radius:9999px; font-size:13px; margin:4px; display:inline-block;" title="${i.Description || ''}">${i.Interest}</span>`
                ).join('');
            } catch {
                interestsHTML = `<span style="color:#9ca3af;">No interests listed</span>`;
            }

            content.innerHTML = `
                <div style="display:grid; gap:24px;">
                    <div style="display:flex; justify-content:space-between;">
                        <div>
                            <div style="font-size:12px; color:#6b7280;">NAME & LOCATION</div>
                            <div style="font-size:18px; font-weight:600;">${club.Name} — ${club.Location || 'N/A'}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:12px; color:#6b7280;">SECTOR</div>
                            <div style="font-weight:600;">${club.Sector || 'N/A'}</div>
                        </div>
                    </div>

                    <div style="border-top:1px solid #e5e7eb; padding-top:16px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                            <i class="fas fa-star" style="color:#f59e0b;"></i> <strong>Review</strong>
                        </div>
                        <p style="color:#374151; line-height:1.6;">${club.Review || 'No review available.'}</p>
                    </div>

                    <div style="border-top:1px solid #e5e7eb; padding-top:16px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                            <i class="fas fa-users" style="color:#3b82f6;"></i> <strong>Audience</strong>
                        </div>
                        <p style="color:#374151;">${club.Audience || 'No audience information.'}</p>
                    </div>

                    <div style="border-top:1px solid #e5e7eb; padding-top:16px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                            <i class="fas fa-tags" style="color:#10b981;"></i> <strong>Interests</strong>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${interestsHTML}
                        </div>
                    </div>
                </div>
            `;
        }

        showError(message) {
            alert(message);
        }
    }

    // Auto init
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('clubs-widget')) {
            new ClubsWidget('clubs-widget');
        }
    });

    window.ClubsWidget = ClubsWidget;
})();