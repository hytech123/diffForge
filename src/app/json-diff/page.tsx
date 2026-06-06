'use client';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type UIEvent,
} from 'react';
import * as Diff from 'diff';
import { html as diff2html, parse } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import PageLayout from '@/components/PageLayout';
import DiffOutputContainer from '@/components/DiffOutputContainer';
import FeaturesShowcase from '@/components/FeaturesShowcase';
import JsonDiffTree from '@/components/JsonDiffTree';
import JsonTree from '@/components/JsonTree';
import styles from '@/app/shared.module.css';
import {
  countDiffMetrics,
  diffJson,
  type JsonDiffNode,
} from '@/lib/jsonDiff';

type OutputMode = 'semantic' | 'text';
type ViewMode = 'line-by-line' | 'side-by-side';
type InputView = 'text' | 'tree';

const SAMPLE_ORIGINAL = `{
  "name": "DiffForge",
  "version": "1.0",
  "features": ["patch", "compare"],
  "config": {
    "theme": "dark",
    "enabled": true
  }
}`;

const SAMPLE_MODIFIED = `{
  "name": "DiffForge",
  "version": "2.0",
  "features": ["patch", "compare", "json-diff"],
  "config": {
    "theme": "dark",
    "enabled": false
  },
  "author": "team"
}`;

type CompareCache = {
  diffRoot: JsonDiffNode;
  patch: string;
  parsedA: unknown;
  parsedB: unknown;
};

