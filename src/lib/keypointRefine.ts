import type { Keypoint } from '../types';
import type { PoseTopologyResponse } from '../types/api';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const brightnessAt = (data: Uint8ClampedArray, width: number, x: number, y: number) => {
  const px = Math.max(0, Math.min(width - 1, x));
  const idx = (y * width + px) * 4;
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return (r + g + b) / 3;
};

const edgeStrengthAt = (data: Uint8ClampedArray, width: number, height: number, x: number, y: number) => {
  const cx = Math.max(1, Math.min(width - 2, x));
  const cy = Math.max(1, Math.min(height - 2, y));
  const gx = Math.abs(brightnessAt(data, width, cx + 1, cy) - brightnessAt(data, width, cx - 1, cy));
  const gy = Math.abs(brightnessAt(data, width, cx, cy + 1) - brightnessAt(data, width, cx, cy - 1));
  return gx + gy;
};

const getSearchRadius = (name: string) => {
  const normalized = name.toLowerCase();
  if (/finger|thumb|index|middle|ring|pinky|toe|발가락|손가락/.test(normalized)) return 28;
  if (/foot|발/.test(normalized)) return 34;
  if (/wrist|ankle|elbow|knee|손목|발목|팔꿈치|무릎/.test(normalized)) return 38;
  if (/head|neck|chest|spine|pelvis|hip|머리|목|가슴|골반/.test(normalized)) return 34;
  return 26;
};

const getMaxDelta = (name: string) => {
  const normalized = name.toLowerCase();
  if (/finger|thumb|index|middle|ring|pinky|toe|발가락|손가락/.test(normalized)) return 0.1;
  if (/foot|발/.test(normalized)) return 0.12;
  if (/wrist|ankle|elbow|knee|손목|발목|팔꿈치|무릎/.test(normalized)) return 0.12;
  if (/head|neck|chest|spine|pelvis|hip|머리|목|가슴|골반/.test(normalized)) return 0.1;
  return 0.085;
};

const getImprovementThreshold = (name: string) => {
  const normalized = name.toLowerCase();
  if (/finger|thumb|index|middle|ring|pinky|toe|발가락|손가락/.test(normalized)) return 3.5;
  if (/foot|wrist|ankle|elbow|knee|손목|발목|팔꿈치|무릎|발/.test(normalized)) return 4.5;
  return 8;
};

const buildNeighborGraph = (points: Keypoint[], topology?: PoseTopologyResponse) => {
  const neighbors: number[][] = points.map(() => []);

  if (topology?.edges?.length) {
    const indexByName = new Map(points.map((point, index) => [point.name, index] as const));
    topology.edges.forEach(([from, to]) => {
      const fromIndex = indexByName.get(from);
      const toIndex = indexByName.get(to);
      if (fromIndex === undefined || toIndex === undefined) return;
      if (!neighbors[fromIndex].includes(toIndex)) neighbors[fromIndex].push(toIndex);
      if (!neighbors[toIndex].includes(fromIndex)) neighbors[toIndex].push(fromIndex);
    });
  }

  for (let i = 0; i < points.length; i += 1) {
    if (neighbors[i].length >= 2) continue;
    const distances: Array<{ index: number; distance: number }> = [];
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (distance <= 0.24) distances.push({ index: j, distance });
    }
    distances.sort((a, b) => a.distance - b.distance);
    const current = neighbors[i];
    distances.forEach((entry) => {
      if (current.length >= 4) return;
      if (!current.includes(entry.index)) current.push(entry.index);
    });
  }
  return neighbors;
};

const findIndexByNameLike = (points: Keypoint[], patterns: RegExp[]) => {
  for (let index = 0; index < points.length; index += 1) {
    const name = points[index].name.toLowerCase();
    if (patterns.some((pattern) => pattern.test(name))) {
      return index;
    }
  }
  return -1;
};

