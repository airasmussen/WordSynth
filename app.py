"""
Word Synthesizer Flask App - Visual Word Embedding Explorer

Interactive web interface for mixing word embeddings with 3D visualization.
Converted from Streamlit to Flask + Plotly.js for better performance and control.
"""

import os
# Set Numba threading configuration BEFORE importing any Numba-dependent libraries
os.environ['NUMBA_NUM_THREADS'] = '1'  # Force single-threaded Numba

from flask import Flask, render_template, request, jsonify
import numpy as np
import pandas as pd
import umap
import json
from typing import List, Tuple, Dict, Any
import time

from synth import SynthModel
from settings import (
    TOPN_DEFAULT, NEIGHBORHOOD_SIZE, BASIS_WORD_COUNT,
    SLIDER_MIN, SLIDER_MAX, SLIDER_STEP,
    UMAP_N_NEIGHBORS, UMAP_MIN_DIST, UMAP_METRIC
)

app = Flask(__name__)

# Global model instance
model = None
model_choice = "GoogleNews"

# Cache for 3D visualizations
visualization_cache = {}

def load_model(choice: str):
    """Load the word embedding model."""
    global model, model_choice, visualization_cache
    try:
        if choice == "GoogleNews":
            model = SynthModel("GoogleNews-vectors-negative300.bin", binary=True)
        elif choice == "GloVe":
            model = SynthModel("glove.6B.300d.txt", binary=False)
        else:
            return False, f"Unknown model choice: {choice}"
        
        model_choice = choice
        # Clear cache when model changes
        visualization_cache.clear()
        return True, None
    except FileNotFoundError as e:
        if choice == "GoogleNews":
            return False, f"GoogleNews model not found: {str(e)}"
        elif choice == "GloVe":
            return False, f"GloVe model not found: {str(e)}"
        else:
            return False, f"Model not found: {str(e)}"
    except Exception as e:
        return False, f"Error loading model: {str(e)}"

@app.route('/')
def index():
    """Main page."""
    return render_template('index.html')

@app.route('/api/model/load', methods=['POST'])
def load_model_api():
    """Load a word embedding model."""
    data = request.get_json()
    model_name = data.get('model', 'GoogleNews')
    
    success, error = load_model(model_name)
    
    if success:
        model_info = model.get_model_info()
        return jsonify({
            'success': True,
            'model_info': model_info
        })
    else:
        return jsonify({
            'success': False,
            'error': error
        }), 400

@app.route('/api/model/info')
def model_info():
    """Get current model information."""
    if model is None:
        return jsonify({'error': 'No model loaded'}), 400
    
    info = model.get_model_info()
    return jsonify(info)

@app.route('/api/word/check', methods=['POST'])
def check_word():
    """Check if a word exists in the vocabulary."""
    data = request.get_json()
    word = data.get('word', '').strip()
    
    if model is None:
        return jsonify({'error': 'No model loaded'}), 400
    
    exists = word in model.vocab
    
    if not exists:
        # Try some variations
        variations = [
            word.replace('_', ' '),
            word.replace('_', ''),
            word.replace(' ', '_'),
            word.capitalize(),
            word.upper()
        ]
        for var in variations:
            if var in model.vocab:
                exists = True
                word = var  # Update the word to the found variation
                break
    
    # If still not found, but the word was displayed in 3D visualization,
    # it means it exists in some form - let's be more permissive
    if not exists:
        # Check if it's a compound word or has special characters
        # For now, let's allow it if it contains only letters, numbers, underscores, and spaces
        if all(c.isalnum() or c in '_- ' for c in word):
            # Try to find the closest match - be more aggressive
            similar_words = [w for w in model.vocab if word.split('_')[0].lower() in w.lower()][:1]
            if similar_words:
                exists = True
                word = similar_words[0]
            else:
                # If no similar words found, try exact match with different case
                for vocab_word in model.vocab:
                    if vocab_word.lower() == word.lower():
                        exists = True
                        word = vocab_word
                        break
    
    return jsonify({'exists': exists, 'word': word})

