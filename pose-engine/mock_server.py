from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Pose Engine Mock")


class PoseRequest(BaseModel):
    imageUrl: str


@app.post("/api/v1/extract-pose")
async def extract_pose(request: PoseRequest):
    # Return a deterministic small set of 3D keypoints for testing
    sample_keypoints = [
        {"name": "nose", "x": 0.0, "y": 0.0, "z": 0.0, "confidence": 0.9},
        {"name": "left_shoulder", "x": -0.2, "y": -0.1, "z": 0.0, "confidence": 0.85},
        {"name": "right_shoulder", "x": 0.2, "y": -0.1, "z": 0.0, "confidence": 0.85},
        {"name": "left_hip", "x": -0.1, "y": 0.4, "z": 0.0, "confidence": 0.8},
        {"name": "right_hip", "x": 0.1, "y": 0.4, "z": 0.0, "confidence": 0.8},
    ]
    return {"label": "mock_3d", "keypoints": sample_keypoints}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
