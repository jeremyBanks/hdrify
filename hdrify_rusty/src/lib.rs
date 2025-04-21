use std::{error::Error, io::Cursor};

use image::{DynamicImage, GenericImageView, ImageDecoder, ImageReader, Rgba};
use js_sys::Uint8Array;
use png::{chunk::cICP, Encoder};
use wasm_bindgen::prelude::*;

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

fn hdrify_image_as_png_impl(image: &[u8], mode: HdrifyMode) -> Result<Vec<u8>, Box<dyn Error>> {
    // Load any supported image (see `image` crate features defined in ./Cargo.toml).
    let mut decoder = ImageReader::new(Cursor::new(image))
        .with_guessed_format()?
        .into_decoder()?;
    let orientation = decoder.orientation()?;
    let image = DynamicImage::from_decoder(decoder)?;

    // Convert to precise and convenient f32 RGBA for editing.
    let mut image = image.to_rgba32f();

    // Apply mode-specific effects
    if mode == HdrifyMode::Chaos {
        image.pixels_mut().for_each(|pixel| {
            let Rgba([r, g, b, a]) = *pixel;

            *pixel = Rgba([
                (r * 1.5).powf(0.9).clamp(0.0, 1.0),
                (g * 1.5).powf(0.9).clamp(0.0, 1.0),
                (b * 1.5).powf(0.9).clamp(0.0, 1.0),
                a,
            ]);
        });
    }

    // Rotate to match orientation of original image.
    let mut image = DynamicImage::ImageRgba32F(image);
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

    // Convert to u16 RGBA for PNG encoding
    let image: image::ImageBuffer<Rgba<u16>, Vec<u16>> = image.to_rgba16();

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

    writer.write_image_data(&image_data)?;

    writer.finish()?;

    Ok(image)
}
