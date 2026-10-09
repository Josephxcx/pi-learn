import fs from 'node:fs/promises';
import path from 'node:path';
import { SaxesParser } from 'saxes';
import { Resvg } from '@resvg/resvg-js';
import { assertSafePath, atomicWriteFile, fileHash, readOptional, withFileLock } from './files.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'rect', 'circle', 'ellipse', 'line',
  'polyline', 'polygon', 'path', 'text', 'tspan', 'textPath', 'marker',
  'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'use', 'symbol',
]);

/** Accept a deliberately small, static SVG subset. Never fetch external resources. */
export function validateSvg(svg: string): { width: number; height: number } {
  if (Buffer.byteLength(svg) > 1_000_000) throw new Error('SVG exceeds the 1 MB limit.');
  let elements = 0;
  let width = 1200;
  let height = 800;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { throw new Error('SVG DOCTYPE declarations are not allowed.'); });
  parser.on('processinginstruction', () => { throw new Error('SVG processing instructions are not allowed.'); });
  parser.on('opentag', tag => {
    elements++;
    if (elements > 5000) throw new Error('SVG is too complex: more than 5000 elements.');
    if (tag.uri !== SVG_NS || !ALLOWED_ELEMENTS.has(tag.local)) {
      throw new Error(`Unsupported SVG element: ${tag.name}. Use static shapes and text.`);
    }
    if (elements === 1) {
      if (tag.local !== 'svg') throw new Error('The XML root must be svg.');
      const viewBox = tag.attributes.viewBox?.value;
      if (viewBox !== undefined) {
        const values = viewBox.trim().split(/[\s,]+/).map(Number);
        if (values.length !== 4 || values.some(n => !Number.isFinite(n)) || values[2]! <= 0 || values[3]! <= 0) {
          throw new Error('SVG viewBox requires four finite numbers with positive width and height.');
        }
        width = values[2]!;
        height = values[3]!;
      }
      {
        const dimension = (name: string, fallback: number) => {
          const value = tag.attributes[name]?.value;
          if (value === undefined) return fallback;
          if (!/^\d+(?:\.\d+)?(?:px)?$/.test(value) || parseFloat(value) <= 0) {
            throw new Error(`SVG ${name} must be a positive pixel dimension or supply a viewBox.`);
          }
          return parseFloat(value);
        };
        width = dimension('width', width);
        height = dimension('height', height);
      }
      if (width / height > 20 || height / width > 20) throw new Error('SVG aspect ratio exceeds 20:1. Split the diagram.');
    }
    for (const attr of Object.values(tag.attributes)) {
      const name = attr.local.toLowerCase();
      const value = attr.value;
      if (attr.uri === 'http://www.w3.org/2000/xmlns/') continue;
      if (/^on/i.test(name) || name === 'style' || name === 'base' || name === 'src') {
        throw new Error(`Unsupported SVG attribute: ${attr.name}. Use presentation attributes.`);
      }
      if (name === 'href' && !/^#[A-Za-z_][\w:.-]*$/.test(value)) {
        throw new Error('External SVG references are not allowed.');
      }
      // CSS escapes and imports are unnecessary in this static subset.
      if (/[\\@]/.test(value) || /(?:javascript|data|https?|file):/i.test(value)) {
        throw new Error(`Unsafe SVG attribute: ${attr.name}.`);
      }
      for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
        if (!/^\s*['"]?#[A-Za-z_][\w:.-]*['"]?\s*$/.test(match[1]!)) {
          throw new Error('External SVG paint references are not allowed.');
        }
      }
    }
  });
  parser.write(svg).close();
  if (!elements) throw new Error('SVG is empty.');
  return {width, height};
}

export interface DiagramResult {
  svgPath: string;
  pngPreviewPath: string | null;
  pngConversionSuccess: boolean;
  pngError?: string;
  visuallyVerified: false;
  assetsDir: string;
}

export async function saveDiagram(assetsDir: string, filename: string, svg: string, signal?: AbortSignal): Promise<DiagramResult> {
  signal?.throwIfAborted();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.svg$/i.test(filename)) {
    throw new Error('Invalid diagram filename. Use letters, numbers, hyphens or underscores and a .svg extension.');
  }
  const size = validateSvg(svg);
  const svgPath = path.join(assetsDir, filename);
  const pngPath = path.join(assetsDir, '.previews', `${fileHash(svg)}.png`);
  await assertSafePath(svgPath);
  await fs.mkdir(assetsDir, {recursive: true});
  await withFileLock(svgPath, async () => {
    await assertSafePath(svgPath);
    let previous: string | undefined;
    try { previous = await fs.readFile(svgPath, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (previous !== undefined && previous !== svg) {
      throw new Error(`Diagram already exists: ${filename}. Choose a new filename to preserve the existing lesson.`);
    }
    if (previous === undefined) await atomicWriteFile(svgPath, svg, null);
  }, signal);
  try {
    await assertSafePath(pngPath);
    const renderWidth = Math.max(1, Math.floor(Math.min(1200, 4096 * size.width / size.height)));
    const renderer = new Resvg(svg, {fitTo: {mode: 'width', value: renderWidth}, font: {loadSystemFonts: true}});
    const png = renderer.render().asPng();
    await withFileLock(pngPath, async () => {
      if (await readOptional(pngPath) === null) await atomicWriteFile(pngPath, png, null);
    }, signal);
    return {svgPath, pngPreviewPath: pngPath, pngConversionSuccess: true, visuallyVerified: false, assetsDir};
  } catch (error) {
    return {svgPath, pngPreviewPath: null, pngConversionSuccess: false, visuallyVerified: false, assetsDir,
      pngError: error instanceof Error ? error.message : String(error)};
  }
}