@app.route('/api/word/basis', methods=['POST'])
def get_basis_words():
    """Get basis word candidates for a given word."""
    data = request.get_json()
    base_word = data.get('word', '').strip()
    count = data.get('count', BASIS_WORD_COUNT)
    
    if model is None:
        return jsonify({'error': 'No model loaded'}), 400
    
    if base_word not in model.vocab:
        return jsonify({'error': f'Word "{base_word}" not in vocabulary'}), 400
    
    # Get basis candidates
    basis_candidates = model.get_basis_candidates(base_word, count)
    
    # Add the base word itself as the first basis word
    if base_word not in basis_candidates:
        basis_candidates.insert(0, base_word)
    
    # Special case: Add "man" and "woman" for "king" to test gender arithmetic
    if base_word == "king":
        gender_words = ["man", "woman"]
        for word in gender_words:
            if word in model.vocab and word not in basis_candidates:
                basis_candidates.insert(1, word)  # Insert after base word
    
    # Set the last 4 words to static values: masculine, feminine, good, bad
    static_words = ["masculine", "feminine", "good", "bad"]
    for i, word in enumerate(static_words):
        if word in model.vocab:
            # Ensure we have enough slots, extend if necessary
            while len(basis_candidates) < count:
                basis_candidates.append("")
            
            # Set the last 4 positions to static words
            position = count - 4 + i
            if position < len(basis_candidates):
                basis_candidates[position] = word
    
    # Ensure we don't exceed the basis count
    basis_candidates = basis_candidates[:count]
    
    return jsonify({
        'basis_words': basis_candidates,
        'base_word': base_word
    })

@app.route('/api/word/mix', methods=['POST'])
def mix_words():
    """Mix word vectors with given weights."""
    data = request.get_json()
    weighted_words = data.get('weights', [])
    
    if model is None:
        return jsonify({'error': 'No model loaded'}), 400
    
    # Convert to list of tuples
    word_weights = [(item['word'], item['weight']) for item in weighted_words]
    
    # Compute mixed vector
    mixed_vector = model.mix(word_weights)
    
    if mixed_vector is None:
        return jsonify({'error': 'No valid words with non-zero weights'}), 400
    
    # Convert to list for JSON serialization
    mixed_vector_list = mixed_vector.tolist()
    
    return jsonify({
        'mixed_vector': mixed_vector_list,
        'has_nonzero_weights': any(abs(item['weight']) > 1e-6 for item in weighted_words)
    })

def filter_conjugations_plurals(neighbors: List[Tuple[str, float]], target_count: int) -> List[Tuple[str, float]]:
    """Filter out conjugations and plurals of words."""
    filtered = []
    seen_roots = set()
    
    for word, score in neighbors:
        word_lower = word.lower()
        
        # Common plural endings
        if word_lower.endswith(('s', 'es', 'ies')):
            # Try to find the root word
            root = word_lower
            if word_lower.endswith('ies'):
                root = word_lower[:-3] + 'y'
            elif word_lower.endswith('es'):
                root = word_lower[:-2]
            elif word_lower.endswith('s') and len(word_lower) > 3:
                root = word_lower[:-1]
            
            # Skip if we've already seen this root
            if root in seen_roots:
                continue
            seen_roots.add(root)
        
        # Common verb conjugations
        elif word_lower.endswith(('ing', 'ed', 'er', 'est')):
            # Try to find the root word
            root = word_lower
            if word_lower.endswith('ing'):
                root = word_lower[:-3]
            elif word_lower.endswith('ed'):
                root = word_lower[:-2]
            elif word_lower.endswith('er'):
                root = word_lower[:-2]
            elif word_lower.endswith('est'):
                root = word_lower[:-3]
            
            # Skip if we've already seen this root
            if root in seen_roots:
                continue
            seen_roots.add(root)
        
        # Add the word and mark its root as seen
        filtered.append((word, score))
        seen_roots.add(word_lower)
        
        if len(filtered) >= target_count:
            break
    
    return filtered

