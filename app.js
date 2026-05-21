/**
 * ═══════════════════════════════════════════════════════════
 * VAULT — Product Manager  |  app.js  (v2.0)
 *
 * Metadata  : localStorage  →  key 'vault_products'
 *             เก็บข้อมูล id, ชื่อ, ราคา, วันที่, hasImage
 *             (ไม่มี base64 อยู่ใน localStorage เลย → ไม่เต็ม)
 *
 * Images    : IndexedDB  →  db 'VaultDB', store 'images'
 *             เก็บ binary/base64 แยก ลองรับขนาดใหญ่ได้เป็น GB
 *             + บีบอัดด้วย Canvas ก่อนเก็บ (ลด size 70–90%)
 *
 * imageCache: Map<id, base64>  ← โหลดครั้งเดียวตอน init
 *             ใช้ render การ์ดและ Export โดยไม่ต้องยิง IDB ซ้ำ
 *
 * Export / Import (.vault file) ยังทำงานได้ปกติ
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────────────────── *
 *  CONSTANTS
 * ─────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'vault_products';
const IDB_NAME    = 'VaultDB';
const IDB_VERSION = 1;
const IDB_STORE   = 'images';
const IMG_MAX_W   = 800;   // px — ย่อรูปไม่ให้กว้างกว่านี้
const IMG_QUALITY = 0.75;  // JPEG quality (0–1)

/* ─────────────────────────────────────────────────────────── *
 *  IN-MEMORY STATE
 * ─────────────────────────────────────────────────────────── */
let products           = [];    // metadata array (ไม่มีรูป)
let deleteId           = null;  // id รอยืนยันลบ
let idb                = null;  // IndexedDB instance
const imageCache       = new Map(); // id → base64 (โหลดตอน init)
let currentImageBase64 = '';    // base64 ของรูปในฟอร์มตอนนี้
let imageChanged       = false; // true เมื่อผู้ใช้เปลี่ยน/ลบรูปในฟอร์ม

/* ─────────────────────────────────────────────────────────── *
 *  DOM REFS
 * ─────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const searchInput       = $('searchInput');
const searchClear       = $('searchClear');
const imageUploadArea   = $('imageUploadArea');
const imageInput        = $('imageInput');
const uploadPlaceholder = $('uploadPlaceholder');
const imagePreview      = $('imagePreview');
const removeImageBtn    = $('removeImage');
const productNameInput  = $('productName');
const productPriceInput = $('productPrice');
const editIdInput       = $('editId');
const saveBtn           = $('saveBtn');
const saveBtnText       = $('saveBtnText');
const cancelEditBtn     = $('cancelEdit');
const formTitle         = $('formTitle');
const productGrid       = $('productGrid');
const emptyState        = $('emptyState');
const noResults         = $('noResults');
const noResultsQuery    = $('noResultsQuery');
const filterCount       = $('filterCount');
const productCount      = $('productCount');
const toast             = $('toast');
const toastMessage      = $('toastMessage');
const modalOverlay      = $('modalOverlay');
const modalConfirm      = $('modalConfirm');
const modalCancel       = $('modalCancel');

/* ═══════════════════════════════════════════════════════════
 *  INDEXEDDB — เปิด / อ่าน / เขียน / ลบ
 * ═══════════════════════════════════════════════════════════ */

