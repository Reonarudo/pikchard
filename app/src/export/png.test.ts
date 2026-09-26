import { describe, expect, it } from "vitest";
import { PNG_SCALE, rasterise } from "./png.js";
import { EXPORT_BACKGROUND } from "./svg.js";

/** What the rasteriser did, as a fake canvas recorded it. */
interface Recorded {
  width: number;
  height: number;
  fills: Array<{ style: string; args: number[] }>;
  drawn: Array<{ source: unknown; args: number[] }>;
  type: string | undefined;
  revoked: string[];
  decoded: number;
  loadedUrl: string | undefined;
}

const png = new Blob(["fake-png"], { type: "image/png" });

/**
 * A browser, as far as the rasteriser is concerned: an object URL, an `Image`
 * that decodes, and a canvas that records what was drawn on it.
 */
function fakeScope() {
  const recorded: Recorded = {
    width: 0,
    height: 0,
    fills: [],
    drawn: [],
    type: undefined,
    revoked: [],
    decoded: 0,
    loadedUrl: undefined,
  };

  const context = {
    fillStyle: "",
    fillRect: (...args: number[]) => {
      recorded.fills.push({ style: context.fillStyle, args });
    },
    drawImage: (source: unknown, ...args: number[]) => {
      recorded.drawn.push({ source, args });
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void, type?: string) => {
      recorded.width = canvas.width;
      recorded.height = canvas.height;
      recorded.type = type;
      callback(png);
    },
  };

  class FakeImage {
    src = "";
    async decode() {
      recorded.decoded += 1;
      recorded.loadedUrl = this.src;
    }
  }

  const scope = {
    URL: {
      createObjectURL: () => "blob:fake",
      revokeObjectURL: (url: string) => recorded.revoked.push(url),
    },
    Image: FakeImage,
    document: { createElement: () => canvas },
  } as unknown as typeof globalThis;

  return { scope, recorded };
}

const diagram = { svg: "<svg/>", width: 112, height: 76 };

describe("rasterising the Diagram", () => {
  it("draws at a fixed 2×, whatever the display or the Preview's zoom", () => {
    // A 3× display must not emit a 2.25×-larger file, and the Preview's zoom is
    // a viewing state rather than an export parameter (#1055).
    expect(PNG_SCALE).toBe(2);
  });

  it("makes a canvas twice the Diagram's size and draws the whole Diagram onto it", async () => {
    const { scope, recorded } = fakeScope();

    await rasterise("<svg/>", diagram, "light", scope);

    expect([recorded.width, recorded.height]).toEqual([224, 152]);
    // Explicit destination width and height: an SVG image has no intrinsic size
    // to scale from, so leaving them off draws it at whatever the engine guesses.
    expect(recorded.drawn).toHaveLength(1);
    expect(recorded.drawn[0]?.args).toEqual([0, 0, 224, 152]);
  });

  it("fills the theme's surface under the Diagram, so the file is never transparent", async () => {
    const { scope, recorded } = fakeScope();

    await rasterise("<svg/>", diagram, "dark", scope);

    expect(recorded.fills).toEqual([{ style: EXPORT_BACKGROUND.dark, args: [0, 0, 224, 152] }]);
  });

  it("is opaque white in the light theme", async () => {
    const { scope, recorded } = fakeScope();

    await rasterise("<svg/>", diagram, "light", scope);

    expect(recorded.fills[0]?.style).toBe(EXPORT_BACKGROUND.light);
  });

  it("decodes the SVG through an object URL, and lets the URL go afterwards", async () => {
    // `Image` + `decode`, not `createImageBitmap`: the latter rejects for SVG
    // blobs and for SVG images without intrinsic dimensions (#1055).
    const { scope, recorded } = fakeScope();

    await rasterise("<svg/>", diagram, "light", scope);

    expect(recorded.decoded).toBe(1);
    expect(recorded.loadedUrl).toBe("blob:fake");
    expect(recorded.revoked).toEqual(["blob:fake"]);
  });

  it("hands back a PNG", async () => {
    const { scope, recorded } = fakeScope();

    await expect(rasterise("<svg/>", diagram, "light", scope)).resolves.toBe(png);
    expect(recorded.type).toBe("image/png");
  });
});
