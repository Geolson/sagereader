// SageReader Application Logic

// 1. Configure PDF.js Global Worker
const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 2. Database configuration (IndexedDB for storing PDFs/text files locally)
const DB_NAME = 'SageReaderDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';
let dbInstance = null;

// Preset Classic E-Book for first-time use
const ALICE_IN_WONDERLAND_PRESET = {
  name: "Alice_in_Wonderland_Chapter1.txt",
  size: "4.2 KB (Vintage Classic)",
  type: "text",
  data: new Blob([
    `CHAPTER I. Down the Rabbit-Hole\n\n` +
    `Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”\n\n` +
    `So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.\n\n` +
    `There was nothing so VERY remarkable in that; nor did Alice think it so VERY much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually TOOK A WATCH OUT OF ITS WAISTCOAT-POCKET, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.\n\n` +
    `In another moment down went Alice after it, never once considering how in the world she was to get out again.\n\n` +
    `The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down a very deep well.\n\n` +
    `Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next. First, she tried to look down and make out what she was coming to, but it was too dark to see anything; then she looked at the sides of the well, and noticed that they were filled with cupboards and book-shelves; here and there she saw maps and pictures hung upon pegs. She took down a jar from one of the shelves as she passed; it was labelled “ORANGE MARMALADE”, but to her great disappointment it was empty: she did not like to drop the jar for fear of killing somebody, so managed to put it into one of the cupboards as she fell past it.`
  ], { type: 'text/plain' })
};

// 3. Application State
const state = {
  // Document info
  docType: null,         // 'pdf' or 'text'
  fileName: '',
  fileSize: '',
  
  // Navigation
  currentPage: 1,
  totalPages: 1,
  viewMode: 'reader',    // 'reader' or 'page'
  pagesData: {},         // Cache: { pageNum: { rawText: String, sentences: Array } }
  
  // Text-To-Speech
  isPlaying: false,
  isPaused: false,
  currentSentenceIndex: 0,
  voices: [],
  selectedVoice: null,
  playbackRate: 1.0,
  playbackVolume: 0.8,
  activeUtterance: null,
  
  // Layout Options
  selectedFont: 'serif' // 'serif', 'sans-serif', 'outfit'
};

// 4. Dom Element Cache
const dom = {
  // Navigation / Headers
  body: document.body,
  headerLogo: document.getElementById('header-logo'),
  btnViewReader: document.getElementById('btn-view-reader'),
  btnViewPage: document.getElementById('btn-view-page'),
  btnTheme: document.getElementById('btn-theme'),
  themeMenu: document.getElementById('theme-menu'),
  btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
  sidebar: document.getElementById('sidebar'),
  
  // Library Shelf
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  libraryListUl: document.getElementById('library-list-ul'),
  btnClearLibrary: document.getElementById('btn-clear-library'),
  
  // Structure & Page Nav
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  currentPageInput: document.getElementById('current-page-input'),
  totalPagesText: document.getElementById('total-pages'),
  pagesListUl: document.getElementById('pages-list-ul'),
  
  // Settings Panel
  voiceSelect: document.getElementById('voice-select'),
  voiceBadge: document.getElementById('voice-badge'),
  fontSelect: document.getElementById('font-select'),
  
  // Workspaces
  welcomeView: document.getElementById('welcome-view'),
  btnGetStarted: document.getElementById('btn-get-started'),
  viewerPane: document.getElementById('viewer-pane'),
  readerView: document.getElementById('reader-view'),
  readerContentBox: document.getElementById('reader-content-box'),
  pageView: document.getElementById('page-view'),
  pdfCanvas: document.getElementById('pdf-canvas'),
  
  // Control Deck
  controlDeck: document.getElementById('control-deck'),
  timelineSliderTrack: document.getElementById('timeline-slider-track'),
  timelineProgress: document.getElementById('timeline-progress'),
  timelineHandle: document.getElementById('timeline-handle'),
  timeCurrent: document.getElementById('time-current'),
  timeTotal: document.getElementById('time-total'),
  deckDocTitle: document.getElementById('deck-doc-title'),
  deckProgressStatus: document.getElementById('deck-progress-status'),
  
  btnSkipPrev: document.getElementById('btn-skip-prev'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  playIcon: document.getElementById('play-icon'),
  pauseIcon: document.getElementById('pause-icon'),
  btnSkipNext: document.getElementById('btn-skip-next'),
  
  btnSpeedIndicator: document.getElementById('btn-speed-indicator'),
  speedSlider: document.getElementById('speed-slider'),
  speedVal: document.getElementById('speed-val'),
  
  btnVolumeIcon: document.getElementById('btn-volume-icon'),
  volumeSvg: document.getElementById('volume-svg'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeVal: document.getElementById('volume-val')
};

// 5. Initialize Application
window.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  initSpeechSynthesis();
  initDragAndDrop();
  await setupDatabase();
  loadSavedPreferences();
});

