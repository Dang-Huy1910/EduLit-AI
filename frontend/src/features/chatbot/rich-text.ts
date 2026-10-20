/**
 * Minimal, safe formatting for chatbot answers: paragraphs, headings, bullet
 * and numbered lists, **bold** and `code`. Output is plain data rendered as
 * React elements; no HTML from the model is ever injected.
 */

export type Inline = { kind: 'text' | 'bold' | 'code'; text: string };

export type Block =
  | { kind: 'heading'; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'bullets'; items: Inline[][] }
  | { kind: 'numbers'; items: Inline[][]; start: number };

const BULLET_RE = /^\s*(?:[-*•+])\s+(.*)$/;
const NUMBER_RE = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const HEADING_RE = /^\s*#{1,4}\s+(.*)$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ kind: 'bold', text: match[1] });
    else out.push({ kind: 'code', text: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out.length ? out : [{ kind: 'text', text }];
}

export function parseRichText(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    const bullet = BULLET_RE.exec(line);
    const number = NUMBER_RE.exec(line);
    if (!heading && !bullet && !number) {
      paragraph.push(line.trim());
      continue;
    }
    flush();
    const previous = blocks[blocks.length - 1];
    if (heading) {
      blocks.push({ kind: 'heading', inlines: parseInline(heading[1].trim()) });
    } else if (bullet) {
      const item = parseInline(bullet[1].trim());
      if (previous?.kind === 'bullets') previous.items.push(item);
      else blocks.push({ kind: 'bullets', items: [item] });
    } else if (number) {
      const item = parseInline(number[2].trim());
      if (previous?.kind === 'numbers') previous.items.push(item);
      else blocks.push({ kind: 'numbers', items: [item], start: Number(number[1]) || 1 });
    }
  }
  flush();
  return blocks;
}
