import * as hdrify_rusty from "./build/hdrify_rusty.generated.js";
const { hdrify_image_as_png } = hdrify_rusty.instantiate();

// DOM Elements
const elements = {
  fileInput: document.getElementById('file-input'),
  uploadZone: document.getElementById('upload-zone'),
  processBtn: document.getElementById('process-btn'),
  inputPreview: document.getElementById('input-preview'),
  outputPreview: document.getElementById('output-preview'),
  inputPlaceholder: document.getElementById('input-placeholder'),
  outputPlaceholder: document.getElementById('output-placeholder'),
  downloadBtn: document.getElementById('download-btn'),
  modeRadios: document.querySelectorAll('input[name="mode"]')
};

// App state
const state = {
  selectedFile: null
};

// UI elements
const UI = {
  spinner: '<div class="spinner"></div>',

  showSpinner() {
    elements.processBtn.innerHTML = this.spinner + '<span style="vertical-align: middle">Processing</span>';
  },

  hideSpinner() {
    elements.processBtn.innerHTML = 'Process Image';
  },

  updateProcessButtonState() {
    elements.processBtn.disabled = !(
      elements.fileInput.files.length > 0
    );
  },

  displayInputImage(dataUrl) {
    elements.inputPreview.src = dataUrl;
    elements.inputPreview.style.display = 'block';
    elements.inputPlaceholder.style.display = 'none';
  },

  displayOutputImage(url, filename, mode) {
    elements.outputPreview.src = url;
    elements.outputPreview.style.display = 'block';
    elements.outputPlaceholder.style.display = 'none';
    elements.downloadBtn.href = url;
    elements.downloadBtn.style.display = 'inline-flex';
    elements.downloadBtn.download = `hdrified_${mode}_${filename.split('.')[0]}.png`;
  },

  updateUploadZoneBorder(color) {
    elements.uploadZone.style.borderColor = color;
  }
};

// Core functionality
const ImageProcessor = {
  async initialize() {
    UI.updateProcessButtonState();
  },

  getSelectedMode() {
    for (const radio of elements.modeRadios) {
      if (radio.checked) {
        return radio.value;
      }
    }
    return 'sane'; // Default to sane mode
  },

  async processImage() {
    if (!elements.fileInput.files.length) return;

    try {
      // Update UI
      elements.processBtn.disabled = true;
      UI.showSpinner();

      // Prepare image data
      const file = elements.fileInput.files[0];
      const arrayBuffer = await file.arrayBuffer();
      const inputImageData = new Uint8Array(arrayBuffer);

      const mode = this.getSelectedMode();

      const outputData = hdrify_image_as_png(inputImageData, mode);

      const blob = new Blob([outputData], { type: 'image/png' });
      const url = URL.createObjectURL(blob);

      UI.displayOutputImage(url, file.name, mode);
      elements.processBtn.disabled = false;
      UI.hideSpinner();
    } catch (error) {
      elements.processBtn.disabled = false;
      UI.hideSpinner();
      console.error('Processing error:', error);
    }
  }
};

// Event handlers
function handleFileSelect(file) {
  if (!file) return;

  state.selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    UI.displayInputImage(e.target.result);
    UI.updateProcessButtonState();
  };
  reader.readAsDataURL(file);
}

// Event listeners
function setupEventListeners() {
  elements.uploadZone.addEventListener('click', () => elements.fileInput.click());

  elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    UI.updateUploadZoneBorder('#666');
  });

  elements.uploadZone.addEventListener('dragleave', () => {
    UI.updateUploadZoneBorder('#ccc');
  });

  elements.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    UI.updateUploadZoneBorder('#ccc');

    if (e.dataTransfer.files.length) {
      elements.fileInput.files = e.dataTransfer.files;
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  elements.fileInput.addEventListener('change', () => {
    handleFileSelect(elements.fileInput.files[0]);
  });

  elements.processBtn.addEventListener('click', () => ImageProcessor.processImage());

  // Add mode change listener to update UI accordingly
  elements.modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (elements.outputPreview.style.display !== 'none') {
        elements.outputPlaceholder.style.display = 'block';
        elements.outputPreview.style.display = 'none';
        elements.downloadBtn.style.display = 'none';
      }
    });
  });
}

// Initialize the application
async function init() {
  await ImageProcessor.initialize();
  setupEventListeners();
}

init();
