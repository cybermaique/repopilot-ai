import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  lexicalTerms,
  sourceSchema,
  type Source,
} from '../search/search.repository.js';

export const providerResultSchema = z
  .object({
    evidence: z.enum(['supported', 'insufficient']),
    summary: z.string().min(1).max(4000),
    findings: z
      .array(
        z.object({
          text: z.string().min(1).max(4000),
          sourceIds: z.array(z.string().uuid()).min(1).max(5),
        }),
      )
      .max(5),
  })
  .strict();
export type ProviderResult = z.infer<typeof providerResultSchema>;
export interface AnswerProvider {
  answer(question: string, sources: Source[]): ProviderResult;
}
export const answerSchema = providerResultSchema.extend({
  provider: z.literal('demo'),
  sources: z.array(sourceSchema),
  durationMs: z.number().nonnegative(),
  limitation: z.string(),
});
export type Answer = z.infer<typeof answerSchema>;

@Injectable()
export class DemoProvider implements AnswerProvider {
  answer(question: string, sources: Source[]): ProviderResult {
    // Conservative extractive baseline: only quote retrieved sentences containing question terms.
    // No inferred plan, outside knowledge, tool execution, or model calls.
    const terms = lexicalTerms(question);
    const candidates = sources
      .map((source) => {
        const lines = source.content.split('\n');
        const matching = lines.filter((line) =>
          terms.some((term) => line.toLowerCase().includes(term)),
        );
        const coverage = terms.filter((term) =>
          (source.path + '\n' + source.content).toLowerCase().includes(term),
        ).length;
        return { source, matching, coverage };
      })
      .filter(
        (item) =>
          item.matching.length &&
          item.coverage / Math.max(terms.length, 1) >= 0.45,
      );
    if (!candidates.length) {
      return providerResultSchema.parse({
        evidence: 'insufficient',
        summary:
          'Insufficient evidence in this snapshot. Try an identifier or path from the sample session client.',
        findings: [],
      });
    }
    return providerResultSchema.parse({
      evidence: 'supported',
      summary:
        'The following excerpts match your question. Review the cited code and documentation; this Demo provider extracts evidence and does not reason with an LLM.',
      findings: candidates.slice(0, 3).map(({ source, matching }) => ({
        text: `${source.path}:\n${matching.slice(0, 6).join('\n')}`,
        sourceIds: [source.sourceId],
      })),
    });
  }
}

export function validateReferences(result: ProviderResult, sources: Source[]) {
  const ids = new Set(sources.map((source) => source.sourceId));
  if (result.evidence === 'insufficient' && result.findings.length)
    throw new Error('Insufficient response cannot cite findings');
  if (result.evidence === 'supported' && !result.findings.length)
    throw new Error('Supported response needs findings');
  for (const finding of result.findings) {
    if (finding.sourceIds.some((id) => !ids.has(id)))
      throw new Error('Provider referenced an unknown source');
  }
}
