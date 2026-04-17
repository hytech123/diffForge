'use client';
import { useEffect, useRef } from 'react';
import styles from '@/app/shared.module.css';

export interface FeatureItem {
  title: string;
  description: string;
  visual: React.ReactNode;
}

interface FeaturesShowcaseProps {
  badges?: string[];
  heroTitle: string;
  heroDescription: string;
  features: FeatureItem[];
}

function FeatureBlock({
  feature,
  index,
}: {
  feature: FeatureItem;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add(styles.featureVisible);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={styles.featureBlock}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      <div className={styles.featureText}>
        <h3 className={styles.featureTitle}>{feature.title}</h3>
        <p className={styles.featureDesc}>{feature.description}</p>
      </div>
      <div className={styles.featureVisual}>{feature.visual}</div>
    </div>
  );
}

export default function FeaturesShowcase({
  badges,
  heroTitle,
  heroDescription,
  features,
}: FeaturesShowcaseProps) {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add(styles.featureVisible);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.featuresSection}>
      {/* Divider */}
      <div className={styles.featuresDivider} />

      {/* Hero */}
      <div
        ref={heroRef}
        className={`${styles.featuresHero} ${styles.featureAnimate}`}
      >
        {badges && (
          <div className={styles.badgeRow}>
            {badges.map((b) => (
              <span key={b} className={styles.badge}>
                {b}
              </span>
            ))}
          </div>
        )}
        <h2 className={styles.featuresTitle}>{heroTitle}</h2>
        <p className={styles.featuresDesc}>{heroDescription}</p>
      </div>

      {/* Feature Blocks */}
      <div className={styles.featureList}>
        {features.map((f, i) => (
          <FeatureBlock key={f.title} feature={f} index={i} />
        ))}
      </div>
    </section>
  );
}
