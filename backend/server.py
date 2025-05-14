from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import shutil
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Union
import uuid
from datetime import datetime
import json
import subprocess
import asyncio
import base64
from fastapi.responses import StreamingResponse
import tempfile

# Setup directory for video files
ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / 'uploads'
PROJECTS_DIR = ROOT_DIR / 'projects'
EXPORTS_DIR = ROOT_DIR / 'exports'
TEMP_DIR = ROOT_DIR / 'temp'

# Create directories if they don't exist
UPLOAD_DIR.mkdir(exist_ok=True)
PROJECTS_DIR.mkdir(exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

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

class VideoEffect(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # 'filter', 'speed', etc.
    value: Union[str, float]  # filter name or speed value
    start_time: Optional[float] = None
    end_time: Optional[float] = None

class TextOverlay(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    x: float  # Position as percentage (0-100)
    y: float  # Position as percentage (0-100)
    font_size: int = 24
    color: str = "#FFFFFF"
    start_time: float
    end_time: float

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    video_file: str
    segments: List[VideoSegment] = []
    effects: List[VideoEffect] = []
    text_overlays: List[TextOverlay] = []
    duration: float
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectCreate(BaseModel):
    name: str
    segments: List[VideoSegment] = []
    effects: List[VideoEffect] = []
    text_overlays: List[TextOverlay] = []
    duration: float

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    segments: Optional[List[VideoSegment]] = None
    effects: Optional[List[VideoEffect]] = None
    text_overlays: Optional[List[TextOverlay]] = None

class ExportRequest(BaseModel):
    quality: str = "medium"  # low, medium, high
    format: str = "mp4"      # mp4, webm, mov
    segments_only: bool = False  # only export marked segments

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
            effects=project_info.get("effects", []),
            text_overlays=project_info.get("text_overlays", []),
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
async def export_project(project_id: str, export_request: ExportRequest, background_tasks: BackgroundTasks):
    """Export a project with actual video processing"""
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = projects_db[project_id]
    
    # Generate export ID and paths
    export_id = str(uuid.uuid4())
    export_filename = f"{export_id}.{export_request.format}"
    export_path = EXPORTS_DIR / export_filename
    
    # Get the source video path
    video_file = project.get("video_file")
    if not video_file:
        raise HTTPException(status_code=400, detail="No video file associated with this project")
    
    source_path = UPLOAD_DIR / video_file
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    
    # Process in background to avoid blocking the request
    background_tasks.add_task(
        process_video_export,
        project_id=project_id,
        source_path=source_path,
        export_path=export_path,
        export_request=export_request
    )
    
    return {
        "message": "Export started",
        "export_id": export_id,
        "status": "processing",
        "download_url": f"/api/exports/{export_id}/download"
    }

@api_router.get("/exports/{export_id}/status")
async def get_export_status(export_id: str):
    """Check the status of an export"""
    export_path = EXPORTS_DIR / f"{export_id}.mp4"
    
    if export_path.exists():
        return {"status": "completed", "download_url": f"/api/exports/{export_id}/download"}
    else:
        temp_path = TEMP_DIR / f"{export_id}_progress.txt"
        if temp_path.exists():
            with open(temp_path, "r") as f:
                progress = f.read().strip()
            return {"status": "processing", "progress": progress}
        
        return {"status": "not_found"}

@api_router.get("/exports/{export_id}/download")
async def download_export(export_id: str):
    """Download an exported video"""
    # Try to find the export in different formats
    for ext in ["mp4", "webm", "mov"]:
        export_path = EXPORTS_DIR / f"{export_id}.{ext}"
        if export_path.exists():
            return FileResponse(
                path=export_path,
                filename=f"export_{export_id}.{ext}",
                media_type=f"video/{ext}"
            )
    
    raise HTTPException(status_code=404, detail="Export not found")

@api_router.get("/filters")
async def get_available_filters():
    """Get a list of available video filters"""
    filters = [
        {"id": "grayscale", "name": "Grayscale", "description": "Convert video to black and white"},
        {"id": "sepia", "name": "Sepia", "description": "Apply a vintage sepia tone"},
        {"id": "blur", "name": "Blur", "description": "Apply a blur effect"},
        {"id": "sharpen", "name": "Sharpen", "description": "Sharpen the video"},
        {"id": "contrast", "name": "High Contrast", "description": "Increase contrast"},
        {"id": "vintage", "name": "Vintage", "description": "Apply a vintage film effect"},
        {"id": "vignette", "name": "Vignette", "description": "Apply a vignette effect"},
        {"id": "saturate", "name": "Saturate", "description": "Increase color saturation"}
    ]
    return filters

async def process_video_export(project_id: str, source_path: Path, export_path: Path, export_request: ExportRequest):
    """Process video export using ffmpeg"""
    try:
        project = projects_db[project_id]
        segments = project.get("segments", [])
        effects = project.get("effects", [])
        text_overlays = project.get("text_overlays", [])
        
        # Create a temporary file to track progress
        export_id = export_path.stem
        progress_path = TEMP_DIR / f"{export_id}_progress.txt"
        
        with open(progress_path, "w") as f:
            f.write("0%")
        
        # Quality settings
        quality_settings = {
            "low": "-crf 28 -preset ultrafast",
            "medium": "-crf 23 -preset medium",
            "high": "-crf 18 -preset slow"
        }
        
        quality_args = quality_settings.get(export_request.quality, quality_settings["medium"]).split()
        
        # Base command
        cmd = ["ffmpeg", "-y", "-i", str(source_path)]
        
        # Add filters if present
        filter_complex = []
        
        # Video input label
        current_input = "[0:v]"
        
        # Process effects
        effect_mapping = {
            "grayscale": "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3",
            "sepia": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
            "blur": "boxblur=5:1",
            "sharpen": "unsharp=5:5:1.5:5:5:0.0",
            "contrast": "eq=contrast=1.5",
            "vintage": "curves=vintage,vignette",
            "vignette": "vignette=PI/4",
            "saturate": "eq=saturation=1.5"
        }
        
        # Add video effects
        for i, effect in enumerate(effects):
            effect_type = effect.get("type")
            effect_value = effect.get("value")
            
            if effect_type == "filter" and effect_value in effect_mapping:
                filter_str = effect_mapping[effect_value]
                output_label = f"[v{i}]"
                filter_complex.append(f"{current_input}{filter_str}{output_label}")
                current_input = output_label
            
            elif effect_type == "speed":
                # Speed adjustment using setpts filter
                speed = float(effect_value)
                if speed != 1.0:
                    speed_factor = 1.0 / speed
                    output_label = f"[v{i}]"
                    filter_complex.append(f"{current_input}setpts={speed_factor}*PTS{output_label}")
                    current_input = output_label
        
        # Add text overlays
        for i, overlay in enumerate(text_overlays):
            text = overlay.get("text").replace(":", "\\:").replace("'", "\\'")
            x = overlay.get("x", 10)
            y = overlay.get("y", 10)
            font_size = overlay.get("font_size", 24)
            color = overlay.get("color", "#FFFFFF")
            start_time = overlay.get("start_time", 0)
            end_time = overlay.get("end_time", 0)
            
            # Format the drawtext filter
            text_filter = (
                f"drawtext=text='{text}':x={x}*W/100:y={y}*W/100:fontsize={font_size}:"
                f"fontcolor={color}:enable='between(t,{start_time},{end_time})'"
            )
            
            output_label = f"[v{i+len(effects)}]"
            filter_complex.append(f"{current_input}{text_filter}{output_label}")
            current_input = output_label
        
        # Final output label
        if filter_complex:
            # Use the last filter output as final output
            filter_complex[-1] = filter_complex[-1].split("]")[0] + "]"
            cmd.extend(["-filter_complex", ";".join(filter_complex)])
        
        # Quality settings
        cmd.extend(quality_args)
        
        # Output format
        cmd.extend(["-f", export_request.format])
        
        # Output file
        cmd.append(str(export_path))
        
        # Execute the command
        with open(progress_path, "w") as f:
            f.write("Starting export...")
        
        process = subprocess.Popen(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        # Update progress periodically
        while process.poll() is None:
            await asyncio.sleep(1)
            with open(progress_path, "w") as f:
                f.write("Processing...")
        
        # Check for successful completion
        if process.returncode == 0:
            with open(progress_path, "w") as f:
                f.write("100%")
            
            # Clean up progress file
            progress_path.unlink(missing_ok=True)
        else:
            # Log the error
            stderr = process.stderr.read()
            with open(progress_path, "w") as f:
                f.write(f"Error: {stderr[:100]}...")
            
            logging.error(f"Export error: {stderr}")
            
    except Exception as e:
        logging.error(f"Export processing error: {str(e)}")
        with open(progress_path, "w") as f:
            f.write(f"Error: {str(e)}")

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
app.mount("/exports", StaticFiles(directory=str(EXPORTS_DIR)), name="exports")
