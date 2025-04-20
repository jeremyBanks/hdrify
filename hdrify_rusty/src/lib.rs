use std::{error::Error, io::Cursor};

use image::{DynamicImage, Rgba};
use js_sys::Uint8Array;
use png::{chunk::cICP, Encoder};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hdrify_image_as_png(
    original: Uint8Array,
    mode: Option<String>,
) -> Result<Uint8Array, String> {
    // Convert input JavaScript Uint8Array to Vec<u8>.
    let original_bytes = original.to_vec();

    // HDRify it, producing bytes of an HDR PNG image.
    let result_bytes = hdrify_image_as_png_impl(
        &original_bytes,
        match mode {
            Some(mode) => match mode.as_str() {
                "chaos" => HdrifyMode::Chaos,
                "sane" => HdrifyMode::Sane,
                _ => return Err(format!("Unknown mode: {mode}")),
            },
            None => HdrifyMode::default(),
        },
    )
    .map_err(|error| format!("{error:#?}"))?;

    // Convert result Vec<u8> to JavaScript Uint8Array.
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

fn hdrify_image_as_png_impl(original: &[u8], mode: HdrifyMode) -> Result<Vec<u8>, Box<dyn Error>> {
    // Load any supported image (see `image` crate features defined in ./Cargo.toml).
    let generic = image::load_from_memory(&original)?;

    // Convert to precise and convenient f32 RGBA for editing
    let mut rgba_f32 = generic.to_rgba32f();
    let (width, height) = rgba_f32.dimensions();

    // Apply mode-specific effects
    if mode == HdrifyMode::Chaos {
        rgba_f32.pixels_mut().for_each(|pixel| {
            let Rgba([r, g, b, a]) = *pixel;

            *pixel = Rgba([
                (r * 1.5).powf(0.9).clamp(0.0, 1.0),
                (g * 1.5).powf(0.9).clamp(0.0, 1.0),
                (b * 1.5).powf(0.9).clamp(0.0, 1.0),
                a,
            ]);
        });
    }

    // Convert to u16 RGBA for PNG encoding
    let rgb_u16: image::ImageBuffer<Rgba<u16>, Vec<u16>> = DynamicImage::from(rgba_f32).to_rgba16();

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
            rgb_u16
                .iter()
                // ensure multi-byte values are in big-endian order
                .flat_map(|value| value.to_be_bytes())
                .collect::<Vec<u8>>()
                .as_ref(),
        )?;
    }

    Ok(result)
}
