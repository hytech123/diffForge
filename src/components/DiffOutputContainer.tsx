'use client';
import { useState, useRef, ChangeEvent, useEffect } from 'react';
import styles from '@/app/shared.module.css';
import PdfExportModal from './PdfExportModal';

interface DiffOutputProps {
  htmlOutput: string;
  fileCount: number;
  metrics: { added: number; deleted: number };
}

export default function DiffOutputContainer({
  htmlOutput,
  fileCount,
  metrics,
}: DiffOutputProps) {
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

  const handleCompanyNameChange = (val: string) => {
    setPdfSettings((p) => ({ ...p, companyName: val }));
    localStorage.setItem('diffforge-company', val);
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        setPdfSettings((p) => ({ ...p, logoData: data }));
        localStorage.setItem('diffforge-logo', data);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!htmlOutput) {
    return (
      <section className={styles.emptyState}>
        <div className={styles.emptyIcon}>⎇</div>
        <div className={styles.emptyTitle}>No diff loaded</div>
        <div className={styles.emptyHint}>
          Provide your diff content or files above to see the visualization.
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={styles.outputSection}>
        <div className={styles.outputHeader}>
          <div className={styles.outputTitle}>
            Output
            <span className={styles.fileCount}>
              {fileCount} file{fileCount !== 1 ? 's' : ''}
            </span>
            <span
              className={styles.fileCount}
              style={{ color: '#56d364', background: 'rgba(35,134,54,0.18)' }}
            >
              +{metrics.added}
            </span>
            <span
              className={styles.fileCount}
              style={{ color: '#f85149', background: 'rgba(218,54,51,0.18)' }}
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
            {/* Keeping Export PDF commented out as per user edits, but preserving the logic */}
            {/* <button 
              className={styles.iconBtn} 
              style={{borderColor: 'rgba(45, 212, 168, 0.4)', color: 'var(--accent)'}}
              onClick={() => setPdfSettings(p => ({...p, showModal: true}))}
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

      <PdfExportModal
        showModal={pdfSettings.showModal}
        companyName={pdfSettings.companyName}
        logoData={pdfSettings.logoData}
        isGenerating={pdfSettings.isGenerating}
        onClose={() => setPdfSettings((p) => ({ ...p, showModal: false }))}
        onCompanyNameChange={handleCompanyNameChange}
        onLogoUpload={handleLogoUpload}
        onGenerate={handleGeneratePdf}
      />

      {/* Hidden PDF Template Container */}
      <div id='pdf-export-template' className={styles.pdfTemplateContainer}>
        <div className={styles.pdfHeader}>
          {pdfSettings.logoData && (
            <img
              src={pdfSettings.logoData}
              alt='Brand'
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
    </>
  );
}
