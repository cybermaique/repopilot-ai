import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

export const filePathSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (path) =>
      !isAbsolute(path) &&
      !path.includes('\\') &&
      !path
        .split('/')
        .some((part) => part === '..' || part === '.' || part === '') &&
      !path.includes('\0'),
    'Unsafe file path',
  );
const excludedDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
]);
const allowedExtensions = new Set(['.ts', '.tsx', '.md', '.json']);
const sensitive =
  /(^\.env($|\.)|secret|credential|(^|[._-])(id_rsa|id_ed25519|private|token[._-]?key)([._-]|$)|\.(pem|key|p12|pfx)$|lock\.(json|yaml)$)/i;

export interface FileChunk {
  startLine: number;
  endLine: number;
  content: string;
}
export interface ImportedFile {
  path: string;
  content: string;
  lineCount: number;
  chunks: FileChunk[];
}
export interface FixtureSnapshot {
  revision: string;
  files: ImportedFile[];
  diagnostics: string[];
}

export function chunkFile(content: string, size = 40): FileChunk[] {
  if (!Number.isInteger(size) || size < 1)
    throw new Error('Invalid chunk size');
  if (!content) return [];
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const chunks: FileChunk[] = [];
  for (let start = 0; start < lines.length; start += size) {
    const excerpt = lines.slice(start, start + size);
    chunks.push({
      startLine: start + 1,
      endLine: start + excerpt.length,
      content: excerpt.join('\n'),
    });
  }
  return chunks;
}

export async function readFixture(
  root: string,
  signal?: AbortSignal,
): Promise<FixtureSnapshot> {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error('Fixture root must be a real directory');
  const canonicalRoot = await realpath(root);
  const files: ImportedFile[] = [];
  const diagnostics: string[] = [];
  let totalBytes = 0;
  let visited = 0;
  async function visit(directory: string) {
    signal?.throwIfAborted();
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    );
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (++visited > 512) throw new Error('Fixture entry limit exceeded');
      const absolute = resolve(directory, entry.name);
      const path = filePathSchema.parse(
        relative(canonicalRoot, absolute).split(sep).join('/'),
      );
      if (entry.isSymbolicLink()) {
        diagnostics.push(`Skipped symlink: ${path}`);
        continue;
      }
      if (entry.isDirectory()) {
        if (excludedDirectories.has(entry.name) || entry.name.startsWith('.')) {
          diagnostics.push(`Skipped generated/hidden directory: ${path}`);
          continue;
        }
        if (path.split('/').length > 8)
          throw new Error('Fixture nesting limit exceeded');
        const stat = await lstat(absolute);
        if (stat.isSymbolicLink() || !stat.isDirectory())
          throw new Error('Fixture changed during ingestion');
        await visit(absolute);
        continue;
      }
      if (
        !entry.isFile() ||
        sensitive.test(entry.name) ||
        !allowedExtensions.has(extname(entry.name))
      ) {
        diagnostics.push(`Skipped unsupported/sensitive file: ${path}`);
        continue;
      }
      const canonical = await realpath(absolute);
      if (!canonical.startsWith(canonicalRoot + sep))
        throw new Error('Fixture path escaped root');
      const handle = await open(
        absolute,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        const stat = await handle.stat();
        const linkStat = await lstat(absolute);
        if (
          linkStat.isSymbolicLink() ||
          stat.ino !== linkStat.ino ||
          !stat.isFile()
        )
          throw new Error('Fixture changed during ingestion');
        if (
          stat.size > 128 * 1024 ||
          (totalBytes += stat.size) > 1024 * 1024 ||
          files.length >= 128
        )
          throw new Error('Fixture size limit exceeded');
        const bytes = await handle.readFile();
        if (bytes.includes(0)) {
          diagnostics.push(`Skipped binary: ${path}`);
          continue;
        }
        let content: string;
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          diagnostics.push(`Skipped non-UTF-8: ${path}`);
          continue;
        }
        // Normalize CRLF only; preserve all original line positions and whitespace.
        content = content.replace(/\r\n/g, '\n');
        const chunks = chunkFile(content);
        files.push({
          path,
          content,
          chunks,
          lineCount: chunks.at(-1)?.endLine ?? 0,
        });
      } finally {
        await handle.close();
      }
    }
  }
  await visit(canonicalRoot);
  if (files.length === 0) throw new Error('Fixture has no indexable files');
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  // Length framing prevents ambiguous path/content concatenation.
  const hash = createHash('sha256');
  hash.update('repopilot-snapshot-v1\0');
  for (const file of files) {
    hash.update(JSON.stringify([file.path, file.content]));
    hash.update('\0');
  }
  return { revision: hash.digest('hex'), files, diagnostics };
}
