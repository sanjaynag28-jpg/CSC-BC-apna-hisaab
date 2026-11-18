/**
 * ============================================================================
 * CASH MANAGEMENT BC - LIGHTWEIGHT PURE NODE.JS ZIP CREATOR
 * ============================================================================
 * Generates standard PKZIP archives using Node.js built-in `zlib` and `fs`.
 * Zero third-party dependencies required.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table calculation
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c >>> 0;
}

function calculateCRC32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
    const d = date || new Date();
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { dosTime, dosDate };
}

/**
 * Creates a standard ZIP buffer from a folder
 * @param {string} sourceDir - Absolute path to folder
 * @param {object} options - { skip: ['file1', 'file2'] }
 * @returns {Buffer}
 */
function createZipFromFolder(sourceDir, options = {}) {
    const skipList = (options.skip || []).map(s => s.toLowerCase());

    function walkDir(dir) {
        let results = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results = results.concat(walkDir(fullPath));
            } else if (entry.isFile()) {
                const relPath = path.relative(sourceDir, fullPath).replace(/\\/g, '/');
                if (!skipList.includes(entry.name.toLowerCase()) && !skipList.includes(relPath.toLowerCase())) {
                    results.push({ fullPath, relPath });
                }
            }
        }
        return results;
    }

    const files = walkDir(sourceDir);
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    for (const file of files) {
        const fileContent = fs.readFileSync(file.fullPath);
        const stat = fs.statSync(file.fullPath);
        const { dosTime, dosDate } = dosDateTime(stat.mtime);

        const crc = calculateCRC32(fileContent);
        const uncompressedSize = fileContent.length;

        // Compress using DeflateRaw
        const deflated = zlib.deflateRawSync(fileContent, { level: 9 });
        let compressionMethod = 8; // Deflate
        let compressedData = deflated;
        let compressedSize = deflated.length;

        // If deflation doesn't save space, store uncompressed
        if (compressedSize >= uncompressedSize) {
            compressionMethod = 0; // Store
            compressedData = fileContent;
            compressedSize = uncompressedSize;
        }

        const nameBuf = Buffer.from(file.relPath, 'utf8');

        // 1. Local File Header (30 bytes + name length + data length)
        const localHeader = Buffer.alloc(30 + nameBuf.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
        localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
        localHeader.writeUInt16LE(0x0800, 6);     // General purpose flag (UTF-8)
        localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(compressedSize, 18);
        localHeader.writeUInt32LE(uncompressedSize, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);         // Extra field length
        nameBuf.copy(localHeader, 30);

        localHeaders.push(localHeader, compressedData);

        // 2. Central Directory Header (46 bytes + name length)
        const centralHeader = Buffer.alloc(46 + nameBuf.length);
        centralHeader.writeUInt32LE(0x02014b50, 0); // Central header signature
        centralHeader.writeUInt16LE(20, 4);          // Version made by
        centralHeader.writeUInt16LE(20, 6);          // Version needed
        centralHeader.writeUInt16LE(0x0800, 8);      // UTF-8
        centralHeader.writeUInt16LE(compressionMethod, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(compressedSize, 20);
        centralHeader.writeUInt32LE(uncompressedSize, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);          // Extra field length
        centralHeader.writeUInt16LE(0, 32);          // File comment length
        centralHeader.writeUInt16LE(0, 34);          // Disk number start
        centralHeader.writeUInt16LE(0, 36);          // Internal file attributes
        centralHeader.writeUInt32LE(0, 38);          // External file attributes
        centralHeader.writeUInt32LE(offset, 42);     // Relative offset of local header
        nameBuf.copy(centralHeader, 46);

        centralHeaders.push(centralHeader);

        offset += localHeader.length + compressedData.length;
    }

    const centralDirectoryOffset = offset;
    let centralDirectorySize = 0;
    for (const ch of centralHeaders) {
        centralDirectorySize += ch.length;
    }

    // 3. End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4);          // Disk number
    eocd.writeUInt16LE(0, 6);          // Disk with central dir
    eocd.writeUInt16LE(files.length, 8);  // Entries on disk
    eocd.writeUInt16LE(files.length, 10); // Total entries
    eocd.writeUInt32LE(centralDirectorySize, 12);
    eocd.writeUInt32LE(centralDirectoryOffset, 16);
    eocd.writeUInt16LE(0, 20);         // Comment length

    return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

module.exports = {
    createZipFromFolder
};
