// ===== Shared state =====
const API_BASE = '/api/products';
const CAT_API_BASE = '/api/categories';
let allProducts = [];
let allCategories = [];
let currentCategory = 'all'; // Track which category is active
let currentSearchTerm = ''; // Track the search text

// ===== Helper: Shuffle Array (Fisher-Yates) =====
function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

// ===== Fetch Categories =====
async function fetchCategories() {
    try {
        const res = await fetch(CAT_API_BASE);
        if (!res.ok) throw new Error('Failed to fetch categories');
        const data = await res.json();
        allCategories = data;
        return data;
    } catch (err) {
        console.error(err);
        return [];
    }
}

// ===== Fetch Products =====
async function fetchProducts() {
    try {
        const res = await fetch(API_BASE);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        allProducts = data;
        return data;
    } catch (err) {
        console.error(err);
        return [];
    }
}

// ===== Render Catalogue =====
function renderCatalogue(products, categoryFilter = 'all') {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    // 1. Filter by Category
    let filtered = categoryFilter === 'all'
        ? products.slice() // Create a copy
        : products.filter(p => p.category === categoryFilter);

    // 2. If viewing 'All', Shuffle the products to mix categories randomly
    if (categoryFilter === 'all') {
        filtered = shuffleArray(filtered);
    }

    // 3. Filter by Search Term (if any)
    if (currentSearchTerm.trim() !== '') {
        const term = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(term) || 
            (p.description && p.description.toLowerCase().includes(term))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<p style="text-align:center; grid-column:1/-1; padding:2rem;">No products found matching your search.</p>`;
        return;
    }

    // 4. Render HTML with direct WhatsApp number
    grid.innerHTML = filtered.map(p => `
        <div class="product-card" data-category="${p.category}">
            <img src="${p.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}" 
                 alt="${p.name}" class="product-img" loading="lazy" />
            <div class="product-info">
                <h3>${p.name}</h3>
                <span class="product-category">${p.category}</span>
                <div class="product-price">KSh ${Number(p.price).toFixed(2)}</div>
                <p class="product-desc">${p.description || ''}</p>
                <a href="https://wa.me/254727552507?text=Hi%20Vinny%20Emporium!%20I%20want%20to%20order%20${encodeURIComponent(p.name)}%20for%20KSh%20${Number(p.price).toFixed(2)}" 
                   target="_blank" 
                   class="whatsapp-btn">
                    <i class="fab fa-whatsapp"></i> Order via WhatsApp
                </a>
            </div>
        </div>
    `).join('');
}

// ===== Catalogue: Build Category Filters (Buttons + Dropdown) =====
function buildCategoryFilters() {
    const container = document.getElementById('category-filters');
    const dropdown = document.getElementById('category-dropdown');
    if (!container || !dropdown) return;

    // 1. Clear and reset to default "All"
    container.innerHTML = `<button class="filter-btn active" data-category="all">All</button>`;
    dropdown.innerHTML = `<option value="all">All</option>`;

    // 2. Populate both from fetched categories
    allCategories.forEach(cat => {
        // Desktop Button
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.category = cat.name;
        btn.textContent = cat.name;
        container.appendChild(btn);

        // Mobile Dropdown Option
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        dropdown.appendChild(opt);
    });

    // 3. Shared filtering logic
    const filterProducts = (category) => {
        currentCategory = category; // Update global tracking
        // Sync buttons
        container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = container.querySelector(`.filter-btn[data-category="${category}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Sync dropdown
        dropdown.value = category;

        // Render the filtered products
        renderCatalogue(allProducts, category);
    };

    // 4. Event Listeners for Buttons
    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            filterProducts(this.dataset.category);
        });
    });

    // 5. Event Listener for Mobile Dropdown
    dropdown.addEventListener('change', function() {
        filterProducts(this.value);
    });
}

// ===== Catalogue: Search Logic =====
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', function() {
        currentSearchTerm = this.value;
        // Re-render based on the current category and new search term
        renderCatalogue(allProducts, currentCategory);
    });
}