const enforceSymmetryAndLimbStability = (original: Keypoint[], refined: Keypoint[], topology?: PoseTopologyResponse) => {
  const next = [...refined];
  const indexByName = new Map(next.map((point, index) => [point.name, index] as const));

  const findIndexByName = (name: string) => {
    const index = indexByName.get(name);
    return index === undefined ? -1 : index;
  };

  const leftShoulderIndex = findIndexByName('left_shoulder') >= 0
    ? findIndexByName('left_shoulder')
    : findIndexByNameLike(next, [/left.?shoulder|l.?shoulder|shoulder.?left|왼.*어깨|좌.*어깨/]);
  const rightShoulderIndex = findIndexByName('right_shoulder') >= 0
    ? findIndexByName('right_shoulder')
    : findIndexByNameLike(next, [/right.?shoulder|r.?shoulder|shoulder.?right|오른.*어깨|우.*어깨/]);
  const leftHipIndex = findIndexByName('left_hip') >= 0
    ? findIndexByName('left_hip')
    : findIndexByNameLike(next, [/left.?hip|l.?hip|hip.?left|왼.*골반|좌.*골반/]);
  const rightHipIndex = findIndexByName('right_hip') >= 0
    ? findIndexByName('right_hip')
    : findIndexByNameLike(next, [/right.?hip|r.?hip|hip.?right|오른.*골반|우.*골반/]);

  const lrPairs = topology?.left_right_pairs || [];
  const findLRPair = (leftName: string, rightName: string) =>
    lrPairs.find(([left, right]) => left === leftName && right === rightName);

  const ensureLeftRightXOrder = (leftIndex: number, rightIndex: number) => {
    if (leftIndex < 0 || rightIndex < 0) return;
    const left = next[leftIndex];
    const right = next[rightIndex];
    if (left.x > right.x) {
      next[leftIndex] = { ...left, x: Math.max(0, right.x - 0.012) };
      next[rightIndex] = { ...right, x: Math.min(1, left.x + 0.012) };
    }
  };

  if (findLRPair('left_shoulder', 'right_shoulder')) ensureLeftRightXOrder(leftShoulderIndex, rightShoulderIndex);
  else ensureLeftRightXOrder(leftShoulderIndex, rightShoulderIndex);

  if (findLRPair('left_hip', 'right_hip')) ensureLeftRightXOrder(leftHipIndex, rightHipIndex);
  else ensureLeftRightXOrder(leftHipIndex, rightHipIndex);

  const limitPair = (aIndex: number, bIndex: number, minRatio: number, maxRatio: number) => {
    if (aIndex < 0 || bIndex < 0) return;
    const originalDistance = Math.hypot(original[aIndex].x - original[bIndex].x, original[aIndex].y - original[bIndex].y);
    if (originalDistance <= 1e-4) return;

    const currentDistance = Math.hypot(next[aIndex].x - next[bIndex].x, next[aIndex].y - next[bIndex].y);
    const minDistance = originalDistance * minRatio;
    const maxDistance = originalDistance * maxRatio;

    if (currentDistance >= minDistance && currentDistance <= maxDistance) return;

    const centerX = (next[aIndex].x + next[bIndex].x) / 2;
    const centerY = (next[aIndex].y + next[bIndex].y) / 2;
    const dx = next[bIndex].x - next[aIndex].x;
    const dy = next[bIndex].y - next[aIndex].y;
    const length = Math.hypot(dx, dy) || 1e-4;
    const target = Math.max(minDistance, Math.min(maxDistance, currentDistance));

    const ux = dx / length;
    const uy = dy / length;
    const half = target / 2;

    next[aIndex] = {
      ...next[aIndex],
      x: clamp01(centerX - ux * half),
      y: clamp01(centerY - uy * half),
    };
    next[bIndex] = {
      ...next[bIndex],
      x: clamp01(centerX + ux * half),
      y: clamp01(centerY + uy * half),
    };
  };

  const leftElbowIndex = findIndexByName('left_elbow') >= 0
    ? findIndexByName('left_elbow')
    : findIndexByNameLike(next, [/left.?elbow|l.?elbow|elbow.?left|왼.*팔꿈치|좌.*팔꿈치/]);
  const rightElbowIndex = findIndexByName('right_elbow') >= 0
    ? findIndexByName('right_elbow')
    : findIndexByNameLike(next, [/right.?elbow|r.?elbow|elbow.?right|오른.*팔꿈치|우.*팔꿈치/]);
  const leftWristIndex = findIndexByName('left_wrist') >= 0
    ? findIndexByName('left_wrist')
    : findIndexByNameLike(next, [/left.?wrist|l.?wrist|wrist.?left|왼.*손목|좌.*손목/]);
  const rightWristIndex = findIndexByName('right_wrist') >= 0
    ? findIndexByName('right_wrist')
    : findIndexByNameLike(next, [/right.?wrist|r.?wrist|wrist.?right|오른.*손목|우.*손목/]);
  const leftKneeIndex = findIndexByName('left_knee') >= 0
    ? findIndexByName('left_knee')
    : findIndexByNameLike(next, [/left.?knee|l.?knee|knee.?left|왼.*무릎|좌.*무릎/]);
  const rightKneeIndex = findIndexByName('right_knee') >= 0
    ? findIndexByName('right_knee')
    : findIndexByNameLike(next, [/right.?knee|r.?knee|knee.?right|오른.*무릎|우.*무릎/]);
  const leftAnkleIndex = findIndexByName('left_ankle') >= 0
    ? findIndexByName('left_ankle')
    : findIndexByNameLike(next, [/left.?ankle|l.?ankle|ankle.?left|왼.*발목|좌.*발목/]);
  const rightAnkleIndex = findIndexByName('right_ankle') >= 0
    ? findIndexByName('right_ankle')
    : findIndexByNameLike(next, [/right.?ankle|r.?ankle|ankle.?right|오른.*발목|우.*발목/]);
  const leftFootIndex = findIndexByName('left_foot') >= 0
    ? findIndexByName('left_foot')
    : findIndexByNameLike(next, [/left.?foot|foot.?left|left.?toe|toe.?left|왼.*발|좌.*발/]);
  const rightFootIndex = findIndexByName('right_foot') >= 0
    ? findIndexByName('right_foot')
    : findIndexByNameLike(next, [/right.?foot|foot.?right|right.?toe|toe.?right|오른.*발|우.*발/]);

  limitPair(leftShoulderIndex, leftElbowIndex, 0.65, 1.35);
  limitPair(leftElbowIndex, leftWristIndex, 0.6, 1.4);
  limitPair(rightShoulderIndex, rightElbowIndex, 0.65, 1.35);
  limitPair(rightElbowIndex, rightWristIndex, 0.6, 1.4);
  limitPair(leftHipIndex, leftKneeIndex, 0.65, 1.35);
  limitPair(leftKneeIndex, leftAnkleIndex, 0.6, 1.4);
  limitPair(leftAnkleIndex, leftFootIndex, 0.45, 1.65);
  limitPair(rightHipIndex, rightKneeIndex, 0.65, 1.35);
  limitPair(rightKneeIndex, rightAnkleIndex, 0.6, 1.4);
  limitPair(rightAnkleIndex, rightFootIndex, 0.45, 1.65);

  return next;
};

