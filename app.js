import * as hdrify_rusty from "./build/hdrify_rusty.generated.js";
const { hdrify_image_as_png } = hdrify_rusty.instantiate();

// DOM Elements
const elements = {
  fileInput: document.getElementById('file-input'),
  uploadZone: document.getElementById('upload-zone'),
  inputPreview: document.getElementById('input-preview'),
  inputPlaceholder: document.getElementById('input-placeholder'),
  outputsContainer: document.getElementById('outputs-container'),
  dropIndicator: document.getElementById('drop-indicator')
};

// App state
const state = {
  selectedFile: null,
  processingQueue: [],
  isProcessing: false
};

// Available processing modes with their display names
const MODES = [
  { id: 'bt2100-pq', name: 'BT2100-PQ' },
  { id: 'bt2100-hlg', name: 'BT2100-HLG' },
  { id: 'chaos', name: 'Chaos Mode' }
];

// UI Helpers
const UI = {
  createSpinner() {
    return '<div class="spinner"></div>';
  },

  createDownloadButton(url, filename, mode) {
    const downloadBtn = document.createElement('a');
    downloadBtn.className = 'download-btn';
    downloadBtn.href = url;
    downloadBtn.download = `hdrified_${mode}_${filename.split('.')[0]}.png`;
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span>Download</span>
    `;
    return downloadBtn;
  },

  createProcessingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'processing-overlay';
    overlay.innerHTML = this.createSpinner() + '<span>Processing...</span>';
    return overlay;
  },

  displayInputImage(dataUrl) {
    elements.inputPreview.src = dataUrl;
    elements.inputPreview.style.display = 'block';
    elements.inputPlaceholder.style.display = 'none';
  },

  createOutputPanel(mode) {
    const panel = document.createElement('div');
    panel.className = 'image-panel';
    panel.dataset.mode = mode.id;
    
    const label = document.createElement('div');
    label.className = 'image-label';
    label.textContent = mode.name;
    
    const container = document.createElement('div');
    container.className = 'image-container';
    
    const placeholder = document.createElement('div');
    placeholder.className = 'image-placeholder';
    placeholder.textContent = 'Processing...';
    
    container.appendChild(placeholder);
    panel.appendChild(label);
    panel.appendChild(container);
    
    return { panel, container, placeholder };
  },

  displayOutputImage(url, filename, mode, container) {
    // Remove any existing image and placeholder
    const existingImage = container.querySelector('img');
    const placeholder = container.querySelector('.image-placeholder');
    const processingOverlay = container.querySelector('.processing-overlay');
    
    if (existingImage) existingImage.remove();
    if (placeholder) placeholder.remove();
    if (processingOverlay) processingOverlay.remove();
    
    // Create and add the new image
    const img = document.createElement('img');
    img.src = url;
    container.appendChild(img);
    
    // Create and add the download button
    const panel = container.closest('.image-panel');
    const existingBtn = panel.querySelector('.download-btn');
    if (existingBtn) existingBtn.remove();
    
    panel.appendChild(this.createDownloadButton(url, filename, mode.id));
  },

  clearOutputs() {
    elements.outputsContainer.innerHTML = '';
  },

  setDragOverState(isDragging) {
    document.body.classList.toggle('drag-over', isDragging);
  }
};

// Core functionality
const ImageProcessor = {
  async initialize() {
    // Load default image (xp.png)
    try {
      const response = await fetch('xp.png');
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], 'xp.png', { type: 'image/png' });
        handleFileSelect(file);
      } else {
        console.error('Could not load default image');
        elements.inputPlaceholder.textContent = 'Could not load default image';
      }
    } catch (error) {
      console.error('Error loading default image:', error);
      elements.inputPlaceholder.textContent = 'Could not load default image';
    }
  },

  // Process an image with a specific mode
  async processWithMode(file, mode) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const inputImageData = new Uint8Array(arrayBuffer);
      
      return {
        mode,
        outputData: hdrify_image_as_png(inputImageData, mode.id)
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
    
    // Create panels for all modes
    const panels = MODES.map(mode => {
      const panel = UI.createOutputPanel(mode);
      elements.outputsContainer.appendChild(panel.panel);
      panel.container.appendChild(UI.createProcessingOverlay());
      return { mode, panel };
    });
    
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
        
        UI.displayOutputImage(url, file.name, result.mode, panel.container);
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
  
  // Display the input image
  const reader = new FileReader();
  reader.onload = (e) => {
    UI.displayInputImage(e.target.result);
    
    // Process immediately when a file is selected
    ImageProcessor.processImage(file);
  };
  reader.readAsDataURL(file);
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
