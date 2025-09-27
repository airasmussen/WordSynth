/**
 * 3D Visualization Manager for Word Synthesizer
 * Handles Three.js 3D visualization with proper text rendering
 */

class VisualizationManager {
    constructor() {
        this.plotElement = document.getElementById('plot3D');
        this.threeJSViz = null;
        this.isInitialized = false;
        this.clickHandler = null;
        this.hoverHandler = null;
    }

    /**
     * Initialize the Three.js 3D visualization
     */
    async initialize() {
        if (this.isInitialized) return;
        
        // Initialize Three.js visualization
        this.threeJSViz = new ThreeJSVisualization('plot3D');
        
        this.isInitialized = true;
        console.log('Three.js 3D visualization initialized');
    }

    /**
     * Update the 3D plot with new data
     */
    async updatePlot(points, baseWord) {
        if (!this.isInitialized || !this.threeJSViz) {
            console.warn('Visualization not initialized');
            return;
        }

        try {
            // Update Three.js visualization
            this.threeJSViz.updateVisualization({ points });
            console.log(`Updated 3D visualization with ${points.length} points`);
        } catch (error) {
            console.error('Error updating 3D visualization:', error);
            this.showError('Failed to update visualization');
        }
    }

    /**
     * Add words progressively to the 3D visualization
     */
    addWordsProgressively(data) {
        if (!this.isInitialized || !this.threeJSViz) {
            console.warn('Visualization not initialized');
            return;
        }

        try {
            this.threeJSViz.addWordsProgressively(data);
        } catch (error) {
            console.error('Error adding words progressively:', error);
            this.showError('Failed to add words progressively');
        }
    }

    /**
     * Add words progressively with alignment to existing base word
     */
    addWordsProgressivelyAligned(data, existingBaseWord) {
        if (!this.isInitialized || !this.threeJSViz) {
            console.warn('Visualization not initialized');
            return;
        }

        try {
            this.threeJSViz.addWordsProgressivelyAligned(data, existingBaseWord);
        } catch (error) {
            console.error('Error adding words progressively aligned:', error);
            this.showError('Failed to add words progressively aligned');
        }
    }

    /**
     * Clear all word objects from the visualization
     */
    clearWordObjects() {
        if (!this.isInitialized || !this.threeJSViz) {
            console.warn('Visualization not initialized');
            return;
        }

        try {
            this.threeJSViz.clearWordObjects();
        } catch (error) {
            console.error('Error clearing word objects:', error);
            this.showError('Failed to clear word objects');
        }
    }

    /**
     * Clear all word objects except the specified word
     */
    clearWordObjectsExcept(keepWord) {
        if (!this.isInitialized || !this.threeJSViz) {
            console.warn('Visualization not initialized');
            return;
        }

        try {
            this.threeJSViz.clearWordObjectsExcept(keepWord);
        } catch (error) {
            console.error('Error clearing word objects except:', error);
            this.showError('Failed to clear word objects except');
        }
    }

    /**
     * Set click handler for word interactions
     */
    setClickHandler(handler) {
        this.clickHandler = handler;
        if (this.threeJSViz) {
            this.threeJSViz.setClickHandler(handler);
        }
    }

    /**
     * Set hover handler for word interactions
     */
    setHoverHandler(handler) {
        this.hoverHandler = handler;
        if (this.threeJSViz) {
            this.threeJSViz.setHoverHandler(handler);
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        // Three.js doesn't need a loading state like Plotly
        // The visualization will update when data is ready
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        // Three.js doesn't need a loading state like Plotly
        // The visualization will update when data is ready
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('Visualization error:', message);
        // Could add error overlay to Three.js scene if needed
    }

    /**
     * Resize the visualization
     */
    resize() {
        if (this.threeJSViz) {
            this.threeJSViz.onWindowResize();
        }
    }

    /**
     * Update mix point position
     */
    updateMixPoint(mixedVector) {
        if (!this.isInitialized || !this.threeJSViz) {
            console.warn('Visualization not initialized');
            return;
        }

        try {
            this.threeJSViz.updateMixPoint(mixedVector);
        } catch (error) {
            console.error('Error updating mix point:', error);
            this.showError('Failed to update mix point');
        }
    }

    /**
     * Cleanup resources
     */
    dispose() {
        if (this.threeJSViz) {
            this.threeJSViz.dispose();
            this.threeJSViz = null;
        }
        this.isInitialized = false;
    }
}

// Initialize the visualization manager
window.vizManager = new VisualizationManager();