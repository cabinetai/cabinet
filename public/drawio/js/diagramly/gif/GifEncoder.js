/**
 * Minimal GIF89a encoder with no external dependencies.
 * Supports animated GIFs with per-frame delay, looping, and transparency.
 *
 * Usage:
 *   var enc = new GifEncoder(width, height);
 *   enc.setRepeat(0);    // 0 = loop forever
 *   enc.setDelay(100);   // ms between frames
 *   enc.addFrame(canvas);
 *   enc.addFrame(canvas2);
 *   var blob = enc.finish();
 */
function GifEncoder(width, height)
{
	this.width = width;
	this.height = height;
	this.delay = 100;
	this.repeat = 0;
	this.transparent = false;
	this.dispose = 2; // restore to background
	this.out = [];
	this.frameCount = 0;
	this.started = false;
};

/**
 * Sets the delay time between frames in milliseconds.
 */
GifEncoder.prototype.setDelay = function(ms)
{
	this.delay = Math.max(10, Math.round(ms));
};

/**
 * Sets the number of times the animation should loop.
 * 0 = loop forever, -1 = no repeat.
 */
GifEncoder.prototype.setRepeat = function(count)
{
	this.repeat = count;
};

/**
 * Enables or disables transparent background.
 */
GifEncoder.prototype.setTransparent = function(enabled)
{
	this.transparent = enabled;
};

/**
 * Adds a frame from an HTML5 canvas element.
 */
GifEncoder.prototype.addFrame = function(canvas)
{
	var ctx = canvas.getContext('2d');
	var imageData = ctx.getImageData(0, 0, this.width, this.height);
	var pixels = imageData.data;
	var numPixels = pixels.length / 4;
	var palette, indexedPixels, transparentIndex;

	if (!this.started)
	{
		// Frame 1: quantize to establish the global palette
		var result = GifEncoder.quantize(pixels, 256, this.transparent);
		palette = result.palette;
		indexedPixels = result.indexedPixels;
		transparentIndex = result.transparentIndex;

		// Store for subsequent frames
		this.globalPalette = palette;
		this.globalTransparentIndex = transparentIndex;

		this.started = true;
		this.writeHeader();
		this.writeLogicalScreenDescriptor(palette);
		this.writeGlobalColorTable(palette);

		if (this.repeat >= 0)
		{
			this.writeNetscapeExtension();
		}
	}
	else
	{
		// Frame 2+: map pixels to the stored global palette
		palette = this.globalPalette;
		transparentIndex = this.globalTransparentIndex;
		indexedPixels = new Uint8Array(numPixels);

		for (var i = 0; i < numPixels; i++)
		{
			var off = i * 4;

			if (this.transparent && pixels[off + 3] < 128)
			{
				indexedPixels[i] = transparentIndex;
			}
			else
			{
				indexedPixels[i] = GifEncoder.findClosest(
					palette, pixels[off], pixels[off + 1], pixels[off + 2],
					transparentIndex);
			}
		}
	}

	this.writeGraphicControlExtension(transparentIndex);
	this.writeImageDescriptor();
	this.writeImageData(indexedPixels, palette);
	this.frameCount++;
};

/**
 * Finishes encoding and returns the result as a Blob.
 */
GifEncoder.prototype.finish = function()
{
	if (!this.started)
	{
		return null;
	}

	this.out.push(0x3B); // GIF trailer
	return new Blob([new Uint8Array(this.out)], {type: 'image/gif'});
};

/**
 * Writes GIF89a header.
 */
GifEncoder.prototype.writeHeader = function()
{
	this.writeString('GIF89a');
};

/**
 * Writes the logical screen descriptor.
 */
GifEncoder.prototype.writeLogicalScreenDescriptor = function(palette)
{
	this.writeShort(this.width);
	this.writeShort(this.height);

	var colorTableSize = GifEncoder.colorTableSizeFor(palette.length);

	// Packed field: GCT flag (1) | color resolution (3) | sort (1) | GCT size (3)
	var packed = 0x80 | // global color table flag
		((7) << 4) | // color resolution (8 bits per primary)
		0 | // sort flag
		colorTableSize; // size of GCT
	this.out.push(packed);
	this.out.push(0); // background color index
	this.out.push(0); // pixel aspect ratio
};

