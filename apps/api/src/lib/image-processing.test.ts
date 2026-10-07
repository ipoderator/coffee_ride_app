import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { ImageInvalidError, processImage } from './image-processing.js';

// A pass-through spy, so a test can assert which inputs ever reach a libvips
// decoder (CR-214).
vi.mock('sharp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sharp')>();
  return { default: vi.fn(actual.default) };
});

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

  it('never hands a non-JPEG/PNG/WebP file to a decoder (CR-214)', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    vi.mocked(sharp).mockClear();

    for (const file of [gif, svg]) {
      await expect(processImage(file)).rejects.toThrow(ImageInvalidError);
    }
    expect(sharp).not.toHaveBeenCalled();
  });

  it('still decodes a file whose signature passes, rejecting a corrupt one', async () => {
    const corruptPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('not really a png'),
    ]);

    await expect(processImage(corruptPng)).rejects.toThrow(
      'The uploaded file could not be read as an image.',
    );
  });

  it('trusts the decoded format over the signature', async () => {
    // A signature that passes but decodes as something else still fails the
    // allowlist — the decode, not the magic bytes, decides (do-not-break).
    const jpeg = await solidJpeg(4, 4);
    vi.mocked(sharp).mockImplementationOnce(
      () =>
        ({
          metadata: () => Promise.resolve({ format: 'gif' }),
        }) as unknown as ReturnType<typeof sharp>,
    );

    await expect(processImage(jpeg)).rejects.toThrow(
      'Only JPEG, PNG, or WebP images are accepted.',
    );
  });

  it('accepts a WebP', async () => {
    const source = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#888' },
    })
      .webp()
      .toBuffer();

    const result = await processImage(source);

    expect(result.contentType).toBe('image/webp');
    expect(result.ext).toBe('webp');
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
