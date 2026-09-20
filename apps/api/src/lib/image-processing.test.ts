import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImageInvalidError, processImage } from './image-processing.js';

function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 30, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('processImage', () => {
  it('rejects a file that cannot be decoded as an image', async () => {
    await expect(
      processImage(Buffer.from('not an image at all')),
    ).rejects.toThrow(ImageInvalidError);
  });

  it('rejects an SVG (accepted-format allowlist, not a decode failure)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    );
    // sharp can decode SVG (librsvg) — this asserts the allowlist rejects it
    // even though decoding itself would succeed (ADR-019's XSS reasoning).
    await expect(processImage(svg)).rejects.toThrow(ImageInvalidError);
  });

  it('resizes an oversized image to fit within 1920x1920, preserving aspect ratio', async () => {
    const source = await solidJpeg(3000, 2000);
    const result = await processImage(source);

    expect(result.contentType).toBe('image/jpeg');
    expect(result.ext).toBe('jpg');
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1280);
  });

  it('does not upscale an image already smaller than the bound', async () => {
    const source = await solidJpeg(300, 200);
    const result = await processImage(source);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(200);
  });

  it('preserves the original format (PNG stays PNG)', async () => {
    const source = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await processImage(source);

    expect(result.contentType).toBe('image/png');
    expect(result.ext).toBe('png');
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe('png');
  });

  it('strips EXIF metadata from the output', async () => {
    const source = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 100, g: 100, b: 100 },
      },
    })
      .withExif({
        IFD0: { Make: 'TestCam', Model: 'TestModel' },
      })
      .jpeg()
      .toBuffer();
    // Sanity check the fixture actually carries EXIF before asserting it's gone.
    const sourceMetadata = await sharp(source).metadata();
    expect(sourceMetadata.exif).toBeDefined();

    const result = await processImage(source);
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.exif).toBeUndefined();
  });
});
