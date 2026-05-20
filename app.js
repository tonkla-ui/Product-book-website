/**
 * ═══════════════════════════════════════════════════════════
 * VAULT — Product Manager  |  app.js
 *
 * Storage  : localStorage (browser-native, free, unlimited*)
 * Images   : stored as base64 data-URLs inside localStorage
 *            (* localStorage is ~5–10 MB per origin)
 *
 * Key features:
 *  - Add / Edit / Delete products
 *  - SAVE button must be pressed — nothing auto-saves
 *  - Instant search across name AND price
 *  - Data persists after page refresh
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ── STORAGE KEY ─────────────────────────────────────────── */
const STORAGE_KEY = 'vault_products';

/* ── IN-MEMORY STATE ──────────────────────────────────────── */
let products   = [];   // full product array (loaded from storage)
let deleteId   = null; // id pending deletion confirmation

/* ── DOM REFS ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const searchInput      = $('searchInput');
const searchClear      = $('searchClear');
const imageUploadArea  = $('imageUploadArea');
const imageInput       = $('imageInput');
const uploadPlaceholder= $('uploadPlaceholder');
const imagePreview     = $('imagePreview');
const removeImageBtn   = $('removeImage');
const productNameInput = $('productName');
const productPriceInput= $('productPrice');
const editIdInput      = $('editId');
const saveBtn          = $('saveBtn');
const saveBtnText      = $('saveBtnText');
const cancelEditBtn    = $('cancelEdit');
const formTitle        = $('formTitle');
const productGrid      = $('productGrid');
const emptyState       = $('emptyState');
const noResults        = $('noResults');
const noResultsQuery   = $('noResultsQuery');
const filterCount      = $('filterCount');
const productCount     = $('productCount');
const toast            = $('toast');
const toastMessage     = $('toastMessage');
const modalOverlay     = $('modalOverlay');
const modalConfirm     = $('modalConfirm');
const modalCancel      = $('modalCancel');

/* ─────────────────────────────────────────────────────────── *
 *  STORAGE HELPERS
 * ─────────────────────────────────────────────────────────── */

/** Load products from localStorage into `products` array */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    products = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Vault: failed to load storage', e);
    products = [];
  }
}

/** Save the current `products` array to localStorage */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (e) {
    // Storage quota likely exceeded (large images)
    showToast('Storage full! Try removing some products or using smaller images.', true);
    throw e; // re-throw so save flow knows it failed
  }
}

/* ─────────────────────────────────────────────────────────── *
 *  UNIQUE ID GENERATOR
 * ─────────────────────────────────────────────────────────── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ─────────────────────────────────────────────────────────── *
 *  SEARCH / FILTER
 * ─────────────────────────────────────────────────────────── */

/** Returns products matching the query against name AND price */
function filterProducts(query) {
  if (!query.trim()) return products;

  const q = query.trim().toLowerCase();
  return products.filter(p => {
    const nameMatch  = p.productName.toLowerCase().includes(q);
    // Convert price to string for partial matching (e.g. '5' matches '$50')
    const priceMatch = String(p.productPrice).includes(q);
    return nameMatch || priceMatch;
  });
}

/* ─────────────────────────────────────────────────────────── *
 *  RENDERING
 * ─────────────────────────────────────────────────────────── */

