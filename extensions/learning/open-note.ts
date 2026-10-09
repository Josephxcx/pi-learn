import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';

export function noteUri(notePath:string):string {
  if(!path.isAbsolute(notePath)||notePath.includes('\0'))throw new Error('Expected an absolute note path.');
  return `obsidian://open?path=${encodeURIComponent(notePath)}`;
}
export async function openNote(notePath:string):Promise<void> {
  const uri=noteUri(notePath);
  const command=process.platform==='darwin'?'open':process.platform==='win32'?'explorer.exe':'xdg-open';
  try { await promisify(execFile)(command,[uri],{timeout:5000,windowsHide:true}); }
  catch(error){throw new Error(`Could not launch Obsidian. Open the note directly: ${notePath}. ${error instanceof Error?error.message:String(error)}`);}
}
