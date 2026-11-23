import type { GameIdea } from '../../types/idea'

// 딸깍 아이디어를 마크다운으로 조립한다 (QuickNote 저장용)
export function buildIdeaMarkdown(idea: GameIdea): string {
  return [
    `# ${idea.title}`,
    '',
    ...idea.lines.map((line, index) => `${index + 1}. ${line}`),
    '',
    `**건드리는 심리**: ${idea.hook}`,
    '',
    `**영감 소재**: ${idea.inspiration}`,
  ].join('\n')
}