/** Format price nicely: "$1,234.56" */
function formatPrice(price) {
  const num = parseFloat(price);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format ISO date to readable: "May 20, 2026" */
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

/** Render filtered products into the grid */
function renderProducts() {
  const query   = searchInput.value;
  const visible = filterProducts(query);

  // Update counter in navbar
  productCount.textContent = products.length === 1 ? '1 product' : `${products.length} products`;

  // Show/hide empty state vs grid
  if (products.length === 0) {
    emptyState.style.display  = 'flex';
    noResults.style.display   = 'none';
    productGrid.style.display = 'none';
    filterCount.classList.remove('visible');
    return;
  }

  emptyState.style.display = 'none';

  // No results for this search
  if (visible.length === 0) {
    noResults.style.display   = 'flex';
    productGrid.style.display = 'none';
    noResultsQuery.textContent = query;
    filterCount.classList.remove('visible');
    return;
  }

  noResults.style.display   = 'none';
  productGrid.style.display = 'grid';

  // Show filter badge when searching
  if (query.trim()) {
    filterCount.textContent = `${visible.length} of ${products.length}`;
    filterCount.classList.add('visible');
  } else {
    filterCount.classList.remove('visible');
  }

  // Build card HTML — newest first
  const sorted = [...visible].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  productGrid.innerHTML = sorted.map(p => `
    <div class="product-card" data-id="${p.id}">
      <div class="card-image-wrap">
        ${p.productImage
          ? `<img class="card-image" src="${p.productImage}" alt="${escapeHtml(p.productName)}" loading="lazy" />`
          : `<div class="card-no-image"><i class="ph ph-image-broken"></i></div>`}
      </div>
      <div class="card-body">
        <div class="card-name" title="${escapeHtml(p.productName)}">${escapeHtml(p.productName)}</div>
        <div class="card-price">${formatPrice(p.productPrice)}</div>
        <div class="card-date">${formatDate(p.createdAt)}</div>
      </div>
      <div class="card-actions">
        <button class="card-btn card-btn-edit" onclick="startEdit('${p.id}')">
          <i class="ph ph-pencil-simple"></i> Edit
        </button>
        <button class="card-btn card-btn-delete" onclick="confirmDelete('${p.id}')">
          <i class="ph ph-trash"></i> Delete
        </button>
      </div>
    </div>
  `).join('');
}

/** Prevent XSS in rendered HTML */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────────────────── *
 *  IMAGE HANDLING
 * ─────────────────────────────────────────────────────────── */

/** Convert a File object to a base64 data-URL string */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Show chosen image in the upload area */
function showImagePreview(src) {
  uploadPlaceholder.style.display = 'none';
  imagePreview.src                = src;
  imagePreview.style.display      = 'block';
  removeImageBtn.style.display    = 'flex';
}

/** Reset the image upload area to its default empty state */
function clearImagePreview() {
  imageInput.value                = '';
  imagePreview.src                = '';
  imagePreview.style.display      = 'none';
  removeImageBtn.style.display    = 'none';
  uploadPlaceholder.style.display = 'flex';
}

/* ─────────────────────────────────────────────────────────── *
 *  FORM RESET
 * ─────────────────────────────────────────────────────────── */
function resetForm() {
  editIdInput.value        = '';
  productNameInput.value   = '';
  productPriceInput.value  = '';
  clearImagePreview();

  // Restore "add" mode UI
  formTitle.innerHTML      = '<i class="ph ph-plus-circle"></i> Add New Product';
  saveBtnText.textContent  = 'Save Product';
  cancelEditBtn.style.display = 'none';

  productNameInput.focus();
}

/* ─────────────────────────────────────────────────────────── *
 *  SAVE (ADD / UPDATE)
 * ─────────────────────────────────────────────────────────── */

/**
 * Called when the user clicks the SAVE button.
 * Nothing is stored until this runs.
 */
async function handleSave() {
  const name  = productNameInput.value.trim();
  const price = productPriceInput.value.trim();

  // ── Validation ───────────────────────────────────────────
  if (!name) {
    showToast('Please enter a product name.', true);
    productNameInput.focus();
    return;
  }
  if (price === '' || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    showToast('Please enter a valid price.', true);
    productPriceInput.focus();
    return;
  }

  // ── Collect image ─────────────────────────────────────────
  let imageData = imagePreview.src || ''; // may already be base64 (edit mode)

  if (imageInput.files && imageInput.files[0]) {
    const file = imageInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image is too large (max 5 MB).', true);
      return;
    }
    try {
      imageData = await fileToBase64(file);
    } catch {
      showToast('Could not read image file.', true);
      return;
    }
  }

  // ── Save button loading state ─────────────────────────────
  saveBtn.classList.add('saving');
  saveBtnText.textContent = 'Saving…';
  saveBtn.disabled = true;

  const editingId = editIdInput.value;

  try {
    if (editingId) {
      // ── UPDATE existing product ───────────────────────────
      const idx = products.findIndex(p => p.id === editingId);
      if (idx === -1) throw new Error('Product not found');

      products[idx] = {
        ...products[idx],          // keep id & createdAt
        productName:  name,
        productPrice: parseFloat(price),
        productImage: imageData,
      };

      saveToStorage();
      showToast('Product updated successfully!');
      resetForm();

    } else {
      // ── ADD new product ───────────────────────────────────
      const newProduct = {
        id:           generateId(),
        productName:  name,
        productPrice: parseFloat(price),
        productImage: imageData,
        createdAt:    new Date().toISOString(),
      };

      products.push(newProduct);
      saveToStorage();
      showToast('Product saved!');
      resetForm();
    }

    renderProducts();

  } catch (e) {
    // Storage error already toasted in saveToStorage()
    if (!e.message?.includes('Storage full')) {
      showToast('Something went wrong. Please try again.', true);
    }
  } finally {
    // Restore button after short delay
    setTimeout(() => {
      saveBtn.classList.remove('saving', 'success');
      saveBtnText.textContent = 'Save Product';
      saveBtn.disabled = false;
    }, 1000);
  }
}

/* ─────────────────────────────────────────────────────────── *
 *  EDIT
 * ─────────────────────────────────────────────────────────── */

