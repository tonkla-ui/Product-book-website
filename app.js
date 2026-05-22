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

// State Variables
let currentUser = null;
let allProducts = [];
let currentImageBase64 = '';
let deleteId = null;
const IMG_MAX_W = 800; 
const IMG_QUALITY = 0.75; 

// ==========================================
// 1. AUTHENTICATION (Google Login)
// ==========================================
const provider = new GoogleAuthProvider();

loginBtn.addEventListener('click', () => signInWithPopup(auth, provider));
logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Logged In
    currentUser = user;
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    userAvatar.src = user.photoURL;
    userName.textContent = user.displayName.split(' ')[0]; // Show first name
    authOverlay.style.display = 'none'; // Unlock Form
  } else {
    // Logged Out
    currentUser = null;
    loginBtn.style.display = 'flex';
    userInfo.style.display = 'none';
    authOverlay.style.display = 'flex'; // Lock Form
    resetForm();
  }
});

// ==========================================
// 2. REALTIME DATABASE SYNC
// ==========================================
const productsRef = ref(db, 'products');

onValue(productsRef, (snapshot) => {
  const data = snapshot.val();
  allProducts = [];
  
  if (data) {
    // Convert Firebase object to array
    Object.keys(data).forEach(key => {
      allProducts.push({ id: key, ...data[key] });
    });
    // Sort by timestamp (newest first)
    allProducts.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  renderGrid();
});

// ==========================================
// 3. RENDER UI
// ==========================================
function renderGrid(searchQuery = '') {
  productGrid.innerHTML = '';
  const query = searchQuery.toLowerCase().trim();
  
  // Filter products based on search
  const filtered = allProducts.filter(p => 
    p.name.toLowerCase().includes(query) || p.price.toString().includes(query)
  );

  // Update counters and empty states
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

  // Render cards
  filtered.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    // Check if the current logged in user is the owner (can edit/delete)
    const isOwner = currentUser && currentUser.uid === product.uid;
    const actionButtons = isOwner ? `
      <div class="card-actions">
        <button class="btn-card btn-edit" onclick="editProduct('${product.id}')" title="Edit"><i class="ph ph-pencil-simple"></i></button>
        <button class="btn-card btn-delete" onclick="requestDelete('${product.id}')" title="Delete"><i class="ph ph-trash"></i></button>
      </div>
    ` : '';

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
      
      // Compress and store in memory
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

  const productData = {
    name: name,
    price: parseFloat(price),
    image: currentImageBase64,
    addedBy: currentUser.displayName,
    uid: currentUser.uid,
    timestamp: id ? undefined : Date.now() // Only set timestamp on creation
  };

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';

  if (id) {
    // UPDATE
    update(ref(db, `products/${id}`), productData).then(() => {
      resetForm();
    });
  } else {
    // CREATE
    const newDocRef = push(productsRef);
    set(newDocRef, productData).then(() => {
      resetForm();
    });
  }
});

window.editProduct = (id) => {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  if (product.uid !== currentUser.uid) return alert('You can only edit your own products.');

  editIdInput.value = id;
  productNameInput.value = product.name;
  productPriceInput.value = product.price;
  currentImageBase64 = product.image || '';

  if (currentImageBase64) showPreview(currentImageBase64);
  else hidePreview();

  formTitle.innerHTML = '<i class="ph ph-pencil-simple"></i> Edit Product';
  saveBtnText.textContent = 'Update Product';
  cancelEditBtn.style.display = 'flex';
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
  cancelEditBtn.style.display = 'none';
  saveBtn.disabled = false;
  saveBtn.innerHTML = '<i class="ph ph-check-circle"></i> <span id="saveBtnText">Save Product</span>';
}

// Delete Logic
window.requestDelete = (id) => {
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
