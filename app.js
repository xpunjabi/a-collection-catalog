/**
 * A Collection Catalog — PWA Frontend Logic v0.16.0
 *
 * Vanilla JS + Alpine.js. No build pipeline. Loads catalog.json generated
 * by Head Office. All filtering/searching happens client-side.
 *
 * v0.16.0 improvements:
 * - Permanent product URLs via hash routing (#/SKU12345)
 * - Native Share button (Web Share API + fallback)
 * - Copy Link button per product
 * - Bigger WhatsApp CTA (full-width, more padding)
 * - Hide sold-out by default + toggle
 * - Multiple images in product detail modal
 */

// Common color name → hex mapping for the color dot in product cards.
const COLOR_HEX_MAP = {
  red: '#dc2626', maroon: '#7c2d12', crimson: '#b91c1c',
  pink: '#ec4899', magenta: '#d946ef', rose: '#f43f5e',
  orange: '#f97316', peach: '#fed7aa',
  yellow: '#eab308', gold: '#ca8a04', mustard: '#a16207',
  green: '#16a34a', emerald: '#059669', olive: '#65a30d',
  'bottle green': '#14532d', 'sea green': '#0d9488', teal: '#0f766e',
  blue: '#2563eb', navy: '#1e3a8a', royal: '#1d4ed8', sky: '#0ea5e9',
  'royal blue': '#1d4ed8', 'light blue': '#7dd3fc',
  purple: '#7c3aed', violet: '#7c3aed', lavender: '#a78bfa', mauve: '#c084fc',
  brown: '#92400e', beige: '#d6b89c', tan: '#a16207', coffee: '#4a2c2a',
  black: '#000000', white: '#ffffff', gray: '#6b7280', grey: '#6b7280',
  silver: '#cbd5e1', charcoal: '#1f2937',
  cream: '#fef3c7', offwhite: '#f5f5dc', ivory: '#fffff0',
  multicolor: 'linear-gradient(45deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6)',
  printed: 'linear-gradient(135deg, #f59e0b 25%, #ec4899 50%, #8b5cf6 75%)',
};

function colorToHex(name) {
  if (!name) return '#9ca3af';
  const lower = name.toLowerCase().trim();
  if (COLOR_HEX_MAP[lower]) return COLOR_HEX_MAP[lower];
  for (const key of Object.keys(COLOR_HEX_MAP)) {
    if (lower.includes(key)) return COLOR_HEX_MAP[key];
  }
  return '#9ca3af';
}

