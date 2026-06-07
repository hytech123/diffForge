export type DiffStatus = 'unchanged' | 'added' | 'removed' | 'modified';

export type JsonDiffNode = {
  key?: string;
  isArrayItem?: boolean;
  hasChanges?: boolean;
  status: DiffStatus;
  value?: unknown;
  oldValue?: unknown;
  newValue?: unknown;
  children?: JsonDiffNode[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBranch(value: unknown): boolean {
  return Array.isArray(value) || isObject(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    left === null ||
    right === null
  ) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function leafNode(
  status: DiffStatus,
  options: {
    key?: string;
    isArrayItem?: boolean;
    value?: unknown;
    oldValue?: unknown;
    newValue?: unknown;
  },
): JsonDiffNode {
  return { status, ...options };
}

function branchNode(
  status: DiffStatus,
  children: JsonDiffNode[],
  options: {
    key?: string;
    isArrayItem?: boolean;
    value?: unknown;
    oldValue?: unknown;
    newValue?: unknown;
  } = {},
): JsonDiffNode {
  const hasChanges = children.some(
    (child) => child.status !== 'unchanged' || Boolean(child.hasChanges),
  );

  return {
    status,
    hasChanges,
    children,
    ...options,
  };
}

function diffValues(
  left: unknown,
  right: unknown,
  key?: string,
  isArrayItem?: boolean,
): JsonDiffNode {
  const leftExists = left !== undefined;
  const rightExists = right !== undefined;

  if (!leftExists && rightExists) {
    if (isBranch(right)) {
      return branchNode('added', buildChildren(undefined, right), {
        key,
        isArrayItem,
        newValue: right,
      });
    }
    return leafNode('added', { key, isArrayItem, value: right, newValue: right });
  }

  if (leftExists && !rightExists) {
    if (isBranch(left)) {
      return branchNode('removed', buildChildren(left, undefined), {
        key,
        isArrayItem,
        oldValue: left,
      });
    }
    return leafNode('removed', { key, isArrayItem, value: left, oldValue: left });
  }

  if (!leftExists && !rightExists) {
    return leafNode('unchanged', { key, isArrayItem });
  }

  if (!isBranch(left) && !isBranch(right)) {
    if (valuesEqual(left, right)) {
      return leafNode('unchanged', { key, isArrayItem, value: left });
    }
    return leafNode('modified', {
      key,
      isArrayItem,
      oldValue: left,
      newValue: right,
    });
  }

  if (!isBranch(left) || !isBranch(right)) {
    return leafNode('modified', {
      key,
      isArrayItem,
      oldValue: left,
      newValue: right,
    });
  }

  return branchNode('unchanged', buildChildren(left, right), {
    key,
    isArrayItem,
    value: left,
    oldValue: left,
    newValue: right,
  });
}

function buildChildren(left: unknown, right: unknown): JsonDiffNode[] {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftArray = Array.isArray(left) ? left : [];
    const rightArray = Array.isArray(right) ? right : [];
    const maxLength = Math.max(leftArray.length, rightArray.length);

    return Array.from({ length: maxLength }, (_, index) =>
      diffValues(leftArray[index], rightArray[index], String(index), true),
    );
  }

  const leftObject = isObject(left) ? left : {};
  const rightObject = isObject(right) ? right : {};
  const keys = [
    ...new Set([...Object.keys(leftObject), ...Object.keys(rightObject)]),
  ].sort();

  return keys.map((key) =>
    diffValues(
      key in leftObject ? leftObject[key] : undefined,
      key in rightObject ? rightObject[key] : undefined,
      key,
      false,
    ),
  );
}

export function diffJson(left: unknown, right: unknown): JsonDiffNode {
  return diffValues(left, right);
}

export function countDiffMetrics(root: JsonDiffNode): {
  added: number;
  removed: number;
  modified: number;
} {
  const metrics = { added: 0, removed: 0, modified: 0 };

  const walk = (node: JsonDiffNode, parentStatus?: DiffStatus) => {
    if (node.status === 'added') {
      if (parentStatus !== 'added') metrics.added += 1;
      return;
    }

    if (node.status === 'removed') {
      if (parentStatus !== 'removed') metrics.removed += 1;
      return;
    }

    if (node.status === 'modified') metrics.modified += 1;
    node.children?.forEach((child) => walk(child, node.status));
  };

  walk(root);
  return metrics;
}
