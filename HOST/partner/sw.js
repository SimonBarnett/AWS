// sw.js
// Service Worker for Partner PWA - Optimized for partner sites
// Version: 2026.06.14 - Cleaned + Hardened

const CACHE_NAME = 'madeira-pwa-cache-v2';   // Bump this version when you update cached files

const urlsToCache = [
    '/',
    '/index.html',
    '/apikey.html',
    '/category.html',
    '/dashboard.html',
    '/login.html',
    '/signup.html',
    '/images/icon-192.png',
    '/images/icon-512.png'
];

// Simple debug flag (set to false in production if you want zero logging)
const DEBUG = true;

const sendLog = (eventType, data = {}) => {
    if (!DEBUG) return;
    const logEntry = {
        timestamp: new Date().toISOString(),
        event: eventType,
        ...data
    };
    self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_LOG', log: logEntry }));
    });
};

// Install - Pre-cache critical files
self.addEventListener('install', event => {
    sendLog('install', { message: 'Service Worker installing' });
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())           // Activate immediately
            .catch(err => sendLog('install_error', { error: err.message }))
    );
});

// Activate - Clean up old caches
self.addEventListener('activate', event => {
    sendLog('activate', { message: 'Service Worker activating' });
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        sendLog('delete_old_cache', { cache: cacheName });
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())   // Take control of all tabs immediately
    );
});

// Fetch handler
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Always bypass Madeira API calls
    if (url.origin === 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    // Only cache GET requests
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Return cached version first (Cache-First)
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Not in cache → fetch from network
                return fetch(event.request).then(networkResponse => {
                    // Cache successful responses
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Offline fallback for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Optional: Listen for messages from the page
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});