// Service Worker para StockPro PWA
const CACHE_NAME = 'stockpro-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Arquivos para cache inicial
const CACHE_FILES = [
  '/',
  '/index.html',
  '/login.html',
  '/offline.html',
  '/manifest.json',
  '/css/custom.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/auth-check.js',
  '/js/app.js',
  '/js/modals.js',
  '/js/api.js',
  '/js/data-manager.js',
  '/js/fornecedores.js',
  '/js/pwa.js',
  // CDN assets (será cacheado quando acessado)
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

// Estratégias de cache
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  CACHE_ONLY: 'cache-only',
  NETWORK_ONLY: 'network-only',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(CACHE_FILES);
      })
      .then(() => {
        console.log('[SW] Skip waiting on install');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Cache installation failed:', error);
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming control');
      return self.clients.claim();
    })
  );
});

// Interceptação de requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Estratégia para diferentes tipos de requests
  if (request.method === 'GET') {
    if (url.pathname.startsWith('/tables/')) {
      // API calls - Network First
      event.respondWith(handleApiRequest(request));
    } else if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
      // Assets - Cache First
      event.respondWith(handleAssetRequest(request));
    } else if (url.pathname.endsWith('.html') || url.pathname === '/') {
      // HTML pages - Network First with offline fallback
      event.respondWith(handlePageRequest(request));
    } else {
      // Outros recursos - Stale While Revalidate
      event.respondWith(handleGenericRequest(request));
    }
  }
});

// Handler para requests de API
async function handleApiRequest(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.log('[SW] API request failed, checking cache');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Retorna resposta vazia para APIs offline
    return new Response('{"data": [], "offline": true}', {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handler para assets (JS, CSS)
async function handleAssetRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[SW] Asset fetch failed:', error);
    throw error;
  }
}

// Handler para páginas HTML
async function handlePageRequest(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.log('[SW] Page request failed, serving from cache');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback para página offline
    const offlineResponse = await caches.match(OFFLINE_URL);
    if (offlineResponse) {
      return offlineResponse;
    }
    
    // Última tentativa - página básica
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>StockPro - Offline</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .offline { color: #666; }
        </style>
      </head>
      <body>
        <h1>StockPro</h1>
        <p class="offline">Você está offline. Reconecte-se para continuar.</p>
        <button onclick="window.location.reload()">Tentar Novamente</button>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Handler genérico
async function handleGenericRequest(request) {
  const cachedResponse = await caches.match(request);
  
  // Retorna cache imediatamente se disponível
  if (cachedResponse) {
    // Tenta atualizar em background
    fetch(request).then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        const cache = caches.open(CACHE_NAME);
        cache.then(c => c.put(request, networkResponse.clone()));
      }
    }).catch(() => {
      // Ignora erros de network em background
    });
    
    return cachedResponse;
  }
  
  // Sem cache, tenta network
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[SW] Generic request failed:', error);
    throw error;
  }
}

// Background sync para quando voltar online
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log('[SW] Performing background sync');
  
  // Sincronizar dados pendentes quando voltar online
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'BACKGROUND_SYNC',
      data: 'Sincronizando dados...'
    });
  });
}

// Push notifications (para futuro)
self.addEventListener('push', event => {
  console.log('[SW] Push received:', event);
  
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação do StockPro',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Abrir App',
        icon: '/icons/checkmark.png'
      },
      {
        action: 'close',
        title: 'Fechar',
        icon: '/icons/xmark.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('StockPro', options)
  );
});

// Click em notificações
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click:', event);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handler para comunicação com app
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    event.waitUntil(updateCache());
  }
});

async function updateCache() {
  console.log('[SW] Updating cache');
  const cache = await caches.open(CACHE_NAME);
  return cache.addAll(CACHE_FILES);
}

// Cleanup de cache antigo
setInterval(() => {
  caches.keys().then(cacheNames => {
    cacheNames.forEach(cacheName => {
      if (cacheName !== CACHE_NAME) {
        caches.delete(cacheName);
      }
    });
  });
}, 24 * 60 * 60 * 1000); // 24 horas

console.log('[SW] Service Worker loaded successfully');