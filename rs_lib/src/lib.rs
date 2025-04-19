use std::io::Cursor;

use image::ImageReader;
use js_sys::Uint8Array;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hdrify_png(original: Uint8Array) -> Result<Uint8Array, String> {
    return hdrify_png(original).map_err(|e| e.to_string());

    fn hdrify_png(original: Uint8Array) -> Result<Uint8Array, anyhow::Error> {
        let image = ImageReader::new(Cursor::new(original.to_vec()))
            .with_guessed_format()?
            .decode()?;

        let image = image.brighten(100);

        let mut output = Vec::<u8>::new();
        image.write_to(&mut Cursor::new(&mut output), image::ImageFormat::Png)?;
        let result = Uint8Array::new_with_length(output.len().try_into()?);
        result.copy_from(&output);

        Ok(result)
    }
}
