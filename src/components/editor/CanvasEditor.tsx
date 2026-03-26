import React, { Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, TransformControls, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Keypoint } from '../../types';
import type { PoseEditorState, PoseGuideResponse, PoseTopologyResponse } from '../../types/api';

const MODEL_URL = '/models/bane_male_texture_rigged_merged.glb';
const BACKGROUND_OPACITY = 0.42;
const TARGET_MODEL_HEIGHT = 6.4;
const JOINT_HANDLE_RADIUS = 0.055;
const POSE_PROJECTION_MAX_WIDTH = 384;
const POSE_PROJECTION_MAX_HEIGHT = 512;
const POSE_PROJECTION_QUALITY = 0.76;
const DISABLED_RAYCAST: THREE.Object3D['raycast'] = () => null;

type TransformMode = 'translate' | 'rotate' | 'scale';
type TransformTarget = 'whole' | 'bone';

export type CanvasEditorHandle = {
  capturePoseProjection: () => Promise<string | null>;
};

type RigState = {
  isRigged: boolean;
  canEditBones: boolean;
  mappedBoneCount: number;
  firstBoneId: string | null;
  message: string | null;
};

type BoneOption = {
  id: string;
  keypointName?: string;
  bone: THREE.Bone;
};

type EditableBoneDefinition = {
  id: string;
  keypointName?: string;
  candidates: string[];
  tokenSets: string[][];
};

const KEYPOINT_BONE_CANDIDATES: Record<string, string[]> = {
  head: ['mixamorigHead', 'Head', 'face'],
  neck: ['mixamorigNeck', 'Neck', 'spine.006'],
  chest: ['mixamorigSpine2', 'mixamorigSpine1', 'Spine2', 'Spine1', 'Chest', 'chest', 'spine.005'],
  abdomen: ['mixamorigSpine1', 'mixamorigSpine', 'Spine1', 'Spine', 'UpperChest', 'wiest', 'spine.004', 'spine.003'],
  spine: ['mixamorigSpine', 'Spine', 'wiest', 'spine.002', 'spine.001', 'spine'],
  pelvis: ['mixamorigHips', 'Hips', 'Pelvis', 'hip', 'pelvis.L', 'pelvis.R'],
  left_shoulder: ['mixamorigLeftShoulder', 'LeftShoulder', 'upperarm.L', 'shoulder.L'],
  left_elbow: ['mixamorigLeftForeArm', 'LeftForeArm', 'LeftLowerArm', 'LeftElbow', 'lowerarm.L', 'forearm.L'],
  left_wrist: ['mixamorigLeftHand', 'LeftHand', 'LeftWrist', 'hand.L'],
  right_shoulder: ['mixamorigRightShoulder', 'RightShoulder', 'upperarm.R', 'shoulder.R'],
  right_elbow: ['mixamorigRightForeArm', 'RightForeArm', 'RightLowerArm', 'RightElbow', 'lowerarm.R', 'forearm.R'],
  right_wrist: ['mixamorigRightHand', 'RightHand', 'RightWrist', 'hand.R'],
  left_hip: ['mixamorigLeftUpLeg', 'LeftUpLeg', 'LeftThigh', 'LeftHip', 'upperleg.L', 'thigh.L'],
  left_knee: ['mixamorigLeftLeg', 'LeftLeg', 'LeftCalf', 'LeftKnee', 'lowerleg.L', 'shin.L'],
  left_ankle: ['mixamorigLeftFoot', 'LeftFoot', 'LeftAnkle', 'foot.L'],
  left_foot: ['mixamorigLeftToeBase', 'LeftToeBase', 'LeftToe', 'toe.L'],
  right_hip: ['mixamorigRightUpLeg', 'RightUpLeg', 'RightThigh', 'RightHip', 'upperleg.R', 'thigh.R'],
  right_knee: ['mixamorigRightLeg', 'RightLeg', 'RightCalf', 'RightKnee', 'lowerleg.R', 'shin.R'],
  right_ankle: ['mixamorigRightFoot', 'RightFoot', 'RightAnkle', 'foot.R'],
  right_foot: ['mixamorigRightToeBase', 'RightToeBase', 'RightToe', 'toe.R'],
};