// Toast notification helper
function showToast(message, duration = 2000) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl border border-violet-500/50 text-sm font-medium';
  toast.style.transition = 'opacity 0.3s, transform 0.3s';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, -10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function catalogApp() {
  return {
    catalog: { brand: 'A Collection', whatsapp_number: '', version: '' },
    products: [],
    filteredProducts: [],
    loading: true,
    searchQuery: '',
    sortBy: 'newest',
    showFilters: false,
    selectedProduct: null,
    selectedImageIndex: 0,  // v0.16.0: For multiple images in modal
    showSoldOut: false,     // v0.16.0: Hidden by default, user can toggle
    copiedProductId: null,  // v0.16.0: For "Link Copied" feedback
    // v0.16.2: PWA install prompt
    deferredPrompt: null,   // Captured beforeinstallprompt event
    canInstall: false,      // Show Install button only when prompt is available
    isInstalled: false,     // Hide button if already installed (standalone mode)

    filters: {
      category: '',
      fabric: '',
      color: '',
      season: '',
      availability: '',
    },

    get activeFilters() {
      const out = [];
      if (this.filters.category) out.push({ key: 'category', value: this.filters.category, label: this.filters.category });
      if (this.filters.fabric) out.push({ key: 'fabric', value: this.filters.fabric, label: this.filters.fabric });
      if (this.filters.color) out.push({ key: 'color', value: this.filters.color, label: this.filters.color });
      if (this.filters.season) out.push({ key: 'season', value: this.filters.season, label: this.filters.season });
      if (this.filters.availability) out.push({ key: 'availability', value: this.filters.availability, label: this.filters.availability === 'available' ? 'Available' : 'Sold Out' });
      return out;
    },

    async init() {
      try {
        const url = `data/catalog.json?v=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.catalog = await res.json();
        this.products = this.catalog.products || [];

        // v0.16.0: Check URL hash for direct product link (#/SKU12345)
        this.handleHashChange();
        window.addEventListener('hashchange', () => this.handleHashChange());

        // v0.16.2: PWA install detection
        // Check if already running as installed PWA (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
          this.isInstalled = true;
        }

        // Capture the beforeinstallprompt event (Android Chrome only)
        // iOS Safari does NOT support this — users must use Share → Add to Home Screen
        window.addEventListener('beforeinstallprompt', (e) => {
          // Prevent the default browser install prompt (we'll show our own button)
          e.preventDefault();
          // Stash the event so it can be triggered later by our button
          this.deferredPrompt = e;
          this.canInstall = true;
          console.log('[catalog] Install prompt available — showing Install button');
        });

        // Listen for successful install (hide button after install)
        window.addEventListener('appinstalled', () => {
          this.canInstall = false;
          this.deferredPrompt = null;
          this.isInstalled = true;
          showToast('✓ App installed! Find it on your home screen.');
          console.log('[catalog] PWA installed successfully');
        });

        this.applyFilters();
      } catch (err) {
        console.error('[catalog] Failed to load catalog.json:', err);
        this.products = [];
        this.filteredProducts = [];
      } finally {
        this.loading = false;
      }
    },

    // v0.16.2: Trigger PWA install via our custom button
    async installApp() {
      if (!this.deferredPrompt) {
        // iOS Safari fallback — show instructions
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          showToast('To install: tap Share button → "Add to Home Screen"', 4000);
        } else {
          showToast('Install option not available. Use browser menu → "Install app" or "Add to Home screen".', 4000);
        }
        return;
      }

      // Show the browser's native install prompt
      this.deferredPrompt.prompt();

      // Wait for user's choice
      const { outcome } = await this.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('[catalog] User accepted install');
        showToast('Installing... Check your home screen in a moment.');
      } else {
        console.log('[catalog] User dismissed install');
      }

      // The prompt can only be used once — clear it
      this.deferredPrompt = null;
      this.canInstall = false;
    },

    // v0.16.0: Handle URL hash for permanent product links
    // Format: #/SKU12345 or #/product-name-slug
    handleHashChange() {
      const hash = window.location.hash.slice(1); // Remove #
      if (hash.startsWith('/') && hash.length > 1) {
        const slug = hash.slice(1); // Remove leading /
        // Try to match by SKU first, then by name slug
        let product = this.products.find(p => p.sku && p.sku.toLowerCase() === slug.toLowerCase());
        if (!product) {
          product = this.products.find(p => this.slugify(p.name) === slug);
        }
        if (product) {
          this.openProduct(product);
        }
      }
    },

    // v0.16.0: Generate URL-safe slug from product name
    slugify(text) {
      return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 80);
    },

    // v0.17.2: Sanitize SKU for URL/filename.
    // MUST match HO's sanitize_slug() exactly (case-sensitive!).
    // HO code (src-tauri/src/catalog_publish.rs):
    //   sku.chars().map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' }).collect()
    //   .trim_matches('-')
    // Examples: "D#26" → "D-26", "VOLUME#48 DS#14" → "VOLUME-48-DS-14"
    // NOTE: Case is PRESERVED (D → D, not d). GitHub Pages is case-sensitive.
    // DO NOT use slugify() for SKUs — slugify lowercases, which breaks matching.
    sanitizeSku(sku) {
      if (!sku) return '';
      return sku
        .replace(/[^a-zA-Z0-9-]/g, '-')   // non-alphanumeric/non-hyphen → hyphen
        .replace(/^-+|-+$/g, '');          // trim leading/trailing hyphens
    },

    // v0.17.0: Build permanent product URL using static product page.
    // During publish, HO generates products/<slug>.html for each product
    // with proper OG meta tags (for FB/WhatsApp link previews) + a redirect
    // script that opens the SPA with this product in the modal.
    // This URL works for: sharing, OG crawlers, direct access, copy link.
    // v0.17.2: SKU sanitized via sanitizeSku() to match HO's on-disk filename
    // (D#26 → D-26). Fallback to slugified name if no SKU.
    productUrl(product) {
      const slug = this.sanitizeSku(product.sku) || this.slugify(product.name);
      const base = window.location.origin + window.location.pathname;
      // Remove trailing index.html if present
      const cleanBase = base.replace(/index\.html$/, '');
      return `${cleanBase}products/${slug}.html`;
    },

    // v0.16.0: Copy product link to clipboard
    async copyProductLink(product) {
      const url = this.productUrl(product);
      try {
        await navigator.clipboard.writeText(url);
        this.copiedProductId = product.id;
        showToast('✓ Link Copied!');
        setTimeout(() => { this.copiedProductId = null; }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          showToast('✓ Link Copied!');
        } catch (e) {
          showToast('Could not copy. Long-press the URL bar to copy manually.');
        }
        textarea.remove();
      }
    },

    // v0.16.0: Native Share button (Web Share API with fallback)
    async shareProduct(product) {
      const url = this.productUrl(product);
      const shareData = {
        title: product.name,
        text: `Check out ${product.name} — Rs. ${this.formatPrice(product.sale_price)}\n\nAvailable at ${this.catalog.brand}. Order on WhatsApp!`,
        url: url,
      };

      if (navigator.share) {
        // Mobile + desktop browsers that support Web Share API
        try {
          await navigator.share(shareData);
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.warn('[share] Web Share failed:', err);
          }
        }
      } else {
        // Desktop fallback: show a small menu with copy + social links
        this.showShareFallback(product, url);
      }
    },

    // v0.16.0: Fallback share menu for desktop browsers without Web Share API
    showShareFallback(product, url) {
      // Build a simple modal with share options
      const waText = encodeURIComponent(`Check out ${product.name} — Rs. ${this.formatPrice(product.sale_price)}\n\n${url}`);
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-xs w-full p-5 shadow-2xl">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-bold text-slate-900">Share Product</h3>
            <button class="text-slate-400 hover:text-slate-600 text-xl leading-none" onclick="this.closest('.fixed').remove()">✕</button>
          </div>
          <div class="space-y-2">
            <button onclick="navigator.clipboard.writeText('${url}').then(() => { showToast('✓ Link Copied!'); this.closest('.fixed').remove(); })"
              class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 text-left">
              <span class="text-xl">🔗</span>
              <span class="text-sm font-medium text-slate-700">Copy Link</span>
            </button>
            <a href="https://wa.me/?text=${waText}" target="_blank" rel="noopener"
              class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 text-left">
              <span class="text-xl">💬</span>
              <span class="text-sm font-medium text-slate-700">WhatsApp</span>
            </a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener"
              class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 text-left">
              <span class="text-xl">📘</span>
              <span class="text-sm font-medium text-slate-700">Facebook</span>
            </a>
            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(product.name + ' — Rs. ' + this.formatPrice(product.sale_price))}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener"
              class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 text-left">
              <span class="text-xl">🐦</span>
              <span class="text-sm font-medium text-slate-700">X (Twitter)</span>
            </a>
            <a href="mailto:?subject=${encodeURIComponent(product.name)}&body=${encodeURIComponent('Check out this product:\n\n' + product.name + ' — Rs. ' + this.formatPrice(product.sale_price) + '\n\n' + url)}"
              class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 text-left">
              <span class="text-xl">✉️</span>
              <span class="text-sm font-medium text-slate-700">Email</span>
            </a>
          </div>
        </div>
      `;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      document.body.appendChild(modal);
    },

    applyFilters() {
      let result = [...this.products];

      // v0.16.0: Hide sold-out by default (unless user toggled showSoldOut)
      if (!this.showSoldOut) {
        result = result.filter(p => p.availability !== 'sold_out');
      }

      // Text search via Fuse.js (fuzzy)
      if (this.searchQuery.trim()) {
        const fuse = new Fuse(result, {
          keys: ['name', 'sku', 'color', 'fabric', 'category', 'description'],
          threshold: 0.4,
          ignoreLocation: true,
        });
        result = fuse.search(this.searchQuery.trim()).map(r => r.item);
      }

      // Apply structured filters
      if (this.filters.category) result = result.filter(p => p.category === this.filters.category);
      if (this.filters.fabric) result = result.filter(p => p.fabric === this.filters.fabric);
      if (this.filters.color) result = result.filter(p => p.color === this.filters.color);
      if (this.filters.season) result = result.filter(p => p.season === this.filters.season);
      if (this.filters.availability) result = result.filter(p => p.availability === this.filters.availability);

      // Sort
      switch (this.sortBy) {
        case 'price-low':
          result.sort((a, b) => a.sale_price - b.sale_price);
          break;
        case 'price-high':
          result.sort((a, b) => b.sale_price - a.sale_price);
          break;
        case 'name':
          result.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'newest':
        default:
          result.sort((a, b) => b.id - a.id);
      }

      this.filteredProducts = result;
    },

    removeFilter(key, value) {
      this.filters[key] = '';
      this.applyFilters();
    },

    clearAllFilters() {
      this.filters = { category: '', fabric: '', color: '', season: '', availability: '' };
      this.searchQuery = '';
      this.applyFilters();
    },

    filterPanelHtml() {
      const categories = this.uniqueValues('category');
      const fabrics = this.uniqueValues('fabric');
      const colors = this.uniqueValues('color');
      const seasons = this.uniqueValues('season');

      const renderGroup = (title, key, options) => {
        if (options.length === 0) return '';
        return `
          <div class="border-b border-slate-200 pb-3 mb-3">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">${title}</h3>
            <div class="space-y-1">
              ${options.map(opt => `
                <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:text-slate-900">
                  <input
                    type="radio"
                    name="${key}"
                    value="${opt}"
                    ${this.filters[key] === opt ? 'checked' : ''}
                    @change="$data.filters['${key}'] = '${opt}'; $data.applyFilters()"
                    class="text-violet-600 focus:ring-violet-500"
                  />
                  <span>${opt}</span>
                </label>
              `).join('')}
              ${this.filters[key] ? `
                <button
                  @click="$data.filters['${key}'] = ''; $data.applyFilters()"
                  class="text-[10px] text-violet-600 hover:underline mt-1"
                >Clear</button>
              ` : ''}
            </div>
          </div>
        `;
      };

      const colorGroup = colors.length > 0 ? `
        <div class="border-b border-slate-200 pb-3 mb-3">
          <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Color</h3>
          <div class="flex flex-wrap gap-1.5">
            ${colors.map(c => `
              <button
                @click="$data.filters.color = '${this.filters.color === c ? '' : c}'; $data.applyFilters()"
                class="w-7 h-7 rounded-full border-2 ${this.filters.color === c ? 'border-violet-600 ring-2 ring-violet-300' : 'border-slate-200'}"
                style="background-color: ${colorToHex(c)}"
                title="${c}"
                aria-label="${c}"
              ></button>
            `).join('')}
          </div>
          ${this.filters.color ? `
            <button
              @click="$data.filters.color = ''; $data.applyFilters()"
              class="text-[10px] text-violet-600 hover:underline mt-2"
            >Clear color</button>
          ` : ''}
        </div>
      ` : '';

      const availabilityGroup = `
        <div class="border-b border-slate-200 pb-3 mb-3">
          <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Availability</h3>
          <div class="space-y-1">
            <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:text-slate-900">
              <input type="radio" name="availability" value="available" ${this.filters.availability === 'available' ? 'checked' : ''} @change="$data.filters.availability = 'available'; $data.applyFilters()" class="text-violet-600 focus:ring-violet-500" />
              <span>Available</span>
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:text-slate-900">
              <input type="radio" name="availability" value="sold_out" ${this.filters.availability === 'sold_out' ? 'checked' : ''} @change="$data.filters.availability = 'sold_out'; $data.applyFilters()" class="text-violet-600 focus:ring-violet-500" />
              <span>Sold Out</span>
            </label>
            ${this.filters.availability ? `<button @click="$data.filters.availability = ''; $data.applyFilters()" class="text-[10px] text-violet-600 hover:underline mt-1">Clear</button>` : ''}
          </div>
        </div>
      `;

      return renderGroup('Category', 'category', categories)
           + renderGroup('Fabric', 'fabric', fabrics)
           + colorGroup
           + renderGroup('Season', 'season', seasons)
           + availabilityGroup;
    },

    uniqueValues(field) {
      const set = new Set();
      this.products.forEach(p => {
        if (p[field]) set.add(p[field]);
      });
      return Array.from(set).sort();
    },

    productImage(product) {
      if (product.images && product.images.length > 0) {
        return `data/images/${product.images[0]}`;
      }
      return this.placeholderImage();
    },

    // v0.16.0: Get image by index (for multiple images in modal)
    productImageByIndex(product, index) {
      if (product.images && product.images.length > index) {
        return `data/images/${product.images[index]}`;
      }
      return this.placeholderImage();
    },

    placeholderImage() {
      return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"%3E%3Crect fill="%23f3f4f6" width="400" height="500"/%3E%3Ctext x="50%25" y="45%25" font-family="sans-serif" font-size="48" fill="%23d1d5db" text-anchor="middle"%3E📷%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="sans-serif" font-size="14" fill="%239ca3af" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
    },

    onImageError(e) {
      e.target.src = this.placeholderImage();
    },

    formatPrice(n) {
      if (n == null) return '0';
      return Number(n).toLocaleString('en-PK');
    },

    // v0.17.0: Enhanced WhatsApp message with product URL for instant
    // identification. Seller sees Product ID + Name + Link — no need to
    // ask "which product?".
    whatsappLink(product) {
      const phone = (this.catalog.whatsapp_number || '').replace(/[^\d]/g, '');
      const productUrl = this.productUrl(product);
      const lines = [
        `Hello, I would like information about this product.`,
        ``,
        `Product ID: ${product.sku || product.id}`,
        `Product Name: ${product.name}`,
        `Product Link: ${productUrl}`,
      ];
      if (product.sale_price > 0) {
        lines.push(`Price: Rs. ${this.formatPrice(product.sale_price)}`);
      }
      lines.push(``, `Is this available?`);

      const text = encodeURIComponent(lines.join('\n'));
      return `https://wa.me/${phone}?text=${text}`;
    },

    generalWhatsappLink() {
      const phone = (this.catalog.whatsapp_number || '').replace(/[^\d]/g, '');
      const text = encodeURIComponent(`Assalamualaikum! I have a question about your products.`);
      return `https://wa.me/${phone}?text=${text}`;
    },

    // v0.16.0: Open product modal + set URL hash for permanent link
    openProduct(product) {
      this.selectedProduct = product;
      this.selectedImageIndex = 0;  // Reset to first image

      // Update URL hash for permanent link (without scrolling)
      const slug = product.sku || this.slugify(product.name);
      const newHash = `#/${slug}`;
      if (window.location.hash !== newHash) {
        history.pushState(null, '', newHash);
      }

      document.body.style.overflow = 'hidden';
      this.$nextTick(() => {
        document.addEventListener('keydown', this.escapeHandler);
      });
    },

    // v0.16.0: Close modal + clear URL hash
    closeProduct() {
      this.selectedProduct = null;
      // Clear hash without scrolling
      if (window.location.hash) {
        history.pushState(null, '', window.location.pathname);
      }
      document.body.style.overflow = '';
      document.removeEventListener('keydown', this.escapeHandler);
    },

    escapeHandler(e) {
      if (e.key === 'Escape') {
        this.closeProduct();
      }
    },

    // v0.16.0: Switch image in modal
    selectImage(index) {
      this.selectedImageIndex = index;
    },

    trackClick(product) {
      console.log('[catalog] Product clicked:', product.id, product.name);
    },
  };
}

window.catalogApp = catalogApp;
window.colorToHex = colorToHex;
window.showToast = showToast;

// v0.16.3: Service Worker registration with auto-update detection.
// When a new SW version is detected, show a non-intrusive toast prompting
// the user to refresh. This ensures customers always get the latest version
// without needing to hard-refresh manually.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(
      (reg) => {
        console.log('[catalog] Service Worker registered');

        // Listen for new SW versions taking control
        // When a new SW activates (via skipWaiting + clients.claim),
        // this event fires on the page. We show a toast asking the user
        // to refresh — but DON'T force refresh (could interrupt their browsing).
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          console.log('[catalog] New Service Worker activated — update ready');
          // Show a persistent toast with a refresh button
          showUpdateToast();
        });

        // v0.17.1: Poll for SW updates every 5 minutes (was 60s) + only when
        // tab is visible. Pakistan 3G/4G battery drain was too high at 60s.
        // Page Visibility API: skip update check when tab is in background.
        setInterval(() => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        }, 300000);
      },
      (err) => console.warn('[catalog] Service Worker registration failed:', err)
    );
  });
}

// v0.16.3: Show a non-intrusive "Update available" toast with a Refresh button.
// The toast stays visible until the user clicks Refresh or dismisses it.
// This is the key to ensuring customers get updates without hard-refreshing.
function showUpdateToast() {
  // Don't show if already showing
  if (document.getElementById('update-toast')) return;

  const toast = document.createElement('div');
  toast.id = 'update-toast';
  toast.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-violet-500/50 text-sm font-medium flex items-center gap-3';
  toast.style.transition = 'opacity 0.3s, transform 0.3s';
  toast.innerHTML = `
    <span>✨ New version available</span>
    <button onclick="window.location.reload()" class="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded-lg text-xs font-bold">
      Refresh
    </button>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white text-lg leading-none ml-1">×</button>
  `;
  document.body.appendChild(toast);
}

window.showUpdateToast = showUpdateToast;

