'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '@/app/shared.module.css';

export default function PageLayout({
  children,
  mainClassName,
  onSampleClick,
}: {
  children: React.ReactNode;
  mainClassName?: string;
  onSampleClick?: () => void;
}) {
  const pathname = usePathname();
  const mainClass = mainClassName
    ? `${styles.main} ${mainClassName}`
    : styles.main;

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

        <nav className={styles.navTabs}>
          <Link
            href='/'
            className={`${styles.navTab} ${pathname === '/' ? styles.navTabActive : ''}`}
          >
            Patch Code
          </Link>
          <Link
            href='/compare'
            className={`${styles.navTab} ${pathname === '/compare' ? styles.navTabActive : ''}`}
          >
            Compare Docs
          </Link>
          <Link
            href='/format-json'
            className={`${styles.navTab} ${pathname === '/format-json' ? styles.navTabActive : ''}`}
          >
            Format JSON
          </Link>
        </nav>

        <div className={styles.headerActions}>
          {onSampleClick && (
            <button className={styles.iconBtn} onClick={onSampleClick}>
              ✦ Sample
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={mainClass}>{children}</main>

      {/* Footer */}
      <footer className={styles.footer}>
        Powered by DiffForge — Client-side only, your data never leaves the
        browser.
      </footer>
    </div>
  );
}
