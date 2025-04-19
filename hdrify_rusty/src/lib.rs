use std::io::Cursor;

use js_sys::Uint8Array;
use png::chunk::ChunkType;
use png::Encoder;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hdrify_image_as_png(original: Uint8Array) -> Result<Uint8Array, String> {
    return hdrify_image_as_png_impl(original).map_err(|e| e.to_string());

    fn hdrify_image_as_png_impl(original: Uint8Array) -> Result<Uint8Array, anyhow::Error> {
        let original_bytes = original.to_vec();
        let generic = image::load_from_memory(&original_bytes)?;

        let rgba = generic.to_rgba8();
        let (width, height) = rgba.dimensions();

        let _chaos_icc_profile = include_bytes!("../../chaos.icc");
        let _sane_icc_profile = include_bytes!("../../sane.icc");
        let rusty_icc_profile = include_bytes!("../../rusty.icc");

        let icc_profile = rusty_icc_profile.to_vec();

        let mut output = Vec::new();
        {
            let mut output_cursor = Cursor::new(&mut output);
            let mut encoder = Encoder::new(&mut output_cursor, width, height);

            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);

            let mut writer = encoder.write_header()?;

            writer.write_chunk(ChunkType(*b"iCCP"), &create_iccp_chunk_data(&icc_profile)?)?;

            writer.write_image_data(&rgba)?;
        }

        let result = Uint8Array::new_with_length(output.len().try_into()?);
        result.copy_from(&output);

        Ok(result)
    }

    fn create_iccp_chunk_data(icc_data: &[u8]) -> Result<Vec<u8>, anyhow::Error> {
        // Profile name: "ICC Profile" + null terminator
        let mut chunk_data = b"ICC Profile\0".to_vec();

        // Compression method: 0 (deflate/zlib)
        chunk_data.push(0);

        let mut compressed_data = Vec::new();
        {
            let mut compressor = flate2::write::ZlibEncoder::new(
                &mut compressed_data,
                flate2::Compression::default(),
            );
            std::io::copy(&mut std::io::Cursor::new(icc_data), &mut compressor)?;
            compressor.finish()?;
        }
        chunk_data.extend_from_slice(&compressed_data);

        Ok(chunk_data)
    }
}
