'use client';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type UIEvent,
} from 'react';
import PageLayout from '@/components/PageLayout';
import FeaturesShowcase from '@/components/FeaturesShowcase';
import styles from '@/app/shared.module.css';

type FormatMode = 'pretty' | 'minify';
type OutputView = 'tree' | 'text';

type TextVariant = {
  label: string;
  text: string;
};

type ParsedJson = {
  decodedInputString: boolean;
  entries: number;
  extracted: boolean;
  ignoredLines: number;
  method: string;
  value: unknown;
};

type FormatterStats = {
  decodedNested: number;
  entries: number;
  extracted: boolean;
  ignoredLines: number;
  lines: number;
  method: string;
  rootType: string;
};

type DomainCount = {
  count: number;
  domain: string;
};

type LinkCount = {
  count: number;
  domain: string;
  href: string;
  url: string;
};

type JsonAnalysis = {
  arrays: number;
  booleans: number;
  domains: DomainCount[];
  emptyArrays: number;
  emptyObjects: number;
  emptyStrings: number;
  keys: number;
  linkItems: LinkCount[];
  links: number;
  maxDepth: number;
  nulls: number;
  numbers: number;
  objects: number;
  strings: number;
  totalNodes: number;
  uniqueLinks: number;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s"'<>()[\]{}]+/gi;

const SAMPLE_LOG = `2026-05-29T10:18:04.232Z INFO request completed {"level":"info","requestId":"c8b88b4e","payload":"{\\"user\\":{\\"id\\":42,\\"role\\":\\"admin\\"},\\"flags\\":[\\"cloudwatch\\",\\"escaped-json\\"],\\"url\\":\\"https://api.example.com/v1//health\\"}","durationMs":128} // copied from logs`;

function normalizeInput(input: string): string {
  return input.replace(/^\uFEFF/, '').trim();
}

function stripJsonComments(input: string): string {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inString) {
      output += char;

      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') {
        i += 1;
      }
      if (i < input.length) output += input[i];
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (
        i < input.length &&
        !(input[i] === '*' && input[i + 1] === '/')
      ) {
        if (input[i] === '\n') output += '\n';
        i += 1;
      }
      i += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function unescapeQuotedJson(input: string): string {
  return input.replace(/\\+"/g, '"');
}

function collapseEscapedBackslashes(input: string): string {
  return input.replace(/\\\\/g, '\\');
}

function getTextVariants(input: string): TextVariant[] {
  const base = normalizeInput(input);
  const variants: TextVariant[] = [
    { label: 'standard JSON', text: base },
    { label: 'comments stripped', text: stripJsonComments(base) },
    { label: 'escaped quotes cleaned', text: unescapeQuotedJson(base) },
    {
      label: 'escaped quotes and comments cleaned',
      text: stripJsonComments(unescapeQuotedJson(base)),
    },
    {
      label: 'escaped slashes cleaned',
      text: collapseEscapedBackslashes(unescapeQuotedJson(base)),
    },
  ];

  const seen = new Set<string>();
  return variants
    .map((variant) => ({
      ...variant,
      text: normalizeInput(variant.text),
    }))
    .filter((variant) => {
      if (!variant.text || seen.has(variant.text)) return false;
      seen.add(variant.text);
      return true;
    });
}

function tryParseJson(input: string):
  | { ok: true; value: unknown }
  | { message: string; ok: false } {
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Invalid JSON.',
    };
  }
}

function looksLikeJsonSource(input: string): boolean {
  const text = normalizeInput(input);
  return (
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']')) ||
    text.startsWith('\\"{') ||
    text.startsWith('\\"[') ||
    text.startsWith('{\\') ||
    text.startsWith('[\\') ||
    text.startsWith('\\{') ||
    text.startsWith('\\[')
  );
}

function parseDirectJson(input: string, depth = 0): ParsedJson | null {
  if (depth > 5) return null;

  for (const variant of getTextVariants(input)) {
    const parsed = tryParseJson(variant.text);
    if (!parsed.ok) continue;

    if (
      typeof parsed.value === 'string' &&
      looksLikeJsonSource(parsed.value)
    ) {
      const nested = parseSingleJson(parsed.value, depth + 1);
      if (nested) {
        return {
          ...nested,
          decodedInputString: true,
          method: `${variant.label}, decoded JSON string`,
        };
      }
    }

    return {
      decodedInputString: false,
      entries: 1,
      extracted: false,
      ignoredLines: 0,
      method: variant.label,
      value: parsed.value,
    };
  }

  return null;
}

