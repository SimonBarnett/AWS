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
            .loading-overlay .spinner-1 {
                width: 40px;
                height: 40px;
                border-top-color: #ff6f61;
                top: 30px;
                left: 30px;
                animation-delay: 0s;
            }
            .loading-overlay .spinner-2 {
                width: 30px;
                height: 30px;
                border-top-color: #6bff61;
                top: 35px;
                left: 35px;
                animation-delay: 0.3s;
            }
            .loading-overlay .spinner-3 {
                width: 20px;
                height: 20px;
                border-top-color: #61cfff;
                top: 40px;
                left: 40px;
                animation-delay: 0.6s;
            }
            .loading-overlay .spinner-4 {
                width: 10px;
                height: 10px;
                border-top-color: #ff61ff;
                top: 45px;
                left: 45px;
                animation-delay: 0.9s;
            }
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

        // Get or create the widget container
        let widget = document.getElementById('metrics-widget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'metrics-widget';
            document.body.appendChild(widget);
        }

        // Create loading overlay
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

                    // Load and initialize Audio Tour after content is loaded
                    try {
                        await loadAudioTourScript();
                        if (window.initAudioTour) {
                            window.initAudioTour('metrics-widget', './metrics-widget-audiotour.json');
                            console.log('[MetricsWidget] Audio Tour initialized');
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
                loadingOverlay.style.display = 'none';
            }
        }

        // Start everything
        fetchMetricsHtml();
    });
})();