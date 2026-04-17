'use client';
import { useState, useRef, useCallback } from 'react';
import * as Diff from 'diff';
import { html as diff2html, parse } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import styles from '@/app/shared.module.css';
import PageLayout from '@/components/PageLayout';
import DiffOutputContainer from '@/components/DiffOutputContainer';
import FeaturesShowcase from '@/components/FeaturesShowcase';

type ViewMode = 'line-by-line' | 'side-by-side';

function DropZone({
  file,
  setFile,
  inputRef,
  title,
  icon,
}: {
  file: File | null;
  setFile: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  title: string;
  icon: string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) setFile(f);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onClick={() => inputRef.current?.click()}
      style={{ flex: 1 }}
    >
      <input
        ref={inputRef}
        type='file'
        accept='.docx,.txt,.md'
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFile(f);
        }}
        style={{ display: 'none' }}
      />
      <div className={styles.dropContent}>
        <div className={styles.dropIcon}>{icon}</div>
        <div
          className={styles.dropTitle}
          style={{ color: file ? 'var(--accent)' : '' }}
        >
          {file ? file.name : title}
        </div>
        <div className={styles.dropHint}>
          {file
            ? `${(file.size / 1024).toFixed(1)} KB · ${file.name.split('.').pop()?.toUpperCase()}`
            : '.docx · .md · .txt'}
        </div>
      </div>
    </div>
  );
}

async function extractText(file: File): Promise<string> {
  if (file.name.endsWith('.docx')) {
    const mammoth = (await import('mammoth/mammoth.browser')).default;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  return file.text();
}

function renderPatch(
  patchString: string,
  mode: ViewMode,
  setHtmlOutput: (h: string) => void,
  setFileCount: (n: number) => void,
  setMetrics: (m: { added: number; deleted: number }) => void,
) {
  const diffJson = parse(patchString);
  let add = 0,
    del = 0;
  diffJson.forEach((f: { addedLines?: number; deletedLines?: number }) => {
    add += f.addedLines || 0;
    del += f.deletedLines || 0;
  });
  setMetrics({ added: add, deleted: del });
  setFileCount(diffJson.length);

  const result = diff2html(patchString, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: mode,
    diffStyle: 'word',
    renderNothingWhenEmpty: false,
  });
  setHtmlOutput(result);
}

