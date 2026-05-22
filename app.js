// app.js
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { ref, push, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";
import { auth, db } from "./firebase-init.js";

// DOM References
const $ = id => document.getElementById(id);
const loginBtn = $('loginBtn'), logoutBtn = $('logoutBtn');
const userInfo = $('userInfo'), userAvatar = $('userAvatar'), userName = $('userName');
const authOverlay = $('authOverlay');

const searchInput = $('searchInput'), searchClear = $('searchClear');
const formTitle = $('formTitle'), cancelEditBtn = $('cancelEdit');
const editIdInput = $('editId'), productNameInput = $('productName'), productPriceInput = $('productPrice');
const imageUploadArea = $('imageUploadArea'), imageInput = $('imageInput');
const uploadPlaceholder = $('uploadPlaceholder'), imagePreview = $('imagePreview'), removeImageBtn = $('removeImage');
const saveBtn = $('saveBtn'), saveBtnText = $('saveBtnText');
const productGrid = $('productGrid'), productCount = $('productCount');
const emptyState = $('emptyState'), noResults = $('noResults'), noResultsQuery = $('noResultsQuery');
const modalOverlay = $('modalOverlay'), modalConfirm = $('modalConfirm'), modalCancel = $('modalCancel');

// Settings DOM Elements
const settingsBtn = $('settingsBtn'), settingsModalOverlay = $('settingsModalOverlay'), settingsCloseBtn = $('settingsCloseBtn');
const toggleOthersEdit = $('toggleOthersEdit'), toggleOthersDelete = $('toggleOthersDelete');

// Custom Select UI Elements
const themeTrigger = $('themeTrigger'), themeDropdown = $('themeDropdown'), themeLabel = $('themeLabel');
const customOptions = document.querySelectorAll('.custom-option');

// State Variables
let currentUser = null;
let allProducts = [];
let currentImageBase64 = '';
let deleteId = null;
let unsubscribeProducts = null;
let unsubscribeSettings = null;

let userSettings = {
  theme: 'original',
  showOthersEdit: false,
  showOthersDelete: false
};

const IMG_MAX_W = 800; 
const IMG_QUALITY = 0.75; 

// ==========================================
// 1. AUTHENTICATION & SETTINGS
// ==========================================
const provider = new GoogleAuthProvider();

loginBtn.addEventListener('click', async () => {
  try {
    loginBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Wait...';
    loginBtn.disabled = true;
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login Error:", error);
    alert("Login failed: " + error.message);
    loginBtn.innerHTML = '<i class="ph-fill ph-google-logo"></i> Sign in';
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginBtn.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userAvatar.src = user.photoURL || '';
    userName.textContent = user.displayName ? user.displayName.split(' ')[0] : 'User';
    
    // 🚀 FIX BUG: ลบหน้าต่างกั้นฟอร์มออกให้มั่นใจ 100% ว่าใช้งานได้
    authOverlay.classList.add('hidden');

    const settingsRef = ref(db, `users/${user.uid}/settings`);
    unsubscribeSettings = onValue(settingsRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        userSettings = { ...userSettings, ...val };
      } else {
        userSettings = { theme: 'original', showOthersEdit: false, showOthersDelete: false };
      }
      applyUserSettings();
    });

    startDatabaseListener();
  } else {
    currentUser = null;
    loginBtn.innerHTML = '<i class="ph-fill ph-google-logo"></i> Sign in';
    loginBtn.classList.remove('hidden');
    loginBtn.disabled = false;
    userInfo.classList.add('hidden');
    authOverlay.classList.remove('hidden');
    
    userSettings = { theme: 'original', showOthersEdit: false, showOthersDelete: false };
    document.body.className = 'theme-original';
    settingsModalOverlay.classList.add('hidden');

    if (unsubscribeSettings) {
      unsubscribeSettings();
      unsubscribeSettings = null;
    }
    
    resetForm();
    stopDatabaseListener();
  }
});

// ==========================================
// CUSTOM UI: THEME DROPDOWN LOGIC
// ==========================================
themeTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  themeDropdown.classList.toggle('show');
});

// ซ่อนเมนูเมื่อคลิกที่อื่น
document.addEventListener('click', () => {
  themeDropdown.classList.remove('show');
});

customOptions.forEach(option => {
  option.addEventListener('click', () => {
    const val = option.getAttribute('data-value');
    
    // Update Setting
    userSettings.theme = val;
    document.body.className = `theme-${val}`;
    saveSettingsToFirebase();
  });
});