def filter_proper_nouns(neighbors: List[Tuple[str, float]], target_count: int) -> List[Tuple[str, float]]:
    """Filter out names and websites while keeping cities and other proper nouns."""
    filtered = []
    
    name_patterns = [
        'son', 'sen', 'berg', 'stein', 'ski', 'ova', 'ev', 'ov',
        'john', 'mary', 'david', 'sarah', 'michael', 'jennifer', 'robert', 'lisa',
        'james', 'elizabeth', 'william', 'patricia', 'richard', 'linda', 'charles',
        'barbara', 'joseph', 'susan', 'thomas', 'jessica', 'christopher', 'sarah',
        'daniel', 'ashley', 'matthew', 'emily', 'anthony', 'michelle', 'mark',
        'kimberly', 'donald', 'donna', 'steven', 'carol', 'paul', 'sandra',
        'andrew', 'ruth', 'joshua', 'sharon', 'kenneth', 'nancy', 'kevin', 'cynthia'
    ]
    
    website_patterns = [
        'www', 'http', 'https', 'com', 'org', 'net', 'edu', 'gov',
        'google', 'microsoft', 'apple', 'amazon', 'facebook', 'twitter',
        'youtube', 'instagram', 'linkedin', 'wikipedia', 'yahoo', 'bing'
    ]
    
    for word, score in neighbors:
        word_lower = word.lower()
        
        if any(pattern in word_lower for pattern in website_patterns):
            continue
            
        if word[0].isupper():  # Proper noun
            city_indicators = ['city', 'town', 'burg', 'ville', 'polis', 'port', 'ford', 'ton']
            country_indicators = ['land', 'stan', 'ia', 'ia', 'ese', 'ish']
            
            if any(indicator in word_lower for indicator in city_indicators + country_indicators):
                filtered.append((word, score))
            elif any(pattern in word_lower for pattern in name_patterns):
                continue
            elif len(word) <= 3:
                continue
            else:
                filtered.append((word, score))
        else:
            filtered.append((word, score))
        
        if len(filtered) >= target_count:
            break
    
    return filtered