// ===== Admin Dashboard: Render Categories List =====
function renderCategoryList() {
    const list = document.getElementById('category-list');
    if (!list) return;

    if (allCategories.length === 0) {
        list.innerHTML = `<li style="text-align:center; color:#888; padding:1rem 0;">No categories yet. Add one above!</li>`;
        return;
    }

    list.innerHTML = allCategories.map(cat => `
        <li>
            <span>${cat.name}</span>
            <button class="action-btn btn-delete delete-cat-btn" data-id="${cat.id}">Delete</button>
        </li>
    `).join('');

    list.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            if (!confirm('Delete this category? All products under it will become "Uncategorized".')) return;
            const id = this.dataset.id;
            try {
                const res = await fetch(`${CAT_API_BASE}/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    alert('Error: ' + (err.error || 'Failed to delete'));
                    return;
                }
                await loadAllAdminData();
            } catch (err) {
                alert('Error deleting category: ' + err.message);
            }
        });
    });
}

// ===== Admin: Populate Category Select =====
function populateCategorySelect() {
    const select = document.getElementById('product-category');
    if (!select) return;
    select.innerHTML = allCategories.map(cat => 
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('');
}

// ===== Admin: Render Product Table =====
function renderAdminTable(products) {
    const tbody = document.getElementById('product-table-body');
    if (!tbody) return;

    tbody.innerHTML = products.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td>KSh ${Number(p.price).toFixed(2)}</td>
            <td>
                <button class="action-btn btn-edit" data-id="${p.id}">Edit</button>
                <button class="action-btn btn-delete" data-id="${p.id}">Delete</button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
}

// ===== Admin CRUD: Products =====
async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    try {
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        await loadAllAdminData();
    } catch (err) {
        alert('Error deleting product: ' + err.message);
    }
}

function openEditModal(id) {
    const product = allProducts.find(p => p.id == id);
    if (!product) return;
    document.getElementById('modal-title').textContent = 'Edit Product';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-category').value = product.category_id;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-image-url').value = product.image_url || '';
    document.getElementById('product-image-file').value = '';
    document.getElementById('product-modal').style.display = 'flex';
}

function openAddModal() {
    document.getElementById('modal-title').textContent = 'Add New Product';
    document.getElementById('product-id').value = '';
    document.getElementById('product-form').reset();
    document.getElementById('product-image-file').value = '';
    document.getElementById('product-modal').style.display = 'flex';
}

async function handleProductSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const formData = new FormData();
    formData.append('name', document.getElementById('product-name').value.trim());
    formData.append('category_id', document.getElementById('product-category').value);
    formData.append('price', document.getElementById('product-price').value);
    formData.append('description', document.getElementById('product-description').value.trim());
    formData.append('image_url', document.getElementById('product-image-url').value.trim());
    
    const fileInput = document.getElementById('product-image-file');
    if (fileInput.files && fileInput.files[0]) {
        formData.append('image_file', fileInput.files[0]);
    }

    const url = id ? `${API_BASE}/${id}` : API_BASE;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            body: formData
        });
        if (!res.ok) {
            const err = await res.json();
            alert('Error: ' + (err.error || 'Save failed'));
            return;
        }
        document.getElementById('product-modal').style.display = 'none';
        await loadAllAdminData();
    } catch (err) {
        alert('Error saving product: ' + err.message);
    }
}

// ===== Load All Admin Data =====
async function loadAllAdminData() {
    await fetchCategories();
    await fetchProducts();
    renderCategoryList();
    populateCategorySelect();
    renderAdminTable(allProducts);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async function() {
    // Catalogue page
    if (document.getElementById('products-grid')) {
        await fetchCategories();
        await fetchProducts();
        buildCategoryFilters();
        setupSearch(); 
        renderCatalogue(allProducts, 'all'); 
    }

    // Admin dashboard
    if (document.getElementById('product-table-body')) {
        await loadAllAdminData();

        const addCatBtn = document.getElementById('add-category-btn');
        if (addCatBtn) {
            addCatBtn.addEventListener('click', async function() {
                const input = document.getElementById('new-category-name');
                const name = input.value.trim();
                if (!name) return alert('Please enter a category name');
                try {
                    const res = await fetch(CAT_API_BASE, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        alert('Error: ' + (err.error || 'Failed to add category'));
                        return;
                    }
                    input.value = '';
                    await loadAllAdminData();
                } catch (err) {
                    alert('Error adding category: ' + err.message);
                }
            });
        }

        const addBtn = document.getElementById('add-product-btn');
        if (addBtn) addBtn.addEventListener('click', openAddModal);

        const closeBtn = document.querySelector('.close-modal');
        const modal = document.getElementById('product-modal');
        if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
        if (modal) modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        const form = document.getElementById('product-form');
        if (form) form.addEventListener('submit', handleProductSubmit);
    }
});