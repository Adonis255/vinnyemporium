import os
import uuid
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv
from functools import wraps

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'fallback-secret-key-change-in-production')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'vinny2025')

# ---------- Helper ----------
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def upload_to_supabase(file):
    """Upload file to Supabase Storage bucket 'product-images' and return public URL"""
    if not supabase:
        return None
    ext = file.filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    try:
        response = supabase.storage.from_('product-images').upload(filename, file.read(), {'content-type': file.content_type})
        # Get public URL
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/product-images/{filename}"
        return public_url
    except Exception as e:
        print(f"Upload error: {e}")
        return None

# ---------- Routes ----------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/catalogue')
def catalogue():
    return render_template('catalogue.html')

# ========== NEW: Single /admin Entry Point ==========
@app.route('/admin')
def admin_panel():
    if session.get('admin_logged_in'):
        return redirect(url_for('admin_dashboard'))
    return redirect(url_for('admin_login'))
# ====================================================

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        if request.form.get('password') == ADMIN_PASSWORD:
            session['admin_logged_in'] = True
            return redirect(url_for('admin_dashboard'))
        return render_template('admin_login.html', error='Invalid password')
    return render_template('admin_login.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin_login'))

@app.route('/admin/dashboard')
@admin_required
def admin_dashboard():
    return render_template('admin_dashboard.html')

# ---------- API: Categories ----------
@app.route('/api/categories', methods=['GET'])
def get_categories():
    if not supabase:
        return jsonify(['Phones', 'Laptops', 'Audio'])  # fallback
    try:
        response = supabase.table('categories').select('*').order('id').execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories', methods=['POST'])
@admin_required
def add_category():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Category name required'}), 400
    try:
        # Check if exists
        existing = supabase.table('categories').select('id').eq('name', name).execute()
        if existing.data:
            return jsonify({'error': 'Category already exists'}), 400
        result = supabase.table('categories').insert({'name': name}).execute()
        return jsonify(result.data[0]), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/categories/<int:cat_id>', methods=['DELETE'])
@admin_required
def delete_category(cat_id):
    try:
        # Step 1: Set all products using this category to NULL (Uncategorized)
        supabase.table('products').update({'category_id': None}).eq('category_id', cat_id).execute()
        # Step 2: Delete the category itself
        supabase.table('categories').delete().eq('id', cat_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ---------- API: Products (with file upload support) ----------
@app.route('/api/products', methods=['GET'])
def get_products():
    if not supabase:
        dummy = [
            {'id': 1, 'name': 'iPhone 15 Pro', 'category_id': 1, 'category_name': 'Phones', 'price': 999.99, 'description': 'Latest Apple flagship', 'image_url': 'https://via.placeholder.com/300x300?text=iPhone+15+Pro'},
        ]
        return jsonify(dummy)
    try:
        # Join with categories to get category name
        response = supabase.table('products').select('*, categories(name)').execute()
        # flatten response
        data = []
        for item in response.data:
            data.append({
                'id': item['id'],
                'name': item['name'],
                'category_id': item['category_id'],
                'category': item['categories']['name'] if item.get('categories') else 'Uncategorized',
                'price': item['price'],
                'description': item.get('description', ''),
                'image_url': item.get('image_url', '')
            })
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products', methods=['POST'])
@admin_required
def add_product():
    try:
        # Handle multipart/form-data
        name = request.form.get('name')
        category_id = request.form.get('category_id')
        price = request.form.get('price')
        description = request.form.get('description', '')
        image_url = request.form.get('image_url', '')

        # Check for file upload
        if 'image_file' in request.files and request.files['image_file'].filename:
            file = request.files['image_file']
            uploaded_url = upload_to_supabase(file)
            if uploaded_url:
                image_url = uploaded_url

        # Validate
        if not name or not category_id or not price:
            return jsonify({'error': 'Name, category, and price are required'}), 400

        result = supabase.table('products').insert({
            'name': name,
            'category_id': int(category_id),
            'price': float(price),
            'description': description,
            'image_url': image_url
        }).execute()
        # Return with category name
        product = result.data[0]
        cat_res = supabase.table('categories').select('name').eq('id', product['category_id']).execute()
        product['category'] = cat_res.data[0]['name'] if cat_res.data else 'Uncategorized'
        return jsonify(product), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/products/<int:product_id>', methods=['PUT'])
@admin_required
def update_product(product_id):
    try:
        name = request.form.get('name')
        category_id = request.form.get('category_id')
        price = request.form.get('price')
        description = request.form.get('description', '')
        image_url = request.form.get('image_url', '')

        # Check for file upload
        if 'image_file' in request.files and request.files['image_file'].filename:
            file = request.files['image_file']
            uploaded_url = upload_to_supabase(file)
            if uploaded_url:
                image_url = uploaded_url

        if not name or not category_id or not price:
            return jsonify({'error': 'Name, category, and price are required'}), 400

        result = supabase.table('products').update({
            'name': name,
            'category_id': int(category_id),
            'price': float(price),
            'description': description,
            'image_url': image_url
        }).eq('id', product_id).execute()

        if not result.data:
            return jsonify({'error': 'Product not found'}), 404

        product = result.data[0]
        cat_res = supabase.table('categories').select('name').eq('id', product['category_id']).execute()
        product['category'] = cat_res.data[0]['name'] if cat_res.data else 'Uncategorized'
        return jsonify(product)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/products/<int:product_id>', methods=['DELETE'])
@admin_required
def delete_product(product_id):
    try:
        supabase.table('products').delete().eq('id', product_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True, port=5000)