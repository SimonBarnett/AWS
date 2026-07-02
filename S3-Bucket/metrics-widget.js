(function() {
    document.addEventListener('DOMContentLoaded', () => {
        // ====================== STYLES ======================
        const styles = `
            #metrics-widget {
                position: relative;
                width: 100%;
                max-width: 1200px;
                margin: 20px auto;
                padding: 0;
                box-sizing: border-box;
            }
            .metrics-container {
                display: flex;
                overflow-x: auto;
                padding: 10px 0;
                gap: 20px;
                scroll-behavior: smooth;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: thin;
            }
            .metrics-container::-webkit-scrollbar {
                height: 6px;
            }
            .metrics-container::-webkit-scrollbar-thumb {
                background-color: #ccc;
                border-radius: 3px;
            }

            /* Desktop drag styles */
            .metrics-container.draggable {
                cursor: grab;
                user-select: none;
            }
            .metrics-container.dragging {
                cursor: grabbing;
            }

            .metric-card {
                flex: 0 0 auto;
                width: 250px;
                padding: 10px;
                background: #f9f9f9;
                border: 1px solid #ddd;
                border-radius: 8px;
                text-align: center;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .metric-card:nth-child(4n+1) { background-color: #61cfff; }
            .metric-card:nth-child(4n+2) { background-color: #ff61ff; }
            .metric-card:nth-child(4n+3) { background-color: #fe6f61; }
            .metric-card:nth-child(4n+4) { background-color: #6bff61; }

            .metric-card i {
                font-size: 1.5em;
                margin-bottom: 5px;
                color: #fff;
            }
            .metric-card h3 {
                font-size: 0.9em;
                margin: 5px 0;
                color: #333;
            }
            .metric-card p {
                font-size: 1em;
                font-weight: bold;
                color: #333;
            }
            .metric-card .warning {
                color: #ff4500;
            }
            .error-message {
                text-align: center;
                color: red;
                font-size: 1.2em;
                margin-top: 20px;
            }

            /* Arrow buttons */
            .metrics-arrow {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                width: 36px;
                height: 36px;
                background: rgba(255, 255, 255, 0.95);
                border: 1px solid #ddd;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 20;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                transition: all 0.2s ease;
                font-size: 16px;
                color: #333;
            }
            .metrics-arrow:hover {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }
            .metrics-arrow.left {
                left: 8px;
            }
            .metrics-arrow.right {
                right: 8px;
            }

            @media (max-width: 600px) {
                .metrics-arrow {
                    width: 32px;
                    height: 32px;
                    font-size: 14px;
                }
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
                width: 100px;
                height: 100px;
            }
            .loading-overlay .spinner {
                position: absolute;
                border-radius: 50%;
                border: 4px solid transparent;
                animation: spin 1.5s linear infinite;
            }
            .loading-overlay .spinner-1 { width: 40px; height: 40px; border-top-color: #ff6f61; top: 30px; left: 30px; animation-delay: 0s; }
            .loading-overlay .spinner-2 { width: 30px; height: 30px; border-top-color: #6bff61; top: 35px; left: 35px; animation-delay: 0.3s; }
            .loading-overlay .spinner-3 { width: 20px; height: 20px; border-top-color: #61cfff; top: 40px; left: 40px; animation-delay: 0.6s; }
            .loading-overlay .spinner-4 { width: 10px; height: 10px; border-top-color: #ff61ff; top: 45px; left: 45px; animation-delay: 0.9s; }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;

        // Inject styles
        const styleElement = document.createElement('style');
        styleElement.innerHTML = styles;
        document.head.appendChild(styleElement);

        // Load Font Awesome
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
            document.head.appendChild(faLink);
        }

        // Get or create widget container
        let widget = document.getElementById('metrics-widget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'metrics-widget';
            document.body.appendChild(widget);
        }

        // ====================== LOAD AUDIOTOUR ======================
        function loadAudioTourScript() {
            return new Promise((resolve, reject) => {
                if (window.initAudioTour) {
                    resolve();
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/audiotour.js';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Failed to load audiotour.js'));
                document.head.appendChild(script);
            });
        }

        // ====================== FETCH METRICS ======================
        async function fetchMetricsHtml() {
            const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="spinner-container">
                    <div class="spinner spinner-1"></div>
                    <div class="spinner spinner-2"></div>
                    <div class="spinner spinner-3"></div>
                    <div class="spinner spinner-4"></div>
                </div>
            `;
            widget.appendChild(loadingOverlay);
            loadingOverlay.style.display = 'flex';

            try {
                const headers = {};
                const token = localStorage.getItem('authToken');
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const response = await fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/ui/metrics', {
                    headers: headers
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch metrics');
                }

                const data = await response.json();

                if (data.html) {
                    widget.innerHTML = data.html;

                    // Re-add loading overlay
                    const newLoading = document.createElement('div');
                    newLoading.className = 'loading-overlay';
                    newLoading.innerHTML = loadingOverlay.innerHTML;
                    widget.appendChild(newLoading);

                    // Initialize drag + arrows
                    initHorizontalScrollWithArrows();

                    // Load Audio Tour
                    try {
                        await loadAudioTourScript();
                        if (window.initAudioTour) {
                            window.initAudioTour('metrics-widget', './metrics-widget-audiotour.json?v=1.2');
                        }
                    } catch (audioError) {
                        console.warn('[MetricsWidget] Could not load Audio Tour:', audioError);
                    }
                } else {
                    throw new Error('No HTML content in response');
                }
            } catch (error) {
                widget.innerHTML = `<div class="error-message">${error.message}</div>`;
            } finally {
                const overlay = widget.querySelector('.loading-overlay');
                if (overlay) overlay.style.display = 'none';
            }
        }

        // ====================== HORIZONTAL SCROLL + ARROWS ======================
        function initHorizontalScrollWithArrows() {
            const container = widget.querySelector('.metrics-container');
            if (!container) return;

            // Enable drag-to-scroll on desktop
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            if (!isTouchDevice) {
                initDragToScroll(container);
            }

            // Create Left Arrow
            const leftArrow = document.createElement('div');
            leftArrow.className = 'metrics-arrow left';
            leftArrow.innerHTML = '<i class="fas fa-chevron-left"></i>';
            widget.appendChild(leftArrow);

            // Create Right Arrow
            const rightArrow = document.createElement('div');
            rightArrow.className = 'metrics-arrow right';
            rightArrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
            widget.appendChild(rightArrow);

            // Scroll amount (roughly one card + gap)
            const scrollAmount = 270;

            leftArrow.addEventListener('click', () => {
                container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            });

            rightArrow.addEventListener('click', () => {
                container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            });

            // Optional: Hide arrows when at start/end (nice touch)
            const updateArrows = () => {
                const scrollLeft = container.scrollLeft;
                const maxScroll = container.scrollWidth - container.clientWidth;

                leftArrow.style.opacity = scrollLeft <= 10 ? '0.3' : '1';
                leftArrow.style.pointerEvents = scrollLeft <= 10 ? 'none' : 'auto';

                rightArrow.style.opacity = scrollLeft >= maxScroll - 10 ? '0.3' : '1';
                rightArrow.style.pointerEvents = scrollLeft >= maxScroll - 10 ? 'none' : 'auto';
            };

            container.addEventListener('scroll', updateArrows);
            window.addEventListener('resize', updateArrows);

            // Initial check
            setTimeout(updateArrows, 300);
        }

        // ====================== DRAG TO SCROLL (Desktop only) ======================
        function initDragToScroll(container) {
            let isDragging = false;
            let startX = 0;
            let scrollLeft = 0;

            container.classList.add('draggable');

            container.addEventListener('mousedown', (e) => {
                isDragging = true;
                container.classList.add('dragging');
                startX = e.pageX - container.offsetLeft;
                scrollLeft = container.scrollLeft;
            });

            container.addEventListener('mouseleave', () => {
                isDragging = false;
                container.classList.remove('dragging');
            });

            container.addEventListener('mouseup', () => {
                isDragging = false;
                container.classList.remove('dragging');
            });

            container.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const x = e.pageX - container.offsetLeft;
                const walk = (x - startX) * 1.6;
                container.scrollLeft = scrollLeft - walk;
            });
        }

        // Start the widget
        fetchMetricsHtml();
    });
})();