function extractJsonCandidates(input: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (start === -1) {
      if (char === '{' || char === '[') {
        start = i;
        stack = [char];
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char !== '}' && char !== ']') continue;

    const opener = stack[stack.length - 1];
    const matches =
      (opener === '{' && char === '}') || (opener === '[' && char === ']');

    if (!matches) {
      start = -1;
      stack = [];
      inString = false;
      escaped = false;
      continue;
    }

    stack.pop();
    if (stack.length === 0) {
      candidates.push(input.slice(start, i + 1));
      start = -1;
      inString = false;
      escaped = false;
    }
  }

  return Array.from(new Set(candidates)).sort((a, b) => b.length - a.length);
}

function parseSingleJson(input: string, depth = 0): ParsedJson | null {
  const direct = parseDirectJson(input, depth);
  if (direct) return direct;

  for (const variant of getTextVariants(input)) {
    for (const candidate of extractJsonCandidates(variant.text)) {
      const parsed = parseDirectJson(candidate, depth + 1);
      if (parsed) {
        return {
          ...parsed,
          extracted: true,
          method: `extracted from log, ${parsed.method}`,
        };
      }
    }
  }

  return null;
}

function parseJsonLines(input: string): ParsedJson | null {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const values: unknown[] = [];
  let ignoredLines = 0;
  let extracted = false;
  let decodedInputString = false;

  for (const line of lines) {
    const parsed = parseSingleJson(line);
    if (!parsed) {
      ignoredLines += 1;
      continue;
    }

    values.push(parsed.value);
    extracted = extracted || parsed.extracted;
    decodedInputString = decodedInputString || parsed.decodedInputString;
  }

  if (values.length === 0) return null;

  return {
    decodedInputString,
    entries: values.length,
    extracted: extracted || ignoredLines > 0 || values.length > 1,
    ignoredLines,
    method: `parsed ${values.length} log line${values.length === 1 ? '' : 's'}`,
    value: values.length === 1 ? values[0] : values,
  };
}

function parseJsonInput(input: string): ParsedJson {
  const normalized = normalizeInput(input);
  if (!normalized) {
    throw new Error('Input is empty.');
  }

  const parsed =
    parseDirectJson(normalized) ??
    parseJsonLines(normalized) ??
    parseSingleJson(normalized);
  if (parsed) return parsed;

  const firstError = tryParseJson(normalized);
  throw new Error(
    firstError.ok ? 'Invalid JSON.' : `Invalid JSON: ${firstError.message}`,
  );
}

function decodeNestedJsonStrings(
  value: unknown,
  depth = 0,
): { count: number; value: unknown } {
  if (depth > 8) return { count: 0, value };

  if (typeof value === 'string') {
    if (!looksLikeJsonSource(value)) return { count: 0, value };

    const parsed = parseSingleJson(value, depth + 1);
    if (!parsed) return { count: 0, value };

    const decoded = decodeNestedJsonStrings(parsed.value, depth + 1);
    return {
      count: decoded.count + 1,
      value: decoded.value,
    };
  }

  if (Array.isArray(value)) {
    let count = 0;
    const nextValue = value.map((item) => {
      const decoded = decodeNestedJsonStrings(item, depth + 1);
      count += decoded.count;
      return decoded.value;
    });

    return { count, value: nextValue };
  }

  if (value && typeof value === 'object') {
    let count = 0;
    const nextValue: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const decoded = decodeNestedJsonStrings(item, depth + 1);
      count += decoded.count;
      nextValue[key] = decoded.value;
    });

    return { count, value: nextValue };
  }

  return { count: 0, value };
}

function getRootType(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value === null) return 'Null';
  if (typeof value === 'object') {
    return `Object(${Object.keys(value as Record<string, unknown>).length})`;
  }
  return typeof value;
}

function buildOutput(value: unknown, mode: FormatMode): string {
  return JSON.stringify(value, null, mode === 'pretty' ? 2 : 0) ?? '';
}

