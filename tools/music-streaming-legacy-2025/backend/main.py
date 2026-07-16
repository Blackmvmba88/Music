import asyncio
import subprocess
import struct
import re
from typing import Optional
from urllib.parse import urlparse
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import yt_dlp

app = FastAPI(title="Music Streaming API")

# Compiled regex patterns for URL validation (optimized - compiled once at module load)
URL_PATTERN = re.compile(
    r'^https?://'  # http:// or https://
    r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain
    r'localhost|'  # localhost
    r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # or IP
    r'(?::\d+)?'  # optional port
    r'(?:/?|[/?]\S+)$', re.IGNORECASE
)


def validate_url(url: str) -> bool:
    """Validate URL format before processing with yt-dlp.
    
    This optimized validation prevents expensive yt-dlp calls on invalid URLs.
    """
    if not url or not isinstance(url, str):
        return False
    
    url = url.strip()
    
    # Quick length check
    if len(url) < 10 or len(url) > 2048:
        return False
    
    # Use pre-compiled regex for performance
    if not URL_PATTERN.match(url):
        return False
    
    # Parse URL for additional validation
    try:
        parsed = urlparse(url)
        # Must have scheme and netloc
        if not parsed.scheme or not parsed.netloc:
            return False
        # Scheme must be http or https
        if parsed.scheme not in ('http', 'https'):
            return False
    except Exception:
        return False
    
    return True

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_audio_url(video_url: str) -> Optional[str]:
    """Extract direct audio URL from video URL using yt-dlp."""
    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            return info.get("url")
    except Exception as e:
        print(f"Error extracting audio URL: {e}")
        return None


def get_audio_info(video_url: str) -> Optional[dict]:
    """Get audio info including title and duration."""
    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            return {
                "title": info.get("title", "Unknown"),
                "duration": info.get("duration", 0),
                "url": info.get("url"),
            }
    except Exception as e:
        print(f"Error getting audio info: {e}")
        return None


async def stream_audio_generator(audio_url: str):
    """Stream audio using ffmpeg to convert to mp3."""
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-i", audio_url,
        "-f", "mp3",
        "-acodec", "libmp3lame",
        "-ab", "192k",
        "-",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    
    try:
        while True:
            chunk = await process.stdout.read(8192)
            if not chunk:
                break
            yield chunk
    finally:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Music Streaming API", "version": "1.0.0"}


@app.get("/search")
async def search_music(q: str = Query(..., description="Search query", min_length=1)):
    """Search for music using yt-dlp."""
    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "default_search": "ytsearch10",  # Search YouTube for top 10 results
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # The default_search option already adds the ytsearch prefix
            info = ydl.extract_info(q, download=False)
            
            if not info or "entries" not in info:
                return {"results": []}
            
            results = []
            for entry in info["entries"]:
                if entry:
                    results.append({
                        "id": entry.get("id", ""),
                        "title": entry.get("title", "Unknown"),
                        "url": entry.get("url", ""),
                        "duration": entry.get("duration", 0),
                        "thumbnail": entry.get("thumbnail", ""),
                        "uploader": entry.get("uploader", "Unknown"),
                    })
            
            return {"results": results}
    except Exception as e:
        print(f"Error searching music: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/info")
async def get_info(url: str = Query(..., description="Video URL")):
    """Get audio info from URL."""
    # Validate URL before expensive yt-dlp processing
    if not validate_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL: must be a valid HTTP or HTTPS URL")
    
    info = get_audio_info(url)
    if not info:
        return {"error": "Could not extract audio info"}
    return info


@app.get("/stream")
async def stream_audio(url: str = Query(..., description="Video URL")):
    """Stream audio from URL."""
    # Validate URL before expensive yt-dlp processing
    if not validate_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL: must be a valid HTTP or HTTPS URL")
    
    audio_url = get_audio_url(url)
    if not audio_url:
        return {"error": "Could not extract audio URL"}
    
    return StreamingResponse(
        stream_audio_generator(audio_url),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": "inline",
        }
    )


class WaveformGenerator:
    """Generate waveform data from audio stream."""
    
    def __init__(self, sample_rate: int = 44100, channels: int = 2):
        self.sample_rate = sample_rate
        self.channels = channels
        self.samples_per_chunk = 1024
    
    async def generate_amplitudes(self, audio_url: str, websocket: WebSocket):
        """Stream PCM data and send amplitudes via WebSocket."""
        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i", audio_url,
            "-f", "s16le",  # PCM 16-bit little-endian
            "-acodec", "pcm_s16le",
            "-ar", str(self.sample_rate),
            "-ac", str(self.channels),
            "-",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        
        try:
            bytes_per_sample = 2 * self.channels
            chunk_size = self.samples_per_chunk * bytes_per_sample
            
            while True:
                pcm_data = await process.stdout.read(chunk_size)
                if not pcm_data:
                    break
                
                # Calculate amplitude from PCM data
                samples = struct.unpack(f"<{len(pcm_data) // 2}h", pcm_data)
                
                # Calculate RMS amplitude
                if samples:
                    rms = sum(s * s for s in samples) / len(samples)
                    amplitude = (rms ** 0.5) / 32768.0  # Normalize to 0-1
                    
                    await websocket.send_json({
                        "type": "amplitude",
                        "value": min(amplitude * 2, 1.0),  # Scale for visibility
                    })
                
                await asyncio.sleep(0.02)  # ~50 updates per second
                
        except Exception as e:
            print(f"Error generating waveform: {e}")
        finally:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()


@app.websocket("/ws/waveform")
async def websocket_waveform(websocket: WebSocket, url: str = Query(...)):
    """WebSocket endpoint for real-time waveform data."""
    await websocket.accept()
    
    # Validate URL before expensive yt-dlp processing
    if not validate_url(url):
        await websocket.send_json({"type": "error", "message": "Invalid URL: must be a valid HTTP or HTTPS URL"})
        await websocket.close()
        return
    
    audio_url = get_audio_url(url)
    if not audio_url:
        await websocket.send_json({"type": "error", "message": "Could not extract audio URL"})
        await websocket.close()
        return
    
    await websocket.send_json({"type": "connected", "message": "Waveform stream ready"})
    
    generator = WaveformGenerator()
    
    try:
        await generator.generate_amplitudes(audio_url, websocket)
        await websocket.send_json({"type": "complete"})
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
