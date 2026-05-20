# Vault — Private Product Manager

A beautiful, zero-cost product management website that runs entirely in your browser.  
No server needed. No account required. Data saved permanently in your browser.

---

## 📁 Project Structure

```
product-manager/
├── index.html   ← Page structure & layout (HTML)
├── style.css    ← All visual design (CSS)
├── app.js       ← All logic: save, search, delete (JavaScript)
└── README.md    ← This guide
```

### What each file does

| File | Purpose |
|------|---------|
| `index.html` | Defines every element on the page (navbar, form, grid, modal) |
| `style.css` | Colors, fonts, animations, responsive layout |
| `app.js` | Handles saving, searching, deleting, image uploads |

### Where data is stored

- **Product data** (name, price, date): `localStorage` under the key `vault_products`
- **Images**: Converted to base64 strings and stored inside the same `localStorage` entry
- **Limit**: localStorage holds ~5–10 MB per website. If you have many large images, consider the Firebase upgrade below.

---

## 🚀 Running Locally

No install, no build step needed.

1. Download / unzip this folder
2. Double-click `index.html` — it opens in your browser
3. Done ✅

> **Tip:** Use VS Code + the "Live Server" extension for auto-reload while editing.

---

## ✨ Features Guide

### Adding a Product
1. Fill in **Product Name** and **Price**
2. (Optional) click the image box to upload a photo — or drag & drop
3. Click **Save Product** — nothing is saved until you press this button

### Editing a Product
1. Click the **Edit** button on any card
2. The form fills with that product's data
3. Make changes → click **Update Product**
4. Click **Cancel Edit** to discard changes

### Deleting a Product
1. Click **Delete** on any card
2. Confirm in the popup dialog

### Searching
- Type anything in the search box — results filter instantly
- Searches **both name and price** at the same time
- Examples:
  - `head` → shows "Headphones"
  - `89` → shows products priced $89.xx
  - `key` → shows "Keyboard"
- Case-insensitive (searching `COLA` finds `Cola`)

---

## 🌐 Deploying to GitHub Pages (Free)

### Step 1 — Create a GitHub account
Go to https://github.com and sign up (free).

### Step 2 — Create a new repository
1. Click the **+** icon → **New repository**
2. Name it anything, e.g. `my-vault`
3. Set it to **Public** (required for free GitHub Pages)
4. Click **Create repository**

### Step 3 — Upload your files
**Option A — via GitHub website (easiest):**
1. Open your new repository
2. Click **Add file** → **Upload files**
3. Drag all 3 files (`index.html`, `style.css`, `app.js`) into the box
4. Click **Commit changes**

**Option B — via Git (recommended for ongoing edits):**
```bash
# In the project folder:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/my-vault.git
git push -u origin main
```

### Step 4 — Enable GitHub Pages
1. Go to your repository → **Settings** tab
2. Scroll to **Pages** in the left sidebar
3. Under **Source**, select **main** branch, folder **/ (root)**
4. Click **Save**

### Step 5 — Access your site
After ~1 minute your site is live at:
```
https://YOUR_USERNAME.github.io/my-vault/
```
Share this URL — it works on any device.

### Updating the site later
```bash
# Edit files locally, then:
git add .
git commit -m "Update products page"
git push
```
GitHub Pages updates automatically within ~1 minute.

---

## ⚠️ Important Note on Data Sync

`localStorage` is **per browser per device**.  
This means:
- Data saved on your laptop **won't appear** on your phone automatically
- Opening the site in a different browser shows a fresh vault

**If you need data across devices**, see the Firebase upgrade below.

---

## 🔥 Optional: Upgrade to Firebase (Cross-Device Sync)

This gives you real cloud storage so your products sync everywhere — still **100% free** on Firebase's Spark plan.

### 1. Create a Firebase project
1. Go to https://console.firebase.google.com
2. Click **Add project** → name it → click through the setup

### 2. Enable Firestore & Storage
- **Firestore Database**: Build → Firestore Database → Create database (start in test mode)
- **Storage**: Build → Storage → Get started

### 3. (Optional) Add Authentication
- Build → Authentication → Get started → Enable **Google** sign-in
- This makes your vault private to your Google account

### 4. Get your Firebase config
- Project Settings (⚙️) → General → Your apps → Add app (Web)
- Copy the `firebaseConfig` object

### 5. Replace localStorage with Firebase in `app.js`
Add this to the top of `app.js` (replacing the script tag in `index.html`):
```html
<!-- In index.html, before app.js: -->
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js";
  import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc }
    from "https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js";
  import { getStorage, ref, uploadBytes, getDownloadURL }
    from "https://www.gstatic.com/firebasejs/10.x.x/firebase-storage.js";

  const firebaseConfig = { /* paste your config here */ };
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const storage = getStorage(app);
  window._db = db;
  window._storage = storage;
</script>
```
Then update `saveToStorage()` / `loadFromStorage()` in `app.js` to call Firestore instead of `localStorage`.

---

## 🛠️ Customization Tips

| Want to change... | Edit in... |
|-------------------|-----------|
| Colors | `style.css` → `:root` variables |
| Font | `index.html` Google Fonts link + `style.css` `font-family` |
| Currency symbol | `index.html` → `.currency-symbol` span & `app.js` `formatPrice()` |
| Max image size | `app.js` → lines with `5 * 1024 * 1024` (currently 5 MB) |
| Demo products | `app.js` → `seedDemoProducts()` function |
| Page title | `index.html` → `<title>` tag and `.brand-name` span |

---

## 🧪 Browser Support

Works in all modern browsers:
- Chrome / Edge 88+
- Firefox 85+
- Safari 14+
- Mobile Chrome & Safari

---

*Built with plain HTML, CSS, and JavaScript — no frameworks, no build tools, no cost.*