function countLines(input: string): number {
  return input ? input.split(/\r\n|\r|\n/).length : 0;
}

function countEditorLines(input: string): number {
  return Math.max(1, countLines(input));
}

function trimLinkCandidate(link: string): string {
  return link.replace(/[),.;:!?]+$/g, '');
}

function extractLinks(input: string): string[] {
  return Array.from(input.matchAll(LINK_PATTERN), (match) =>
    trimLinkCandidate(match[0]),
  ).filter(Boolean);
}

function getLinkHref(link: string): string {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function getLinkDomain(link: string): string {
  try {
    return new URL(getLinkHref(link)).hostname.replace(/^www\./, '');
  } catch {
    return 'invalid-url';
  }
}

function analyzeJsonValue(value: unknown): JsonAnalysis {
  const domainCounts = new Map<string, number>();
  const linkCounts = new Map<string, LinkCount>();
  const uniqueLinks = new Set<string>();
  const analysis: JsonAnalysis = {
    arrays: 0,
    booleans: 0,
    domains: [],
    emptyArrays: 0,
    emptyObjects: 0,
    emptyStrings: 0,
    keys: 0,
    linkItems: [],
    links: 0,
    maxDepth: 0,
    nulls: 0,
    numbers: 0,
    objects: 0,
    strings: 0,
    totalNodes: 0,
    uniqueLinks: 0,
  };

  const trackLinks = (text: string) => {
    for (const link of extractLinks(text)) {
      const href = getLinkHref(link);
      const domain = getLinkDomain(link);
      const existingLink = linkCounts.get(href);

      analysis.links += 1;
      uniqueLinks.add(href);

      if (existingLink) {
        existingLink.count += 1;
      } else {
        linkCounts.set(href, {
          count: 1,
          domain,
          href,
          url: link,
        });
      }

      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
  };

  const visit = (item: unknown, depth: number) => {
    analysis.totalNodes += 1;
    analysis.maxDepth = Math.max(analysis.maxDepth, depth);

    if (Array.isArray(item)) {
      analysis.arrays += 1;
      if (item.length === 0) analysis.emptyArrays += 1;
      item.forEach((child) => visit(child, depth + 1));
      return;
    }

    if (isJsonObject(item)) {
      const entries = Object.entries(item);
      analysis.objects += 1;
      analysis.keys += entries.length;
      if (entries.length === 0) analysis.emptyObjects += 1;
      entries.forEach(([, child]) => visit(child, depth + 1));
      return;
    }

    if (typeof item === 'string') {
      analysis.strings += 1;
      if (item.length === 0) analysis.emptyStrings += 1;
      trackLinks(item);
      return;
    }

    if (typeof item === 'number') {
      analysis.numbers += 1;
      return;
    }

    if (typeof item === 'boolean') {
      analysis.booleans += 1;
      return;
    }

    if (item === null) analysis.nulls += 1;
  };

  visit(value, 0);

  analysis.uniqueLinks = uniqueLinks.size;
  analysis.linkItems = Array.from(linkCounts.values()).sort(
    (first, second) => {
      if (second.count !== first.count) return second.count - first.count;
      return first.url.localeCompare(second.url);
    },
  );
  analysis.domains = Array.from(domainCounts, ([domain, count]) => ({
    count,
    domain,
  })).sort((first, second) => {
    if (second.count !== first.count) return second.count - first.count;
    return first.domain.localeCompare(second.domain);
  });

  return analysis;
}

function JsonTextareaWithLineNumbers({
  className = '',
  onChange,
  placeholder,
  readOnly = false,
  value,
}: {
  className?: string;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  readOnly?: boolean;
  value: string;
}) {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const lineNumbers = useMemo(
    () =>
      Array.from({ length: countEditorLines(value) }, (_, index) => index + 1),
    [value],
  );

  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!lineNumbersRef.current) return;
    lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
  };

  return (
    <div className={styles.jsonTextareaWithLines}>
      <div
        ref={lineNumbersRef}
        aria-hidden='true'
        className={styles.jsonLineNumbers}
      >
        {lineNumbers.map((lineNumber) => (
          <span key={lineNumber}>{lineNumber}</span>
        ))}
      </div>
      <textarea
        className={`${styles.jsonNumberedTextarea} ${className}`}
        value={value}
        onChange={onChange}
        onScroll={handleScroll}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
        wrap='off'
      />
    </div>
  );
}

