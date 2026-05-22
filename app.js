// app.js
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { ref, push, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";
import { auth, db } from "./firebase-init.js";

// DOM References
const $ = id => document.getElementById(id);
const loginBtn = $('loginBtn'), logoutBtn = $('logoutBtn');
const userInfo = $('userInfo'), userAvatar = $('userAvatar'), userName = $('userName');
const authOverlay = $('authOverlay');

// Search & Nav References
const searchInput = $('searchInput'), searchClear = $('searchClear');
const navSearch = $('navSearch'), searchToggleBtn = $('searchToggleBtn');
const addNavBtn = $('addNavBtn');

// Form Modal References
const formModalOverlay = $('formModalOverlay'), formCloseBtn = $('formCloseBtn');
const formTitle = $('formTitle'), cancelEditBtn = $('cancelEdit');
const editIdInput = $('editId'), productNameInput = $('productName'), productPriceInput = $('productPrice');
const imageUploadArea = $('imageUploadArea'), imageInput = $('imageInput');
const uploadPlaceholder = $('uploadPlaceholder'), imagePreview = $('imagePreview'), removeImageBtn = $('removeImage');
const saveBtn = $('saveBtn'), saveBtnText = $('saveBtnText');

// Grid & State References
const productGrid = $('productGrid'), productCount = $('productCount');
const emptyState = $('emptyState'), noResults = $('noResults'), noResultsQuery = $('noResultsQuery');
const modalOverlay = $('modalOverlay'), modalConfirm = $('modalConfirm'), modalCancel = $('modalCancel');

// Settings DOM Elements
const settingsBtn = $('settingsBtn'), settingsModalOverlay = $('settingsModalOverlay'), settingsCloseBtn = $('settingsCloseBtn');
const themeSelect = $('themeSelect'), toggleOthersEdit = $('toggleOthersEdit'), toggleOthersDelete = $('toggleOthersDelete');

// State Variables
let currentUser = null;
let allProducts = [];
let currentImageBase64 = '';
let deleteId = null;
let unsubscribeProducts = null;
let unsubscribeSettings = null; 

let userSettings = { theme: 'original', showOthersEdit: false, showOthersDelete: false };
const IMG_MAX_W = 800; 
const IMG_QUALITY = 0.75; 

// ==========================================
// 1. AUTHENTICATION & SETTINGS
// ==========================================
const provider = new GoogleAuthProvider();

loginBtn.addEventListener('click', async () => {
  try {
    loginBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> <span class="hide-mobile">Wait...</span>';
    loginBtn.disabled = true;
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    alert("Login failed: " + error.message);
    loginBtn.innerHTML = '<i class="ph-fill ph-google-logo"></i> <span class="hide-mobile">Sign in</span>';
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    userAvatar.src = user.photoURL;
    userName.textContent = user.displayName.split(' ')[0];
    authOverlay.style.display = 'none'; // ปลดล็อคฟอร์มใน Pop-up

    const settingsRef = ref(db, `users/${user.uid}/settings`);
    unsubscribeSettings = onValue(settingsRef, (snapshot) => {
      const val = snapshot.val();
      if (val) userSettings = { ...userSettings, ...val };
      else userSettings = { theme: 'original', showOthersEdit: false, showOthersDelete: false };
      applyUserSettings();
    });

    startDatabaseListener();
  } else {
    currentUser = null;
    loginBtn.innerHTML = '<i class="ph-fill ph-google-logo"></i> <span class="hide-mobile">Sign in</span>';
    loginBtn.style.display = 'flex';
    loginBtn.disabled = false;
    userInfo.style.display = 'none';
    authOverlay.style.display = 'flex'; 
    
    userSettings = { theme: 'original', showOthersEdit: false, showOthersDelete: false };
    document.body.className = 'theme-original';
    settingsModalOverlay.classList.remove('active');
    formModalOverlay.classList.remove('active');

    if (unsubscribeSettings) { unsubscribeSettings(); unsubscribeSettings = null; }
    resetForm();
    stopDatabaseListener();
  }
});

function applyUserSettings() {
  document.body.className = `theme-${userSettings.theme || 'original'}`;
  themeSelect.value = userSettings.theme || 'original';
  toggleOthersEdit.checked = !!userSettings.showOthersEdit;
  toggleOthersDelete.checked = !!userSettings.showOthersDelete;
  renderGrid(searchInput.value); 
}

function saveSettingsToFirebase() {
  if (currentUser) set(ref(db, `users/${currentUser.uid}/settings`), userSettings);
}

themeSelect.addEventListener('change', e => { userSettings.theme = e.target.value; document.body.className = `theme-${userSettings.theme}`; saveSettingsToFirebase(); });
toggleOthersEdit.addEventListener('change', e => { userSettings.showOthersEdit = e.target.checked; saveSettingsToFirebase(); });
toggleOthersDelete.addEventListener('change', e => { userSettings.showOthersDelete = e.target.checked; saveSettingsToFirebase(); });

// Modal Triggers for Settings
settingsBtn.addEventListener('click', () => settingsModalOverlay.classList.add('active'));
settingsCloseBtn.addEventListener('click', () => settingsModalOverlay.classList.remove('active'));
settingsModalOverlay.addEventListener('click', (e) => { if (e.target === settingsModalOverlay) settingsModalOverlay.classList.remove('active'); });


// ==========================================
// 2. SEARCH & ADD BUTTON LOGIC (Mobile UI)
// ==========================================
// แว่นขยายขยายช่องค้นหาบนมือถือ
searchToggleBtn.addEventListener('click', () => {
  navSearch.classList.toggle('active');
  if (navSearch.classList.contains('active')) {
    setTimeout(() => searchInput.focus(), 100);
  } else {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    renderGrid('');
  }
});

// กด + เปิด Pop-up แบบฟอร์ม
addNavBtn.addEventListener('click', () => {
  resetForm();
  formModalOverlay.classList.add('active');
});

formCloseBtn.addEventListener('click', () => {
  resetForm();
  formModalOverlay.classList.remove('active');
});

formModalOverlay.addEventListener('click', (e) => { 
  if (e.target === formModalOverlay) {
    resetForm();
    formModalOverlay.classList.remove('active');
  }
});


// ==========================================
// 3. DATABASE SYNC & RENDER
// ==========================================
function startDatabaseListener() {
  const productsRef = ref(db, 'products');
  unsubscribeProducts = onValue(productsRef, (snapshot) => {
    const data = snapshot.val();
    allProducts = [];
    if (data) {
      Object.keys(data).forEach(key => allProducts.push({ id: key, ...data[key] }));
      allProducts.sort((a, b) => b.timestamp - a.timestamp);
    }
    renderGrid(searchInput.value);
  }, error => console.error(error));
}

function stopDatabaseListener() {
  if (unsubscribeProducts) { unsubscribeProducts(); unsubscribeProducts = null; }
  allProducts = [];
  renderGrid();
}

function renderGrid(searchQuery = '') {
  productGrid.innerHTML = '';
  const query = searchQuery.toLowerCase().trim();
  
  const filtered = allProducts.filter(p => p.name.toLowerCase().includes(query) || p.price.toString().includes(query));
  productCount.textContent = `${allProducts.length} products`;
  
  if (allProducts.length === 0) {
    emptyState.style.display = 'flex';
    noResults.style.display = 'none';
    return;
  }
  
  if (filtered.length === 0 && query !== '') {
    emptyState.style.display = 'none';
    noResults.style.display = 'flex';
    noResultsQuery.textContent = searchQuery;
    return;
  }

  emptyState.style.display = 'none';
  noResults.style.display = 'none';

  filtered.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const isOwner = currentUser && currentUser.uid === product.uid;
    const canShowEdit = isOwner || userSettings.showOthersEdit;
    const canShowDelete = isOwner || userSettings.showOthersDelete;

    let actionButtons = '';
    if (canShowEdit || canShowDelete) {
      actionButtons = `<div class="card-actions">`;
      if (canShowEdit) actionButtons += `<button class="btn-card btn-edit" onclick="editProduct('${product.id}')" title="Edit"><i class="ph ph-pencil-simple"></i></button>`;
      if (canShowDelete) actionButtons += `<button class="btn-card btn-delete" onclick="requestDelete('${product.id}')" title="Delete"><i class="ph ph-trash"></i></button>`;
      actionButtons += `</div>`;
    }

    const imageHtml = product.image ? `<img src="${product.image}" class="card-img" alt="${product.name}" loading="lazy" />` : `<div class="no-image"><i class="ph ph-image"></i></div>`;

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
// 4. IMAGE HANDLING (Canvas Compression)
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
  imagePreview.style.display = 'block';
  uploadPlaceholder.style.display = 'none';
  removeImageBtn.style.display = 'flex';
}

function hidePreview() {
  imagePreview.src = '';
  imagePreview.style.display = 'none';
  uploadPlaceholder.style.display = 'flex';
  removeImageBtn.style.display = 'none';
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

  const productData = { name: name, price: parseFloat(price), image: currentImageBase64, addedBy: currentUser.displayName, uid: currentUser.uid };

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';

  if (id) {
    update(ref(db, `products/${id}`), productData)
      .then(() => { resetForm(); formModalOverlay.classList.remove('active'); })
      .catch((error) => { console.error(error); alert("Update Error: " + error.message); resetForm(); });
  } else {
    productData.timestamp = Date.now();
    const newDocRef = push(ref(db, 'products'));
    set(newDocRef, productData)
      .then(() => { resetForm(); formModalOverlay.classList.remove('active'); })
      .catch((error) => { console.error(error); alert("Save Error: " + error.message); resetForm(); });
  }
});

