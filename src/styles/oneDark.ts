// src/styles/oneDark.ts
// OneDark theme for syntax highlighting

export const oneDark = {
  'code[class*="language-"]': {
    color: '#abb2bf',
    background: 'none',
    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
    textAlign: 'left' as const,
    whiteSpace: 'pre' as const,
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: '#abb2bf',
    background: '#0d1117',
    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
    textAlign: 'left' as const,
    whiteSpace: 'pre' as const,
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
    padding: '1em',
    margin: '.5em 0',
    overflow: 'auto',
    borderRadius: '0.3em',
  },
  comment: {
    color: '#5c6370',
    fontStyle: 'italic',
  },
  prolog: {
    color: '#5c6370',
  },
  doctype: {
    color: '#5c6370',
  },
  cdata: {
    color: '#5c6370',
  },
  punctuation: {
    color: '#abb2bf',
  },
  '.namespace': {
    opacity: '0.7',
  },
  property: {
    color: '#d19a66',
  },
  tag: {
    color: '#e06c75',
  },
  constant: {
    color: '#d19a66',
  },
  symbol: {
    color: '#d19a66',
  },
  deleted: {
    color: '#e06c75',
  },
  boolean: {
    color: '#d19a66',
  },
  number: {
    color: '#d19a66',
  },
  selector: {
    color: '#98c379',
  },
  'attr-name': {
    color: '#d19a66',
  },
  string: {
    color: '#98c379',
  },
  char: {
    color: '#98c379',
  },
  builtin: {
    color: '#e5c07b',
  },
  inserted: {
    color: '#98c379',
  },
  operator: {
    color: '#56b6c2',
  },
  entity: {
    color: '#56b6c2',
    cursor: 'help',
  },
  url: {
    color: '#56b6c2',
  },
  '.language-css .token.string': {
    color: '#56b6c2',
  },
  '.style .token.string': {
    color: '#56b6c2',
  },
  variable: {
    color: '#e06c75',
  },
  atrule: {
    color: '#c678dd',
  },
  'attr-value': {
    color: '#98c379',
  },
  function: {
    color: '#61afef',
  },
  'class-name': {
    color: '#e5c07b',
  },
  keyword: {
    color: '#c678dd',
  },
  regex: {
    color: '#98c379',
  },
  important: {
    color: '#c678dd',
    fontWeight: 'bold',
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
};