use std::io::Cursor;

use js_sys::Uint8Array;
use png::chunk::ChunkType;
use png::{Decoder, Encoder};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hdrify_png(original: Uint8Array) -> Result<Uint8Array, String> {
    return hdrify_png_impl(original).map_err(|e| e.to_string());

    fn hdrify_png_impl(original: Uint8Array) -> Result<Uint8Array, anyhow::Error> {
        // TODO: use image crate to convert non-PNGs into PNGs

        let bytes = original.to_vec();
        let mut reader = Cursor::new(&bytes);

        let decoder = Decoder::new(&mut reader);
        let mut reader = decoder.read_info()?;

        let info = reader.info();
        let width = info.width;
        let height = info.height;
        let color_type = info.color_type;
        let bit_depth = info.bit_depth;
        let bytes_per_pixel = color_type.samples() * bit_depth as usize / 8;

        let mut buffer = vec![0; height as usize * width as usize * bytes_per_pixel];

        reader.next_frame(&mut buffer)?;

        let _chaos_icc_profile = include_bytes!("../../chaos.icc");
        let _sane_icc_profile = include_bytes!("../../sane.icc");
        let rusty_icc_profile = include_bytes!("../../rusty.icc");

        let icc_profile = rusty_icc_profile.to_vec();

        let mut output = Vec::new();
        {
            let mut output_cursor = Cursor::new(&mut output);
            let mut encoder = Encoder::new(&mut output_cursor, width, height);

            encoder.set_color(color_type);
            encoder.set_depth(bit_depth);

            let mut writer = encoder.write_header()?;

            let iccp_type = ChunkType(*b"iCCP");
            writer.write_chunk(iccp_type, &create_iccp_chunk_data(&icc_profile)?)?;

            writer.write_image_data(&buffer)?;
        }

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
