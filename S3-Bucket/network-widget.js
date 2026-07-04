// ====================== network-widget.js (FULL VERSION) ======================

(function () {
    const API_BASE = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/token/network';

    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
        document.head.appendChild(fa);
    }

    class NetworkWidget {
        constructor(container) {
            this.container = container;
            this.type = container.dataset.type || 'clubs';
            this.data = null;
            this.render();
            this.loadData();
        }

        async loadData() {
            const loading = this.container.querySelector('#loading');
            const content = this.container.querySelector('#network-content');
            if (loading) loading.style.display = 'flex';
            if (content) content.style.display = 'none';

            try {
                const res = await fetch(`${API_BASE}?type=${this.type}`);
                this.data = await res.json();
                this.renderContent();
            } catch (err) {
                console.error(err);
                this.container.innerHTML = `<p style="color:red">Failed to load data</p>`;
            } finally {
                if (loading) loading.style.display = 'none';
                if (content) content.style.display = 'block';
            }
        }

        render() {
            this.container.innerHTML = `
                <div class="network-widget">
                    <div class="loading-overlay" id="loading" style="display:flex; justify-content:center; padding:40px;">
                        <div style="position:relative; width:120px; height:120px;">
                            <div style="position:absolute; border:6px solid transparent; border-top-color:#ff6f61; border-radius:50%; width:70px; height:70px; top:25px; left:25px; animation:spin 1s linear infinite;"></div>
                            <div style="position:absolute; border:6px solid transparent; border-top-color:#6bff61; border-radius:50%; width:52px; height:52px; top:34px; left:34px; animation:spin 1s linear infinite; animation-delay:0.25s;"></div>
                            <div style="position:absolute; border:6px solid transparent; border-top-color:#61cfff; border-radius:50%; width:34px; height:34px; top:43px; left:43px; animation:spin 1s linear infinite; animation-delay:0.5s;"></div>
                            <div style="position:absolute; border:6px solid transparent; border-top-color:#ff61ff; border-radius:50%; width:18px; height:18px; top:51px; left:51px; animation:spin 1s linear infinite; animation-delay:0.75s;"></div>
                        </div>
                    </div>
                    <div id="network-content" style="display:none;"></div>
                </div>
                <style>
                    @keyframes spin {0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
                    .sector-pill.active {
                        background: #508738 !important;
                        color: white !important;
                        border-color: #508738 !important;
                    }
                    .interest-pill {
                        transition: all 0.2s ease;
                    }
                    .interest-pill:hover {
                        background: #bae6fd !important;
                        transform: translateY(-1px);
                    }
                </style>
            `;
        }

        renderContent() {
            const content = this.container.querySelector('#network-content');
            if (!content) return;

            if (this.type === 'clubs') this.renderClubs(content);
            else if (this.type === 'partners') this.renderPartners(content);
            else if (this.type === 'merchants') this.renderMerchants(content);
        }

        // ====================== CLUBS ======================
        renderClubs(container) {
            const clubs = this.data.Clubs || [];
            if (clubs.length === 0) {
                container.innerHTML = `<p style="padding:20px; color:#666;">No clubs with screenshots found.</p>`;
                return;
            }

            container.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:24px;">
                    ${clubs.map(club => {
                        let interests = [];
                        if (club.Interests) {
                            if (typeof club.Interests === 'string') {
                                try { interests = JSON.parse(club.Interests); } catch (e) { interests = []; }
                            } else if (Array.isArray(club.Interests)) {
                                interests = club.Interests;
                            }
                        }
                        const hasPartner = club.PartnerName && club.PartnerLogo && club.PartnerWebsite;
                        const hasScreenshot = club.Screenshot && club.Url;

                        return `
                            <div style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.06); background:white;">
                                <div style="padding:16px 20px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; background:#fafafa;">
                                    <div>
                                        <h3 style="margin:0; font-size:18px; color:#111;">${club.Name || 'Unnamed Club'}</h3>
                                        <p style="margin:4px 0 0 0; color:#666; font-size:14px;">${club.Location || ''}</p>
                                    </div>
                                    <div style="text-align:right;">
                                        <span style="font-size:12px; color:#888;">SECTOR</span><br>
                                        <span style="font-weight:600; color:#374151;">${club.Sector || '—'}</span>
                                    </div>
                                </div>

                                <div style="display:flex; padding:20px; gap:24px; align-items:flex-start;">
                                    <div style="flex-shrink:0; width:220px;">
                                        ${hasScreenshot 
                                            ? `<a href="${club.Url}" target="_blank"><img src="${club.Screenshot}" style="width:100%; height:160px; object-fit:cover; border-radius:8px; border:1px solid #eee; cursor:pointer;"></a>` 
                                            : `<div style="width:100%; height:160px; background:#f8f9fa; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:13px;">No image</div>`
                                        }
                                    </div>

                                    <div style="flex:1; min-width:0;">
                                        <div style="margin-bottom:16px;">
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                                                <span style="color:#f59e0b; font-size:18px;">★</span>
                                                <strong style="color:#374151;">Review</strong>
                                            </div>
                                            <p style="margin:0; color:#4b5563; font-size:14px; line-height:1.5;">${club.Review || 'No review available.'}</p>
                                        </div>

                                        <div style="margin-bottom:16px;">
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                                                <span style="color:#3b82f6; font-size:16px;">👥</span>
                                                <strong style="color:#374151;">Audience</strong>
                                            </div>
                                            <p style="margin:0; color:#4b5563; font-size:14px;">${club.Audience || 'No audience information.'}</p>
                                        </div>

                                        <div>
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                                <span style="color:#10b981; font-size:16px;">🏷️</span>
                                                <strong style="color:#374151;">Interests</strong>
                                            </div>
                                            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                                                ${interests.length > 0 
                                                    ? interests.map(i => `<span class="interest-pill" title="${i.Description || ''}" style="background:#f0f9ff; color:#0369a1; padding:5px 12px; border-radius:9999px; font-size:12px; white-space:nowrap; cursor:help; border:1px solid #bae6fd;">${i.Interest || ''}</span>`).join('')
                                                    : `<span style="color:#9ca3af; font-size:13px;">No interests listed</span>`
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                ${hasPartner ? `
                                    <div style="padding:12px 20px; background:#f8fafc; border-top:1px solid #f0f0f0;">
                                        <a href="${club.PartnerWebsite}" target="_blank" style="display:flex; align-items:center; gap:10px; text-decoration:none;">
                                            <span style="font-size:13px; color:#64748b;">Designed by</span>
                                            <img src="${club.PartnerLogo}" style="width:22px; height:22px; object-fit:contain; border-radius:4px;" alt="${club.PartnerName}">
                                            <span style="font-weight:600; color:#334155; font-size:14px;">${club.PartnerName}</span>
                                        </a>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // ====================== PARTNERS (Refactored & Improved Styling) ======================
        renderPartners(container) {
            const partners = this.data.Partners || [];

            container.innerHTML = partners.map(partner => {
                const provides = partner.Provides || [];
                const clubs = partner.Clubs || [];

                return `
                    <div style="margin-bottom:48px; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; box-shadow:0 8px 25px rgba(15, 23, 42, 0.08); background:white;">
                        
                        <!-- Partner Header -->
                        <div style="padding:28px 32px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                            <div style="display:flex; gap:24px; align-items:flex-start;">
                                
                                <!-- Clickable Logo -->
                                <a href="${partner.Website || '#'}" target="_blank" style="flex-shrink:0; display:block;">
                                    <img src="${partner.Logo}" 
                                         style="width:80px; height:80px; object-fit:contain; border-radius:12px; border:1px solid #e2e8f0; padding:8px; background:white; box-shadow:0 2px 8px rgba(0,0,0,0.06);"
                                         alt="${partner.Name}">
                                </a>

                                <div style="flex:1; min-width:0;">
                                    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px;">
                                        <h2 style="margin:0; font-size:26px; color:#0f172a; font-weight:700;">${partner.Name}</h2>
                                        ${partner.Location ? `
                                            <span style="background:#e0f2fe; color:#0369a1; padding:4px 14px; border-radius:9999px; font-size:13px; font-weight:500;">
                                                ${partner.Location}
                                            </span>
                                        ` : ''}
                                    </div>

                                    ${partner.Description ? `
                                        <p style="margin:0; color:#475569; font-size:15px; line-height:1.6; max-width:620px;">
                                            ${partner.Description}
                                        </p>
                                    ` : ''}

                                    <!-- Meta Row -->
                                    <div style="margin-top:14px; display:flex; flex-wrap:wrap; gap:20px; font-size:14px;">
                                        ${partner.Website ? `
                                            <a href="${partner.Website}" target="_blank" 
                                               style="color:#0284c8; text-decoration:none; display:flex; align-items:center; gap:6px; font-weight:500;">
                                                <i class="fas fa-globe"></i> 
                                                <span>Visit Website</span>
                                            </a>
                                        ` : ''}
                                        ${partner.Phone ? `
                                            <span style="color:#64748b; display:flex; align-items:center; gap:6px;">
                                                <i class="fas fa-phone-alt"></i> 
                                                <span>${partner.Phone}</span>
                                            </span>
                                        ` : ''}
                                    </div>

                                    <!-- Provides -->
                                    ${provides.length > 0 ? `
                                        <div style="margin-top:16px;">
                                            <div style="font-size:12px; color:#64748b; margin-bottom:8px; font-weight:500;">SERVICES</div>
                                            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                                ${provides.map(p => `
                                                    <span style="background:#dcfce7; color:#166534; padding:6px 14px; border-radius:9999px; font-size:13px; font-weight:500;">
                                                        ${p.value}
                                                    </span>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Clubs Section -->
                        <div style="padding:28px 32px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                                <h4 style="margin:0; color:#334155; font-size:17px; font-weight:600;">Featured Clubs &amp; Sites</h4>
                                <span style="font-size:13px; color:#64748b;">${clubs.length} site${clubs.length !== 1 ? 's' : ''}</span>
                            </div>

                            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:18px;">
                                ${clubs.map(club => `
                                    <div style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; transition:all 0.2s ease; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                                        <a href="${club.Url}" target="_blank" style="display:block; text-decoration:none;">
                                            ${club.Screenshot 
                                                ? `<img src="${club.Screenshot}" style="width:100%; height:148px; object-fit:cover; display:block;">` 
                                                : `<div style="height:148px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:13px;">No screenshot available</div>`
                                            }
                                        </a>
                                        <div style="padding:14px 16px; background:white;">
                                            <div style="font-weight:600; color:#0f172a; font-size:15px; line-height:1.35; margin-bottom:8px;">
                                                ${club.Name}
                                            </div>
                                            <a href="${club.Url}" target="_blank" 
                                               style="display:inline-flex; align-items:center; gap:6px; color:#0ea5e9; font-size:13px; font-weight:500; text-decoration:none;">
                                                Visit site <i class="fas fa-external-link-alt" style="font-size:11px;"></i>
                                            </a>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ====================== MERCHANTS ======================
        renderMerchants(container) {
            const sectors = this.data.sectors || [];
            if (sectors.length === 0) {
                container.innerHTML = `<p style="padding:20px; color:#666;">No merchant data available.</p>`;
                return;
            }

            const pillsHTML = sectors.map((s, index) => `
                <button class="sector-pill ${index === 0 ? 'active' : ''}" 
                        data-sector="${s.sector}"
                        style="padding:8px 18px; border-radius:20px; border:1px solid #ccc; background:white; cursor:pointer; font-size:14px; margin-right:8px; transition:all 0.2s;">
                    ${s.sector}
                </button>
            `).join('');

            container.innerHTML = `
                <div>
                    <div style="margin-bottom:20px; display:flex; flex-wrap:wrap; gap:8px;">
                        ${pillsHTML}
                    </div>
                    <div id="merchants-grid" style="display:flex; flex-wrap:wrap; gap:16px;"></div>
                </div>
            `;

            const firstSector = sectors[0].sector;
            this.renderMerchantGrid(container, sectors, firstSector);
            this.attachSectorFilters(container, sectors);
        }

        renderMerchantGrid(container, sectors, filterSector) {
            const grid = container.querySelector('#merchants-grid');
            let html = '';

            sectors.forEach(sector => {
                if (sector.sector !== filterSector) return;

                sector.merchants.forEach(m => {
                    html += `
                        <div style="width:300px; border:1px solid #ddd; border-radius:10px; padding:16px; display:flex; gap:12px; align-items:flex-start; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                            ${m.logoUrl ? `
                                <img src="${m.logoUrl}" style="width:48px; height:48px; object-fit:contain; border-radius:6px; flex-shrink:0; border:1px solid #eee;" alt="${m.name}">
                            ` : ''}
                            <div style="flex:1; min-width:0;">
                                <h4 style="margin:0 0 6px 0; font-size:15px; line-height:1.3;">${m.name}</h4>
                                <p style="font-size:13px; color:#555; margin:0; line-height:1.4;">${m.description || ''}</p>
                            </div>
                        </div>
                    `;
                });
            });

            grid.innerHTML = html || '<p>No merchants found in this sector.</p>';
        }

        attachSectorFilters(container, sectors) {
            const pills = container.querySelectorAll('.sector-pill');

            pills.forEach(pill => {
                pill.addEventListener('click', () => {
                    pills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    const sector = pill.dataset.sector;
                    this.renderMerchantGrid(container, sectors, sector);
                });
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-network-widget]').forEach(el => new NetworkWidget(el));
    });

    window.NetworkWidget = NetworkWidget;
})();