// 6. Database Operations (IndexedDB)
async function setupDatabase() {
  dbInstance = await new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => resolve(null);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
  });

  // Pre-load Alice in Wonderland if database is brand new and empty
  if (dbInstance) {
    const books = await getBooksFromDB();
    if (books.length === 0) {
      await saveBookToDB(ALICE_IN_WONDERLAND_PRESET.name, ALICE_IN_WONDERLAND_PRESET.size, ALICE_IN_WONDERLAND_PRESET.type, ALICE_IN_WONDERLAND_PRESET.data);
    }
  }

  await renderBookshelf();
}

function saveBookToDB(name, size, type, dataBlob) {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve(false);
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ name, size, type, data: dataBlob, savedAt: Date.now() });
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

function getBooksFromDB() {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve([]);
    const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = (e) => {
      // Sort by save date descending
      const books = e.target.result || [];
      books.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      resolve(books);
    };
    request.onerror = () => resolve([]);
  });
}

function getBookFromDB(name) {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve(null);
    const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(name);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = () => resolve(null);
  });
}

function deleteBookFromDB(name) {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve(false);
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

function clearBooksFromDB() {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve(false);
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

// 7. Render Bookshelf Shelf UI
async function renderBookshelf() {
  dom.libraryListUl.innerHTML = '';
  const books = await getBooksFromDB();

  if (books.length === 0) {
    dom.libraryListUl.innerHTML = '<li class="empty-library-msg">Shelf is empty</li>';
    return;
  }

  books.forEach((book) => {
    const li = document.createElement('li');
    li.className = `library-book-item ${state.fileName === book.name ? 'active' : ''}`;
    li.dataset.name = book.name;

    // File Book Icon representation
    const iconDiv = document.createElement('div');
    iconDiv.className = 'book-icon-wrapper';
    iconDiv.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>
    `;
    li.appendChild(iconDiv);

    // Book Details
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'book-details';
    
    const title = document.createElement('span');
    title.className = 'book-title-text';
    title.textContent = book.name;
    title.title = book.name;
    detailsDiv.appendChild(title);

    const size = document.createElement('span');
    size.className = 'book-size-text';
    size.textContent = book.size;
    detailsDiv.appendChild(size);

    li.appendChild(detailsDiv);

    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'book-delete-btn';
    deleteBtn.title = 'Remove from library';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${book.name}" from your local library?`)) {
        await deleteBookFromDB(book.name);
        if (state.fileName === book.name) {
          unloadDocument();
        }
        await renderBookshelf();
      }
    });
    
    li.appendChild(deleteBtn);

    // Click to Load Book Event
    li.addEventListener('click', () => {
      if (state.fileName !== book.name) {
        loadBook(book);
      }
    });

    dom.libraryListUl.appendChild(li);
  });
}

// 8. Load & Render Selected Book from storage
async function loadBook(book) {
  stopSpeech();
  
  state.fileName = book.name;
  state.fileSize = book.size;
  state.docType = book.type;
  state.pagesData = {};
  state.currentPage = 1;
  
  dom.deckDocTitle.textContent = state.fileName;
  dom.dropzone.classList.add('hidden');
  
  try {
    if (book.type === 'pdf') {
      const arrayBuffer = await readBlobAsArrayBuffer(book.data);
      await loadPDFFromArrayBuffer(arrayBuffer);
    } else {
      const text = await readBlobAsText(book.data);
      loadTXTFromText(text);
    }
    
    // Unhide panels
    dom.welcomeView.classList.add('hidden');
    dom.viewerPane.classList.remove('hidden');
    dom.controlDeck.classList.remove('hidden');
    
    setViewMode(state.viewMode);
    await displayPage(1);
    buildPageList();
    await renderBookshelf();
  } catch (err) {
    console.error("Failed to load library book:", err);
    alert("Error loading this book from local storage.");
  }
}

