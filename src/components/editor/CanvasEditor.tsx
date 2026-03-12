import React, { useMemo, useRef, useEffect, useState } from 'react';
import type { Keypoint } from '../../types';
import type { PoseGuideJoint, PoseTopologyResponse } from '../../types/api';

type GroupName = PoseGuideJoint['group'] | 'unknown';

const GROUP_LABELS: Record<GroupName, string> = {
  arm: '팔',
  hand: '손',
  leg: '다리',
  torso: '몸통',
  head: '머리',
  face: '얼굴',
  unknown: '기타',
};

const GROUP_FALLBACK_COLORS: Record<GroupName, string> = {
  head: '#fde68a',
  face: '#f9a8d4',
  torso: '#a78bfa',
  arm: '#60a5fa',
  hand: '#34d399',
  leg: '#fb7185',
  unknown: '#a1a1aa',
};

const JOINT_ALIASES: Record<string, string[]> = {
  head: ['head', 'top_head', 'head_top'],
  neck: ['neck', 'cervical'],
  chest: ['chest', 'spine2', 'upper_spine', 'thorax'],
  abdomen: ['abdomen', 'spine1', 'stomach', 'belly'],
  spine: ['spine', 'mid_hip', 'pelvis_center', 'hip_center', 'lower_spine'],
  pelvis: ['pelvis', 'hip', 'root'],
  leftShoulder: ['left_shoulder', 'l_shoulder', 'shoulder_left'],
  rightShoulder: ['right_shoulder', 'r_shoulder', 'shoulder_right'],
  leftElbow: ['left_elbow', 'l_elbow', 'elbow_left'],
  rightElbow: ['right_elbow', 'r_elbow', 'elbow_right'],
  leftWrist: ['left_wrist', 'l_wrist', 'wrist_left'],
  rightWrist: ['right_wrist', 'r_wrist', 'wrist_right'],
  leftHip: ['left_hip', 'l_hip', 'hip_left'],
  rightHip: ['right_hip', 'r_hip', 'hip_right'],
  leftKnee: ['left_knee', 'l_knee', 'knee_left'],
  rightKnee: ['right_knee', 'r_knee', 'knee_right'],
  leftAnkle: ['left_ankle', 'l_ankle', 'ankle_left'],
  rightAnkle: ['right_ankle', 'r_ankle', 'ankle_right'],
  leftFoot: ['left_foot', 'left_toe', 'foot_left', 'toe_left'],
  rightFoot: ['right_foot', 'right_toe', 'foot_right', 'toe_right'],
};

const rgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const safeHex = normalized.length === 3
    ? normalized.split('').map((value) => value + value).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const red = Number.parseInt(safeHex.slice(0, 2), 16);
  const green = Number.parseInt(safeHex.slice(2, 4), 16);
  const blue = Number.parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const averagePoint = (...points: Array<{ x: number; y: number } | undefined>) => {
  const validPoints = points.filter(Boolean) as Array<{ x: number; y: number }>;
  if (validPoints.length === 0) return undefined;

  const total = validPoints.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / validPoints.length, y: total.y / validPoints.length };
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type EditorDragTarget =
  | { type: 'joint'; index: number }
  | { type: 'group'; indices: number[] };

const pointToSegmentDistance = (point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = { x: start.x + dx * t, y: start.y + dy * t };
  return distance(point, projection);
};

const pointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prev = polygon[previous];
    const intersects = ((current.y > point.y) !== (prev.y > point.y))
      && (point.x < ((prev.x - current.x) * (point.y - current.y)) / ((prev.y - current.y) || 1e-6) + current.x);
    if (intersects) inside = !inside;
  }
  return inside;
};

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

