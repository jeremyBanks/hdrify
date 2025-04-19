use std::io::Cursor;

use js_sys::Uint8Array;
use png::chunk::ChunkType;
use png::{Decoder, Encoder};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hdrify_png(original: Uint8Array) -> Result<Uint8Array, String> {
    return hdrify_png_impl(original).map_err(|e| e.to_string());

    fn hdrify_png_impl(original: Uint8Array) -> Result<Uint8Array, anyhow::Error> {
        // Create cursor for reading the input bytes
        let bytes = original.to_vec();
        let mut reader = Cursor::new(&bytes);

        // Decode the PNG
        let decoder = Decoder::new(&mut reader);
        let mut reader = decoder.read_info()?;

        // Get PNG metadata
        let info = reader.info();
        let width = info.width;
        let height = info.height;
        let color_type = info.color_type;
        let bit_depth = info.bit_depth;
        let bytes_per_pixel = color_type.samples() * bit_depth as usize / 8;

        // Allocate buffer for the image data
        let mut buffer = vec![0; height as usize * width as usize * bytes_per_pixel];

        // Read the image data into the buffer
        reader.next_frame(&mut buffer)?;

        // Load the ICC profile
        // We have two profiles in the workspace: sane.icc and chaos.icc
        // For an HDR profile, chaos.icc is likely more appropriate as it probably has a wider gamut
        let icc_profile = include_bytes!("../../chaos.icc").to_vec();

        // Create a new PNG encoder with our data
        let mut output = Vec::new();
        {
            let mut output_cursor = Cursor::new(&mut output);
            let mut encoder = Encoder::new(&mut output_cursor, width, height);

            // Set the same color type and bit depth as the original
            encoder.set_color(color_type);
            encoder.set_depth(bit_depth);

            // Write the header
            let mut writer = encoder.write_header()?;

            // Prepare the ICC profile chunk data
            let chunk_data = create_iccp_chunk_data(&icc_profile)?;

            // Add the ICC profile chunk before writing the image data
            // The "iCCP" chunk type is used for embedding ICC profiles in PNG images
            let iccp_type = ChunkType([b'i', b'C', b'C', b'P']);
            writer.write_chunk(iccp_type, &chunk_data)?;

            // Write the image data
            writer.write_image_data(&buffer)?;
        }

        // Copy the output to a Uint8Array to return to JavaScript
        let result = Uint8Array::new_with_length(output.len().try_into()?);
        result.copy_from(&output);

        Ok(result)
    }

    // Helper function to create ICC profile chunk data
    fn create_iccp_chunk_data(icc_data: &[u8]) -> Result<Vec<u8>, anyhow::Error> {
        // The chunk data format: profile name (null-terminated) +
        // compression method (1 byte, 0 = deflate) + compressed profile

        // Profile name: "ICC Profile" + null terminator
        let mut chunk_data = b"ICC Profile\0".to_vec();

        // Compression method: 0 (deflate/zlib)
        chunk_data.push(0);

        // Compress the ICC profile data with deflate
        let mut compressed_data = Vec::new();
        {
            let mut compressor = flate2::write::ZlibEncoder::new(
                &mut compressed_data,
                flate2::Compression::default(),
            );
            std::io::copy(&mut std::io::Cursor::new(icc_data), &mut compressor)?;
            compressor.finish()?;
        }

        // Add the compressed data to the chunk data
        chunk_data.extend_from_slice(&compressed_data);

        Ok(chunk_data)
    }
}