export default function ComparePage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [htmlOutput, setHtmlOutput] = useState('');
  // Default to side-by-side — makes more sense for document comparison
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [isConverting, setIsConverting] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [metrics, setMetrics] = useState({ added: 0, deleted: 0 });

  // Cache the patch so we can re-render without re-reading files
  const patchRef = useRef('');

  const fileInputRefA = useRef<HTMLInputElement>(null);
  const fileInputRefB = useRef<HTMLInputElement>(null);

  const handleCompare = async () => {
    if (!fileA || !fileB) return;
    setIsConverting(true);
    try {
      const [textA, textB] = await Promise.all([
        extractText(fileA),
        extractText(fileB),
      ]);
      const patchString = Diff.createPatch(fileA.name, textA, textB);
      patchRef.current = patchString;
      renderPatch(
        patchString,
        viewMode,
        setHtmlOutput,
        setFileCount,
        setMetrics,
      );
    } catch (err) {
      console.error(err);
      alert(
        'Error comparing files. Ensure they are valid .docx or text files.',
      );
    } finally {
      setIsConverting(false);
    }
  };

  // Re-render with new mode instantly (no file I/O needed)
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (patchRef.current) {
      renderPatch(
        patchRef.current,
        mode,
        setHtmlOutput,
        setFileCount,
        setMetrics,
      );
    }
  }, []);

  const handleClear = () => {
    setFileA(null);
    setFileB(null);
    setHtmlOutput('');
    setFileCount(0);
    setMetrics({ added: 0, deleted: 0 });
    patchRef.current = '';
  };

  return (
    <PageLayout>
      <section className={styles.inputSection}>
        <div style={{ display: 'flex', gap: 16 }}>
          <DropZone
            file={fileA}
            setFile={setFileA}
            inputRef={fileInputRefA}
            title='Original Document'
            icon='📄'
          />
          <DropZone
            file={fileB}
            setFile={setFileB}
            inputRef={fileInputRefB}
            title='Modified Document'
            icon='📝'
          />
        </div>

        <div className={styles.actionsBar} style={{ marginTop: 24 }}>
          <div className={styles.leftActions}>
            <button
              className={styles.convertBtn}
              onClick={handleCompare}
              disabled={!fileA || !fileB || isConverting}
            >
              {isConverting ? '⏳ Comparing...' : '⚡ Compare'}
            </button>
            {(fileA || fileB) && (
              <button className={styles.clearBtn} onClick={handleClear}>
                ✕ Clear
              </button>
            )}
          </div>

          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'line-by-line' ? styles.viewBtnActive : ''}`}
              onClick={() => handleViewModeChange('line-by-line')}
            >
              Line by Line
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'side-by-side' ? styles.viewBtnActive : ''}`}
              onClick={() => handleViewModeChange('side-by-side')}
            >
              Side by Side
            </button>
          </div>
        </div>
      </section>

      <DiffOutputContainer
        htmlOutput={htmlOutput}
        fileCount={fileCount}
        metrics={metrics}
      />

      <FeaturesShowcase
        badges={['.docx', '.md', '.txt']}
        heroTitle='Compare Documents Online — Free & Private'
        heroDescription='Upload any two Word, Markdown, or text files and instantly see what changed between them. DiffForge extracts clean text content and renders a precise, character-level diff. No server, no storage, no account required. Works completely offline in your browser.'
        features={[
          {
            title: 'Extract & Compare Word Docs',
            description:
              'DiffForge reads raw text from .docx files using mammoth.js — entirely in your browser. Then diffs the contents using the same algorithm as Git, giving you a precise patch between any two documents.',
            visual: (
              <div className={styles.codeMockup}>
                <div className={styles.codeMockupHeader}>
                  <span>📄</span>
                  <span>contract_v1.docx → contract_v2.docx</span>
                </div>
                {[
                  ['–', 'Payment due within 14 days.', 'del'],
                  ['+', 'Payment due within 30 days.', 'add'],
                  [' ', 'All disputes subject to arbitration.', ''],
                  ['–', 'Governing law: California.', 'del'],
                  ['+', 'Governing law: New York.', 'add'],
                ].map(([prefix, code, type], i) => (
                  <div
                    key={i}
                    className={`${styles.codeLine} ${type === 'add' ? styles.codeLineAdd : type === 'del' ? styles.codeLineDel : ''}`}
                  >
                    <span className={styles.codeLinePrefix}>{prefix}</span>
                    <span>{code}</span>
                  </div>
                ))}
                <div className={styles.codeFooter}>
                  <span className={styles.codeFooterAdd}>+2 changes</span>
                  <span className={styles.codeFooterDel}>-2 removed</span>
                </div>
              </div>
            ),
          },
          {
            title: 'Side-by-Side Document Comparison',
            description:
              'Switch between side-by-side split view and unified line-by-line view. Side-by-side is ideal for long documents like contracts or reports where you need to see context on both sides simultaneously.',
            visual: (
              <div className={styles.splitMockup}>
                <div className={styles.splitPanel}>
                  <div
                    className={`${styles.splitPanelLabel} ${styles.splitPanelLabelOld}`}
                  >
                    Original
                  </div>
                  {[
                    'The project deadline is Friday.',
                    'Budget allocated: $50,000.',
                    'Team size: 4 engineers.',
                  ].map((l, i) => (
                    <div
                      key={i}
                      className={`${styles.codeLine} ${i === 1 ? styles.codeLineDel : ''}`}
                    >
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.splitPanel}>
                  <div
                    className={`${styles.splitPanelLabel} ${styles.splitPanelLabelNew}`}
                  >
                    Modified
                  </div>
                  {[
                    'The project deadline is Friday.',
                    'Budget allocated: $75,000.',
                    'Team size: 4 engineers.',
                  ].map((l, i) => (
                    <div
                      key={i}
                      className={`${styles.codeLine} ${i === 1 ? styles.codeLineAdd : ''}`}
                    >
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
          },
          {
            title: 'Export with Metrics & Collapse',
            description:
              'Download a standalone HTML report with a summary banner (files changed, lines added/removed), collapsible file sections, and all diff styles embedded. Perfect for sending to clients or attaching to audit reports.',
            visual: (
              <div className={styles.codeMockup}>
                <div className={styles.codeMockupHeader}>
                  <span>📊</span>
                  <span>Report Summary</span>
                </div>
                <div className={styles.codeLine}>
                  <span style={{ color: '#79c0ff', fontWeight: 600 }}>
                    1 document compared
                  </span>
                </div>
                <div className={`${styles.codeLine} ${styles.codeLineAdd}`}>
                  <span className={styles.codeLinePrefix}>+</span>
                  <span>2 paragraphs added</span>
                </div>
                <div className={`${styles.codeLine} ${styles.codeLineDel}`}>
                  <span className={styles.codeLinePrefix}>-</span>
                  <span>1 paragraph removed</span>
                </div>
                <div className={styles.codeLine}>
                  <span style={{ opacity: 0.5 }}>
                    ▾ contract_v2.docx &nbsp; [click to collapse]
                  </span>
                </div>
                <div className={styles.codeFooter}>
                  <span style={{ color: 'var(--accent)' }}>
                    Self-contained HTML — no dependencies
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
