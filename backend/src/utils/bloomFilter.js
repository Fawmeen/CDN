/**
 * FILE EXPLANATION:
 * This file implements a custom Bloom Filter.
 * A Bloom Filter is a space-efficient, probabilistic data structure used to test 
 * whether an element is a member of a set. 
 * - False positives are possible: the filter might say "probably yes" for a missing item.
 * - False negatives are NOT possible: if it returns "definitely no", the item is guaranteed 
 *   to not be in the database, allowing us to reject non-existent queries instantly.
 */

// KEYWORDS & MATHEMATICAL CONTEXT:
// - "Uint8Array": An array of 8-bit unsigned integers representing bytes. We allocate size/8 bytes to save memory.
// - "m": Size of the bit array (represented by `this.size`). Larger sizes reduce false positives.
// - "k": Number of hash functions (represented by `this.numHashFunctions`).
// - "fnv1a": Fowler-Noll-Vo 32-bit fast non-cryptographic hash with excellent distribution.
// - "polynomialHash": Polynomial rolling hash used to generate a secondary independent hash signature.
// - "Kirsch-Mitzenmacher optimization": A mathematical theorem proving that we can simulate k independent hash functions
//   using only two base hashes (h1 and h2) via the formula: (h1 + i * h2) % size.
// - "<<": Bitwise Left Shift operator. Moves the bits of 1 to the left by `bitIndex` positions, creating a bitmask (e.g. 1 << 3 = 00001000).
// - "|=": Bitwise OR assignment. Sets a specific bit position in the byte block to 1.
// - "&": Bitwise AND operator. Used to check if a specific bit position is set to 1.

class BloomFilter {
    /**
     * constructor(size, numHashFunctions)
     * Initializes the filter configuration.
     * @param {number} size - Size of the bit array (m)
     * @param {number} numHashFunctions - Number of hash functions (k)
     */
    constructor(size = 1024, numHashFunctions = 4) {
        this.size = size;
        this.numHashFunctions = numHashFunctions;
        
        // A single byte contains 8 bits. We divide size by 8 to allocate the correct number of bytes.
        // Math.ceil ensures we round up if size is not a multiple of 8.
        this.bitArray = new Uint8Array(Math.ceil(size / 8));
    }

    /**
     * _fnv1a(str)
     * Fowler-Noll-Vo Hash Algorithm (32-bit).
     * Uses prime multiplication and bitwise XOR to scramble the characters.
     * @param {string} str 
     * @returns {number} 32-bit unsigned integer
     */
    _fnv1a(str) {
        let hash = 2166136261; // FNV-1a 32-bit offset basis prime
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 16777619) >>> 0; // ">>> 0" forces the number to be a 32-bit unsigned integer
        }
        return hash;
    }

    /**
     * _polynomialHash(str)
     * Generates a secondary independent hash value using prime arithmetic.
     * @param {string} str 
     * @returns {number} 32-bit unsigned integer
     */
    _polynomialHash(str) {
        let hash = 0;
        const p = 31; // Prime multiplier
        const m = 1e9 + 9; // Large prime modulo to prevent integer overflow
        let p_pow = 1;
        
        for (let i = 0; i < str.length; i++) {
            hash = (hash + (str.charCodeAt(i) + 1) * p_pow) % m;
            p_pow = (p_pow * p) % m;
        }
        return hash >>> 0;
    }

    /**
     * add(item)
     * Inserts a file name into the Bloom Filter by setting its calculated bit indices to 1.
     * @param {string} item - The filename to register
     */
    add(item) {
        if (!item || typeof item !== "string") return;
        
        // Generate two base hashes
        const h1 = this._fnv1a(item);
        const h2 = this._polynomialHash(item);

        for (let i = 0; i < this.numHashFunctions; i++) {
            // Kirsch-Mitzenmacher formula: index = (h1 + i * h2) % size
            const index = (h1 + i * h2) % this.size;
            
            // Find which byte block contains the target bit
            const byteIndex = Math.floor(index / 8);
            // Find the offset (0-7) inside that byte block
            const bitIndex = index % 8;
            
            // Set the corresponding bit at the offset to 1 using bitwise OR
            this.bitArray[byteIndex] |= (1 << bitIndex);
        }
    }

    /**
     * contains(item)
     * Checks if a filename is present in the set.
     * @param {string} item - The filename to check
     * @returns {boolean} false if definitely not in set, true if probably in set
     */
    contains(item) {
        if (!item || typeof item !== "string") return false;

        // Generate the same two base hashes
        const h1 = this._fnv1a(item);
        const h2 = this._polynomialHash(item);

        for (let i = 0; i < this.numHashFunctions; i++) {
            const index = (h1 + i * h2) % this.size;
            
            const byteIndex = Math.floor(index / 8);
            const bitIndex = index % 8;
            
            // Check if the bit at the calculated position is 0.
            // If any of the bits is 0, the item is DEFINITELY not in the set.
            if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
                return false;
            }
        }
        
        // All checked bits are 1; the item is PROBABLY in the set.
        return true;
    }

    /**
     * clear()
     * Resets the entire filter bit array to 0 (clears the filter cache).
     */
    clear() {
        this.bitArray.fill(0);
    }
}

export default BloomFilter;
