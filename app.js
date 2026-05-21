/**
 * ═══════════════════════════════════════════════════════════
 * VAULT — Product Manager  |  app.js
 *
 * Storage  : Supabase (PostgreSQL) — ซิงค์ทุกอุปกรณ์
 * Images   : เก็บเป็น base64 ใน Supabase database
 *
 * ก่อนใช้งาน — สร้างตารางใน Supabase SQL Editor:
 *
 *   CREATE TABLE products (
 *     id           TEXT PRIMARY KEY,
 *     product_name TEXT NOT NULL,
 *     product_price FLOAT8 NOT NULL,
 *     product_image TEXT DEFAULT '',
 *     created_at   TIMESTAMPTZ DEFAULT now()
 *   );
 *
 *   ALTER TABLE products ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "public_all" ON products FOR ALL USING (true) WITH CHECK (true);
 *
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────────────────── *
 *  SUPABASE CONFIG
 *  ⚠️  เปลี่ยน SUPABASE_URL ให้เป็น URL จริงจาก Dashboard
 *      (Settings → API → Project URL)
 * ─────────────────────────────────────────────────────────── */
const SUPABASE_URL  = 'https://ufnoghkefhxeviivvugt.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_8DKiAQ0luVkZUQO4-KpZhA_4NgTB2sX';
const TABLE         = 'products';

/* สร้าง Supabase client (SDK โหลดผ่าน CDN ใน index.html) */
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── IN-MEMORY STATE ──────────────────────────────────────── */
let products = [];   // ข้อมูลสินค้าทั้งหมด (โหลดจาก Supabase)
let deleteId = null; // id ที่รอการยืนยันการลบ

/* ── DOM REFS ─────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────── *
 *  SUPABASE HELPERS
 *  แทนที่ localStorage ด้วย Supabase API calls
 * ─────────────────────────────────────────────────────────── */

/**
 * โหลดสินค้าทั้งหมดจาก Supabase
 * เรียงจากใหม่สุดไปเก่าสุด
 */
async function loadFromStorage() {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // แปลง column_name จาก Supabase (snake_case) → app format
    products = (data || []).map(row => ({
      id:           row.id,
      productName:  row.product_name,
      productPrice: row.product_price,
      productImage: row.product_image || '',
      createdAt:    row.created_at,
    }));

  } catch (e) {
    console.error('Vault: โหลดข้อมูลล้มเหลว', e);
    showToast('เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบ URL และ Key', true);
    products = [];
  }
}

/**
 * เพิ่มสินค้าใหม่ลงใน Supabase
 * @param {Object} product — object ที่มี id, productName, productPrice, productImage, createdAt
 */
async function insertProduct(product) {
  const { error } = await db.from(TABLE).insert({
    id:            product.id,
    product_name:  product.productName,
    product_price: product.productPrice,
    product_image: product.productImage || '',
    created_at:    product.createdAt,
  });
  if (error) throw error;
}

/**
 * อัปเดตสินค้าที่มีอยู่ใน Supabase
 * @param {Object} product — object ที่มีข้อมูลครบ รวม id
 */
async function updateProduct(product) {
  const { error } = await db
    .from(TABLE)
    .update({
      product_name:  product.productName,
      product_price: product.productPrice,
      product_image: product.productImage || '',
    })
    .eq('id', product.id);
  if (error) throw error;
}

/**
 * ลบสินค้าออกจาก Supabase ตาม id
 * @param {string} id
 */
async function removeProduct(id) {
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) throw error;
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

/** คืนค่าสินค้าที่ตรงกับ query ทั้งชื่อ AND ราคา */
function filterProducts(query) {
  if (!query.trim()) return products;
  const q = query.trim().toLowerCase();
  return products.filter(p => {
    const nameMatch  = p.productName.toLowerCase().includes(q);
    const priceMatch = String(p.productPrice).includes(q);
    return nameMatch || priceMatch;
  });
}

/* ─────────────────────────────────────────────────────────── *
 *  RENDERING
 * ─────────────────────────────────────────────────────────── */

