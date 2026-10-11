import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chunkFile,
  filePathSchema,
  readFixture,
} from '../src/indexing/fixture.js';

describe('safe fixture ingestion', () => {
  test('chunks preserve original lines, including blanks and trailing newlines', () => {
    expect(chunkFile('first\n\nthird\nfourth\n', 2)).toEqual([
      { startLine: 1, endLine: 2, content: 'first\n' },
      { startLine: 3, endLine: 4, content: 'third\nfourth' },
    ]);
    expect(chunkFile('')).toEqual([]);
    expect(chunkFile('\n')).toEqual([
      { startLine: 1, endLine: 1, content: '' },
    ]);
    expect(() => chunkFile('x', 0)).toThrow();
  });
  test.each([
    '../secret.ts',
    '/etc/passwd',
    'src/../../key',
    'src\\file.ts',
    'src//file.ts',
    'src/./file.ts',
  ])('rejects traversal: %s', (path) => {
    expect(filePathSchema.safeParse(path).success).toBe(false);
  });
  test('same fixture content yields the same hash', async () => {
    const root = resolve(import.meta.dirname, '../../../fixtures/sample-repo');
    const first = await readFixture(root);
    const second = await readFixture(root);
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toEqual(first);
    expect(
      first.files.find((file) => file.path === 'src/session.ts')?.content,
    ).toContain('expiresAt: session.expiresAt');
  });
  test('excludes sensitive/generated/binary files and never executes code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'repopilot-safe-'));
    try {
      await mkdir(join(root, 'node_modules'));
      await writeFile(
        join(root, 'node_modules', 'bad.ts'),
        'throw new Error("must not execute")',
      );
      await writeFile(
        join(root, 'safe.ts'),
        'throw new Error("ingestion is read-only");\r\n',
      );
      await writeFile(join(root, '.env'), 'SECRET=placeholder');
      await writeFile(join(root, 'credentials.json'), '{"sensitive":true}');
      await writeFile(join(root, 'binary.ts'), Buffer.from([1, 0, 2]));
      await writeFile(join(root, 'invalid.md'), Buffer.from([0xff, 0xfe]));
      const result = await readFixture(root);
      expect(result.files.map((file) => file.path)).toEqual(['safe.ts']);
      expect(result.files[0]?.content).toBe(
        'throw new Error("ingestion is read-only");\n',
      );
      expect(result.diagnostics).toHaveLength(5);
      const before = result.revision;
      await writeFile(join(root, 'safe.ts'), 'different content\n');
      expect((await readFixture(root)).revision).not.toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test('does not follow a directory symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'repopilot-links-'));
    const outside = await mkdtemp(join(tmpdir(), 'repopilot-outside-'));
    try {
      await writeFile(join(root, 'safe.ts'), 'safe');
      await writeFile(join(outside, 'outside.ts'), 'outside');
      await symlink(
        outside,
        join(root, 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const result = await readFixture(root);
      expect(result.files.map((file) => file.path)).toEqual(['safe.ts']);
      expect(result.diagnostics).toContain('Skipped symlink: linked');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