function applyUserSettings() {
  const themeVal = userSettings.theme || 'original';
  document.body.className = `theme-${themeVal}`;
  
  // อัปเดตหน้าตา Custom Select ให้ตรงกับค่าใน Firebase
  customOptions.forEach(opt => {
    if(opt.getAttribute('data-value') === themeVal) {
      opt.classList.add('active');
      themeLabel.textContent = opt.textContent;
    } else {
      opt.classList.remove('active');
    }
  });

  toggleOthersEdit.checked = !!userSettings.showOthersEdit;
  toggleOthersDelete.checked = !!userSettings.showOthersDelete;
  renderGrid();
}

function saveSettingsToFirebase() {
  if (currentUser) {
    set(ref(db, `users/${currentUser.uid}/settings`), userSettings);
  }
}

toggleOthersEdit.addEventListener('change', (e) => {
  userSettings.showOthersEdit = e.target.checked;
  saveSettingsToFirebase();
});

toggleOthersDelete.addEventListener('change', (e) => {
  userSettings.showOthersDelete = e.target.checked;
  saveSettingsToFirebase();
});

// Settings Modal Toggle
settingsBtn.addEventListener('click', () => settingsModalOverlay.classList.remove('hidden'));
settingsCloseBtn.addEventListener('click', () => settingsModalOverlay.classList.add('hidden'));
settingsModalOverlay.addEventListener('click', (e) => {
  if (e.target === settingsModalOverlay) settingsModalOverlay.classList.add('hidden');
});

// ==========================================
// 2. REALTIME DATABASE SYNC (PRODUCTS)
// ==========================================
function startDatabaseListener() {
  const productsRef = ref(db, 'products');
  unsubscribeProducts = onValue(productsRef, (snapshot) => {
    const data = snapshot.val();
    allProducts = [];
    if (data) {
      Object.keys(data).forEach(key => {
        allProducts.push({ id: key, ...data[key] });
      });
      allProducts.sort((a, b) => b.timestamp - a.timestamp);
    }
    renderGrid();
  });
}

function stopDatabaseListener() {
  if (unsubscribeProducts) {
    unsubscribeProducts();
    unsubscribeProducts = null;
  }
  allProducts = [];
  renderGrid();
}

// ==========================================
// 3. RENDER UI GRAPHICS
// ==========================================
function renderGrid(searchQuery = '') {
  productGrid.innerHTML = '';
  const query = searchQuery.toLowerCase().trim();
  
  const filtered = allProducts.filter(p => 
    p.name.toLowerCase().includes(query) || p.price.toString().includes(query)
  );

  productCount.textContent = `${allProducts.length} products`;
  
  if (allProducts.length === 0) {
    emptyState.classList.remove('hidden');
    noResults.classList.add('hidden');
    return;
  }
  
  if (filtered.length === 0 && query !== '') {
    emptyState.classList.add('hidden');
    noResults.classList.remove('hidden');
    noResultsQuery.textContent = searchQuery;
    return;
  }

  emptyState.classList.add('hidden');
  noResults.classList.add('hidden');

  filtered.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const isOwner = currentUser && currentUser.uid === product.uid;
    const canShowEdit = isOwner || userSettings.showOthersEdit;
    const canShowDelete = isOwner || userSettings.showOthersDelete;

    let actionButtons = '';
    if (canShowEdit || canShowDelete) {
      actionButtons = `<div class="card-actions">`;
      if (canShowEdit) {
        actionButtons += `<button class="btn-card btn-edit" onclick="editProduct('${product.id}')" title="Edit"><i class="ph ph-pencil-simple"></i></button>`;
      }
      if (canShowDelete) {
        actionButtons += `<button class="btn-card btn-delete" onclick="requestDelete('${product.id}')" title="Delete"><i class="ph ph-trash"></i></button>`;
      }
      actionButtons += `</div>`;
    }

    const imageHtml = product.image 
      ? `<img src="${product.image}" class="card-img" alt="${product.name}" loading="lazy" />`
      : `<div class="no-image"><i class="ph ph-image"></i></div>`;

    card.innerHTML = `
      <div class="card-img-wrap">
        ${imageHtml}
        ${actionButtons}
      </div>
      <div class="card-info">
        <div class="card-name">${product.name}</div>
        <div class="card-price">฿${parseFloat(product.price).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
        <div class="card-creator"><i class="ph ph-user-circle"></i> Added by: ${product.addedBy || 'Unknown'}</div>
      </div>
    `;
    productGrid.appendChild(card);
  });
}

