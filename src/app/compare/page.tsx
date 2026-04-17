'use client';
import { useState, useRef } from 'react';
import * as Diff from 'diff';
import { html as diff2html, parse } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import styles from '@/app/shared.module.css';
import PageLayout from '@/components/PageLayout';
import DiffOutputContainer from '@/components/DiffOutputContainer';

type ViewMode = 'line-by-line' | 'side-by-side';

// Separate stable component — fixes Rules of Hooks violation from inline definition
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

// Extract text from a file — uses mammoth's browser bundle for .docx
async function extractText(file: File): Promise<string> {
  if (file.name.endsWith('.docx')) {
    // Dynamically import the browser-compatible bundle of mammoth
    const mammoth = (await import('mammoth/mammoth.browser')).default;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  return file.text();
}

export default function ComparePage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [htmlOutput, setHtmlOutput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('line-by-line');
  const [isConverting, setIsConverting] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [metrics, setMetrics] = useState({ added: 0, deleted: 0 });

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

      const fileName = fileA.name;
      const patchString = Diff.createPatch(fileName, textA, textB);

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
        outputFormat: viewMode,
        diffStyle: 'word',
        renderNothingWhenEmpty: false,
      });
      setHtmlOutput(result);
    } catch (err) {
      console.error(err);
      alert(
        'Error comparing files. Ensure they are valid .docx or text files.',
      );
    } finally {
      setIsConverting(false);
    }
  };

  const handleClear = () => {
    setFileA(null);
    setFileB(null);
    setHtmlOutput('');
    setFileCount(0);
    setMetrics({ added: 0, deleted: 0 });
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
              onClick={() => setViewMode('line-by-line')}
            >
              Line by Line
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'side-by-side' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('side-by-side')}
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
    </PageLayout>
  );
}