@app.route('/api/word/neighbors', methods=['POST'])
def get_neighbors():
    """Get nearest neighbors for a mixed vector."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        mixed_vector = np.array(data.get('vector', []))
        topn = data.get('topn', TOPN_DEFAULT)
        filters = data.get('filters', {})
        exclude_words = data.get('exclude_words', [])
        
        if model is None:
            return jsonify({'error': 'No model loaded'}), 400
        
        if len(mixed_vector) == 0:
            return jsonify({'error': 'No vector provided'}), 400
        
        # Validate vector dimensions
        if len(mixed_vector) != model.dimensions:
            return jsonify({'error': f'Vector dimension mismatch. Expected {model.dimensions}, got {len(mixed_vector)}'}), 400
        
        # Get neighbors with error handling
        try:
            neighbors = model.nearest(mixed_vector, topn=topn * 3, exclude=set(exclude_words))
        except Exception as e:
            return jsonify({'error': f'Failed to find neighbors: {str(e)}'}), 500
        
        if not neighbors:
            return jsonify({
                'neighbors': [],
                'count': 0,
                'message': 'No neighbors found'
            })
        
        # Apply filters
        if filters.get('suppress_proper_nouns', False):
            neighbors = filter_proper_nouns(neighbors, topn)
        
        if filters.get('suppress_conjugations', False):
            neighbors = filter_conjugations_plurals(neighbors, topn)
        
        # Limit to requested count
        neighbors = neighbors[:topn]
        
        # Convert to list of dicts for JSON serialization
        results = [{'word': word, 'similarity': float(score)} for word, score in neighbors]
        
        return jsonify({
            'neighbors': results,
            'count': len(results)
        })
        
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@app.route('/api/visualization/3d', methods=['POST'])
def get_3d_visualization():
    """Get 3D coordinates for words using UMAP."""
    data = request.get_json()
    base_word = data.get('base_word', '').strip()
    mixed_vector = data.get('mixed_vector')  # Optional
    rebuild = data.get('rebuild', False)
    
    if model is None:
        return jsonify({'error': 'No model loaded'}), 400
    
    if base_word not in model.vocab:
        return jsonify({'error': f'Word "{base_word}" not in vocabulary'}), 400
    
    # Build local vocabulary - now returns ALL unique neighbors found
    local_words = model.local_vocab([base_word], NEIGHBORHOOD_SIZE)
    
    if len(local_words) < 10:
        # Fallback: use just the base word and its nearest neighbors
        neighbors = model.nearest(model.model[base_word], topn=200)
        local_words = [word for word, _ in neighbors]
    
    # Debug: Check which words are actually in vocabulary
    print(f"Local words found: {len(local_words)}")
    vocab_check = [(word, word in model.vocab) for word in local_words[:10]]
    print(f"First 10 words vocab check: {vocab_check}")
    
    # Use ALL words from local vocabulary that exist in the model
    vectors = []
    word_labels = []
    
    for word in local_words:
        if word in model.vocab:
            vectors.append(model.model[word])
            word_labels.append(word)
    
    print(f"Final vocabulary size for 3D visualization: {len(word_labels)}")
    
    
    if not vectors:
        return jsonify({'error': 'No valid vectors found'}), 400
    
    X = np.array(vectors)
    
    # Add mixed vector if provided
    if mixed_vector is not None:
        mixed_array = np.array(mixed_vector)
        X = np.vstack([X, mixed_array.reshape(1, -1)])
        word_labels.append("🎯 CURRENT MIX")
    
    # Compute UMAP embedding with threading fixes
    reducer = umap.UMAP(
        n_components=3,
        n_neighbors=UMAP_N_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        metric=UMAP_METRIC,
        random_state=42,
        n_jobs=1,  # Force single-threaded to avoid threading issues
        verbose=False
    )
    
    embedding_3d = reducer.fit_transform(X)
    
    # Convert to list format for JSON
    points = []
    for i, (x, y, z) in enumerate(embedding_3d):
        word = word_labels[i]
        points.append({
            'x': float(x),
            'y': float(y),
            'z': float(z),
            'word': word,
            'is_mix': word == "🎯 CURRENT MIX",
            'is_base': word == base_word
        })
    
    return jsonify({
        'points': points,
        'word_count': len(local_words),
        'base_word': base_word
    })

@app.route('/api/visualization/3d/progressive', methods=['POST'])
def get_3d_visualization_progressive():
    """Get 3D coordinates for words progressively - returns words in batches."""
    global visualization_cache
    
    data = request.get_json()
    base_word = data.get('base_word', '').strip()
    mixed_vector = data.get('mixed_vector')  # Optional
    batch_size = data.get('batch_size', 20)  # Number of words per batch
    batch_number = data.get('batch_number', 0)  # Which batch to return
    use_fast_positioning = data.get('use_fast_positioning', True)  # Use fast positioning instead of UMAP
    neighbor_words = data.get('neighbor_words', [])  # List of words that are nearest neighbors
    
    if model is None:
        return jsonify({'error': 'No model loaded'}), 400
    
    if base_word not in model.vocab:
        return jsonify({'error': f'Word "{base_word}" not in vocabulary'}), 400
    
    # Create cache key (include neighbor words to invalidate cache when neighbors change)
    neighbor_key = "_".join(sorted(neighbor_words)) if neighbor_words else "no_neighbors"
    cache_key = f"{model_choice}_{base_word}_{neighbor_key}"
    
    # Debug: Log cache key and neighbor words
    print(f"DEBUG: Cache key: {cache_key}")
    print(f"DEBUG: Neighbor words: {neighbor_words}")
    print(f"DEBUG: Base word: {base_word}")
    
    # Check if we have cached UMAP coordinates for this base word
    if cache_key not in visualization_cache:
        # Build local vocabulary
        local_words = model.local_vocab([base_word], NEIGHBORHOOD_SIZE)
        
        if len(local_words) < 10:
            # Fallback: use just the base word and its nearest neighbors
            neighbors = model.nearest(model.model[base_word], topn=200)
            local_words = [word for word, _ in neighbors]
        
        # Ensure neighbor words are included in the visualization
        if neighbor_words:
            for neighbor_word in neighbor_words:
                if neighbor_word in model.vocab and neighbor_word not in local_words:
                    local_words.append(neighbor_word)
        
        # Filter to only words that exist in vocabulary
        valid_words = [word for word in local_words if word in model.vocab]
        
        if not valid_words:
            return jsonify({'error': 'No valid words found'}), 400
        
        # Get vectors for all words
        vectors = []
        word_labels = []
        
        for word in valid_words:
            if word in model.vocab:
                vectors.append(model.model[word])
                word_labels.append(word)
        
        if not vectors:
            return jsonify({'error': 'No valid vectors found'}), 400
        
        X = np.array(vectors)
        
        # Add mixed vector if provided (only for first batch)
        if mixed_vector is not None and batch_number == 0:
            mixed_array = np.array(mixed_vector)
            X = np.vstack([X, mixed_array.reshape(1, -1)])
            word_labels.append("🎯 CURRENT MIX")
        
        # Compute UMAP embedding with threading fixes
        reducer = umap.UMAP(
            n_components=3,
            n_neighbors=UMAP_N_NEIGHBORS,
            min_dist=UMAP_MIN_DIST,
            metric=UMAP_METRIC,
            random_state=42,
            n_jobs=1,  # Force single-threaded to avoid threading issues
            verbose=False
        )
        
        embedding_3d = reducer.fit_transform(X)
        
        # Convert to list format and cache
        all_points = []
        
        # Find the base word's position to center it at origin
        base_word_index = None
        base_word_position = None
        for i, word in enumerate(word_labels):
            if word == base_word:
                base_word_index = i
                base_word_position = embedding_3d[i]
                break
        
        # Center the base word at origin (0,0,0) and adjust all other points relative to it
        if base_word_position is not None:
            base_x, base_y, base_z = base_word_position
            print(f"DEBUG: Centering base word '{base_word}' at origin, was at ({base_x:.3f}, {base_y:.3f}, {base_z:.3f})")
        else:
            base_x, base_y, base_z = 0, 0, 0
            print(f"DEBUG: Warning - base word '{base_word}' not found in embedding!")
        
        for i, (x, y, z) in enumerate(embedding_3d):
            word = word_labels[i]
            # Center all points relative to the base word
            centered_x = float(x - base_x)
            centered_y = float(y - base_y)
            centered_z = float(z - base_z)
            
            all_points.append({
                'x': centered_x,
                'y': centered_y,
                'z': centered_z,
                'word': word,
                'is_mix': word == "🎯 CURRENT MIX",
                'is_base': word == base_word,
                'is_neighbor': word in neighbor_words
            })
        
        # Cache the computed points
        visualization_cache[cache_key] = {
            'points': all_points,
            'word_count': len(valid_words)
        }
    
    # Get cached data
    cached_data = visualization_cache[cache_key]
    all_points = cached_data['points']
    total_word_count = cached_data['word_count']
    
    # Calculate batch boundaries for the cached points
    start_idx = batch_number * batch_size
    end_idx = min(start_idx + batch_size, len(all_points))
    
    if start_idx >= len(all_points):
        return jsonify({
            'points': [],
            'word_count': total_word_count,
            'base_word': base_word,
            'batch_number': batch_number,
            'total_batches': (len(all_points) + batch_size - 1) // batch_size,
            'is_complete': True
        })
    
    # Get points for this batch
    batch_points = all_points[start_idx:end_idx]
    
    # For the first batch, prioritize the base word
    if batch_number == 0:
        # Find the base word point and put it first
        base_word_point = None
        other_points = []
        
        for point in batch_points:
            if point['is_base']:
                base_word_point = point
            else:
                other_points.append(point)
        
        # Reorder: base word first, then others
        if base_word_point:
            batch_points = [base_word_point] + other_points
    
    total_batches = (len(all_points) + batch_size - 1) // batch_size
    is_complete = batch_number >= total_batches - 1
    
    return jsonify({
        'points': batch_points,
        'word_count': total_word_count,
        'base_word': base_word,
        'batch_number': batch_number,
        'total_batches': total_batches,
        'is_complete': is_complete
    })

@app.route('/api/cache/info')
def cache_info():
    """Get cache information."""
    return jsonify({
        'cache_size': len(visualization_cache),
        'cached_words': list(visualization_cache.keys())
    })

@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear the visualization cache."""
    global visualization_cache
    visualization_cache.clear()
    return jsonify({'message': 'Cache cleared successfully'})

@app.route('/api/cache/clear_base_word', methods=['POST'])
def clear_cache_for_base_word():
    """Clear cache entries for a specific base word"""
    global visualization_cache
    data = request.get_json()
    base_word = data.get('base_word')
    
    if not base_word:
        return jsonify({'error': 'base_word is required'}), 400
    
    # Remove all cache entries that start with the base word
    keys_to_remove = [key for key in visualization_cache.keys() if key.startswith(f"{model_choice}_{base_word}_")]
    
    for key in keys_to_remove:
        del visualization_cache[key]
    
    return jsonify({
        'message': f'Cleared {len(keys_to_remove)} cache entries for base word "{base_word}"',
        'removed_keys': keys_to_remove
    })

if __name__ == '__main__':
    # Try to load default model on startup (optional)
    print("Starting Word Synthesizer...")
    print("Loading default model (this may take a moment)...")
    success, error = load_model("GoogleNews")
    if success:
        print("✅ Model loaded successfully!")
    else:
        print(f"⚠️  Could not load default model: {error}")
        print("You can load a model through the web interface.")
    
    print("🚀 Starting Flask server on http://localhost:5801")
    app.run(debug=True, host='0.0.0.0', port=5801)
