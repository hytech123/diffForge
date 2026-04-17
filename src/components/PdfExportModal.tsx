'use client';
import { useRef, ChangeEvent } from 'react';
import styles from '@/app/shared.module.css';

interface PdfExportModalProps {
  showModal: boolean;
  companyName: string;
  logoData: string;
  isGenerating: boolean;
  onClose: () => void;
  onCompanyNameChange: (name: string) => void;
  onLogoUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onGenerate: () => void;
}

export default function PdfExportModal({
  showModal,
  companyName,
  logoData,
  isGenerating,
  onClose,
  onCompanyNameChange,
  onLogoUpload,
  onGenerate,
}: PdfExportModalProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);

  if (!showModal) return null;

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Export Professional PDF</div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Company / Report Name</label>
          <input
            type='text'
            className={styles.textInput}
            value={companyName}
            onChange={(e) => onCompanyNameChange(e.target.value)}
            placeholder='e.g. Acme Corp Code Audit'
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Brand Logo (Optional)</label>
          <div className={styles.fileInputWrapper}>
            <div className={styles.logoPreview}>
              {logoData ? <img src={logoData} alt='Logo' /> : '⚒'}
            </div>
            <input
              type='file'
              accept='image/png, image/jpeg, image/svg+xml'
              style={{ display: 'none' }}
              ref={logoInputRef}
              onChange={onLogoUpload}
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
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </button>
          <button
            className={styles.convertBtn}
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