const KEYPOINT_BONE_TOKENS: Record<string, string[][]> = {
  head: [['head'], ['face']],
  neck: [['neck'], ['spine006']],
  chest: [['spine2'], ['chest'], ['upperchest'], ['spine005']],
  abdomen: [['spine1'], ['spine004'], ['spine003']],
  spine: [['spine002'], ['spine001'], ['spine']],
  pelvis: [['hips'], ['pelvis'], ['hip']],
  left_shoulder: [['left', 'shoulder'], ['l', 'shoulder'], ['upperarm', 'l'], ['shoulder', 'l']],
  left_elbow: [['left', 'forearm'], ['left', 'lowerarm'], ['left', 'elbow'], ['lowerarm', 'l'], ['forearm', 'l']],
  left_wrist: [['left', 'hand'], ['left', 'wrist'], ['hand', 'l']],
  right_shoulder: [['right', 'shoulder'], ['r', 'shoulder'], ['upperarm', 'r'], ['shoulder', 'r']],
  right_elbow: [['right', 'forearm'], ['right', 'lowerarm'], ['right', 'elbow'], ['lowerarm', 'r'], ['forearm', 'r']],
  right_wrist: [['right', 'hand'], ['right', 'wrist'], ['hand', 'r']],
  left_hip: [['left', 'upleg'], ['left', 'thigh'], ['left', 'hip'], ['upperleg', 'l'], ['thigh', 'l']],
  left_knee: [['left', 'leg'], ['left', 'calf'], ['left', 'knee'], ['lowerleg', 'l'], ['shin', 'l']],
  left_ankle: [['left', 'foot'], ['left', 'ankle'], ['foot', 'l']],
  left_foot: [['left', 'toebase'], ['left', 'toe'], ['toe', 'l']],
  right_hip: [['right', 'upleg'], ['right', 'thigh'], ['right', 'hip'], ['upperleg', 'r'], ['thigh', 'r']],
  right_knee: [['right', 'leg'], ['right', 'calf'], ['right', 'knee'], ['lowerleg', 'r'], ['shin', 'r']],
  right_ankle: [['right', 'foot'], ['right', 'ankle'], ['foot', 'r']],
  right_foot: [['right', 'toebase'], ['right', 'toe'], ['toe', 'r']],
};

