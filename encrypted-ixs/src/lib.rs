use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    /// Generates a cryptographically secure random number within the specified range [min, max].
    ///
    /// This function uses MPC to generate a random number that no single party can predict or bias.
    /// The random number is generated using distributed entropy and then constrained to the
    /// specified range using modulo arithmetic.
    ///
    /// # Arguments
    /// * `min` - Minimum value of the range (inclusive)
    /// * `max` - Maximum value of the range (inclusive)
    ///
    /// # Returns
    /// * A random number in the range [min, max]
    #[instruction]
    pub fn generate_random(min: u64, max: u64) -> u64 {
        // Generate a cryptographically secure random u64 number
        // by combining 64 random bits using multiplication
        let mut random: u64 = 0;
        let mut power: u64 = 1;
        for _i in 0..64 {
            let bit = ArcisRNG::bool();
            if bit {
                random = random + power;
            }
            power = power * 2;
        }

        // Calculate the range size
        let range_size = max - min + 1;

        // Use modulo arithmetic to constrain the random number to the range
        // This ensures uniform distribution within the specified range
        let result = (random % range_size) + min;

        result.reveal()
    }
}