// ==========================================
// 4. IMAGE HANDLING
// ==========================================
imageUploadArea.addEventListener('click', (e) => {
  if (e.target.closest('#removeImage') || !currentUser) return;
  imageInput.click();
});

imageInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = event => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > IMG_MAX_W) { h = Math.round((h * IMG_MAX_W) / w); w = IMG_MAX_W; }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      currentImageBase64 = canvas.toDataURL('image/jpeg', IMG_QUALITY);
      showPreview(currentImageBase64);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  currentImageBase64 = '';
  hidePreview();
  imageInput.value = '';
});

function showPreview(src) {
  imagePreview.src = src;
  imagePreview.classList.remove('hidden');
  uploadPlaceholder.classList.add('hidden');
  removeImageBtn.classList.remove('hidden');
}

function hidePreview() {
  imagePreview.src = '';
  imagePreview.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
  removeImageBtn.classList.add('hidden');
}

// ==========================================
// 5. CRUD OPERATIONS
// ==========================================
saveBtn.addEventListener('click', () => {
  if (!currentUser) return alert('Please sign in first.');

  const name = productNameInput.value.trim();
  const price = productPriceInput.value.trim();
  const id = editIdInput.value;

  if (!name || !price) return alert('Please fill in both name and price.');

  const productData = {
    name: name,
    price: parseFloat(price),
    image: currentImageBase64,
    addedBy: currentUser.displayName,
    uid: currentUser.uid
  };

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';

  if (id) {
    update(ref(db, `products/${id}`), productData)
      .then(() => resetForm())
      .catch((error) => { console.error(error); alert("Error saving: " + error.message); resetForm(); });
  } else {
    productData.timestamp = Date.now();
    const newDocRef = push(ref(db, 'products'));
    set(newDocRef, productData)
      .then(() => resetForm())
      .catch((error) => { console.error(error); alert("Error saving: " + error.message); resetForm(); });
  }
});

window.editProduct = (id) => {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  // แม้ว่าจะเปิดให้โชว์ปุ่มตาม Settings แต่ระบบจะเช็คหลังบ้านอีกรอบว่าตรงกับกฎหรือไม่
  
  editIdInput.value = id;
  productNameInput.value = product.name;
  productPriceInput.value = product.price;
  currentImageBase64 = product.image || '';

  if (currentImageBase64) showPreview(currentImageBase64);
  else hidePreview();

  formTitle.innerHTML = '<i class="ph ph-pencil-simple"></i> Edit Product';
  saveBtnText.textContent = 'Update Product';
  cancelEditBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

cancelEditBtn.addEventListener('click', resetForm);

function resetForm() {
  editIdInput.value = '';
  productNameInput.value = '';
  productPriceInput.value = '';
  currentImageBase64 = '';
  imageInput.value = '';
  hidePreview();
  formTitle.innerHTML = '<i class="ph ph-plus-circle"></i> Add New Product';
  saveBtnText.textContent = 'Save Product';
  cancelEditBtn.classList.add('hidden');
  saveBtn.disabled = false;
  saveBtn.innerHTML = '<i class="ph ph-check-circle"></i> <span id="saveBtnText">Save Product</span>';
}

window.requestDelete = (id) => {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  deleteId = id;
  modalOverlay.classList.remove('hidden');
};

modalCancel.addEventListener('click', () => {
  deleteId = null;
  modalOverlay.classList.add('hidden');
});

modalConfirm.addEventListener('click', () => {
  if (deleteId) {
    remove(ref(db, `products/${deleteId}`))
      .then(() => {
        deleteId = null;
        modalOverlay.classList.add('hidden');
      })
      .catch((error) => {
        alert("คุณไม่มีสิทธิ์ลบสินค้านี้ เนื่องจากคุณไม่ใช่เจ้าของครับ");
        modalOverlay.classList.add('hidden');
      });
  }
});

// ==========================================
// 6. SEARCH LOGIC
// ==========================================
searchInput.addEventListener('input', (e) => {
  const val = e.target.value;
  searchClear.classList.toggle('visible', val.length > 0);
  renderGrid(val);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  renderGrid('');
});