// Helper methods to read blobs
function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

function readBlobAsText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

// Initialize Speech
function initSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    alert("Sorry, your browser does not support Speech Synthesis.");
    dom.voiceSelect.innerHTML = '<option value="">Not supported in browser</option>';
    return;
  }

  const loadVoices = () => {
    state.voices = window.speechSynthesis.getVoices();
    populateVoiceDropdown();
  };

  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// Populates and filters voices
function populateVoiceDropdown() {
  dom.voiceSelect.innerHTML = '';
  
  if (state.voices.length === 0) {
    dom.voiceSelect.innerHTML = '<option value="">No voices available</option>';
    return;
  }

  const englishVoices = state.voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  const otherVoices = state.voices.filter(v => !v.lang.toLowerCase().startsWith('en'));
  
  const femaleVoiceKeywords = ['google', 'aria', 'jenny', 'zira', 'samantha', 'hazel', 'female', 'natural'];
  
  const sortedEnglish = [...englishVoices].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aMatch = femaleVoiceKeywords.some(kw => aName.includes(kw));
    const bMatch = femaleVoiceKeywords.some(kw => bName.includes(kw));
    
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });

  const allVoicesSorted = [...sortedEnglish, ...otherVoices];
  let autoSelectedVoice = null;

  allVoicesSorted.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    
    let displayName = voice.name;
    const isFemaleKeyword = femaleVoiceKeywords.some(kw => voice.name.toLowerCase().includes(kw));
    if (isFemaleKeyword) {
      displayName += ' ✨ (Recommended Female)';
      if (!autoSelectedVoice && voice.lang.toLowerCase().startsWith('en')) {
        autoSelectedVoice = voice;
      }
    }
    
    option.textContent = `${displayName} [${voice.lang}]`;
    dom.voiceSelect.appendChild(option);
  });

  if (!autoSelectedVoice && sortedEnglish.length > 0) {
    autoSelectedVoice = sortedEnglish[0];
  } else if (!autoSelectedVoice && allVoicesSorted.length > 0) {
    autoSelectedVoice = allVoicesSorted[0];
  }

  if (autoSelectedVoice) {
    dom.voiceSelect.value = autoSelectedVoice.voiceURI;
    state.selectedVoice = autoSelectedVoice;
    dom.voiceBadge.textContent = `Active: ${autoSelectedVoice.name.replace(/Microsoft|Google/gi, '').trim()}`;
  }
}

// Load settings from storage
function loadSavedPreferences() {
  const savedTheme = localStorage.getItem('sagereader-theme') || 'sepia'; // default to warm sepia vintage theme!
  const savedFont = localStorage.getItem('sagereader-font') || 'serif'; // default to vintage serif!
  
  // Set theme dropdown active option
  dom.themeMenu.querySelectorAll('.theme-option').forEach(o => {
    if (o.getAttribute('data-theme') === savedTheme) {
      o.classList.add('active');
    } else {
      o.classList.remove('active');
    }
  });

  dom.body.className = '';
  dom.body.classList.add(`theme-${savedTheme}`);
  updateThemeIcon(savedTheme === 'dark');

  // Font setup
  state.selectedFont = savedFont;
  dom.fontSelect.value = savedFont;
  updateReaderFontClass();
}

function updateReaderFontClass() {
  // Clear previous font classes
  dom.readerContentBox.className = 'reader-content-box';
  dom.readerContentBox.classList.add(`font-${state.selectedFont}`);
}

