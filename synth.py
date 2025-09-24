"""
Word Synthesizer model for mixing word embeddings and finding nearest neighbors.

This module provides the SynthModel class that handles loading embeddings,
performing weighted vector arithmetic, and finding nearest neighbors with
optional FAISS acceleration.
"""

import numpy as np
from typing import List, Tuple, Optional, Set, Iterable
from gensim.models import KeyedVectors
import os

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

from settings import EMBEDDINGS_PATH, IS_BINARY, TOPN_DEFAULT, NEIGHBORHOOD_SIZE


class SynthModel:
    """
    Main model class for word embedding synthesis and nearest neighbor search.
    
    Supports loading word2vec/GloVe/fastText embeddings and provides methods
    for weighted vector mixing and similarity search with optional FAISS acceleration.
    """
    
    def __init__(self, embeddings_path: str = None, binary: bool = None):
        """
        Initialize the model with embeddings.
        
        Args:
            embeddings_path: Path to embedding file (defaults to settings)
            binary: Whether file is binary format (defaults to settings)
        """
        self.embeddings_path = embeddings_path or EMBEDDINGS_PATH
        self.binary = binary if binary is not None else IS_BINARY
        
        # Model components
        self.model = None
        self.normalized_vectors = None
        self.vocab = None
        self.faiss_index = None
        
        # Model metadata
        self.model_name = os.path.basename(self.embeddings_path)
        self.vocab_size = 0
        self.dimensions = 0
        self.faiss_enabled = False
        
        self._load_model()
        self._build_faiss()
    
    def _load_model(self):
        """Load the embedding model and prepare normalized vectors."""
        if not os.path.exists(self.embeddings_path):
            raise FileNotFoundError(
                f"Embeddings file not found: {self.embeddings_path}\n"
                f"Please download embeddings and update EMBEDDINGS_PATH in settings.py"
            )
        
        print(f"Loading embeddings from {self.embeddings_path}...")
        
        # Check if it's a GloVe file (ends with .txt and not .word2vec.txt)
        if self.embeddings_path.endswith('.txt') and not self.embeddings_path.endswith('.word2vec.txt'):
            # Load GloVe format
            self.model = self._load_glove_format()
        else:
            # Load word2vec format
            self.model = KeyedVectors.load_word2vec_format(
                self.embeddings_path, 
                binary=self.binary
            )
        
        # Cache model properties
        self.vocab_size = len(self.model)
        self.dimensions = self.model.vector_size
        self.vocab = set(self.model.key_to_index.keys())
        
        # Pre-normalize all vectors for cosine similarity
        print("Normalizing vectors for cosine similarity...")
        vectors = self.model.vectors
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        self.normalized_vectors = vectors / norms
        
        print(f"Loaded {self.vocab_size:,} words with {self.dimensions} dimensions")
    
    def _load_glove_format(self):
        """Load GloVe format embeddings."""
        import numpy as np
        
        print("Loading GloVe format...")
        vectors = []
        words = []
        
        with open(self.embeddings_path, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) < 2:
                    continue
                
                word = parts[0]
                vector = [float(x) for x in parts[1:]]
                words.append(word)
                vectors.append(vector)
        
        # Create KeyedVectors object
        from gensim.models import KeyedVectors
        model = KeyedVectors(vector_size=len(vectors[0]))
        
        # Add vectors
        model.add_vectors(words, np.array(vectors))
        
        return model
    
    def _build_faiss(self):
        """Build FAISS index for accelerated nearest neighbor search."""
        if not FAISS_AVAILABLE:
            print("FAISS not available - using gensim fallback")
            return
        
        try:
            print("Building FAISS index for fast similarity search...")
            # Use Inner Product on normalized vectors (equivalent to cosine similarity)
            self.faiss_index = faiss.IndexFlatIP(self.dimensions)
            self.faiss_index.add(self.normalized_vectors.astype('float32'))
            self.faiss_enabled = True
            print("FAISS index built successfully")
        except Exception as e:
            print(f"Failed to build FAISS index: {e}")
            print("Falling back to gensim")
            self.faiss_enabled = False
    
    def mix(self, weighted_words: Iterable[Tuple[str, float]]) -> Optional[np.ndarray]:
        """
        Compute weighted sum of word vectors and return normalized result.
        
        Args:
            weighted_words: Iterable of (word, weight) tuples
            
        Returns:
            Normalized vector or None if no valid words provided
        """
        result = np.zeros(self.dimensions)
        valid_words = []
        
        for word, weight in weighted_words:
            if word in self.vocab and abs(weight) > 1e-8:  # Skip zero weights
                result += weight * self.model[word]
                valid_words.append((word, weight))
        
        if not valid_words:
            return None
        
        # L2 normalize the result
        norm = np.linalg.norm(result)
        if norm > 1e-8:
            return result / norm
        else:
            return None
    
    def nearest(self, vector: np.ndarray, topn: int = None, 
                exclude: Optional[Set[str]] = None) -> List[Tuple[str, float]]:
        """
        Find nearest neighbors to a vector.
        
        Args:
            vector: Query vector (should be normalized)
            topn: Number of neighbors to return
            exclude: Set of words to exclude from results
            
        Returns:
            List of (word, similarity_score) tuples
        """
        if topn is None:
            topn = TOPN_DEFAULT
        
        if exclude is None:
            exclude = set()
        
        if self.faiss_enabled and self.faiss_index is not None:
            return self._nearest_faiss(vector, topn, exclude)
        else:
            return self._nearest_gensim(vector, topn, exclude)
    
    def _nearest_faiss(self, vector: np.ndarray, topn: int, 
                      exclude: Set[str]) -> List[Tuple[str, float]]:
        """Find nearest neighbors using FAISS."""
        # Ensure vector is normalized
        vector = self.unit(vector)
        
        # Search for more results to account for exclusions
        search_k = min(topn * 3, self.vocab_size)
        scores, indices = self.faiss_index.search(
            vector.reshape(1, -1).astype('float32'), 
            search_k
        )
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            word = self.model.index_to_key[idx]
            if word not in exclude:
                results.append((word, float(score)))
                if len(results) >= topn:
                    break
        
        return results
    
    def _nearest_gensim(self, vector: np.ndarray, topn: int, 
                       exclude: Set[str]) -> List[Tuple[str, float]]:
        """Find nearest neighbors using gensim fallback."""
        # Gensim expects the vector to be in the model's vocabulary
        # We'll use most_similar with a temporary vector
        try:
            # Create a temporary key for the vector
            temp_key = "__temp_vector__"
            self.model.add_vector(temp_key, vector)
            
            # Get similarities
            similarities = self.model.most_similar(
                positive=[temp_key], 
                topn=topn * 2  # Get more to account for exclusions
            )
            
            # Remove temporary vector
            self.model.pop(temp_key)
            
            # Filter exclusions
            results = []
            for word, score in similarities:
                if word not in exclude:
                    results.append((word, score))
                    if len(results) >= topn:
                        break
            
            return results
            
        except Exception as e:
            print(f"Gensim similarity search failed: {e}")
            return []
    
    def local_vocab(self, anchors: List[str], k: int = None) -> List[str]:
        """
        Build a local vocabulary around anchor words.
        
        Args:
            anchors: List of anchor words
            k: Size of vocabulary to build
            
        Returns:
            List of unique words in the local neighborhood
        """
        if k is None:
            k = NEIGHBORHOOD_SIZE
        
        # Get neighbors for each anchor
        all_neighbors = set()
        for anchor in anchors:
            if anchor in self.vocab:
                neighbors = self.nearest(self.model[anchor], topn=k//len(anchors))
                all_neighbors.update([word for word, _ in neighbors])
        
        # Add anchors themselves
        all_neighbors.update(anchors)
        
        # Convert to list and limit size
        vocab_list = list(all_neighbors)[:k]
        return vocab_list
    
    def directions_from_pairs(self, pairs: List[Tuple[str, str]]) -> np.ndarray:
        """
        Compute direction vector from word pairs.
        
        Args:
            pairs: List of (word1, word2) tuples representing directions
            
        Returns:
            Normalized direction vector
        """
        direction = np.zeros(self.dimensions)
        valid_pairs = 0
        
        for word1, word2 in pairs:
            if word1 in self.vocab and word2 in self.vocab:
                direction += self.model[word1] - self.model[word2]
                valid_pairs += 1
        
        if valid_pairs == 0:
            return np.zeros(self.dimensions)
        
        # Average and normalize
        direction /= valid_pairs
        return self.unit(direction)
    
    @staticmethod
    def unit(vector: np.ndarray) -> np.ndarray:
        """Return unit vector (L2 normalized)."""
        norm = np.linalg.norm(vector)
        if norm > 1e-8:
            return vector / norm
        else:
            return vector
    
    def get_basis_candidates(self, base_word: str, count: int = 10) -> List[str]:
        """
        Get candidate basis words from nearest neighbors of base word.
        
        Args:
            base_word: Base word to find neighbors for
            count: Number of candidates to return
            
        Returns:
            List of candidate basis words
        """
        if base_word not in self.vocab:
            return []
        
        neighbors = self.nearest(self.model[base_word], topn=count * 2)
        candidates = []
        
        for word, _ in neighbors:
            if word != base_word and word not in candidates:
                candidates.append(word)
                if len(candidates) >= count:
                    break
        
        return candidates
    
    def get_model_info(self) -> dict:
        """Get model metadata for display."""
        return {
            'name': self.model_name,
            'vocab_size': self.vocab_size,
            'dimensions': self.dimensions,
            'faiss_enabled': self.faiss_enabled,
            'path': self.embeddings_path
        }
