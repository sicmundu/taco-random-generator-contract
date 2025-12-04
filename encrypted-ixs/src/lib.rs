use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    /// Generates a cryptographically secure random number in the range [min, max].
    #[instruction]
    pub fn generate_random(min: u64, max: u64) -> u64 {
        let mut random: u64 = 0;
        let mut power: u64 = 1;
        for _i in 0..64 {
            let bit = ArcisRNG::bool();
            if bit {
                random = random + power;
            }
            power = power * 2;
        }

        let range_size = max - min + 1;

        let result = (random % range_size) + min;

        result.reveal()
    }
}
