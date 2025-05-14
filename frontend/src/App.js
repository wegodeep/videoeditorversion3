import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactPlayer from "react-player";
import "./App.css";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';

// Icons
import { PlayIcon, PauseIcon, ScissorsIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, 
  ArrowPathIcon, ArrowsRightLeftIcon, DocumentArrowDownIcon, DocumentPlusIcon, 
  DocumentArrowUpIcon, TrashIcon } from "@heroicons/react/24/solid";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const VideoEditor = () => {
  // State management
  const [videoUrl, setVideoUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [clipSegments, setClipSegments] = useState([]);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [thumbnails, setThumbnails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [showProjects, setShowProjects] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // Refs
  const playerRef = useRef(null);
  const timelineRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  // File upload handler
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setLoading(true);
      const objectUrl = URL.createObjectURL(file);
      setVideoUrl(objectUrl);
      setClipSegments([]);
      setProjectName(file.name.split('.')[0]);
      
      // Update the upload progress (for future implementation)
      console.log(`Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // We'll generate thumbnails after the video loads and we know the duration
    }
  };
  
  // Generate thumbnails for the timeline
  const generateThumbnails = useCallback(() => {
    console.log("Generating thumbnails...");
    if (!videoUrl || !duration || !canvasRef.current) {
      console.error("Cannot generate thumbnails: missing required data", { videoUrl, duration, canvas: !!canvasRef.current });
      return;
    }
    
    setLoading(true);
    const thumbnailCount = Math.min(20, Math.ceil(duration));
    const intervalSeconds = duration / thumbnailCount;
    const newThumbnails = [];
    
    console.log(`Generating ${thumbnailCount} thumbnails at ${intervalSeconds}s intervals`);
    
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = "anonymous";
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    let processed = 0;
    
    video.addEventListener('loadeddata', () => {
      const generateThumbnail = (index) => {
        if (index >= thumbnailCount) {
          console.log(`Generated ${newThumbnails.length} thumbnails`);
          setThumbnails(newThumbnails);
          setLoading(false);
          return;
        }
        
        const time = index * intervalSeconds;
        video.currentTime = time;
      };
      
      video.addEventListener('seeked', () => {
        // Draw the current frame to the canvas
        canvas.width = 160;
        canvas.height = 90;
        
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Convert to data URL and save
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          newThumbnails.push({
            time: video.currentTime,
            dataUrl
          });
        } catch (e) {
          console.error("Error generating thumbnail:", e);
        }
        
        processed++;
        
        if (processed < thumbnailCount) {
          generateThumbnail(processed);
        } else {
          setThumbnails(newThumbnails.sort((a, b) => a.time - b.time));
          setLoading(false);
        }
      });
      
      generateThumbnail(0);
    });
    
    video.addEventListener('error', (e) => {
      console.error("Video loading error:", e);
      setLoading(false);
    });
    
    video.load();
  }, [videoUrl, duration]);
  
  // Generate thumbnails when video duration is set
  useEffect(() => {
    if (duration > 0 && videoUrl) {
      generateThumbnails();
    }
  }, [duration, videoUrl, generateThumbnails]);

  // Player controls
  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleProgress = (state) => {
    if (!isDragging) {
      setCurrentTime(state.playedSeconds);
    }
  };

  const handleDuration = (duration) => {
    setDuration(duration);
  };

  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !duration) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const timelineWidth = rect.width;
    const clickedTime = (offsetX / timelineWidth) * duration;
    
    console.log(`Timeline click: offsetX=${offsetX}, width=${timelineWidth}, clickedTime=${clickedTime}`);
    setCurrentTime(clickedTime);
    playerRef.current.seekTo(clickedTime);
  };

  // Timeline drag handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - timelineRef.current.offsetLeft);
    setScrollLeft(timelineRef.current.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - timelineRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed multiplier
    timelineRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom controls
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 0.5, 5);
    console.log(`Zooming in: ${zoom} -> ${newZoom}`);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 0.5, 0.5);
    console.log(`Zooming out: ${zoom} -> ${newZoom}`);
    setZoom(newZoom);
  };

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
      // const response = await axios.get(`${API}/projects`);
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
    setDuration(project.duration || 0);
    setShowProjects(false);
    
    // In a real implementation, we would load the video file from the server
    // For this demo, let's create a mock video URL to demonstrate the UI working
    const mockVideoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
    setVideoUrl(mockVideoUrl);
    
    alert(`Project "${project.name}" loaded.`);
  };

  // Export video (mock functionality)
  const handleExportVideo = () => {
    if (!videoUrl) {
      alert("Please upload a video first");
      return;
    }
    
    if (clipSegments.length === 0) {
      alert("Please create at least one clip segment before exporting");
      return;
    }
    
    if (confirm(`Export video with ${clipSegments.length} clips?`)) {
      setLoading(true);
      
      // Sort segments by time
      const sortedSegments = [...clipSegments].sort((a, b) => a.time - b.time);
      
      console.log("Exporting video with segments:", sortedSegments);
      
      // Mock export process
      setTimeout(() => {
        setLoading(false);
        alert("Video exported successfully! Download will start automatically.");
        
        // In a real implementation, we would redirect to the exported video download
        // or trigger a download programmatically
      }, 3000);
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
              
              {/* Clip segments markers */}
              {clipSegments.map((segment) => (
                <div
                  key={segment.id}
                  className="absolute top-0 h-full border-l-2 border-yellow-500 z-10"
                  style={{ left: `${(segment.time / duration) * 100}%` }}
                >
                  <div className="ml-1 mt-1 text-xs text-yellow-400 bg-gray-800 bg-opacity-70 px-1 rounded">
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
                  className="bg-gray-700 p-2 rounded flex flex-col"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold">{segment.label}</span>
                    <span className="text-xs text-gray-400">{formatTime(segment.time)}</span>
                  </div>
                  
                  <div className="flex justify-between mt-2">
                    <button
                      onClick={() => {
                        setCurrentTime(segment.time);
                        playerRef.current.seekTo(segment.time);
                      }}
                      className="text-blue-400 hover:text-blue-300 p-1"
                      title="Go to clip"
                    >
                      <ArrowPathIcon className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={() => {
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
                      <DocumentArrowUpIcon className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={() => {
                        if (confirm(`Delete clip "${segment.label}"?`)) {
                          const updatedSegments = clipSegments.filter(s => s.id !== segment.id);
                          setClipSegments(updatedSegments);
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