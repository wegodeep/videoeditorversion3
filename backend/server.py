from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import shutil
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime
import json

# Setup directory for video files
ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / 'uploads'
PROJECTS_DIR = ROOT_DIR / 'projects'
EXPORTS_DIR = ROOT_DIR / 'exports'

# Create directories if they don't exist
UPLOAD_DIR.mkdir(exist_ok=True)
PROJECTS_DIR.mkdir(exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)

# Load environment variables if .env file exists
env_file = ROOT_DIR / '.env'
if env_file.exists():
    load_dotenv(env_file)

# In-memory database for projects
projects_db: Dict[str, dict] = {}

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class VideoSegment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    time: float
    label: str

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    video_file: str
    segments: List[VideoSegment] = []
    duration: float
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectCreate(BaseModel):
    name: str
    segments: List[VideoSegment] = []
    duration: float

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    segments: Optional[List[VideoSegment]] = None

# API routes
@api_router.get("/")
async def root():
    return {"message": "Video Editor API"}

@api_router.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file to the server"""
    file_id = str(uuid.uuid4())
    file_location = UPLOAD_DIR / f"{file_id}_{file.filename}"
    
    try:
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        return {
            "filename": file.filename,
            "file_id": file_id,
            "stored_filename": f"{file_id}_{file.filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@api_router.post("/projects", response_model=Project)
async def create_project(video_file: UploadFile = File(...), project_data: str = Form(...)):
    """Create a new video editing project"""
    try:
        # Save the uploaded video
        file_id = str(uuid.uuid4())
        file_location = UPLOAD_DIR / f"{file_id}_{video_file.filename}"
        
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(video_file.file, buffer)
        
        # Parse project data
        project_info = json.loads(project_data)
        
        # Create project object
        project = Project(
            name=project_info.get("name", "Untitled Project"),
            video_file=f"{file_id}_{video_file.filename}",
            segments=project_info.get("segments", []),
            duration=project_info.get("duration", 0)
        )
        
        # Save to in-memory database
        project_dict = project.model_dump()
        project_id = project_dict["id"]
        projects_db[project_id] = project_dict
        
        return project
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")

@api_router.get("/projects", response_model=List[Project])
async def get_projects():
    """Get all projects"""
    return [Project(**project) for project in projects_db.values()]

@api_router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    """Get a project by ID"""
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return Project(**projects_db[project_id])

@api_router.put("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, project_update: ProjectUpdate):
    """Update a project"""
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update fields
    update_data = {k: v for k, v in project_update.model_dump(exclude_unset=True).items()}
    update_data["updated_at"] = datetime.utcnow()
    
    # Perform update
    projects_db[project_id].update(update_data)
    
    # Return updated project
    return Project(**projects_db[project_id])

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project"""
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get the video file path
    video_file = projects_db[project_id].get("video_file")
    if video_file:
        video_path = UPLOAD_DIR / video_file
        if video_path.exists():
            video_path.unlink()
    
    # Delete from in-memory database
    del projects_db[project_id]
    
    return {"message": "Project deleted successfully"}

@api_router.post("/projects/{project_id}/export")
async def export_project(project_id: str):
    """Export a project (mock endpoint for now)"""
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = projects_db[project_id]
    
    # Mock export process - in a real app, this would create a rendered video
    export_id = str(uuid.uuid4())
    export_path = EXPORTS_DIR / f"{export_id}.mp4"
    
    # For demo, we'll just copy the original video
    video_file = project.get("video_file")
    if video_file:
        shutil.copy(UPLOAD_DIR / video_file, export_path)
    
    return {"message": "Export completed", "export_id": export_id}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Serve static files from the uploads directory
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