const EDITABLE_BONE_DEFINITIONS: EditableBoneDefinition[] = [
  { id: 'head', keypointName: 'head', candidates: KEYPOINT_BONE_CANDIDATES.head, tokenSets: KEYPOINT_BONE_TOKENS.head },
  { id: 'neck', keypointName: 'neck', candidates: KEYPOINT_BONE_CANDIDATES.neck, tokenSets: KEYPOINT_BONE_TOKENS.neck },
  { id: 'chest', keypointName: 'chest', candidates: KEYPOINT_BONE_CANDIDATES.chest, tokenSets: KEYPOINT_BONE_TOKENS.chest },
  { id: 'abdomen', keypointName: 'abdomen', candidates: KEYPOINT_BONE_CANDIDATES.abdomen, tokenSets: KEYPOINT_BONE_TOKENS.abdomen },
  { id: 'spine', keypointName: 'spine', candidates: KEYPOINT_BONE_CANDIDATES.spine, tokenSets: KEYPOINT_BONE_TOKENS.spine },
  { id: 'pelvis', keypointName: 'pelvis', candidates: KEYPOINT_BONE_CANDIDATES.pelvis, tokenSets: KEYPOINT_BONE_TOKENS.pelvis },
  { id: 'left_shoulder', keypointName: 'left_shoulder', candidates: KEYPOINT_BONE_CANDIDATES.left_shoulder, tokenSets: KEYPOINT_BONE_TOKENS.left_shoulder },
  { id: 'left_elbow', keypointName: 'left_elbow', candidates: KEYPOINT_BONE_CANDIDATES.left_elbow, tokenSets: KEYPOINT_BONE_TOKENS.left_elbow },
  { id: 'left_wrist', keypointName: 'left_wrist', candidates: KEYPOINT_BONE_CANDIDATES.left_wrist, tokenSets: KEYPOINT_BONE_TOKENS.left_wrist },
  { id: 'right_shoulder', keypointName: 'right_shoulder', candidates: KEYPOINT_BONE_CANDIDATES.right_shoulder, tokenSets: KEYPOINT_BONE_TOKENS.right_shoulder },
  { id: 'right_elbow', keypointName: 'right_elbow', candidates: KEYPOINT_BONE_CANDIDATES.right_elbow, tokenSets: KEYPOINT_BONE_TOKENS.right_elbow },
  { id: 'right_wrist', keypointName: 'right_wrist', candidates: KEYPOINT_BONE_CANDIDATES.right_wrist, tokenSets: KEYPOINT_BONE_TOKENS.right_wrist },
  { id: 'left_hip', keypointName: 'left_hip', candidates: KEYPOINT_BONE_CANDIDATES.left_hip, tokenSets: KEYPOINT_BONE_TOKENS.left_hip },
  { id: 'left_knee', keypointName: 'left_knee', candidates: KEYPOINT_BONE_CANDIDATES.left_knee, tokenSets: KEYPOINT_BONE_TOKENS.left_knee },
  { id: 'left_ankle', keypointName: 'left_ankle', candidates: KEYPOINT_BONE_CANDIDATES.left_ankle, tokenSets: KEYPOINT_BONE_TOKENS.left_ankle },
  { id: 'left_foot', keypointName: 'left_foot', candidates: KEYPOINT_BONE_CANDIDATES.left_foot, tokenSets: KEYPOINT_BONE_TOKENS.left_foot },
  { id: 'right_hip', keypointName: 'right_hip', candidates: KEYPOINT_BONE_CANDIDATES.right_hip, tokenSets: KEYPOINT_BONE_TOKENS.right_hip },
  { id: 'right_knee', keypointName: 'right_knee', candidates: KEYPOINT_BONE_CANDIDATES.right_knee, tokenSets: KEYPOINT_BONE_TOKENS.right_knee },
  { id: 'right_ankle', keypointName: 'right_ankle', candidates: KEYPOINT_BONE_CANDIDATES.right_ankle, tokenSets: KEYPOINT_BONE_TOKENS.right_ankle },
  { id: 'right_foot', keypointName: 'right_foot', candidates: KEYPOINT_BONE_CANDIDATES.right_foot, tokenSets: KEYPOINT_BONE_TOKENS.right_foot },
  { id: 'left_thumb_1', candidates: ['thumb.01.L'], tokenSets: [['thumb01l']] },
  { id: 'left_thumb_2', candidates: ['thumb.02.L'], tokenSets: [['thumb02l']] },
  { id: 'left_thumb_3', keypointName: 'left_thumb', candidates: ['thumb.03.L'], tokenSets: [['thumb03l']] },
  { id: 'left_index_1', candidates: ['f_index.01.L'], tokenSets: [['findex01l']] },
  { id: 'left_index_2', candidates: ['f_index.02.L'], tokenSets: [['findex02l']] },
  { id: 'left_index_3', keypointName: 'left_index', candidates: ['f_index.03.L'], tokenSets: [['findex03l']] },
  { id: 'left_middle_1', candidates: ['f_middle.01.L'], tokenSets: [['fmiddle01l']] },
  { id: 'left_middle_2', candidates: ['f_middle.02.L'], tokenSets: [['fmiddle02l']] },
  { id: 'left_middle_3', keypointName: 'left_middle', candidates: ['f_middle.03.L'], tokenSets: [['fmiddle03l']] },
  { id: 'left_ring_1', candidates: ['f_ring.01.L'], tokenSets: [['fring01l']] },
  { id: 'left_ring_2', candidates: ['f_ring.02.L'], tokenSets: [['fring02l']] },
  { id: 'left_ring_3', keypointName: 'left_ring', candidates: ['f_ring.03.L'], tokenSets: [['fring03l']] },
  { id: 'left_pinky_1', candidates: ['f_pinky.01.L'], tokenSets: [['fpinky01l']] },
  { id: 'left_pinky_2', candidates: ['f_pinky.02.L'], tokenSets: [['fpinky02l']] },
  { id: 'left_pinky_3', keypointName: 'left_pinky', candidates: ['f_pinky.03.L'], tokenSets: [['fpinky03l']] },
  { id: 'right_thumb_1', candidates: ['thumb.01.R'], tokenSets: [['thumb01r']] },
  { id: 'right_thumb_2', candidates: ['thumb.02.R'], tokenSets: [['thumb02r']] },
  { id: 'right_thumb_3', keypointName: 'right_thumb', candidates: ['thumb.03.R'], tokenSets: [['thumb03r']] },
  { id: 'right_index_1', candidates: ['f_index.01.R'], tokenSets: [['findex01r']] },
  { id: 'right_index_2', candidates: ['f_index.02.R'], tokenSets: [['findex02r']] },
  { id: 'right_index_3', keypointName: 'right_index', candidates: ['f_index.03.R'], tokenSets: [['findex03r']] },
  { id: 'right_middle_1', candidates: ['f_middle.01.R'], tokenSets: [['fmiddle01r']] },
  { id: 'right_middle_2', candidates: ['f_middle.02.R'], tokenSets: [['fmiddle02r']] },
  { id: 'right_middle_3', keypointName: 'right_middle', candidates: ['f_middle.03.R'], tokenSets: [['fmiddle03r']] },
  { id: 'right_ring_1', candidates: ['f_ring.01.R'], tokenSets: [['fring01r']] },
  { id: 'right_ring_2', candidates: ['f_ring.02.R'], tokenSets: [['fring02r']] },
  { id: 'right_ring_3', keypointName: 'right_ring', candidates: ['f_ring.03.R'], tokenSets: [['fring03r']] },
  { id: 'right_pinky_1', candidates: ['f_pinky.01.R'], tokenSets: [['fpinky01r']] },
  { id: 'right_pinky_2', candidates: ['f_pinky.02.R'], tokenSets: [['fpinky02r']] },
  { id: 'right_pinky_3', keypointName: 'right_pinky', candidates: ['f_pinky.03.R'], tokenSets: [['fpinky03r']] },
  { id: 'left_heel', candidates: ['heel.02.L'], tokenSets: [['heel02l']] },
  { id: 'right_heel', candidates: ['heel.02.R'], tokenSets: [['heel02r']] },
];

