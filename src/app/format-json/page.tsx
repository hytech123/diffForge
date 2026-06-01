'use client';
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import PageLayout from '@/components/PageLayout';
import styles from '@/app/shared.module.css';

type FormatMode = 'pretty' | 'minify';

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

const MAX_FILE_SIZE = 5 * 1024 * 1024;

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

export default function FormatJsonPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [jsonOutput, setJsonOutput] = useState('');
  const [formatMode, setFormatMode] = useState<FormatMode>('pretty');
  const [decodeNested, setDecodeNested] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<FormatterStats | null>(null);
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
    <PageLayout onSampleClick={handleSample}>
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
            <textarea
              className={`${styles.textarea} ${styles.jsonTextarea}`}
              value={jsonInput}
              onChange={(event) => setJsonInput(event.target.value)}
              placeholder='Paste JSON or CloudWatch log content'
              spellCheck={false}
            />
          </div>

          <div className={styles.jsonPanel}>
            <div className={styles.jsonPanelHeader}>
              <span className={styles.jsonPanelTitle}>Output</span>
              <span className={styles.jsonPanelMeta}>
                {stats
                  ? `${stats.rootType} · ${stats.lines.toLocaleString()} lines`
                  : ''}
              </span>
            </div>
            <textarea
              className={`${styles.textarea} ${styles.jsonTextarea} ${styles.jsonOutputTextarea}`}
              value={jsonOutput}
              readOnly
              placeholder='Formatted JSON'
              spellCheck={false}
            />
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
    </PageLayout>
  );
}