type JsonTreeIndentStyle = CSSProperties & {
  '--json-depth': number;
};

function getTreeIndentStyle(depth: number): JsonTreeIndentStyle {
  return { '--json-depth': depth };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatPrimitiveValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  return String(value);
}

function getPrimitiveClass(value: unknown): string {
  if (typeof value === 'string') return styles.jsonTreeString;
  if (typeof value === 'number') return styles.jsonTreeNumber;
  if (typeof value === 'boolean') return styles.jsonTreeBoolean;
  if (value === null) return styles.jsonTreeNull;
  return styles.jsonTreeValue;
}

function getBranchSummary(value: unknown, count: number): string {
  return Array.isArray(value)
    ? `Array(${count})`
    : `Object(${count})`;
}

function JsonTreeLabel({
  isArrayItem,
  name,
}: {
  isArrayItem: boolean;
  name?: string;
}) {
  if (name === undefined) return null;

  if (isArrayItem) {
    return (
      <>
        <span className={styles.jsonTreeIndex}>{name}</span>
        <span className={styles.jsonTreeColon}>:</span>
      </>
    );
  }

  return (
    <>
      <span className={styles.jsonTreeKey}>{JSON.stringify(name)}</span>
      <span className={styles.jsonTreeColon}>:</span>
    </>
  );
}

function JsonTreeNode({
  depth = 0,
  isArrayItem = false,
  isLast = true,
  name,
  value,
}: {
  depth?: number;
  isArrayItem?: boolean;
  isLast?: boolean;
  name?: string;
  value: unknown;
}) {
  const [isCollapsed, setIsCollapsed] = useState(depth > 1);
  const isArray = Array.isArray(value);
  const isObject = isJsonObject(value);
  const isBranch = isArray || isObject;
  const comma = isLast ? '' : ',';

  if (!isBranch) {
    return (
      <div
        className={`${styles.jsonTreeRow} ${styles.jsonTreeLeafRow}`}
        style={getTreeIndentStyle(depth)}
      >
        <span className={styles.jsonTreeToggleSpacer} />
        <JsonTreeLabel isArrayItem={isArrayItem} name={name} />
        <span
          className={`${styles.jsonTreeValue} ${getPrimitiveClass(value)}`}
        >
          {formatPrimitiveValue(value)}
        </span>
        <span className={styles.jsonTreeComma}>{comma}</span>
      </div>
    );
  }

  const entries = isArray
    ? value.map((item, index) => ({
        isArrayItem: true,
        key: String(index),
        value: item,
      }))
    : Object.entries(value as Record<string, unknown>).map(
        ([entryKey, entryValue]) => ({
          isArrayItem: false,
          key: entryKey,
          value: entryValue,
        }),
      );
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const isEmpty = entries.length === 0;

  if (isEmpty) {
    return (
      <div
        className={`${styles.jsonTreeRow} ${styles.jsonTreeLeafRow}`}
        style={getTreeIndentStyle(depth)}
      >
        <span className={styles.jsonTreeToggleSpacer} />
        <JsonTreeLabel isArrayItem={isArrayItem} name={name} />
        <span className={styles.jsonTreeBracket}>
          {openBracket}
          {closeBracket}
        </span>
        <span className={styles.jsonTreeComma}>{comma}</span>
      </div>
    );
  }

  return (
    <div className={styles.jsonTreeNode}>
      <button
        aria-expanded={!isCollapsed}
        className={`${styles.jsonTreeRow} ${styles.jsonTreeBranchRow}`}
        onClick={() => setIsCollapsed((current) => !current)}
        style={getTreeIndentStyle(depth)}
        type='button'
      >
        <span className={styles.jsonTreeToggleIcon}>
          {isCollapsed ? '▸' : '▾'}
        </span>
        <JsonTreeLabel isArrayItem={isArrayItem} name={name} />
        <span className={styles.jsonTreeBracket}>{openBracket}</span>
        <span className={styles.jsonTreeSummary}>
          {getBranchSummary(value, entries.length)}
        </span>
        {isCollapsed && (
          <>
            <span className={styles.jsonTreeBracket}>{closeBracket}</span>
            <span className={styles.jsonTreeComma}>{comma}</span>
          </>
        )}
      </button>

      {!isCollapsed && (
        <>
          {entries.map((entry, index) => (
            <JsonTreeNode
              key={`${entry.key}-${index}`}
              depth={depth + 1}
              isArrayItem={entry.isArrayItem}
              isLast={index === entries.length - 1}
              name={entry.key}
              value={entry.value}
            />
          ))}
          <div
            className={`${styles.jsonTreeRow} ${styles.jsonTreeClosingRow}`}
            style={getTreeIndentStyle(depth)}
          >
            <span className={styles.jsonTreeToggleSpacer} />
            <span className={styles.jsonTreeBracket}>{closeBracket}</span>
            <span className={styles.jsonTreeComma}>{comma}</span>
          </div>
        </>
      )}
    </div>
  );
}

