// sw.js
// Service Worker for Partner PWA
// Version: 20240628-5
// - Bypasses cache for S3 widgets
// - Bypasses cache for API calls
// - Bypasses cache for common CDNs (fixes intl-tel-input, marked.js, etc.)
// - Clean cache versioning + skipWaiting + clients.claim

const CACHE_VERSION = '20240628-6';
const CACHE_NAME = `madeira-pwa-cache-${CACHE_VERSION}`;

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

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // === BYPASS RULES (Always go to network) ===

    // 1. S3 Widget files (delegate-widget.js, audiotour.js, etc.)
    if (url.hostname === 'madeira-widget-bucket.s3.eu-west-2.amazonaws.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. Backend API calls
    if (url.origin === 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    // 3. Common CDNs (fixes intl-tel-input, marked.js, Chart.js, etc.)
    if (url.hostname === 'cdn.jsdelivr.net' || 
        url.hostname === 'unpkg.com' || 
        url.hostname === 'cdnjs.cloudflare.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    // Only cache GET requests
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    // Default strategy: Cache First with network fallback
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) {
                return cached;
            }

            return fetch(event.request).then(response => {
                // Only cache successful responses
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
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