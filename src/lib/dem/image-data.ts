/**
 * ImageData polyfill for Cloudflare Workers environment.
 * Workers don't have the DOM ImageData class, so we provide a compatible implementation.
 */

/**
 * A simple ImageData-compatible class for processing pixel data.
 * This works in both browser and Workers environments.
 */
export class WorkersImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: 'srgb' = 'srgb';

  constructor(data: Uint8ClampedArray, width: number, height?: number);
  constructor(width: number, height: number);
  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    maybeHeight?: number
  ) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = maybeHeight ?? (dataOrWidth.length / 4 / widthOrHeight);
    } else {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    }
  }
}

/**
 * Type alias that works with both native ImageData and our polyfill
 */
export type ImageDataLike = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};
