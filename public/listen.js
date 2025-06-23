window.speechSynthesis.cancel();

const video = document.getElementById("video");

var calibration_mode = true;
let detections = [];

// eyes
var eyesLastOpenedTime = new Date();
var SHUT_EYE_THRESHOLD = 0.285;
var minEAR = Infinity;
var maxEAR = 0;
var eyesClosedStartTime = 0;
var eyesClosedTime = 0;
var bothEyesClosed = false;
let lastCloseYourEyesTime = 0;
let relaxedThreshold = false;

// music
let startTime = 0;
let currentPosition = 0;
var synth = new SpeechSynthesisUtterance();
synth.rate = 1.5;
synth.pitch = 1;

// music setup
let audioContext = null;
let audioSource = null;
let audioBuffer = null;

const allVoicesObtained = new Promise(function (resolve, reject) {
  let voices = window.speechSynthesis.getVoices();
  if (voices.length !== 0) {
    console.log("Voices available immediately:", voices.length);
    resolve(voices);
  } else {
    console.log("Waiting for voices to load...");
    window.speechSynthesis.addEventListener("voiceschanged", function () {
      voices = window.speechSynthesis.getVoices();
      console.log("Voices loaded:", voices.length);
      resolve(voices);
    });
  }
});

allVoicesObtained.then((voices) => {
  console.log("Setting voice:", voices[0]?.name || "default");
  synth.voice = voices[0];
});

// Prevent right-click and keyboard shortcuts
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 's' || e.key === 'u' || e.key === 'c') {
            e.preventDefault();
        }
    }
});

// Choose a random audio file
let audioFile = null; // Default file
let fileId = null; // Add fileId variable

// Function to get fileId from URL path
function getFileIdFromURL() {
    // Extract fileId from URL path like /listen/abc123
    const pathSegments = window.location.pathname.split('/');
    const fileId = pathSegments[pathSegments.length - 1];
    
    // If we're on the root path or no fileId in path, use default
    if (!fileId || fileId === 'listen' || fileId === '') {
        return 'default';
    }
    
    return fileId;
}

// Function to initialize audio file selection
async function initializeAudioFile() {
    try {
        // Get fileId from URL parameters
        fileId = getFileIdFromURL();
        audioFile = fileId; // Keep for backward compatibility
        
        console.log("Audio file initialized with fileId:", fileId);

        allVoicesObtained.then((voices) =>
          say(
            "Please wait a few seconds for models to load." +
            " When you see your facial features detected, blink slowly for 5 seconds" +
            " to help the camera calibrate to your eye shape." +
            " Then, click or tap any key to toggle calibration mode off."
          )
        );

        // Show the title
        document.getElementById('title').style.display = 'flex';

        // Start face detection after file selection
        await startFaceDetection();

        // Start listening for user interaction only after file is selected
        ['click', 'touchstart', 'keydown'].forEach(eventType => {
            document.addEventListener(eventType, async () => {
                if (!audioContext) {
                    console.log("Initializing audio...");
                    try {
                        await initAudio();
                        console.log("Audio initialization complete");
                    } catch (error) {
                        console.error("Failed to initialize audio:", error);
                    }
                }
            }, { once: true });
        });
    } catch (error) {
        console.error("Error initializing audio file:", error);
    }
}

