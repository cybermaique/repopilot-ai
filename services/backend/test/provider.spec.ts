import {
  DemoProvider,
  providerResultSchema,
  validateReferences,
} from '../src/providers/demo.provider.js';
import { lexicalTerms, type Source } from '../src/search/search.repository.js';
import { readConfig } from '../src/config.js';

const source: Source = {
  sourceId: '00000000-0000-4000-8000-000000000010',
  snapshotId: '00000000-0000-4000-8000-000000000011',
  path: 'src/session.ts',
  revision: 'a'.repeat(64),
  startLine: 14,
  endLine: 16,
  content:
    'export function isTokenExpired(session: Session, now: number): boolean {\n  return now >= session.expiresAt;\n}',
};
describe('deterministic Demo provider', () => {
  const provider = new DemoProvider();
  test('extracts retrieved evidence with known source IDs', () => {
    const result = provider.answer('Where is isTokenExpired defined?', [
      source,
    ]);
    expect(result.evidence).toBe('supported');
    expect(result.findings[0]?.text).toContain('function isTokenExpired');
    expect(result.findings[0]?.sourceIds).toEqual([source.sourceId]);
    expect(
      provider.answer('Where is isTokenExpired defined?', [source]),
    ).toEqual(result);
    expect(() => validateReferences(result, [source])).not.toThrow();
  });
  test('abstains for empty or unrelated evidence', () => {
    expect(provider.answer('Where is billing configured?', []).evidence).toBe(
      'insufficient',
    );
    expect(
      provider.answer('Explain Kubernetes deployments', [source]).findings,
    ).toEqual([]);
  });
  test('rejects invented IDs and malformed structured output', () => {
    const result = provider.answer('isTokenExpired', [source]);
    result.findings[0]!.sourceIds = ['00000000-0000-4000-8000-000000000099'];
    expect(() => validateReferences(result, [source])).toThrow(
      'unknown source',
    );
    expect(
      providerResultSchema.safeParse({
        ...result,
        url: 'https://invented.invalid',
      }).success,
    ).toBe(false);
  });
  test('search tokens include exact identifier, split components and paths', () => {
    expect(lexicalTerms('Where is isTokenExpired in src/session.ts?')).toEqual(
      expect.arrayContaining([
        'istokenexpired',
        'token',
        'expired',
        'src/session.ts',
        'session',
      ]),
    );
    expect(lexicalTerms('the and where')).toEqual([]);
  });
  test('production refuses local auth, including when bypass is false', () => {
    expect(() =>
      readConfig({ NODE_ENV: 'production', DEV_AUTH: 'true' }),
    ).toThrow('startup refused');
    expect(() =>
      readConfig({ NODE_ENV: 'production', DEV_AUTH: 'false' }),
    ).toThrow('startup refused');
    expect(() => readConfig({ DEV_AUTH: 'false' })).toThrow('startup refused');
    expect(() =>
      readConfig({ LOCAL_ORIGIN: 'https://public.invalid' }),
    ).toThrow('must be local');
  });
});
