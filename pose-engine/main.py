import cv2
import mediapipe as mp
import numpy as np
import requests
import os
import traceback
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

app = FastAPI(title="3D Pose Engine (Modern Tasks API)")

# 절대 경로 설정을 위해 파일 위치 기준 경로 계산
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(BASE_DIR, 'pose_landmarker_heavy.task')

class PoseRequest(BaseModel):
    imageUrl: str

def create_pose_landmarker():
    if not os.path.exists(model_path):
        print(f"Error: Model not found at {model_path}")
        return None
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.2,
        min_pose_presence_confidence=0.2,
        min_tracking_confidence=0.2,
        output_segmentation_masks=False
    )
    return vision.PoseLandmarker.create_from_options(options)

# 초기화
landmarker = None
try:
    landmarker = create_pose_landmarker()
    if landmarker:
        print(f"Successfully loaded model from {model_path}")
except Exception as e:
    print(f"Failed to initialize PoseLandmarker: {e}")
    traceback.print_exc()

def calc_mid_coords(p1, p2, weight=0.5):
    return {
        "x": float(p1.x * (1 - weight) + p2.x * weight),
        "y": float(p1.y * (1 - weight) + p2.y * weight),
        "z": float(p1.z * (1 - weight) + p2.z * weight),
    }

@app.post("/api/v1/extract-pose")
async def extract_pose(request: PoseRequest):
    global landmarker
    if landmarker is None:
        # 모델 재시도
        landmarker = create_pose_landmarker()
        if landmarker is None:
            return {
                "label": "mock_3d_task_fallback", 
                "message": "Model file not found, returning fallback data.",
                "keypoints": [{"name": "nose", "x": 0.0, "y": 0.0, "z": 0.0, "confidence": 0.9}]
            }

    try:
        # 로컬 파일 경로인 경우 처리
        if os.path.exists(request.imageUrl):
            image = cv2.imread(request.imageUrl)
            if image is None:
                raise HTTPException(status_code=400, detail="Failed to read local image file.")
        else:
            # 웹 URL인 경우 처리
            resp = requests.get(request.imageUrl, timeout=10)
            resp.raise_for_status()
            
            image_data = np.asarray(bytearray(resp.content), dtype="uint8")
            image = cv2.imdecode(image_data, cv2.IMREAD_COLOR)
            
        if image is None:
            raise HTTPException(status_code=400, detail="Failed to decode image.")

        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
        
        detection_result = landmarker.detect(mp_image)
        
        if not detection_result.pose_world_landmarks:
            raise HTTPException(status_code=404, detail="No pose detected in image.")

        landmarks = detection_result.pose_world_landmarks[0]
        keypoints = []

        names = [
            "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
            "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow",
            "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index",
            "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
            "left_heel", "right_heel", "left_foot_index", "right_foot_index"
        ]

        for i, lm in enumerate(landmarks):
            keypoints.append({
                "name": names[i] if i < len(names) else f"kp_{i}",
                "x": float(lm.x), "y": float(lm.y), "z": float(lm.z), "confidence": float(lm.visibility)
            })

        # Extra coords
        l_shoulder, r_shoulder = landmarks[11], landmarks[12]
        l_hip, r_hip = landmarks[23], landmarks[24]
        
        neck = calc_mid_coords(l_shoulder, r_shoulder)
        pelvis = calc_mid_coords(l_hip, r_hip)
        spine = calc_mid_coords(l_shoulder, r_shoulder, weight=0.5) # simplified for example
        # Re-calculate spine properly using neck and pelvis
        spine_actual = {
            "x": (neck["x"] + pelvis["x"]) / 2,
            "y": (neck["y"] + pelvis["y"]) / 2,
            "z": (neck["z"] + pelvis["z"]) / 2,
        }

        keypoints.extend([
            {"name": "neck", **neck, "confidence": float(min(l_shoulder.visibility, r_shoulder.visibility))},
            {"name": "pelvis", **pelvis, "confidence": float(min(l_hip.visibility, r_hip.visibility))},
            {"name": "spine", **spine_actual, "confidence": float(min(l_shoulder.visibility, r_shoulder.visibility, l_hip.visibility, r_hip.visibility))}
        ])

        return {"label": "mediapipe_3d_task", "keypoints": keypoints}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error during pose extraction: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