/** Populate form with existing product data for editing */
function startEdit(id) {
  const p = products.find(p => p.id === id);
  if (!p) return;

  editIdInput.value       = p.id;
  productNameInput.value  = p.productName;
  productPriceInput.value = p.productPrice;

  if (p.productImage) {
    showImagePreview(p.productImage);
  } else {
    clearImagePreview();
  }

  formTitle.innerHTML     = '<i class="ph ph-pencil-simple"></i> Edit Product';
  saveBtnText.textContent = 'Update Product';
  cancelEditBtn.style.display = 'inline-flex';

  // Scroll form into view
  $('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  productNameInput.focus();
}

/* ─────────────────────────────────────────────────────────── *
 *  DELETE
 * ─────────────────────────────────────────────────────────── */

/** Show confirmation modal before deleting */
function confirmDelete(id) {
  deleteId = id;
  modalOverlay.classList.add('show');
}

/** Perform the actual deletion after confirmation */
function deleteProduct() {
  if (!deleteId) return;

  products = products.filter(p => p.id !== deleteId);
  saveToStorage();
  renderProducts();

  // If we were editing the deleted product, reset form
  if (editIdInput.value === deleteId) resetForm();

  deleteId = null;
  modalOverlay.classList.remove('show');
  showToast('Product deleted.');
}

/* ─────────────────────────────────────────────────────────── *
 *  TOAST NOTIFICATION
 * ─────────────────────────────────────────────────────────── */

let toastTimer = null;

function showToast(message, isError = false) {
  toastMessage.textContent = message;

  // Toggle error styling
  toast.classList.toggle('error', isError);
  const icon = toast.querySelector('.toast-icon');
  icon.className = `ph ${isError ? 'ph-warning-circle' : 'ph-check-circle'} toast-icon`;

  // Show
  toast.classList.add('show');

  // Auto-hide after 3 s
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ─────────────────────────────────────────────────────────── *
 *  EVENT LISTENERS
 * ─────────────────────────────────────────────────────────── */

// ── SAVE button ───────────────────────────────────────────────
saveBtn.addEventListener('click', handleSave);

// ── Allow Enter key in text fields to trigger save ────────────
[productNameInput, productPriceInput].forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSave();
  });
});

// ── Image upload: click anywhere in the upload area ───────────
imageUploadArea.addEventListener('click', e => {
  if (e.target === removeImageBtn || removeImageBtn.contains(e.target)) return;
  imageInput.click();
});

// ── Image selected from file picker ───────────────────────────
imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image too large (max 5 MB).', true);
    imageInput.value = '';
    return;
  }
  try {
    const base64 = await fileToBase64(file);
    showImagePreview(base64);
  } catch {
    showToast('Could not load image.', true);
  }
});

// ── Drag-and-drop image ───────────────────────────────────────
imageUploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  imageUploadArea.style.borderColor = 'var(--gold)';
});

imageUploadArea.addEventListener('dragleave', () => {
  imageUploadArea.style.borderColor = '';
});

imageUploadArea.addEventListener('drop', async e => {
  e.preventDefault();
  imageUploadArea.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image too large (max 5 MB).', true);
    return;
  }
  try {
    const base64 = await fileToBase64(file);
    showImagePreview(base64);
  } catch {
    showToast('Could not load image.', true);
  }
});

// ── Remove image button ───────────────────────────────────────
removeImageBtn.addEventListener('click', e => {
  e.stopPropagation();
  clearImagePreview();
});

// ── Cancel edit ───────────────────────────────────────────────
cancelEditBtn.addEventListener('click', resetForm);

// ── Search (instant filter) ───────────────────────────────────
searchInput.addEventListener('input', () => {
  // Show/hide clear button
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
  renderProducts();
});

// ── Clear search ──────────────────────────────────────────────
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  searchInput.focus();
  renderProducts();
});

// ── Delete modal controls ─────────────────────────────────────
modalConfirm.addEventListener('click', deleteProduct);

modalCancel.addEventListener('click', () => {
  deleteId = null;
  modalOverlay.classList.remove('show');
});

// Close modal on overlay click
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) {
    deleteId = null;
    modalOverlay.classList.remove('show');
  }
});

// Close modal with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('show')) {
    deleteId = null;
    modalOverlay.classList.remove('show');
  }
});

/* ─────────────────────────────────────────────────────────── *
 *  DEMO DATA (pre-loaded on first visit only)
 * ─────────────────────────────────────────────────────────── */

/**
 * Adds example products so you can see how the app looks right away.
 * These are loaded ONLY if localStorage is empty.
 * Delete them from the UI just like any other product.
 */
function seedDemoProducts() {
  const demo = [
    {
      id:           'demo-1',
      productName:  'Wireless Headphones',
      productPrice: 89.99,
      productImage: '', // no image — shows placeholder
      createdAt:    new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id:           'demo-2',
      productName:  'Mechanical Keyboard',
      productPrice: 149.00,
      productImage: '',
      createdAt:    new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id:           'demo-3',
      productName:  'USB-C Hub',
      productPrice: 45.50,
      productImage: '',
      createdAt:    new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  products = demo;
  saveToStorage();
}

/* ─────────────────────────────────────────────────────────── *
 *  INIT
 * ─────────────────────────────────────────────────────────── */

(function init() {
  loadFromStorage();

  // Seed demo products only on very first visit
  if (products.length === 0) {
    seedDemoProducts();
  }

  renderProducts();
})();