interface CanvasEditorProps {
  keypoints: Keypoint[];
  backgroundImage?: string | null;
  jointGuides?: PoseGuideJoint[];
  topology?: PoseTopologyResponse | null;
  draggingIdx: number | null;
  onStart: (x: number, y: number, target?: EditorDragTarget) => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
  isLoading?: boolean;
  isRefining?: boolean;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({ 
  keypoints, backgroundImage, jointGuides, topology, draggingIdx, onStart, onMove, onEnd, isLoading, isRefining 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

  const CANVAS_WIDTH = 600;
  const CANVAS_HEIGHT = 800;

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [backgroundImage]);

  const jointGuideMap = useMemo(() => new Map((jointGuides || []).map((joint) => [joint.name, joint])), [jointGuides]);
  const keypointByName = useMemo(() => new Map(keypoints.map((keypoint) => [keypoint.name, keypoint])), [keypoints]);
  const keypointIndexByName = useMemo(() => new Map(keypoints.map((keypoint, index) => [keypoint.name, index] as const)), [keypoints]);
  const topologyJointNames = useMemo(() => {
    const names = new Set<string>();
    if (!topology) return names;
    (topology.edges || []).forEach(([from, to]) => {
      names.add(from);
      names.add(to);
    });
    Object.values(topology.groups || {}).forEach((items) => {
      (items || []).forEach((name) => names.add(name));
    });
    return names;
  }, [topology]);

  const getJoint = (aliases: string[]) => {
    const direct = aliases.map((alias) => keypointByName.get(alias)).find(Boolean);
    if (direct) return direct;

    const candidates = topologyJointNames.size > 0
      ? keypoints.filter((point) => topologyJointNames.has(point.name))
      : keypoints;

    for (const alias of aliases) {
      const normalizedAlias = normalizeName(alias);
      for (const point of candidates) {
        const normalizedPoint = normalizeName(point.name);
        if (normalizedPoint.includes(normalizedAlias) || normalizedAlias.includes(normalizedPoint)) {
          return point;
        }
      }
    }
    return undefined;
  };

  const namedJoints = {
    head: getJoint(JOINT_ALIASES.head),
    neck: getJoint(JOINT_ALIASES.neck),
    chest: getJoint(JOINT_ALIASES.chest),
    abdomen: getJoint(JOINT_ALIASES.abdomen),
    spine: getJoint(JOINT_ALIASES.spine),
    pelvis: getJoint(JOINT_ALIASES.pelvis),
    leftShoulder: getJoint(JOINT_ALIASES.leftShoulder),
    rightShoulder: getJoint(JOINT_ALIASES.rightShoulder),
    leftElbow: getJoint(JOINT_ALIASES.leftElbow),
    rightElbow: getJoint(JOINT_ALIASES.rightElbow),
    leftWrist: getJoint(JOINT_ALIASES.leftWrist),
    rightWrist: getJoint(JOINT_ALIASES.rightWrist),
    leftHip: getJoint(JOINT_ALIASES.leftHip),
    rightHip: getJoint(JOINT_ALIASES.rightHip),
    leftKnee: getJoint(JOINT_ALIASES.leftKnee),
    rightKnee: getJoint(JOINT_ALIASES.rightKnee),
    leftAnkle: getJoint(JOINT_ALIASES.leftAnkle),
    rightAnkle: getJoint(JOINT_ALIASES.rightAnkle),
    leftFoot: getJoint(JOINT_ALIASES.leftFoot),
    rightFoot: getJoint(JOINT_ALIASES.rightFoot),
  };

  const digitGroups = useMemo(() => {
    const filterBy = (matcher: (normalized: string) => boolean) => keypoints.filter((point) => matcher(normalizeName(point.name)));
    return {
      leftFingers: filterBy((name) => /thumb|index|middle|ring|pinky|finger|엄지|검지|중지|약지|새끼|손가락/.test(name) && /(left|l|왼|좌)/.test(name)),
      rightFingers: filterBy((name) => /thumb|index|middle|ring|pinky|finger|엄지|검지|중지|약지|새끼|손가락/.test(name) && /(right|r|오른|우)/.test(name)),
      leftToes: filterBy((name) => /toe|toes|발가락/.test(name) && /(left|l|왼|좌)/.test(name)),
      rightToes: filterBy((name) => /toe|toes|발가락/.test(name) && /(right|r|오른|우)/.test(name)),
    };
  }, [keypoints]);

  const derivedPoints = useMemo(() => {
    const shoulderCenter = averagePoint(namedJoints.leftShoulder, namedJoints.rightShoulder, namedJoints.chest);
    const hipCenter = averagePoint(namedJoints.leftHip, namedJoints.rightHip, namedJoints.pelvis, namedJoints.spine);
    const neck = namedJoints.neck || (shoulderCenter
      ? {
          name: '__virtual_neck__',
          x: shoulderCenter.x,
          y: clamp01(shoulderCenter.y - Math.max(0.02, Math.abs((namedJoints.head?.y ?? shoulderCenter.y - 0.08) - shoulderCenter.y) * 0.18)),
        }
      : undefined);

    const palmFrom = (wrist?: Keypoint, fingers: Keypoint[] = []) => {
      if (!wrist) return undefined;
      const fingertipCenter = averagePoint(...fingers);
      if (!fingertipCenter) return wrist;
      return {
        x: wrist.x * 0.45 + fingertipCenter.x * 0.55,
        y: wrist.y * 0.45 + fingertipCenter.y * 0.55,
      };
    };

    const soleFrom = (ankle?: Keypoint, foot?: Keypoint, toes: Keypoint[] = []) => {
      if (!ankle) return undefined;
      const toeCenter = averagePoint(...toes);
      if (foot && toeCenter) {
        return {
          x: (ankle.x + foot.x + toeCenter.x) / 3,
          y: (ankle.y + foot.y + toeCenter.y) / 3,
        };
      }
      if (foot) {
        return { x: (ankle.x + foot.x) / 2, y: (ankle.y + foot.y) / 2 };
      }
      return toeCenter ? { x: (ankle.x + toeCenter.x) / 2, y: (ankle.y + toeCenter.y) / 2 } : ankle;
    };

    const headCenter = neck
      ? (() => {
          const headY = namedJoints.head?.y ?? clamp01(neck.y - 0.1);
          const span = Math.max(0.03, Math.abs(neck.y - headY));
          return {
            x: namedJoints.head?.x ?? neck.x,
            y: clamp01(neck.y - span * 0.58),
          };
        })()
      : namedJoints.head;

    return {
      shoulderCenter,
      hipCenter,
      neck,
      headCenter,
      leftPalm: palmFrom(namedJoints.leftWrist, digitGroups.leftFingers),
      rightPalm: palmFrom(namedJoints.rightWrist, digitGroups.rightFingers),
      leftSole: soleFrom(namedJoints.leftAnkle, namedJoints.leftFoot, digitGroups.leftToes),
      rightSole: soleFrom(namedJoints.rightAnkle, namedJoints.rightFoot, digitGroups.rightToes),
    };
  }, [digitGroups.leftFingers, digitGroups.leftToes, digitGroups.rightFingers, digitGroups.rightToes, namedJoints]);

  const dragGroups = useMemo(() => {
    const namesToIndices = (names: Array<string | undefined>) => Array.from(new Set(names
      .map((name) => (name ? keypointIndexByName.get(name) : undefined))
      .filter((value): value is number => value !== undefined)));

    return {
      torso: namesToIndices([
        namedJoints.head?.name,
        namedJoints.neck?.name,
        namedJoints.chest?.name,
        namedJoints.abdomen?.name,
        namedJoints.spine?.name,
        namedJoints.pelvis?.name,
        namedJoints.leftShoulder?.name,
        namedJoints.rightShoulder?.name,
        namedJoints.leftHip?.name,
        namedJoints.rightHip?.name,
      ]),
      leftArm: namesToIndices([namedJoints.leftShoulder?.name, namedJoints.leftElbow?.name, namedJoints.leftWrist?.name, ...digitGroups.leftFingers.map((point) => point.name)]),
      rightArm: namesToIndices([namedJoints.rightShoulder?.name, namedJoints.rightElbow?.name, namedJoints.rightWrist?.name, ...digitGroups.rightFingers.map((point) => point.name)]),
      leftLeg: namesToIndices([namedJoints.leftHip?.name, namedJoints.leftKnee?.name, namedJoints.leftAnkle?.name, namedJoints.leftFoot?.name, ...digitGroups.leftToes.map((point) => point.name)]),
      rightLeg: namesToIndices([namedJoints.rightHip?.name, namedJoints.rightKnee?.name, namedJoints.rightAnkle?.name, namedJoints.rightFoot?.name, ...digitGroups.rightToes.map((point) => point.name)]),
      head: namesToIndices([namedJoints.head?.name, namedJoints.neck?.name]),
    };
  }, [digitGroups.leftFingers, digitGroups.leftToes, digitGroups.rightFingers, digitGroups.rightToes, keypointIndexByName, namedJoints]);

  const groupSummaries = Object.values(
    (jointGuides || []).reduce<Record<string, { group: GroupName; color: string; count: number }>>((acc, joint) => {
      const group = (joint.group || 'unknown') as GroupName;
      if (!acc[group]) {
        acc[group] = { group, color: joint.color || GROUP_FALLBACK_COLORS[group], count: 0 };
      }
      acc[group].count += 1;
      return acc;
    }, {})
  );

  const getGroupColor = (jointName?: string, fallbackGroup: GroupName = 'unknown') => {
    if (!jointName) return GROUP_FALLBACK_COLORS[fallbackGroup];
    const guide = jointGuideMap.get(jointName);
    const group = (guide?.group || fallbackGroup) as GroupName;
    return guide?.color || GROUP_FALLBACK_COLORS[group];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const toCanvasPoint = (point?: { x: number; y: number }) => point ? ({ x: point.x * canvas.width, y: point.y * canvas.height }) : undefined;

    const drawLimb = (points: Keypoint[], color: string, thickness: number) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = rgba(color, 0.5);
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((point, index) => {
        const canvasPoint = toCanvasPoint(point);
        if (!canvasPoint) return;
        if (index === 0) ctx.moveTo(canvasPoint.x, canvasPoint.y);
        else ctx.lineTo(canvasPoint.x, canvasPoint.y);
      });
      ctx.stroke();
      ctx.restore();
    };

    const drawMannequin = () => {
      const leftShoulder = toCanvasPoint(namedJoints.leftShoulder);
      const rightShoulder = toCanvasPoint(namedJoints.rightShoulder);
      const chest = toCanvasPoint(namedJoints.chest);
      const spine = toCanvasPoint(namedJoints.spine);
      const pelvis = toCanvasPoint(namedJoints.pelvis);
      const leftHip = toCanvasPoint(namedJoints.leftHip);
      const rightHip = toCanvasPoint(namedJoints.rightHip);
      const head = toCanvasPoint(derivedPoints.headCenter);
      const neck = toCanvasPoint(derivedPoints.neck);
      const abdomen = toCanvasPoint(namedJoints.abdomen);

      const shoulderCenter = averagePoint(leftShoulder, rightShoulder, chest, neck);
      const hipCenter = averagePoint(leftHip, rightHip, pelvis, spine);

      if (head && neck) {
        const headRadius = Math.max(distance(head, neck) * 1.15, 20);
        ctx.save();
        ctx.fillStyle = rgba(getGroupColor(namedJoints.head?.name, 'head'), 0.28);
        ctx.strokeStyle = rgba(getGroupColor(namedJoints.head?.name, 'head'), 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(head.x, head.y, headRadius * 0.88, headRadius * 1.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = rgba(getGroupColor(namedJoints.head?.name, 'head'), 0.7);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(neck.x, neck.y);
        ctx.lineTo((head.x + neck.x) / 2, head.y + (neck.y - head.y) * 0.28);
        ctx.stroke();
        ctx.restore();
      }

      const torsoColor = getGroupColor(namedJoints.chest?.name || namedJoints.spine?.name, 'torso');

      if (leftShoulder && rightShoulder && (hipCenter || leftHip || rightHip)) {
        const upperLeft = leftShoulder;
        const upperRight = rightShoulder;
        const lowerRight = averagePoint(rightHip, hipCenter, abdomen, spine);
        const lowerLeft = averagePoint(leftHip, hipCenter, abdomen, spine);

        if (lowerLeft && lowerRight) {
          ctx.save();
          ctx.fillStyle = rgba(torsoColor, 0.25);
          ctx.strokeStyle = rgba(torsoColor, 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(upperLeft.x, upperLeft.y);
          ctx.lineTo(upperRight.x, upperRight.y);
          ctx.lineTo(lowerRight.x, lowerRight.y);
          ctx.lineTo(lowerLeft.x, lowerLeft.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      if (chest && shoulderCenter) {
        const chestRadius = Math.max(distance(chest, shoulderCenter) * 0.75, 22);
        ctx.save();
        ctx.fillStyle = rgba(torsoColor, 0.22);
        ctx.strokeStyle = rgba(torsoColor, 0.6);
        ctx.beginPath();
        ctx.ellipse(chest.x, chest.y, chestRadius * 1.2, chestRadius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (abdomen && pelvis) {
        const midSize = Math.max(distance(abdomen, pelvis) * 0.55, 16);
        ctx.save();
        ctx.fillStyle = rgba(torsoColor, 0.2);
        ctx.strokeStyle = rgba(torsoColor, 0.55);
        ctx.beginPath();
        ctx.ellipse(abdomen.x, abdomen.y, midSize * 1.1, midSize * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (pelvis && (leftHip || rightHip)) {
        const leftPelvis = averagePoint(leftHip, pelvis, spine) || pelvis;
        const rightPelvis = averagePoint(rightHip, pelvis, spine) || pelvis;
        const pelvisCenter = averagePoint(leftPelvis, rightPelvis, pelvis) || pelvis;
        const pelvisRadius = Math.max(distance(leftPelvis, rightPelvis) * 0.5, 18);
        ctx.save();
        ctx.fillStyle = rgba(torsoColor, 0.2);
        ctx.strokeStyle = rgba(torsoColor, 0.55);
        ctx.beginPath();
        ctx.ellipse(pelvisCenter.x, pelvisCenter.y, pelvisRadius * 1.2, pelvisRadius * 0.68, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      drawLimb([namedJoints.leftShoulder, namedJoints.leftElbow, namedJoints.leftWrist].filter(Boolean) as Keypoint[], getGroupColor(namedJoints.leftShoulder?.name, 'arm'), 24);
      drawLimb([namedJoints.rightShoulder, namedJoints.rightElbow, namedJoints.rightWrist].filter(Boolean) as Keypoint[], getGroupColor(namedJoints.rightShoulder?.name, 'arm'), 24);
      drawLimb([namedJoints.leftHip, namedJoints.leftKnee, namedJoints.leftAnkle, namedJoints.leftFoot].filter(Boolean) as Keypoint[], getGroupColor(namedJoints.leftHip?.name, 'leg'), 28);
      drawLimb([namedJoints.rightHip, namedJoints.rightKnee, namedJoints.rightAnkle, namedJoints.rightFoot].filter(Boolean) as Keypoint[], getGroupColor(namedJoints.rightHip?.name, 'leg'), 28);
      drawLimb(([derivedPoints.neck, namedJoints.chest, namedJoints.abdomen, namedJoints.spine, namedJoints.pelvis].filter(Boolean) as Array<{ x: number; y: number; name?: string }>) as Keypoint[], torsoColor, 16);

      if (leftShoulder && rightShoulder) {
        drawLimb([namedJoints.leftShoulder, namedJoints.rightShoulder].filter(Boolean) as Keypoint[], getGroupColor(namedJoints.chest?.name, 'torso'), 18);
      }

      if (leftHip && rightHip) {
        drawLimb([namedJoints.leftHip, namedJoints.rightHip].filter(Boolean) as Keypoint[], getGroupColor(namedJoints.pelvis?.name, 'torso'), 18);
      }

      const drawDetailedDigits = (side: 'left' | 'right') => {
        const wrist = side === 'left' ? namedJoints.leftWrist : namedJoints.rightWrist;
        const ankle = side === 'left' ? namedJoints.leftAnkle : namedJoints.rightAnkle;
        const palm = side === 'left' ? derivedPoints.leftPalm : derivedPoints.rightPalm;
        const sole = side === 'left' ? derivedPoints.leftSole : derivedPoints.rightSole;
        const sideKeywords = side === 'left' ? ['left', 'l_', '왼', '좌'] : ['right', 'r_', '오른', '우'];

        const fingerPoints = keypoints.filter((point) => {
          const normalized = normalizeName(point.name);
          const isFinger = /finger|thumb|index|middle|ring|pinky|손가락|엄지|검지|중지|약지|새끼/.test(normalized);
          const sideMatch = sideKeywords.some((keyword) => normalized.includes(normalizeName(keyword)));
          return isFinger && sideMatch;
        });

        const toePoints = keypoints.filter((point) => {
          const normalized = normalizeName(point.name);
          const isToe = /toe|toes|발가락/.test(normalized);
          const sideMatch = sideKeywords.some((keyword) => normalized.includes(normalizeName(keyword)));
          return isToe && sideMatch;
        });

        const fingerColor = getGroupColor(wrist?.name, 'hand');
        const toeColor = getGroupColor(ankle?.name, 'leg');

        if (wrist && palm) {
          drawLimb([{ ...wrist }, { name: `${side}_palm`, x: palm.x, y: palm.y }] as Keypoint[], fingerColor, 14);
          const palmPoint = toCanvasPoint(palm);
          if (palmPoint) {
            ctx.save();
            ctx.fillStyle = rgba(fingerColor, 0.26);
            ctx.strokeStyle = rgba(fingerColor, 0.7);
            ctx.beginPath();
            ctx.ellipse(palmPoint.x, palmPoint.y, 14, 10, side === 'left' ? -0.35 : 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }

        if (ankle && sole) {
          drawLimb([{ ...ankle }, { name: `${side}_sole`, x: sole.x, y: sole.y }] as Keypoint[], toeColor, 16);
          const solePoint = toCanvasPoint(sole);
          if (solePoint) {
            ctx.save();
            ctx.fillStyle = rgba(toeColor, 0.24);
            ctx.strokeStyle = rgba(toeColor, 0.68);
            ctx.beginPath();
            ctx.ellipse(solePoint.x, solePoint.y, 18, 11, side === 'left' ? -0.15 : 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }

        if ((palm || wrist) && fingerPoints.length > 0) {
          const sortedFingers = [...fingerPoints].sort((a, b) => a.x - b.x);
          sortedFingers.forEach((finger) => {
            drawLimb(([palm ? { name: `${side}_palm`, x: palm.x, y: palm.y } : wrist, finger].filter(Boolean)) as Keypoint[], fingerColor, 8);
          });
        }

        if ((sole || ankle) && toePoints.length > 0) {
          const sortedToes = [...toePoints].sort((a, b) => a.x - b.x);
          sortedToes.forEach((toe) => {
            drawLimb(([sole ? { name: `${side}_sole`, x: sole.x, y: sole.y } : ankle, toe].filter(Boolean)) as Keypoint[], toeColor, 8);
          });
        }
      };

      drawDetailedDigits('left');
      drawDetailedDigits('right');

      keypoints.forEach((keypoint, index) => {
        const visualPoint = /head/.test(normalizeName(keypoint.name)) && derivedPoints.neck
          ? derivedPoints.neck
          : keypoint;
        const canvasPoint = toCanvasPoint(visualPoint);
        if (!canvasPoint) return;
        const guide = jointGuideMap.get(keypoint.name);
        const group = (guide?.group || 'unknown') as GroupName;
        const color = guide?.color || GROUP_FALLBACK_COLORS[group];
        const isDragging = draggingIdx === index;

        ctx.save();
        ctx.fillStyle = isDragging ? '#ffffff' : rgba(color, 0.92);
        ctx.strokeStyle = isDragging ? rgba(color, 1) : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = isDragging ? 3.5 : 1.6;
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, isDragging ? 8.5 : 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      if (!namedJoints.neck && derivedPoints.neck) {
        const neckPoint = toCanvasPoint(derivedPoints.neck);
        if (neckPoint) {
          const color = getGroupColor(namedJoints.chest?.name, 'torso');
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = rgba(color, 1);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(neckPoint.x, neckPoint.y, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    };

    const drawScene = (image?: HTMLImageElement) => {
      if (image) {
        const imageScale = Math.min(CANVAS_WIDTH / image.width, CANVAS_HEIGHT / image.height);
        const drawWidth = image.width * imageScale;
        const drawHeight = image.height * imageScale;
        const drawOffsetX = (CANVAS_WIDTH - drawWidth) / 2;
        const drawOffsetY = (CANVAS_HEIGHT - drawHeight) / 2;

        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.drawImage(image, drawOffsetX, drawOffsetY, drawWidth, drawHeight);
        ctx.restore();
      }

      drawMannequin();
    };

    const drawCanvas = (image?: HTMLImageElement) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.setTransform(scale, 0, 0, scale, offset.x, offset.y);
      drawScene(image);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    if (!backgroundImage) {
      drawCanvas();
      return;
    }

    const image = new Image();
    image.onload = () => drawCanvas(image);
    image.onerror = () => drawCanvas();
    image.src = backgroundImage;
  }, [backgroundImage, derivedPoints, draggingIdx, jointGuideMap, keypoints, namedJoints, offset.x, offset.y, scale]);

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sceneX = (e.clientX - rect.left - offset.x) / scale;
    const sceneY = (e.clientY - rect.top - offset.y) / scale;
    return {
      x: sceneX / canvas.width,
      y: sceneY / canvas.height
    };
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
    const nextScale = Math.min(3.5, Math.max(0.45, scale * zoomFactor));

    const ratio = nextScale / scale;
    const nextOffsetX = cursorX - (cursorX - offset.x) * ratio;
    const nextOffsetY = cursorY - (cursorY - offset.y) * ratio;

    setScale(nextScale);
    setOffset({ x: nextOffsetX, y: nextOffsetY });
  };

  const fitToView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const resolveDragTarget = (x: number, y: number): EditorDragTarget | undefined => {
    const point = { x, y };
    const nearJointIndex = keypoints.findIndex((keypoint) => Math.hypot(keypoint.x - x, keypoint.y - y) < 0.04);
    if (nearJointIndex >= 0) return { type: 'joint', index: nearJointIndex };

    const torsoPolygon = [namedJoints.leftShoulder, namedJoints.rightShoulder, namedJoints.rightHip, namedJoints.leftHip]
      .filter(Boolean) as Keypoint[];
    if (torsoPolygon.length === 4 && pointInPolygon(point, torsoPolygon)) {
      return { type: 'group', indices: dragGroups.torso };
    }

    const segmentHits: Array<{ indices: number[]; score: number }> = [];
    const pushSegments = (chain: Array<Keypoint | undefined>, indices: number[]) => {
      const valid = chain.filter(Boolean) as Keypoint[];
      for (let index = 0; index < valid.length - 1; index += 1) {
        segmentHits.push({
          indices,
          score: pointToSegmentDistance(point, valid[index], valid[index + 1]),
        });
      }
    };

    pushSegments([namedJoints.leftShoulder, namedJoints.leftElbow, namedJoints.leftWrist], dragGroups.leftArm);
    pushSegments([namedJoints.rightShoulder, namedJoints.rightElbow, namedJoints.rightWrist], dragGroups.rightArm);
    pushSegments([namedJoints.leftHip, namedJoints.leftKnee, namedJoints.leftAnkle, namedJoints.leftFoot], dragGroups.leftLeg);
    pushSegments([namedJoints.rightHip, namedJoints.rightKnee, namedJoints.rightAnkle, namedJoints.rightFoot], dragGroups.rightLeg);

    const nearestSegment = segmentHits.sort((a, b) => a.score - b.score)[0];
    if (nearestSegment && nearestSegment.score < 0.045) {
      return { type: 'group', indices: nearestSegment.indices };
    }

    if (derivedPoints.headCenter && derivedPoints.neck) {
      const headRadius = Math.max(distance(derivedPoints.headCenter, derivedPoints.neck) * 1.2, 0.035);
      if (distance(point, derivedPoints.headCenter) < headRadius) {
        return { type: 'group', indices: dragGroups.head };
      }
    }

    return undefined;
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      setIsPanning(true);
      setPanStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
      return;
    }

    const { x, y } = getPos(event);
    onStart(x, y, resolveDragTarget(x, y));
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning && panStart) {
      setOffset({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
      return;
    }

    const { x, y } = getPos(event);
    onMove(x, y);
  };

  const handleMouseEnd = () => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    onEnd();
  };

  return (
    <div className="flex gap-6 items-start">
      <div className="relative glass-card p-4 rounded-2xl shadow-2xl border border-zinc-800">
        <div className="absolute top-7 right-7 z-20 flex items-center gap-2 rounded-full border border-zinc-800 bg-black/70 px-2 py-1.5 backdrop-blur-sm">
          <button onClick={() => setScale((prev) => Math.max(0.45, prev * 0.9))} className="h-8 w-8 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">-</button>
          <span className="text-xs font-mono text-zinc-300 w-12 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((prev) => Math.min(3.5, prev * 1.1))} className="h-8 w-8 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">+</button>
          <button onClick={fitToView} className="h-8 px-3 rounded-full text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">맞춤</button>
        </div>

        <canvas 
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseEnd}
          onMouseLeave={handleMouseEnd}
          onContextMenu={(event) => event.preventDefault()}
          onWheel={handleWheel}
          className="cursor-crosshair bg-zinc-950 rounded-xl"
        />
        {isLoading && (
          <div className="absolute inset-4 bg-zinc-950/80 backdrop-blur-md rounded-xl flex items-center justify-center">
            <div className="text-white animate-pulse tracking-widest text-xs font-mono uppercase">Analyzing Line Art...</div>
          </div>
        )}
        {isRefining && !isLoading && (
          <div className="absolute inset-4 bg-zinc-950/70 backdrop-blur-sm rounded-xl flex items-center justify-center pointer-events-none">
            <div className="text-white tracking-widest text-xs font-mono uppercase">Refining Pose Accuracy...</div>
          </div>
        )}
      </div>

      {jointGuides && jointGuides.length > 0 && (
        <div className="glass-card p-4 rounded-2xl shadow-2xl border border-zinc-800 w-64">
          <div className="text-xs font-bold uppercase text-zinc-400 mb-4 tracking-wider">Body Guide</div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {groupSummaries.map((summary) => (
              <div key={summary.group} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: summary.color }} />
                    <span className="text-sm font-semibold text-zinc-100 truncate">{GROUP_LABELS[summary.group]}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{summary.count} joints</span>
                </div>
                <div className="mt-2 text-[11px] text-zinc-500 leading-5">
                  {(jointGuides || [])
                    .filter((joint) => joint.group === summary.group)
                    .slice(0, 5)
                    .map((joint) => joint.label)
                    .join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
