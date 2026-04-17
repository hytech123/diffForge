'use client';
import {
  useState,
  useCallback,
  useRef,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import { html as diff2html, parse } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import styles from './shared.module.css';
import PageLayout from '@/components/PageLayout';
import DiffOutputContainer from '@/components/DiffOutputContainer';

type ViewMode = 'line-by-line' | 'side-by-side';

const SAMPLE_DIFF = `diff --git a/src/utils/parser.ts b/src/utils/parser.ts
index 3a4f1c2..8b2e7d4 100644
--- a/src/utils/parser.ts
+++ b/src/utils/parser.ts
@@ -1,8 +1,10 @@
-import { readFile } from 'fs';
+import { readFile } from 'fs/promises';
+import { resolve } from 'path';
 
 export async function parseConfig(filePath: string) {
-  const raw = await readFile(filePath, 'utf-8');
-  const data = JSON.parse(raw);
-  return data;
+  const absPath = resolve(filePath);
+  const raw = await readFile(absPath, 'utf-8');
+  const config = JSON.parse(raw);
+  config.timestamp = Date.now();
+  return config;
 }`;

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function Home() {
  const [diffInput, setDiffInput] = useState('');
  const [htmlOutput, setHtmlOutput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('line-by-line');
  const [isDragOver, setIsDragOver] = useState(false);

  const [fileCount, setFileCount] = useState(0);
  const [metrics, setMetrics] = useState({ added: 0, deleted: 0 });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const convertDiff = useCallback((input: string, mode: ViewMode) => {
    if (!input.trim()) {
      setHtmlOutput('');
      setFileCount(0);
      setMetrics({ added: 0, deleted: 0 });
      return;
    }
    try {
      const diffJson = parse(input);
      let add = 0,
        del = 0;
      diffJson.forEach(
        (file: { addedLines?: number; deletedLines?: number }) => {
          add += file.addedLines || 0;
          del += file.deletedLines || 0;
        },
      );
      setMetrics({ added: add, deleted: del });
      setFileCount(diffJson.length);

      const result = diff2html(input, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: mode,
        diffStyle: 'word',
        renderNothingWhenEmpty: false,
      });
      setHtmlOutput(result);
    } catch (err) {
      console.error(err);
      alert('Error parsing diff file.');
    }
  }, []);

  const processFileInChunks = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        alert('File size exceeds the 5MB limit. Please split your file.');
        return;
      }
      setIsUploading(true);
      setUploadProgress(0);

      const chunkSize = 1024 * 512;
      let offset = 0,
        fileContent = '';

      const readNextChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();

        reader.onload = (e) => {
          if (e.target?.result != null) {
            fileContent += e.target.result;
            offset += chunkSize;
            setUploadProgress(
              Math.min(100, Math.round((offset / file.size) * 100)),
            );

            if (offset < file.size) {
              setTimeout(readNextChunk, 15);
            } else {
              setIsUploading(false);
              setDiffInput(fileContent);
              convertDiff(fileContent, viewMode);
              setTimeout(() => setUploadProgress(0), 1000);
            }
          }
        };
        reader.readAsText(slice);
      };
      readNextChunk();
    },
    [convertDiff, viewMode],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFileInChunks(file);
    },
    [processFileInChunks],
  );

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFileInChunks(f);
  };

  const handleClear = () => {
    setDiffInput('');
    setHtmlOutput('');
    setFileCount(0);
    setUploadProgress(0);
    setMetrics({ added: 0, deleted: 0 });
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (htmlOutput) convertDiff(diffInput, mode);
  };

  return (
    <PageLayout
      onSampleClick={() => {
        setDiffInput(SAMPLE_DIFF);
        convertDiff(SAMPLE_DIFF, viewMode);
      }}
    >
      <section className={styles.inputSection}>
        <div
          className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type='file'
            accept='.diff,.patch,.txt'
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          <div className={styles.dropContent}>
            <div className={styles.dropIcon}>📄</div>
            <div className={styles.dropTitle}>
              Drop your .diff or .patch file here
            </div>
            <div className={styles.dropHint}>
              Max size: 5MB — Supports .diff, .patch, .txt
            </div>
          </div>
          {uploadProgress > 0 && (
            <div className={styles.progressWrapper}>
              <div
                className={styles.progressBar}
                style={{ width: `${uploadProgress}%` }}
              />
              <div className={styles.progressText}>
                {uploadProgress}% {isUploading ? 'Loading...' : 'Loaded'}
              </div>
            </div>
          )}
        </div>

        <div className={styles.divider}>or paste diff content below</div>

        <div className={styles.textareaWrapper}>
          <textarea
            className={styles.textarea}
            value={diffInput}
            onChange={(e) => setDiffInput(e.target.value)}
            placeholder={`Paste your diff content here...\n\ndiff --git a/file.ts b/file.ts\n...\n`}
            spellCheck={false}
            disabled={isUploading}
          />
        </div>

        <div className={styles.actionsBar}>
          <div className={styles.leftActions}>
            <button
              className={styles.convertBtn}
              onClick={() => convertDiff(diffInput, viewMode)}
              disabled={!diffInput.trim() || isUploading}
            >
              ⚡ Convert
            </button>
            {diffInput && (
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
    </PageLayout>
  );
}
