// 6-second clips, rendered offline at a fixed frame rate: frame i is always t = i / fps,
// so the same code gives the same clip no matter how fast the machine is.
// MP4 through WebCodecs when the browser has an H.264 encoder, GIF otherwise.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { drawFrame, type Ctx2D, type Interp, type Op } from 'squiggle-core';

export interface ClipRequest {
  seconds: number;
  fps: number;
  px: number;
  kind: 'mp4' | 'gif';
}

type Progress = (done: number, total: number) => void;

function canvas(px: number): { ctx: Ctx2D; source: OffscreenCanvas | HTMLCanvasElement; read: () => Uint8ClampedArray } {
  const c: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  return { ctx: ctx as unknown as Ctx2D, source: c, read: () => ctx.getImageData(0, 0, px, px).data };
}

async function pickCodec(px: number, fps: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42002a', 'avc1.42001f']) {
    const config: VideoEncoderConfig = { codec, width: px, height: px, bitrate: 8_000_000, framerate: fps, avc: { format: 'avc' } };
    try {
      const r = await VideoEncoder.isConfigSupported(config);
      if (r.supported) return config;
    } catch {
      // try the next profile
    }
  }
  return null;
}

/** the frame at time t (seconds) */
type FrameAt = (t: number) => Op[];

async function mp4(frameAt: FrameAt, r: ClipRequest, config: VideoEncoderConfig, progress: Progress): Promise<Blob> {
  const { ctx, source } = canvas(r.px);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: r.px, height: r.px, frameRate: r.fps }, fastStart: 'in-memory' });
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config);
  const total = Math.round(r.seconds * r.fps);
  const step = 1_000_000 / r.fps;
  for (let i = 0; i < total; i++) {
    drawFrame(ctx, frameAt(i / r.fps), r.px);
    const frame = new VideoFrame(source, { timestamp: Math.round(i * step), duration: Math.round(step) });
    encoder.encode(frame, { keyFrame: i % (r.fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 8) await new Promise((res) => setTimeout(res, 4));
    if (failure) throw failure;
    if (i % 6 === 0) progress(i + 1, total);
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  progress(total, total);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

export const GIF_FPS = 20;

async function gif(frameAt: FrameAt, r: ClipRequest, progress: Progress): Promise<Blob> {
  const { ctx, read } = canvas(r.px);
  const enc = GIFEncoder();
  const total = Math.round(r.seconds * GIF_FPS);
  const delay = 1000 / GIF_FPS;
  for (let i = 0; i < total; i++) {
    drawFrame(ctx, frameAt(i / GIF_FPS), r.px);
    const rgba = read();
    const palette = quantize(rgba, 256);
    enc.writeFrame(applyPalette(rgba, palette), r.px, r.px, { palette, delay });
    if (i % 3 === 0) {
      progress(i + 1, total);
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  enc.finish();
  progress(total, total);
  return new Blob([enc.bytes()], { type: 'image/gif' });
}

/** MP4 when the browser can encode H.264, GIF otherwise. */
export async function encodeFrames(frameAt: FrameAt, r: ClipRequest, progress: Progress): Promise<{ blob: Blob; kind: 'mp4' | 'gif' }> {
  if (r.kind === 'mp4') {
    const config = await pickCodec(r.px, r.fps);
    if (config) {
      try {
        return { blob: await mp4(frameAt, r, config, progress), kind: 'mp4' };
      } catch {
        // fall through to GIF
      }
    }
  }
  return { blob: await gif(frameAt, r, progress), kind: 'gif' };
}

export function encodeClip(it: Interp, r: ClipRequest, progress: Progress): Promise<{ blob: Blob; kind: 'mp4' | 'gif' }> {
  return encodeFrames((t) => it.frame(t).ops, r, progress);
}
