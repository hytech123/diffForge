'use client';
import { useState, type CSSProperties } from 'react';
import styles from '@/app/shared.module.css';

type JsonTreeIndentStyle = CSSProperties & {
  '--json-depth': number;
};

function getTreeIndentStyle(depth: number): JsonTreeIndentStyle {
  return { '--json-depth': depth };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function formatPrimitiveValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  return String(value);
}

export function getPrimitiveClass(value: unknown): string {
  if (typeof value === 'string') return styles.jsonTreeString;
  if (typeof value === 'number') return styles.jsonTreeNumber;
  if (typeof value === 'boolean') return styles.jsonTreeBoolean;
  if (value === null) return styles.jsonTreeNull;
  return styles.jsonTreeValue;
}

function getBranchSummary(value: unknown, count: number): string {
  return Array.isArray(value) ? `Array(${count})` : `Object(${count})`;
}

function JsonTreeLabel({
  isArrayItem,
  name,
}: {
  isArrayItem: boolean;
  name?: string;
}) {
  if (name === undefined) return null;

  if (isArrayItem) {
    return (
      <>
        <span className={styles.jsonTreeIndex}>{name}</span>
        <span className={styles.jsonTreeColon}>:</span>
      </>
    );
  }

  return (
    <>
      <span className={styles.jsonTreeKey}>{JSON.stringify(name)}</span>
      <span className={styles.jsonTreeColon}>:</span>
    </>
  );
}

function JsonTreeNode({
  depth = 0,
  isArrayItem = false,
  isLast = true,
  name,
  value,
}: {
  depth?: number;
  isArrayItem?: boolean;
  isLast?: boolean;
  name?: string;
  value: unknown;
}) {
  const [isCollapsed, setIsCollapsed] = useState(depth > 1);
  const isArray = Array.isArray(value);
  const isObject = isJsonObject(value);
  const isBranch = isArray || isObject;
  const comma = isLast ? '' : ',';

  if (!isBranch) {
    return (
      <div
        className={`${styles.jsonTreeRow} ${styles.jsonTreeLeafRow}`}
        style={getTreeIndentStyle(depth)}
      >
        <span className={styles.jsonTreeToggleSpacer} />
        <JsonTreeLabel isArrayItem={isArrayItem} name={name} />
        <span className={getPrimitiveClass(value)}>
          {formatPrimitiveValue(value)}
        </span>
        <span className={styles.jsonTreeComma}>{comma}</span>
      </div>
    );
  }

  const entries = isArray
    ? value.map((item, index) => ({
        isArrayItem: true,
        key: String(index),
        value: item,
      }))
    : Object.entries(value as Record<string, unknown>).map(
        ([entryKey, entryValue]) => ({
          isArrayItem: false,
          key: entryKey,
          value: entryValue,
        }),
      );
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const isEmpty = entries.length === 0;

  if (isEmpty) {
    return (
      <div
        className={`${styles.jsonTreeRow} ${styles.jsonTreeLeafRow}`}
        style={getTreeIndentStyle(depth)}
      >
        <span className={styles.jsonTreeToggleSpacer} />
        <JsonTreeLabel isArrayItem={isArrayItem} name={name} />
        <span className={styles.jsonTreeBracket}>
          {openBracket}
          {closeBracket}
        </span>
        <span className={styles.jsonTreeComma}>{comma}</span>
      </div>
    );
  }

  return (
    <div className={styles.jsonTreeNode}>
      <button
        aria-expanded={!isCollapsed}
        className={`${styles.jsonTreeRow} ${styles.jsonTreeBranchRow}`}
        onClick={() => setIsCollapsed((current) => !current)}
        style={getTreeIndentStyle(depth)}
        type='button'
      >
        <span className={styles.jsonTreeToggleIcon}>
          {isCollapsed ? '▸' : '▾'}
        </span>
        <JsonTreeLabel isArrayItem={isArrayItem} name={name} />
        <span className={styles.jsonTreeBracket}>{openBracket}</span>
        <span className={styles.jsonTreeSummary}>
          {getBranchSummary(value, entries.length)}
        </span>
        {isCollapsed && (
          <>
            <span className={styles.jsonTreeBracket}>{closeBracket}</span>
            <span className={styles.jsonTreeComma}>{comma}</span>
          </>
        )}
      </button>

      {!isCollapsed && (
        <>
          {entries.map((entry, index) => (
            <JsonTreeNode
              key={`${entry.key}-${index}`}
              depth={depth + 1}
              isArrayItem={entry.isArrayItem}
              isLast={index === entries.length - 1}
              name={entry.key}
              value={entry.value}
            />
          ))}
          <div
            className={`${styles.jsonTreeRow} ${styles.jsonTreeClosingRow}`}
            style={getTreeIndentStyle(depth)}
          >
            <span className={styles.jsonTreeToggleSpacer} />
            <span className={styles.jsonTreeBracket}>{closeBracket}</span>
            <span className={styles.jsonTreeComma}>{comma}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function JsonTree({ value }: { value: unknown }) {
  return (
    <div className={styles.jsonTree}>
      <JsonTreeNode value={value} />
    </div>
  );
}