// Function to start face detection
async function startFaceDetection() {
  // Wait for video to be ready
  if (video.readyState < 2) {
    await new Promise((resolve) => {
      video.onloadeddata = () => {
        resolve();
      };
    });
  }

  const canvas = faceapi.createCanvasFromMedia(video);
  document.body.append(canvas);
  
  // Set canvas size to match video dimensions
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  // Main detection loop
  setInterval(async () => {
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors()
      .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    video.style.filter = 'blur(3px)';
    
    // If faces detected
    if (detections.length > 0) {
      // CALIBRATION MODE
      if (calibration_mode) {
        document.getElementById("title").innerHTML = "blink! blink!";

        faceapi.draw.drawDetections(canvas, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

        document.getElementById("bottomNote").innerHTML =
          "<i>TAP or CLICK</i><p>to listen</p> ";
        minEAR = Math.min(
          minEAR,
          ear(detections[0].landmarks.getLeftEye()),
          ear(detections[0].landmarks.getRightEye())
        );
        maxEAR = Math.max(
          maxEAR,
          ear(detections[0].landmarks.getLeftEye()),
          ear(detections[0].landmarks.getRightEye())
        );

        // Update SHUT_EYE_THRESHOLD
        SHUT_EYE_THRESHOLD = Math.max(0.285, minEAR + 0.015);

        ['click', 'touchstart', 'keydown'].forEach(eventType => {
          document.addEventListener(eventType, () => {
            calibration_mode = false;

            var element = document.body;
            element.classList.remove("dark-mode");
            document.getElementById("title").innerHTML = "close your eyes";
          });
        });
      } 
      // LISTENING MODE
      else {
          window.speechSynthesis.cancel();
          document.getElementById("bottomNote").innerHTML = "";
          document.getElementById("title").innerHTML = "close your eyes";

          let bothEyesClosed = isEyeClosed(detections[0].landmarks.getLeftEye(), relaxedThreshold) && isEyeClosed(detections[0].landmarks.getRightEye(), relaxedThreshold);      
          relaxedThreshold = bothEyesClosed;

          // When eyes are closed, play audio and display color.
          // When eyes are open, stop audio and display grayscale.
          if (bothEyesClosed) {
            console.log("both eyes closed, playing audio");

            if (!audioSource && audioContext && audioBuffer) {
                console.log("Creating new audio source, audioContext state:", audioContext.state);
                // Handle async playAudio function
                playAudio(audioBuffer, 0.5).then(source => {
                    if (source) {
                        audioSource = source;
                        console.log("Audio source created successfully");
                    } else {
                        console.error("Failed to create audio source");
                    }
                }).catch(error => {
                    console.error("Error playing audio:", error);
                });
            } else if (!audioContext) {
                console.log("Audio context not initialized");
            } else if (!audioBuffer) {
                console.log("Audio buffer not loaded");
            } else if (audioSource) {
                // console.log("Audio source already exists");
            }

            if (eyesClosedStartTime === 0 && audioContext) {
                eyesClosedStartTime = audioContext.currentTime;
            }
            if (audioContext) {
                eyesClosedTime = audioContext.currentTime - eyesClosedStartTime;
            }
          } else {
            if (eyesClosedStartTime !== 0) {
                currentPosition += eyesClosedTime;
                eyesClosedStartTime = 0;
            }
            console.log("both eyes open, stopping audio");
            eyesLastOpenedTime = new Date();
            if (audioSource) {
                stopAudio(audioSource);
                audioSource = null;
            }
          }
      }
    }
  }, 100);
}

// Initialize Web Audio API
async function initAudio() {
    try {
        // Create audio context with proper iOS support
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("Audio context created, state:", audioContext.state);
        
        // iOS requires user interaction to start audio context
        if (audioContext.state === 'suspended') {
            console.log("Audio context suspended, waiting for user interaction...");
            // Create a silent audio buffer to unlock audio context
            const silentBuffer = audioContext.createBuffer(1, 1, 22050);
            const silentSource = audioContext.createBufferSource();
            silentSource.buffer = silentBuffer;
            silentSource.connect(audioContext.destination);
            
            // Resume audio context
            await audioContext.resume();
            console.log("Audio context resumed, new state:", audioContext.state);
        }
        
        // Load audio files using /audio/:fileId endpoint
        console.log("Loading audio file with fileId:", fileId);
        
        const [audioResponse] = await Promise.all([
            fetch(`/audio/${fileId}`)
        ]);
        
        if (!audioResponse.ok) {
            throw new Error(`Failed to load audio file: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        
        const [audioArrayBuffer] = await Promise.all([
            audioResponse.arrayBuffer()
        ]);
        audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer);
        console.log("Audio initialized successfully, buffer duration:", audioBuffer.duration);
    } catch (error) {
        console.error("Error initializing audio:", error);
        audioContext = null;
        audioBuffer = null;
    }
}

// Play audio using Web Audio API
async function playAudio(buffer, volume = 0.5) {
    if (!audioContext || !buffer) {
        console.log("Cannot play audio: audioContext or buffer not initialized");
        return null;
    }
    
    try {
        // iOS requires audio context to be resumed before playing
        if (audioContext.state === 'suspended') {
            console.log("Audio context suspended, resuming...");
            await audioContext.resume();
            console.log("Audio context resumed, new state:", audioContext.state);
        }
        
        // Ensure audio context is running
        if (audioContext.state !== 'running') {
            console.error("Audio context not running, state:", audioContext.state);
            return null;
        }
        
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = buffer;
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Start from current position
        console.log("Starting audio from position:", currentPosition, "buffer duration:", buffer.duration);
        
        // iOS requires immediate start (no delay)
        source.start(0, currentPosition);
        console.log("Audio started successfully");
        
        return { source, gainNode };
    } catch (error) {
        console.error("Failed to start audio:", error);
        return null;
    }
}

// Stop audio
function stopAudio(source) {
    if (source) {
        source.source.stop();
    }
}

// Create blob URLs for audio files
async function createAudioBlobURL(audioPath) {
    const response = await fetch(audioPath);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}
  
// Facial recognition helper functions
function ear(eyeLandmarks) {
    const A = Math.hypot(
      eyeLandmarks[5]._x - eyeLandmarks[1]._x,
      eyeLandmarks[5]._y - eyeLandmarks[1]._y,
      2
    );
  
    const B = Math.sqrt(
      Math.pow(eyeLandmarks[4]._x - eyeLandmarks[2]._x, 2) +
        Math.pow(eyeLandmarks[4]._y - eyeLandmarks[2]._y, 2)
    );
  
    const C = Math.sqrt(
      Math.pow(eyeLandmarks[0]._x - eyeLandmarks[3]._x, 2) +
        Math.pow(eyeLandmarks[0]._y - eyeLandmarks[3]._y, 2)
    );
  
    return (A + B) / (2.0 * C);
  }
  
  function isEyeClosed(eyeLandmarks, relaxed = false) {
    return ear(eyeLandmarks) < SHUT_EYE_THRESHOLD + relaxed * 0.015;
  }
  
  function likeliestExpression(expressions) {
    // filtering false positive
    const maxValue = Math.max(
      ...Object.values(expressions).filter((value) => value <= 1)
    );
    const expressionsKeys = Object.keys(expressions);
    const mostLikely = expressionsKeys.filter(
      (expression) => expressions[expression] === maxValue
    );
    return mostLikely;
  }

  function say(text) {
    console.log("Attempting to say:", text);
  
    // Check if speech synthesis is supported
    if (!window.speechSynthesis) {
      console.error("Speech synthesis not supported");
      return;
    }
    
    // Check if speech synthesis is speaking
    if (window.speechSynthesis.speaking) {
      console.log("Speech synthesis is already speaking, cancelling...");
      window.speechSynthesis.cancel();
    }
    
    // Wait a bit for the cancel to take effect
    setTimeout(() => {
      console.log("Creating new speech utterance");
      
      // Create a new utterance for each speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.3;
      utterance.pitch = 1;
      utterance.volume = 0.4;
      
      // Set voice if available
      if (synth.voice) {
        utterance.voice = synth.voice;
        console.log("Using voice:", synth.voice.name);
      } else {
        console.log("No voice set, using default");
      }
      
      // Add event listeners for debugging
      utterance.onstart = () => console.log("Speech started");
      utterance.onend = () => console.log("Speech ended");
      utterance.onerror = (event) => console.error("Speech error:", event.error);
      
      // Speak the text
      window.speechSynthesis.speak(utterance);
    }, 100);
  }

  function startWebcam() {
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: false,
      })
      .then((stream) => {
        video.srcObject = stream;
        // Wait for video to be ready
        return new Promise((resolve) => {
          video.onloadedmetadata = () => {
            resolve();
          };
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }
  
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // Load models
Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
    faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
    faceapi.nets.faceExpressionNet.loadFromUri("/models"),
]).then(() => {
    startWebcam();
    initializeAudioFile();
});

// Global test function for debugging audio issues
window.testAudio = async function() {
    console.log("Testing audio functionality...");
    
    // Test 1: Check if AudioContext is supported
    if (!window.AudioContext && !window.webkitAudioContext) {
        console.error("AudioContext not supported");
        return;
    }
    
    // Test 2: Create and resume audio context
    const testContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("Audio context created, state:", testContext.state);
    
    if (testContext.state === 'suspended') {
        await testContext.resume();
        console.log("Audio context resumed, new state:", testContext.state);
    }
    
    // Test 3: Try to load a music file using new endpoint
    try {
        const response = await fetch('/audio/default');
        console.log("Audio file fetch response:", response.status, response.ok);
        
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await testContext.decodeAudioData(arrayBuffer);
            console.log("Audio buffer loaded, duration:", buffer.duration);
            
            // Test 4: Try to play audio
            const source = testContext.createBufferSource();
            source.buffer = buffer;
            source.connect(testContext.destination);
            source.start(0);
            console.log("Test audio started successfully");
            
            // Stop after 2 seconds
            setTimeout(() => {
                source.stop();
                testContext.close();
                console.log("Test audio stopped");
            }, 2000);
        }
    } catch (error) {
        console.error("Audio test failed:", error);
    }
};

// Global test function for debugging speech synthesis issues
window.testSpeech = function() {
    console.log("Testing speech synthesis...");
    
    // Test 1: Check if speech synthesis is supported
    if (!window.speechSynthesis) {
        console.error("Speech synthesis not supported");
        return;
    }
    
    console.log("Speech synthesis supported");
    console.log("Available voices:", window.speechSynthesis.getVoices().length);
    console.log("Currently speaking:", window.speechSynthesis.speaking);
    
    // Test 2: Try to speak a simple message
    say("Hello, this is a test of speech synthesis.");
};

// Global test function for debugging iOS audio issues
window.testIOSAudio = async function() {
    console.log("Testing iOS audio functionality...");
    
    try {
        // Test 1: Check if AudioContext is supported
        if (!window.AudioContext && !window.webkitAudioContext) {
            console.error("AudioContext not supported");
            return;
        }
        
        // Test 2: Create audio context
        const testContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("Test audio context created, state:", testContext.state);
        
        // Test 3: Resume audio context (required for iOS)
        if (testContext.state === 'suspended') {
            console.log("Resuming test audio context...");
            await testContext.resume();
            console.log("Test audio context resumed, new state:", testContext.state);
        }
        
        // Test 4: Create a simple beep sound
        const oscillator = testContext.createOscillator();
        const gainNode = testContext.createGain();
        
        oscillator.frequency.value = 440; // A4 note
        oscillator.connect(gainNode);
        gainNode.connect(testContext.destination);
        
        gainNode.gain.setValueAtTime(0.1, testContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, testContext.currentTime + 0.5);
        
        oscillator.start(testContext.currentTime);
        oscillator.stop(testContext.currentTime + 0.5);
        
        console.log("Test beep sound started");
        
        // Clean up after 1 second
        setTimeout(() => {
            testContext.close();
            console.log("Test audio context closed");
        }, 1000);
        
    } catch (error) {
        console.error("iOS audio test failed:", error);
    }
};