// 9. Attach UI Event Listeners
function initEventListeners() {
  // Logo Navigate Home Event
  dom.headerLogo.addEventListener('click', () => {
    unloadDocument();
  });

  // Theme selectors
  dom.btnTheme.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.themeMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    dom.themeMenu.classList.remove('show');
  });

  dom.themeMenu.addEventListener('click', (e) => {
    const option = e.target.closest('.theme-option');
    if (!option) return;

    dom.themeMenu.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');

    dom.body.className = '';
    const themeName = option.getAttribute('data-theme');
    dom.body.classList.add(`theme-${themeName}`);
    localStorage.setItem('sagereader-theme', themeName);
    
    updateThemeIcon(themeName === 'dark');
  });

  // Font Selection Event
  dom.fontSelect.addEventListener('change', () => {
    state.selectedFont = dom.fontSelect.value;
    localStorage.setItem('sagereader-font', state.selectedFont);
    updateReaderFontClass();
  });

  // Clear bookshelf library database
  dom.btnClearLibrary.addEventListener('click', async () => {
    if (confirm("Are you sure you want to clear your local Bookshelf library?")) {
      await clearBooksFromDB();
      unloadDocument();
      await renderBookshelf();
    }
  });

  // Mobile sidebar sliders
  dom.btnSidebarToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.sidebar.classList.toggle('open');
  });

  document.querySelector('.reader-workspace').addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      dom.sidebar.classList.remove('open');
    }
  });

  dom.btnGetStarted.addEventListener('click', () => dom.fileInput.click());
  dom.dropzone.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', handleNewFileUploaded);

  dom.btnViewReader.addEventListener('click', () => setViewMode('reader'));
  dom.btnViewPage.addEventListener('click', () => setViewMode('page'));

  dom.btnPrevPage.addEventListener('click', () => navigatePage(state.currentPage - 1));
  dom.btnNextPage.addEventListener('click', () => navigatePage(state.currentPage + 1));
  
  dom.currentPageInput.addEventListener('change', () => {
    let target = parseInt(dom.currentPageInput.value, 10);
    if (isNaN(target)) target = 1;
    navigatePage(target);
  });

  // Speech Speed Sliders
  dom.speedSlider.addEventListener('input', () => {
    const val = parseFloat(dom.speedSlider.value);
    state.playbackRate = val;
    dom.speedVal.textContent = `${val.toFixed(1)}x`;
    dom.btnSpeedIndicator.textContent = `${val.toFixed(1)}x`;
    if (state.isPlaying && !state.isPaused) {
      speakSentence(state.currentSentenceIndex, true);
    }
  });

  // Speech Volume sliders
  dom.volumeSlider.addEventListener('input', () => {
    const val = parseFloat(dom.volumeSlider.value);
    state.playbackVolume = val;
    dom.volumeVal.textContent = `${Math.round(val * 100)}%`;
    updateVolumeIcon(val);
    if (state.activeUtterance) {
      state.activeUtterance.volume = val;
    }
  });

  dom.btnVolumeIcon.addEventListener('click', () => {
    if (dom.volumeSlider.value > 0) {
      dom.volumeSlider.dataset.lastVol = dom.volumeSlider.value;
      dom.volumeSlider.value = 0;
      state.playbackVolume = 0;
      dom.volumeVal.textContent = 'Muted';
      updateVolumeIcon(0);
    } else {
      const lastVol = dom.volumeSlider.dataset.lastVol || 0.8;
      dom.volumeSlider.value = lastVol;
      state.playbackVolume = parseFloat(lastVol);
      dom.volumeVal.textContent = `${Math.round(lastVol * 100)}%`;
      updateVolumeIcon(parseFloat(lastVol));
    }
    if (state.activeUtterance) {
      state.activeUtterance.volume = state.playbackVolume;
    }
  });

  dom.voiceSelect.addEventListener('change', () => {
    const chosenURI = dom.voiceSelect.value;
    const voiceObj = state.voices.find(v => v.voiceURI === chosenURI);
    if (voiceObj) {
      state.selectedVoice = voiceObj;
      dom.voiceBadge.textContent = `Active: ${voiceObj.name.replace(/Microsoft|Google/gi, '').trim()}`;
      if (state.isPlaying && !state.isPaused) {
        speakSentence(state.currentSentenceIndex, true);
      }
    }
  });

  dom.btnPlayPause.addEventListener('click', togglePlayback);
  dom.btnSkipNext.addEventListener('click', skipNextSentence);
  dom.btnSkipPrev.addEventListener('click', skipPrevSentence);
  dom.timelineSliderTrack.addEventListener('click', handleTimelineSeek);
}

// View mode selectors
function setViewMode(mode) {
  state.viewMode = mode;
  if (mode === 'reader') {
    dom.btnViewReader.classList.add('active');
    dom.btnViewPage.classList.remove('active');
    dom.readerView.classList.remove('hidden');
    dom.pageView.classList.add('hidden');
  } else {
    dom.btnViewReader.classList.remove('active');
    dom.btnViewPage.classList.add('active');
    dom.readerView.classList.add('hidden');
    dom.pageView.classList.remove('hidden');
  }
}

