// Cancel any existing speech synthesis
window.speechSynthesis.cancel();

// DOM elements
const video = document.getElementById("video");

// Eye detection variables
const EYE_DETECTION = {
  calibrationMode: true,
  detections: [],
  eyesLastOpenedTime: new Date(),
  shutEyeThreshold: 0.285,
  minEAR: Infinity, // Minimum Eye Aspect Ratio
  maxEAR: 0,        // Maximum Eye Aspect Ratio
  eyesClosedStartTime: 0,
  eyesClosedTime: 0,
  bothEyesClosed: false,
  lastCloseYourEyesTime: 0,
  relaxedThreshold: false
};

// Audio variables
const AUDIO = {
  startTime: 0,
  currentPosition: 0,
  context: null,
  source: null,
  buffer: null,
  fileId: null
};

// Speech synthesis setup
const SPEECH = {
  synth: new SpeechSynthesisUtterance(),
  rate: 1.5,
  pitch: 1
};

// Once voices are loaded, set the default voice
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
  SPEECH.synth.voice = voices[0];
});

// Prevent right-click context menu and keyboard shortcuts
function setupSecurityMeasures() {
  // Prevent right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  
  // Prevent keyboard shortcuts (save, undo, copy)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's' || e.key === 'u' || e.key === 'c') {
        e.preventDefault();
      }
    }
  });
}

// Extract fileId from URL path
function getFileIdFromURL() {
  const pathSegments = window.location.pathname.split('/');
  const fileId = pathSegments[pathSegments.length - 1];
  
  // Return 'default' if no fileId in path or on root
  if (!fileId || fileId === 'listen' || fileId === '') {
    return 'default';
  }
  
  return fileId;
}

// Initialize audio file
async function initAudio() {
  try {
    // Create audio context
    AUDIO.context = new (window.AudioContext || window.webkitAudioContext)();
    
    // Resume audio context (required for mobile browsers)
    if (AUDIO.context.state === 'suspended') {
      await AUDIO.context.resume();
    }
    
    // Disable audio worklets to prevent recording
    if (AUDIO.context.audioWorklet) {
      AUDIO.context.audioWorklet.addModule = () => Promise.reject('Audio worklets disabled');
    }
    
    // Load audio file using /audio/:fileId endpoint
    console.log("Loading audio file with fileId:", AUDIO.fileId);
    
    const audioResponse = await fetch(`/audio/${AUDIO.fileId}`);
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to load audio file: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    const audioArrayBuffer = await audioResponse.arrayBuffer();
    AUDIO.buffer = await AUDIO.context.decodeAudioData(audioArrayBuffer);
    console.log("Audio initialized successfully, buffer duration:", AUDIO.buffer.duration);
  } catch (error) {
    console.error("Error initializing audio:", error);
    AUDIO.context = null;
    AUDIO.buffer = null;
  }
}

// Play audio from the current position
function playAudio(buffer, volume = 0.5) {
  if (!AUDIO.context || !buffer) {
    console.log("Cannot play audio: audioContext or buffer not initialized");
    return null;
  }
  
  // Ensure audio context is running (required for mobile)
  if (AUDIO.context.state === 'suspended') {
    AUDIO.context.resume().then(() => {
      console.log("Audio context resumed");
    }).catch(error => {
      console.error("Failed to resume audio context:", error);
    });
  }
  
  const source = AUDIO.context.createBufferSource();
  const gainNode = AUDIO.context.createGain();
  
  source.buffer = buffer;
  gainNode.gain.value = volume;
  
  source.connect(gainNode);
  gainNode.connect(AUDIO.context.destination);
  
  // Start from current position
  console.log("Starting audio from position:", AUDIO.currentPosition, "buffer duration:", buffer.duration);
  try {
    source.start(0, AUDIO.currentPosition);
    console.log("Audio started successfully");
  } catch (error) {
    console.error("Failed to start audio:", error);
    return null;
  }
  
  return { source, gainNode };
}

// Stop audio
function stopAudio(source) {
  if (source) {
    source.source.stop();
  }
}

