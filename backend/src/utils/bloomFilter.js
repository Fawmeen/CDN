/**
 * Bloom Filter Implementation
 * 
 * A Bloom Filter is a space-efficient probabilistic data structure used to test 
 * whether an element is a member of a set. 
 * - False positive matches are possible (the filter might say "probably yes" for a missing item).
 * - False negative matches are NOT possible (if it returns "definitely no", the item is guaranteed not to be in the set).
 * 
 * Mathematical context:
 * - m: size of the bit array (larger size reduces false positives)
 * - k: number of hash functions (optimal k is roughly (m/n) * ln(2))
 * - n: number of items expected to be inserted
 * 
 * We use the Kirsch-Mitzenmacher optimization to generate k independent hash indices
 * using only two base hash functions:
 *   hash_i = (Hash1 + i * Hash2) % m
 * This avoids the overhead of running k different hash functions.
 */
class BloomFilter {
    /**
     * @param {number} size - Size of the bit array (m)
     * @param {number} numHashFunctions - Number of hash functions (k)
     */
    constructor(size = 1024, numHashFunctions = 4) {
        this.size = size;
        this.numHashFunctions = numHashFunctions;
        // Allocate space for the bit array. We use Uint8Array to save memory.
        this.bitArray = new Uint8Array(Math.ceil(size / 8));
    }

    /**
     * Base Hash 1: FNV-1a Hash (32-bit)
     * Extremely fast non-cryptographic hash with excellent distribution.
     * @param {string} str 
     * @returns {number} 32-bit unsigned integer
     */
    _fnv1a(str) {
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 16777619) >>> 0; // Force to 32-bit unsigned integer
        }
        return hash;
    }

    /**
     * Base Hash 2: Polynomial Rolling Hash
     * Generates a secondary independent hash.
     * @param {string} str 
     * @returns {number} 32-bit unsigned integer
     */
    _polynomialHash(str) {
        let hash = 0;
        const p = 31; // Prime number close to number of characters
        const m = 1e9 + 9; // Large prime modulo
        let p_pow = 1;
        
        for (let i = 0; i < str.length; i++) {
            hash = (hash + (str.charCodeAt(i) + 1) * p_pow) % m;
            p_pow = (p_pow * p) % m;
        }
        return hash >>> 0;
    }

    /**
     * Inserts an item into the Bloom Filter.
     * Sets the bit positions calculated from the hash functions to 1.
     * @param {string} item 
     */
    add(item) {
        if (!item || typeof item !== "string") return;
        
        const h1 = this._fnv1a(item);
        const h2 = this._polynomialHash(item);

        for (let i = 0; i < this.numHashFunctions; i++) {
            // Kirsch-Mitzenmacher formula: index = (h1 + i * h2) % m
            const index = (h1 + i * h2) % this.size;
            
            // Calculate exact byte index and bit offset
            const byteIndex = Math.floor(index / 8);
            const bitIndex = index % 8;
            
            // Set the corresponding bit to 1
            this.bitArray[byteIndex] |= (1 << bitIndex);
        }
    }

    /**
     * Checks if an item is probably in the set.
     * @param {string} item 
     * @returns {boolean} false if definitely not in set, true if probably in set
     */
    contains(item) {
        if (!item || typeof item !== "string") return false;

        const h1 = this._fnv1a(item);
        const h2 = this._polynomialHash(item);

        for (let i = 0; i < this.numHashFunctions; i++) {
            const index = (h1 + i * h2) % this.size;
            
            const byteIndex = Math.floor(index / 8);
            const bitIndex = index % 8;
            
            // If any of the bits is 0, the item is DEFINITELY not in the set
            if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
                return false;
            }
        }
        
        // All checked bits are 1; item is PROBABLY in the set
        return true;
    }

    /**
     * Clears all bits in the filter
     */
    clear() {
        this.bitArray.fill(0);
    }
}

export default BloomFilter;
