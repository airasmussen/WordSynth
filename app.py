"""
Word Synthesizer Streamlit App - RESULTS AT TOP (FIXED)

Interactive web interface for mixing word embeddings with results displayed at the top.
"""

import streamlit as st
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from typing import List, Tuple
import umap

from synth import SynthModel
from settings import (
    TOPN_DEFAULT, NEIGHBORHOOD_SIZE, BASIS_WORD_COUNT,
    SLIDER_MIN, SLIDER_MAX, SLIDER_STEP,
    UMAP_N_NEIGHBORS, UMAP_MIN_DIST, UMAP_METRIC
)

def get_random_direction_words(model, word: str, weirdness: float) -> Tuple[str, str, str]:
    """Get random words in different directions from a given word."""
    if word not in model.vocab:
        return "N/A", "N/A", "N/A"
    
    # Get the word's vector (already normalized)
    word_vector = model.model[word]
    
    # Use different seeds for each direction to ensure variety
    base_seed = hash(word) % 2**32
    
    # Neighbor: close random direction
    np.random.seed(base_seed)
    neighbor_dir = np.random.randn(model.dimensions)
    neighbor_dir = neighbor_dir / np.linalg.norm(neighbor_dir)
    
    # Local: medium random direction  
    np.random.seed(base_seed + 1000)
    local_dir = np.random.randn(model.dimensions)
    local_dir = local_dir / np.linalg.norm(local_dir)
    
    # Weirdo: far random direction
    np.random.seed(base_seed + 2000)
    weirdo_dir = np.random.randn(model.dimensions)
    weirdo_dir = weirdo_dir / np.linalg.norm(weirdo_dir)
    
    # Create new vectors by moving in random directions
    # Use exponential scaling for truly weird results
    neighbor_vector = word_vector + neighbor_dir * (1.0 * weirdness)
    local_vector = word_vector + local_dir * (2.0 * weirdness)
    weirdo_vector = word_vector + weirdo_dir * (4.0 * (weirdness ** 2))  # Quadratic scaling for weirdo
    
    # Normalize the new vectors
    neighbor_vector = neighbor_vector / np.linalg.norm(neighbor_vector)
    local_vector = local_vector / np.linalg.norm(local_vector)
    weirdo_vector = weirdo_vector / np.linalg.norm(weirdo_vector)
    
    # Find nearest neighbors for each, excluding the original word
    try:
        neighbor_word = model.nearest(neighbor_vector, topn=10, exclude={word})[0][0]
        local_word = model.nearest(local_vector, topn=10, exclude={word})[0][0]
        weirdo_word = model.nearest(weirdo_vector, topn=10, exclude={word})[0][0]
        return neighbor_word, local_word, weirdo_word
    except:
        return "N/A", "N/A", "N/A"

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

# Page configuration
st.set_page_config(
    page_title="Word Synthesizer",
    page_icon="🔤",
    layout="wide",
    initial_sidebar_state="expanded"
)


@st.cache_resource
def load_model(model_choice):
    """Load the word embedding model with caching."""
    try:
        if model_choice == "GoogleNews":
            # Load GoogleNews model
            model = SynthModel("GoogleNews-vectors-negative300.bin", binary=True)
        elif model_choice == "GloVe":
            # Try to load GloVe model (native format)
            model = SynthModel("glove.6B.300d.txt", binary=False)
        else:
            return None, f"Unknown model choice: {model_choice}"
        return model, None
    except FileNotFoundError as e:
        if model_choice == "GoogleNews":
            return None, f"GoogleNews model not found: {str(e)}\n\nTo use GoogleNews:\n1. Download GoogleNews-vectors-negative300.bin\n2. Place in this directory"
        elif model_choice == "GloVe":
            return None, f"GloVe model not found: {str(e)}\n\nTo use GloVe:\n1. Download: wget https://nlp.stanford.edu/data/glove.6B.zip\n2. Extract: unzip glove.6B.zip\n3. Place 'glove.6B.300d.txt' in this directory"
        else:
            return None, f"Model not found: {str(e)}"
    except Exception as e:
        return None, f"Error loading model: {str(e)}"