function countEditorLines(input: string): number {
  if (!input) return 1;
  return input.split('\n').length;
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parseJsonInput(text: string, side: 'Original' | 'Modified'): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${side} JSON is empty.`);
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown parse error';
    throw new Error(`${side} JSON is invalid: ${message}`);
  }
}

function renderPatch(
  patchString: string,
  mode: ViewMode,
  setHtmlOutput: (html: string) => void,
  setFileCount: (count: number) => void,
  setMetrics: (metrics: { added: number; deleted: number }) => void,
) {
  const diffJsonResult = parse(patchString);
  let added = 0;
  let deleted = 0;

  diffJsonResult.forEach((file: { addedLines?: number; deletedLines?: number }) => {
    added += file.addedLines || 0;
    deleted += file.deletedLines || 0;
  });

  setMetrics({ added, deleted });
  setFileCount(diffJsonResult.length);
  setHtmlOutput(
    diff2html(patchString, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: mode,
      diffStyle: 'word',
      renderNothingWhenEmpty: false,
    }),
  );
}

function JsonTextareaWithLineNumbers({
  className = '',
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
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
        spellCheck={false}
        wrap='off'
      />
    </div>
  );
}

function JsonInputPanel({
  fileName,
  inputRef,
  inputView,
  onChange,
  onFileSelect,
  onInputViewChange,
  placeholder,
  title,
  value,
}: {
  fileName: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputView: InputView;
  onChange: (value: string) => void;
  onFileSelect: (file: File) => void;
  onInputViewChange: (view: InputView) => void;
  placeholder: string;
  title: string;
  value: string;
}) {
  const parsedValue = useMemo(() => tryParseJson(value), [value]);
  const treeRevision = useMemo(
    () => `${value.length}-${inputView}`,
    [value.length, inputView],
  );

  return (
    <div className={styles.jsonPanel}>
      <div className={styles.jsonPanelHeader}>
        <span className={styles.jsonPanelTitle}>{title}</span>
        <div className={styles.jsonPanelHeaderActions}>
          <span className={styles.jsonPanelMeta}>
            {value ? `${value.length.toLocaleString()} chars` : ''}
            {fileName ? ` · ${fileName}` : ''}
          </span>
          <div
            aria-label={`${title} view`}
            className={`${styles.viewToggle} ${styles.jsonPanelViewToggle}`}
          >
            <button
              className={`${styles.viewBtn} ${styles.jsonPanelViewBtn} ${inputView === 'text' ? styles.viewBtnActive : ''}`}
              onClick={() => onInputViewChange('text')}
              type='button'
            >
              Text
            </button>
            <button
              className={`${styles.viewBtn} ${styles.jsonPanelViewBtn} ${inputView === 'tree' ? styles.viewBtnActive : ''}`}
              disabled={parsedValue === undefined && value.trim().length > 0}
              onClick={() => onInputViewChange('tree')}
              type='button'
            >
              Tree
            </button>
          </div>
          <button
            className={styles.jsonDropZone}
            onClick={() => inputRef.current?.click()}
            type='button'
          >
            <span className={styles.jsonDropIcon}>↥</span>
            <span className={styles.jsonDropText}>Upload .json</span>
          </button>
          <input
            ref={inputRef}
            type='file'
            accept='.json,application/json'
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelect(file);
            }}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      {inputView === 'text' ? (
        <JsonTextareaWithLineNumbers
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <div className={styles.jsonTreeViewport}>
          {parsedValue !== undefined ? (
            <JsonTree key={treeRevision} value={parsedValue} />
          ) : (
            <div className={styles.jsonTreeEmpty}>
              {value.trim()
                ? 'Invalid JSON — switch to Text to fix syntax'
                : placeholder}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JsonDiffPage() {
  const [jsonInputA, setJsonInputA] = useState('');
  const [jsonInputB, setJsonInputB] = useState('');
  const [fileNameA, setFileNameA] = useState('');
  const [fileNameB, setFileNameB] = useState('');
  const [inputViewA, setInputViewA] = useState<InputView>('text');
  const [inputViewB, setInputViewB] = useState<InputView>('text');
  const [outputMode, setOutputMode] = useState<OutputMode>('semantic');
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [diffRoot, setDiffRoot] = useState<JsonDiffNode | null>(null);
  const [semanticMetrics, setSemanticMetrics] = useState({
    added: 0,
    modified: 0,
    removed: 0,
  });
  const [htmlOutput, setHtmlOutput] = useState('');
  const [fileCount, setFileCount] = useState(0);
  const [textMetrics, setTextMetrics] = useState({ added: 0, deleted: 0 });
  const [error, setError] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [hasCompared, setHasCompared] = useState(false);

  const compareCacheRef = useRef<CompareCache | null>(null);
  const fileInputRefA = useRef<HTMLInputElement>(null);
  const fileInputRefB = useRef<HTMLInputElement>(null);

  const applyCompareResult = useCallback(
    (cache: CompareCache, mode: OutputMode, textViewMode: ViewMode) => {
      setDiffRoot(cache.diffRoot);
      setSemanticMetrics(countDiffMetrics(cache.diffRoot));

      if (mode === 'text') {
        renderPatch(
          cache.patch,
          textViewMode,
          setHtmlOutput,
          setFileCount,
          setTextMetrics,
        );
      } else {
        setHtmlOutput('');
        setFileCount(0);
        setTextMetrics({ added: 0, deleted: 0 });
      }
    },
    [],
  );

  const handleCompare = async () => {
    setIsComparing(true);
    setError('');

    try {
      const parsedA = parseJsonInput(jsonInputA, 'Original');
      const parsedB = parseJsonInput(jsonInputB, 'Modified');
      const textA = `${JSON.stringify(parsedA, null, 2)}\n`;
      const textB = `${JSON.stringify(parsedB, null, 2)}\n`;
      const patch = Diff.createPatch('comparison.json', textA, textB);
      const cache: CompareCache = {
        parsedA,
        parsedB,
        patch,
        diffRoot: diffJson(parsedA, parsedB),
      };

      compareCacheRef.current = cache;
      setHasCompared(true);
      applyCompareResult(cache, outputMode, viewMode);
    } catch (err) {
      compareCacheRef.current = null;
      setHasCompared(false);
      setDiffRoot(null);
      setHtmlOutput('');
      setError(err instanceof Error ? err.message : 'Failed to compare JSON.');
    } finally {
      setIsComparing(false);
    }
  };

  const handleOutputModeChange = useCallback(
    (mode: OutputMode) => {
      setOutputMode(mode);
      if (!compareCacheRef.current) return;
      applyCompareResult(compareCacheRef.current, mode, viewMode);
    },
    [applyCompareResult, viewMode],
  );

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      if (!compareCacheRef.current || outputMode !== 'text') return;
      renderPatch(
        compareCacheRef.current.patch,
        mode,
        setHtmlOutput,
        setFileCount,
        setTextMetrics,
      );
    },
    [outputMode],
  );

  const handleClear = () => {
    setJsonInputA('');
    setJsonInputB('');
    setFileNameA('');
    setFileNameB('');
    setInputViewA('text');
    setInputViewB('text');
    setDiffRoot(null);
    setHtmlOutput('');
    setError('');
    setHasCompared(false);
    setSemanticMetrics({ added: 0, modified: 0, removed: 0 });
    setTextMetrics({ added: 0, deleted: 0 });
    setFileCount(0);
    compareCacheRef.current = null;
  };

  const handleSample = () => {
    setJsonInputA(SAMPLE_ORIGINAL);
    setJsonInputB(SAMPLE_MODIFIED);
    setFileNameA('');
    setFileNameB('');
    setInputViewA('tree');
    setInputViewB('tree');
    setError('');
  };

  const handleFileA = async (file: File) => {
    setFileNameA(file.name);
    setJsonInputA(await file.text());
    setInputViewA('tree');
  };

  const handleFileB = async (file: File) => {
    setFileNameB(file.name);
    setJsonInputB(await file.text());
    setInputViewB('tree');
  };

  return (
    <PageLayout mainClassName={styles.jsonMain} onSampleClick={handleSample}>
      <section className={styles.inputSection}>
        <div className={styles.jsonWorkspace}>
          <JsonInputPanel
            fileName={fileNameA}
            inputRef={fileInputRefA}
            inputView={inputViewA}
            onChange={setJsonInputA}
            onFileSelect={handleFileA}
            onInputViewChange={setInputViewA}
            placeholder='Paste original JSON'
            title='Original'
            value={jsonInputA}
          />
          <JsonInputPanel
            fileName={fileNameB}
            inputRef={fileInputRefB}
            inputView={inputViewB}
            onChange={setJsonInputB}
            onFileSelect={handleFileB}
            onInputViewChange={setInputViewB}
            placeholder='Paste modified JSON'
            title='Modified'
            value={jsonInputB}
          />
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.actionsBar}>
          <div className={styles.leftActions}>
            <button
              className={styles.convertBtn}
              disabled={!jsonInputA.trim() || !jsonInputB.trim() || isComparing}
              onClick={handleCompare}
            >
              {isComparing ? '⏳ Comparing...' : '⚡ Compare'}
            </button>
            {(jsonInputA || jsonInputB) && (
              <button className={styles.clearBtn} onClick={handleClear}>
                ✕ Clear
              </button>
            )}
          </div>

          <div className={styles.outputActions}>
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${outputMode === 'semantic' ? styles.viewBtnActive : ''}`}
                onClick={() => handleOutputModeChange('semantic')}
                type='button'
              >
                Semantic
              </button>
              <button
                className={`${styles.viewBtn} ${outputMode === 'text' ? styles.viewBtnActive : ''}`}
                onClick={() => handleOutputModeChange('text')}
                type='button'
              >
                Text
              </button>
            </div>

            {outputMode === 'text' && (
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'line-by-line' ? styles.viewBtnActive : ''}`}
                  onClick={() => handleViewModeChange('line-by-line')}
                  type='button'
                >
                  Line by Line
                </button>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'side-by-side' ? styles.viewBtnActive : ''}`}
                  onClick={() => handleViewModeChange('side-by-side')}
                  type='button'
                >
                  Side by Side
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {hasCompared && outputMode === 'semantic' && diffRoot && (
        <section className={styles.outputSection}>
          <div className={styles.jsonPanel}>
            <div className={styles.jsonDiffMetricsBar}>
              <span className={styles.jsonDiffMetricAdded}>
                +{semanticMetrics.added.toLocaleString()} added
              </span>
              <span className={styles.jsonDiffMetricRemoved}>
                -{semanticMetrics.removed.toLocaleString()} removed
              </span>
              <span className={styles.jsonDiffMetricModified}>
                ~{semanticMetrics.modified.toLocaleString()} modified
              </span>
            </div>
            <div className={styles.jsonTreeViewport}>
              <JsonDiffTree root={diffRoot} />
            </div>
          </div>
        </section>
      )}

      {hasCompared && outputMode === 'text' && (
        <DiffOutputContainer
          fileCount={fileCount}
          htmlOutput={htmlOutput}
          metrics={textMetrics}
        />
      )}

      <FeaturesShowcase
        badges={['JSON', 'Semantic', 'Text diff']}
        heroDescription='Compare two JSON documents with semantic path highlighting or classic line-by-line text diff. DiffForge parses and normalizes JSON locally, then shows exactly what changed — keys added, values modified, and fields removed. No upload, no account, fully offline.'
        heroTitle='JSON Diff Online — Semantic & Text Comparison'
        features={[
          {
            title: 'Semantic Path Diff',
            description:
              'See changes at the key and value level instead of scanning raw lines. Added fields glow green, removed fields red, and modified values show old → new inline. Nested objects and arrays stay collapsible so large payloads stay readable.',
            visual: (
              <div className={styles.codeMockup}>
                <div className={styles.codeMockupHeader}>
                  <span>🌳</span>
                  <span>Semantic diff tree</span>
                </div>
                <div className={`${styles.codeLine} ${styles.codeLineAdd}`}>
                  <span className={styles.codeLinePrefix}>+</span>
                  <span>&quot;author&quot;: &quot;team&quot;</span>
                </div>
                <div className={`${styles.codeLine} ${styles.codeLineDel}`}>
                  <span className={styles.codeLinePrefix}>-</span>
                  <span>&quot;enabled&quot;: true</span>
                </div>
                <div className={`${styles.codeLine} ${styles.codeLineAdd}`}>
                  <span className={styles.codeLinePrefix}>+</span>
                  <span>&quot;enabled&quot;: false</span>
                </div>
                <div className={styles.codeFooter}>
                  <span className={styles.codeFooterAdd}>+2 added</span>
                  <span style={{ color: '#e3b341' }}>~1 modified</span>
                </div>
              </div>
            ),
          },
          {
            title: 'Text Diff for Large JSON',
            description:
              'Switch to Text mode for side-by-side or unified line diff powered by diff2html. Ideal when you need Git-style patches, word-level highlights, or HTML export for audit trails. Array reordering is shown as line changes rather than moves.',
            visual: (
              <div className={styles.splitMockup}>
                <div className={styles.splitPanel}>
                  <div
                    className={`${styles.splitPanelLabel} ${styles.splitPanelLabelOld}`}
                  >
                    Original
                  </div>
                  <div className={`${styles.codeLine} ${styles.codeLineDel}`}>
                    <span>&quot;version&quot;: &quot;1.0&quot;,</span>
                  </div>
                  <div className={styles.codeLine}>
                    <span>&quot;name&quot;: &quot;DiffForge&quot;,</span>
                  </div>
                </div>
                <div className={styles.splitPanel}>
                  <div
                    className={`${styles.splitPanelLabel} ${styles.splitPanelLabelNew}`}
                  >
                    Modified
                  </div>
                  <div className={`${styles.codeLine} ${styles.codeLineAdd}`}>
                    <span>&quot;version&quot;: &quot;2.0&quot;,</span>
                  </div>
                  <div className={styles.codeLine}>
                    <span>&quot;name&quot;: &quot;DiffForge&quot;,</span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            title: '100% Client-Side',
            description:
              'Your JSON never leaves the browser. Parsing, semantic comparison, and text diff rendering all run locally — safe for API responses, config files, and production payloads you cannot send to a server.',
            visual: (
              <div className={styles.codeMockup}>
                <div className={styles.codeMockupHeader}>
                  <span>🔒</span>
                  <span>Local processing</span>
                </div>
                <div className={styles.codeLine}>
                  <span style={{ color: '#79c0ff' }}>parse()</span>
                  <span> → browser only</span>
                </div>
                <div className={styles.codeLine}>
                  <span style={{ color: '#79c0ff' }}>diffJson()</span>
                  <span> → browser only</span>
                </div>
                <div className={styles.codeLine}>
                  <span style={{ color: '#79c0ff' }}>diff2html()</span>
                  <span> → browser only</span>
                </div>
                <div className={styles.codeFooter}>
                  <span style={{ color: 'var(--accent)' }}>
                    Zero network requests
                  </span>
                </div>
              </div>
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
