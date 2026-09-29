// ====================== audiotour.js ======================
// Multi-instance Audio Tour System
// - Respects global mute state from header (localStorage.audioMuted)
// - Dynamic container support via container="..." attribute
// - JSON loaded asynchronously in the background
// - dialog-text is specifically for category-widget: displayed as typed text in #cw-dialog-text
// - If a message has "text" → show hover tooltip with offset
// - If a message has no "text" → no hover tooltip
// - dialog-text must be displayed as typed text in the cw-dialog-text control
// - The audio must be loaded asynchronously - it MUST NOT block the loading of its parent page
// - Do NOT show the help button until the audio is loaded
// - If the audio file is missing, do not show the audiotour button
// - When writing to the dialog, wait the same duration as the audio of this text would have lasted
// - STRICTLY ONE AFTER THE OTHER — each step fully completes before the next begins (no overlap)
// - When hover + dialog both present: show BOTH AT THE SAME TIME and wait ONCE (single audio duration)
// - FIXED: Hover tooltips now reliably aligned over their target objects
// - FIXED: Help button now 100% resets to question-mark icon + start function after tour ends
// - FIXED: As soon as the LAST message begins playing, the button resets immediately (no massive gap after final dialog)
// - ROBUST AUDIO: Always waits for real audio playback to fully complete before moving to next message.
//   If browser blocks autoplay, falls back to estimated reading duration (never resolves early).
// - NEW: If the Catalog Widget is currently speaking when the tour starts, it is cancelled first.
// - NEW: Supports optional "role" property in tour messages. If a message has "role", it is only shown
//        if the logged-in user has that role (e.g. "community", "merchant", "partner", "admin").
//        Messages without a "role" property are always shown.
// - FIXED: getUserRoles() now uses the exact same decodeToken method as header-widget.js
// - UPDATED: Audio tour JSON now loaded from S3 using tts-language and tts-voice from /index.json
//            Example: https://madeira-widget-audiotour.s3.eu-west-2.amazonaws.com/en/eve/categories-widget-audiotour.json

