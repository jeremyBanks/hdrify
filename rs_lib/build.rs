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

    Ok(())
}
