// ====================== partner-gallery.js ======================
// Self-contained Partner Profile Widget
// Hosted on S3 and loaded on partner sites
// Allows editing partner details + logo upload (same UI style as Club Gallery)
// Includes aggressive client-side image compression + size validation

(function () {
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
        document.head.appendChild(fa);
    }

    class PartnerGalleryWidget {
        constructor(containerId = 'partner-gallery-widget') {
            this.container = document.getElementById(containerId);
            if (!this.container) {
                console.error('PartnerGalleryWidget: Container not found');
                return;
            }

            this.apiBase = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/partner';
            this.token = localStorage.getItem('authToken');
            this.currentPartner = null;
            this.selectedFile = null;

            this.render();
            this.loadPartnerData();
        }

        render() {
            this.container.innerHTML = `
                <style>
                    .partner-container {
                        max-width: 900px;
                        margin: 0 auto;
                        font-family: system-ui, -apple-system, sans-serif;
                    }
                    .partner-header {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 24px;
                    }
                    .partner-header h2 {
                        margin: 0;
                        font-size: 1.5rem;
                        color: #1f2937;
                    }
                    .partner-card {
                        background: white;
                        border: 1px solid #e5e7eb;
                        border-radius: 12px;
                        padding: 24px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    }
                    .form-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                        margin-bottom: 24px;
                    }
                    .form-group {
                        display: flex;
                        flex-direction: column;
                    }
                    .form-group.full-width {
                        grid-column: 1 / -1;
                    }
                    .form-group label {
                        font-weight: 600;
                        margin-bottom: 6px;
                        color: #374151;
                        font-size: 0.9rem;
                    }
                    .form-group input,
                    .form-group textarea {
                        padding: 10px 12px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        font-size: 0.95rem;
                    }
                    .form-group textarea {
                        min-height: 100px;
                        resize: vertical;
                    }

                    .logo-upload-section {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 24px;
                        margin-top: 20px;
                    }
                    .upload-box {
                        border: 2px dashed #9ca3af;
                        border-radius: 12px;
                        padding: 30px;
                        text-align: center;
                        transition: all 0.2s ease;
                        cursor: pointer;
                        background: #f9fafb;
                    }
                    .upload-box:hover {
                        border-color: #3b82f6;
                        background: #eff6ff;
                    }
                    .upload-box.dragover {
                        border-color: #3b82f6;
                        background: #dbeafe;
                    }
                    .upload-icon {
                        font-size: 42px;
                        color: #6b7280;
                        margin-bottom: 12px;
                    }
                    .upload-text {
                        color: #4b5563;
                        font-size: 0.95rem;
                    }
                    .upload-text small {
                        color: #9ca3af;
                    }
                    .current-logo {
                        max-width: 180px;
                        max-height: 120px;
                        border-radius: 8px;
                        border: 1px solid #e5e7eb;
                        object-fit: contain;
                        margin-bottom: 12px;
                    }
                    .save-btn {
                        background: #3b82f6;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .save-btn:hover {
                        background: #2563eb;
                    }
                    .instructions {
                        background: #eff6ff;
                        border-left: 4px solid #3b82f6;
                        padding: 16px;
                        border-radius: 8px;
                        margin-bottom: 24px;
                    }
                </style>

                <div class="partner-container">
                    <div class="partner-header">
                        <i class="fas fa-images" style="font-size: 28px; color: #3b82f6;"></i>
                        <h2>Partner Profile</h2>
                    </div>

                    <div class="partner-card">
                        <div class="instructions">
                            <strong>Instructions:</strong>
                            <ul style="margin: 8px 0 0 20px; padding: 0;">
                                <li>Update your partner information below.</li>
                                <li>Upload a high-quality logo using drag & drop or click to browse.</li>
                                <li>Click <strong>Save Changes</strong> after making updates.</li>
                            </ul>
                        </div>

                        <form id="partnerForm">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Partner Name *</label>
                                    <input type="text" id="name" required>
                                </div>
                                <div class="form-group">
                                    <label>Location</label>
                                    <input type="text" id="location">
                                </div>
                                <div class="form-group">
                                    <label>Website</label>
                                    <input type="url" id="website" placeholder="https://">
                                </div>
                                <div class="form-group">
                                    <label>Phone</label>
                                    <input type="tel" id="phone">
                                </div>
                                <div class="form-group full-width">
                                    <label>Description</label>
                                    <textarea id="description" placeholder="Describe your services..."></textarea>
                                </div>
                                <div class="form-group full-width">
                                    <label>Services Provided (comma separated)</label>
                                    <input type="text" id="provides" placeholder="Web Design, SEO, Hosting">
                                </div>
                            </div>

                            <h4 style="margin: 24px 0 12px 0; color: #374151;">Partner Logo</h4>
                            
                            <div class="logo-upload-section">
                                <div>
                                    <label style="font-weight:600; margin-bottom:8px; display:block;">Current Logo</label>
                                    <div id="currentLogoContainer">
                                        <img id="currentLogo" class="current-logo" style="display:none;" alt="Current Logo">
                                        <div id="noLogoText" style="color:#9ca3af; font-size:0.9rem;">No logo uploaded yet.</div>
                                    </div>
                                </div>

                                <div>
                                    <label style="font-weight:600; margin-bottom:8px; display:block;">Upload New Logo</label>
                                    <div id="logoDropZone" class="upload-box">
                                        <i class="fas fa-cloud-upload-alt upload-icon"></i>
                                        <div class="upload-text">
                                            <strong>Drag & drop logo here</strong><br>
                                            <small>or click to browse</small>
                                        </div>
                                        <input type="file" id="logoFileInput" accept="image/*" style="display:none;">
                                    </div>
                                    <div id="selectedFileName" style="margin-top:8px; font-size:0.85rem; color:#6b7280;"></div>
                                </div>
                            </div>

                            <div style="margin-top: 30px; text-align: right;">
                                <button type="submit" class="save-btn">
                                    <i class="fas fa-save"></i> Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            this.attachEventListeners();
        }

        attachEventListeners() {
            const form = this.container.querySelector('#partnerForm');
            const dropZone = this.container.querySelector('#logoDropZone');
            const fileInput = this.container.querySelector('#logoFileInput');

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.savePartner();
            });

            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    this.handleFileSelect(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
        }

        async handleFileSelect(file) {
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file.');
                return;
            }

            // Hard limit: reject anything over 2MB
            if (file.size > 2 * 1024 * 1024) {
                alert('Image is too large. Please use an image smaller than 2MB.');
                return;
            }

            try {
                // Aggressive compression for logos
                const compressedBase64 = await this.compressImage(file, 500, 0.7);

                this.selectedFile = {
                    name: file.name,
                    base64: compressedBase64
                };

                const nameEl = this.container.querySelector('#selectedFileName');
                nameEl.textContent = `Selected: ${file.name} (compressed)`;
                nameEl.style.color = '#3b82f6';
            } catch (err) {
                console.error('Image compression failed', err);
                alert('Failed to process image. Please try again with a smaller file.');
            }
        }

        compressImage(file, maxWidth = 500, quality = 0.7) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        const compressedBase64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                        resolve(compressedBase64);
                    };
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        async loadPartnerData() {
            if (!this.token) {
                this.container.innerHTML = '<p style="color:red;">Authentication required. Please log in.</p>';
                return;
            }

            try {
                const res = await fetch(this.apiBase, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });

                const data = await res.json();
                if (data.partner) {
                    this.currentPartner = data.partner;
                    this.populateForm(data.partner);
                }
            } catch (err) {
                console.error('Failed to load partner data', err);
            }
        }

        populateForm(partner) {
            const fields = ['name', 'location', 'website', 'phone', 'description', 'provides'];
            fields.forEach(field => {
                const el = this.container.querySelector(`#${field}`);
                if (el) el.value = partner[field.charAt(0).toUpperCase() + field.slice(1)] || '';
            });

            const logoImg = this.container.querySelector('#currentLogo');
            const noLogo = this.container.querySelector('#noLogoText');

            if (partner.Logo) {
                logoImg.src = partner.Logo;
                logoImg.style.display = 'block';
                noLogo.style.display = 'none';
            } else {
                logoImg.style.display = 'none';
                noLogo.style.display = 'block';
            }
        }

        async savePartner() {
            const formData = {
                Name: this.container.querySelector('#name').value,
                Location: this.container.querySelector('#location').value,
                Website: this.container.querySelector('#website').value,
                Phone: this.container.querySelector('#phone').value,
                Description: this.container.querySelector('#description').value,
                Provides: this.container.querySelector('#provides').value
            };

            if (this.selectedFile) {
                formData.logoBase64 = this.selectedFile.base64;
                formData.logoFileName = this.selectedFile.name;
            }

            try {
                const res = await fetch(this.apiBase, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify(formData)
                });

                const result = await res.json();

                if (result.status === 'success') {
                    alert('Partner profile saved successfully!');
                    this.loadPartnerData();
                    this.selectedFile = null;
                    this.container.querySelector('#selectedFileName').textContent = '';
                } else {
                    alert(result.error_message || 'Failed to save changes');
                }
            } catch (err) {
                console.error(err);
                alert('Error saving partner profile');
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('partner-gallery-widget')) {
            new PartnerGalleryWidget('partner-gallery-widget');
        }
    });

    window.PartnerGalleryWidget = PartnerGalleryWidget;
})();