/**
 * A Collection Catalog — PWA Frontend Logic
 *
 * Vanilla JS + Alpine.js. No build pipeline. Loads catalog.json generated
 * by Head Office. All filtering/searching happens client-side.
 *
 * catalog.json structure:
 * {
 *   "brand": "A Collection Narowal",
 *   "whatsapp_number": "923420830995",
 *   "version": "2026-07-01T12:00:00Z",
 *   "products": [
 *     {
 *       "id": 1,
 *       "name": "Nishat 3-Piece Lawn Suit - Maroon Floral",
 *       "sku": "AC-2026-001",
 *       "sale_price": 3300,
 *       "retail_price": 4000,
 *       "category": "3 Piece",
 *       "color": "Maroon",
 *       "fabric": "Lawn",
 *       "season": "Summer",
 *       "description": "...",
 *       "images": ["1730123456.webp"],
 *       "availability": "available" | "sold_out"
 *     }
 *   ]
 * }
 */

// Common color name → hex mapping for the color dot in product cards.
// Falls back to a neutral gray for unknown colors.
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
  // Try to match a known color word within the name (e.g., "Royal Blue" → "blue")
  for (const key of Object.keys(COLOR_HEX_MAP)) {
    if (lower.includes(key)) return COLOR_HEX_MAP[key];
  }
  return '#9ca3af';
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

    // Active filter state
    filters: {
      category: '',
      fabric: '',
      color: '',
      season: '',
      availability: '',
    },

    // Computed active filters for chip display
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
        // Cache-bust catalog.json so new publishes show immediately
        const url = `data/catalog.json?v=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.catalog = await res.json();
        this.products = this.catalog.products || [];
        this.applyFilters();
      } catch (err) {
        console.error('[catalog] Failed to load catalog.json:', err);
        this.products = [];
        this.filteredProducts = [];
      } finally {
        this.loading = false;
      }
    },

    applyFilters() {
      let result = [...this.products];

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

    // Generate filter panel HTML (rendered via x-html for reactivity)
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

    // Product image URL — uses first image in array, falls back to placeholder
    productImage(product) {
      if (product.images && product.images.length > 0) {
        return `data/images/${product.images[0]}`;
      }
      return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"%3E%3Crect fill="%23f3f4f6" width="300" height="400"/%3E%3Ctext x="50%25" y="50%25" font-family="sans-serif" font-size="14" fill="%239ca3af" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
    },

    onImageError(e, product) {
      // Fallback to placeholder on broken image
      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"%3E%3Crect fill="%23f3f4f6" width="300" height="400"/%3E%3Ctext x="50%25" y="50%25" font-family="sans-serif" font-size="14" fill="%239ca3af" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
    },

    formatPrice(n) {
      if (n == null) return '0';
      return Number(n).toLocaleString('en-PK');
    },

    // Generate WhatsApp order link for a specific product
    whatsappLink(product) {
      const phone = (this.catalog.whatsapp_number || '').replace(/[^\d]/g, '');
      const lines = [
        `Assalamualaikum! I'm interested in this product:`,
        ``,
        `📦 ${product.name}`,
      ];
      if (product.sku) lines.push(`🔖 SKU: ${product.sku}`);
      lines.push(`💰 Price: Rs. ${this.formatPrice(product.sale_price)}`);
      if (product.color) lines.push(`🎨 Color: ${product.color}`);
      if (product.fabric) lines.push(`🧵 Fabric: ${product.fabric}`);
      lines.push(``, `Is this available? Please share more details.`);

      const text = encodeURIComponent(lines.join('\n'));
      return `https://wa.me/${phone}?text=${text}`;
    },

    // General WhatsApp chat link (floating button)
    generalWhatsappLink() {
      const phone = (this.catalog.whatsapp_number || '').replace(/[^\d]/g, '');
      const text = encodeURIComponent(`Assalamualaikum! I have a question about your products.`);
      return `https://wa.me/${phone}?text=${text}`;
    },

    openProduct(product) {
      this.selectedProduct = product;
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      this.$nextTick(() => {
        document.addEventListener('keydown', this.escapeHandler);
      });
    },

    escapeHandler(e) {
      if (e.key === 'Escape') {
        this.selectedProduct = null;
        document.body.style.overflow = '';
        document.removeEventListener('keydown', this.escapeHandler);
      }
    },

    // Optional: track product clicks (future analytics hook)
    trackClick(product) {
      console.log('[catalog] Product clicked:', product.id, product.name);
      // Future: send to analytics endpoint
    },
  };
}

// Expose globally for Alpine
window.catalogApp = catalogApp;
window.colorToHex = colorToHex;

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(
      (reg) => console.log('[catalog] Service Worker registered'),
      (err) => console.warn('[catalog] Service Worker registration failed:', err)
    );
  });
}