/**
 * Writes the global color table.
 */
GifEncoder.prototype.writeGlobalColorTable = function(palette)
{
	var tableSize = GifEncoder.colorTableEntries(palette.length);

	for (var i = 0; i < tableSize; i++)
	{
		if (i < palette.length)
		{
			this.out.push(palette[i][0]); // R
			this.out.push(palette[i][1]); // G
			this.out.push(palette[i][2]); // B
		}
		else
		{
			this.out.push(0);
			this.out.push(0);
			this.out.push(0);
		}
	}
};

/**
 * Writes the Netscape 2.0 application extension for looping.
 */
GifEncoder.prototype.writeNetscapeExtension = function()
{
	this.out.push(0x21); // extension introducer
	this.out.push(0xFF); // application extension
	this.out.push(11);   // block size
	this.writeString('NETSCAPE2.0');
	this.out.push(3);    // sub-block size
	this.out.push(1);    // sub-block index
	this.writeShort(this.repeat); // loop count (0 = forever)
	this.out.push(0);    // block terminator
};

/**
 * Writes the graphic control extension for the current frame.
 */
GifEncoder.prototype.writeGraphicControlExtension = function(transparentIndex)
{
	this.out.push(0x21); // extension introducer
	this.out.push(0xF9); // graphic control label
	this.out.push(4);    // block size

	var hasTransparency = (transparentIndex >= 0);
	// Packed: reserved (3) | disposal (3) | user input (1) | transparent (1)
	var packed = (this.dispose << 2) | (hasTransparency ? 1 : 0);
	this.out.push(packed);

	// Delay in 1/100 seconds
	this.writeShort(Math.round(this.delay / 10));

	this.out.push(hasTransparency ? transparentIndex : 0);
	this.out.push(0); // block terminator
};

/**
 * Writes the image descriptor for the current frame.
 */
GifEncoder.prototype.writeImageDescriptor = function()
{
	this.out.push(0x2C); // image separator
	this.writeShort(0);  // left
	this.writeShort(0);  // top
	this.writeShort(this.width);
	this.writeShort(this.height);
	this.out.push(0);    // no local color table, no interlace
};

/**
 * Writes LZW-compressed image data.
 */
GifEncoder.prototype.writeImageData = function(indexedPixels, palette)
{
	var colorDepth = GifEncoder.colorDepthFor(palette.length);
	var minCodeSize = Math.max(2, colorDepth);

	this.out.push(minCodeSize);

	var encoded = GifEncoder.lzwEncode(indexedPixels, minCodeSize);

	// Write in sub-blocks of max 255 bytes
	var offset = 0;

	while (offset < encoded.length)
	{
		var blockSize = Math.min(255, encoded.length - offset);
		this.out.push(blockSize);

		for (var i = 0; i < blockSize; i++)
		{
			this.out.push(encoded[offset + i]);
		}

		offset += blockSize;
	}

	this.out.push(0); // block terminator
};

/**
 * Writes a 16-bit little-endian value.
 */
GifEncoder.prototype.writeShort = function(val)
{
	this.out.push(val & 0xFF);
	this.out.push((val >> 8) & 0xFF);
};

/**
 * Writes a string as bytes.
 */
GifEncoder.prototype.writeString = function(str)
{
	for (var i = 0; i < str.length; i++)
	{
		this.out.push(str.charCodeAt(i));
	}
};

// --- Static methods ---

/**
 * Returns the GIF color table size field value for the given palette length.
 */
GifEncoder.colorTableSizeFor = function(paletteLength)
{
	var n = 0;

	while ((2 << n) < paletteLength)
	{
		n++;
	}

	return Math.min(n, 7);
};

/**
 * Returns the number of entries in the color table (must be power of 2).
 */
GifEncoder.colorTableEntries = function(paletteLength)
{
	var size = 2;

	while (size < paletteLength)
	{
		size *= 2;
	}

	return Math.min(size, 256);
};

/**
 * Returns bits needed to represent the palette.
 */