function JsonTree({ value }: { value: unknown }) {
  return (
    <div className={styles.jsonTree}>
      <JsonTreeNode value={value} />
    </div>
  );
}

export default function FormatJsonPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [jsonOutput, setJsonOutput] = useState('');
  const [jsonValue, setJsonValue] = useState<unknown>();
  const [formatMode, setFormatMode] = useState<FormatMode>('pretty');
  const [outputView, setOutputView] = useState<OutputView>('tree');
  const [outputRevision, setOutputRevision] = useState(0);
  const [decodeNested, setDecodeNested] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<FormatterStats | null>(null);
  const [analysis, setAnalysis] = useState<JsonAnalysis | null>(null);
  const [fileName, setFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatText = useCallback(
    (input: string, mode: FormatMode, shouldDecodeNested = decodeNested) => {
      try {
        const parsed = parseJsonInput(input);
        const decoded = shouldDecodeNested
          ? decodeNestedJsonStrings(parsed.value)
          : { count: 0, value: parsed.value };
        const output = buildOutput(decoded.value, mode);

        setJsonOutput(output);
        setJsonValue(decoded.value);
        setOutputRevision((revision) => revision + 1);
        setAnalysis(analyzeJsonValue(decoded.value));
        setError('');
        setStats({
          decodedNested: decoded.count + (parsed.decodedInputString ? 1 : 0),
          entries: parsed.entries,
          extracted: parsed.extracted,
          ignoredLines: parsed.ignoredLines,
          lines: countLines(output),
          method: parsed.method,
          rootType: getRootType(decoded.value),
        });
      } catch (formatError) {
        setJsonOutput('');
        setJsonValue(undefined);
        setAnalysis(null);
        setStats(null);
        setError(
          formatError instanceof Error
            ? formatError.message
            : 'Unable to format JSON.',
        );
      }
    },
    [decodeNested],
  );

  const handleSample = useCallback(() => {
    setFileName('');
    setJsonInput(SAMPLE_LOG);
    formatText(SAMPLE_LOG, formatMode);
  }, [formatMode, formatText]);

  const handleModeChange = (mode: FormatMode) => {
    setFormatMode(mode);
    if (jsonInput.trim()) formatText(jsonInput, mode);
  };

  const handleDecodeNestedChange = (checked: boolean) => {
    setDecodeNested(checked);
    if (jsonInput.trim()) formatText(jsonInput, formatMode, checked);
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError('File size exceeds the 5MB limit.');
      return;
    }

    const text = await file.text();
    setFileName(file.name);
    setJsonInput(text);
    formatText(text, formatMode);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleClear = () => {
    setJsonInput('');
    setJsonOutput('');
    setJsonValue(undefined);
    setAnalysis(null);
    setError('');
    setStats(null);
    setFileName('');
    setCopyLabel('Copy');
  };

  const handleCopy = async () => {
    if (!jsonOutput) return;
    await navigator.clipboard.writeText(jsonOutput);
    setCopyLabel('Copied');
    window.setTimeout(() => setCopyLabel('Copy'), 1200);
  };

  const handleDownload = () => {
    if (!jsonOutput) return;

    const blob = new Blob([jsonOutput], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName
      ? fileName.replace(/\.[^.]+$/, '.formatted.json')
      : 'formatted.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageLayout mainClassName={styles.jsonMain} onSampleClick={handleSample}>
      <section className={styles.inputSection}>
        <div className={styles.jsonTopBar}>
          <div
            className={`${styles.jsonDropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragLeave={() => setIsDragOver(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type='file'
              accept='.json,.log,.txt'
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
            <span className={styles.jsonDropIcon}>↥</span>
            <span className={styles.jsonDropText}>
              {fileName || 'Upload .json .log .txt'}
            </span>
          </div>

          <label className={styles.checkboxOption}>
            <input
              type='checkbox'
              checked={decodeNested}
              onChange={(event) =>
                handleDecodeNestedChange(event.target.checked)
              }
            />
            Decode nested JSON strings
          </label>
        </div>

        <div className={styles.jsonWorkspace}>
          <div className={styles.jsonPanel}>
            <div className={styles.jsonPanelHeader}>
              <span className={styles.jsonPanelTitle}>Input</span>
              <span className={styles.jsonPanelMeta}>
                {jsonInput ? `${jsonInput.length.toLocaleString()} chars` : ''}
              </span>
            </div>
            <JsonTextareaWithLineNumbers
              value={jsonInput}
              onChange={(event) => setJsonInput(event.target.value)}
              placeholder='Paste JSON or CloudWatch log content'
            />
          </div>

          <div className={styles.jsonPanel}>
            <div className={styles.jsonPanelHeader}>
              <span className={styles.jsonPanelTitle}>Output</span>
              <div className={styles.jsonPanelHeaderActions}>
                <span className={styles.jsonPanelMeta}>
                  {stats
                    ? `${stats.rootType} · ${stats.lines.toLocaleString()} lines`
                    : ''}
                </span>
                <div
                  aria-label='Output view'
                  className={`${styles.viewToggle} ${styles.jsonPanelViewToggle}`}
                >
                  <button
                    className={`${styles.viewBtn} ${styles.jsonPanelViewBtn} ${outputView === 'tree' ? styles.viewBtnActive : ''}`}
                    onClick={() => setOutputView('tree')}
                    type='button'
                  >
                    Tree
                  </button>
                  <button
                    className={`${styles.viewBtn} ${styles.jsonPanelViewBtn} ${outputView === 'text' ? styles.viewBtnActive : ''}`}
                    onClick={() => setOutputView('text')}
                    type='button'
                  >
                    Text
                  </button>
                </div>
              </div>
            </div>
            {outputView === 'tree' ? (
              <div className={styles.jsonTreeViewport}>
                {jsonOutput && jsonValue !== undefined ? (
                  <JsonTree key={outputRevision} value={jsonValue} />
                ) : (
                  <div className={styles.jsonTreeEmpty}>Formatted JSON</div>
                )}
              </div>
            ) : (
              <JsonTextareaWithLineNumbers
                className={styles.jsonOutputTextarea}
                value={jsonOutput}
                readOnly
                placeholder='Formatted JSON'
              />
            )}
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {stats && (
          <div className={styles.jsonStatsBar}>
            <span>{stats.method}</span>
            <span>{stats.entries.toLocaleString()} entr{stats.entries === 1 ? 'y' : 'ies'}</span>
            {stats.decodedNested > 0 && (
              <span>{stats.decodedNested.toLocaleString()} decoded</span>
            )}
            {stats.extracted && <span>extracted</span>}
            {stats.ignoredLines > 0 && (
              <span>{stats.ignoredLines.toLocaleString()} lines ignored</span>
            )}
          </div>
        )}

        {analysis && (
          <div className={styles.jsonAnalysisPanel}>
            <div className={styles.jsonAnalysisHeader}>
              <span className={styles.jsonAnalysisTitle}>Analysis</span>
              <span className={styles.jsonAnalysisMeta}>
                {analysis.totalNodes.toLocaleString()} values · depth{' '}
                {analysis.maxDepth.toLocaleString()}
              </span>
            </div>

            <div className={styles.jsonAnalysisGrid}>
              <div className={styles.jsonAnalysisMetric}>
                <span>Links</span>
                <strong>{analysis.links.toLocaleString()}</strong>
                <small>{analysis.uniqueLinks.toLocaleString()} unique</small>
              </div>
              <div className={styles.jsonAnalysisMetric}>
                <span>Domains</span>
                <strong>{analysis.domains.length.toLocaleString()}</strong>
                <small>from URL strings</small>
              </div>
              <div className={styles.jsonAnalysisMetric}>
                <span>Keys</span>
                <strong>{analysis.keys.toLocaleString()}</strong>
                <small>{analysis.objects.toLocaleString()} objects</small>
              </div>
              <div className={styles.jsonAnalysisMetric}>
                <span>Arrays</span>
                <strong>{analysis.arrays.toLocaleString()}</strong>
                <small>{analysis.emptyArrays.toLocaleString()} empty</small>
              </div>
              <div className={styles.jsonAnalysisMetric}>
                <span>Strings</span>
                <strong>{analysis.strings.toLocaleString()}</strong>
                <small>{analysis.emptyStrings.toLocaleString()} empty</small>
              </div>
              <div className={styles.jsonAnalysisMetric}>
                <span>Numbers</span>
                <strong>{analysis.numbers.toLocaleString()}</strong>
                <small>
                  {analysis.booleans.toLocaleString()} booleans ·{' '}
                  {analysis.nulls.toLocaleString()} nulls
                </small>
              </div>
            </div>

            {analysis.domains.length > 0 && (
              <div className={styles.jsonDomainList}>
                {analysis.domains.slice(0, 6).map((domain) => (
                  <span className={styles.jsonDomainChip} key={domain.domain}>
                    <span className={styles.jsonDomainName}>
                      {domain.domain}
                    </span>
                    <strong>{domain.count.toLocaleString()}</strong>
                  </span>
                ))}
              </div>
            )}

            {analysis.linkItems.length > 0 && (
              <div className={styles.jsonLinkList}>
                <div className={styles.jsonLinkListHeader}>
                  <span>Detected links</span>
                  <span>
                    {analysis.linkItems.length.toLocaleString()} unique
                  </span>
                </div>
                {analysis.linkItems.map((link) => (
                  <a
                    className={styles.jsonLinkItem}
                    href={link.href}
                    key={link.href}
                    rel='noopener noreferrer'
                    target='_blank'
                    title={link.url}
                  >
                    <span className={styles.jsonLinkText}>{link.url}</span>
                    {link.count > 1 && (
                      <strong>{link.count.toLocaleString()}</strong>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.actionsBar}>
          <div className={styles.leftActions}>
            <button
              className={styles.convertBtn}
              onClick={() => formatText(jsonInput, formatMode)}
              disabled={!jsonInput.trim()}
            >
              ⚡ Format
            </button>
            {jsonInput && (
              <button className={styles.clearBtn} onClick={handleClear}>
                ✕ Clear
              </button>
            )}
          </div>

          <div className={styles.outputActions}>
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${formatMode === 'pretty' ? styles.viewBtnActive : ''}`}
                onClick={() => handleModeChange('pretty')}
              >
                Pretty
              </button>
              <button
                className={`${styles.viewBtn} ${formatMode === 'minify' ? styles.viewBtnActive : ''}`}
                onClick={() => handleModeChange('minify')}
              >
                Minify
              </button>
            </div>
            <button
              className={styles.iconBtn}
              onClick={handleCopy}
              disabled={!jsonOutput}
            >
              ⧉ {copyLabel}
            </button>
            <button
              className={styles.iconBtn}
              onClick={handleDownload}
              disabled={!jsonOutput}
            >
              ↓ Download
            </button>
          </div>
        </div>
      </section>

      <FeaturesShowcase
        badges={['JSON', 'Private', 'Analyzer']}
        heroTitle='Format JSON Online - Clean, Inspect, and Analyze'
        heroDescription='DiffForge formats messy JSON, escaped JSON strings, and CloudWatch-style log lines directly in your browser. Beautify or minify data, inspect nested objects with a collapsible tree, keep line numbers visible, and surface useful structure such as links, domains, keys, arrays, depth, and primitive counts without uploading anything.'
        features={[
          {
            title: 'Clean JSON from Logs and Escaped Strings',
            description:
              'Paste raw JSON, JSON with comments, escaped JSON strings, or log lines that contain embedded payloads. DiffForge extracts the JSON candidate, decodes nested JSON strings when enabled, and returns readable formatted output.',
            visual: (
              <div className={styles.codeMockup}>
                <div className={styles.codeMockupHeader}>
                  <span>JSON input</span>
                </div>
                {[
                  ['log', 'INFO request completed { "payload": "{...}" }'],
                  ['parse', 'Extract JSON object from mixed text'],
                  ['decode', 'Decode nested JSON string values'],
                  ['format', 'Pretty print or minify output'],
                ].map(([label, text], index) => (
                  <div className={styles.codeLine} key={index}>
                    <span
                      style={{
                        color: '#79c0ff',
                        flex: '0 0 58px',
                        fontWeight: 700,
                      }}
                    >
                      {label}
                    </span>
                    <span>{text}</span>
                  </div>
                ))}
                <div className={styles.codeFooter}>
                  <span style={{ color: 'var(--accent)' }}>
                    Browser-only parser
                  </span>
                </div>
              </div>
            ),
          },
          {
            title: 'Collapsible JSON Tree Viewer',
            description:
              'Switch from raw formatted text to an expandable tree view for large payloads. Objects and arrays can be collapsed so API responses, event payloads, and nested configuration files are easier to scan.',
            visual: (
              <div className={styles.codeMockup}>
                <div className={styles.codeMockupHeader}>
                  <span>Tree view</span>
                </div>
                {[
                  ['1', '▾ { Object(4) }', ''],
                  ['2', '  "level": "info",', ''],
                  ['3', '  ▾ "payload": { Object(3) }', ''],
                  ['4', '    ▸ "user": { Object(2) },', ''],
                  ['5', '    ▸ "flags": [ Array(2) ],', ''],
                  ['6', '    "url": "https://api.example.com"', ''],
                ].map(([line, text], index) => (
                  <div className={styles.codeLine} key={index}>
                    <span className={styles.codeLinePrefix}>{line}</span>
                    <span>{text}</span>
                  </div>
                ))}
                <div className={styles.codeFooter}>
                  <span style={{ color: 'var(--accent)' }}>
                    Collapse nested data instantly
                  </span>
                </div>
              </div>
            ),
          },
          {
            title: 'JSON Analysis with Links and Domains',
            description:
              'After formatting, DiffForge summarizes the payload: total values, max depth, key count, objects, arrays, strings, numbers, booleans, nulls, and detected links. Full URLs stay visible and clickable for quick API endpoint inspection.',
            visual: (
              <div className={styles.codeMockup}>
                <div className={styles.codeMockupHeader}>
                  <span>Analysis</span>
                </div>
                {[
                  ['Links', '3 found · 2 unique'],
                  ['Domains', 'api.example.com · docs.example.com'],
                  ['Keys', '24 keys · 8 objects'],
                  ['Depth', 'max depth 5'],
                ].map(([label, text], index) => (
                  <div className={styles.codeLine} key={index}>
                    <span
                      style={{
                        color: index === 0 ? 'var(--accent)' : '#79c0ff',
                        fontWeight: 700,
                        width: 72,
                      }}
                    >
                      {label}
                    </span>
                    <span>{text}</span>
                  </div>
                ))}
                <div className={styles.codeFooter}>
                  <span style={{ color: '#a5d6ff' }}>
                    https://api.example.com/v1/health
                  </span>
                </div>
              </div>
            ),
          },
          {
            title: 'Line Numbers, Copy, and Download',
            description:
              'Use line-numbered input and output panels for debugging parse errors or sharing exact references. Copy formatted JSON to the clipboard or download a .formatted.json file for handoff.',
            visual: (
              <div className={styles.splitMockup}>
                <div className={styles.splitPanel}>
                  <div
                    className={`${styles.splitPanelLabel} ${styles.splitPanelLabelOld}`}
                  >
                    Input
                  </div>
                  {['1  {"ok":true,', '2   "count":128,', '3   "items":[...]}'].map(
                    (line) => (
                      <div className={styles.codeLine} key={line}>
                        <span>{line}</span>
                      </div>
                    ),
                  )}
                </div>
                <div className={styles.splitPanel}>
                  <div
                    className={`${styles.splitPanelLabel} ${styles.splitPanelLabelNew}`}
                  >
                    Output
                  </div>
                  {['1  {', '2    "ok": true,', '3    "count": 128'].map(
                    (line) => (
                      <div className={styles.codeLine} key={line}>
                        <span>{line}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
