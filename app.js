import * as hdrify_rusty from "./build/hdrify_rusty.generated.js";
const { hdrify_image_as_png } = hdrify_rusty.instantiate();

// DOM Elements
const elements = {
  fileInput: document.getElementById('file-input'),
  uploadZone: document.getElementById('upload-zone'),
  outputsContainer: document.getElementById('outputs-container'),
  dropIndicator: document.getElementById('drop-indicator')
};

// App state
const state = {
  selectedFile: null,
  processingQueue: [],
  isProcessing: false,
  worker: null,
  workerReady: false,
  requestMap: new Map(),
  requestCounter: 0
};

// Available processing modes with their display names - HLG first
const MODES = [
  { id: 'bt2100-hlg', name: 'BT2100-HLG (Sane)', description: 'BT2100 Hybrid Log-Gamma format' },
  { id: 'bt2100-pq', name: 'BT2100-PQ (Intense)', description: 'BT2100 Perceptual Quantizer format' },
  { id: 'chaos', name: 'Chaos', description: 'Enhanced brightness with high dynamic range' }
];

// UI Helpers
const UI = {
  createSpinner() {
    return '<div class="spinner"></div>';
  },

  createProcessingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'processing-overlay';
    overlay.innerHTML = this.createSpinner() + '<span>Processing...</span>';
    return overlay;
  },

  createOutputPanel(mode, isOriginal = false) {
    const panel = document.createElement('div');
    panel.className = 'image-panel';
    panel.dataset.mode = isOriginal ? 'original' : mode.id;
    
    const label = document.createElement('div');
    label.className = 'image-label';
    
    if (isOriginal) {
      label.textContent = 'Original';
    } else {
      label.textContent = mode.name;
      // Add tooltip with technical description
      panel.title = mode.description;
    }
    
    const container = document.createElement('div');
    container.className = 'image-container';
    
    const placeholder = document.createElement('div');
    placeholder.className = 'image-placeholder';
    placeholder.textContent = isOriginal ? 'No image selected' : 'Processing...';
    
    container.appendChild(placeholder);
    panel.appendChild(label);
    panel.appendChild(container);
    
    return { panel, container, placeholder };
  },

  displayImage(url, filename, mode, container, isOriginal = false) {
    // Remove any existing image and placeholder
    const existingImage = container.querySelector('img');
    const existingLink = container.querySelector('a');
    const placeholder = container.querySelector('.image-placeholder');
    const processingOverlay = container.querySelector('.processing-overlay');
    
    if (existingImage) existingImage.remove();
    if (existingLink) existingLink.remove();
    if (placeholder) placeholder.remove();
    if (processingOverlay) processingOverlay.remove();
    
    // Create the image element
    const img = document.createElement('img');
    img.src = url;
    
    // Create a download link for all images including original
    const link = document.createElement('a');
    link.href = url;
    link.download = isOriginal 
      ? `original_${filename}` 
      : `hdrified_${mode.id}_${filename.split('.')[0]}.png`;
    link.title = isOriginal 
      ? `Download original image` 
      : `Download ${mode.name} version`;
    link.appendChild(img);
    container.appendChild(link);
  },

  clearOutputs() {
    elements.outputsContainer.innerHTML = '';
  },

  setDragOverState(isDragging) {
    document.body.classList.toggle('drag-over', isDragging);
  }
};

// Worker Management
const WorkerManager = {
  initWorker() {
    if (state.worker) {
      state.worker.terminate();
    }

    state.worker = new Worker('./worker.js', { type: 'module' });
    state.workerReady = false;
    state.requestMap.clear();

    state.worker.onmessage = (event) => {
      const data = event.data;

      if (data.type === 'ready') {
        state.workerReady = true;
        console.log('Worker is ready');
        this.processQueue();
      } 
      else if (data.type === 'success') {
        const request = state.requestMap.get(data.id);
        if (request) {
          request.resolve(data.result);
          state.requestMap.delete(data.id);
        }
      } 
      else if (data.type === 'error') {
        const request = state.requestMap.get(data.id);
        if (request) {
          request.reject(new Error(data.error));
          state.requestMap.delete(data.id);
        } else {
          console.error('Worker error:', data.error);
        }
      }
    };

    state.worker.onerror = (error) => {
      console.error('Worker error:', error);
    };
  },

  async processWithWorker(imageData, mode) {
    return new Promise((resolve, reject) => {
      const id = state.requestCounter++;
      
      state.requestMap.set(id, { resolve, reject });
      
      state.worker.postMessage({
        id,
        imageData,
        mode
      }, [imageData.buffer]);
    });
  },

  processQueue() {
    if (state.processingQueue.length > 0 && state.workerReady) {
      const nextItem = state.processingQueue.shift();
      nextItem();
    }
  },

  addToQueue(callback) {
    state.processingQueue.push(callback);
    this.processQueue();
  }
};