GifEncoder.colorDepthFor = function(paletteLength)
{
	var bits = 1;

	while ((1 << bits) < paletteLength)
	{
		bits++;
	}

	return bits;
};

/**
 * Median-cut color quantization.
 * Reduces RGBA pixel data to at most maxColors RGB palette entries.
 * Returns {palette, indexedPixels, transparentIndex}.
 */
GifEncoder.quantize = function(pixels, maxColors, useTransparency)
{
	var numPixels = pixels.length / 4;
	var transparentIndex = -1;

	// Reserve one slot for transparency
	if (useTransparency)
	{
		maxColors = maxColors - 1;
	}

	// Collect unique opaque colors, sample if too many pixels
	var colors = [];
	var step = (numPixels > 100000) ? Math.floor(numPixels / 50000) : 1;

	for (var i = 0; i < numPixels; i += step)
	{
		var off = i * 4;

		if (pixels[off + 3] < 128)
		{
			continue; // skip transparent
		}

		colors.push([pixels[off], pixels[off + 1], pixels[off + 2]]);
	}

	// Build palette via median cut
	var palette;

	if (colors.length <= maxColors)
	{
		palette = GifEncoder.uniqueColors(colors);

		if (palette.length > maxColors)
		{
			palette = GifEncoder.medianCut(colors, maxColors);
		}
	}
	else
	{
		palette = GifEncoder.medianCut(colors, maxColors);
	}

	// Ensure at least 2 colors (GIF minimum)
	while (palette.length < 2)
	{
		palette.push([0, 0, 0]);
	}

	// Add transparent color at end if needed
	if (useTransparency)
	{
		transparentIndex = palette.length;
		palette.push([0, 0, 0]);
	}

	// Map all pixels to palette indices
	var indexedPixels = new Uint8Array(numPixels);

	for (var i = 0; i < numPixels; i++)
	{
		var off = i * 4;

		if (useTransparency && pixels[off + 3] < 128)
		{
			indexedPixels[i] = transparentIndex;
		}
		else
		{
			indexedPixels[i] = GifEncoder.findClosest(
				palette, pixels[off], pixels[off + 1], pixels[off + 2],
				transparentIndex);
		}
	}

	return {
		palette: palette,
		indexedPixels: indexedPixels,
		transparentIndex: transparentIndex
	};
};

/**
 * Returns array of unique [r,g,b] values from the input.
 */
GifEncoder.uniqueColors = function(colors)
{
	var seen = {};
	var result = [];

	for (var i = 0; i < colors.length; i++)
	{
		var key = (colors[i][0] << 16) | (colors[i][1] << 8) | colors[i][2];

		if (seen[key] == null)
		{
			seen[key] = true;
			result.push(colors[i]);
		}
	}

	return result;
};

/**
 * Median-cut quantization. Recursively splits color space.
 */
