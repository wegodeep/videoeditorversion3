import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import './App.css';
import {
  PlayIcon,
  PauseIcon,
  ScissorsIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  DocumentPlusIcon,
  DocumentArrowUpIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  TrashIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon
} from '@heroicons/react/24/solid';

// Get API URL from environment
const API = process.env.REACT_APP_BACKEND_URL || '';

const VideoEditor = () => {
  // Video state
  const [videoUrl, setVideoUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [thumbnails, setThumbnails] = useState([]);
  const [projectName, setProjectName] = useState('Untitled Project');

  // Clip state
  const [clipSegments, setClipSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);

  // Effects state
  const [effects, setEffects] = useState([]);
  const [availableFilters, setAvailableFilters] = useState([]);
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);

  // Text overlay state
  const [textOverlays, setTextOverlays] = useState([]);
  const [showTextPanel, setShowTextPanel] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [showProjects, setShowProjects] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportQuality, setExportQuality] = useState('medium');
  const [exportFormat, setExportFormat] = useState('mp4');
  const [exportStatus, setExportStatus] = useState(null);

  // Timeline state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [timelineScroll, setTimelineScroll] = useState(0);

  // Refs
  const playerRef = useRef(null);
  const timelineRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Fetch available filters on mount
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const response = await axios.get(`${API}/api/filters`);
        setAvailableFilters(response.data);
      } catch (error) {
        console.error("Error fetching filters:", error);
      }
    };
    
    fetchFilters();
  }, []);

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      setLoading(true);
      
      // Reset project state
      setProjectName('Untitled Project');
      setClipSegments([]);
      setEffects([]);
      setTextOverlays([]);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload file to server
      const response = await axios.post(`${API}/api/upload-video`, formData);
      console.log("Upload response:", response.data);
      
      // Set video URL
      const videoUrl = `${API}/uploads/${response.data.stored_filename}`;
      setVideoUrl(videoUrl);
      setLoading(false);
    } catch (error) {
      console.error("Error uploading file:", error);
      setLoading(false);
      alert("Failed to upload file. Please try again.");
    }
  };
  
  // Handle video progress
  const handleProgress = useCallback(({ playedSeconds }) => {
    setCurrentTime(playedSeconds);
  }, []);
  
  // Handle video duration
  const handleDuration = useCallback((duration) => {
    setDuration(duration);
    generateThumbnails(duration);
  }, []);
  
  // Generate thumbnails
  const generateThumbnails = useCallback((duration) => {
    if (!playerRef.current || !duration) return;
    
    const count = Math.min(20, Math.ceil(duration / 5));
    const interval = duration / count;
    const thumbnailPromises = [];
    
    for (let i = 0; i < count; i++) {
      const time = i * interval;
      thumbnailPromises.push(captureVideoFrame(time));
    }
    
    Promise.all(thumbnailPromises).then(thumbnails => {
      setThumbnails(thumbnails.filter(Boolean));
    });
  }, []);
  
  // Capture video frame for thumbnail
  const captureVideoFrame = (time) => {
    return new Promise((resolve) => {
      const video = playerRef.current.getInternalPlayer();
      const canvas = canvasRef.current;
      
      if (!video || !canvas) {
        resolve(null);
        return;
      }
      
      // Save current time
      const currentTime = video.currentTime;
      
      // Set video to the time we want to capture
      video.currentTime = time;
      
      // When video is ready at the new time
      const handleSeeked = () => {
        // Set canvas dimensions
        canvas.width = 160;
        canvas.height = 90;
        
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        // Remove event listener
        video.removeEventListener('seeked', handleSeeked);
        
        // Reset video to original time
        video.currentTime = currentTime;
        
        // Resolve with thumbnail data
        resolve({
          time,
          dataUrl
        });
      };
      
      // Add event listener for seeked
      video.addEventListener('seeked', handleSeeked);
      
      // If it takes too long, resolve with null
      setTimeout(() => {
        video.removeEventListener('seeked', handleSeeked);
        resolve(null);
      }, 1000);
    });
  };
  
  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);
  
  // Handle timeline click
  const handleTimelineClick = useCallback((e) => {
    if (!duration || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const containerWidth = timelineRef.current.scrollWidth;
    const scrollLeft = timelineRef.current.scrollLeft;
    
    const clickPositionX = offsetX + scrollLeft;
    const percentage = clickPositionX / containerWidth;
    const newTime = percentage * duration;
    
    setCurrentTime(newTime);
    playerRef.current.seekTo(newTime);
  }, [duration]);
  
  // Handle timeline dragging
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setTimelineScroll(timelineRef.current.scrollLeft);
  }, []);
  
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !timelineRef.current) return;
    
    const dx = e.clientX - dragStartX;
    timelineRef.current.scrollLeft = timelineScroll - dx;
  }, [isDragging, dragStartX, timelineScroll]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  // Handle zoom in/out
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.5, 5));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.5, 0.5));
  }, []);
  
  // Split video at current time
  const handleSplitClick = () => {
    // Add a new segment marker at the current time
    const newSegment = {
      id: uuidv4(),
      time: currentTime,
      label: `Clip ${clipSegments.length + 1}`
    };
    setClipSegments([...clipSegments, newSegment].sort((a, b) => a.time - b.time));
  };
  
  // Add effect to video
  const handleAddEffect = (effectType, effectValue) => {
    const newEffect = {
      id: uuidv4(),
      type: effectType,
      value: effectValue,
      start_time: currentTime,
      end_time: duration
    };
    
    setEffects([...effects, newEffect]);
  };
  
  // Remove effect from video
  const handleRemoveEffect = (effectId) => {
    setEffects(effects.filter(effect => effect.id !== effectId));
  };
  
  // Add text overlay to video
  const handleAddTextOverlay = () => {
    const newText = {
      id: uuidv4(),
      text: "Sample Text",
      x: 10,
      y: 10,
      font_size: 24,
      color: "#FFFFFF",
      start_time: currentTime,
      end_time: currentTime + 5
    };
    
    setTextOverlays([...textOverlays, newText]);
  };
  
  // Update text overlay
  const handleUpdateTextOverlay = (id, updates) => {
    setTextOverlays(textOverlays.map(overlay => 
      overlay.id === id ? { ...overlay, ...updates } : overlay
    ));
  };
  
  // Remove text overlay
  const handleRemoveTextOverlay = (id) => {
    setTextOverlays(textOverlays.filter(overlay => overlay.id !== id));
  };
  
  // Load projects from server
  const loadProjects = useCallback(async () => {
    try {
      // For demo purposes, let's create some mock projects
      setProjects([
        {
          id: "1",
          name: "Demo Project 1",
          segments: [
            {
              id: "segment-1",
              time: 10.5,
              label: "Clip 1"
            },
            {
              id: "segment-2",
              time: 25.2,
              label: "Clip 2"
            }
          ],
          duration: 60
        },
        {
          id: "2",
          name: "Wildlife Documentary",
          segments: [
            {
              id: "segment-3",
              time: 5.7,
              label: "Intro"
            },
            {
              id: "segment-4",
              time: 30.1,
              label: "Animals"
            },
            {
              id: "segment-5",
              time: 45.8,
              label: "Ending"
            }
          ],
          duration: 120
        }
      ]);
      
      // In a real implementation, we would fetch projects from the backend
      // const response = await axios.get(`${API}/api/projects`);
      // setProjects(response.data);
    } catch (error) {
      console.error("Error loading projects:", error);
      alert("Failed to load projects.");
    }
  }, []);
  
  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);
  
  // Save project to server
  const handleSaveProject = async () => {
    if (!videoUrl) {
      alert("Please upload a video first");
      return;
    }
    
    try {
      setLoading(true);
      
      const projectData = {
        name: projectName,
        segments: clipSegments,
        effects: effects,
        text_overlays: textOverlays,
        duration
      };
      
      // For demo purposes, we're not actually uploading the video to the server
      console.log("Saving project:", projectData);
      
      // Mock API call to save project
      // In a real implementation, we would upload the video and save the project
      setTimeout(() => {
        setLoading(false);
        alert("Project saved successfully!");
        loadProjects();
      }, 1000);
    } catch (error) {
      console.error("Error saving project:", error);
      setLoading(false);
      alert("Failed to save project.");
    }
  };
  
  // Load a project
  const handleLoadProject = (project) => {
    setProjectName(project.name);
    setClipSegments(project.segments || []);
    setEffects(project.effects || []);
    setTextOverlays(project.text_overlays || []);
    setDuration(project.duration || 0);
    setShowProjects(false);
    
    // In a real implementation, we would load the video file from the server
    // For this demo, let's create a mock video URL to demonstrate the UI working
    const mockVideoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
    setVideoUrl(mockVideoUrl);
    
    alert(`Project "${project.name}" loaded.`);
  };
  
  // Export video with actual processing
  const handleExportVideo = async () => {
    if (!videoUrl) {
      alert("Please upload a video first");
      return;
    }
    
    if (clipSegments.length === 0) {
      alert("Please create at least one clip segment before exporting");
      return;
    }
    
    setShowExportOptions(true);
  };
  
  // Start export process
  const startExport = async () => {
    try {
      setLoading(true);
      setShowExportOptions(false);
      
      // Get the project ID from the video URL (for demo purposes)
      const projectId = "demo-project"; // In a real app, you would get this from your project data
      
      // Create export request
      const exportRequest = {
        quality: exportQuality,
        format: exportFormat,
        segments_only: false
      };
      
      // Send export request
      // In a production environment, this would make an actual API call
      console.log("Exporting with settings:", exportRequest);
      
      // Mock the API response
      const exportId = uuidv4();
      setExportStatus({
        exportId,
        status: "processing"
      });
      
      // Simulate export progress updates
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        if (progress >= 100) {
          clearInterval(interval);
          setExportStatus({
            exportId,
            status: "completed",
            downloadUrl: `${API}/api/exports/${exportId}/download`
          });
          setLoading(false);
        } else {
          setExportStatus({
            exportId,
            status: "processing",
            progress: `${progress}%`
          });
        }
      }, 1000);
    } catch (error) {
      console.error("Error starting export:", error);
      setLoading(false);
      alert("Failed to start export. Please try again.");
    }
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!videoUrl) return;
      
      // Play/Pause: Space
      if (e.code === 'Space' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        handlePlayPause();
      }
      
      // Split: S
      if (e.code === 'KeyS' && e.ctrlKey) {
        e.preventDefault();
        handleSplitClick();
      }
      
      // Zoom In: +
      if (e.code === 'Equal' && e.shiftKey) {
        e.preventDefault();
        handleZoomIn();
      }
      
      // Zoom Out: -
      if (e.code === 'Minus') {
        e.preventDefault();
        handleZoomOut();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoUrl, handlePlayPause, handleSplitClick, handleZoomIn, handleZoomOut]);
  
  // Format time to MM:SS format
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Get display name for effect
  const getEffectDisplayName = (effect) => {
    if (effect.type === 'filter') {
      const filterInfo = availableFilters.find(f => f.id === effect.value);
      return filterInfo ? filterInfo.name : effect.value;
    } else if (effect.type === 'speed') {
      return `Speed: ${effect.value}x`;
    }
    return 'Unknown Effect';
  };
  
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header / Navigation */}
      <header className="bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
        <div className="flex items-center">
          <h1 className="text-xl font-bold mr-4">VideoEdit Pro</h1>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="bg-gray-700 px-3 py-1 rounded text-sm"
          />
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => fileInputRef.current.click()} 
            className="flex items-center bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm transition"
            disabled={loading}
          >
            <DocumentPlusIcon className="w-4 h-4 mr-2" />
            New Project
          </button>
          <button 
            onClick={() => setShowProjects(true)} 
            className="flex items-center bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded text-sm transition"
            disabled={loading || projects.length === 0}
          >
            <DocumentArrowUpIcon className="w-4 h-4 mr-2" />
            Open Project
          </button>
          <button 
            onClick={handleSaveProject} 
            className={`flex items-center px-3 py-2 rounded text-sm transition ${
              videoUrl ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 cursor-not-allowed'
            }`}
            disabled={!videoUrl || loading}
          >
            {loading ? (
              <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <DocumentArrowUpIcon className="w-4 h-4 mr-2" />
            )}
            Save
          </button>
          <button 
            onClick={handleExportVideo} 
            className={`flex items-center px-3 py-2 rounded text-sm transition ${
              videoUrl && clipSegments.length > 0 ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-600 cursor-not-allowed'
            }`}
            disabled={!videoUrl || clipSegments.length === 0 || loading}
          >
            <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
            Export
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="video/*"
            className="hidden"
          />
        </div>
      </header>
      
      {/* Projects Dialog */}
      {showProjects && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-bold">Open Project</h2>
              <button 
                onClick={() => setShowProjects(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {projects.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {projects.map((project) => (
                    <div 
                      key={project.id} 
                      className="bg-gray-700 p-3 rounded flex justify-between items-center cursor-pointer hover:bg-gray-600"
                      onClick={() => handleLoadProject(project)}
                    >
                      <div>
                        <h3 className="font-medium">{project.name}</h3>
                        <p className="text-xs text-gray-400">
                          {project.segments?.length || 0} clips • Duration: {formatTime(project.duration || 0)}
                        </p>
                      </div>
                      <DocumentArrowDownIcon className="w-5 h-5 text-blue-400" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-400 py-8">No projects found. Save a project first.</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Export Options Dialog */}
      {showExportOptions && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-bold">Export Options</h2>
              <button 
                onClick={() => setShowExportOptions(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Quality</label>
                <div className="grid grid-cols-3 gap-2">
                  {['low', 'medium', 'high'].map((quality) => (
                    <button
                      key={quality}
                      className={`py-2 px-3 rounded text-center text-sm ${
                        exportQuality === quality 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      onClick={() => setExportQuality(quality)}
                    >
                      {quality.charAt(0).toUpperCase() + quality.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {['mp4', 'webm', 'mov'].map((format) => (
                    <button
                      key={format}
                      className={`py-2 px-3 rounded text-center text-sm ${
                        exportFormat === format 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      onClick={() => setExportFormat(format)}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowExportOptions(false)}
                  className="mr-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={startExport}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
                >
                  Start Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Keyboard Shortcuts Dialog */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-bold">Keyboard Shortcuts</h2>
              <button 
                onClick={() => setShowShortcuts(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-y-3">
                <div className="text-gray-300">Play/Pause</div>
                <div className="font-mono bg-gray-700 px-2 py-1 rounded text-sm text-center">Space</div>
                
                <div className="text-gray-300">Split Clip</div>
                <div className="font-mono bg-gray-700 px-2 py-1 rounded text-sm text-center">Ctrl + S</div>
                
                <div className="text-gray-300">Zoom In</div>
                <div className="font-mono bg-gray-700 px-2 py-1 rounded text-sm text-center">+</div>
                
                <div className="text-gray-300">Zoom Out</div>
                <div className="font-mono bg-gray-700 px-2 py-1 rounded text-sm text-center">-</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Video Player */}
        <div className="flex-1 flex justify-center items-center p-4 bg-black relative">
          {videoUrl ? (
            <>
              <ReactPlayer
                ref={playerRef}
                url={videoUrl}
                width="100%"
                height="100%"
                playing={isPlaying}
                onProgress={handleProgress}
                onDuration={handleDuration}
                progressInterval={100}
                controls={false}
                style={{ maxHeight: '70vh' }}
              />
              {loading && (
                <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <svg className="animate-spin h-10 w-10 text-blue-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-blue-500">Processing video...</p>
                  </div>
                </div>
              )}
              
              {/* Show export progress if exporting */}
              {exportStatus && exportStatus.status === 'processing' && (
                <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <svg className="animate-spin h-10 w-10 text-purple-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-purple-500">Exporting video... {exportStatus.progress}</p>
                  </div>
                </div>
              )}
              
              {/* Show download button if export completed */}
              {exportStatus && exportStatus.status === 'completed' && (
                <div className="absolute bottom-4 right-4">
                  <a 
                    href={exportStatus.downloadUrl} 
                    download
                    className="flex items-center bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm transition"
                  >
                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                    Download Exported Video
                  </a>
                </div>
              )}
              
              {/* Text Overlays Preview */}
              {textOverlays.map(overlay => (
                currentTime >= overlay.start_time && currentTime <= overlay.end_time && (
                  <div 
                    key={overlay.id}
                    className="absolute pointer-events-none text-overlay"
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      color: overlay.color,
                      fontSize: `${overlay.font_size}px`
                    }}
                  >
                    {overlay.text}
                  </div>
                )
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400">
              <DocumentPlusIcon className="w-16 h-16 mb-4" />
              <p>Drag and drop a video file or click New Project to begin</p>
            </div>
          )}
        </div>
        
        {/* Video Controls */}
        <div className="bg-gray-800 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handlePlayPause}
              className={`p-2 rounded-full transition ${videoUrl ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 cursor-not-allowed'}`}
              disabled={!videoUrl}
            >
              {isPlaying ? (
                <PauseIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5" />
              )}
            </button>
            <span className="text-sm font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSplitClick}
              className={`flex items-center px-3 py-2 rounded text-sm transition ${
                videoUrl ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={!videoUrl}
            >
              <ScissorsIcon className="w-4 h-4 mr-2" />
              Split
            </button>
            
            <button
              onClick={() => setShowEffectsPanel(!showEffectsPanel)}
              className={`flex items-center px-3 py-2 rounded text-sm transition ${
                videoUrl ? 'bg-pink-600 hover:bg-pink-700' : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={!videoUrl}
            >
              <PaintBrushIcon className="w-4 h-4 mr-2" />
              Effects
            </button>
            
            <button
              onClick={() => setShowTextPanel(!showTextPanel)}
              className={`flex items-center px-3 py-2 rounded text-sm transition ${
                videoUrl ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={!videoUrl}
            >
              <PencilSquareIcon className="w-4 h-4 mr-2" />
              Text
            </button>
            
            <button
              onClick={handleZoomOut}
              className={`p-2 rounded transition ${
                videoUrl && zoom > 0.5 ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={!videoUrl || zoom <= 0.5}
            >
              <MagnifyingGlassMinusIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomIn}
              className={`p-2 rounded transition ${
                videoUrl && zoom < 5 ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={!videoUrl || zoom >= 5}
            >
              <MagnifyingGlassPlusIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition ml-2"
              title="Keyboard Shortcuts"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 8a2 2 0 00-2-2h-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v1H9V5a1 1 0 00-1-1H6a1 1 0 00-1 1v1H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V8zm-2 6H4V8h12v6z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Effects Panel */}
        {showEffectsPanel && (
          <div className="bg-gray-800 border-t border-gray-700 p-3">
            <h3 className="text-sm font-semibold mb-2">Video Effects</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="text-sm font-medium mb-1 w-full">Filters:</div>
              {availableFilters.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => handleAddEffect('filter', filter.id)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs transition"
                  title={filter.description}
                >
                  {filter.name}
                </button>
              ))}
            </div>
            
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="text-sm font-medium mb-1 w-full">Speed:</div>
              {[0.5, 0.75, 1.25, 1.5, 2].map(speed => (
                <button
                  key={speed}
                  onClick={() => handleAddEffect('speed', speed)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs transition"
                >
                  {speed}x
                </button>
              ))}
            </div>
            
            {effects.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium mb-1">Applied Effects:</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {effects.map(effect => (
                    <div key={effect.id} className="bg-gray-700 p-2 rounded flex justify-between items-center">
                      <span className="text-xs">{getEffectDisplayName(effect)}</span>
                      <button
                        onClick={() => handleRemoveEffect(effect.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Text Overlay Panel */}
        {showTextPanel && (
          <div className="bg-gray-800 border-t border-gray-700 p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">Text Overlays</h3>
              <button
                onClick={handleAddTextOverlay}
                className="bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded text-xs transition"
              >
                Add Text
              </button>
            </div>
            
            {textOverlays.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {textOverlays.map(overlay => (
                  <div key={overlay.id} className="bg-gray-700 p-3 rounded">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium text-sm" style={{ color: overlay.color }}>
                        {overlay.text}
                      </div>
                      <button
                        onClick={() => handleRemoveTextOverlay(overlay.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="mb-2">
                      <label className="block text-xs text-gray-400 mb-1">Text</label>
                      <input
                        type="text"
                        value={overlay.text}
                        onChange={(e) => handleUpdateTextOverlay(overlay.id, { text: e.target.value })}
                        className="bg-gray-800 px-2 py-1 rounded w-full text-sm"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Position X (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={overlay.x}
                          onChange={(e) => handleUpdateTextOverlay(overlay.id, { x: parseFloat(e.target.value) })}
                          className="bg-gray-800 px-2 py-1 rounded w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Position Y (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={overlay.y}
                          onChange={(e) => handleUpdateTextOverlay(overlay.id, { y: parseFloat(e.target.value) })}
                          className="bg-gray-800 px-2 py-1 rounded w-full text-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Font Size</label>
                        <input
                          type="number"
                          min="8"
                          max="72"
                          value={overlay.font_size}
                          onChange={(e) => handleUpdateTextOverlay(overlay.id, { font_size: parseInt(e.target.value) })}
                          className="bg-gray-800 px-2 py-1 rounded w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Color</label>
                        <input
                          type="color"
                          value={overlay.color}
                          onChange={(e) => handleUpdateTextOverlay(overlay.id, { color: e.target.value })}
                          className="bg-gray-800 p-0 rounded w-full h-7"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Start Time</label>
                        <input
                          type="number"
                          min="0"
                          max={duration}
                          step="0.1"
                          value={overlay.start_time}
                          onChange={(e) => handleUpdateTextOverlay(overlay.id, { start_time: parseFloat(e.target.value) })}
                          className="bg-gray-800 px-2 py-1 rounded w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">End Time</label>
                        <input
                          type="number"
                          min={overlay.start_time}
                          max={duration}
                          step="0.1"
                          value={overlay.end_time}
                          onChange={(e) => handleUpdateTextOverlay(overlay.id, { end_time: parseFloat(e.target.value) })}
                          className="bg-gray-800 px-2 py-1 rounded w-full text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-3 text-sm">No text overlays added yet. Click "Add Text" to create one.</p>
            )}
          </div>
        )}
        
        {/* Timeline */}
        <div 
          ref={timelineRef}
          className="bg-gray-800 border-t border-gray-700 h-32 overflow-x-auto"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {videoUrl && (
            <div 
              className="relative h-full"
              style={{ width: `${duration * 100 * zoom}px`, minWidth: '100%' }} 
              onClick={handleTimelineClick}
            >
              {/* Time markers */}
              {[...Array(Math.ceil(duration))].map((_, index) => (
                <div 
                  key={index} 
                  className="absolute top-0 h-full border-l border-gray-600 text-xs text-gray-400"
                  style={{ left: `${(index / duration) * 100}%` }}
                >
                  <div className="ml-1 mt-1">{formatTime(index)}</div>
                </div>
              ))}
              
              {/* Thumbnails */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gray-700 opacity-80">
                <div className="flex h-full">
                  {thumbnails.map((thumbnail, index) => (
                    <div 
                      key={index}
                      className="relative flex-shrink-0 h-full cursor-pointer"
                      style={{ 
                        width: `${100 / thumbnails.length}%`,
                        backgroundImage: `url(${thumbnail.dataUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentTime(thumbnail.time);
                        playerRef.current.seekTo(thumbnail.time);
                      }}
                    >
                      <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-white bg-black bg-opacity-50">
                        {formatTime(thumbnail.time)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Effect markers */}
              {effects.map((effect) => (
                <div
                  key={effect.id}
                  className="absolute top-24 h-4 bg-pink-500 opacity-50 z-10"
                  style={{ 
                    left: `${(effect.start_time / duration) * 100}%`,
                    width: `${((effect.end_time || duration) - effect.start_time) / duration * 100}%`
                  }}
                  title={getEffectDisplayName(effect)}
                />
              ))}
              
              {/* Text overlay markers */}
              {textOverlays.map((overlay) => (
                <div
                  key={overlay.id}
                  className="absolute top-20 h-4 bg-indigo-500 opacity-50 z-10"
                  style={{ 
                    left: `${(overlay.start_time / duration) * 100}%`,
                    width: `${(overlay.end_time - overlay.start_time) / duration * 100}%`
                  }}
                  title={overlay.text}
                />
              ))}
              
              {/* Clip segments markers */}
              {clipSegments.map((segment) => (
                <div
                  key={segment.id}
                  className={`absolute top-0 h-full border-l-2 z-10 ${
                    selectedSegmentId === segment.id ? 'border-blue-500' : 'border-yellow-500'
                  }`}
                  style={{ left: `${(segment.time / duration) * 100}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSegmentId(segment.id === selectedSegmentId ? null : segment.id);
                  }}
                >
                  <div className={`ml-1 mt-1 text-xs bg-gray-800 bg-opacity-70 px-1 rounded ${
                    selectedSegmentId === segment.id ? 'text-blue-400' : 'text-yellow-400'
                  }`}>
                    {segment.label}
                  </div>
                </div>
              ))}
              
              {/* Current time indicator */}
              <div
                className="absolute top-0 h-full border-l-2 border-red-500 z-20"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              >
                <div className="ml-1 mt-1 text-xs text-red-400 bg-gray-800 bg-opacity-70 px-1 rounded">
                  {formatTime(currentTime)}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Hidden canvas for thumbnail generation */}
        <canvas ref={canvasRef} className="hidden"></canvas>
        
        {/* Clips Panel */}
        {clipSegments.length > 0 && (
          <div className="bg-gray-800 border-t border-gray-700 p-3">
            <h3 className="text-sm font-semibold mb-2">Clips ({clipSegments.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {clipSegments.map((segment, index) => (
                <div 
                  key={segment.id}
                  className={`p-2 rounded flex flex-col ${
                    selectedSegmentId === segment.id ? 'bg-blue-900' : 'bg-gray-700'
                  }`}
                  onClick={() => setSelectedSegmentId(segment.id === selectedSegmentId ? null : segment.id)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold">{segment.label}</span>
                    <span className="text-xs text-gray-400">{formatTime(segment.time)}</span>
                  </div>
                  
                  <div className="flex justify-between mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentTime(segment.time);
                        playerRef.current.seekTo(segment.time);
                      }}
                      className="text-blue-400 hover:text-blue-300 p-1"
                      title="Go to clip"
                    >
                      <ArrowPathIcon className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newLabel = prompt("Rename clip:", segment.label);
                        if (newLabel) {
                          const updatedSegments = clipSegments.map(s => 
                            s.id === segment.id ? { ...s, label: newLabel } : s
                          );
                          setClipSegments(updatedSegments);
                        }
                      }}
                      className="text-green-400 hover:text-green-300 p-1"
                      title="Rename clip"
                    >
                      <PencilSquareIcon className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete clip "${segment.label}"?`)) {
                          const updatedSegments = clipSegments.filter(s => s.id !== segment.id);
                          setClipSegments(updatedSegments);
                          if (selectedSegmentId === segment.id) {
                            setSelectedSegmentId(null);
                          }
                        }
                      }}
                      className="text-red-400 hover:text-red-300 p-1"
                      title="Delete clip"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <VideoEditor />
    </div>
  );
}

export default App;