(function() {
    const tours = {};

    function decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            const decoded = atob(payload);
            return JSON.parse(decoded);
        } catch (e) {
            console.error('Failed to decode token:', e.message);
            return null;
        }
    }

    function getUserRoles() {
        try {
            if (window.userRoles && Array.isArray(window.userRoles) && window.userRoles.length > 0) {
                return window.userRoles.map(r => String(r).toLowerCase().trim());
            }

            if (window.currentUser?.roles && Array.isArray(window.currentUser.roles) && window.currentUser.roles.length > 0) {
                return window.currentUser.roles.map(r => String(r).toLowerCase().trim());
            }

            const token = localStorage.getItem('authToken');
            if (!token) {
                console.warn('[AudioTour] No authToken in localStorage');
                return [];
            }

            const decoded = decodeToken(token);
            if (!decoded) {
                console.warn('[AudioTour] Failed to decode token');
                return [];
            }

            let roles = [];

            if (Array.isArray(decoded.roles)) {
                roles = decoded.roles;
            } else if (Array.isArray(decoded.permissions)) {
                roles = decoded.permissions;
            } else if (Array.isArray(decoded.user?.roles)) {
                roles = decoded.user.roles;
            } else if (Array.isArray(decoded.permissions?.roles)) {
                roles = decoded.permissions.roles;
            } else if (Array.isArray(decoded['https://clubmadeira.io/roles'])) {
                roles = decoded['https://clubmadeira.io/roles'];
            } else if (typeof decoded.role === 'string') {
                roles = [decoded.role];
            }

            const normalized = roles
                .map(r => String(r).toLowerCase().trim())
                .filter(Boolean);

            console.log('[AudioTour] Extracted roles from JWT:', normalized);
            return normalized;

        } catch (e) {
            console.error('[AudioTour] Failed to extract roles from JWT', e);
            return [];
        }
    }

    async function getTourUrl(widgetName, providedUrl) {
        // Only respect providedUrl if it's a full external URL.
        // Ignore old local paths like "./xxx.json?v=1.2"
        const isExternalUrl = providedUrl && 
            (providedUrl.startsWith('http://') || providedUrl.startsWith('https://'));

        if (isExternalUrl) {
            return providedUrl;
        }

        try {
            const res = await fetch('/index.json');
            if (!res.ok) throw new Error('Failed to load /index.json');

            const config = await res.json();
            const language = config['tts-language'] || 'en';
            const voice = config['tts-voice'] || 'eve';

            return `https://madeira-widget-audiotour.s3.eu-west-2.amazonaws.com/${language}/${voice}/${widgetName}-audiotour.json`;
        } catch (err) {
            console.warn('[AudioTour] Could not load tts config from /index.json, falling back to local file');
            return `${widgetName}-audiotour.json`;
        }
    }

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
            tooltipContainer: null,
            helpButtonVisible: false,
            typingInterval: null
        };

        state.widgetElement = document.getElementById(widgetName) || document.querySelector(`#${widgetName}`);
        if (!state.widgetElement) {
            console.error(`[AudioTour] Widget element #${widgetName} not found`);
            return;
        }

        state.placementElement = state.widgetElement.querySelector('.audiotour-placement');

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

        function createControls() {
            const parent = state.placementElement || state.widgetElement;
            const existing = parent.querySelector('.audiotour-controls');
            if (existing) existing.remove();

            state.controls = document.createElement('div');
            state.controls.className = 'audiotour-controls';
            state.controls.style.display = 'none';

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
                }
            };

            state.controls.appendChild(questionBtn);
            parent.appendChild(state.controls);
        }

        function isGloballyMuted() {
            return localStorage.getItem('audioMuted') === 'true';
        }

        function showDialogText(text) {
            const dialogSpan = document.getElementById('cw-dialog-text');
            if (!dialogSpan || !text) return;

            if (state.typingInterval) clearInterval(state.typingInterval);

            dialogSpan.textContent = '';
            const words = text.split(' ');
            let i = 0;
            state.typingInterval = setInterval(() => {
                if (i < words.length) {
                    dialogSpan.textContent += (i > 0 ? ' ' : '') + words[i];
                    i++;
                    dialogSpan.scrollTop = dialogSpan.scrollHeight;
                } else {
                    clearInterval(state.typingInterval);
                    state.typingInterval = null;
                }
            }, 60);
        }

        function createTooltip(text, x, y, targetElement) {
            if (!text) return null;

            const existing = document.getElementById('audiotour-tooltip');
            if (existing) existing.remove();

            const tooltip = document.createElement('div');
            tooltip.id = 'audiotour-tooltip';
            tooltip.style.cssText = `
                position: fixed;
                background: #1e2937;
                color: #f1f5f9;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 14px;
                max-width: 260px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.4);
                z-index: 99999;
                pointer-events: none;
                line-height: 1.4;
                border: 1px solid #334155;
            `;
            tooltip.textContent = text;
            document.body.appendChild(tooltip);

            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                let left = rect.left + (x || 20);
                let top = rect.top + (y || -70);

                if (left + tooltip.offsetWidth > window.innerWidth - 20) left = rect.right - tooltip.offsetWidth - 10;
                if (top < 20) top = rect.bottom + 10;
                if (top + tooltip.offsetHeight > window.innerHeight - 20) top = rect.top - tooltip.offsetHeight - 10;

                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            } else {
                tooltip.style.left = '50px';
                tooltip.style.top = '80px';
            }

            return tooltip;
        }

        function getReadingDuration(text) {
            const wordCount = text.trim().split(/\s+/).length;
            return Math.max(1600, wordCount * 380);
        }

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
                const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
                state.currentAudio = audio;

                let resolved = false;
                const finish = () => {
                    if (resolved) return;
                    resolved = true;
                    state.currentAudio = null;
                    resolve();
                };

                audio.onended = finish;
                audio.onerror = finish;

                audio.play()
                    .then(() => {})
                    .catch(() => {
                        console.warn('[AudioTour] Audio play blocked by browser — using estimated reading duration');
                        const duration = getReadingDuration(text || "");
                        setTimeout(finish, duration);
                    });
            });
        }

        async function runTourStep(step, isLast) {
            let tooltip = null;

            if (step["dialog-text"]) {
                showDialogText(step["dialog-text"]);
            }

            if (step.text && step.object) {
                const target = document.querySelector(step.object);
                tooltip = createTooltip(step.text, step.x, step.y, target);
            }

            if (isLast) {
                const questionBtn = state.controls?.querySelector('.audiotour-question-btn');
                if (questionBtn) {
                    questionBtn.innerHTML = `
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    `;
                    questionBtn.title = "Start audio tour";
                    questionBtn.onclick = () => {
                        if (state.currentTour?.messages?.length) startTour();
                    };
                    console.log('[AudioTour] Button reset immediately on last message start');
                }
            }

            await playAudio(step.base64, step.text || step["dialog-text"] || "");

            if (tooltip) {
                setTimeout(() => {
                    if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
                }, 800);
            }
        }

        async function startTour() {
            if (!state.currentTour?.messages?.length) {
                console.warn('[AudioTour] Tour data not loaded yet');
                return;
            }

            if (typeof window.stopCatalogAudio === 'function') {
                console.log('[AudioTour] Cancelling existing catalog audio before starting tour');
                window.stopCatalogAudio();
            }

            state.isTourRunning = true;

            const questionBtn = state.controls?.querySelector('.audiotour-question-btn');
            if (questionBtn) {
                questionBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
                questionBtn.onclick = stopTour;
            }

            let userRoles = getUserRoles();

            if (userRoles.length === 0) {
                await new Promise(r => setTimeout(r, 250));
                userRoles = getUserRoles();
            }

            const filteredMessages = state.currentTour.messages.filter(step => {
                if (!step.role) return true;
                const requiredRole = String(step.role).toLowerCase().trim();
                return userRoles.includes(requiredRole);
            });

            if (filteredMessages.length === 0) {
                console.warn('[AudioTour] No messages available for current user roles:', userRoles);
                stopTour();
                return;
            }

            console.log(`[AudioTour] Playing ${filteredMessages.length} messages for roles:`, userRoles);

            for (let i = 0; i < filteredMessages.length; i++) {
                if (!state.isTourRunning) break;
                const isLast = i === filteredMessages.length - 1;
                await runTourStep(filteredMessages[i], isLast);
            }

            stopTour();
        }

        function stopTour() {
            state.isTourRunning = false;

            if (state.currentAudio) {
                state.currentAudio.pause();
                state.currentAudio = null;
            }

            if (state.typingInterval) {
                clearInterval(state.typingInterval);
                state.typingInterval = null;
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
                questionBtn.title = "Start audio tour";
                questionBtn.onclick = () => {
                    if (state.currentTour?.messages?.length) startTour();
                };
                console.log('[AudioTour] Help button fully reset after tour end');
            }
        }

        async function loadTourData() {
            const finalUrl = await getTourUrl(widgetName, jsonUrl);

            fetch(finalUrl)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    state.currentTour = data;
                    console.log(`[AudioTour] ✅ Tour data loaded for: ${widgetName} from ${finalUrl}`);

                    const hasAudio = data.messages && data.messages.some(m => m.base64 && m.base64.length > 10);
                    if (state.controls && data.messages && data.messages.length > 0 && hasAudio) {
                        state.controls.style.display = 'inline-flex';
                        state.helpButtonVisible = true;
                        console.log(`[AudioTour] Help button now visible for ${widgetName}`);
                    } else {
                        console.warn(`[AudioTour] No valid audio found — hiding button`);
                        if (state.controls) state.controls.style.display = 'none';
                    }
                })
                .catch(err => {
                    console.error(`[AudioTour] Failed to load tour data for ${widgetName}:`, err.message);
                    if (state.controls) state.controls.style.display = 'none';
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
        createTour(widgetName, jsonUrl);
    };
})();