def main():
    """Main application function."""
    
    # Sidebar controls
    with st.sidebar:
        st.header("🎛️ Controls")
        
        # Model selection
        st.subheader("📚 Model")
        model_choice = st.selectbox(
            "Embedding Model",
            options=["GoogleNews", "GloVe"],
            index=0,
            help="Choose which embedding model to use"
        )
    
    # Load model based on selection
    model, error = load_model(model_choice)
    
    if model is None:
        st.error("❌ Model Loading Failed")
        st.markdown(f'<div class="warning-box">{error}</div>', unsafe_allow_html=True)
        return
    
    # Show current model info
    model_info = model.get_model_info()
    st.info(f"📚 Using: **{model_choice}** ({model_info['vocab_size']:,} words, {model_info['dimensions']}D, FAISS: {'✅' if model_info['faiss_enabled'] else '❌'})")
    
    # Continue with sidebar controls
    with st.sidebar:
        base_word = st.text_input(
            "Base Word", 
            value="king", 
            help="Enter a word to start with"
        ).lower().strip()
        
        neighbor_count = st.slider(
            "Neighbors to Show", 
            min_value=5, 
            max_value=50, 
            value=8,
            help="Number of nearest neighbors to display"
        )
        
        basis_count = st.slider(
            "Basis Words", 
            min_value=3, 
            max_value=15, 
            value=BASIS_WORD_COUNT,
            help="Number of basis words for mixing"
        )
        
        show_3d = st.checkbox("3D Neighborhood View", value=False)
        
        st.subheader("🔍 Filters")
        suppress_proper_nouns = st.checkbox(
            "Suppress Names & Websites", 
            value=True,
            help="Filter out personal names, company names, and websites"
        )
        
        suppress_mixer_words = st.checkbox(
            "Suppress Base & Mixer Words", 
            value=True,
            help="Exclude base word and mixer words with non-zero weights from results"
        )
        
        look_around = st.checkbox(
            "Look Around", 
            value=False,
            help="Show Neighbor, Local, and Weirdo columns (computationally expensive)"
        )
        
        # Weirdness slider (only show when Look Around is checked)
        if look_around:
            weirdness = st.slider(
                "Weirdness", 
                min_value=0.1, 
                max_value=2.0, 
                value=1.0,
                step=0.1,
                help="Controls how far away neighbor, local, and weirdo words are from each result"
            )
        else:
            weirdness = 1.0  # Default value when not shown
        
        if show_3d:
            rebuild_3d = st.button("🔄 Rebuild 3D Neighborhood", type="secondary")
        else:
            rebuild_3d = False
    
    # Check if base word is in vocabulary
    if base_word and base_word not in model.vocab:
        st.warning(f"⚠️ Word '{base_word}' not found in vocabulary. Try a different word.")
        return
    
    if not base_word:
        st.info("👆 Enter a base word in the sidebar to get started!")
        return
    
    # Get basis word candidates
    basis_candidates = model.get_basis_candidates(base_word, basis_count)
    
    # Special case: Add "man" and "woman" for "king" to test gender arithmetic
    if base_word == "king":
        gender_words = ["man", "woman"]
        for word in gender_words:
            if word in model.vocab and word not in basis_candidates:
                basis_candidates.insert(0, word)
    
    # Set the last 4 words to static values: masculine, feminine, good, bad
    static_words = ["masculine", "feminine", "good", "bad"]
    for i, word in enumerate(static_words):
        if word in model.vocab:
            # Ensure we have enough slots, extend if necessary
            while len(basis_candidates) < basis_count:
                basis_candidates.append("")
            
            # Set the last 4 positions to static words
            position = basis_count - 4 + i
            if position < len(basis_candidates):
                basis_candidates[position] = word
    
    # Ensure we don't exceed the basis count
    basis_candidates = basis_candidates[:basis_count]
    
    if not basis_candidates:
        st.warning(f"⚠️ No basis words found for '{base_word}'")
        return
    
    # Reserve space for results at the top
    results_container = st.empty()
    
    # Create sliders for base word and basis words
    weights = {}
    
    # Base word slider
    weights[base_word] = st.slider(
        f"**{base_word}** (base)",
        min_value=SLIDER_MIN,
        max_value=SLIDER_MAX,
        value=1.0,
        step=SLIDER_STEP,
        help=f"Weight for base word '{base_word}'"
    )
    
    # Basis word sliders with editable words - COMPACT LAYOUT
    st.markdown("### 🎚️ Mixing Board")
    
    # Create columns for compact mixing board
    num_cols = min(4, len(basis_candidates))  # Max 4 columns
    cols = st.columns(num_cols)
    
    for i, word in enumerate(basis_candidates):
        col_idx = i % num_cols
        with cols[col_idx]:
            # Check if the word is valid for the label
            is_valid = word in model.vocab if word else False
            label = f"Word {i+1} ❌" if not is_valid else f"Word {i+1}"
            
            # Editable word input
            edited_word = st.text_input(
                label,
                value=word,
                key=f"word_{i}",
                help="Edit this word (must be in vocabulary)"
            ).lower().strip()
            
            if edited_word and edited_word not in model.vocab:
                st.error(f"'{edited_word}' not in vocabulary")
                edited_word = word
            elif not edited_word:
                edited_word = word
            
            basis_candidates[i] = edited_word
            
            # Weight slider
            current_weight = weights.get(edited_word, 0.0)
            
            weights[edited_word] = st.slider(
                f"**{edited_word}**",
                min_value=SLIDER_MIN,
                max_value=SLIDER_MAX,
                value=current_weight,
                step=SLIDER_STEP,
                key=f"slider_{i}",
                help=f"Weight for basis word '{edited_word}'"
            )
    
    # Compute mixed vector
    weighted_words = [(word, weight) for word, weight in weights.items()]
    mixed_vector = model.mix(weighted_words)
    
    # Check if we have any non-zero weights
    has_nonzero_weights = any(abs(weight) > 1e-6 for weight in weights.values())
    
    # Display results in the reserved container at the top
    with results_container.container():
        st.markdown("### 🎯 Nearest Neighbors")
        
        if mixed_vector is not None and has_nonzero_weights:
            neighbors = model.nearest(mixed_vector, topn=neighbor_count * 3)  # Get more to account for exclusions
            
            # Apply mixer word suppression if enabled
            if suppress_mixer_words:
                # Exclude base word and mixer words with non-zero weights from results
                exclude_words = {base_word}  # Always exclude base word
                for word in basis_candidates:
                    if word in model.vocab and abs(weights.get(word, 0.0)) > 1e-6:
                        exclude_words.add(word)
                
                # Filter out excluded words
                filtered_neighbors = []
                for word, score in neighbors:
                    if word not in exclude_words:
                        filtered_neighbors.append((word, score))
                    if len(filtered_neighbors) >= neighbor_count:
                        break
            else:
                # Don't suppress mixer words - use all neighbors
                filtered_neighbors = neighbors[:neighbor_count]
            
            if suppress_proper_nouns:
                filtered_neighbors = filter_proper_nouns(filtered_neighbors, neighbor_count)
            
            if filtered_neighbors:
                # Create the basic dataframe
                df = pd.DataFrame(filtered_neighbors, columns=['Word', 'Similarity'])
                df['Similarity'] = df['Similarity'].round(3)
                
                # Add the new columns only if "Look Around" is enabled
                if look_around:
                    neighbor_words = []
                    local_words = []
                    weirdo_words = []
                    
                    for word, _ in filtered_neighbors:
                        neighbor, local, weirdo = get_random_direction_words(model, word, weirdness)
                        neighbor_words.append(neighbor)
                        local_words.append(local)
                        weirdo_words.append(weirdo)
                    
                    df['Neighbor'] = neighbor_words
                    df['Local'] = local_words
                    df['Weirdo'] = weirdo_words
                    
                    # Reorder columns
                    df = df[['Word', 'Similarity', 'Neighbor', 'Local', 'Weirdo']]
                else:
                    # Just show basic columns
                    df = df[['Word', 'Similarity']]
                
                df.index = range(1, len(df) + 1)
                
                st.dataframe(df, use_container_width=True)
                
                csv_data = df.to_csv(index=False)
                st.download_button(
                    label="📋 Copy Results as CSV",
                    data=csv_data,
                    file_name=f"neighbors_{base_word}.csv",
                    mime="text/csv"
                )
            else:
                st.info("No neighbors found. Try adjusting the weights.")
        elif not has_nonzero_weights:
            st.info("👆 Set some non-zero weights using the sliders to see results!")
        else:
            st.info("No valid words with non-zero weights. Adjust the sliders above.")
    
    # 3D Visualization
    if show_3d:
        st.markdown("### 🌐 3D Neighborhood")
        
        if 'local_words' not in st.session_state or rebuild_3d or st.session_state.get('base_word') != base_word:
            with st.spinner("Building 3D neighborhood..."):
                anchors = [base_word] + basis_candidates[:5]
                local_words = model.local_vocab(anchors, NEIGHBORHOOD_SIZE)
                
                st.session_state['local_words'] = local_words
                st.session_state['base_word'] = base_word
                st.session_state['umap_embedding'] = None
        
        local_words = st.session_state['local_words']
        
        if len(local_words) < 10:
            st.warning("Not enough words in local neighborhood for 3D visualization")
            return
        
        vectors = []
        word_labels = []
        
        for word in local_words:
            if word in model.vocab:
                vectors.append(model.normalized_vectors[model.model.key_to_index[word]])
                word_labels.append(word)
        
        if not vectors:
            st.warning("No valid vectors found for 3D visualization")
            return
        
        X = np.array(vectors)
        
        if mixed_vector is not None:
            X = np.vstack([X, mixed_vector.reshape(1, -1)])
            word_labels.append("🎯 CURRENT MIX")
        
        # Create a hash of the current word mix to detect changes
        current_mix_hash = hash(tuple(sorted(weights.items())))
        
        if (st.session_state.get('umap_embedding') is None or 
            rebuild_3d or 
            st.session_state.get('last_mix_hash') != current_mix_hash):
            
            with st.spinner("Computing 3D embedding..."):
                reducer = umap.UMAP(
                    n_components=3,
                    n_neighbors=UMAP_N_NEIGHBORS,
                    min_dist=UMAP_MIN_DIST,
                    metric=UMAP_METRIC,
                    random_state=42
                )
                embedding_3d = reducer.fit_transform(X)
                st.session_state['umap_embedding'] = embedding_3d
                st.session_state['last_mix_hash'] = current_mix_hash
        
        embedding_3d = st.session_state['umap_embedding']
        
        fig = go.Figure()
        
        regular_points = embedding_3d[:-1] if mixed_vector is not None else embedding_3d
        regular_labels = word_labels[:-1] if mixed_vector is not None else word_labels
        
        fig.add_trace(go.Scatter3d(
            x=regular_points[:, 0],
            y=regular_points[:, 1],
            z=regular_points[:, 2],
            mode='markers',
            marker=dict(
                size=4,
                color='lightblue',
                opacity=0.6
            ),
            text=regular_labels,
            hovertemplate='<b>%{text}</b><extra></extra>',
            name='Words'
        ))
        
        if mixed_vector is not None:
            mix_point = embedding_3d[-1]
            fig.add_trace(go.Scatter3d(
                x=[mix_point[0]],
                y=[mix_point[1]],
                z=[mix_point[2]],
                mode='markers',
                marker=dict(
                    size=12,
                    color='red',
                    symbol='diamond',
                    opacity=0.9
                ),
                text=["🎯 CURRENT MIX"],
                hovertemplate='<b>%{text}</b><extra></extra>',
                name='Current Mix'
            ))
        
        fig.update_layout(
            title="3D Semantic Neighborhood",
            scene=dict(
                xaxis_title="UMAP 1",
                yaxis_title="UMAP 2",
                zaxis_title="UMAP 3"
            ),
            width=800,
            height=600,
            showlegend=True
        )
        
        st.plotly_chart(fig, use_container_width=True)
        
        st.info(f"Showing {len(local_words)} words in 3D space. Red diamond shows current mix position.")
    
    # License information at the bottom
    st.markdown("---")
    st.markdown("### 📄 License Information")
    
    st.markdown("""
    **GoogleNews Word2Vec:**
    - Source: Google News corpus
    - License: Free for research and commercial use
    - Citation: Mikolov, T., et al. (2013). "Efficient Estimation of Word Representations in Vector Space"
    
    **GloVe:**
    - Source: Stanford NLP Group
    - License: Apache 2.0
    - Citation: Pennington, J., et al. (2014). "GloVe: Global Vectors for Word Representation"
    - Download: https://nlp.stanford.edu/projects/glove/
    """)

if __name__ == "__main__":
    main()
