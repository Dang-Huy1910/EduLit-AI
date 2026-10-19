'use client';

import React from 'react';
import { parseSafeMarkdown, stripUnsafe } from './safe-markdown';

function InlineText({ text }: { text: string }) {
  const safe = stripUnsafe(text);
  const parts = safe.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={index} className="px-1 rounded bg-surface-container-low text-[11px]">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

export default function SafeMarkdown({ markdown }: { markdown: string }) {
  const blocks = parseSafeMarkdown(markdown || '');
  if (!blocks.length) {
    return <p className="text-xs text-on-surface-variant">Chưa có Markdown.</p>;
  }
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = (block.level <= 2 ? 'h3' : 'h4') as 'h3' | 'h4';
          return (
            <Tag key={index} className="font-bold font-merriweather text-on-surface">
              <InlineText text={block.text} />
            </Tag>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag key={index} className={block.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineText text={item} />
                </li>
              ))}
            </ListTag>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto">
              <table className="min-w-full text-xs border border-outline-variant/40">
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={headerIndex} className="border px-2 py-1 bg-surface-container-low text-left">
                        <InlineText text={header} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border px-2 py-1">
                          <InlineText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'code' || block.type === 'pre') {
          return (
            <pre key={index} className="p-2 rounded-lg bg-surface-container-low text-[11px] whitespace-pre-wrap">
              {stripUnsafe(block.text)}
            </pre>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            <InlineText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