const BackgroundImage = ({ url }: { url: string }) => {
  const texture = useTexture(url);
  return (
    <mesh position={[0, 0, -1.6]}>
      <planeGeometry args={[6, 8]} />
      <meshBasicMaterial map={texture} opacity={BACKGROUND_OPACITY} transparent />
    </mesh>
  );
};

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const buildGuideColorMap = (guide?: PoseGuideResponse | null) => {
  const map = new Map<string, string>();
  guide?.joints.forEach((joint) => {
    map.set(joint.name, joint.color);
  });
  return map;
};

const findExactBone = (bones: THREE.Bone[], candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeName);
  return bones.find((bone) => normalizedCandidates.includes(normalizeName(bone.name))) ?? null;
};

const findBoneByDefinition = (bones: THREE.Bone[], definition: EditableBoneDefinition) => {
  const exactMatch = findExactBone(bones, definition.candidates);
  if (exactMatch) return exactMatch;

  for (const tokens of definition.tokenSets) {
    const match = bones.find((bone) => {
      const normalized = normalizeName(bone.name);
      return tokens.every((token) => normalized.includes(token));
    });
    if (match) return match;
  }

  return null;
};

const mapEditableBones = (bones: THREE.Bone[]) => {
  return EDITABLE_BONE_DEFINITIONS
    .map((definition) => {
      const bone = findBoneByDefinition(bones, definition);
      if (!bone) return null;
      return {
        id: definition.id,
        keypointName: definition.keypointName,
        bone,
      } as BoneOption;
    })
    .filter(Boolean) as BoneOption[];
};

const BoneHandle = ({
  bone,
  color,
  selected,
  hovered,
  onSelect,
  onHoverChange,
  visible,
}: {
  bone: THREE.Bone;
  color: string;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
  visible: boolean;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const position = new THREE.Vector3();
    bone.getWorldPosition(position);
    meshRef.current.position.copy(position);
  });

  return (
    <Sphere
      ref={meshRef}
      args={[
        selected ? JOINT_HANDLE_RADIUS * 1.16 : hovered ? JOINT_HANDLE_RADIUS * 1.08 : JOINT_HANDLE_RADIUS,
        18,
        18,
      ]}
      visible={visible}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHoverChange(true);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onHoverChange(false);
      }}
    >
      <meshStandardMaterial
        color={selected ? '#f8fafc' : hovered ? '#e5eefb' : color}
        emissive={selected ? color : hovered ? '#dbeafe' : '#111827'}
        emissiveIntensity={selected ? 0.58 : hovered ? 0.28 : 0.05}
        transparent
        opacity={selected ? 0.88 : hovered ? 0.48 : 0.18}
        depthTest={false}
        depthWrite={false}
      />
    </Sphere>
  );
};

