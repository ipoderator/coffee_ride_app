import { validateHeaderValue } from 'node:http';
import { describe, expect, it } from 'vitest';
import { attachmentContentDisposition } from './content-disposition.js';

describe('attachmentContentDisposition', () => {
  it('keeps a plain ASCII name as is', () => {
    expect(attachmentContentDisposition('my-route.gpx')).toBe(
      `attachment; filename="my-route.gpx"; filename*=UTF-8''my-route.gpx`,
    );
  });

  it('gives a Cyrillic name an ASCII fallback and the exact name in filename*', () => {
    const header = attachmentContentDisposition('маршрут.gpx');
    expect(header).toBe(
      `attachment; filename="_______.gpx"; filename*=UTF-8''${encodeURIComponent('маршрут.gpx')}`,
    );
    expect(() =>
      validateHeaderValue('Content-Disposition', header),
    ).not.toThrow();
  });

  it('cannot be broken out of by quotes, backslashes or line breaks', () => {
    const header = attachmentContentDisposition(
      'a"; x="y\\z\r\nSet-Cookie: s=1.gpx',
    );
    expect(header).toBe(
      `attachment; filename="a_; x=_y_z__Set-Cookie: s=1.gpx"; filename*=UTF-8''a%22%3B%20x%3D%22y%5Cz%0D%0ASet-Cookie%3A%20s%3D1.gpx`,
    );
    expect(() =>
      validateHeaderValue('Content-Disposition', header),
    ).not.toThrow();
  });

  it("percent-encodes RFC 5987's excluded characters", () => {
    expect(attachmentContentDisposition("it's (1)*.gpx")).toContain(
      `filename*=UTF-8''it%27s%20%281%29%2A.gpx`,
    );
  });
});
