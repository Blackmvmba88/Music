// Configuration
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`;

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'ws://localhost:8000'
    : `${WS_PROTOCOL}//${window.location.hostname}:8000`;

// URL validation pattern (optimized - compiled once)
const URL_PATTERN = /^https?:\/\/(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/?|[/?]\S+)$/i;

/**
 * Validate URL format before sending to backend.
 * This optimized validation prevents unnecessary API calls on invalid URLs.
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if URL is valid, false otherwise
 */
function validateUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    url = url.trim();
    
    // Quick length check
    if (url.length < 10 || url.length > 2048) {
        return false;
    }
    
    // Use pre-compiled regex for performance (validates protocol, domain format, etc.)
    return URL_PATTERN.test(url);
}

// DOM Elements
const urlInput = document.getElementById('url-input');
const playBtn = document.getElementById('play-btn');
const audioPlayer = document.getElementById('audio-player');
const waveformCanvas = document.getElementById('waveform-canvas');
const trackTitle = document.getElementById('track-title');
const volumeSlider = document.getElementById('volume-slider');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

// Canvas setup
const ctx = waveformCanvas.getContext('2d');
let amplitudes = [];
const MAX_AMPLITUDES = 100;

// WebSocket connection
let ws = null;
let isPlaying = false;

// Initialize canvas size
function resizeCanvas() {
    const container = waveformCanvas.parentElement;
    waveformCanvas.width = container.clientWidth - 40;
    waveformCanvas.height = 150;
    drawWaveform();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Draw waveform visualization with sinusoidal waves
function drawWaveform() {
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    const centerY = height / 2;
    
    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    
    if (amplitudes.length === 0) {
        // Draw idle state with a flat sine wave
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        
        // Draw a gentle sine wave
        const frequency = 0.02;
        const amplitude = 5;
        for (let x = 0; x <= width; x++) {
            const y = centerY + Math.sin(x * frequency) * amplitude;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Draw "waiting" text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for audio...', width / 2, centerY - 20);
        return;
    }
    
    // Create gradient for the waveform
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(0.5, '#e94560');
    gradient.addColorStop(1, '#ff6b6b');
    
    // Draw sinusoidal wave based on amplitudes
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw the main sine wave
    ctx.beginPath();
    
    const step = width / (MAX_AMPLITUDES - 1); // Adjust step for proper spacing
    const baseFrequency = 0.1;
    
    for (let i = 0; i < MAX_AMPLITUDES; i++) {
        const x = i * step;
        
        // Get amplitude for this position (with interpolation for smoothness)
        let amplitude = 0;
        if (i < amplitudes.length) {
            amplitude = amplitudes[i];
        } else if (amplitudes.length > 0) {
            amplitude = amplitudes[amplitudes.length - 1] * 0.5;
        }
        
        // Create sinusoidal wave with amplitude modulation
        const sineBase = Math.sin(i * baseFrequency);
        const modulatedAmplitude = amplitude * (height / 2 - 20);
        const y = centerY + sineBase * modulatedAmplitude;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    
    // Draw a mirrored wave for visual effect
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < MAX_AMPLITUDES; i++) {
        const x = i * step;
        
        let amplitude = 0;
        if (i < amplitudes.length) {
            amplitude = amplitudes[i];
        } else if (amplitudes.length > 0) {
            amplitude = amplitudes[amplitudes.length - 1] * 0.5;
        }
        
        const sineBase = Math.sin(i * baseFrequency + Math.PI);
        const modulatedAmplitude = amplitude * (height / 4);
        const y = centerY + sineBase * modulatedAmplitude;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    
    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
}

// Animation loop for smooth waveform
function animateWaveform() {
    drawWaveform();
    if (isPlaying) {
        requestAnimationFrame(animateWaveform);
    }
}

// Connect to WebSocket for waveform data
function connectWaveformWS(videoUrl) {
    if (ws) {
        ws.close();
    }
    
    const wsUrl = `${WS_URL}/ws/waveform?url=${encodeURIComponent(videoUrl)}`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'amplitude') {
            amplitudes.push(data.value);
            if (amplitudes.length > MAX_AMPLITUDES) {
                amplitudes.shift();
            }
        } else if (data.type === 'complete') {
            console.log('Waveform stream complete');
        } else if (data.type === 'error') {
            console.error('Waveform error:', data.message);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket closed');
    };
}

// Fetch track info
async function fetchTrackInfo(videoUrl) {
    try {
        const response = await fetch(`${BACKEND_URL}/info?url=${encodeURIComponent(videoUrl)}`);
        const data = await response.json();
        if (data.title) {
            trackTitle.textContent = data.title;
        }
        return data;
    } catch (error) {
        console.error('Error fetching track info:', error);
        return null;
    }
}

// Play audio
async function playAudio() {
    const videoUrl = urlInput.value.trim();
    
    if (!videoUrl) {
        alert('Please enter a video URL');
        return;
    }
    
    // Validate URL before making API calls (optimized - avoids unnecessary requests)
    if (!validateUrl(videoUrl)) {
        alert('Please enter a valid URL');
        return;
    }
    
    // Update UI
    playBtn.disabled = true;
    playBtn.classList.add('loading');
    playBtn.innerHTML = '<span class="play-icon">⏳</span> Loading...';
    trackTitle.textContent = 'Loading...';
    amplitudes = [];
    
    try {
        // Fetch track info
        await fetchTrackInfo(videoUrl);
        
        // Set audio source
        const streamUrl = `${BACKEND_URL}/stream?url=${encodeURIComponent(videoUrl)}`;
        audioPlayer.src = streamUrl;
        audioPlayer.volume = volumeSlider.value / 100;
        
        // Connect WebSocket for waveform
        connectWaveformWS(videoUrl);
        
        // Play audio
        await audioPlayer.play();
        
        isPlaying = true;
        playBtn.innerHTML = '<span class="play-icon">⏸</span> Pause';
        playBtn.disabled = false;
        playBtn.classList.remove('loading');
        
        // Start waveform animation
        animateWaveform();
        
    } catch (error) {
        console.error('Error playing audio:', error);
        trackTitle.textContent = 'Error loading track';
        playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
        playBtn.disabled = false;
        playBtn.classList.remove('loading');
    }
}

// Pause audio
function pauseAudio() {
    audioPlayer.pause();
    isPlaying = false;
    playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
}

// Toggle play/pause
function togglePlayPause() {
    if (isPlaying) {
        pauseAudio();
    } else {
        playAudio();
    }
}

// Search for music
async function searchMusic() {
    const query = searchInput.value.trim();
    
    if (!query) {
        alert('Please enter a search query');
        return;
    }
    
    // Update UI
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="search-icon">⏳</span> Searching...';
    searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Searching...</div>';
    searchResults.classList.add('show');
    
    try {
        const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            displaySearchResults(data.results);
        } else {
            searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No results found</div>';
        }
        
        searchBtn.innerHTML = '<span class="search-icon">🔍</span> Search';
        searchBtn.disabled = false;
        
    } catch (error) {
        console.error('Error searching music:', error);
        searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">Error searching. Please try again.</div>';
        searchBtn.innerHTML = '<span class="search-icon">🔍</span> Search';
        searchBtn.disabled = false;
    }
}

// Display search results
function displaySearchResults(results) {
    searchResults.innerHTML = '';
    
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        // Create elements safely to prevent XSS
        const img = document.createElement('img');
        img.className = 'search-result-thumbnail';
        img.alt = result.title;
        
        // Validate and sanitize thumbnail URL
        if (result.thumbnail && typeof result.thumbnail === 'string' && 
            (result.thumbnail.startsWith('http://') || result.thumbnail.startsWith('https://'))) {
            img.src = result.thumbnail;
        } else {
            img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="60" viewBox="0 0 80 60"%3E%3Crect fill="%23333" width="80" height="60"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23666" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';
        }
        
        img.onerror = function() {
            this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="60" viewBox="0 0 80 60"%3E%3Crect fill="%23333" width="80" height="60"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23666" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';
        };
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'search-result-info';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'search-result-title';
        titleDiv.textContent = result.title; // Safe - uses textContent
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'search-result-meta';
        const duration = result.duration ? formatDuration(result.duration) : '';
        const uploader = result.uploader || 'Unknown';
        metaDiv.textContent = uploader + (duration ? ' • ' + duration : '');
        
        infoDiv.appendChild(titleDiv);
        infoDiv.appendChild(metaDiv);
        
        item.appendChild(img);
        item.appendChild(infoDiv);
        
        item.addEventListener('click', () => {
            const videoUrl = `https://www.youtube.com/watch?v=${result.id}`;
            urlInput.value = videoUrl;
            searchResults.classList.remove('show');
            playAudio();
        });
        
        searchResults.appendChild(item);
    });
}

// Format duration in seconds to MM:SS
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
playBtn.addEventListener('click', togglePlayPause);

searchBtn.addEventListener('click', searchMusic);

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchMusic();
    }
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (!isPlaying) {
            playAudio();
        }
    }
});

volumeSlider.addEventListener('input', () => {
    audioPlayer.volume = volumeSlider.value / 100;
});

audioPlayer.addEventListener('ended', () => {
    isPlaying = false;
    playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
    if (ws) {
        ws.close();
    }
});

audioPlayer.addEventListener('error', (e) => {
    console.error('Audio error:', e);
    isPlaying = false;
    playBtn.innerHTML = '<span class="play-icon">▶</span> Play';
    playBtn.disabled = false;
    playBtn.classList.remove('loading');
    trackTitle.textContent = 'Error loading audio';
});

// Initial draw
drawWaveform();