const CaptureBridge = ({
  captureRequestId,
  enabled,
  onCaptured,
}: {
  captureRequestId: number;
  enabled: boolean;
  onCaptured: (imageData: string | null) => void;
}) => {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (!enabled || captureRequestId === 0) return;

    let cancelled = false;
    const previousBackground = scene.background;
    const previousClearAlpha = gl.getClearAlpha();
    const previousClearColor = gl.getClearColor(new THREE.Color()).clone();

    const capture = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;

          scene.background = new THREE.Color('#f8f8f6');
          gl.setClearColor('#f8f8f6', 1);
          gl.render(scene, camera);

          const sourceCanvas = gl.domElement;
          const exportCanvas = document.createElement('canvas');
          const scale = Math.min(
            1,
            POSE_PROJECTION_MAX_WIDTH / sourceCanvas.width,
            POSE_PROJECTION_MAX_HEIGHT / sourceCanvas.height,
          );

          exportCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
          exportCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

          const context = exportCanvas.getContext('2d');
          context?.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

          const imageData = exportCanvas.toDataURL('image/jpeg', POSE_PROJECTION_QUALITY);

          scene.background = previousBackground;
          gl.setClearColor(previousClearColor, previousClearAlpha);
          onCaptured(imageData);
        });
      });
    };

    capture();

    return () => {
      cancelled = true;
      scene.background = previousBackground;
      gl.setClearColor(previousClearColor, previousClearAlpha);
    };
  }, [camera, captureRequestId, enabled, gl, onCaptured, scene]);

  return null;
};