// Core functionality
const ImageProcessor = {
  async initialize() {
    // Initialize the worker
    WorkerManager.initWorker();
    
    // Load default image (xp.png)
    try {
      const response = await fetch('xp.png');
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], 'xp.png', { type: 'image/png' });
        handleFileSelect(file);
      } else {
        console.error('Could not load default image');
      }
    } catch (error) {
      console.error('Error loading default image:', error);
    }
  },

  // Process an image with a specific mode using the worker
  async processWithMode(file, mode) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const inputImageData = new Uint8Array(arrayBuffer);
      
      // Use the worker to process the image
      const outputData = await WorkerManager.processWithWorker(inputImageData, mode.id);
      
      return {
        mode,
        outputData
      };
    } catch (error) {
      console.error(`Error processing with mode ${mode.id}:`, error);
      throw error;
    }
  },

  // Process an image with all modes
  async processImage(file) {
    if (!file) return;
    
    // Clear previous outputs
    UI.clearOutputs();
    
    // Create the original panel
    const originalPanel = UI.createOutputPanel(null, true);
    elements.outputsContainer.appendChild(originalPanel.panel);
    
    // Create panels for all modes
    const panels = MODES.map(mode => {
      const panel = UI.createOutputPanel(mode);
      elements.outputsContainer.appendChild(panel.panel);
      panel.container.appendChild(UI.createProcessingOverlay());
      return { mode, panel };
    });
    
    // Display the original image
    const originalUrl = URL.createObjectURL(file);
    UI.displayImage(originalUrl, file.name, null, originalPanel.container, true);
    
    try {
      // Process all modes in parallel
      const results = await Promise.all(
        panels.map(({ mode }) => this.processWithMode(file, mode))
      );
      
      // Display results
      for (const result of results) {
        const panel = panels.find(p => p.mode.id === result.mode.id).panel;
        const blob = new Blob([result.outputData], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        
        UI.displayImage(url, file.name, result.mode, panel.container);
      }
    } catch (error) {
      console.error('Processing error:', error);
    }
  }
};

// Event handlers
function handleFileSelect(file) {
  if (!file) return;

  state.selectedFile = file;
  
  // Process immediately when a file is selected
  ImageProcessor.processImage(file);
}

// Event listeners
function setupEventListeners() {
  // Upload zone click
  elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
  
  // File input change
  elements.fileInput.addEventListener('change', () => {
    handleFileSelect(elements.fileInput.files[0]);
  });
  
  // Upload zone drag events
  elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadZone.style.borderColor = '#666';
  });
  
  elements.uploadZone.addEventListener('dragleave', () => {
    elements.uploadZone.style.borderColor = '#ccc';
  });
  
  elements.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadZone.style.borderColor = '#ccc';
    
    if (e.dataTransfer.files.length) {
      elements.fileInput.files = e.dataTransfer.files;
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });
  
  // Document-wide drag events
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    UI.setDragOverState(true);
  });
  
  document.addEventListener('dragleave', (e) => {
    // Only consider it a leave if we're moving outside the document
    if (e.clientX <= 0 || e.clientY <= 0 || 
        e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      UI.setDragOverState(false);
    }
  });
  
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    UI.setDragOverState(false);
    
    if (e.dataTransfer.files.length && e.dataTransfer.files[0].type.startsWith('image/')) {
      elements.fileInput.files = e.dataTransfer.files;
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });
}

// Initialize the application
async function init() {
  await ImageProcessor.initialize();
  setupEventListeners();
}

init();
