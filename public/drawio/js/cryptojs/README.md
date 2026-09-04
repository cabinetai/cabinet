# aes.min.js

Source: rollups/aes.js from https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/crypto-js/CryptoJS%20v3.1.2.zip
See https://code.google.com/archive/p/crypto-js/downloads

Note: CryptoJS 3.1.2 is flagged by https://github.com/jgraph/drawio-dev/security/dependabot/148
(CVE-2020-36732, insecure randomness: `WordArray.random` uses `Math.random()`).

This bundle DOES include that code path — minification aliases `Math` to the core
IIFE parameter (`...return d}(Math)`), so it does not appear as a literal
`Math.random`. It is reached by the only AES usage in draw.io,
`DrawioFileSync.objectToString` (`CryptoJS.AES.encrypt(data, key)`): the string
key makes CryptoJS derive key+IV from a passphrase via the OpenSSL KDF (`EvpKDF`),
generating an 8-byte salt with `Math.random()`.

Impact is low: the insecure RNG only produces the KDF salt, which is prepended to
the ciphertext in cleartext (OpenSSL `Salted__` format) and is public by design.
The AES key derives from the channel key (a shared secret), not from
`Math.random()`, so a predictable salt does not weaken key confidentiality. The
only residual risk is salt collisions causing (key, IV) reuse under a single
channel key. To clear the advisory properly, refresh this rollup to crypto-js 4.x
(native `crypto.getRandomValues`); the OpenSSL/EvpKDF wire format is unchanged, so
cross-version sync still interops.
