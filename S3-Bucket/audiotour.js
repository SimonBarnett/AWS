// ====================== audiotour.js ======================
// Multi-instance Audio Tour System
// - Respects global mute state from header (localStorage.audioMuted)
// - Dynamic container support via container="..." attribute
// - JSON loaded asynchronously in the background

(function() {
    const tours = {};

    function createTour(widgetName, jsonUrl) {
        if (tours[widgetName]) {
            console.warn(`[AudioTour] Tour for "${widgetName}" already exists.`);
            return;
        }

        const state = {
            currentAudio: null,
            currentTour: null,
            isTourRunning: false,
            controls: null,
            widgetElement: null,
            placementElement: null,
            tooltipContainer: null
        };

        // Find main widget
        state.widgetElement = document.getElementById(widgetName) || document.querySelector(`#${widgetName}`);
        if (!state.widgetElement) {
            console.error(`[AudioTour] Widget element #${widgetName} not found`);
            return;
        }

        state.placementElement = state.widgetElement.querySelector('.audiotour-placement');

        // Determine tooltip container
        if (state.placementElement && state.placementElement.hasAttribute('container')) {
            const containerAttr = state.placementElement.getAttribute('container');
            state.tooltipContainer = containerAttr.startsWith('#')
                ? state.widgetElement.querySelector(containerAttr)
                : state.widgetElement.querySelector(`.${containerAttr}`);
        }

        if (!state.tooltipContainer) {
            state.tooltipContainer = state.widgetElement.querySelector('.madeira-charts-container')
                || state.widgetElement.querySelector('[class$="-container"]')
                || state.widgetElement;
        }

        if (!state.placementElement && getComputedStyle(state.widgetElement).position === 'static') {
            state.widgetElement.style.position = 'relative';
        }

        // ====================== CONTROLS ======================
        function createControls() {
            const parent = state.placementElement || state.widgetElement;
            const existing = parent.querySelector('.audiotour-controls');
            if (existing) existing.remove();

            state.controls = document.createElement('div');
            state.controls.className = 'audiotour-controls';

            if (state.placementElement) {
                state.controls.style.cssText = `display: inline-flex; gap: 6px; align-items: center;`;
            } else {
                state.controls.style.cssText = `
                    position: absolute;
                    bottom: 10px;
                    right: 10px;
                    z-index: 50;
                    display: flex;
                    gap: 6px;
                    background: rgba(30, 41, 59, 0.95);
                    padding: 5px;
                    border-radius: 9999px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                    align-items: center;
                    border: 1px solid rgba(255,255,255,0.1);
                `;
            }

            // Question mark button (Start/Stop tour)
            const questionBtn = document.createElement('button');
            questionBtn.className = 'audiotour-question-btn';
            questionBtn.title = "Start audio tour";
            questionBtn.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            `;
            questionBtn.style.cssText = `
                background: #3b82f6;
                border: none;
                width: 38px;
                height: 38px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease;
            `;

            questionBtn.onmouseenter = () => questionBtn.style.transform = 'scale(1.1)';
            questionBtn.onmouseleave = () => questionBtn.style.transform = 'scale(1)';

            questionBtn.onclick = () => {
                if (state.currentTour?.messages?.length) {
                    state.isTourRunning ? stopTour() : startTour();
                } else {
                    console.warn('[AudioTour] Tour data not loaded yet');
                }
            };

            state.controls.appendChild(questionBtn);
            parent.appendChild(state.controls);
        }

        // ====================== GLOBAL MUTE CHECK ======================
        function isGloballyMuted() {
            return localStorage.getItem('audioMuted') === 'true';
        }

        // ====================== TOOLTIP ======================
        function createTooltip(text, x, y, targetElement) {
            const existing = document.getElementById('audiotour-tooltip');
            if (existing) existing.remove();

            const tooltip = document.createElement('div');
            tooltip.id = 'audiotour-tooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: #1e2937;
                color: #f1f5f9;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 14px;
                max-width: 280px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.4);
                z-index: 99999;
                pointer-events: none;
                line-height: 1.4;
                border: 1px solid #334155;
            `;
            tooltip.textContent = text;

            state.tooltipContainer.appendChild(tooltip);

            const containerRect = state.tooltipContainer.getBoundingClientRect();

            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                let left = rect.right - containerRect.left + 10;
                let top = rect.top - containerRect.top + (y || 0);

                left += (x || 0);

                if (left + tooltip.offsetWidth > state.tooltipContainer.clientWidth - 10) {
                    left = rect.left - containerRect.left - tooltip.offsetWidth - 10;
                }

                const maxLeft = state.tooltipContainer.clientWidth - tooltip.offsetWidth - 10;
                const maxTop = state.tooltipContainer.clientHeight - tooltip.offsetHeight - 10;

                left = Math.max(10, Math.min(left, maxLeft));
                top = Math.max(10, Math.min(top, maxTop));

                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            } else {
                tooltip.style.left = `10px`;
                tooltip.style.top = `10px`;
            }

            return tooltip;
        }

        function getReadingDuration(text) {
            const wordCount = text.trim().split(/\s+/).length;
            return Math.max(1600, wordCount * 380);
        }

        // ====================== PLAY AUDIO (RESPECTS GLOBAL MUTE) ======================
        async function playAudio(base64Audio, text = "") {
            const globallyMuted = isGloballyMuted();

            if (globallyMuted || !base64Audio) {
                if (text) {
                    await new Promise(r => setTimeout(r, getReadingDuration(text)));
                }
                return;
            }

            if (state.currentAudio) {
                state.currentAudio.pause();
                state.currentAudio = null;
            }

            return new Promise(resolve => {
                state.currentAudio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
                state.currentAudio.onended = () => { state.currentAudio = null; resolve(); };
                state.currentAudio.onerror = () => { state.currentAudio = null; resolve(); };
                state.currentAudio.play().catch(() => resolve());
            });
        }

        async function runTourStep(step) {
            const target = state.tooltipContainer.querySelector(step.object);
            const tooltip = createTooltip(step.text, step.x, step.y, target);
            await playAudio(step.base64, step.text);
            if (tooltip?.parentNode) tooltip.parentNode.removeChild(tooltip);
        }

        async function startTour() {
            if (!state.currentTour?.messages?.length) {
                console.warn('[AudioTour] Tour data not loaded yet');
                return;
            }

            state.isTourRunning = true;

            const questionBtn = state.controls?.querySelector('.audiotour-question-btn');
            if (questionBtn) {
                questionBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
                questionBtn.onclick = stopTour;
            }

            for (let step of state.currentTour.messages) {
                if (!state.isTourRunning) break;
                await runTourStep(step);
            }
            stopTour();
        }

        function stopTour() {
            state.isTourRunning = false;

            if (state.currentAudio) {
                state.currentAudio.pause();
                state.currentAudio = null;
            }

            const tooltip = document.getElementById('audiotour-tooltip');
            if (tooltip) tooltip.remove();

            const questionBtn = state.controls?.querySelector('.audiotour-question-btn');
            if (questionBtn) {
                questionBtn.innerHTML = `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                `;
                questionBtn.onclick = () => {
                    if (state.currentTour?.messages?.length) startTour();
                };
            }
        }

        // ====================== BACKGROUND JSON LOADING ======================
        function loadTourData() {
            fetch(jsonUrl)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    state.currentTour = data;
                    console.log(`[AudioTour] ✅ Tour data loaded for: ${widgetName}`);
                })
                .catch(err => {
                    console.error(`[AudioTour] Failed to load tour data for ${widgetName}:`, err.message);
                });
        }

        function init() {
            createControls();
            loadTourData();
            console.log(`[AudioTour] Controls ready for: ${widgetName} (respects global header mute)`);
        }

        tours[widgetName] = state;
        init();
    }

    window.initAudioTour = function(widgetName, jsonUrl = null) {
        if (!widgetName) {
            console.error('[AudioTour] widgetName is required');
            return;
        }
        const url = jsonUrl || `${widgetName}-audiotour.json`;
        createTour(widgetName, url);
    };
})();