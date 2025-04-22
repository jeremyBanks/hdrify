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
  workers: [],
  workerStates: [], // 0 = not ready, 1 = ready and idle, 2 = busy
  requestMap: new Map(),
  requestCounter: 0,
  nextWorkerIndex: 0
};

// Available processing modes with their display names - HLG first
const MODES = [
  { id: 'bt2100-hlg', suffix: "hdr-hlg", name: 'BT.2100 HLG (Sane)', description: 'BT.2100 Hybrid Log-Gamma Full-Range (Sane)' },
  { id: 'bt2100-pq', suffix: "hdr-pq", name: 'BT.2100 PQ (Chaos)', description: 'BT.2100 Perceptual Quantizer Full-Range (Chaos)' },
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
    
    panel.appendChild(label);
    panel.appendChild(container);
    
    return { panel, container };
  },

  displayImage(url, filename, mode, container, isOriginal = false) {
    // Remove any existing image and spinner
    const existingImage = container.querySelector('img');
    const existingLink = container.querySelector('a');
    const processingOverlay = container.querySelector('.processing-overlay');
    
    if (existingImage) existingImage.remove();
    if (existingLink) existingLink.remove();
    if (processingOverlay) processingOverlay.remove();
    
    // Create the image element
    const img = document.createElement('img');
    img.src = url;
    
    // Create a download link for all images including original
    const link = document.createElement('a');
    link.href = url;
    
    // Keep the original filename in the download name
    const baseFilename = filename.split('.')[0]; 
    const extension = filename.split('.').pop() || 'png';
    
    if (isOriginal) {
      link.download = filename;
    } else {
      link.download = `${baseFilename}-${mode.suffix}.${extension}`;
    }
    
    link.title = isOriginal 
      ? `Download original image` 
      : `Download as ${mode.description}`;
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

// Worker Pool Management
const WorkerPool = {
  initWorkers() {
    // Clean up any existing workers
    this.terminateAllWorkers();
    
    // Determine the number of workers to use based on available cores
    // Use half the available cores, but at least 1 and at most 4
    const numCores = navigator.hardwareConcurrency || 4;
    const workerCount = Math.max(1, Math.min(4, Math.floor(numCores / 2)));
    
    console.log(`Initializing ${workerCount} workers (${numCores} cores detected)`);
    
    // Create the workers
    for (let i = 0; i < workerCount; i++) {
      this.createWorker(i);
    }
  },
  
  createWorker(index) {
    const worker = new Worker('./worker.js', { type: 'module' });
    
    state.workers[index] = worker;
    state.workerStates[index] = 0; // Not ready yet
    
    worker.onmessage = (event) => {
      const data = event.data;
      
      if (data.type === 'ready') {
        state.workerStates[index] = 1; // Ready and idle
        console.log(`Worker ${index} is ready`);
        this.processQueue();
      } 
      else if (data.type === 'success') {
        const request = state.requestMap.get(data.id);
        if (request) {
          state.workerStates[index] = 1; // Mark as idle again
          request.resolve(data.result);
          state.requestMap.delete(data.id);
          this.processQueue(); // Process next item in queue
        }
      } 
      else if (data.type === 'error') {
        const request = state.requestMap.get(data.id);
        if (request) {
          state.workerStates[index] = 1; // Mark as idle again
          request.reject(new Error(data.error));
          state.requestMap.delete(data.id);
          this.processQueue(); // Process next item in queue
        } else {
          console.error('Worker error:', data.error);
        }
      }
    };
    
    worker.onerror = (error) => {
      console.error(`Worker ${index} error:`, error);
      state.workerStates[index] = 0; // Mark as not working
    };
  },

  terminateAllWorkers() {
    for (let i = 0; i < state.workers.length; i++) {
      if (state.workers[i]) {
        state.workers[i].terminate();
      }
    }
    state.workers = [];
    state.workerStates = [];
    state.requestMap.clear();
  },

  // Get the next available worker index
  getAvailableWorkerIndex() {
    // First check if there's an idle worker
    for (let i = 0; i < state.workerStates.length; i++) {
      if (state.workerStates[i] === 1) {
        return i;
      }
    }
    return -1; // No workers available
  },

  async processWithWorker(imageData, mode) {
    return new Promise((resolve, reject) => {
      const processTask = () => {
        const workerIndex = this.getAvailableWorkerIndex();
        
        if (workerIndex >= 0) {
          const id = state.requestCounter++;
          state.requestMap.set(id, { resolve, reject });
          state.workerStates[workerIndex] = 2; // Mark as busy
          
          // Clone the data to send to the worker
          const clonedData = new Uint8Array(imageData);
          
          state.workers[workerIndex].postMessage({
            id,
            imageData: clonedData,
            mode
          }, [clonedData.buffer]);
        } else {
          // No worker available, add to queue
          state.processingQueue.push(processTask);
        }
      };
      
      // Try to process immediately if a worker is available
      processTask();
    });
  },

  processQueue() {
    if (state.processingQueue.length > 0) {
      const workerIndex = this.getAvailableWorkerIndex();
      if (workerIndex >= 0) {
        const nextTask = state.processingQueue.shift();
        nextTask();
      }
    }
  },
  
  // Check if all workers are ready
  areAllWorkersReady() {
    return state.workerStates.every(state => state === 1);
  }
};

// Core functionality
const ImageProcessor = {
  async initialize() {
    // Initialize the worker pool
    WorkerPool.initWorkers();
    
    // Load default image (xp.png)
    try {
      const response = await fetch('xp.png');
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], 'xp.png', { type: 'image/png' });
        // Wait a moment for workers to initialize
        setTimeout(() => handleFileSelect(file), 500);
      } else {
        console.error('Could not load default image');
      }
    } catch (error) {
      console.error('Error loading default image:', error);
    }
  },

  // Process an image with a specific mode using the worker pool
  async processWithMode(file, mode) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const inputImageData = new Uint8Array(arrayBuffer);
      
      // Use the worker pool to process the image
      const outputData = await WorkerPool.processWithWorker(inputImageData, mode.id);
      
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
