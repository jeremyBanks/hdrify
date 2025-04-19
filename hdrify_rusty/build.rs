use std::fmt::Write;
use std::fs;
use std::path::Path;

use anyhow::Error;
use lcms2::{Profile, Tag, TagSignature, CIEXYZ};

fn main() -> Result<(), Error> {
    let mut profile = Profile::new_icc(include_bytes!("../chaos.icc"))?;

    profile.write_tag(
        TagSignature::LuminanceTag,
        Tag::CIEXYZ(&CIEXYZ {
            X: 9505.0,
            Y: 10000.0,
            Z: 10896.0,
        }),
    );

    profile.save_profile_to_file(&Path::new("../rusty.icc"))?;

    let parent_dir = Path::new("..").canonicalize()?;
    for entry in fs::read_dir(&parent_dir)? {
        let entry = entry?;
        let path = entry.path();

        if let Some(ext) = path.extension() {
            if ext == "icc" {
                println!("cargo:warning=Processing ICC file: {:?}", path);
                process_icc_file(&path)?;
            }
        }
    }

    Ok(())
}

fn process_icc_file(path: &Path) -> Result<(), Error> {
    let profile = Profile::new_file(path)?;

    let filename = path.file_name().unwrap().to_string_lossy();
    let output_path = path.with_file_name(format!("{}.txt", filename));

    let mut human_readable = String::new();
    writeln!(human_readable, "Profile information for: {}", filename)?;
    writeln!(human_readable, "Version: {}", profile.version())?;
    writeln!(human_readable, "Device Class: {:?}", profile.device_class())?;
    writeln!(human_readable, "Color Space: {:?}", profile.color_space())?;
    writeln!(human_readable, "PCS: {:?}", profile.pcs())?;
    writeln!(human_readable, "\nTags:")?;

    for tag_signature in profile.tag_signatures() {
        let tag = profile.read_tag(tag_signature);
        writeln!(human_readable, "{:?}: {:?}", tag_signature, tag)?;
    }

    println!(
        "cargo:warning=Writing tag information to: {:?}",
        output_path
    );
    fs::write(&output_path, human_readable)?;

    Ok(())
}
