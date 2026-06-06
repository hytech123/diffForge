'use client';
import { useState, type CSSProperties } from 'react';
import styles from '@/app/shared.module.css';
import {
  formatPrimitiveValue,
  getPrimitiveClass,
} from '@/components/JsonTree';
import type { DiffStatus, JsonDiffNode } from '@/lib/jsonDiff';

type JsonTreeIndentStyle = CSSProperties & {
  '--json-depth': number;
};

function getTreeIndentStyle(depth: number): JsonTreeIndentStyle {
  return { '--json-depth': depth };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getBranchSummary(value: unknown, count: number): string {
  return Array.isArray(value) ? `Array(${count})` : `Object(${count})`;
}

function getStatusRowClass(status: DiffStatus): string {
  if (status === 'added') return styles.jsonDiffRowAdded;
  if (status === 'removed') return styles.jsonDiffRowRemoved;
  if (status === 'modified') return styles.jsonDiffRowModified;
  return '';
}

function getBranchValue(node: JsonDiffNode): unknown {
  if (node.status === 'added') return node.newValue ?? node.value;
  if (node.status === 'removed') return node.oldValue ?? node.value;
  return node.newValue ?? node.value ?? node.oldValue;
}

function shouldStartCollapsed(depth: number, status: DiffStatus): boolean {
  return depth > 1 && status === 'unchanged';
}

function JsonDiffTreeLabel({
  isArrayItem,
  name,
}: {
  isArrayItem?: boolean;
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

function JsonDiffValue({
  node,
}: {
  node: JsonDiffNode;
}) {
  if (node.status === 'modified') {
    return (
      <span className={styles.jsonDiffModifiedValue}>
        <span
          className={`${styles.jsonDiffOldValue} ${getPrimitiveClass(node.oldValue)}`}
        >
          {formatPrimitiveValue(node.oldValue)}
        </span>
        <span className={styles.jsonDiffArrow}>→</span>
        <span className={getPrimitiveClass(node.newValue)}>
          {formatPrimitiveValue(node.newValue)}
        </span>
      </span>
    );
  }

  const value =
    node.status === 'removed'
      ? (node.oldValue ?? node.value)
      : (node.newValue ?? node.value);

  return (
    <span className={getPrimitiveClass(value)}>
      {formatPrimitiveValue(value)}
    </span>
  );
}

function JsonDiffTreeNode({
  depth = 0,
  isLast = true,
  node,
}: {
  depth?: number;
  isLast?: boolean;
  node: JsonDiffNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    shouldStartCollapsed(depth, node.status),
  );
  const comma = isLast ? '' : ',';
  const branchValue = getBranchValue(node);
  const isArray = Array.isArray(branchValue);
  const isObject = isJsonObject(branchValue);
  const isBranch = Boolean(node.children?.length) || isArray || isObject;

  if (!isBranch || !node.children?.length) {
    if (!isBranch) {
      return (
        <div
          className={`${styles.jsonTreeRow} ${styles.jsonTreeLeafRow} ${getStatusRowClass(node.status)}`}
          style={getTreeIndentStyle(depth)}
        >
          <span className={styles.jsonTreeToggleSpacer} />
          <JsonDiffTreeLabel isArrayItem={node.isArrayItem} name={node.key} />
          <JsonDiffValue node={node} />
          <span className={styles.jsonTreeComma}>{comma}</span>
        </div>
      );
    }

    const openBracket = isArray ? '[' : '{';
    const closeBracket = isArray ? ']' : '}';

    return (
      <div
        className={`${styles.jsonTreeRow} ${styles.jsonTreeLeafRow} ${getStatusRowClass(node.status)}`}
        style={getTreeIndentStyle(depth)}
      >
        <span className={styles.jsonTreeToggleSpacer} />
        <JsonDiffTreeLabel isArrayItem={node.isArrayItem} name={node.key} />
        <span className={styles.jsonTreeBracket}>
          {openBracket}
          {closeBracket}
        </span>
        <span className={styles.jsonTreeComma}>{comma}</span>
      </div>
    );
  }

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const entries = node.children;
  const isEmpty = entries.length === 0;

  if (isEmpty) {
    return (
      <div
        className={`${styles.jsonTreeRow} ${styles.jsonTreeLeafRow} ${getStatusRowClass(node.status)}`}
        style={getTreeIndentStyle(depth)}
      >
        <span className={styles.jsonTreeToggleSpacer} />
        <JsonDiffTreeLabel isArrayItem={node.isArrayItem} name={node.key} />
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
        className={`${styles.jsonTreeRow} ${styles.jsonTreeBranchRow} ${getStatusRowClass(node.status)}`}
        onClick={() => setIsCollapsed((current) => !current)}
        style={getTreeIndentStyle(depth)}
        type='button'
      >
        <span className={styles.jsonTreeToggleIcon}>
          {isCollapsed ? '▸' : '▾'}
        </span>
        <JsonDiffTreeLabel isArrayItem={node.isArrayItem} name={node.key} />
        <span className={styles.jsonTreeBracket}>{openBracket}</span>
        <span className={styles.jsonTreeSummary}>
          {getBranchSummary(branchValue, entries.length)}
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
          {entries.map((child, index) => (
            <JsonDiffTreeNode
              key={`${child.key ?? 'root'}-${index}`}
              depth={depth + 1}
              isLast={index === entries.length - 1}
              node={child}
            />
          ))}
          <div
            className={`${styles.jsonTreeRow} ${styles.jsonTreeClosingRow} ${getStatusRowClass(node.status)}`}
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

export default function JsonDiffTree({ root }: { root: JsonDiffNode }) {
  return (
    <div className={styles.jsonTree}>
      <JsonDiffTreeNode node={root} />
    </div>
  );
}