// EAR calculation
function calculateEAR(eyeLandmarks) {
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

// Check if an eye is closed based on EAR threshold
function isEyeClosed(eyeLandmarks, relaxed = false) {
  return calculateEAR(eyeLandmarks) < EYE_DETECTION.shutEyeThreshold + relaxed * 0.015;
}

// Speech synthesis
function speak(text) {
  console.log("Attempting to say:", text);

  // Check if speech synthesis is supported
  if (!window.speechSynthesis) {
    console.error("Speech synthesis not supported");
    return;
  }
  
  // Cancel any existing speech
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
    if (SPEECH.synth.voice) {
      utterance.voice = SPEECH.synth.voice;
      console.log("Using voice:", SPEECH.synth.voice.name);
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

// Start webcam
function startWebcam() {
  return navigator.mediaDevices
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
      console.error("Error starting webcam:", error);
    });
}

// Start face detection once video is ready, with detection running every 100ms
async function startFaceDetection() {
  // Wait for video to be ready
  if (video.readyState < 2) {
    await new Promise((resolve) => {
      video.onloadeddata = () => {
        resolve();
      };
    });
  }

  // Create canvas for face detection overlay
  const canvas = faceapi.createCanvasFromMedia(video);
  document.body.append(canvas);
  
  // Set canvas size to match video dimensions
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  // Main detection loop - runs every 100ms
  setInterval(async () => {
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Detect faces with all features
    EYE_DETECTION.detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors()
      .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(EYE_DETECTION.detections, displaySize);

    // Clear canvas and apply blur to video
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    video.style.filter = 'blur(3px)';
    
    // Process detected faces
    if (EYE_DETECTION.detections.length > 0) {
      if (EYE_DETECTION.calibrationMode) {
        handleCalibrationMode(resizedDetections);
      } else {
        handleListeningMode();
      }
    }
  }, 100);
}

// Calibrate EAR threshold to user's eye shape
function handleCalibrationMode(resizedDetections) {
  document.getElementById("title").innerHTML = "blink! blink!";

  // Draw face detection overlay
  faceapi.draw.drawDetections(canvas, resizedDetections);
  faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

  document.getElementById("title").style.visibility = "visible";
  document.getElementById("bottomNote").innerHTML = "<i>TAP or CLICK</i><p>to listen</p> ";
  
  // Update EAR thresholds during calibration
  const leftEyeEAR = calculateEAR(EYE_DETECTION.detections[0].landmarks.getLeftEye());
  const rightEyeEAR = calculateEAR(EYE_DETECTION.detections[0].landmarks.getRightEye());
  
  EYE_DETECTION.minEAR = Math.min(EYE_DETECTION.minEAR, leftEyeEAR, rightEyeEAR);
  EYE_DETECTION.maxEAR = Math.max(EYE_DETECTION.maxEAR, leftEyeEAR, rightEyeEAR);

  // Update shut eye threshold based on calibration
  EYE_DETECTION.shutEyeThreshold = Math.max(0.285, EYE_DETECTION.minEAR + 0.015);

  // Listen for user interaction to exit calibration
  ['click', 'touchstart', 'keydown'].forEach(eventType => {
    document.addEventListener(eventType, () => {
      EYE_DETECTION.calibrationMode = false;
      document.body.classList.remove("dark-mode");
      document.getElementById("title").innerHTML = "close your eyes";
    });
  });
}

// Listening mode
function handleListeningMode() {
  window.speechSynthesis.cancel();
  document.getElementById("bottomNote").innerHTML = "";
  document.getElementById("title").innerHTML = "close your eyes";

  // Check if both eyes are closed
  const leftEyeClosed = isEyeClosed(EYE_DETECTION.detections[0].landmarks.getLeftEye(), EYE_DETECTION.relaxedThreshold);
  const rightEyeClosed = isEyeClosed(EYE_DETECTION.detections[0].landmarks.getRightEye(), EYE_DETECTION.relaxedThreshold);
  const bothEyesClosed = leftEyeClosed && rightEyeClosed;
  
  EYE_DETECTION.relaxedThreshold = bothEyesClosed;

  if (bothEyesClosed) {
    // Eyes closed - play audio
    console.log("both eyes closed, playing audio");
    video.style.filter = 'grayscale(0%) blur(3px)';
    document.getElementById("title").style.visibility = "hidden";

    // Start audio if not already playing
    if (!AUDIO.source && AUDIO.context && AUDIO.buffer) {
      console.log("Creating new audio source, audioContext state:", AUDIO.context.state);
      AUDIO.source = playAudio(AUDIO.buffer, 0.5);
    } else if (!AUDIO.context) {
      console.log("Audio context not initialized");
    } else if (!AUDIO.buffer) {
      console.log("Audio buffer not loaded");
    }

    // Track time eyes have been closed
    if (EYE_DETECTION.eyesClosedStartTime === 0 && AUDIO.context) {
      EYE_DETECTION.eyesClosedStartTime = AUDIO.context.currentTime;
    }
    if (AUDIO.context) {
      EYE_DETECTION.eyesClosedTime = AUDIO.context.currentTime - EYE_DETECTION.eyesClosedStartTime;
    }
  } else {
    // Eyes open - stop audio
    if (EYE_DETECTION.eyesClosedStartTime !== 0) {
      AUDIO.currentPosition += EYE_DETECTION.eyesClosedTime;
      EYE_DETECTION.eyesClosedStartTime = 0;
    }
    console.log("eyes open, stopping audio");
    video.style.filter = 'grayscale(100%) blur(3px)';
    document.getElementById("title").style.visibility = "visible";
    EYE_DETECTION.eyesLastOpenedTime = new Date();
    
    if (AUDIO.source) {
      stopAudio(AUDIO.source);
      AUDIO.source = null;
    }
  }
}

// Initialize audio file and start face detection
async function initializeAudioFile() {
  try {
    // Get fileId from URL
    AUDIO.fileId = getFileIdFromURL();
    console.log("Audio file initialized with fileId:", AUDIO.fileId);
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Show the title
    document.getElementById('title').style.display = 'flex';
    document.getElementById("title").style.visibility = "visible";

    if (isMobile) {
      await handleMobileInitialization();
    } else {
      await handleDesktopInitialization();
    }

    await startFaceDetection();
    
  } catch (error) {
    console.error("Error initializing audio file:", error);
  }
}

// Mobile-specific initialization (asks user to put in headphones)
async function handleMobileInitialization() {
  // Show mobile-specific message
  document.getElementById('title').innerHTML = "Ready?<br><i>pop in some headphones 🎧<br>then TAP or CLICK to continue</i>";
  document.getElementById('title').classList.add('ready-message');
  video.style.filter = 'grayscale(100%) blur(3px)';
  
  // Wait for user interaction before proceeding
  await new Promise((resolve) => {
    const handleInteraction = async () => {
      // Remove event listeners
      ['click', 'touchstart', 'keydown'].forEach(eventType => {
        document.removeEventListener(eventType, handleInteraction);
      });
      
      // Provide voice instructions
      allVoicesObtained.then((voices) =>
        speak(
          "Please wait a few seconds for models to load." +
          " When you see your facial features detected, blink slowly for 5 seconds" +
          " to help the camera calibrate to your eye shape." +
          " Then, click or tap any key to toggle calibration mode off."
        )
      );

      // Change message to indicate loading
      video.style.filter = 'grayscale(0%) blur(3px)';
      document.getElementById('title').innerHTML = 'W A I T';
      document.getElementById('title').classList.remove('ready-message');
      
      // Initialize audio
      if (!AUDIO.context) {
        console.log("Initializing audio...");
        try {
          await initAudio();
          console.log("Audio initialization complete");
        } catch (error) {
          console.error("Failed to initialize audio:", error);
        }
      }
      
      resolve();
    };
    
    // Add event listeners for user interaction
    ['click', 'touchstart', 'keydown'].forEach(eventType => {
      document.addEventListener(eventType, handleInteraction, { once: true });
    });
  });
}

// Desktop-specific initialization
async function handleDesktopInitialization() {
  document.getElementById('title').innerHTML = 'W A I T';
  
  // Provide voice instructions
  allVoicesObtained.then((voices) =>
    speak(
      "Please wait a few seconds for models to load." +
      " When you see your facial features detected, blink slowly for 5 seconds" +
      " to help the camera calibrate to your eye shape." +
      " Then, click or tap any key to toggle calibration mode off."
    )
  );
  
  // Start listening for user interaction to initialize audio
  ['click', 'touchstart', 'keydown'].forEach(eventType => {
    document.addEventListener(eventType, async () => {
      if (!AUDIO.context) {
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
}

// Setup security measures
setupSecurityMeasures();

// Load face detection models and start application
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