const enforceDigitConstraints = (refined: Keypoint[], topology?: PoseTopologyResponse) => {
  const next = [...refined];

  const applyDigitConstraint = (
    anchorPatterns: RegExp[],
    referencePatterns: RegExp[],
    digitRegex: RegExp,
  ) => {
    const anchorIdx = findIndexByNameLike(next, anchorPatterns);
    if (anchorIdx < 0) return;

    const anchor = next[anchorIdx];
    const refIdx = findIndexByNameLike(next, referencePatterns);
    let maxReach = 0.12;

    if (refIdx >= 0) {
      const ref = next[refIdx];
      const limbLen = Math.hypot(anchor.x - ref.x, anchor.y - ref.y);
      maxReach = Math.max(0.05, Math.min(0.18, limbLen * 0.55));
    }

    for (let i = 0; i < next.length; i += 1) {
      if (i === anchorIdx) continue;
      if (!digitRegex.test(next[i].name.toLowerCase())) continue;

      const digit = next[i];
      const dist = Math.hypot(digit.x - anchor.x, digit.y - anchor.y);
      if (dist > maxReach && dist > 0) {
        const ratio = maxReach / dist;
        next[i] = {
          ...digit,
          x: clamp01(anchor.x + (digit.x - anchor.x) * ratio),
          y: clamp01(anchor.y + (digit.y - anchor.y) * ratio),
        };
      }
    }
  };

  const indexByName = new Map(next.map((point, index) => [point.name, index] as const));
  const applyNamedDigits = (anchorName: string, refName: string, digitNames: string[]) => {
    const anchorIdx = indexByName.get(anchorName);
    if (anchorIdx === undefined) return;
    const refIdx = indexByName.get(refName);
    const anchor = next[anchorIdx];
    let maxReach = 0.12;

    if (refIdx !== undefined) {
      const ref = next[refIdx];
      const limbLen = Math.hypot(anchor.x - ref.x, anchor.y - ref.y);
      maxReach = Math.max(0.05, Math.min(0.18, limbLen * 0.55));
    }

    digitNames.forEach((name) => {
      const digitIndex = indexByName.get(name);
      if (digitIndex === undefined) return;
      const digit = next[digitIndex];
      const dist = Math.hypot(digit.x - anchor.x, digit.y - anchor.y);
      if (dist > maxReach && dist > 0) {
        const ratio = maxReach / dist;
        next[digitIndex] = {
          ...digit,
          x: clamp01(anchor.x + (digit.x - anchor.x) * ratio),
          y: clamp01(anchor.y + (digit.y - anchor.y) * ratio),
        };
      }
    });
  };

  const handGroup = topology?.groups?.hand || [];
  const legGroup = topology?.groups?.leg || [];
  const leftHandDigits = handGroup.filter((name) => name.startsWith('left_'));
  const rightHandDigits = handGroup.filter((name) => name.startsWith('right_'));
  const leftFootDigits = legGroup.filter((name) => name.startsWith('left_') && /toe/.test(name));
  const rightFootDigits = legGroup.filter((name) => name.startsWith('right_') && /toe/.test(name));

  if (leftHandDigits.length > 0) applyNamedDigits('left_wrist', 'left_elbow', leftHandDigits);
  if (rightHandDigits.length > 0) applyNamedDigits('right_wrist', 'right_elbow', rightHandDigits);
  if (leftFootDigits.length > 0) applyNamedDigits('left_ankle', 'left_knee', leftFootDigits);
  if (rightFootDigits.length > 0) applyNamedDigits('right_ankle', 'right_knee', rightFootDigits);

  // 왼손 손가락
  applyDigitConstraint(
    [/left.?wrist|l.?wrist|wrist.?left|왼.*손목|좌.*손목/],
    [/left.?elbow|l.?elbow|elbow.?left|왼.*팔꿈치|좌.*팔꿈치/],
    /left.*(?:finger|thumb|index|middle|ring|pinky)|(?:finger|thumb|index|middle|ring|pinky).*left|왼.*손가락|좌.*손가락/,
  );
  // 오른손 손가락
  applyDigitConstraint(
    [/right.?wrist|r.?wrist|wrist.?right|오른.*손목|우.*손목/],
    [/right.?elbow|r.?elbow|elbow.?right|오른.*팔꿈치|우.*팔꿈치/],
    /right.*(?:finger|thumb|index|middle|ring|pinky)|(?:finger|thumb|index|middle|ring|pinky).*right|오른.*손가락|우.*손가락/,
  );
  // 왼발 발가락
  applyDigitConstraint(
    [/left.?ankle|l.?ankle|ankle.?left|왼.*발목|좌.*발목/],
    [/left.?knee|l.?knee|knee.?left|왼.*무릎|좌.*무릎/],
    /left.*toe|toe.*left|왼.*발가락|좌.*발가락/,
  );
  // 오른발 발가락
  applyDigitConstraint(
    [/right.?ankle|r.?ankle|ankle.?right|오른.*발목|우.*발목/],
    [/right.?knee|r.?knee|knee.?right|오른.*무릎|우.*무릎/],
    /right.*toe|toe.*right|오른.*발가락|우.*발가락/,
  );

  return next;
};