// 10. File Drag and Drop upload listeners
function initDragAndDrop() {
  ['dragenter', 'dragover'].forEach(eventName => {
    dom.dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dom.dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dom.dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dom.dropzone.classList.remove('dragover');
    }, false);
  });

  dom.dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      dom.fileInput.files = files;
      handleNewFileUploaded();
    }
  }, false);
}

// Handle imported files by saving to IndexedDB shelf first
async function handleNewFileUploaded() {
  const file = dom.fileInput.files[0];
  if (!file) return;

  const name = file.name;
  const size = (file.size / 1024).toFixed(1) + ' KB';
  let type = '';

  if (name.endsWith('.pdf')) {
    type = 'pdf';
  } else if (name.endsWith('.txt') || name.endsWith('.md')) {
    type = 'text';
  } else {
    alert("Unsupported file format. Please upload PDF, TXT, or MD documents.");
    return;
  }

  // Save book into database
  await saveBookToDB(name, size, type, file);
  await renderBookshelf();
  
  // Load this newly uploaded book instantly
  const savedBook = await getBookFromDB(name);
  if (savedBook) {
    loadBook(savedBook);
  }
}

// PDF Loader helper logic
function loadPDFFromArrayBuffer(arrayBuffer) {
  return new Promise((resolve, reject) => {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    loadingTask.promise.then(async (pdf) => {
      state.pdfDoc = pdf;
      state.totalPages = pdf.numPages;
      resolve();
    }).catch(reject);
  });
}

// Text Loader helper logic
function loadTXTFromText(text) {
  state.txtContent = text;
  const paragraphs = text
    .split(/\r?\n\r?\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  if (paragraphs.length === 0) {
    paragraphs.push("Empty file.");
  }

  state.totalPages = paragraphs.length;
  
  paragraphs.forEach((p, idx) => {
    const sentences = splitTextIntoSentences(p);
    state.pagesData[idx + 1] = {
      rawText: p,
      sentences: sentences
    };
  });
}

function unloadDocument() {
  stopSpeech();
  state.fileName = '';
  state.fileSize = '';
  state.docType = null;
  state.pagesData = {};
  state.currentPage = 1;
  state.totalPages = 1;
  
  dom.fileInput.value = '';
  dom.welcomeView.classList.remove('hidden');
  dom.viewerPane.classList.add('hidden');
  dom.controlDeck.classList.add('hidden');
  dom.pagesListUl.innerHTML = '<li class="empty-list-msg">No pages loaded</li>';
  renderBookshelf();
}

// 11. Page Rendering and Layout updates
async function displayPage(pageNum) {
  if (pageNum < 1 || pageNum > state.totalPages) return;
  
  state.currentPage = pageNum;
  dom.currentPageInput.value = pageNum;
  dom.totalPagesText.textContent = state.totalPages;
  
  const pageItems = dom.pagesListUl.querySelectorAll('li');
  pageItems.forEach((li, idx) => {
    if (idx + 1 === pageNum) {
      li.classList.add('active');
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      li.classList.remove('active');
    }
  });

  if (!state.pagesData[pageNum]) {
    dom.readerContentBox.innerHTML = '<p class="reader-help-msg animate-fade-in">Extracting page content...</p>';
    if (state.docType === 'pdf') {
      await extractPDFPageText(pageNum);
    }
  }

  renderReaderView();

  if (state.docType === 'pdf') {
    renderCanvasPage(pageNum);
  } else {
    renderTXTCanvasPlaceholder(pageNum);
  }

  updatePlaybackPanelMeta();
}

async function extractPDFPageText(pageNum) {
  try {
    const page = await state.pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    let lastY = null;
    let fullText = '';
    
    textContent.items.forEach((item) => {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
        fullText += '\n';
      } else if (fullText.length > 0 && !fullText.endsWith(' ') && !fullText.endsWith('\n')) {
        fullText += ' ';
      }
      fullText += item.str;
      lastY = item.transform[5];
    });

    const sentences = splitTextIntoSentences(fullText);
    state.pagesData[pageNum] = {
      rawText: fullText,
      sentences: sentences
    };
  } catch (err) {
    console.error("Text extraction failed:", err);
    state.pagesData[pageNum] = {
      rawText: "Failed to extract text from page.",
      sentences: ["Failed to extract text from page."]
    };
  }
}

