// MediTrack Service Worker v1.0
const CACHE_NAME = 'meditrack-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap'
];

// ── INSTALL: cache all assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('SW: Some assets failed to cache', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fall back to network ──
self.addEventListener('fetch', event => {
  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── PUSH NOTIFICATIONS (from server, future use) ──
self.addEventListener('push', event => {
  let data = { title: '💊 MediTrack', body: 'Time to take your medication!' };
  try { data = event.data.json(); } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192x192.png',
      badge: './icons/icon-72x72.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: data.tag || 'meditrack-dose',
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: 'open', title: '📷 Log Dose' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: data
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// ── SCHEDULED DOSE REMINDERS via postMessage ──
// The app posts alarm times here; SW schedules them
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    // Store reminder data for background checking
    const { doses, medName } = event.data;
    self.doseReminders = { doses, medName };
  }

  if (event.data && event.data.type === 'DOSE_TAKEN') {
    const { label, medName } = event.data;
    self.registration.showNotification('✅ Dose Logged — MediTrack', {
      body: `${medName} ${label} dose has been marked as taken with photo proof.`,
      icon: './icons/icon-192x192.png',
      badge: './icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      tag: 'meditrack-taken',
    });
  }
});

// ── PERIODIC BACKGROUND SYNC (if supported) ──
self.addEventListener('periodicsync', event => {
  if (event.tag === 'meditrack-reminder-check') {
    event.waitUntil(checkDoseReminders());
  }
});

async function checkDoseReminders() {
  if (!self.doseReminders) return;
  const { doses, medName } = self.doseReminders;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (const dose of doses) {
    if (dose.status !== 'pending') continue;
    const [h, m] = dose.time.split(':').map(Number);
    const doseMins = h * 60 + m;
    if (Math.abs(nowMins - doseMins) <= 1) {
      await self.registration.showNotification(`💊 Time for your ${dose.label} dose!`, {
        body: `${medName} — don't forget to take it and log with a photo.`,
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-72x72.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: `dose-${dose.index}`,
        requireInteraction: true,
        actions: [
          { action: 'open', title: '📷 Log Now' },
          { action: 'snooze', title: '⏰ Snooze 10min' }
        ]
      });
    }
  }
}
