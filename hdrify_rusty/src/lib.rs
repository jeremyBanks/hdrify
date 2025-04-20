use std::io::Cursor;

use image::Rgba;
use js_sys::Uint8Array;
use png::{chunk::cICP, Encoder};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hdrify_image_as_png(
    original: Uint8Array,
    mode: Option<String>,
) -> Result<Uint8Array, String> {
    let original_bytes = original.to_vec();

    let mode = match mode {
        Some(mode) => match mode.as_str() {
            "chaos" => HdrifyMode::Chaos,
            "sane" => HdrifyMode::Sane,
            _ => return Err(format!("Unknown mode: {mode}")),
        },
        None => HdrifyMode::default(),
    };

    let result_bytes = hdrify_image_as_png_impl(&original_bytes, mode)
        .map_err(|error| format!("{:#?}", anyhow::Error::from(error)))?;

    let result = Uint8Array::new_with_length(
        result_bytes
            .len()
            .try_into()
            .expect("image should not be larger than 4GiB"),
    );
    result.copy_from(&result_bytes);

    Ok(result)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
enum HdrifyMode {
    Chaos,
    #[default]
    Sane,
}

fn hdrify_image_as_png_impl(original: &[u8], mode: HdrifyMode) -> Result<Vec<u8>, anyhow::Error> {
    let generic = image::load_from_memory(&original)?;

    let mut rgba16 = generic.to_rgba16();
    let (width, height) = rgba16.dimensions();

    if mode == HdrifyMode::Chaos {
        rgba16.pixels_mut().for_each(|pixel| {
            let [r, g, b, a] = pixel.0;

            fn multiply(value: u16) -> u16 {
                (value as f64 * 1.5).clamp(0.0, u16::MAX as f64) as u16
            }

            fn exponentiate(value: u16) -> u16 {
                ((value as f64 / u16::MAX as f64).powf(0.9) * (u16::MAX as f64)) as u16
            }

            *pixel = Rgba([
                exponentiate(multiply(r)),
                exponentiate(multiply(g)),
                exponentiate(multiply(b)),
                a,
            ]);
        });
    }

    let mut result = Vec::new();

    {
        let mut result_cursor = Cursor::new(&mut result);
        let mut encoder = Encoder::new(&mut result_cursor, width, height);

        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Sixteen);

        encoder.set_compression(png::Compression::Best);
        encoder.set_adaptive_filter(png::AdaptiveFilterType::Adaptive);

        let mut writer = encoder.write_header()?;

        // Enable HDR
        writer.write_chunk(
            cICP,
            &[
                0x09, // Color Primaries: BT.2020
                0x10, // Transfer Function: PQ
                0x00, // Matrix: None/Reserved
                0x01, // Range: Full
            ],
        )?;

        writer.write_image_data(
            rgba16
                .to_vec()
                .iter()
                .flat_map(|value| value.to_be_bytes())
                .collect::<Vec<u8>>()
                .as_ref(),
        )?;
    }

    Ok(result)
}
