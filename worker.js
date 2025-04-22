// Import the Rust WASM module
import * as hdrify_rusty from "./build/hdrify_rusty.generated.js";

// Main worker initialization
(async function() {
  try {
    // Initialize the WASM module
    const { hdrify_image_as_png } = await hdrify_rusty.instantiate();
    
    // Listen for messages from the main thread
    self.onmessage = async (event) => {
      try {
        const { id, imageData, mode } = event.data;
        
        // Process the image with the specified mode
        const result = hdrify_image_as_png(imageData, mode);
        
        // Send the processed image back to the main thread
        self.postMessage({
          id,
          type: 'success',
          result
        }, [result.buffer]);
      } catch (error) {
        // Send any errors back to the main thread
        self.postMessage({
          id,
          type: 'error',
          error: error.message
        });
      }
    };
    
    // Signal that the worker is ready
    self.postMessage({ type: 'ready' });
  } catch (error) {
    // Send initialization errors back to the main thread
    self.postMessage({
      type: 'error',
      error: `Worker initialization failed: ${error.message}`
    });
  }
})();