/** เปิด (หรือสร้าง) VaultDB */
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = e => {
      // สร้าง object store 'images' ถ้ายังไม่มี
      if (!e.target.result.objectStoreNames.contains(IDB_STORE)) {
        e.target.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

/** โหลดรูปทั้งหมดจาก IDB เข้า imageCache ครั้งเดียว */
function loadAllImagesFromIDB() {
  return new Promise((resolve, reject) => {
    if (!idb) { resolve(); return; }
    imageCache.clear();
    const tx     = idb.transaction(IDB_STORE, 'readonly');
    const store  = tx.objectStore(IDB_STORE);
    const cursor = store.openCursor();

    cursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { imageCache.set(c.key, c.value); c.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** เขียนรูป 1 รายการลง IDB */
function idbPut(id, base64) {
  return new Promise((resolve, reject) => {
    if (!idb) { resolve(); return; }
    const tx  = idb.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(base64, id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** ลบรูป 1 รายการจาก IDB */
function idbDelete(id) {
  return new Promise((resolve, reject) => {
    if (!idb) { resolve(); return; }
    const tx  = idb.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** ล้างรูปทั้งหมดใน IDB (ใช้ตอน Replace All) */
function idbClearAll() {
  return new Promise((resolve, reject) => {
    if (!idb) { resolve(); return; }
    const tx  = idb.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/* ═══════════════════════════════════════════════════════════
 *  LOCAL STORAGE — metadata เท่านั้น (ไม่มีรูป)
 * ═══════════════════════════════════════════════════════════ */

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { products = []; return; }
    const parsed = JSON.parse(raw);
    products = Array.isArray(parsed) ? parsed : [];
    products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error('Vault: โหลด metadata ล้มเหลว', e);
    products = [];
  }
}

function saveAllToStorage() {
  // บันทึกเฉพาะ metadata — ไม่มี productImage ใน localStorage เลย
  localStorage.setItem(STORAGE_KEY, JSON.stringify(
    products.map(p => ({
      id:           p.id,
      productName:  p.productName,
      productPrice: p.productPrice,
      createdAt:    p.createdAt,
      hasImage:     p.hasImage,
    }))
  ));
}

/* ═══════════════════════════════════════════════════════════
 *  IMAGE COMPRESSION — Canvas API
 *  ลดขนาดรูปก่อนเก็บ: รูป 3 MB → ~150–300 KB
 * ═══════════════════════════════════════════════════════════ */

/**
 * บีบอัดรูปภาพด้วย Canvas แล้วคืน base64 JPEG
 * @param {File} file
 * @param {number} maxWidth — ความกว้างสูงสุด (px)
 * @param {number} quality  — JPEG quality 0–1
 * @returns {Promise<string>} base64 string
 */
function compressImage(file, maxWidth = IMG_MAX_W, quality = IMG_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      // คำนวณขนาดใหม่ (ย่อลงเฉพาะเมื่อกว้างเกิน maxWidth)
      const scale  = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      // เติม background ขาวก่อน เพื่อรองรับ PNG ที่มี transparency
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };

    img.src = url;
  });
}

/* ═══════════════════════════════════════════════════════════
 *  UNIQUE ID GENERATOR
 * ═══════════════════════════════════════════════════════════ */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ═══════════════════════════════════════════════════════════
 *  SEARCH / FILTER
 * ═══════════════════════════════════════════════════════════ */
function filterProducts(query) {
  if (!query.trim()) return products;
  const q = query.trim().toLowerCase();
  return products.filter(p =>
    p.productName.toLowerCase().includes(q) ||
    String(p.productPrice).includes(q)
  );
}

/* ═══════════════════════════════════════════════════════════
 *  RENDERING
 * ═══════════════════════════════════════════════════════════ */

function formatPrice(price) {
  const num = parseFloat(price);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return ''; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderProducts() {
  const query   = searchInput.value;
  const visible = filterProducts(query);

  productCount.textContent = products.length === 1
    ? '1 product'
    : `${products.length} products`;

  if (products.length === 0) {
    emptyState.style.display  = 'flex';
    noResults.style.display   = 'none';
    productGrid.style.display = 'none';
    filterCount.classList.remove('visible');
    return;
  }

  emptyState.style.display = 'none';

  if (visible.length === 0) {
    noResults.style.display    = 'flex';
    productGrid.style.display  = 'none';
    noResultsQuery.textContent = query;
    filterCount.classList.remove('visible');
    return;
  }

  noResults.style.display   = 'none';
  productGrid.style.display = 'grid';

  if (query.trim()) {
    filterCount.textContent = `${visible.length} of ${products.length}`;
    filterCount.classList.add('visible');
  } else {
    filterCount.classList.remove('visible');
  }

  // รูปภาพดึงจาก imageCache (โหลดไว้แล้วใน init)
  productGrid.innerHTML = visible.map(p => {
    const imgSrc = imageCache.get(p.id) || '';
    return `
      <div class="product-card" data-id="${p.id}">
        <div class="card-image-wrap">
          ${imgSrc
            ? `<img class="card-image" src="${imgSrc}" alt="${escapeHtml(p.productName)}" loading="lazy" />`
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
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
 *  IMAGE PREVIEW (form UI)
 * ═══════════════════════════════════════════════════════════ */

function showImagePreview(src) {
  uploadPlaceholder.style.display = 'none';
  imagePreview.src                = src;
  imagePreview.style.display      = 'block';
  removeImageBtn.style.display    = 'flex';
}

function clearImagePreview() {
  imageInput.value                = '';
  imagePreview.src                = '';
  imagePreview.style.display      = 'none';
  removeImageBtn.style.display    = 'none';
  uploadPlaceholder.style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════════
 *  FORM RESET
 * ═══════════════════════════════════════════════════════════ */
function resetForm() {
  editIdInput.value           = '';
  productNameInput.value      = '';
  productPriceInput.value     = '';
  currentImageBase64          = '';
  imageChanged                = false;
  clearImagePreview();
  formTitle.innerHTML         = '<i class="ph ph-plus-circle"></i> Add New Product';
  saveBtnText.textContent     = 'Save Product';
  cancelEditBtn.style.display = 'none';
  productNameInput.focus();
}

/* ═══════════════════════════════════════════════════════════
 *  SAVE (ADD / UPDATE)
 * ═══════════════════════════════════════════════════════════ */
async function handleSave() {
  const name  = productNameInput.value.trim();
  const price = productPriceInput.value.trim();

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

  // ── บีบอัดรูปถ้าผู้ใช้เลือกไฟล์ใหม่ ──────────────────
  if (imageInput.files && imageInput.files[0]) {
    const file = imageInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image is too large (max 5 MB).', true);
      return;
    }
    saveBtn.classList.add('saving');
    saveBtnText.textContent = 'Compressing…';
    saveBtn.disabled = true;
    try {
      currentImageBase64 = await compressImage(file);
      imageChanged = true;
    } catch {
      showToast('Could not process image file.', true);
      saveBtn.classList.remove('saving');
      saveBtnText.textContent = 'Save Product';
      saveBtn.disabled = false;
      return;
    }
  }

  // ── แสดงสถานะ Saving ───────────────────────────────────
  saveBtn.classList.add('saving');
  saveBtnText.textContent = 'Saving…';
  saveBtn.disabled = true;

  const editingId = editIdInput.value;

  try {
    if (editingId) {
      /* ── UPDATE ── */
      // อัปเดต IDB เฉพาะเมื่อรูปเปลี่ยน
      if (imageChanged) {
        if (currentImageBase64) {
          await idbPut(editingId, currentImageBase64);
          imageCache.set(editingId, currentImageBase64);
        } else {
          await idbDelete(editingId);
          imageCache.delete(editingId);
        }
      }

      // อัปเดต metadata
      const idx = products.findIndex(p => p.id === editingId);
      if (idx !== -1) {
        products[idx] = {
          ...products[idx],
          productName:  name,
          productPrice: parseFloat(price),
          hasImage:     !!currentImageBase64,
        };
      }
      saveAllToStorage();
      showToast('Product updated successfully!');

    } else {
      /* ── INSERT ── */
      const newId = generateId();

      if (currentImageBase64) {
        await idbPut(newId, currentImageBase64);
        imageCache.set(newId, currentImageBase64);
      }

      const newProduct = {
        id:           newId,
        productName:  name,
        productPrice: parseFloat(price),
        createdAt:    new Date().toISOString(),
        hasImage:     !!currentImageBase64,
      };

      products.unshift(newProduct);
      saveAllToStorage();
      showToast('Product saved!');
    }

    renderProducts();
    resetForm();

  } catch (e) {
    console.error('Save error:', e);
    showToast(e.message || 'บันทึกล้มเหลว กรุณาลองใหม่', true);
  } finally {
    setTimeout(() => {
      saveBtn.classList.remove('saving', 'success');
      saveBtnText.textContent = 'Save Product';
      saveBtn.disabled = false;
    }, 600);
  }
}

/* ═══════════════════════════════════════════════════════════
 *  EDIT
 * ═══════════════════════════════════════════════════════════ */
function startEdit(id) {
  const p = products.find(p => p.id === id);
  if (!p) return;

  editIdInput.value       = p.id;
  productNameInput.value  = p.productName;
  productPriceInput.value = p.productPrice;

  // โหลดรูปจาก cache
  currentImageBase64 = imageCache.get(p.id) || '';
  imageChanged       = false;

  if (currentImageBase64) {
    showImagePreview(currentImageBase64);
  } else {
    clearImagePreview();
  }

  formTitle.innerHTML         = '<i class="ph ph-pencil-simple"></i> Edit Product';
  saveBtnText.textContent     = 'Update Product';
  cancelEditBtn.style.display = 'inline-flex';

  $('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  productNameInput.focus();
}

/* ═══════════════════════════════════════════════════════════
 *  DELETE
 * ═══════════════════════════════════════════════════════════ */
function confirmDelete(id) {
  deleteId = id;
  modalOverlay.classList.add('show');
}

async function deleteProduct() {
  if (!deleteId) return;

  try {
    // ลบรูปจาก IDB และ cache
    await idbDelete(deleteId);
    imageCache.delete(deleteId);

    // ลบ metadata
    products = products.filter(p => p.id !== deleteId);
    saveAllToStorage();

    if (editIdInput.value === deleteId) resetForm();
    renderProducts();
    showToast('Product deleted.');

  } catch (e) {
    console.error('Delete error:', e);
    showToast('ลบไม่สำเร็จ กรุณาลองใหม่', true);
  } finally {
    deleteId = null;
    modalOverlay.classList.remove('show');
  }
}

/* ═══════════════════════════════════════════════════════════
 *  TOAST
 * ═══════════════════════════════════════════════════════════ */
let toastTimer = null;

function showToast(message, isError = false) {
  toastMessage.textContent = message;
  toast.classList.toggle('error', isError);
  const icon = toast.querySelector('.toast-icon');
  icon.className = `ph ${isError ? 'ph-warning-circle' : 'ph-check-circle'} toast-icon`;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ═══════════════════════════════════════════════════════════
 *  EVENT LISTENERS
 * ═══════════════════════════════════════════════════════════ */
saveBtn.addEventListener('click', handleSave);

[productNameInput, productPriceInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') handleSave(); });
});

imageUploadArea.addEventListener('click', e => {
  if (e.target === removeImageBtn || removeImageBtn.contains(e.target)) return;
  imageInput.click();
});

// ── อัปโหลดรูปใหม่ (บีบอัดทันที แล้วแสดง preview) ───────
imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image too large (max 5 MB).', true);
    imageInput.value = '';
    return;
  }
  try {
    const compressed = await compressImage(file);
    currentImageBase64 = compressed;
    imageChanged       = true;
    showImagePreview(compressed);
  } catch {
    showToast('Could not load image.', true);
  }
});

// ── Drag & Drop ───────────────────────────────────────────
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
  if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5 MB).', true); return; }
  try {
    const compressed = await compressImage(file);
    currentImageBase64 = compressed;
    imageChanged       = true;
    showImagePreview(compressed);
  } catch {
    showToast('Could not load image.', true);
  }
});

// ── ลบรูปออกจากฟอร์ม ─────────────────────────────────────
removeImageBtn.addEventListener('click', e => {
  e.stopPropagation();
  clearImagePreview();
  currentImageBase64 = '';
  imageChanged       = true;
});

cancelEditBtn.addEventListener('click', resetForm);

// ── Search ────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
  renderProducts();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  searchInput.focus();
  renderProducts();
});

// ── Delete modal ──────────────────────────────────────────
modalConfirm.addEventListener('click', deleteProduct);
modalCancel.addEventListener('click', () => {
  deleteId = null;
  modalOverlay.classList.remove('show');
});
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) { deleteId = null; modalOverlay.classList.remove('show'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('show')) {
    deleteId = null;
    modalOverlay.classList.remove('show');
  }
});

/* ═══════════════════════════════════════════════════════════
 *  EXPORT — ดาวน์โหลดเป็น .vault file
 *
 *  รูปภาพดึงจาก imageCache แล้วรวมเข้าไฟล์
 *  ผู้รับไฟล์สามารถ Import กลับมาได้ทุกอุปกรณ์
 * ═══════════════════════════════════════════════════════════ */
const exportBtn = $('exportBtn');
exportBtn.addEventListener('click', exportProducts);

function exportProducts() {
  if (products.length === 0) {
    showToast('ไม่มีสินค้าที่จะดาวน์โหลด', true);
    return;
  }

  exportBtn.classList.add('busy');

  try {
    const payload = {
      vault_export: true,
      version:      '1.0',
      exportedAt:   new Date().toISOString(),
      productCount: products.length,
      // รวมรูปภาพจาก imageCache เข้าไปในไฟล์
      products: products.map(p => ({
        id:           p.id,
        productName:  p.productName,
        productPrice: p.productPrice,
        productImage: imageCache.get(p.id) || '',
        createdAt:    p.createdAt,
      })),
    };

    const json     = JSON.stringify(payload, null, 2);
    const dateStr  = new Date().toISOString().slice(0, 10);
    const filename = `vault-backup-${dateStr}.vault`;
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`ดาวน์โหลดสำเร็จ — ${products.length} สินค้า → ${filename}`);

  } catch (e) {
    console.error('Export error:', e);
    showToast('ดาวน์โหลดล้มเหลว กรุณาลองใหม่', true);
  } finally {
    setTimeout(() => exportBtn.classList.remove('busy'), 800);
  }
}

/* ═══════════════════════════════════════════════════════════
 *  IMPORT — อ่านไฟล์ .vault แล้วบันทึกลง localStorage + IDB
 * ═══════════════════════════════════════════════════════════ */
const importBtn          = $('importBtn');
const importFileInput    = $('importFileInput');
const importModalOverlay = $('importModalOverlay');
const importModalConfirm = $('importModalConfirm');
const importModalCancel  = $('importModalCancel');
const importFilePreview  = $('importFilePreview');
const modeMerge          = $('modeMerge');

let pendingImportProducts = [];

importBtn.addEventListener('click', () => {
  importFileInput.value = '';
  importFileInput.click();
});

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (!file) return;
  readImportFile(file);
});

function readImportFile(file) {
  importBtn.classList.add('busy');
  const reader = new FileReader();

  reader.onload = e => {
    importBtn.classList.remove('busy');
    try {
      const parsed = JSON.parse(e.target.result);

      if (!parsed.vault_export || !Array.isArray(parsed.products)) {
        showToast('ไฟล์ไม่ถูกต้อง — ใช้เฉพาะไฟล์ .vault ที่ดาวน์โหลดจาก Vault เท่านั้น', true);
        return;
      }
      if (parsed.products.length === 0) {
        showToast('ไฟล์นี้ไม่มีสินค้า', true);
        return;
      }

      pendingImportProducts = parsed.products;

      const exportDate = parsed.exportedAt
        ? new Date(parsed.exportedAt).toLocaleString('th-TH', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })
        : 'ไม่ทราบวันที่';

      importFilePreview.innerHTML = `
        <i class="ph ph-file-archive"></i>
        <div class="import-file-meta">
          <span class="import-file-name">${escapeHtml(file.name)}</span>
          <span class="import-file-info">
            ${parsed.productCount ?? parsed.products.length} สินค้า
            &nbsp;·&nbsp; Export เมื่อ ${exportDate}
          </span>
        </div>
      `;

      modeMerge.checked = true;
      importModalOverlay.classList.add('show');

    } catch (err) {
      console.error('Import parse error:', err);
      showToast('อ่านไฟล์ไม่ได้ — ตรวจสอบว่าไฟล์ไม่เสียหาย', true);
    }
  };

  reader.onerror = () => {
    importBtn.classList.remove('busy');
    showToast('อ่านไฟล์ไม่ได้', true);
  };

  reader.readAsText(file, 'UTF-8');
}

function closeImportModal() {
  importModalOverlay.classList.remove('show');
  pendingImportProducts = [];
}

importModalCancel.addEventListener('click', closeImportModal);
importModalOverlay.addEventListener('click', e => {
  if (e.target === importModalOverlay) closeImportModal();
});

importModalConfirm.addEventListener('click', async () => {
  if (pendingImportProducts.length === 0) return;

  const mode = document.querySelector('input[name="importMode"]:checked').value;

  importModalConfirm.disabled = true;
  importModalConfirm.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> กำลังนำเข้า…';

  try {
    if (mode === 'replace') {
      // ── Replace: ล้าง IDB + cache + products ────────────
      await idbClearAll();
      imageCache.clear();
      products = [];
    }

    let imported = 0;
    let skipped  = 0;

    for (const p of pendingImportProducts) {
      if (!p.id || !p.productName || p.productPrice == null) { skipped++; continue; }

      // Merge: ข้าม id ซ้ำ
      if (mode === 'merge' && products.some(ex => ex.id === p.id)) {
        skipped++;
        continue;
      }

      // บันทึกรูปลง IDB ถ้ามี
      const hasImage = !!(p.productImage);
      if (hasImage) {
        await idbPut(p.id, p.productImage);
        imageCache.set(p.id, p.productImage);
      }

      products.push({
        id:           p.id,
        productName:  String(p.productName),
        productPrice: parseFloat(p.productPrice) || 0,
        createdAt:    p.createdAt || new Date().toISOString(),
        hasImage,
      });
      imported++;
    }

    // เรียง + บันทึก metadata
    products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    saveAllToStorage();

    renderProducts();
    closeImportModal();

    const modeLabel = mode === 'replace' ? 'แทนที่ข้อมูลเดิม' : 'รวมกับข้อมูลเดิม';
    const skipNote  = skipped > 0 ? ` (ข้าม ${skipped})` : '';
    showToast(`นำเข้าสำเร็จ ${imported} สินค้า${skipNote} · ${modeLabel}`);

  } catch (err) {
    console.error('Import error:', err);
    showToast(err.message || 'นำเข้าล้มเหลว กรุณาลองใหม่', true);
  } finally {
    importModalConfirm.disabled = false;
    importModalConfirm.innerHTML = '<i class="ph ph-check"></i> นำเข้าข้อมูล';
  }
});

/* ═══════════════════════════════════════════════════════════
 *  INIT — เปิด IDB → โหลด metadata → โหลดรูป → render
 * ═══════════════════════════════════════════════════════════ */
(async function init() {
  // 1. เปิด IndexedDB
  try {
    idb = await openIDB();
  } catch (e) {
    console.error('Vault: IndexedDB ไม่พร้อมใช้งาน', e);
    showToast('⚠️ ไม่สามารถเปิด IndexedDB ได้ — รูปภาพจะไม่ถูกบันทึก', true);
  }

  // 2. โหลด metadata จาก localStorage
  loadFromStorage();

  // 3. โหลดรูปทั้งหมดจาก IDB เข้า imageCache ครั้งเดียว
  if (idb) {
    try {
      await loadAllImagesFromIDB();
    } catch (e) {
      console.error('Vault: โหลดรูปภาพจาก IDB ล้มเหลว', e);
    }
  }

  // 4. Render
  renderProducts();
})();
