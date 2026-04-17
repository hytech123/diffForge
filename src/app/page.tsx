'use client';

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import { html as diff2html, parse } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import styles from './page.module.css';

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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function Home() {
  const [diffInput, setDiffInput] = useState('');
  const [htmlOutput, setHtmlOutput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('line-by-line');
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Upload Progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Extraction Metrics
  const [metrics, setMetrics] = useState({ added: 0, deleted: 0 });

  // PDF Export Settings
  const [pdfSettings, setPdfSettings] = useState({
    showModal: false,
    companyName: 'DiffForge Report',
    logoData: '',
    isGenerating: false,
  });

  useEffect(() => {
    const savedName = localStorage.getItem('diffforge-company');
    const savedLogo = localStorage.getItem('diffforge-logo');
    if (savedName || savedLogo) {
      setPdfSettings((prev) => ({
        ...prev,
        companyName: savedName || prev.companyName,
        logoData: savedLogo || prev.logoData,
      }));
    }
  }, []);

  const handleCompanyNameChange = (val: string) => {
    setPdfSettings((p) => ({ ...p, companyName: val }));
    localStorage.setItem('diffforge-company', val);
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result as string;
        setPdfSettings((p) => ({ ...p, logoData: data }));
        localStorage.setItem('diffforge-logo', data);
      };
      reader.readAsDataURL(file);
    }
  };

  const convertDiff = useCallback((input: string, mode: ViewMode) => {
    if (!input.trim()) {
      setHtmlOutput('');
      setFileCount(0);
      setMetrics({ added: 0, deleted: 0 });
      return;
    }

    try {
      // Metric parsing
      const diffJson = parse(input);
      let add = 0,
        del = 0;
      diffJson.forEach((file: any) => {
        add += file.addedLines || 0;
        del += file.deletedLines || 0;
      });
      setMetrics({ added: add, deleted: del });
      setFileCount(diffJson.length);

      // Render
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

  const handleConvert = () => {
    convertDiff(diffInput, viewMode);
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
    if (htmlOutput) {
      convertDiff(diffInput, mode);
    }
  };

  const processFileInChunks = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        alert('File size exceeds the 5MB limit. Please split your file.');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      const chunkSize = 1024 * 512; // 512KB chunks for stream feel
      let offset = 0;
      let fileContent = '';

      const readNextChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();

        reader.onload = (e) => {
          if (e.target?.result != null) {
            fileContent += e.target.result;
            offset += chunkSize;
            const progress = Math.min(
              100,
              Math.round((offset / file.size) * 100),
            );
            setUploadProgress(progress);

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
    const file = e.target.files?.[0];
    if (file) processFileInChunks(file);
  };

  const handleLoadSample = () => {
    setDiffInput(SAMPLE_DIFF);
    convertDiff(SAMPLE_DIFF, viewMode);
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(htmlOutput);
  };

  const handleDownloadHtml = () => {
    const embeddedCss = `
      html { color-scheme: dark; }
      body { font-family: system-ui, -apple-system, sans-serif !important; background: #0d1117 !important; color: #e6edf3 !important; padding: 16px !important; margin: 0 !important; }
      .d2h-wrapper { font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace !important; font-size: 13px !important; }
      .d2h-file-header { background: #161b22 !important; border-bottom: 1px solid rgba(240,246,252,0.06) !important; font-family: system-ui, sans-serif !important; }
      .d2h-file-name-wrapper { font-family: system-ui, sans-serif !important; }
      .d2h-file-name { color: #e6edf3 !important; }
      .d2h-tag { background: rgba(45,212,168,0.15) !important; color: #2dd4a8 !important; border: none !important; border-radius: 6px !important; }
      .d2h-diff-table { font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace !important; }
      .d2h-code-line-ctn { color: #e6edf3 !important; }
      .d2h-ins { background: rgba(35,134,54,0.18) !important; border-color: transparent !important; }
      .d2h-ins .d2h-code-line-ctn { color: #56d364 !important; }
      .d2h-ins .d2h-code-line-ctn ins, .d2h-ins .d2h-code-line-ctn .d2h-change { background: rgba(35,134,54,0.4) !important; text-decoration: none !important; }
      .d2h-del { background: rgba(218,54,51,0.18) !important; border-color: transparent !important; }
      .d2h-del .d2h-code-line-ctn { color: #f85149 !important; }
      .d2h-del .d2h-code-line-ctn del, .d2h-del .d2h-code-line-ctn .d2h-change { background: rgba(218,54,51,0.4) !important; text-decoration: none !important; }
      .d2h-info { background: rgba(56,139,253,0.1) !important; border-color: transparent !important; color: #79c0ff !important; }
      .d2h-code-line-prefix { color: #6e7681 !important; user-select: none; }
      .d2h-code-linenumber { color: #6e7681 !important; background: #161b22 !important; border-right: 1px solid rgba(240,246,252,0.06) !important; user-select: none; }
      .d2h-file-wrapper { border: 1px solid rgba(240,246,252,0.06) !important; border-radius: 10px !important; margin-bottom: 16px !important; overflow: hidden !important; background: #1c2128 !important; }
      .d2h-file-list { display: none !important; }
      .d2h-file-collapse { display: none !important; }
      .d2h-diff-tbody tr { border-color: transparent !important; }
      .d2h-emptyplaceholder, .d2h-code-side-emptyplaceholder { background: #1c2128 !important; border-color: transparent !important; }
      .d2h-code-side-linenumber { color: #6e7681 !important; background: #161b22 !important; border-right: 1px solid rgba(240,246,252,0.06) !important; }
      ins { text-decoration: none !important; }
      del { text-decoration: none !important; }
    `;

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DiffForge Output</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/css/diff2html.min.css" />
  <style>${embeddedCss}</style>
</head>
<body>${htmlOutput}</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diff-output.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGeneratePdf = async () => {
    setPdfSettings((p) => ({ ...p, isGenerating: true }));
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('pdf-export-template');
      if (!element) throw new Error('Template missing');

      element.classList.add(styles.pdfPrintMode);

      const opt = {
        margin: 10,
        filename: 'DiffForge-Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 1.5, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };

      await html2pdf().set(opt).from(element).save();

      element.classList.remove(styles.pdfPrintMode);
      setPdfSettings((p) => ({ ...p, showModal: false, isGenerating: false }));
    } catch (error) {
      console.error(error);
      alert('Error generating PDF.');
      setPdfSettings((p) => ({ ...p, isGenerating: false }));
      document
        .getElementById('pdf-export-template')
        ?.classList.remove(styles.pdfPrintMode);
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoArea}>
          <div className={styles.logoIcon}>⚒</div>
          <div className={styles.logoText}>
            Diff<span>Forge</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={handleLoadSample}>
            ✦ Sample
          </button>
        </div>
      </header>

      {/* Main */}
      <main className={styles.main}>
        {/* Input */}
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

            {/* Progress Bar overlay */}
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
                onClick={handleConvert}
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

        {/* Output */}
        {htmlOutput ? (
          <section className={styles.outputSection}>
            <div className={styles.outputHeader}>
              <div className={styles.outputTitle}>
                Output
                <span className={styles.fileCount}>
                  {fileCount} file{fileCount !== 1 ? 's' : ''}
                </span>
                <span
                  className={styles.fileCount}
                  style={{
                    color: '#56d364',
                    background: 'rgba(35,134,54,0.18)',
                  }}
                >
                  +{metrics.added}
                </span>
                <span
                  className={styles.fileCount}
                  style={{
                    color: '#f85149',
                    background: 'rgba(218,54,51,0.18)',
                  }}
                >
                  -{metrics.deleted}
                </span>
              </div>
              <div className={styles.outputActions}>
                <button className={styles.iconBtn} onClick={handleCopyHtml}>
                  Copy HTML
                </button>
                <button className={styles.iconBtn} onClick={handleDownloadHtml}>
                  Download HTML
                </button>
                {/* <button
                  className={styles.iconBtn}
                  style={{
                    borderColor: 'rgba(45, 212, 168, 0.4)',
                    color: 'var(--accent)',
                  }}
                  onClick={() =>
                    setPdfSettings((p) => ({ ...p, showModal: true }))
                  }
                >
                  📄 Export PDF (Pro)
                </button> */}
              </div>
            </div>
            <div
              className={styles.diffOutput}
              dangerouslySetInnerHTML={{ __html: htmlOutput }}
            />
          </section>
        ) : (
          <section className={styles.emptyState}>
            <div className={styles.emptyIcon}>⎇</div>
            <div className={styles.emptyTitle}>No diff loaded</div>
            <div className={styles.emptyHint}>
              Upload a .diff file, paste your diff content above, or click
              &ldquo;Sample&rdquo; in the header to try it out.
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        Powered by DiffForge — Client-side only, your data never leaves the
        browser.
      </footer>

      {/* PDF Export Modal */}
      {pdfSettings.showModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Export Professional PDF</div>
              <button
                className={styles.closeBtn}
                onClick={() =>
                  setPdfSettings((p) => ({ ...p, showModal: false }))
                }
              >
                ✕
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Company / Report Name</label>
              <input
                type='text'
                className={styles.textInput}
                value={pdfSettings.companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                placeholder='e.g. Acme Corp Code Audit'
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Brand Logo (Optional)</label>
              <div className={styles.fileInputWrapper}>
                <div className={styles.logoPreview}>
                  {pdfSettings.logoData ? (
                    <img src={pdfSettings.logoData} alt='Logo' />
                  ) : (
                    '⚒'
                  )}
                </div>
                <input
                  type='file'
                  accept='image/png, image/jpeg, image/svg+xml'
                  style={{ display: 'none' }}
                  ref={logoInputRef}
                  onChange={handleLogoUpload}
                />
                <button
                  className={styles.uploadLogoBtn}
                  onClick={() => logoInputRef.current?.click()}
                >
                  Upload Logo
                </button>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.clearBtn}
                onClick={() =>
                  setPdfSettings((p) => ({ ...p, showModal: false }))
                }
                disabled={pdfSettings.isGenerating}
              >
                Cancel
              </button>
              <button
                className={styles.convertBtn}
                onClick={handleGeneratePdf}
                disabled={pdfSettings.isGenerating}
              >
                {pdfSettings.isGenerating ? 'Generating...' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF Template Container */}
      <div id='pdf-export-template' className={styles.pdfTemplateContainer}>
        <div className={styles.pdfHeader}>
          {pdfSettings.logoData && (
            <img
              src={pdfSettings.logoData}
              alt='Brand Logo'
              className={styles.pdfLogo}
            />
          )}
          {!pdfSettings.logoData && (
            <div
              style={{
                width: 40,
                height: 40,
                background: '#1c2128',
                color: '#2dd4a8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                fontSize: 24,
              }}
            >
              ⚒
            </div>
          )}
          <div className={styles.pdfBrandText}>{pdfSettings.companyName}</div>
        </div>
        <div className={styles.pdfMetrics}>
          <div className={styles.pdfMetricBox}>
            <div className={styles.pdfMetricLabel}>Files Changed</div>
            <div className={`${styles.pdfMetricValue} ${styles.valFile}`}>
              {fileCount}
            </div>
          </div>
          <div className={styles.pdfMetricBox}>
            <div className={styles.pdfMetricLabel}>Lines Added</div>
            <div className={`${styles.pdfMetricValue} ${styles.valAdd}`}>
              +{metrics.added}
            </div>
          </div>
          <div className={styles.pdfMetricBox}>
            <div className={styles.pdfMetricLabel}>Lines Deleted</div>
            <div className={`${styles.pdfMetricValue} ${styles.valDel}`}>
              -{metrics.deleted}
            </div>
          </div>
        </div>
        <div className={styles.pdfContent}>
          <link
            rel='stylesheet'
            href='https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/css/diff2html.min.css'
          />
          <div dangerouslySetInnerHTML={{ __html: htmlOutput }} />
        </div>
      </div>
    </div>
  );
}