function splitTextIntoSentences(text) {
  if (!text) return [];
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const abbrev = /\b(mr|mrs|dr|ms|prof|sr|jr|vs|inc|ltd|co|approx|ie|eg|etc|vol|ed|al)\.$/i;
  const tempSentences = [];
  let currentSentence = '';
  
  const words = clean.split(' ');
  words.forEach((word) => {
    if (currentSentence.length > 0) {
      currentSentence += ' ';
    }
    currentSentence += word;
    
    const isSentenceEnd = /[.!?]$/.test(word);
    if (isSentenceEnd) {
      const wordMatch = word.match(/\b([a-zA-Z]+)\.$/);
      const isAbbrev = wordMatch && abbrev.test(wordMatch[0]);
      
      if (!isAbbrev) {
        tempSentences.push(currentSentence.trim());
        currentSentence = '';
      }
    }
  });
  
  if (currentSentence.trim().length > 0) {
    tempSentences.push(currentSentence.trim());
  }

  return tempSentences.filter(s => s.length > 1);
}

function buildPageList() {
  dom.pagesListUl.innerHTML = '';
  
  for (let i = 1; i <= state.totalPages; i++) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = state.docType === 'pdf' ? `Page ${i}` : `Section ${i}`;
    li.appendChild(label);
    
    const preview = document.createElement('small');
    preview.style.color = 'var(--text-muted)';
    preview.style.fontSize = '10px';
    
    if (state.pagesData[i] && state.pagesData[i].sentences.length > 0) {
      const firstSent = state.pagesData[i].sentences[0];
      preview.textContent = firstSent.substring(0, 15) + '...';
    } else {
      preview.textContent = '...';
    }
    li.appendChild(preview);
    
    li.addEventListener('click', () => {
      const playAfterNavigate = state.isPlaying;
      if (state.isPlaying) stopSpeech();
      displayPage(i).then(() => {
        if (playAfterNavigate) {
          state.currentSentenceIndex = 0;
          togglePlayback();
        }
      });
    });
    
    dom.pagesListUl.appendChild(li);
  }
  
  if (dom.pagesListUl.querySelectorAll('li')[state.currentPage - 1]) {
    dom.pagesListUl.querySelectorAll('li')[state.currentPage - 1].classList.add('active');
  }
}

function renderReaderView() {
  dom.readerContentBox.innerHTML = '';
  
  const pageObj = state.pagesData[state.currentPage];
  if (!pageObj || pageObj.sentences.length === 0) {
    dom.readerContentBox.innerHTML = '<p class="reader-help-msg">This page contains no readable text.</p>';
    return;
  }

  pageObj.sentences.forEach((sentenceText, index) => {
    const span = document.createElement('span');
    span.className = 'reader-sentence';
    span.dataset.index = index;
    span.id = `sentence-${index}`;
    
    const words = sentenceText.split(' ');
    words.forEach((wordText, wIdx) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'reader-word';
      wordSpan.textContent = wordText + (wIdx === words.length - 1 ? '' : ' ');
      span.appendChild(wordSpan);
    });

    span.addEventListener('click', (e) => {
      e.stopPropagation();
      state.currentSentenceIndex = index;
      speakSentence(index, true);
    });

    dom.readerContentBox.appendChild(span);
  });

  if (state.isPlaying) {
    highlightSentenceElement(state.currentSentenceIndex);
  }
}

async function renderCanvasPage(pageNum) {
  try {
    const page = await state.pdfDoc.getPage(pageNum);
    const canvas = dom.pdfCanvas;
    const containerWidth = dom.pageView.clientWidth - 40;
    const baseViewport = page.getViewport({ scale: 1.0 });
    const scale = containerWidth / baseViewport.width;
    
    const viewport = page.getViewport({ scale: Math.min(scale, 1.8) });
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = { canvasContext: context, viewport: viewport };
    await page.render(renderContext).promise;
  } catch (err) {
    console.error("Canvas rendering failed:", err);
  }
}

