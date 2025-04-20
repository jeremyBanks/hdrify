# HDRify

A web application that applies HDR-like effects to images using WebAssembly and Rust.

## About

HDRify allows you to apply custom color profiles to images to give them an HDR-like appearance. This tool is inspired by the blog post [HDR-Infused Emoji](https://sharpletters.net/2025/04/16/hdr-emoji/) by Corry Haines.

The application uses the Rust `image` and `png` crates compiled to WebAssembly to process images directly in the browser without requiring server-side processing.

## Features

- Two processing modes:
  - **Sane Mode**: Applies a more subtle HDR effect
  - **Chaos Mode**: Applies a more dramatic HDR effect with enhanced colors
- Drag-and-drop file uploads
- Direct download of processed images
- Responsive design for both desktop and mobile devices
- No server-side processing - everything happens in your browser

## How It Works

1. Upload an image using the drag-and-drop zone or file selector
2. Choose between "Sane Mode" or "Chaos Mode"
3. Click "Process Image" to apply the selected HDR effect
4. View the result and download the processed image

## Rebuilding the WebAssembly Module

If you make changes you the Rust code in `hdrify_rusty/`, you can rebuild the
WASM bundle using by running:

```bash
deno task build
```

This requires [Rust](https://rust-lang.org/) and [Deno](https://deno.com/).

## Running Locally

Due to browser security restrictions, you need to serve the application from a web server rather than opening the HTML file directly. Here are a few simple ways to run it locally (all examples bind to localhost only for security):

### Using Deno

If you have Deno installed, you can start a simple HTTP server with `deno task start` or:

```bash
deno run --allow-net --allow-read jsr:@std/http/file-server --host=127.0.0.1 --port 8000
```

Then visit `http://localhost:8000` in your browser.

### Using Ruby

If you have Ruby installed, you can start a simple HTTP server:

```bash
ruby -run -ehttpd . -p8000 --bind-address=127.0.0.1
```

Then visit `http://localhost:8000` in your browser.

### Using Python

If you have Python installed, you can start a simple HTTP server:

```bash
# Python 3
python -m http.server 8000 --bind 127.0.0.1

# Python 2
python -m SimpleHTTPServer 8000  # Note: Python 2 doesn't support binding to specific address
```

Then visit `http://localhost:8000` in your browser.

### Using Node.js

If you have Node.js installed, you can use a simple server like `http-server`:

```bash
# Install http-server globally if you haven't already
npm install -g http-server

# Run the server (localhost only)
http-server -p 8000 -a 127.0.0.1
```

Then visit `http://localhost:8000` in your browser.

### Using PHP

If you have PHP installed:

```bash
php -S 127.0.0.1:8000
```

Then visit `http://localhost:8000` in your browser.

## License

Original code is licensed under the MIT License.

## Credits

- Created by Cristian Rivera
- Inspired by [HDR-Infused Emoji](https://sharpletters.net/2025/04/16/hdr-emoji/) by Corry Haines
- Contributions by Jeremy Banks
