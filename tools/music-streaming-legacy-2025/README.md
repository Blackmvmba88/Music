# Music Streaming App

A web application for streaming music via URL using yt-dlp.

## Author

JesusMoran

## Features

- Stream audio from YouTube and other supported platforms
- Real-time waveform visualization
- Clean architecture with separate backend and frontend

## Architecture

```
/backend   - FastAPI server for audio extraction and streaming
/frontend  - Web UI with audio player and waveform canvas
```

## Performance Optimizations

- Audio streaming with chunked transfer for reduced latency
- WebSocket connections for efficient real-time waveform data
- Client-side caching for improved response times
- Lazy loading of audio visualization components

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+ (for frontend development)
- ffmpeg (for audio processing)

### Installation

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
# Open index.html in browser or serve with a static server
```

## License

MIT