GifEncoder.medianCut = function(colors, maxColors)
{
	if (colors.length == 0)
	{
		return [[0, 0, 0]];
	}

	var buckets = [colors];

	while (buckets.length < maxColors)
	{
		// Find bucket with greatest range
		var maxRange = -1;
		var maxIdx = 0;

		for (var i = 0; i < buckets.length; i++)
		{
			if (buckets[i].length <= 1)
			{
				continue;
			}

			var range = GifEncoder.colorRange(buckets[i]);

			if (range.maxRange > maxRange)
			{
				maxRange = range.maxRange;
				maxIdx = i;
			}
		}

		if (maxRange <= 0)
		{
			break;
		}

		var bucket = buckets[maxIdx];
		var range = GifEncoder.colorRange(bucket);

		// Sort by the channel with the largest range
		bucket.sort(function(a, b)
		{
			return a[range.channel] - b[range.channel];
		});

		var mid = Math.floor(bucket.length / 2);
		buckets.splice(maxIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
	}

	// Average each bucket to get palette colors
	var palette = [];

	for (var i = 0; i < buckets.length; i++)
	{
		var b = buckets[i];
		var r = 0, g = 0, bl = 0;

		for (var j = 0; j < b.length; j++)
		{
			r += b[j][0];
			g += b[j][1];
			bl += b[j][2];
		}

		palette.push([
			Math.round(r / b.length),
			Math.round(g / b.length),
			Math.round(bl / b.length)
		]);
	}

	return palette;
};

/**
 * Returns the channel with the largest range and its magnitude.
 */
GifEncoder.colorRange = function(colors)
{
	var minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;

	for (var i = 0; i < colors.length; i++)
	{
		var c = colors[i];

		if (c[0] < minR) minR = c[0]; if (c[0] > maxR) maxR = c[0];
		if (c[1] < minG) minG = c[1]; if (c[1] > maxG) maxG = c[1];
		if (c[2] < minB) minB = c[2]; if (c[2] > maxB) maxB = c[2];
	}

	var rangeR = maxR - minR;
	var rangeG = maxG - minG;
	var rangeB = maxB - minB;

	if (rangeR >= rangeG && rangeR >= rangeB)
	{
		return {channel: 0, maxRange: rangeR};
	}
	else if (rangeG >= rangeR && rangeG >= rangeB)
	{
		return {channel: 1, maxRange: rangeG};
	}
	else
	{
		return {channel: 2, maxRange: rangeB};
	}
};

/**
 * Finds the closest palette color index using squared Euclidean distance.
 */
GifEncoder.findClosest = function(palette, r, g, b, skipIndex)
{
	var minDist = Infinity;
	var minIdx = 0;

	for (var i = 0; i < palette.length; i++)
	{
		if (i === skipIndex)
		{
			continue;
		}

		var dr = r - palette[i][0];
		var dg = g - palette[i][1];
		var db = b - palette[i][2];
		var dist = dr * dr + dg * dg + db * db;

		if (dist < minDist)
		{
			minDist = dist;
			minIdx = i;
		}
	}

	return minIdx;
};

/**
 * LZW encodes the indexed pixel data.
 * Returns a Uint8Array of the compressed bytes.
 */
GifEncoder.lzwEncode = function(indexedPixels, minCodeSize)
{
	var clearCode = 1 << minCodeSize;
	var eoiCode = clearCode + 1;
	var codeSize = minCodeSize + 1;
	var nextCode = eoiCode + 1;
	var maxCode = (1 << codeSize);

	// Use object for code table (string keys for sequences)
	var codeTable = {};

	// Initialize with single-character codes
	for (var i = 0; i < clearCode; i++)
	{
		codeTable[String(i)] = i;
	}

	var bitBuffer = 0;
	var bitsInBuffer = 0;
	var output = [];

	var emitCode = function(code)
	{
		bitBuffer |= (code << bitsInBuffer);
		bitsInBuffer += codeSize;

		while (bitsInBuffer >= 8)
		{
			output.push(bitBuffer & 0xFF);
			bitBuffer >>= 8;
			bitsInBuffer -= 8;
		}
	};

	// Start with clear code
	emitCode(clearCode);

	if (indexedPixels.length == 0)
	{
		emitCode(eoiCode);

		if (bitsInBuffer > 0)
		{
			output.push(bitBuffer & 0xFF);
		}

		return new Uint8Array(output);
	}

	var current = String(indexedPixels[0]);

	for (var i = 1; i < indexedPixels.length; i++)
	{
		var next = current + ',' + indexedPixels[i];

		if (codeTable[next] != null)
		{
			current = next;
		}
		else
		{
			emitCode(codeTable[current]);

			if (nextCode < 4096)
			{
				codeTable[next] = nextCode;
				nextCode++;

				if (nextCode > maxCode && codeSize < 12)
				{
					codeSize++;
					maxCode = (1 << codeSize);
				}
			}
			else
			{
				// Reset code table
				emitCode(clearCode);
				codeTable = {};

				for (var j = 0; j < clearCode; j++)
				{
					codeTable[String(j)] = j;
				}

				codeSize = minCodeSize + 1;
				nextCode = eoiCode + 1;
				maxCode = (1 << codeSize);
			}

			current = String(indexedPixels[i]);
		}
	}

	// Emit remaining
	emitCode(codeTable[current]);
	emitCode(eoiCode);

	if (bitsInBuffer > 0)
	{
		output.push(bitBuffer & 0xFF);
	}

	return new Uint8Array(output);
};
