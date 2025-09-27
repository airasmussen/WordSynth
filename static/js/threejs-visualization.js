/**
 * Three.js 3D Visualization for Word Synthesizer
 * Provides full control over 3D text rendering with shadows and outlines
 */

class ThreeJSVisualization {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.wordObjects = new Map();
        this.currentBaseWord = null;
        this.currentMixPoint = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.clickHandler = null;
        this.hoverHandler = null;
        this.cameraTranslated = false; // Track if camera has been translated by user
        this.isPanning = false; // Track if currently panning
        
        // Create a debug wrapper for cameraTranslated
        let _cameraTranslated = false;
        Object.defineProperty(this, 'cameraTranslated', {
            get: function() {
                return _cameraTranslated;
            },
            set: function(value) {
                console.log('cameraTranslated changed from', _cameraTranslated, 'to', value, 'Stack trace:', new Error().stack);
                _cameraTranslated = value;
            }
        });
        
        this.initialize();
    }

    /**
     * Initialize Three.js scene, camera, renderer, and controls
     */
    initialize() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);

        // Camera setup
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(3, 3, 3); // Closer initial position

        // Renderer setup with retina/high DPI support
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio); // Retina/high DPI support
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.sortObjects = true; // Enable render order sorting
        this.container.appendChild(this.renderer.domElement);

        // Controls setup
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = false; // Completely disable zoom, we'll handle wheel differently
        this.controls.enablePan = true;
        
        // Configure mouse buttons - LEFT for rotate, MIDDLE for pan
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.PAN
        };
        
        // Completely remove zoom restrictions and disable zoom functionality
        this.controls.minDistance = 0;
        this.controls.maxDistance = Infinity;
        this.controls.enableKeys = false; // Disable keyboard controls that might interfere
        
        // Track camera translation (panning) to remove wheel distance restrictions
        this.setupCameraTranslationTracking();
        
        // Custom wheel behavior for camera movement instead of zoom
        this.setupCustomWheelBehavior();

        // Lighting setup
        this.setupLighting();

        // Add grid and axes
        this.setupGridAndAxes();

        // Event listeners
        this.setupEventListeners();

        // Start render loop
        this.animate();

        console.log('Three.js visualization initialized');
    }

    /**
     * Setup lighting for the scene
     */
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        // Directional light with shadows
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        this.scene.add(directionalLight);

        // Point light for additional illumination
        const pointLight = new THREE.PointLight(0xffffff, 0.5, 100);
        pointLight.position.set(-10, 10, -10);
        this.scene.add(pointLight);
    }

    /**
     * Setup three-sided grid planes for the scene (similar to Streamlit style)
     */
    setupGridAndAxes() {
        // Create three custom grid planes that form a proper corner
        this.createCornerGrids();
    }

    /**
     * Create custom grid planes that form a proper corner
     */
    createCornerGrids() {
        // Origin point away from where the cloud will be (bottom-left-back corner)
        const originX = -6;
        const originY = -6;
        const originZ = -6;
        
        const gridSize = 12; // Size of each grid (increased by 50% from 8)
        const gridDivisions = 12;
        
        // Gray colors with brighter origin edges
        const gridColor = 0x444444;    // Dark gray for grid lines
        const axisColor = 0x666666;    // Brighter gray for center axis edges
        const originColor = 0x888888;  // Brightest gray for origin edges
        
        // XY plane (floor) - GRAY
        const xyGrid = this.createCornerGrid(gridSize, gridDivisions, gridColor, axisColor, 'XY');
        xyGrid.position.set(originX, originY, originZ);
        xyGrid.rotation.set(0, 0, 0);
        this.scene.add(xyGrid);
        
        // YZ plane (left wall) - GRAY
        const yzLeftGrid = this.createCornerGrid(gridSize, gridDivisions, gridColor, axisColor, 'YZ');
        yzLeftGrid.position.set(originX, originY, originZ);
        yzLeftGrid.rotation.set(0, 0, 0);
        this.scene.add(yzLeftGrid);
        
        // YZ plane (right wall) - GRAY
        const yzRightGrid = this.createCornerGrid(gridSize, gridDivisions, gridColor, axisColor, 'YZ');
        yzRightGrid.position.set(originX + gridSize, originY, originZ);
        yzRightGrid.rotation.set(0, 0, Math.PI/2);
        this.scene.add(yzRightGrid);
    }

    /**
     * Create a custom grid geometry that extends from origin toward the cloud
     */
    createCornerGrid(size, divisions, color, centerColor, plane) {
        const originColor = 0x888888; // Brightest gray for origin edges
        const gridGroup = new THREE.Group();
        
        // Create grid lines
        const step = size / divisions;
        
        if (plane === 'XY') {
            // XY plane: vertical lines (along Y) and horizontal lines (along X)
            // Vertical lines
            for (let i = 0; i <= divisions; i++) {
                const x = i * step;
                const isCenter = i === divisions / 2;
                // Don't make vertical lines bright on floor - only horizontal Y=0 line should be bright
                
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(x, 0, 0),
                    new THREE.Vector3(x, size, 0)
                ]);
                
                const material = new THREE.LineBasicMaterial({ 
                    color: color,
                    transparent: true,
                    opacity: 0.6
                });
                
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
            
            // Horizontal lines
            for (let i = 0; i <= divisions; i++) {
                const y = i * step;
                const isCenter = i === divisions / 2;
                const isOrigin = i === 0; // First line touches origin
                
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, y, 0),
                    new THREE.Vector3(size, y, 0)
                ]);
                
                const material = new THREE.LineBasicMaterial({ 
                    color: isOrigin ? originColor : color,
                    transparent: true,
                    opacity: 0.6
                });
                
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
        } else if (plane === 'XZ') {
            // XZ plane: vertical lines (along Z) and horizontal lines (along X)
            // Vertical lines
            for (let i = 0; i <= divisions; i++) {
                const x = i * step;
                const isCenter = i === divisions / 2;
                const isOrigin = i === 0; // First line touches origin
                
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(x, 0, 0),
                    new THREE.Vector3(x, 0, size)
                ]);
                
                const material = new THREE.LineBasicMaterial({ 
                    color: isOrigin ? originColor : color,
                    transparent: true,
                    opacity: 0.6
                });
                
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
            
            // Horizontal lines
            for (let i = 0; i <= divisions; i++) {
                const z = i * step;
                const isCenter = i === divisions / 2;
                const isOrigin = i === 0; // First line touches origin
                
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, z),
                    new THREE.Vector3(size, 0, z)
                ]);
                
                const material = new THREE.LineBasicMaterial({ 
                    color: isOrigin ? originColor : color,
                    transparent: true,
                    opacity: 0.6
                });
                
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
        } else if (plane === 'YZ') {
            // YZ plane: vertical lines (along Z) and horizontal lines (along Y)
            // Vertical lines
            for (let i = 0; i <= divisions; i++) {
                const y = i * step;
                const isCenter = i === divisions / 2;
                const isOrigin = i === 0; // First line touches origin
                
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, y, 0),
                    new THREE.Vector3(0, y, size)
                ]);
                
                const material = new THREE.LineBasicMaterial({ 
                    color: isOrigin ? originColor : color,
                    transparent: true,
                    opacity: 0.6
                });
                
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
            
            // Horizontal lines
            for (let i = 0; i <= divisions; i++) {
                const z = i * step;
                const isCenter = i === divisions / 2;
                const isOrigin = i === 0; // First line touches origin
                
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, z),
                    new THREE.Vector3(0, size, z)
                ]);
                
                const material = new THREE.LineBasicMaterial({ 
                    color: isOrigin ? originColor : color,
                    transparent: true,
                    opacity: 0.6
                });
                
                const line = new THREE.Line(geometry, material);
                gridGroup.add(line);
            }
        }
        
        return gridGroup;
    }



    /**
     * Setup event listeners for mouse interactions
     */
    setupEventListeners() {
        // Use a single click handler with proper double-click detection
        this.renderer.domElement.addEventListener('click', (event) => this.onClick(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this.onMouseMove(event));
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Double-click detection variables
        this.clickTimeout = null;
        this.clickCount = 0;
    }

    /**
     * Setup camera translation tracking to detect when user has panned the camera
     */
    setupCameraTranslationTracking() {
        // Store initial camera position and target
        this.initialCameraPosition = this.camera.position.clone();
        this.initialCameraTarget = this.controls.target.clone();
        
        // Track command key state globally
        this.commandKeyDown = false;
        this.lastCommandKeyTime = null;
        
        // Simple approach: set translation mode when command key goes down
        const handleKeyDown = (event) => {
            if (event.metaKey || event.ctrlKey || event.key === 'Meta' || event.key === 'Control') {
                console.log('*** COMMAND KEY DOWN - SETTING TRANSLATION MODE! ***');
                this.cameraTranslated = true;
            }
        };
        
        // Add global key listener
        window.addEventListener('keydown', handleKeyDown, true);
    }

    /**
     * Setup custom wheel behavior for camera movement instead of zoom
     */
    setupCustomWheelBehavior() {
        this.renderer.domElement.addEventListener('wheel', (event) => {
            console.log('Wheel event - cameraTranslated:', this.cameraTranslated);
            event.preventDefault();
            event.stopPropagation();
            
            // Calculate movement direction based on camera's current orientation
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            
            // Scale movement based on wheel delta (quarter the sensitivity)
            const moveSpeed = 0.025; // Reduced from 0.1 to 0.025 (quarter sensitivity)
            const delta = event.deltaY > 0 ? moveSpeed : -moveSpeed;
            
            // Calculate new camera position
            const movement = direction.multiplyScalar(delta);
            const newPosition = this.camera.position.clone().add(movement);
            
            // Apply different restrictions based on camera state
            if (!this.cameraTranslated) {
                console.log('Orbit mode - applying distance restrictions');
                // When orbiting, maintain a safe distance from the target
                const currentDistance = this.camera.position.distanceTo(this.controls.target);
                const newDistance = newPosition.distanceTo(this.controls.target);
                const minDistance = 0.2; // Very close minimum distance - can get very close to words
                
                // Only allow movement if:
                // 1. We're moving away from the target (increasing distance), OR
                // 2. We're moving toward the target but would still be above the minimum distance
                const isMovingAway = newDistance > currentDistance;
                const wouldStayAboveMin = newDistance >= minDistance;
                
                if (isMovingAway || wouldStayAboveMin) {
                    this.camera.position.copy(newPosition);
                    this.controls.update();
                }
                // If we would get too close, do absolutely nothing - hard stop (no jittering, no flashing)
            } else {
                console.log('Translated mode - allowing free movement');
                // When translated, NO distance restrictions - allow completely free movement
                this.camera.position.copy(newPosition);
                this.controls.update();
            }
        }, { passive: false });
    }

    /**
     * Create 3D text with proper shadows and outlines
     */
    createTextMesh(text, position, color = 0xffffff, size = 0.5, opacity = 1.0) {
        // Create canvas for text texture with higher resolution
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Set canvas size based on text length but with consistent proportions
        const fontSize = 160; // Larger font for better readability
        const scale = 2; // Additional scaling for crispness
        const minWidth = 400 * scale; // Minimum width
        const maxWidth = 2400 * scale; // Much larger maximum width to prevent cutoff
        const fixedHeight = 200 * scale; // Fixed height for all text
        const textWidth = Math.max(minWidth, Math.min(maxWidth, fontSize * text.length * 1.2 * scale)); // More conservative width calculation
        canvas.width = textWidth;
        canvas.height = fixedHeight;
        
        // Scale the context for crisp rendering
        context.scale(scale, scale);
        
        // Set font - using a cleaner, more readable font
        context.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Enable text rendering optimizations for crisp text
        context.textRenderingOptimization = 'optimizeQuality';
        context.imageSmoothingEnabled = false;
        context.imageSmoothingQuality = 'high';
        
        // Draw text with black outline (thicker for better visibility)
        context.strokeStyle = 'black';
        context.lineWidth = 16; // Thicker outline for better contrast
        context.strokeText(text, textWidth / (2 * scale), fixedHeight / (2 * scale));
        
        // Draw text with colored fill
        context.fillStyle = this.colorToHex(color);
        context.fillText(text, textWidth / (2 * scale), fixedHeight / (2 * scale));
        
        // Create texture from canvas with better antialiasing
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter; // Better antialiasing
        texture.magFilter = THREE.LinearFilter; // Better antialiasing
        
        // Create material with opacity support
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1,
            opacity: opacity,
            depthTest: false // Ensure text always renders on top
        });
        
        // Create geometry with proper proportions - match the actual canvas aspect ratio
        // Calculate the aspect ratio from the actual canvas dimensions to prevent stretching
        const aspectRatio = textWidth / fixedHeight;
        const geometry = new THREE.PlaneGeometry(size, size / aspectRatio); // Match canvas aspect ratio
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        
        // Store reference to camera for billboard behavior
        mesh.userData = { isTextMesh: true };
        
        return mesh;
    }

    /**
     * Create a sphere for word points
     */
    createWordSphere(position, color = 0xffffff, size = 0.05) {
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshLambertMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.8 
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(position);
        sphere.castShadow = false;
        sphere.receiveShadow = false;
        return sphere;
    }

    /**
     * Create a glow sphere for highlighting
     */
    createGlowSphere(position, color = 0xffffff, size = 0.05) {
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.4, // More opaque for more obvious glow
            side: THREE.BackSide // Render from inside to create glow
        });
        const glowSphere = new THREE.Mesh(geometry, material);
        glowSphere.position.copy(position);
        glowSphere.castShadow = false;
        glowSphere.receiveShadow = false;
        return glowSphere;
    }

    /**
     * Convert color to hex string
     */
    colorToHex(color) {
        if (typeof color === 'number') {
            return '#' + color.toString(16).padStart(6, '0');
        }
        return color;
    }

    /**
     * Update the 3D visualization with new data
     */
    updateVisualization(data) {
        // Clear existing word objects
        this.clearWordObjects();
        
        if (!data || !data.points || data.points.length === 0) {
            return;
        }

        const points = data.points;
        const baseWordPoint = points.find(p => p.is_base);
        const otherWords = points.filter(p => !p.is_base && !p.is_mix);
        const currentMixPoint = points.find(p => p.is_mix);

        // Create base word
        if (baseWordPoint) {
            this.createBaseWord(baseWordPoint);
        }

        // Create other words
        otherWords.forEach(point => {
            this.createOtherWord(point);
        });

        // Create current mix point
        if (currentMixPoint) {
            this.createCurrentMixPoint(currentMixPoint);
        }

        // Update camera to fit all points
        this.fitCameraToPoints(points);
    }

    /**
     * Add words progressively to the 3D visualization
     */
    addWordsProgressively(data) {
        if (!data || !data.points || data.points.length === 0) {
            return;
        }

        const points = data.points;
        const baseWordPoint = points.find(p => p.is_base);
        const otherWords = points.filter(p => !p.is_base && !p.is_mix);
        const currentMixPoint = points.find(p => p.is_mix);

        // Create base word (only if not already exists)
        if (baseWordPoint && !this.wordObjects.has(baseWordPoint.word)) {
            this.createBaseWord(baseWordPoint);
            // Keep the base word centered
            this.centerOnBaseWord(baseWordPoint);
        }

        // Create other words (only if not already exists)
        otherWords.forEach(point => {
            if (!this.wordObjects.has(point.word)) {
                this.createOtherWord(point);
            }
        });

        // Create current mix point (only if not already exists)
        if (currentMixPoint && !this.wordObjects.has('current_mix')) {
            this.createCurrentMixPoint(currentMixPoint);
        }

        // Don't auto-fit camera - keep base word centered
        // const allPoints = Array.from(this.wordObjects.values()).map(obj => obj.point);
        // this.fitCameraToPoints(allPoints);
    }

    /**
     * Add words progressively with alignment to existing base word
     */
    addWordsProgressivelyAligned(data, existingBaseWord) {
        if (!data || !data.points || data.points.length === 0) {
            return;
        }

        const points = data.points;
        const baseWordPoint = points.find(p => p.is_base);
        const otherWords = points.filter(p => !p.is_base && !p.is_mix);
        const currentMixPoint = points.find(p => p.is_mix);

        // Get the position of the existing base word
        const existingBaseWordObj = this.wordObjects.get(existingBaseWord);
        if (!existingBaseWordObj) {
            // Fallback to regular progressive loading
            this.addWordsProgressively(data);
            return;
        }

        const existingPosition = existingBaseWordObj.point;
        
        // Calculate the center of the new word cloud (excluding the base word)
        let centerX = 0, centerY = 0, centerZ = 0;
        let count = 0;
        
        otherWords.forEach(point => {
            centerX += point.x;
            centerY += point.y;
            centerZ += point.z;
            count++;
        });
        
        if (count > 0) {
            centerX /= count;
            centerY /= count;
            centerZ /= count;
        }
        
        // Calculate the scale factor to make the word cloud more compact around the base word
        let maxDistance = 0;
        otherWords.forEach(point => {
            const distance = Math.sqrt(
                Math.pow(point.x - centerX, 2) + 
                Math.pow(point.y - centerY, 2) + 
                Math.pow(point.z - centerZ, 2)
            );
            maxDistance = Math.max(maxDistance, distance);
        });
        
        // Scale factor to make the word cloud more compact (closer to base word)
        const scaleFactor = maxDistance > 0 ? 4.0 / maxDistance : 1.0;
        
        // Create base word (only if not already exists) - it should already exist
        if (baseWordPoint && !this.wordObjects.has(baseWordPoint.word)) {
            // Base word stays at the existing position
            const alignedBasePoint = {
                ...baseWordPoint,
                x: existingPosition.x,
                y: existingPosition.y,
                z: existingPosition.z
            };
            this.createBaseWord(alignedBasePoint);
        }

        // Create other words with proper scaling and centering
        otherWords.forEach(point => {
            if (!this.wordObjects.has(point.word)) {
                // Scale relative to the center, then translate to existing base word position
                const scaledX = (point.x - centerX) * scaleFactor + existingPosition.x;
                const scaledY = (point.y - centerY) * scaleFactor + existingPosition.y;
                const scaledZ = (point.z - centerZ) * scaleFactor + existingPosition.z;
                
                const alignedPoint = {
                    ...point,
                    x: scaledX,
                    y: scaledY,
                    z: scaledZ
                };
                this.createOtherWord(alignedPoint);
            }
        });

        // Create current mix point with proper scaling and centering
        if (currentMixPoint && !this.wordObjects.has('current_mix')) {
            const scaledX = (currentMixPoint.x - centerX) * scaleFactor + existingPosition.x;
            const scaledY = (currentMixPoint.y - centerY) * scaleFactor + existingPosition.y;
            const scaledZ = (currentMixPoint.z - centerZ) * scaleFactor + existingPosition.z;
            
            const alignedMixPoint = {
                ...currentMixPoint,
                x: scaledX,
                y: scaledY,
                z: scaledZ
            };
            this.createCurrentMixPoint(alignedMixPoint);
        }
    }

    /**
     * Create base word visualization
     */
    createBaseWord(point) {
        const position = new THREE.Vector3(point.x, point.y, point.z);
        
        // Create sphere (bright red, smaller, transparent)
        const sphere = this.createWordSphere(position, 0xff0000, 0.04);
        this.scene.add(sphere);
        
        // Create text (bright red, centered on sphere)
        const textMesh = this.createTextMesh(point.word, 
            new THREE.Vector3(position.x, position.y, position.z), 
            0xff0000, 0.6);
        textMesh.renderOrder = 1; // Render after sphere
        this.scene.add(textMesh);
        
        // Store reference
        this.wordObjects.set(point.word, { sphere, text: textMesh, point });
        this.currentBaseWord = point.word;
        
        // Clear any remaining glow spheres when creating new base word
        this.clearAllGlowSpheres();
    }

    /**
     * Create other word visualization
     */
    createOtherWord(point) {
        const position = new THREE.Vector3(point.x, point.y, point.z);
        
        
        // Create sphere - dark red for neighbors, blue for others
        const sphereColor = point.is_neighbor ? 0x8B0000 : 0x0066ff; // Dark red for neighbors, blue for others
        const sphereSize = point.is_neighbor ? 0.05 : 0.03; // Larger spheres for neighbors
        const sphere = this.createWordSphere(position, sphereColor, sphereSize);
        this.scene.add(sphere);
        
        // Add glow effect for nearest neighbors
        let glowSphere = null;
        if (point.is_neighbor) {
            // Create a much more obvious glow effect
            glowSphere = this.createGlowSphere(position, 0xff0000, 0.12); // Much larger, bright red glow
            this.scene.add(glowSphere);
            
            // Add a second, even larger glow layer for extra prominence
            const outerGlow = this.createGlowSphere(position, 0xff4444, 0.18); // Even larger, lighter red
            outerGlow.material.opacity = 0.15; // Very transparent
            this.scene.add(outerGlow);
            
            // Store both glow spheres
            glowSphere = { inner: glowSphere, outer: outerGlow };
        }
        
        // Calculate distance from camera for label fading
        const distanceFromCamera = this.camera.position.distanceTo(position);
        const maxDistance = 10.0; // Maximum distance for full opacity
        const fadeFactor = Math.max(0.3, 1.0 - (distanceFromCamera / maxDistance));
        
        // Create text with distance-based fading (centered on sphere)
        const textMesh = this.createTextMesh(point.word, 
            new THREE.Vector3(position.x, position.y, position.z), 
            0xffffff, 0.5, fadeFactor);
        textMesh.renderOrder = 1; // Render after sphere
        this.scene.add(textMesh);
        
        // Store reference (including glow sphere if it exists)
        this.wordObjects.set(point.word, { sphere, text: textMesh, point, glow: glowSphere });
    }

    /**
     * Create current mix point visualization
     */
    createCurrentMixPoint(point) {
        const position = new THREE.Vector3(point.x, point.y, point.z);
        
        // Create large, prominent purple cube for current mix
        const cubeGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15); // Much larger
        const cubeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xFF00FF, // Bright magenta/purple
            transparent: true,
            opacity: 0.9
        });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cube.position.copy(position);
        cube.castShadow = false;
        cube.receiveShadow = false;
        this.scene.add(cube);
        
        // Add a bright glow effect around the cube
        const glowGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.25); // Even larger glow
        const glowMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xFF00FF, // Same bright magenta
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide // Render from inside to create glow
        });
        const glowCube = new THREE.Mesh(glowGeometry, glowMaterial);
        glowCube.position.copy(position);
        this.scene.add(glowCube);
        
        // Create large, bold text
        const textMesh = this.createTextMesh('🎯 CURRENT MIX', 
            new THREE.Vector3(position.x, position.y + 0.2, position.z), // Position above cube
            0xFF00FF, 0.8); // Larger, brighter text
        textMesh.renderOrder = 1; // Render after cube
        this.scene.add(textMesh);
        
        // Store reference (including glow)
        this.wordObjects.set('current_mix', { 
            sphere: cube, 
            text: textMesh, 
            point,
            glow: glowCube
        });
        this.currentMixPoint = point;
    }

    /**
     * Clear all word objects from the scene
     */
    clearWordObjects() {
        this.wordObjects.forEach(({ sphere, text, glow }) => {
            this.scene.remove(sphere);
            this.scene.remove(text);
            if (glow) {
                if (glow.inner) {
                    // New structure with inner and outer glow
                    this.scene.remove(glow.inner);
                    this.scene.remove(glow.outer);
                } else {
                    // Old structure with single glow
                    this.scene.remove(glow);
                }
            }
        });
        this.wordObjects.clear();
        this.currentBaseWord = null;
        this.currentMixPoint = null;
        
        // Aggressively remove any remaining glow spheres
        this.clearAllGlowSpheres();
    }
    
    /**
     * Aggressively clear all glow spheres from the scene
     */
    clearAllGlowSpheres() {
        const objectsToRemove = [];
        this.scene.traverse((object) => {
            // Look for glow spheres by checking if they have the glow material properties
            if (object.isMesh && object.material && 
                object.material.transparent && 
                object.material.opacity < 1.0 && 
                object.geometry && 
                (object.geometry.type === 'SphereGeometry' || object.geometry.type === 'BoxGeometry')) {
                // Check if it's likely a glow sphere (transparent, low opacity)
                if (object.material.opacity <= 0.5) {
                    objectsToRemove.push(object);
                }
            }
        });
        
        objectsToRemove.forEach(obj => {
            this.scene.remove(obj);
        });
        
        console.log(`Cleared ${objectsToRemove.length} orphaned glow spheres`);
    }

    /**
     * Clear all word objects except the specified word
     */
    clearWordObjectsExcept(keepWord) {
        const wordsToRemove = [];
        this.wordObjects.forEach(({ sphere, text, glow }, word) => {
            if (word !== keepWord && word !== 'current_mix') {
                this.scene.remove(sphere);
                this.scene.remove(text);
                if (glow) {
                    if (glow.inner) {
                        // New structure with inner and outer glow
                        this.scene.remove(glow.inner);
                        this.scene.remove(glow.outer);
                    } else {
                        // Old structure with single glow
                        this.scene.remove(glow);
                    }
                }
                wordsToRemove.push(word);
            }
        });
        
        // Remove from the map
        wordsToRemove.forEach(word => {
            this.wordObjects.delete(word);
        });
        
        // Aggressively remove any remaining glow spheres when changing base word
        if (keepWord && keepWord !== this.currentBaseWord) {
            this.clearAllGlowSpheres();
        }
        
        // Update the kept word to be the base word (make it red)
        if (keepWord && this.wordObjects.has(keepWord)) {
            const { sphere, text, point, glow } = this.wordObjects.get(keepWord);
            
            // Update sphere to be bright red
            if (sphere && sphere.material) {
                sphere.material.color.setHex(0xff0000); // Bright red
                sphere.scale.set(0.04 / 0.03, 0.04 / 0.03, 0.04 / 0.03); // Make it slightly larger
            }
            
            // Remove old glow sphere if it exists (neighbors won't have glow when they become base word)
            if (glow) {
                if (glow.inner) {
                    // New structure with inner and outer glow
                    this.scene.remove(glow.inner);
                    this.scene.remove(glow.outer);
                } else {
                    // Old structure with single glow
                    this.scene.remove(glow);
                }
            }
            
            // Update text to be bright red (centered in sphere)
            if (text && text.material) {
                // Create new red text mesh
                const newTextMesh = this.createTextMesh(keepWord, 
                    new THREE.Vector3(point.x, point.y, point.z), 
                    0xff0000, 0.6);
                newTextMesh.renderOrder = 1; // Render after sphere
                
                // Remove old text and add new red text
                this.scene.remove(text);
                this.scene.add(newTextMesh);
                
                // Update the stored reference (no glow for base word)
                this.wordObjects.set(keepWord, { sphere, text: newTextMesh, point, glow: null });
            }
            
            this.currentBaseWord = keepWord;
            
            // Clear any remaining glow spheres when base word changes
            this.clearAllGlowSpheres();
        }
    }

    /**
     * Fit camera to show all points
     */
    fitCameraToPoints(points) {
        if (points.length === 0) return;

        const box = new THREE.Box3();
        points.forEach(point => {
            box.expandByPoint(new THREE.Vector3(point.x, point.y, point.z));
        });

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        
        // Reduce the camera distance for better zoom level
        const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.8; // Reduced from 1.5 to 0.8
        
        // Don't reset camera translation state here - this is automatic positioning
        
        this.camera.position.set(
            center.x + cameraDistance,
            center.y + cameraDistance,
            center.z + cameraDistance
        );
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        
        // Update initial positions for translation tracking
        this.initialCameraPosition = this.camera.position.clone();
        this.initialCameraTarget = this.controls.target.clone();
        
        this.controls.update();
    }

    /**
     * Center camera on the base word
     */
    centerOnBaseWord(baseWordPoint) {
        if (!baseWordPoint) return;

        const basePosition = new THREE.Vector3(baseWordPoint.x, baseWordPoint.y, baseWordPoint.z);
        
        // Don't reset camera translation state here - this is automatic positioning
        
        // Set camera to look at the base word
        this.camera.lookAt(basePosition);
        this.controls.target.copy(basePosition);
        
        // Position camera at a good distance from the base word
        const cameraDistance = 3.0; // Fixed distance for consistent viewing
        this.camera.position.set(
            basePosition.x + cameraDistance,
            basePosition.y + cameraDistance,
            basePosition.z + cameraDistance
        );
        
        // Update initial positions for translation tracking
        this.initialCameraPosition = this.camera.position.clone();
        this.initialCameraTarget = this.controls.target.clone();
        
        this.controls.update();
    }

    /**
     * Handle mouse click events with proper single/double click detection
     */
    onClick(event) {
        this.clickCount++;
        
        if (this.clickCount === 1) {
            // First click - wait to see if there's a second click
            this.clickTimeout = setTimeout(() => {
                // Single click - point camera at word
                this.handleSingleClick(event);
                this.clickCount = 0;
            }, 300); // 300ms delay to detect double-click
        } else if (this.clickCount === 2) {
            // Double click - clear timeout and handle double click
            clearTimeout(this.clickTimeout);
            this.handleDoubleClick(event);
            this.clickCount = 0;
        }
    }

    handleSingleClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(
            Array.from(this.wordObjects.values()).map(obj => obj.sphere)
        );

        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            const word = this.findWordBySphere(clickedObject);
            if (word) {
                this.pointCameraAtWord(word);
            }
        }
    }

    handleDoubleClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(
            Array.from(this.wordObjects.values()).map(obj => obj.sphere)
        );

        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            const word = this.findWordBySphere(clickedObject);
            if (word && this.clickHandler) {
                // Reset camera translation state when user double-clicks to change base word
                console.log('*** DOUBLE-CLICK - RESETTING TO ORBIT MODE! ***');
                this.cameraTranslated = false;
                this.initialCameraPosition = this.camera.position.clone();
                this.initialCameraTarget = new THREE.Vector3(clickedObject.position.x, clickedObject.position.y, clickedObject.position.z);
                
                // Center camera on the clicked word (like single click does)
                this.pointCameraAtWord(word);
                
                this.clickHandler(word);
            }
        }
    }

    /**
     * Point camera at a specific word and make it the orbit center
     */
    pointCameraAtWord(word) {
        const wordData = this.wordObjects.get(word);
        if (!wordData) return;

        const targetPosition = new THREE.Vector3(wordData.point.x, wordData.point.y, wordData.point.z);
        
        // Reset camera translation state when pointing at a word (single click)
        // This ensures distance restrictions work properly
        console.log('*** SINGLE CLICK - RESETTING TO ORBIT MODE! ***');
        this.cameraTranslated = false;
        this.initialCameraPosition = this.camera.position.clone();
        this.initialCameraTarget = targetPosition.clone();
        
        // Just change the orbit target, keep camera position the same
        this.animateCameraTarget(targetPosition);
    }

    /**
     * Animate camera target only (keep camera position the same)
     */
    animateCameraTarget(targetPosition) {
        const startTarget = this.controls.target.clone();
        const endTarget = targetPosition.clone();
        
        const duration = 600; // Faster animation for more responsive feel
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Use smooth ease-in-out for ramping in and out
            const easeProgress = progress < 0.5 
                ? 2 * progress * progress  // Ease in
                : 1 - Math.pow(-2 * progress + 2, 3) / 2; // Ease out
            
            // Only interpolate controls target, keep camera position unchanged
            this.controls.target.lerpVectors(startTarget, endTarget, easeProgress);
            
            // Update controls
            this.controls.update();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    /**
     * Animate camera to a new position and target
     */
    animateCameraTo(targetPosition, newCameraPosition) {
        const startPosition = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const endPosition = newCameraPosition;
        const endTarget = targetPosition.clone();
        
        const duration = 1000; // 1 second animation
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Use easing function for smooth animation
            const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
            
            // Interpolate camera position
            this.camera.position.lerpVectors(startPosition, endPosition, easeProgress);
            
            // Interpolate controls target
            this.controls.target.lerpVectors(startTarget, endTarget, easeProgress);
            
            // Update controls
            this.controls.update();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    /**
     * Handle mouse move events for hover effects
     */
    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(
            Array.from(this.wordObjects.values()).map(obj => obj.sphere)
        );

        // Reset all spheres to normal size
        this.wordObjects.forEach(({ sphere }) => {
            sphere.scale.set(1, 1, 1);
        });

        // Highlight hovered sphere
        if (intersects.length > 0) {
            const hoveredObject = intersects[0].object;
            hoveredObject.scale.set(1.5, 1.5, 1.5);
            
            const word = this.findWordBySphere(hoveredObject);
            if (word && this.hoverHandler) {
                this.hoverHandler(word);
            }
        }
    }

    /**
     * Find word by sphere object
     */
    findWordBySphere(sphere) {
        for (const [word, { sphere: wordSphere }] of this.wordObjects) {
            if (wordSphere === sphere) {
                return word;
            }
        }
        return null;
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(window.devicePixelRatio); // Maintain high DPI
        this.renderer.setSize(width, height);
    }

    /**
     * Set click handler
     */
    setClickHandler(handler) {
        this.clickHandler = handler;
    }

    /**
     * Set hover handler
     */
    setHoverHandler(handler) {
        this.hoverHandler = handler;
    }

    /**
     * Speak word on hover
     */
    speakWord(word) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(word);
            utterance.rate = 0.8;
            utterance.pitch = 1.0;
            speechSynthesis.speak(utterance);
        }
    }

    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update controls
        this.controls.update();
        
        // Make text always face camera (billboard behavior) - completely flat to viewport
        this.scene.traverse((object) => {
            if (object.userData && object.userData.isTextMesh) {
                // Copy the camera's rotation to make text flat to viewport
                object.quaternion.copy(this.camera.quaternion);
            }
        });
        
        // Update text opacity based on distance from camera
        this.updateTextOpacity();
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Update text opacity based on distance from camera
     */
    updateTextOpacity() {
        this.wordObjects.forEach(({ text }, word) => {
            if (text && text.material) {
                const distanceFromCamera = this.camera.position.distanceTo(text.position);
                const maxDistance = 10.0; // Maximum distance for full opacity
                const fadeFactor = Math.max(0.3, 1.0 - (distanceFromCamera / maxDistance));
                text.material.opacity = fadeFactor;
            }
        });
    }

    /**
     * Update mix point position (simplified - just move existing mix point)
     */
    updateMixPoint(mixedVector) {
        // For now, we'll just keep the existing mix point
        // In a full implementation, we'd calculate the new position based on the mixed vector
        // and update the mix point's position
        console.log('Mix point update requested with vector:', mixedVector);
    }

    /**
     * Cleanup resources
     */
    dispose() {
        this.clearWordObjects();
        this.renderer.dispose();
        this.controls.dispose();
        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
