#!/usr/bin/env python3
"""
Debug script to test the model directly.
"""

import os
# Set threading environment variables BEFORE importing anything else
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['NUMBA_THREADING_LAYER'] = 'omp'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'

from synth import SynthModel

def test_model():
    print("Loading model...")
    model = SynthModel("GoogleNews-vectors-negative300.bin", binary=True)
    
    print(f"Model loaded: {model.vocab_size} words, {model.dimensions} dimensions")
    print(f"FAISS enabled: {model.faiss_enabled}")
    
    # Test word existence
    test_words = ["king", "kin", "queen", "man", "woman"]
    for word in test_words:
        exists = word in model.vocab
        print(f"'{word}' in vocab: {exists}")
    
    # Test local_vocab function
    print("\nTesting local_vocab function:")
    try:
        local_words = model.local_vocab(["kin"], 500)
        print(f"Local vocab size: {len(local_words)}")
        print(f"First 10 words: {local_words[:10]}")
    except Exception as e:
        print(f"Error in local_vocab: {e}")
        import traceback
        traceback.print_exc()
    
    # Test nearest function
    print("\nTesting nearest function:")
    try:
        if "kin" in model.vocab:
            neighbors = model.nearest(model.model["kin"], topn=10)
            print(f"Found {len(neighbors)} neighbors for 'kin'")
            print(f"First 5 neighbors: {neighbors[:5]}")
        else:
            print("'kin' not in vocab")
    except Exception as e:
        print(f"Error in nearest: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_model()