function renderTXTCanvasPlaceholder(pageNum) {
  const canvas = dom.pdfCanvas;
  const context = canvas.getContext('2d');
  
  canvas.width = 600;
  canvas.height = 800;
  
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 600, 800);
  
  context.fillStyle = '#e2e8f0';
  for (let i = 0; i < 20; i++) {
    const lineY = 60 + i * 36;
    context.fillRect(50, lineY, 500, 16);
  }
  
  context.fillStyle = '#b25e29';
  context.font = 'bold 20px Outfit';
  context.textAlign = 'center';
  context.fillText(`Text Document - Section ${pageNum}`, 300, 400);
}

// 12. Audio Control Deck & TTS Execution Loop
function togglePlayback() {
  if (!state.pagesData[state.currentPage] || state.pagesData[state.currentPage].sentences.length === 0) {
    return;
  }

  if (state.isPlaying) {
    if (state.isPaused) {
      window.speechSynthesis.resume();
      state.isPaused = false;
      updatePlaybackUI(true);
    } else {
      window.speechSynthesis.pause();
      state.isPaused = true;
      updatePlaybackUI(false);
    }
  } else {
    speakSentence(state.currentSentenceIndex);
  }
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  state.isPlaying = false;
  state.isPaused = false;
  state.activeUtterance = null;
  updatePlaybackUI(false);
  clearHighlights();
}

function speakSentence(index, forceRestart = false) {
  const pageObj = state.pagesData[state.currentPage];
  if (!pageObj || index < 0 || index >= pageObj.sentences.length) {
    stopSpeech();
    return;
  }

  window.speechSynthesis.cancel();
  
  state.currentSentenceIndex = index;
  state.isPlaying = true;
  state.isPaused = false;
  updatePlaybackUI(true);
  highlightSentenceElement(index);
  updatePlaybackPanelMeta();

  const textToSpeak = pageObj.sentences[index];
  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  state.activeUtterance = utterance;

  utterance.rate = state.playbackRate;
  utterance.volume = state.playbackVolume;
  
  if (state.selectedVoice) {
    utterance.voice = state.selectedVoice;
  }

  utterance.onboundary = (event) => {
    if (event.name === 'word') {
      highlightActiveWord(textToSpeak, event.charIndex);
    }
  };

  utterance.onend = () => {
    if (!state.isPlaying || state.isPaused) return;
    
    const nextIdx = state.currentSentenceIndex + 1;
    if (nextIdx < pageObj.sentences.length) {
      speakSentence(nextIdx);
    } else {
      const nextPage = state.currentPage + 1;
      if (nextPage <= state.totalPages) {
        displayPage(nextPage).then(() => {
          state.currentSentenceIndex = 0;
          speakSentence(0);
        });
      } else {
        stopSpeech();
        alert("Finished reading document.");
      }
    }
  };

  utterance.onerror = (e) => {
    console.error("SpeechSynthesis error:", e);
    if (e.error !== 'interrupted') {
      stopSpeech();
    }
  };

  window.speechSynthesis.speak(utterance);
}

function skipNextSentence() {
  const pageObj = state.pagesData[state.currentPage];
  if (!pageObj) return;

  const nextIdx = state.currentSentenceIndex + 1;
  if (nextIdx < pageObj.sentences.length) {
    speakSentence(nextIdx, true);
  } else {
    const nextPage = state.currentPage + 1;
    if (nextPage <= state.totalPages) {
      displayPage(nextPage).then(() => {
        speakSentence(0, true);
      });
    }
  }
}

function skipPrevSentence() {
  const pageObj = state.pagesData[state.currentPage];
  if (!pageObj) return;

  const prevIdx = state.currentSentenceIndex - 1;
  if (prevIdx >= 0) {
    speakSentence(prevIdx, true);
  } else {
    const prevPage = state.currentPage - 1;
    if (prevPage >= 1) {
      displayPage(prevPage).then(() => {
        const lastIndex = state.pagesData[prevPage].sentences.length - 1;
        speakSentence(lastIndex, true);
      });
    }
  }
}

