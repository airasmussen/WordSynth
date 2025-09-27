/**
 * API Client for Word Synthesizer
 * Handles all communication with the Flask backend
 */

class WordSynthAPI {
    constructor() {
        this.baseURL = '';
        this.model = null;
        this.modelInfo = null;
    }

    /**
     * Make an API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    /**
     * Load a word embedding model
     */
    async loadModel(modelName) {
        const data = await this.request('/api/model/load', {
            method: 'POST',
            body: JSON.stringify({ model: modelName })
        });
        
        this.model = modelName;
        this.modelInfo = data.model_info;
        return data;
    }

    /**
     * Get current model information
     */
    async getModelInfo() {
        const data = await this.request('/api/model/info');
        this.modelInfo = data;
        return data;
    }

    /**
     * Check if a word exists in the vocabulary
     */
    async checkWord(word) {
        return await this.request('/api/word/check', {
            method: 'POST',
            body: JSON.stringify({ word })
        });
    }

    /**
     * Get basis word candidates for a given word
     */
    async getBasisWords(baseWord, count = 8) {
        return await this.request('/api/word/basis', {
            method: 'POST',
            body: JSON.stringify({ 
                word: baseWord, 
                count 
            })
        });
    }

    /**
     * Mix word vectors with given weights
     */
    async mixWords(weightedWords) {
        return await this.request('/api/word/mix', {
            method: 'POST',
            body: JSON.stringify({ 
                weights: weightedWords 
            })
        });
    }

    /**
     * Get nearest neighbors for a mixed vector
     */
    async getNeighbors(vector, options = {}) {
        const {
            topn = 25,
            filters = {},
            excludeWords = []
        } = options;

        return await this.request('/api/word/neighbors', {
            method: 'POST',
            body: JSON.stringify({
                vector,
                topn,
                filters,
                exclude_words: excludeWords
            })
        });
    }

    /**
     * Get 3D visualization data using UMAP
     */
    async get3DVisualization(baseWord, mixedVector = null, rebuild = false) {
        return await this.request('/api/visualization/3d', {
            method: 'POST',
            body: JSON.stringify({
                base_word: baseWord,
                mixed_vector: mixedVector,
                rebuild
            })
        });
    }

    /**
     * Get 3D visualization data progressively (in batches)
     */
    async get3DVisualizationProgressive(baseWord, mixedVector = null, batchSize = 20, batchNumber = 0, useFastPositioning = true, neighborWords = []) {
        return await this.request('/api/visualization/3d/progressive', {
            method: 'POST',
            body: JSON.stringify({
                base_word: baseWord,
                mixed_vector: mixedVector,
                batch_size: batchSize,
                batch_number: batchNumber,
                use_fast_positioning: useFastPositioning,
                neighbor_words: neighborWords
            })
        });
    }

    /**
     * Get random direction words for a given word
     */
    async getRandomDirections(word, weirdness = 1.0) {
        return await this.request('/api/word/random_directions', {
            method: 'POST',
            body: JSON.stringify({
                word,
                weirdness
            })
        });
    }

    /**
     * Clear cache for a specific base word
     */
    async clearCacheForBaseWord(baseWord) {
        return await this.request('/api/cache/clear_base_word', {
            method: 'POST',
            body: JSON.stringify({ base_word: baseWord })
        });
    }
}

// Create global API instance
window.api = new WordSynthAPI();

