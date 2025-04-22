use std::{error::Error, io::Cursor};

use image::{DynamicImage, GenericImageView, ImageDecoder, ImageReader, Rgba, Rgba32FImage};
use js_sys::Uint8Array;
use png::{
    Encoder,
    chunk::{cICP, cLLI},
};
use wasm_bindgen::prelude::*;

/// Converts an image to a PNG with HDR-like effects.
#[wasm_bindgen]
pub fn hdrify_image_as_png(image: Uint8Array, mode: Option<String>) -> Result<Uint8Array, String> {
    // Convert input JavaScript Uint8Array to Vec<u8>.
    let image_bytes = image.to_vec();

    // HDRify it, producing bytes of an HDR PNG image.
    let result_bytes = hdrify_image_as_png_impl(
        &image_bytes,
        match mode {
            Some(mode) => match mode.as_str() {
                "chaos" => HdrifyMode::Chaos,
                "bt2100-pq" => HdrifyMode::BT2100PQ,
                "bt2100-hlg" => HdrifyMode::BT2100HLG,
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
    BT2100PQ,
    BT2100HLG,
}

fn hdrify_image_as_png_impl(image: &[u8], mode: HdrifyMode) -> Result<Vec<u8>, Box<dyn Error>> {
    // Load any supported image (see `image` crate features defined in ./Cargo.toml).
    let mut decoder = ImageReader::new(Cursor::new(image))
        .with_guessed_format()?
        .into_decoder()?;
    let orientation = decoder.orientation()?;
    let image = DynamicImage::from_decoder(decoder)?;

    // Convert to precise and convenient f32 RGBA for editing.
    let mut image = DynamicImage::from(image.to_rgba32f());

    // Rotate to match orientation of original image.
    image.apply_orientation(orientation);

    // Scale the image down to a maximum of 1024 on either side if it’s larger.
    let max_dimension = 1024;
    let (width, height) = image.dimensions();
    if width > max_dimension || height > max_dimension {
        image = image.resize(
            max_dimension,
            max_dimension,
            image::imageops::FilterType::Lanczos3,
        );
    }
    let (width, height) = image.dimensions();

    let mut image = Rgba32FImage::try_from(image)?;

    // Apply mode-specific effects
    if mode == HdrifyMode::Chaos {
        image.pixels_mut().for_each(|pixel| {
            let Rgba([r, g, b, a]) = *pixel;

            *pixel = Rgba([r.powf(0.5), g.powf(0.5), b.powf(0.5), a]);
        });
    }

    // Convert to u16 RGBA for PNG encoding
    let image: image::ImageBuffer<Rgba<u16>, Vec<u16>> = DynamicImage::from(image).to_rgba16();

    let image_data = image
        .iter()
        .flat_map(|value| value.to_be_bytes())
        .collect::<Vec<u8>>();

    let mut image = Vec::new();
    let mut encoder = Encoder::new(Cursor::new(&mut image), width, height);

    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Sixteen);

    encoder.set_compression(png::Compression::Best);
    encoder.set_adaptive_filter(png::AdaptiveFilterType::Adaptive);

    let mut writer = encoder.write_header()?;

    // Set appropriate HDR encoding based on mode
    match mode {
        HdrifyMode::BT2100PQ => {
            // BT.2100 PQ (Perceptual Quantizer)
            writer.write_chunk(
                cICP,
                &[
                    0x09, // Color Primaries: BT.2020/BT.2100
                    0x10, // Transfer Function: BT.2100 Perceptual Quantizer (PQ)
                    0x00, // Matrix: N/A
                    0x01, // Range: Full
                ],
            )?;
        }
        HdrifyMode::BT2100HLG => {
            // BT.2100 HLG (Hybrid Log-Gamma)
            writer.write_chunk(
                cICP,
                &[
                    0x09, // Color Primaries: BT.2020/BT.2100
                    0x12, // Transfer Function: BT.2100 Hybrid Log-Gamma (HLG)
                    0x00, // Matrix: N/A
                    0x01, // Range: Full
                ],
            )?;
        }
        HdrifyMode::Chaos => {
            // Chaos mode - using PQ with enhanced brightness
            writer.write_chunk(
                cICP,
                &[
                    0x09, // Color Primaries: BT.2020/BT.2100
                    0x10, // Transfer Function: BT.2100 Perceptual Quantizer (PQ)
                    0x00, // Matrix: N/A
                    0x01, // Range: Full
                ],
            )?;

            // Additionally add luminance info for enhanced effect in Chaos mode
            writer.write_chunk(
                cLLI,
                &[
                    0x00, 0x00, 0x03, 0xE8, // Max content light level: 1000 nits
                    0x00, 0x00, 0x09, 0xC4, // Max frame average light level: 2500 nits
                ],
            )?;
        }
    }

    writer.write_image_data(&image_data)?;

    writer.finish()?;

    Ok(image)
}