function highlightSentenceElement(index) {
  clearHighlights();
  const sentenceSpan = document.getElementById(`sentence-${index}`);
  if (sentenceSpan) {
    sentenceSpan.classList.add('highlighted');
    sentenceSpan.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
}

function highlightActiveWord(sentenceText, charIndex) {
  const sentenceSpan = document.getElementById(`sentence-${state.currentSentenceIndex}`);
  if (!sentenceSpan) return;

  const wordSpans = sentenceSpan.querySelectorAll('.reader-word');
  wordSpans.forEach(w => w.classList.remove('active'));

  const words = sentenceText.split(' ');
  let currentCharOffset = 0;
  let wordIdx = -1;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordLen = word.length;
    
    if (charIndex >= currentCharOffset && charIndex < currentCharOffset + wordLen + 1) {
      wordIdx = i;
      break;
    }
    currentCharOffset += wordLen + 1;
  }

  if (wordIdx !== -1 && wordSpans[wordIdx]) {
    wordSpans[wordIdx].classList.add('active');
  }
}

function clearHighlights() {
  dom.readerContentBox.querySelectorAll('.reader-sentence').forEach((el) => {
    el.classList.remove('highlighted');
  });
  dom.readerContentBox.querySelectorAll('.reader-word').forEach((el) => {
    el.classList.remove('active');
  });
}

function navigatePage(pageNum) {
  if (pageNum < 1 || pageNum > state.totalPages) return;
  const wasPlaying = state.isPlaying;
  if (wasPlaying) stopSpeech();
  
  displayPage(pageNum).then(() => {
    if (wasPlaying) {
      state.currentSentenceIndex = 0;
      togglePlayback();
    }
  });
}

function updatePlaybackPanelMeta() {
  const pageObj = state.pagesData[state.currentPage];
  const pageSentsCount = pageObj ? pageObj.sentences.length : 0;
  
  dom.deckProgressStatus.textContent = 
    `Reading: Page ${state.currentPage} of ${state.totalPages} • Sentence ${state.currentSentenceIndex + 1}/${pageSentsCount}`;
  
  if (state.totalPages > 0) {
    const pagePercent = ((state.currentPage - 1) / state.totalPages) * 100;
    const sentencePercent = pageSentsCount > 0 ? (state.currentSentenceIndex / pageSentsCount) * (100 / state.totalPages) : 0;
    const totalPercent = Math.min(pagePercent + sentencePercent, 100);
    
    dom.timelineProgress.style.width = `${totalPercent}%`;
    dom.timelineHandle.style.left = `${totalPercent}%`;
    
    const estimatedMinutesTotal = Math.round(state.totalPages * 1.5);
    const estimatedMinutesCurrent = Math.round((totalPercent / 100) * estimatedMinutesTotal);
    
    dom.timeCurrent.textContent = formatTime(estimatedMinutesCurrent);
    dom.timeTotal.textContent = formatTime(estimatedMinutesTotal);
  }
}

function handleTimelineSeek(e) {
  const rect = dom.timelineSliderTrack.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percentage = clickX / rect.width;
  
  const targetTotalPages = state.totalPages;
  const targetPageFraction = percentage * targetTotalPages;
  let targetPageNum = Math.floor(targetPageFraction) + 1;
  targetPageNum = Math.max(1, Math.min(targetPageNum, targetTotalPages));
  
  const wasPlaying = state.isPlaying;
  if (wasPlaying) stopSpeech();
  
  displayPage(targetPageNum).then(() => {
    const pageObj = state.pagesData[targetPageNum];
    if (pageObj && pageObj.sentences.length > 0) {
      const pageRemainder = targetPageFraction - (targetPageNum - 1);
      const sentenceIdx = Math.floor(pageRemainder * pageObj.sentences.length);
      state.currentSentenceIndex = Math.max(0, Math.min(sentenceIdx, pageObj.sentences.length - 1));
    }
    
    if (wasPlaying) {
      togglePlayback();
    } else {
      updatePlaybackPanelMeta();
      highlightSentenceElement(state.currentSentenceIndex);
    }
  });
}

function formatTime(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function updatePlaybackUI(playing) {
  if (playing) {
    dom.playIcon.classList.add('hidden');
    dom.pauseIcon.classList.remove('hidden');
  } else {
    dom.playIcon.classList.remove('hidden');
    dom.pauseIcon.classList.add('hidden');
  }
}

function updateThemeIcon(isDark) {
  if (isDark) {
    dom.btnTheme.querySelector('svg').innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  } else {
    dom.btnTheme.querySelector('svg').innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
  }
}

function updateVolumeIcon(val) {
  let inner = '';
  if (val === 0) {
    inner = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
  } else if (val < 0.4) {
    inner = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  } else {
    inner = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  }
  dom.volumeSvg.innerHTML = inner;
}