window.editProduct = (id) => {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  if (product.uid !== currentUser.uid && !userSettings.showOthersEdit) return alert('You can only edit your own products.');

  editIdInput.value = id;
  productNameInput.value = product.name;
  productPriceInput.value = product.price;
  currentImageBase64 = product.image || '';

  if (currentImageBase64) showPreview(currentImageBase64);
  else hidePreview();

  formTitle.innerHTML = '<i class="ph ph-pencil-simple"></i> Edit Product';
  saveBtnText.textContent = 'Update Product';
  cancelEditBtn.style.display = 'flex';
  
  formModalOverlay.classList.add('active'); // เด้ง Pop-up ฟอร์มขึ้นมา
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
  cancelEditBtn.style.display = 'none';
  saveBtn.disabled = false;
  saveBtn.innerHTML = '<i class="ph ph-check-circle"></i> <span id="saveBtnText">Save Product</span>';
}

window.requestDelete = (id) => {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  if (product.uid !== currentUser.uid && !userSettings.showOthersDelete) return alert('You can only delete your own products.');
  deleteId = id;
  modalOverlay.classList.add('active');
};

modalCancel.addEventListener('click', () => {
  deleteId = null;
  modalOverlay.classList.remove('active');
});

modalConfirm.addEventListener('click', () => {
  if (deleteId) {
    remove(ref(db, `products/${deleteId}`)).then(() => {
      deleteId = null;
      modalOverlay.classList.remove('active');
    }).catch(error => { console.error(error); alert("Delete Error: " + error.message); deleteId = null; modalOverlay.classList.remove('active'); });
  }
});

// ==========================================
// 6. SEARCH LOGIC (Core Logic)
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
  searchInput.focus();
});