const RiggedMannequin = ({
  keypoints,
  backgroundImage,
  guide,
  initialEditorState,
  captureMode,
  transformMode,
  transformTarget,
  selectedBoneId,
  onSelectBone,
  onSetDragging,
  onUpdateKeypoint,
  onEditorStateChange,
  onRigStateChange,
  onCanvasSelectWhole,
}: {
  keypoints: Keypoint[];
  backgroundImage?: string | null;
  guide?: PoseGuideResponse | null;
  initialEditorState?: PoseEditorState | null;
  captureMode: boolean;
  transformMode: TransformMode;
  transformTarget: TransformTarget;
  selectedBoneId: string | null;
  onSelectBone: (boneId: string) => void;
  onSetDragging: (dragging: boolean) => void;
  onUpdateKeypoint: (index: number, newPos: THREE.Vector3, isFinal: boolean) => void;
  onEditorStateChange?: (editorState: PoseEditorState, isFinal: boolean) => void;
  onRigStateChange: (state: RigState) => void;
  onCanvasSelectWhole: () => void;
}) => {
  const gltf = useGLTF(MODEL_URL);
  const scene = useMemo(() => clone(gltf.scene) as THREE.Group, [gltf.scene]);
  const [pivotObject, setPivotObject] = useState<THREE.Object3D | null>(null);
  const [hoveredBoneId, setHoveredBoneId] = useState<string | null>(null);
  const appliedEditorStateSignatureRef = useRef<string | null>(null);

  const guideColors = useMemo(() => buildGuideColorMap(guide), [guide]);

  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.SkinnedMesh)) return;
      const currentMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
      const nextMaterial = currentMaterial instanceof THREE.MeshStandardMaterial
        ? currentMaterial.clone()
        : new THREE.MeshStandardMaterial();

      nextMaterial.color = new THREE.Color('#d9d6cf');
      nextMaterial.roughness = 0.9;
      nextMaterial.metalness = 0.03;
      nextMaterial.envMapIntensity = 0.18;
      nextMaterial.needsUpdate = true;

      object.material = nextMaterial;
    });
  }, [scene]);

  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.SkinnedMesh)) return;

      if (!object.userData.originalRaycast) {
        object.userData.originalRaycast = object.raycast;
      }

      object.raycast = transformTarget === 'bone'
        ? DISABLED_RAYCAST
        : (object.userData.originalRaycast as THREE.Object3D['raycast']);
    });

    return () => {
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.SkinnedMesh)) return;
        if (object.userData.originalRaycast) {
          object.raycast = object.userData.originalRaycast as THREE.Object3D['raycast'];
        }
      });
    };
  }, [scene, transformTarget]);

  const modelMeta = useMemo(() => {
    const bones: THREE.Bone[] = [];
    let hasSkinnedMesh = false;

    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (object instanceof THREE.Bone) bones.push(object);
      if (object instanceof THREE.SkinnedMesh) hasSkinnedMesh = true;
    });

    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const pivot = new THREE.Vector3(center.x, bounds.min.y + size.y * 0.56, center.z);
    const scale = size.y > 0 ? TARGET_MODEL_HEIGHT / size.y : 1;

    return {
      bones,
      hasSkinnedMesh,
      scale,
      pivot,
    };
  }, [scene]);

  const boneOptions = useMemo(() => mapEditableBones(modelMeta.bones), [modelMeta.bones]);

  const rigState = useMemo<RigState>(() => {
    if (!modelMeta.hasSkinnedMesh || modelMeta.bones.length === 0) {
      return {
        isRigged: false,
        canEditBones: false,
        mappedBoneCount: 0,
        firstBoneId: null,
        message: 'This GLB has no skin/bone rig. Replace it with a rigged mannequin to enable bone editing.',
      };
    }

    if (boneOptions.length === 0) {
      return {
        isRigged: true,
        canEditBones: false,
        mappedBoneCount: 0,
        firstBoneId: null,
        message: 'A skeleton exists, but no editable body bones were matched from this rig.',
      };
    }

    return {
      isRigged: true,
      canEditBones: true,
      mappedBoneCount: boneOptions.length,
      firstBoneId: boneOptions[0]?.id ?? null,
      message: null,
    };
  }, [boneOptions, modelMeta.bones.length, modelMeta.hasSkinnedMesh]);

  useEffect(() => {
    onRigStateChange(rigState);
  }, [onRigStateChange, rigState]);

  const boneById = useMemo(() => {
    const map = new Map<string, THREE.Bone>();
    boneOptions.forEach((option) => {
      map.set(option.id, option.bone);
    });
    return map;
  }, [boneOptions]);

  const selectedBoneObject = selectedBoneId ? boneById.get(selectedBoneId) ?? null : null;
  const effectiveMode: TransformMode = transformTarget === 'bone' ? 'rotate' : transformMode;
  const selectedObject = transformTarget === 'whole' ? pivotObject : selectedBoneObject;
  const showBoneHandles = rigState.canEditBones && transformTarget === 'bone';

  const keypointIndexByName = useMemo(() => {
    const map = new Map<string, number>();
    keypoints.forEach((kp, index) => map.set(kp.name, index));
    return map;
  }, [keypoints]);

  const syncKeypointsFromBones = useCallback((isFinal: boolean) => {
    if (!rigState.canEditBones) return;
    const world = new THREE.Vector3();
    boneOptions.forEach((option) => {
      if (!option.keypointName) return;
      const index = keypointIndexByName.get(option.keypointName);
      if (typeof index !== 'number') return;
      const bone = boneById.get(option.id);
      if (!bone) return;
      bone.getWorldPosition(world);
      onUpdateKeypoint(index, world.clone(), isFinal);
    });
  }, [boneById, boneOptions, keypointIndexByName, onUpdateKeypoint, rigState.canEditBones]);

  const captureEditorState = useCallback((): PoseEditorState | null => {
    if (!pivotObject) return null;

    scene.updateMatrixWorld(true);

    const wholeTransform = {
      position: pivotObject.position.toArray() as [number, number, number],
      quaternion: pivotObject.quaternion.toArray() as [number, number, number, number],
      scale: pivotObject.scale.toArray() as [number, number, number],
    };

    const bones = boneOptions.reduce<Record<string, { quaternion: [number, number, number, number] }>>((accumulator, option) => {
      accumulator[option.id] = {
        quaternion: option.bone.quaternion.toArray() as [number, number, number, number],
      };
      return accumulator;
    }, {});

    return {
      version: '1.0',
      wholeTransform,
      bones,
    };
  }, [boneOptions, pivotObject, scene]);

  const initialEditorStateSignature = useMemo(
    () => (initialEditorState ? JSON.stringify(initialEditorState) : null),
    [initialEditorState],
  );

  useEffect(() => {
    if (!initialEditorState || !initialEditorStateSignature || !pivotObject || boneOptions.length === 0) {
      return;
    }
    if (appliedEditorStateSignatureRef.current === initialEditorStateSignature) {
      return;
    }

    const { wholeTransform, bones } = initialEditorState;
    pivotObject.position.fromArray(wholeTransform.position);
    pivotObject.quaternion.fromArray(wholeTransform.quaternion);
    pivotObject.scale.fromArray(wholeTransform.scale);

    boneOptions.forEach((option) => {
      const savedBone = bones[option.id];
      if (savedBone?.quaternion) {
        option.bone.quaternion.fromArray(savedBone.quaternion);
      }
    });

    scene.updateMatrixWorld(true);
    appliedEditorStateSignatureRef.current = initialEditorStateSignature;
  }, [boneOptions, initialEditorState, initialEditorStateSignature, pivotObject, scene]);

  return (
    <>
      <ambientLight intensity={1.45} />
      <directionalLight position={[2.5, 4.5, 6]} intensity={1.15} />
      <pointLight position={[0, 0, 8]} intensity={0.72} />

      {backgroundImage && !captureMode && <BackgroundImage url={backgroundImage} />}

      <group
        ref={(object) => {
          setPivotObject(object);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onCanvasSelectWhole();
        }}
      >
        <group scale={[modelMeta.scale, modelMeta.scale, modelMeta.scale]}>
          <group position={[-modelMeta.pivot.x, -modelMeta.pivot.y, -modelMeta.pivot.z]}>
            <primitive object={scene} />
          </group>
        </group>
      </group>

      {rigState.canEditBones && !captureMode &&
        boneOptions.map((option) => (
          <BoneHandle
            key={option.id}
            bone={option.bone}
            color={guideColors.get(option.id) || '#a5b4fc'}
            selected={selectedBoneId === option.id}
            hovered={hoveredBoneId === option.id}
            visible={showBoneHandles}
            onSelect={() => onSelectBone(option.id)}
            onHoverChange={(hovered) => {
              setHoveredBoneId((current) => {
                if (hovered) return option.id;
                return current === option.id ? null : current;
              });
            }}
          />
        ))}

      {selectedObject && !captureMode && (
        <TransformControls
          object={selectedObject}
          mode={effectiveMode}
          size={transformTarget === 'bone' ? 0.34 : 0.76}
          space={transformTarget === 'bone' ? 'local' : 'world'}
          onObjectChange={() => {
            onSetDragging(true);
            syncKeypointsFromBones(false);
          }}
          onMouseUp={() => {
            onSetDragging(false);
            const editorState = captureEditorState();
            if (editorState) {
              onEditorStateChange?.(editorState, true);
            }
            syncKeypointsFromBones(true);
          }}
        />
      )}
    </>
  );
};

