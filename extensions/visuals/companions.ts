import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const componentDir = fileURLToPath(new URL('../../assets/visual-companion/', import.meta.url));
export function componentSource(name: 'editorial.css' | 'interactions.js'): string {
  return fs.readFileSync(path.join(componentDir, name), 'utf8');
}
export function validateVisualFilename(filename: string): void {
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*\.html$/iu.test(filename) || /[\\/]/.test(filename)) {
    throw new Error('Use a plain filename ending in .html; directory paths are not allowed.');
  }
}
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}
export function assembleCompanion(html: string, title: string, includeMath = false): string {
  if (!title.trim()) throw new Error('A visual companion needs a title.');
  if (!/^\s*<!doctype\s+html\s*>/i.test(html) || !/<head(?:\s[^>]*)?>/i.test(html) || !/<\/head\s*>/i.test(html) || !/<body(?:\s[^>]*)?>/i.test(html) || !/<\/body\s*>/i.test(html) || !/<\/html\s*>\s*$/i.test(html)) {
    throw new Error('Provide a complete HTML document with doctype, head, and body.');
  }
  // Prevent accidental duplicate injection when a saved document is edited and resubmitted.
  html = html.replace(/<!-- pi-learn:shared:start -->[\s\S]*?<!-- pi-learn:shared:end -->/g, '');
  html = html.replace(/(<head(?:\s[^>]*)?>)([\s\S]*?)(<\/head\s*>)/i, (_match, start, content, end) => start + content.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '') + end);
  const style = componentSource('editorial.css');
  const runtime = componentSource('interactions.js');
  let math = '';
  if (includeMath) {
    const dist = path.dirname(require.resolve('katex/dist/katex.min.css'));
    const css = fs.readFileSync(path.join(dist, 'katex.min.css'), 'utf8').replace(/url\(([^)]+)\)/g, (_all, raw) => {
      const relative = raw.replace(/["']/g, '');
      const font = fs.readFileSync(path.join(dist, relative));
      const extension = path.extname(relative).slice(1);
      return `url(data:font/${extension};base64,${font.toString('base64')})`;
    });
    const js = fs.readFileSync(path.join(dist, 'katex.min.js'), 'utf8');
    const license = fs.readFileSync(path.join(dist, '../LICENSE'), 'utf8').replace(/-->/g, '--&gt;');
    math = `<!-- KaTeX licence notice:\n${license}\n--><style>${css}</style><script>${js.replace(/<\/script/gi,'<\\/script')}</script>`;
  }
  const head = `<!-- pi-learn:shared:start --><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${style}</style>${math}<!-- pi-learn:shared:end -->`;
  const body = `<!-- pi-learn:shared:start --><script>${runtime}</script><!-- pi-learn:shared:end -->`;
  // Insert defaults first so topic-specific styles may intentionally override them.
  return html.replace(/<head(?:\s[^>]*)?>/i, match => match + head).replace(/<\/body\s*>/i, body + '</body>');
}
export function saveCompanion(options: {assetsDir:string; filename:string; htmlContent:string; title:string; includeMath?:boolean}): {htmlPath:string} {
  validateVisualFilename(options.filename);
  const html = assembleCompanion(options.htmlContent, options.title, options.includeMath);
  fs.mkdirSync(options.assetsDir, {recursive:true});
  const htmlPath = path.join(fs.realpathSync(options.assetsDir), options.filename);
  if (fs.existsSync(htmlPath) && fs.lstatSync(htmlPath).isSymbolicLink()) throw new Error('Refusing to overwrite a symbolic link.');
  // O_NOFOLLOW also rejects dangling symlinks and closes the check/open race.
  const fd = fs.openSync(htmlPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o644);
  try {fs.writeFileSync(fd, html, 'utf8');} finally {fs.closeSync(fd);}
  return {htmlPath};
}
export function companionLink(notePath:string, htmlPath:string, title:string):string {
  const label = title.replace(/[\\[\]]/g,'\\$&').replace(/[\r\n]/g,' ');
  const relative = path.relative(path.dirname(notePath), htmlPath).split(path.sep).map(encodeURIComponent).join('/');
  return `[${label}](${relative})`;
}
