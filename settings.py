"""
Configuration settings for Word Synthesizer app.

To use different embedding models:
1. GoogleNews word2vec (binary): Set EMBEDDINGS_PATH to "GoogleNews-vectors-negative300.bin" and IS_BINARY=True
2. GloVe (text): Convert GloVe to word2vec format first, then set IS_BINARY=False
3. fastText (text): Set EMBEDDINGS_PATH to your .vec file and IS_BINARY=False
"""

# Embedding model configuration
EMBEDDINGS_PATH = "GoogleNews-vectors-negative300.bin"  # Path to your embedding file
IS_BINARY = True  # True for .bin files, False for .txt/.vec files

# UI and performance settings
TOPN_DEFAULT = 25  # Default number of nearest neighbors to show
NEIGHBORHOOD_SIZE = 1500  # Size of local vocabulary for 3D visualization
BASIS_WORD_COUNT = 8  # Number of basis words to suggest from neighbors

# UMAP parameters for 3D visualization
UMAP_N_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
UMAP_METRIC = "cosine"

# Slider settings
SLIDER_MIN = -2.0
SLIDER_MAX = 2.0
SLIDER_STEP = 0.05