interface CanvasEditorProps {
  keypoints: Keypoint[];
  backgroundImage?: string | null;
  topology?: PoseTopologyResponse | null;
  guide?: PoseGuideResponse | null;
  initialEditorState?: PoseEditorState | null;
  onUpdateKeypoint: (index: number, newPos: THREE.Vector3, isFinal: boolean) => void;
  onEditorStateChange?: (editorState: PoseEditorState, isFinal: boolean) => void;
}

export const CanvasEditor = React.forwardRef<CanvasEditorHandle, CanvasEditorProps>(({
  keypoints,
  backgroundImage,
  guide,
  initialEditorState,
  onUpdateKeypoint,
  onEditorStateChange,
}, ref) => {
  const [dragging, setDragging] = useState(false);
  const [transformTarget, setTransformTarget] = useState<TransformTarget>('whole');
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(true);
  const [captureMode, setCaptureMode] = useState(false);
  const [captureRequestId, setCaptureRequestId] = useState(0);
  const [rigState, setRigState] = useState<RigState>({
    isRigged: false,
    canEditBones: false,
    mappedBoneCount: 0,
    firstBoneId: null,
    message: null,
  });
  const captureResolverRef = useRef<((imageData: string | null) => void) | null>(null);
  const activeTarget: TransformTarget = rigState.canEditBones ? transformTarget : 'whole';

  const handleCaptureComplete = useCallback((imageData: string | null) => {
    setCaptureMode(false);
    const resolve = captureResolverRef.current;
    captureResolverRef.current = null;
    resolve?.(imageData);
  }, []);

  useImperativeHandle(ref, () => ({
    capturePoseProjection: () => new Promise((resolve) => {
      captureResolverRef.current = resolve;
      setCaptureMode(true);
      setCaptureRequestId((current) => current + 1);
    }),
  }), []);

  const enterBoneMode = useCallback(() => {
    if (!rigState.canEditBones) return;
    setTransformTarget('bone');
    setTransformMode('rotate');
    setSelectedBoneId((current) => current ?? rigState.firstBoneId ?? null);
  }, [rigState.canEditBones, rigState.firstBoneId]);

  const enterWholeMode = useCallback((mode: TransformMode = 'translate') => {
    setTransformTarget('whole');
    setTransformMode(mode);
    setSelectedBoneId(null);
  }, []);

  useEffect(() => {
    if (rigState.canEditBones && transformTarget === 'bone' && !selectedBoneId) {
      setSelectedBoneId(rigState.firstBoneId ?? null);
    }
  }, [rigState.canEditBones, rigState.firstBoneId, selectedBoneId, transformTarget]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;

      const key = event.key.toLowerCase();
      let handled = true;

      switch (key) {
        case 'w':
          if (activeTarget === 'whole') {
            setTransformMode('translate');
          }
          break;
        case 'e':
          if (activeTarget === 'whole') {
            setTransformMode('rotate');
          }
          break;
        case 'r':
          if (activeTarget === 'whole') {
            setTransformMode('scale');
          }
          break;
        case '1':
          enterBoneMode();
          break;
        case '2':
          enterWholeMode('translate');
          break;
        case 'escape':
          setSelectedBoneId(null);
          break;
        case 'h':
        case '?':
          setShowShortcuts((current) => !current);
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTarget, enterBoneMode, enterWholeMode]);

  const statusText = rigState.canEditBones
    ? selectedBoneId
      ? `Bone: ${selectedBoneId}`
      : 'Bone mode: select a visible joint handle'
    : rigState.message || 'Whole mannequin transform';

  return (
    <div className="w-[600px] h-[800px] bg-[#0a0a0a] rounded-2xl overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/5">
      <button
        onClick={() => setShowShortcuts((current) => !current)}
        className="absolute right-4 top-4 z-20 rounded-xl border border-zinc-700 bg-black/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-200"
      >
        Shortcuts
      </button>

      {rigState.canEditBones && activeTarget === 'bone' && (
        <div className="absolute left-4 top-16 z-20 rounded-2xl border border-sky-300/20 bg-sky-100/10 px-4 py-3 text-xs text-sky-50 backdrop-blur-sm">
          Bone mode is active. The current joint stays highlighted while you rotate it.
        </div>
      )}

      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], zoom: 100 }}
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        onPointerMissed={() => {
          if (activeTarget === 'bone') {
            setSelectedBoneId(null);
          } else {
            enterWholeMode();
          }
        }}
      >
        <Suspense fallback={null}>
          <RiggedMannequin
            keypoints={keypoints}
            backgroundImage={backgroundImage}
            guide={guide}
            initialEditorState={initialEditorState}
            captureMode={captureMode}
            transformMode={transformMode}
            transformTarget={activeTarget}
            selectedBoneId={selectedBoneId}
            onSelectBone={(boneId) => {
              setSelectedBoneId(boneId);
            }}
            onCanvasSelectWhole={() => {
              if (activeTarget === 'whole') {
                enterWholeMode();
              } else {
                setSelectedBoneId(null);
              }
            }}
            onSetDragging={setDragging}
            onUpdateKeypoint={onUpdateKeypoint}
            onEditorStateChange={onEditorStateChange}
            onRigStateChange={setRigState}
          />
          <CaptureBridge
            captureRequestId={captureRequestId}
            enabled={captureMode}
            onCaptured={handleCaptureComplete}
          />
        </Suspense>
        <OrbitControls makeDefault enabled={!dragging} enableRotate={false} />
      </Canvas>

      {showShortcuts && (
        <div className="absolute right-4 top-16 z-20 w-[220px] rounded-2xl border border-white/10 bg-black/70 p-4 text-[11px] text-zinc-200 backdrop-blur-sm">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Shortcuts</div>
          <div className="grid grid-cols-[28px_1fr] gap-y-1">
            <span className="font-mono text-zinc-100">W</span><span>Move whole mannequin</span>
            <span className="font-mono text-zinc-100">E</span><span>Rotate whole mannequin</span>
            <span className="font-mono text-zinc-100">R</span><span>Scale whole mannequin</span>
            <span className="font-mono text-zinc-100">1</span><span>Bone mode</span>
            <span className="font-mono text-zinc-100">2</span><span>Whole mannequin mode</span>
            <span className="font-mono text-zinc-100">Esc</span><span>Clear current selection only</span>
            <span className="font-mono text-zinc-100">H</span><span>Toggle this guide</span>
          </div>
        </div>
      )}

      {rigState.message && (
        <div className="absolute inset-x-4 bottom-14 z-20 rounded-2xl border border-amber-300/20 bg-amber-100/10 px-4 py-3 text-sm text-amber-50 backdrop-blur-sm">
          {rigState.message}
        </div>
      )}

      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-[10px] text-white/35 font-mono uppercase tracking-widest">
          {statusText}
        </div>
      </div>
    </div>
  );
});

useGLTF.preload(MODEL_URL);