export const refineKeypointsByLineArt = async (
  imageUrl: string,
  keypoints: Keypoint[],
  width = 600,
  height = 800,
  topology?: PoseTopologyResponse,
): Promise<Keypoint[]> => {
  if (!imageUrl || keypoints.length === 0) return keypoints;

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return keypoints;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    const firstPass = keypoints.map((keypoint) => {
      const centerX = Math.round(clamp01(keypoint.x) * width);
      const centerY = Math.round(clamp01(keypoint.y) * height);
      const radius = getSearchRadius(keypoint.name);
      const centerBrightness = brightnessAt(pixels, width, centerX, centerY);
      const centerEdge = edgeStrengthAt(pixels, width, height, centerX, centerY);

      let bestX = centerX;
      let bestY = centerY;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;

          const x = centerX + dx;
          const y = centerY + dy;
          if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) continue;

          const brightness = brightnessAt(pixels, width, x, y);
          const edge = edgeStrengthAt(pixels, width, height, x, y);
          const distancePenalty = Math.hypot(dx, dy) * 1.35;

          const darkness = 255 - brightness;
          const score = brightness * 1.05 - edge * 0.65 - darkness * 0.05 + distancePenalty;
          if (score < bestScore) {
            bestScore = score;
            bestX = x;
            bestY = y;
          }
        }
      }

      const improvement = (centerBrightness - brightnessAt(pixels, width, bestX, bestY)) + (edgeStrengthAt(pixels, width, height, bestX, bestY) - centerEdge) * 0.2;
      if (improvement < getImprovementThreshold(keypoint.name)) return keypoint;

      const nextX = clamp01(bestX / width);
      const nextY = clamp01(bestY / height);
      const maxDelta = getMaxDelta(keypoint.name);

      const limitedX = keypoint.x + Math.max(-maxDelta, Math.min(maxDelta, nextX - keypoint.x));
      const limitedY = keypoint.y + Math.max(-maxDelta, Math.min(maxDelta, nextY - keypoint.y));

      return {
        ...keypoint,
        x: clamp01(limitedX),
        y: clamp01(limitedY),
      };
    });

    const neighbors = buildNeighborGraph(keypoints, topology);
    let relaxed = [...firstPass];

    for (let iteration = 0; iteration < 3; iteration += 1) {
      relaxed = relaxed.map((point, index) => {
        const linked = neighbors[index];
        if (!linked || linked.length === 0) return point;

        const anchor = linked.reduce(
          (acc, neighborIndex) => {
            const neighborCurrent = relaxed[neighborIndex];
            const neighborOriginal = keypoints[neighborIndex];
            const originalOffsetX = keypoints[index].x - neighborOriginal.x;
            const originalOffsetY = keypoints[index].y - neighborOriginal.y;
            return {
              x: acc.x + neighborCurrent.x + originalOffsetX,
              y: acc.y + neighborCurrent.y + originalOffsetY,
            };
          },
          { x: 0, y: 0 },
        );

        const anchorX = anchor.x / linked.length;
        const anchorY = anchor.y / linked.length;
        const blendedX = point.x * 0.72 + anchorX * 0.28;
        const blendedY = point.y * 0.72 + anchorY * 0.28;

        const maxDelta = getMaxDelta(point.name);
        const base = keypoints[index];
        const limitedX = base.x + Math.max(-maxDelta, Math.min(maxDelta, blendedX - base.x));
        const limitedY = base.y + Math.max(-maxDelta, Math.min(maxDelta, blendedY - base.y));

        return {
          ...point,
          x: clamp01(limitedX),
          y: clamp01(limitedY),
        };
      });
    }

    return enforceDigitConstraints(enforceSymmetryAndLimbStability(keypoints, relaxed, topology), topology);
  } catch {
    return keypoints;
  }
};