function formatPrice(price) {
  const num = parseFloat(price);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
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
    noResults.style.display   = 'flex';
    productGrid.style.display = 'none';
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

  productGrid.innerHTML = visible.map(p => `
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

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

/* ─────────────────────────────────────────────────────────── *
 *  FORM RESET
 * ─────────────────────────────────────────────────────────── */
function resetForm() {
  editIdInput.value       = '';
  productNameInput.value  = '';
  productPriceInput.value = '';
  clearImagePreview();
  formTitle.innerHTML         = '<i class="ph ph-plus-circle"></i> Add New Product';
  saveBtnText.textContent     = 'Save Product';
  cancelEditBtn.style.display = 'none';
  productNameInput.focus();
}

/* ─────────────────────────────────────────────────────────── *
 *  SAVE (ADD / UPDATE) — บันทึกเมื่อกด Save เท่านั้น
 * ─────────────────────────────────────────────────────────── */
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

  // รวบรวมข้อมูลรูปภาพ
  let imageData = imagePreview.src || '';
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

  // แสดงสถานะ "กำลังบันทึก..."
  saveBtn.classList.add('saving');
  saveBtnText.textContent = 'Saving…';
  saveBtn.disabled = true;

  const editingId = editIdInput.value;

  try {
    if (editingId) {
      /* ── UPDATE ── */
      const updatedProduct = {
        id:           editingId,
        productName:  name,
        productPrice: parseFloat(price),
        productImage: imageData,
      };

      await updateProduct(updatedProduct);

      // อัปเดตใน local array ด้วย
      const idx = products.findIndex(p => p.id === editingId);
      if (idx !== -1) products[idx] = { ...products[idx], ...updatedProduct };

      showToast('Product updated successfully!');

    } else {
      /* ── INSERT ── */
      const newProduct = {
        id:           generateId(),
        productName:  name,
        productPrice: parseFloat(price),
        productImage: imageData,
        createdAt:    new Date().toISOString(),
      };

      await insertProduct(newProduct);
      products.unshift(newProduct); // เพิ่มที่หัวลิสต์

      showToast('Product saved!');
    }

    renderProducts();
    resetForm();

  } catch (e) {
    console.error('Save error:', e);
    showToast('บันทึกล้มเหลว — ตรวจสอบการเชื่อมต่อ', true);
  } finally {
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

  formTitle.innerHTML         = '<i class="ph ph-pencil-simple"></i> Edit Product';
  saveBtnText.textContent     = 'Update Product';
  cancelEditBtn.style.display = 'inline-flex';

  $('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  productNameInput.focus();
}

/* ─────────────────────────────────────────────────────────── *
 *  DELETE
 * ─────────────────────────────────────────────────────────── */
function confirmDelete(id) {
  deleteId = id;
  modalOverlay.classList.add('show');
}

async function deleteProduct() {
  if (!deleteId) return;

  try {
    await removeProduct(deleteId);
    products = products.filter(p => p.id !== deleteId);
    renderProducts();
    if (editIdInput.value === deleteId) resetForm();
    showToast('Product deleted.');
  } catch (e) {
    console.error('Delete error:', e);
    showToast('ลบไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ', true);
  } finally {
    deleteId = null;
    modalOverlay.classList.remove('show');
  }
}

/* ─────────────────────────────────────────────────────────── *
 *  TOAST NOTIFICATION
 * ─────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────── *
 *  EVENT LISTENERS
 * ─────────────────────────────────────────────────────────── */
saveBtn.addEventListener('click', handleSave);

[productNameInput, productPriceInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') handleSave(); });
});

imageUploadArea.addEventListener('click', e => {
  if (e.target === removeImageBtn || removeImageBtn.contains(e.target)) return;
  imageInput.click();
});

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
  } catch { showToast('Could not load image.', true); }
});

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
    const base64 = await fileToBase64(file);
    showImagePreview(base64);
  } catch { showToast('Could not load image.', true); }
});

removeImageBtn.addEventListener('click', e => { e.stopPropagation(); clearImagePreview(); });
cancelEditBtn.addEventListener('click', resetForm);

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

/* ─────────────────────────────────────────────────────────── *
 *  INIT — โหลดข้อมูลจาก Supabase ตอนเปิดหน้าเว็บ
 * ─────────────────────────────────────────────────────────── */
(async function init() {
  // แสดง loading state ในปุ่ม Save ชั่วคราว
  productCount.textContent = 'Loading…';

  await loadFromStorage(); // ดึงข้อมูลจาก Supabase

  renderProducts();
})();
