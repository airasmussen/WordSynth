/**
 * Main Application Logic for Word Synthesizer
 * Coordinates all components and handles user interactions
 */

class WordSynthApp {
    constructor() {
        this.currentBaseWord = 'king';
        this.currentBasisWords = [];
        this.currentWeights = {};
        this.currentMixedVector = null;
        this.currentNeighbors = [];
        this.isLoading = false;
        this.lastClickTime = 0;
        this.clickDebounceMs = 1000; // 1 second debounce
        this.updateTimeout = null;
        this.updateThrottleMs = 300; // 300ms throttle for updates
        
        this.initializeApp();
    }

    /**
     * Initialize the application
     */
    async initializeApp() {
        console.log('Initializing Word Synthesizer...');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load default model
        await this.loadDefaultModel();
        
        // Initialize visualization
        await window.vizManager.initialize();
        
        // Setup visualization handlers
        this.setupVisualizationHandlers();
        
        // Load initial data
        await this.loadInitialData();
        
        console.log('Word Synthesizer initialized successfully!');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Model selection
        document.getElementById('modelSelect').addEventListener('change', (e) => {
            this.loadModel(e.target.value);
        });

        // Base word input - only validate on Enter or after user stops typing
        const baseWordInput = document.getElementById('baseWordInput');
        
        // Handle Enter key
        baseWordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleBaseWordChange(e.target.value);
            }
        });
        
        // Handle input with debounce (only after user stops typing for 1 second)
        let inputTimeout = null;
        baseWordInput.addEventListener('input', (e) => {
            // Clear previous timeout
            if (inputTimeout) {
                clearTimeout(inputTimeout);
            }
            
            // Set new timeout
            inputTimeout = setTimeout(() => {
                this.handleBaseWordChange(e.target.value);
            }, 1000); // 1 second delay
        });

        // Visualization options
        document.getElementById('show3D').addEventListener('change', (e) => {
            this.toggle3DVisualization(e.target.checked);
        });


        document.getElementById('progressiveLoading').addEventListener('change', (e) => {
            // If 3D is enabled and we're switching modes, reload the visualization
            if (document.getElementById('show3D').checked) {
                this.rebuild3DVisualization();
            }
        });

        document.getElementById('rebuild3D').addEventListener('click', () => {
            this.rebuild3DVisualization();
        });

        // Sliders
        document.getElementById('neighborCount').addEventListener('input', (e) => {
            this.updateSliderValue('neighborCountValue', e.target.value);
            this.updateResults();
        });

        document.getElementById('basisCount').addEventListener('input', (e) => {
            this.updateSliderValue('basisCountValue', e.target.value);
            this.loadBasisWords();
        });

        document.getElementById('weirdness').addEventListener('input', (e) => {
            this.updateSliderValue('weirdnessValue', e.target.value);
        });

        // Filters
        document.getElementById('suppressProperNouns').addEventListener('change', () => {
            this.updateResults();
        });

        document.getElementById('suppressMixerWords').addEventListener('change', () => {
            this.updateResults();
        });

        document.getElementById('suppressConjugations').addEventListener('change', () => {
            this.updateResults();
        });

        document.getElementById('lookAround').addEventListener('change', (e) => {
            this.toggleLookAround(e.target.checked);
        });

        // Reset button
        document.getElementById('resetMix').addEventListener('click', () => {
            this.resetMix();
        });

        // Download button
        document.getElementById('downloadCSV').addEventListener('click', () => {
            this.downloadResults();
        });
    }

    /**
     * Setup visualization event handlers
     */
    setupVisualizationHandlers() {
        // Double-click handler for setting base word
        window.vizManager.setClickHandler(async (word) => {
            // Debounce rapid double-clicks
            const now = Date.now();
            if (now - this.lastClickTime < this.clickDebounceMs) {
                console.log('Double-click ignored - too soon after last double-click');
                return;
            }
            this.lastClickTime = now;
            
            try {
                // Don't reload everything, just change the base word and reload 3D visualization
                await this.setBaseWordFromVisualization(word);
            } catch (error) {
                console.error('Error setting base word:', error);
                this.showError('Failed to set base word: ' + error.message);
            }
        });

    }

    /**
     * Load default model
     */
    async loadDefaultModel() {
        try {
            // Check if model is already loaded
            try {
                const modelInfo = await window.api.getModelInfo();
                if (modelInfo) {
                    this.updateModelInfo();
                    return; // Model already loaded
                }
            } catch (error) {
                // Model not loaded, continue with loading
            }
            
            this.showLoading('Loading GoogleNews model (this may take a moment)...');
            await window.api.loadModel('GoogleNews');
            this.updateModelInfo();
            this.hideLoading();
        } catch (error) {
            console.error('Failed to load default model:', error);
            this.hideLoading();
            this.showError('Failed to load model: ' + error.message);
        }
    }

    /**
     * Load a specific model
     */
    async loadModel(modelName) {
        try {
            this.showLoading(`Loading ${modelName} model...`);
            await window.api.loadModel(modelName);
            this.updateModelInfo();
            this.hideLoading();
            
            // Reload data with new model
            await this.loadInitialData();
        } catch (error) {
            console.error('Failed to load model:', error);
            this.showError('Failed to load model: ' + error.message);
        }
    }

    /**
     * Update model information display
     */
    updateModelInfo() {
        const modelInfo = window.api.modelInfo;
        if (modelInfo) {
            const status = `📚 ${window.api.model} (${modelInfo.vocab_size.toLocaleString()} words, ${modelInfo.dimensions}D, FAISS: ${modelInfo.faiss_enabled ? '✅' : '❌'})`;
            document.getElementById('modelInfo').innerHTML = `<span class="model-status">${status}</span>`;
        }
    }

    /**
     * Handle base word change
     */
    async handleBaseWordChange(word) {
        const cleanWord = word.trim();
        
        if (cleanWord === this.currentBaseWord) return;
        
        try {
            // Check if word exists
            const checkResult = await window.api.checkWord(cleanWord);
            
            if (checkResult.exists) {
                this.setWordStatus('success', `✓ "${checkResult.word}" found in vocabulary`);
                await this.setBaseWord(checkResult.word);
            } else {
                this.setWordStatus('error', `✗ "${cleanWord}" not found in vocabulary`);
            }
        } catch (error) {
            this.setWordStatus('error', `Error checking word: ${error.message}`);
        }
    }

    /**
     * Set base word and reload data
     */
    async setBaseWord(word) {
        if (!word || word.trim() === '') {
            throw new Error('Word cannot be empty');
        }
        
        const cleanWord = word.trim();
        
        // Check if word exists in vocabulary first - try multiple variations
        let validWord = null;
        const wordVariations = [
            word,  // Original word as displayed
            word.replace(/_/g, ' '),  // Replace underscores with spaces
            word.replace(/_/g, ''),  // Remove underscores
        ];
        
        try {
            for (const variation of wordVariations) {
                const checkResult = await window.api.checkWord(variation);
                if (checkResult.exists) {
                    validWord = checkResult.word; // Use the corrected word from the API
                    break;
                }
            }
            
            if (!validWord) {
                throw new Error(`Word "${word}" not found in vocabulary (tried variations: ${wordVariations.join(', ')})`);
            }
        } catch (error) {
            throw new Error(`Failed to verify word: ${error.message}`);
        }
        
        this.currentBaseWord = validWord;
        document.getElementById('baseWordInput').value = validWord;
        this.setWordStatus('success', `✓ Using "${validWord}" as base word`);
        
        // Clear current weights and reset to new base word
        this.currentWeights = {};
        this.currentWeights[validWord] = 1.0;  // Set new base word weight to 1.0
        
        // Reload all data
        await this.loadInitialData();
        
        // Update the mixing board to reflect the new base word weight
        this.renderMixingBoard();
    }

    /**
     * Set base word from 3D visualization double-click (optimized for visualization)
     */
    async setBaseWordFromVisualization(word) {
        if (!word || word.trim() === '') {
            throw new Error('Word cannot be empty');
        }
        
        const cleanWord = word.trim();
        
        // Check if word exists in vocabulary first - try multiple variations
        let validWord = null;
        const wordVariations = [
            word,  // Original word as displayed
            word.replace(/_/g, ' '),  // Replace underscores with spaces
            word.replace(/_/g, ''),  // Remove underscores
        ];
        
        try {
            for (const variation of wordVariations) {
                const checkResult = await window.api.checkWord(variation);
                if (checkResult.exists) {
                    validWord = checkResult.word; // Use the corrected word from the API
                    break;
                }
            }
            
            if (!validWord) {
                throw new Error(`Word "${word}" not found in vocabulary (tried variations: ${wordVariations.join(', ')})`);
            }
        } catch (error) {
            throw new Error(`Failed to verify word: ${error.message}`);
        }
        
        this.currentBaseWord = validWord;
        document.getElementById('baseWordInput').value = validWord;
        this.setWordStatus('success', `✓ Using "${validWord}" as base word`);
        
        // Clear current weights and reset to new base word
        this.currentWeights = {};
        this.currentWeights[validWord] = 1.0;  // Set new base word weight to 1.0
        
        // Load basis words (needed for mixing board)
        await this.loadBasisWords();
        
        // Clear cache for the old base word to ensure fresh neighbors
        try {
            await window.api.clearCacheForBaseWord(this.currentBaseWord);
        } catch (error) {
            console.warn('Failed to clear cache:', error);
        }
        
        // Update results to get new neighbors for the new base word
        await this.updateResults();
        
        // Clear all words except the clicked word, preserving camera position
        if (document.getElementById('show3D').checked) {
            window.vizManager.clearWordObjectsExcept(validWord);
            
            // Reload 3D visualization with new base word (progressive loading)
            if (document.getElementById('progressiveLoading').checked) {
                await this.load3DVisualizationProgressiveFromWord(validWord);
            } else {
                await this.load3DVisualization();
            }
        }
        
        // Update results to show initial neighbors
        this.updateResults();
        
        // Update the mixing board to reflect the new base word weight
        this.renderMixingBoard();
    }

    /**
     * Set word status display
     */
    setWordStatus(type, message) {
        const statusElement = document.getElementById('wordStatus');
        statusElement.textContent = message;
        statusElement.className = `word-status ${type}`;
    }

    /**
     * Load initial data for the current base word
     */
    async loadInitialData() {
        try {
            // Ensure base word has weight 1.0
            this.currentWeights[this.currentBaseWord] = 1.0;
            
            // Load basis words
            await this.loadBasisWords();
            
            // Update results to show initial neighbors first
            await this.updateResults();
            
            // Load 3D visualization after neighbors are loaded
            if (document.getElementById('show3D').checked) {
                if (document.getElementById('progressiveLoading').checked) {
                    await this.load3DVisualizationProgressive();
                } else {
                    await this.load3DVisualization();
                }
            }
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showError('Failed to load data: ' + error.message);
        }
    }

    /**
     * Load basis words for current base word
     */
    async loadBasisWords() {
        try {
            const basisCount = parseInt(document.getElementById('basisCount').value);
            const result = await window.api.getBasisWords(this.currentBaseWord, basisCount);
            
            this.currentBasisWords = result.basis_words;
            this.renderMixingBoard();
        } catch (error) {
            console.error('Failed to load basis words:', error);
            this.showError('Failed to load basis words: ' + error.message);
        }
    }

    /**
     * Render the mixing board
     */
    renderMixingBoard() {
        const mixingBoard = document.getElementById('mixingBoard');
        
        if (this.currentBasisWords.length === 0) {
            mixingBoard.innerHTML = '<div class="loading">No basis words available</div>';
            return;
        }

        const html = this.currentBasisWords.map((word, index) => {
            let currentWeight = this.currentWeights[word] || 0;
            
            // Set base word weight to 1.0 if not set
            if (word === this.currentBaseWord && currentWeight === 0) {
                currentWeight = 1.0;
                this.currentWeights[word] = 1.0;
            }
            
            return `
                <div class="mixing-control">
                    <h4>${word || 'Empty'}</h4>
                    <input type="text" 
                           class="control-input" 
                           value="${word}" 
                           placeholder="Enter word..."
                           data-index="${index}">
                    <input type="range" 
                           class="slider" 
                           min="-2" 
                           max="2" 
                           step="0.05" 
                           value="${currentWeight}"
                           data-word="${word}">
                    <div class="slider-value">${currentWeight.toFixed(2)}</div>
                </div>
            `;
        }).join('');

        mixingBoard.innerHTML = html;

        // Add event listeners to mixing controls
        this.setupMixingControlListeners();
    }

    /**
     * Setup event listeners for mixing controls
     */
    setupMixingControlListeners() {
        // Word input listeners
        document.querySelectorAll('.mixing-control input[type="text"]').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                const newWord = e.target.value.trim();
                
                // Update the basis word
                this.currentBasisWords[index] = newWord;
                
                // Update the slider's data-word attribute
                const slider = e.target.parentElement.querySelector('.slider');
                slider.dataset.word = newWord;
                
                // Check if word exists and update weight if needed
                this.checkAndUpdateWord(newWord, slider);
            });
        });

        // Slider listeners
        document.querySelectorAll('.mixing-control .slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const word = e.target.dataset.word;
                const weight = parseFloat(e.target.value);
                
                // Update weight display
                const valueDisplay = e.target.parentElement.querySelector('.slider-value');
                valueDisplay.textContent = weight.toFixed(2);
                
                // Update current weights
                this.currentWeights[word] = weight;
                
                // Update results and visualization
                this.updateResults();
                this.update3DVisualization();
            });
        });
    }

    /**
     * Check if word exists and update weight accordingly
     */
    async checkAndUpdateWord(word, slider) {
        if (!word) {
            slider.value = 0;
            this.currentWeights[word] = 0;
            return;
        }

        try {
            const checkResult = await window.api.checkWord(word);
            if (!checkResult.exists) {
                // Word doesn't exist, set weight to 0
                slider.value = 0;
                this.currentWeights[word] = 0;
                slider.parentElement.querySelector('.slider-value').textContent = '0.00';
            }
        } catch (error) {
            console.error('Error checking word:', error);
        }
    }

    /**
     * Load 3D visualization
     */
    async load3DVisualization() {
        try {
            window.vizManager.showLoading();
            
            const result = await window.api.get3DVisualization(
                this.currentBaseWord,
                this.currentMixedVector,
                false
            );
            
            await window.vizManager.updatePlot(result.points, result.base_word);
            
            // Update visualization info
            const infoElement = document.getElementById('vizInfo');
            infoElement.textContent = `Showing ${result.word_count} words in 3D space. Red diamond shows current mix position.`;
            
        } catch (error) {
            console.error('Failed to load 3D visualization:', error);
            window.vizManager.showError(error.message);
        }
    }

    /**
     * Load 3D visualization progressively
     */
    async load3DVisualizationProgressive() {
        try {
            // Clear existing visualization
            window.vizManager.clearWordObjects();
            
            let batchNumber = 0;
            const batchSize = 15; // Smaller batches for faster initial display
            let totalWords = 0;
            let isComplete = false;
            
            while (!isComplete) {
                // Get neighbor words for highlighting
                const neighborWords = this.currentNeighbors ? this.currentNeighbors.map(n => n.word) : [];
                
                const result = await window.api.get3DVisualizationProgressive(
                    this.currentBaseWord,
                    this.currentMixedVector,
                    batchSize,
                    batchNumber,
                    false,  // Use proper UMAP positioning, not fast positioning
                    neighborWords
                );
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                // Add words to visualization
                window.vizManager.addWordsProgressively(result);
                
                totalWords = result.word_count;
                isComplete = result.is_complete;
                batchNumber++;
            }
            
            // Update visualization info
            const infoElement = document.getElementById('vizInfo');
            infoElement.textContent = `Showing ${totalWords} words in 3D space. Red diamond shows current mix position.`;
            
        } catch (error) {
            console.error('Failed to load 3D visualization progressively:', error);
            window.vizManager.showError(error.message);
        }
    }

    /**
     * Load 3D visualization progressively from a specific word (preserving existing word)
     */
    async load3DVisualizationProgressiveFromWord(baseWord) {
        try {
            let batchNumber = 0;
            const batchSize = 15; // Smaller batches for faster initial display
            let totalWords = 0;
            let isComplete = false;
            
            while (!isComplete) {
                // Get neighbor words for highlighting
                const neighborWords = this.currentNeighbors ? this.currentNeighbors.map(n => n.word) : [];
                
                const result = await window.api.get3DVisualizationProgressive(
                    baseWord,
                    this.currentMixedVector,
                    batchSize,
                    batchNumber,
                    false,  // Use proper UMAP positioning, not fast positioning
                    neighborWords
                );
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                // Add words to visualization with alignment to existing base word
                window.vizManager.addWordsProgressivelyAligned(result, baseWord);
                
                totalWords = result.word_count;
                isComplete = result.is_complete;
                batchNumber++;
            }
            
            // Update visualization info
            const infoElement = document.getElementById('vizInfo');
            infoElement.textContent = `Showing ${totalWords} words in 3D space. Red diamond shows current mix position.`;
            
        } catch (error) {
            console.error('Failed to load 3D visualization progressively from word:', error);
            window.vizManager.showError(error.message);
        }
    }

    /**
     * Update 3D visualization with current mix
     */
    async update3DVisualization() {
        if (!document.getElementById('show3D').checked) return;
        
        try {
            // Rebuild the 3D visualization to include new neighbor words
            if (document.getElementById('progressiveLoading').checked) {
                await this.load3DVisualizationProgressive();
            } else {
                await this.load3DVisualization();
            }
        } catch (error) {
            console.error('Failed to update 3D visualization:', error);
        }
    }

    /**
     * Rebuild 3D visualization
     */
    async rebuild3DVisualization() {
        if (!document.getElementById('show3D').checked) return;
        
        try {
            this.showLoading('Rebuilding 3D neighborhood...');
            
            // Add a small delay to prevent rapid API calls
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (document.getElementById('progressiveLoading').checked) {
                await this.load3DVisualizationProgressive();
            } else {
                const result = await window.api.get3DVisualization(
                    this.currentBaseWord,
                    this.currentMixedVector,
                    true
                );
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                await window.vizManager.updatePlot(result.points, result.base_word);
            }
            
            this.hideLoading();
        } catch (error) {
            console.error('Failed to rebuild 3D visualization:', error);
            this.hideLoading();
            this.showError('Failed to rebuild 3D visualization: ' + error.message);
        }
    }

    /**
     * Toggle 3D visualization
     */
    toggle3DVisualization(show) {
        const section = document.getElementById('visualizationSection');
        section.style.display = show ? 'block' : 'none';
        
        if (show) {
            if (document.getElementById('progressiveLoading').checked) {
                this.load3DVisualizationProgressive();
            } else {
                this.load3DVisualization();
            }
        }
    }


    /**
     * Toggle look around feature
     */
    toggleLookAround(enable) {
        const weirdnessGroup = document.getElementById('weirdnessGroup');
        weirdnessGroup.style.display = enable ? 'block' : 'none';
        
        if (enable) {
            this.updateResults();
        }
    }

    /**
     * Update results based on current weights (throttled)
     */
    updateResults() {
        // Clear existing timeout
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        // Set new timeout
        this.updateTimeout = setTimeout(() => {
            this._updateResults();
        }, this.updateThrottleMs);
    }

    /**
     * Internal method to actually update results
     */
    async _updateResults() {
        try {
            // Debug: Log current weights
            console.log('Current weights:', this.currentWeights);
            
            // Check if we have any non-zero weights
            const hasNonZeroWeights = Object.values(this.currentWeights).some(w => Math.abs(w) > 1e-6);
            
            console.log('Has non-zero weights:', hasNonZeroWeights);
            
            if (!hasNonZeroWeights) {
                this.showResultsMessage('Set some non-zero weights using the sliders to see results!');
                return;
            }

            // Mix words
            const weightedWords = Object.entries(this.currentWeights).map(([word, weight]) => ({
                word,
                weight
            }));

            console.log('Mixing words:', weightedWords);

            const mixResult = await window.api.mixWords(weightedWords);
            this.currentMixedVector = mixResult.mixed_vector;

            // Get neighbors
            const filters = {
                suppress_proper_nouns: document.getElementById('suppressProperNouns').checked,
                suppress_conjugations: document.getElementById('suppressConjugations').checked
            };

            const excludeWords = [];
            if (document.getElementById('suppressMixerWords').checked) {
                excludeWords.push(this.currentBaseWord);
                Object.keys(this.currentWeights).forEach(word => {
                    if (Math.abs(this.currentWeights[word]) > 1e-6) {
                        excludeWords.push(word);
                    }
                });
            }

            const neighborCount = parseInt(document.getElementById('neighborCount').value);
            const neighborsResult = await window.api.getNeighbors(
                this.currentMixedVector,
                {
                    topn: neighborCount,
                    filters,
                    excludeWords
                }
            );

            if (neighborsResult.error) {
                throw new Error(neighborsResult.error);
            }

            this.currentNeighbors = neighborsResult.neighbors || [];
            this.renderResults();

        } catch (error) {
            console.error('Failed to update results:', error);
            this.showResultsMessage('Error updating results: ' + error.message);
        }
    }

    /**
     * Render results table
     */
    renderResults() {
        const resultsTable = document.getElementById('resultsTable');
        const resultsActions = document.getElementById('resultsActions');
        const resultsLoading = document.getElementById('resultsLoading');

        if (this.currentNeighbors.length === 0) {
            this.showResultsMessage('No neighbors found. Try adjusting the weights.');
            return;
        }

        // Hide loading message
        resultsLoading.style.display = 'none';

        // Create table HTML
        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Word</th>
                        <th>Similarity</th>
        `;

        // Add look around columns if enabled
        if (document.getElementById('lookAround').checked) {
            tableHTML += `
                <th>Neighbor</th>
                <th>Local</th>
                <th>Weirdo</th>
            `;
        }

        tableHTML += `
                    </tr>
                </thead>
                <tbody>
        `;

        // Add rows
        this.currentNeighbors.forEach((neighbor, index) => {
            tableHTML += `
                <tr class="neighbor-row" data-word="${neighbor.word}">
                    <td>${neighbor.word}</td>
                    <td>${neighbor.similarity.toFixed(3)}</td>
            `;

            if (document.getElementById('lookAround').checked) {
                // Add placeholder for look around data
                tableHTML += `
                    <td>Loading...</td>
                    <td>Loading...</td>
                    <td>Loading...</td>
                `;
            }

            tableHTML += `</tr>`;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        resultsTable.innerHTML = tableHTML;
        resultsTable.style.display = 'block';
        resultsActions.style.display = 'block';

        // Add double-click handlers for neighbor rows
        this.setupNeighborRowClickHandlers();

        // Load look around data if enabled
        if (document.getElementById('lookAround').checked) {
            this.loadLookAroundData();
        }
    }

    /**
     * Setup double-click handlers for neighbor rows
     */
    setupNeighborRowClickHandlers() {
        const neighborRows = document.querySelectorAll('.neighbor-row');
        neighborRows.forEach(row => {
            row.addEventListener('dblclick', (event) => {
                const word = row.getAttribute('data-word');
                if (word && window.vizManager && window.vizManager.threeJSViz) {
                    // Point camera at the word in 3D visualization
                    window.vizManager.threeJSViz.pointCameraAtWord(word);
                }
            });
            
            // Add hover effect
            row.style.cursor = 'pointer';
            row.addEventListener('mouseenter', () => {
                row.style.backgroundColor = '#f0f0f0';
            });
            row.addEventListener('mouseleave', () => {
                row.style.backgroundColor = '';
            });
        });
    }

    /**
     * Load look around data for results
     */
    async loadLookAroundData() {
        const weirdness = parseFloat(document.getElementById('weirdness').value);
        
        for (let i = 0; i < this.currentNeighbors.length; i++) {
            try {
                const result = await window.api.getRandomDirections(
                    this.currentNeighbors[i].word,
                    weirdness
                );
                
                // Update the table row
                const row = document.querySelector(`#resultsTable tbody tr:nth-child(${i + 1})`);
                if (row) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 5) {
                        cells[2].textContent = result.neighbor;
                        cells[3].textContent = result.local;
                        cells[4].textContent = result.weirdo;
                    }
                }
            } catch (error) {
                console.error('Failed to load look around data:', error);
            }
        }
    }

    /**
     * Show results message
     */
    showResultsMessage(message) {
        const resultsTable = document.getElementById('resultsTable');
        const resultsActions = document.getElementById('resultsActions');
        const resultsLoading = document.getElementById('resultsLoading');

        resultsTable.style.display = 'none';
        resultsActions.style.display = 'none';
        resultsLoading.textContent = message;
        resultsLoading.style.display = 'block';
    }

    /**
     * Reset all weights to zero (except base word)
     */
    resetMix() {
        // Keep base word weight at 1.0, reset all others to 0
        const baseWordWeight = this.currentWeights[this.currentBaseWord] || 1.0;
        this.currentWeights = {};
        this.currentWeights[this.currentBaseWord] = baseWordWeight;
        
        // Reset all sliders
        document.querySelectorAll('.mixing-control .slider').forEach(slider => {
            const word = slider.dataset.word;
            if (word === this.currentBaseWord) {
                // Keep base word at 1.0
                slider.value = 1.0;
                slider.parentElement.querySelector('.slider-value').textContent = '1.00';
            } else {
                // Reset other words to 0
                slider.value = 0;
                slider.parentElement.querySelector('.slider-value').textContent = '0.00';
            }
        });
        
        // Update results
        this.updateResults();
        this.update3DVisualization();
    }

    /**
     * Download results as CSV
     */
    downloadResults() {
        if (this.currentNeighbors.length === 0) return;

        let csvContent = 'Word,Similarity';
        
        if (document.getElementById('lookAround').checked) {
            csvContent += ',Neighbor,Local,Weirdo';
        }
        
        csvContent += '\n';

        this.currentNeighbors.forEach(neighbor => {
            csvContent += `${neighbor.word},${neighbor.similarity.toFixed(3)}`;
            
            if (document.getElementById('lookAround').checked) {
                // Get look around data from table
                const rowIndex = this.currentNeighbors.indexOf(neighbor);
                const row = document.querySelector(`#resultsTable tbody tr:nth-child(${rowIndex + 1})`);
                if (row) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 5) {
                        csvContent += `,${cells[2].textContent},${cells[3].textContent},${cells[4].textContent}`;
                    }
                }
            }
            
            csvContent += '\n';
        });

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `neighbors_${this.currentBaseWord}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }


    /**
     * Update slider value display
     */
    updateSliderValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageElement = overlay.querySelector('p');
        messageElement.textContent = message;
        overlay.classList.add('show');
        this.isLoading = true;
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.remove('show');
        this.isLoading = false;
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('App Error:', message);
        // You could implement a toast notification system here
        alert('Error: ' + message);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.wordSynthApp = new WordSynthApp();
});

