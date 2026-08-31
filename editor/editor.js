// ---- 險ｭ螳・----
let BPM = 180;
let timesig = 4;
let gridDivision = 4;
let totalMeasures = 50;
let offsetMs = 0;
const basePixelsPerMeasure = 200;
const minPixelsPerMeasure = 100;
const maxPixelsPerMeasure = 800;
const zoomStepPixels = 50;
let pixelsPerMeasure = basePixelsPerMeasure;
const laneCount = 5;
const laneWidth = 100;
const damageLaneCount = 10;
const damageLaneWidth = laneWidth / 2;

// ---- 迥ｶ諷・----
let notes = [];
let tempoChanges = [];
let selectedNoteType = "tap";
let selectedDualLanes = [];
let isDragging = false;
let dragStartPosition = null;
let dragNote = null;
let resizingDamagePoint = null;
let activeDamagePointMenu = null;
let movingNotePart = null;

// ---- 髻ｳ貅・----
let audioContext = null;
let audioBuffer = null;
let audioSource = null;
let isPlaying = false;
let playStartTime = 0;
let playStartMs = 0;
let animationFrameId = null;

// ---- DOM ----
const editorCanvas = document.getElementById("editorCanvas");
const bpmInput = document.getElementById("bpmInput");
const timesigInput = document.getElementById("timesigInput");
const gridInput = document.getElementById("gridInput");
const measuresInput = document.getElementById("measuresInput");
const offsetInput = document.getElementById("offsetInput");
const noteCountEl = document.getElementById("noteCount");
const noteOverlapWarningEl = document.getElementById("noteOverlapWarning");
const audioControls = document.getElementById("audioControls");
const playButton = document.getElementById("playButton");
const stopButton = document.getElementById("stopButton");
const currentTimeEl = document.getElementById("currentTime");
const saveNameInput = document.getElementById("saveNameInput");
const savedProjectSelect = document.getElementById("savedProjectSelect");
const saveProjectButton = document.getElementById("saveProjectButton");
const loadProjectButton = document.getElementById("loadProjectButton");
const restoreAutoSaveButton = document.getElementById("restoreAutoSaveButton");
const deleteProjectButton = document.getElementById("deleteProjectButton");
const importChartFile = document.getElementById("importChartFile");
const damageWidthInput = document.getElementById("damageWidthInput");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomInButton = document.getElementById("zoomInButton");
const zoomValue = document.getElementById("zoomValue");
const undoButton = document.getElementById("undoButton");
const copyStartMeasureInput = document.getElementById("copyStartMeasure");
const copyEndMeasureInput = document.getElementById("copyEndMeasure");
const copyTargetMeasureInput = document.getElementById("copyTargetMeasure");
const copyMeasuresButton = document.getElementById("copyMeasuresButton");
const mirrorCopyMeasuresButton = document.getElementById("mirrorCopyMeasuresButton");
const copyPasteMessage = document.getElementById("copyPasteMessage");
const clearMeasureInput = document.getElementById("clearMeasureInput");
const clearMeasureButton = document.getElementById("clearMeasureButton");
const clearMeasureMessage = document.getElementById("clearMeasureMessage");

const PROJECT_STORAGE_KEY = "chartEditorProjects";
const AUTO_SAVE_STORAGE_KEY = "chartEditorAutoSave";
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;

function captureEditorViewport(viewportAnchorY = editorCanvas.clientHeight / 2) {
  const anchorCanvasY = editorCanvas.scrollTop + viewportAnchorY;
  return {
    viewportAnchorY,
    position: yToPosition(anchorCanvasY)
  };
}

function restoreEditorViewport(anchor) {
  if (!anchor) return;
  const anchorCanvasY = positionToY(anchor.position);
  editorCanvas.scrollTop = anchorCanvasY - anchor.viewportAnchorY;
}

function setEditorZoom(nextPixelsPerMeasure) {
  const clampedPixels = Math.max(
    minPixelsPerMeasure,
    Math.min(maxPixelsPerMeasure, nextPixelsPerMeasure)
  );
  if (clampedPixels === pixelsPerMeasure) return;

  // ズーム前後で、画面最下端に見えている譜面位置を固定する。
  const viewportAnchor = captureEditorViewport(editorCanvas.clientHeight);

  pixelsPerMeasure = clampedPixels;
  renderCanvas();

  restoreEditorViewport(viewportAnchor);
  zoomValue.textContent = Math.round((pixelsPerMeasure / basePixelsPerMeasure) * 100) + "%";
}

zoomOutButton.addEventListener("click", () => {
  setEditorZoom(pixelsPerMeasure - zoomStepPixels);
});

zoomInButton.addEventListener("click", () => {
  setEditorZoom(pixelsPerMeasure + zoomStepPixels);
});

editorCanvas.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();

  const direction = e.deltaY < 0 ? 1 : -1;
  setEditorZoom(pixelsPerMeasure + direction * zoomStepPixels);
}, { passive: false });

function getDamageWidth() {
  return Math.max(1, Math.min(10, Number(damageWidthInput?.value || 2)));
}

function getDamageX(damageLane) {
  return ((damageLane + 0.5) / damageLaneCount).toFixed(2);
}

function getDamageLeftX(damageLane) {
  return (damageLane / damageLaneCount).toFixed(2);
}

function makeDamagePoint(position, damageLane) {
  const width = getDamageWidth();
  return {
    position,
    damageLane: Math.max(0, Math.min(damageLaneCount - width, damageLane)),
    width,
    curve: "linear"
  };
}

function clampDamagePoint(point) {
  point.width = Math.max(1, Math.min(10, Number(point.width || 1)));
  point.damageLane = Math.max(0, Math.min(damageLaneCount - point.width, Number(point.damageLane || 0)));
}

function getNoteStartPosition(note) {
  if (note.type === "damageLong") {
    return [...note.points].sort((a, b) => positionToNumber(a.position) - positionToNumber(b.position))[0]?.position || makePosition(0, 1);
  }

  return note.position;
}

function applyDamageCurve(t, curve) {
  if (curve === "accelerate") return t * t;
  if (curve === "decelerate") return 1 - Math.pow(1 - t, 2);
  if (curve === "sine") {
    return 0.5 + Math.asin(2 * t - 1) / Math.PI;
  }
  if (curve === "cosine") {
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }
  return t;
}

// ---- 蛻晄悄蛹・----
function init({ preserveViewport = false, recordHistory = false } = {}) {
  const viewportAnchor = preserveViewport ? captureEditorViewport() : null;
  if (recordHistory) pushUndoState();

  BPM = Number(bpmInput.value);
  timesig = Number(timesigInput.value);
  gridDivision = Number(gridInput.value);
  totalMeasures = Number(measuresInput.value);
  offsetMs = Number(offsetInput.value);
  renderCanvas();
  restoreEditorViewport(viewportAnchor);
}

bpmInput.addEventListener("change", () => init({ recordHistory: true }));
timesigInput.addEventListener("change", () => init({ preserveViewport: true, recordHistory: true }));
gridInput.addEventListener("change", () => init({ preserveViewport: true, recordHistory: true }));
measuresInput.addEventListener("change", () => init({ preserveViewport: true, recordHistory: true }));
offsetInput.addEventListener("change", () => {
  pushUndoState();
  offsetMs = Number(offsetInput.value);
});

// ---- 蛻・焚菴咲ｽｮ險育ｮ・----
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  return b === 0 ? a : gcd(b, a % b);
}

function makePosition(num, den) {
  if (den === 0) return { num: 0, den: 1 };
  const g = gcd(num, den);
  return {
    num: num / g,
    den: den / g
  };
}

function positionToNumber(position) {
  return position.num / position.den;
}

function samePosition(a, b) {
  return a.num * b.den === b.num * a.den;
}

function comparePosition(a, b) {
  return a.num * b.den - b.num * a.den;
}

function addPositionStep(position) {
  const stepDen = timesig * gridDivision;
  const num = position.num * stepDen + position.den;
  const den = position.den * stepDen;
  const next = makePosition(num, den);

  if (positionToNumber(next) > totalMeasures) {
    return makePosition(totalMeasures, 1);
  }

  return next;
}

function yToPosition(y) {
  const metrics = getChartVisualMetrics();
  const visualOffset = Math.max(0, Math.min(metrics.totalHeight, 20 + metrics.totalHeight - y));
  let measureIndex = metrics.heights.findIndex((height, index) =>
    visualOffset <= metrics.cumulative[index] + height
  );
  if (measureIndex < 0) return makePosition(totalMeasures, 1);
  const height = metrics.heights[measureIndex];
  const fraction = height > 0 ? (visualOffset - metrics.cumulative[measureIndex]) / height : 0;
  const unitsPerMeasure = Math.max(1, Math.round(metrics.timeSignatures[measureIndex] * gridDivision));
  const subdivision = Math.max(0, Math.min(unitsPerMeasure, Math.round(fraction * unitsPerMeasure)));
  return makePosition(measureIndex * unitsPerMeasure + subdivision, unitsPerMeasure);
}

function positionToY(position) {
  const metrics = getChartVisualMetrics();
  const measurePosition = Math.max(0, Math.min(totalMeasures, positionToNumber(position)));
  if (measurePosition >= totalMeasures) return 20;
  const measureIndex = Math.floor(measurePosition);
  const fraction = measurePosition - measureIndex;
  const visualOffset = metrics.cumulative[measureIndex] + metrics.heights[measureIndex] * fraction;
  return 20 + metrics.totalHeight - visualOffset;
}

function positionToMeasureDivision(position) {
  const measureIndex = Math.floor(positionToNumber(position));
  const measure = measureIndex + 1;

  const remainderNum = position.num - measureIndex * position.den;
  const remainderDen = position.den;
  const g = gcd(remainderNum, remainderDen);

  return {
    measure: measure,
    numerator: remainderNum === 0 ? 0 : remainderNum / g,
    denominator: remainderNum === 0 ? 1 : remainderDen / g
  };
}

function getSavedProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || "{}");
  } catch (e) {
    console.error("菫晏ｭ倥ョ繝ｼ繧ｿ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨・", e);
    return {};
  }
}

function setSavedProjects(projects) {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
}

function getCurrentProjectData() {
  return {
    version: 1,
    BPM,
    timesig,
    gridDivision,
    totalMeasures,
    offsetMs,
    notes,
    tempoChanges
  };
}

function getAutoSaveData() {
  try {
    return JSON.parse(localStorage.getItem(AUTO_SAVE_STORAGE_KEY) || "null");
  } catch (e) {
    console.error("Failed to read auto-save data", e);
    return null;
  }
}

function updateAutoSaveRestoreButton() {
  restoreAutoSaveButton.disabled = !getAutoSaveData();
}

function autoSaveProject() {
  if (notes.length === 0) return;

  localStorage.setItem(AUTO_SAVE_STORAGE_KEY, JSON.stringify({
    ...getCurrentProjectData(),
    saveName: saveNameInput.value.trim(),
    autoSavedAt: Date.now()
  }));
  updateAutoSaveRestoreButton();
}

const undoStack = [];
const maxUndoSteps = 100;

function serializeCurrentEditorState() {
  return JSON.stringify(getCurrentProjectData());
}

function updateUndoButton() {
  undoButton.disabled = undoStack.length === 0;
}

function pushUndoState(snapshot = serializeCurrentEditorState()) {
  if (undoStack[undoStack.length - 1] === snapshot) return;
  undoStack.push(snapshot);
  if (undoStack.length > maxUndoSteps) undoStack.shift();
  updateUndoButton();
}

function undoLastEdit() {
  const snapshot = undoStack.pop();
  if (!snapshot) return;
  movingNotePart = null;
  resizingDamagePoint = null;
  activeDamagePointMenu = null;
  isDragging = false;
  dragStartPosition = null;
  dragNote = null;
  applyProjectData(JSON.parse(snapshot), { preserveViewport: true });
  updateUndoButton();
}

undoButton.addEventListener("click", undoLastEdit);

function shiftPositionByMeasures(position, measureDelta) {
  return makePosition(position.num + measureDelta * position.den, position.den);
}

function mirrorCopiedNote(note) {
  if (note.type === "dual") {
    note.lanes = note.lanes.map(lane => laneCount - 1 - lane).sort((a, b) => a - b);
  } else if (note.type === "damageDiamond" || note.type === "damageCircle") {
    const sourceDamageLane = note.damageLane ?? Math.max(
      0,
      Math.min(damageLaneCount - 1, Number(note.lane || 0) * 2 + 1)
    );
    note.damageLane = damageLaneCount - 1 - sourceDamageLane;
  } else if (note.type === "damageLong") {
    note.points.forEach(point => {
      point.damageLane = damageLaneCount - Number(point.width || 1) - Number(point.damageLane || 0);
      clampDamagePoint(point);
    });
  } else if (note.lane !== undefined) {
    note.lane = laneCount - 1 - note.lane;
  }
}

function copyNoteWithMeasureShift(note, measureDelta, mirrorHorizontally = false) {
  const copiedNote = JSON.parse(JSON.stringify(note));

  if (copiedNote.type === "damageLong") {
    copiedNote.points.forEach(point => {
      point.position = shiftPositionByMeasures(point.position, measureDelta);
    });
  } else {
    copiedNote.position = shiftPositionByMeasures(copiedNote.position, measureDelta);
    if (copiedNote.type === "long") {
      copiedNote.endPosition = shiftPositionByMeasures(copiedNote.endPosition, measureDelta);
    }
  }

  if (mirrorHorizontally) mirrorCopiedNote(copiedNote);

  return copiedNote;
}

function getNoteLatestPosition(note) {
  if (note.type === "damageLong") {
    return note.points.reduce(
      (latest, point) => comparePosition(point.position, latest) > 0 ? point.position : latest,
      note.points[0].position
    );
  }
  if (note.type === "long") return note.endPosition;
  return note.position;
}

function copyMeasureRange({ mirrorHorizontally = false } = {}) {
  const startMeasure = Number(copyStartMeasureInput.value);
  const endMeasure = Number(copyEndMeasureInput.value);
  const targetMeasure = Number(copyTargetMeasureInput.value);

  if (
    !Number.isInteger(startMeasure) ||
    !Number.isInteger(endMeasure) ||
    !Number.isInteger(targetMeasure) ||
    startMeasure < 1 ||
    endMeasure < startMeasure ||
    targetMeasure < 1
  ) {
    copyPasteMessage.textContent = "小節番号を確認してください";
    return;
  }

  const rangeStart = startMeasure - 1;
  const rangeEnd = endMeasure;
  const sourceNotes = notes.filter(note => {
    const startPosition = positionToNumber(getNoteStartPosition(note));
    return startPosition >= rangeStart && startPosition < rangeEnd;
  });

  if (sourceNotes.length === 0) {
    copyPasteMessage.textContent = "範囲内にノーツがありません";
    return;
  }

  const viewportAnchor = captureEditorViewport();
  const measureDelta = targetMeasure - startMeasure;
  const copiedNotes = sourceNotes.map(note =>
    copyNoteWithMeasureShift(note, measureDelta, mirrorHorizontally)
  );

  pushUndoState();
  notes.push(...copiedNotes);

  const latestCopiedPosition = Math.max(
    ...copiedNotes.map(note => positionToNumber(getNoteLatestPosition(note)))
  );
  const latestCopiedStartMeasure = Math.max(
    ...copiedNotes.map(note => Math.floor(positionToNumber(getNoteStartPosition(note))) + 1)
  );
  totalMeasures = Math.max(
    totalMeasures,
    Math.ceil(latestCopiedPosition),
    latestCopiedStartMeasure
  );
  measuresInput.value = totalMeasures;

  renderCanvas();
  restoreEditorViewport(viewportAnchor);
  copyPasteMessage.textContent = copiedNotes.length +
    (mirrorHorizontally ? "ノーツを左右反転してコピーしました" : "ノーツをコピーしました");
}

copyMeasuresButton.addEventListener("click", () => copyMeasureRange());
mirrorCopyMeasuresButton.addEventListener("click", () => {
  copyMeasureRange({ mirrorHorizontally: true });
});

function clearNotesInMeasure() {
  const measure = Number(clearMeasureInput.value);

  if (!Number.isInteger(measure) || measure < 1 || measure > totalMeasures) {
    clearMeasureMessage.textContent = `1〜${totalMeasures}の小節番号を入力してください`;
    clearMeasureInput.focus();
    return;
  }

  const rangeStart = measure - 1;
  const rangeEnd = measure;
  const notesToRemove = notes.filter(note => {
    const startPosition = positionToNumber(getNoteStartPosition(note));
    return startPosition >= rangeStart && startPosition < rangeEnd;
  });

  if (notesToRemove.length === 0) {
    clearMeasureMessage.textContent = `${measure}小節目にノーツはありません`;
    return;
  }

  if (!confirm(`${measure}小節目のノーツを${notesToRemove.length}個消去しますか？`)) {
    return;
  }

  const removeSet = new Set(notesToRemove);
  pushUndoState();
  notes = notes.filter(note => !removeSet.has(note));
  activeDamagePointMenu = null;
  renderNotes();
  clearMeasureMessage.textContent = `${measure}小節目のノーツを${notesToRemove.length}個消去しました`;
}

clearMeasureButton.addEventListener("click", clearNotesInMeasure);

function applyProjectData(data, { preserveViewport = false } = {}) {
  const viewportAnchor = preserveViewport ? captureEditorViewport() : null;
  BPM = Number(data.BPM ?? BPM);
  timesig = Number(data.timesig ?? timesig);
  gridDivision = Number(data.gridDivision ?? gridDivision);
  totalMeasures = Number(data.totalMeasures ?? totalMeasures);
  offsetMs = Number(data.offsetMs ?? offsetMs);
  notes = Array.isArray(data.notes) ? data.notes : [];
  tempoChanges = Array.isArray(data.tempoChanges) ? data.tempoChanges : [];

  bpmInput.value = BPM;
  timesigInput.value = timesig;
  gridInput.value = gridDivision;
  measuresInput.value = totalMeasures;
  offsetInput.value = offsetMs;

  renderTempoChangeList();
  renderCanvas();
  restoreEditorViewport(viewportAnchor);
}

function refreshSavedProjectSelect() {
  const projects = getSavedProjects();
  const names = Object.keys(projects).sort();

  savedProjectSelect.innerHTML = "";

  if (names.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved projects";
    savedProjectSelect.appendChild(option);
    return;
  }

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    savedProjectSelect.appendChild(option);
  }
}

function measureDivisionToPosition(measure, divisionText) {
  const [numerator, denominator] = divisionText.split("/").map(Number);
  const measureIndex = Number(measure) - 1;

  return makePosition(
    measureIndex * denominator + numerator,
    denominator
  );
}

function importChartText(text) {
  const lines = text.split("\n").map(line => line.trim()).filter(line => line);

  const importedNotes = [];
  const importedTempoChanges = [];

  let importedBPM = BPM;
  let importedTimesig = timesig;
  let importedOffsetMs = offsetMs;

  for (const line of lines) {
    if (line.startsWith("#")) continue;

    if (line.startsWith("@bpm")) {
      const parts = line.split(",");
      importedBPM = Number(parts[1]);
      continue;
    }

    if (line.startsWith("@timesig")) {
      const parts = line.split(",");
      importedTimesig = Number(parts[1]);
      continue;
    }

    if (line.startsWith("@offset")) {
      const parts = line.split(",");
      importedOffsetMs = Number(parts[1]);
      continue;
    }

    if (line.startsWith("@tempo")) {
      const parts = line.split(",");
      importedTempoChanges.push({
        measure: Number(parts[1]),
        division: parts.length >= 5 ? parts[2] : "0/1",
        bpm: Number(parts.length >= 5 ? parts[3] : parts[2]),
        timesig: Number(parts.length >= 5 ? parts[4] : parts[3])
      });
      continue;
    }

    const parts = line.split(",");

    if (parts[0] === "damageDiamond" || parts[0] === "damageCircle" || parts[0] === "damage" || parts[0] === "bullet") {
      const x = Number(parts[3]);
      importedNotes.push({
        type: parts[0] === "damageDiamond" ? "damageDiamond" : "damageCircle",
        damageLane: Math.max(0, Math.min(damageLaneCount - 1, Math.floor(x * damageLaneCount))),
        position: measureDivisionToPosition(parts[1], parts[2]),
        size: Number(parts[4] || 42)
      });
      continue;
    }

    if (parts[0] === "damageLong") {
      const points = [];
      const stride = (parts.length - 1) % 5 === 0 ? 5 : 4;
      for (let i = 1; i + 3 < parts.length; i += stride) {
        const x = Number(parts[i + 2]);
        points.push({
          position: measureDivisionToPosition(parts[i], parts[i + 1]),
          damageLane: Math.max(0, Math.min(damageLaneCount - 1, Math.floor(x * damageLaneCount))),
          width: Math.max(1, Math.min(10, Number(parts[i + 3] || 2))),
          curve: stride === 5 ? (parts[i + 4] || "linear") : "linear"
        });
      }

      if (points.length >= 2) {
        importedNotes.push({ type: "damageLong", points });
      }
      continue;
    }

    if (line.includes("dual")) {
      const laneText = line.match(/\[(.*?)\]/)?.[1];
      if (!laneText) continue;

      importedNotes.push({
        type: "dual",
        lanes: laneText.split("|").map(Number),
        position: measureDivisionToPosition(parts[0], parts[1])
      });
      continue;
    }

    if (parts.includes("long")) {
      importedNotes.push({
        type: "long",
        lane: Number(parts[2]),
        position: measureDivisionToPosition(parts[0], parts[1]),
        endPosition: measureDivisionToPosition(parts[4], parts[5])
      });
      continue;
    }

    if (parts.length >= 3) {
      importedNotes.push({
        type: "tap",
        lane: Number(parts[2]),
        position: measureDivisionToPosition(parts[0], parts[1])
      });
    }
  }

    let maxMeasure = 1;

  for (const note of importedNotes) {
    const start = positionToMeasureDivision(getNoteStartPosition(note));
    maxMeasure = Math.max(maxMeasure, start.measure);

    if (note.type === "long") {
      const end = positionToMeasureDivision(note.endPosition);
      maxMeasure = Math.max(maxMeasure, end.measure);
    }

    if (note.type === "damageLong") {
      for (const point of note.points) {
        const pointPosition = positionToMeasureDivision(point.position);
        maxMeasure = Math.max(maxMeasure, pointPosition.measure);
      }
    }
  }

  for (const tc of importedTempoChanges) {
    maxMeasure = Math.max(maxMeasure, tc.measure);
  }

  totalMeasures = Math.max(totalMeasures, maxMeasure + 1);

  BPM = importedBPM;
  timesig = importedTimesig;
  offsetMs = importedOffsetMs;
  notes = importedNotes;
  tempoChanges = importedTempoChanges;

  BPM = importedBPM;
  timesig = importedTimesig;
  offsetMs = importedOffsetMs;
  notes = importedNotes;
  tempoChanges = importedTempoChanges;

  bpmInput.value = BPM;
  timesigInput.value = timesig;
  measuresInput.value = totalMeasures;
  offsetInput.value = offsetMs;

  renderTempoChangeList();
  renderCanvas();
}
 
// ---- 繧ｭ繝｣繝ｳ繝舌せ謠冗判 ----
function renderCanvas() {
  const metrics = getChartVisualMetrics();
  const totalHeight = metrics.totalHeight;
  const totalWidth = laneCount * laneWidth;

  editorCanvas.style.height = "";
  editorCanvas.innerHTML = "";

  const spacer = document.createElement("div");
  spacer.style.height = (totalHeight + 40) + "px";
  spacer.style.width = totalWidth + "px";
  spacer.style.pointerEvents = "none";
  editorCanvas.appendChild(spacer);

  for (let i = 0; i < laneCount; i++) {
    const lane = document.createElement("div");
    lane.classList.add("editorLane");
    lane.style.left = (i * laneWidth) + "px";
    lane.style.width = laneWidth + "px";
    lane.style.height = (totalHeight + 40) + "px";
    editorCanvas.appendChild(lane);
  }

  for (let measureIndex = 0; measureIndex < totalMeasures; measureIndex++) {
    const unitsPerMeasure = Math.max(1, Math.round(metrics.timeSignatures[measureIndex] * gridDivision));
    for (let subdivision = 0; subdivision < unitsPerMeasure; subdivision++) {
      const position = makePosition(measureIndex * unitsPerMeasure + subdivision, unitsPerMeasure);
      const line = document.createElement("div");
      if (subdivision === 0) {
        line.classList.add("measureLine");
        const label = document.createElement("span");
        label.classList.add("measureLabel");
        label.textContent = "M" + (measureIndex + 1);
        line.appendChild(label);
      } else if (subdivision % gridDivision === 0) {
        line.classList.add("beatLine");
      } else {
        line.classList.add("gridLine");
      }
      line.style.top = positionToY(position) + "px";
      line.style.width = totalWidth + "px";
      editorCanvas.appendChild(line);
    }
  }

  const finalLine = document.createElement("div");
  finalLine.classList.add("measureLine");
  finalLine.style.top = positionToY(makePosition(totalMeasures, 1)) + "px";
  finalLine.style.width = totalWidth + "px";
  const finalLabel = document.createElement("span");
  finalLabel.classList.add("measureLabel");
  finalLabel.textContent = "M" + (totalMeasures + 1);
  finalLine.appendChild(finalLabel);
  editorCanvas.appendChild(finalLine);

  renderNotes();
  editorCanvas.scrollTop = editorCanvas.scrollHeight;
}

function renderNotes() {
  document
    .querySelectorAll(".editorNote, .editorDamageLongShape, .editorDamageLongPoint")
    .forEach(el => el.remove());
  for (let note of notes) {
    drawNote(note);
  }
  noteCountEl.textContent = "繝弱・繝・焚: " + notes.length;
  updateNoteOverlapWarning();
}

function getOverlappingNoteLocations() {
  const positionCounts = new Map();

  for (const note of notes) {
    if (note.type !== "tap" && note.type !== "long") continue;

    const position = makePosition(note.position.num, note.position.den);
    const key = `${note.lane}:${position.num}/${position.den}`;
    const occupied = positionCounts.get(key);

    if (occupied) {
      occupied.count++;
    } else {
      positionCounts.set(key, {
        lane: note.lane,
        position,
        count: 1
      });
    }
  }

  return [...positionCounts.values()]
    .filter(occupied => occupied.count > 1)
    .sort((a, b) => comparePosition(a.position, b.position) || a.lane - b.lane);
}

function formatOverlapLocation({ position, lane }) {
  const { measure, numerator, denominator } = positionToMeasureDivision(position);
  return `${measure}小節目　${numerator}/${denominator} レーン${lane}`;
}

function updateNoteOverlapWarning() {
  const overlapLocations = getOverlappingNoteLocations();
  noteOverlapWarningEl.hidden = overlapLocations.length === 0;
  noteOverlapWarningEl.textContent = overlapLocations.length === 0
    ? ""
    : `ノーツが重なっています\n${overlapLocations.map(formatOverlapLocation).join("\n")}`;
}

function isNormalNoteToolSelected() {
  return selectedNoteType === "tap" || selectedNoteType === "long" || selectedNoteType === "dual";
}

function beginNotePartMove(e, note, part, point = null) {
  if (e.button !== 0) return;

  const canvasRect = editorCanvas.getBoundingClientRect();
  const pointerX = e.clientX - canvasRect.left;
  movingNotePart = {
    note,
    part,
    point,
    moved: false,
    initialSnapshot: serializeCurrentEditorState(),
    damageLaneGrabOffset: point
      ? pointerX / damageLaneWidth - Number(point.damageLane || 0)
      : 0
  };

  activeDamagePointMenu = null;
  e.stopPropagation();
  e.preventDefault();
}

function recordMovingNoteUndo() {
  if (!movingNotePart || movingNotePart.moved) return;
  pushUndoState(movingNotePart.initialSnapshot);
}

function canMoveDamagePointTo(note, point, position) {
  const points = [...note.points].sort(
    (a, b) => positionToNumber(a.position) - positionToNumber(b.position)
  );
  const index = points.indexOf(point);
  const previous = points[index - 1];
  const next = points[index + 1];

  if (previous && comparePosition(position, previous.position) <= 0) return false;
  if (next && comparePosition(position, next.position) >= 0) return false;
  return true;
}

function updateMovingNotePart(e) {
  if (!movingNotePart) return false;

  const rect = editorCanvas.getBoundingClientRect();
  const y = e.clientY - rect.top + editorCanvas.scrollTop;
  const x = e.clientX - rect.left;
  const position = yToPosition(y);
  const { note, part, point } = movingNotePart;
  let changed = false;

  if (part === "position" && !samePosition(note.position, position)) {
    recordMovingNoteUndo();
    note.position = position;
    changed = true;
  } else if (
    part === "longStart" &&
    comparePosition(position, note.endPosition) < 0 &&
    !samePosition(note.position, position)
  ) {
    recordMovingNoteUndo();
    note.position = position;
    changed = true;
  } else if (
    part === "longEnd" &&
    comparePosition(position, note.position) > 0 &&
    !samePosition(note.endPosition, position)
  ) {
    recordMovingNoteUndo();
    note.endPosition = position;
    changed = true;
  } else if (part === "damagePoint" && point) {
    if (canMoveDamagePointTo(note, point, position) && !samePosition(point.position, position)) {
      recordMovingNoteUndo();
      point.position = position;
      changed = true;
    }

    const targetDamageLane = Math.max(
      0,
      Math.min(
        damageLaneCount - point.width,
        Math.round(x / damageLaneWidth - movingNotePart.damageLaneGrabOffset)
      )
    );
    if (targetDamageLane !== point.damageLane) {
      recordMovingNoteUndo();
      point.damageLane = targetDamageLane;
      changed = true;
    }
  }

  if (changed) {
    movingNotePart.moved = true;
    renderNotes();
  }
  return true;
}

function finishMovingNotePart() {
  if (!movingNotePart) return false;

  const finishedMove = movingNotePart;
  movingNotePart = null;

  if (finishedMove.part === "damagePoint" && !finishedMove.moved) {
    activeDamagePointMenu = { note: finishedMove.note, point: finishedMove.point };
    renderNotes();
  }
  return true;
}

function drawNote(note) {
  if (note.type === "damageLong") {
    drawDamageLong(note);
    return;
  }

  if (note.type === "damageDiamond" || note.type === "damageCircle") {
    const el = document.createElement("div");
    el.classList.add("editorNote", note.type);
    const damageLane = note.damageLane ?? Math.max(0, Math.min(damageLaneCount - 1, note.lane * 2 + 1));
    el.style.left = (damageLane * damageLaneWidth + damageLaneWidth / 2 - 17) + "px";

    const y = positionToY(note.position);
    const height = note.type === "damageDiamond" ? 44 : 34;
    el.style.top = (y - height / 2) + "px";

    el.addEventListener("mousedown", (e) => {
      if (isNormalNoteToolSelected()) return;
      beginNotePartMove(e, note, "position");
    });

    el.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();
      removeNote(note);
    });
    editorCanvas.appendChild(el);
    return;
  }

  if (note.type === "dual") {
    const minLane = Math.min(...note.lanes);
    const maxLane = Math.max(...note.lanes);
    const el = document.createElement("div");
    el.classList.add("editorNote", "dual");
    el.style.left = (minLane * laneWidth + 5) + "px";
    el.style.width = ((maxLane - minLane + 1) * laneWidth - 10) + "px";

    const y = positionToY(note.position);
    el.style.top = (y - 5) + "px";
    el.style.height = "10px";
    el.addEventListener("mousedown", (e) => beginNotePartMove(e, note, "position"));
    el.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();
      removeNote(note);
    });
    editorCanvas.appendChild(el);
    return;
  }

  const el = document.createElement("div");
  el.classList.add("editorNote");
  if (note.type === "long") el.classList.add("long");

  el.style.left = (note.lane * laneWidth + 5) + "px";
  el.style.width = (laneWidth - 10) + "px";

  if (note.type === "long") {
    const startY = positionToY(note.position);
    const endY = positionToY(note.endPosition);
    const topY = Math.min(startY, endY);

    el.style.top = (topY - 5) + "px";
    el.style.height = (Math.abs(endY - startY) + 10) + "px";

    const startHandle = document.createElement("div");
    startHandle.classList.add("editorLongEndpoint", "start");
    startHandle.title = "Drag long start";
    startHandle.addEventListener("mousedown", (e) => beginNotePartMove(e, note, "longStart"));

    const endHandle = document.createElement("div");
    endHandle.classList.add("editorLongEndpoint", "end");
    endHandle.title = "Drag long end";
    endHandle.addEventListener("mousedown", (e) => beginNotePartMove(e, note, "longEnd"));

    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
    });
    el.append(endHandle, startHandle);
  } else {
    const y = positionToY(note.position);
    el.style.top = (y - 5) + "px";
    el.style.height = "10px";
    el.addEventListener("mousedown", (e) => beginNotePartMove(e, note, "position"));
  }

  el.addEventListener("contextmenu", (e) => {
    e.stopPropagation();
    e.preventDefault();
    removeNote(note);
  });
  editorCanvas.appendChild(el);
}

function getDamagePointEdges(point) {
  const width = Math.max(1, Math.min(10, Number(point.width || 2)));
  const leftLane = Math.max(0, Math.min(damageLaneCount - width, Number(point.damageLane || 0)));
  const left = leftLane * damageLaneWidth;
  const right = (leftLane + width) * damageLaneWidth;

  return {
    left,
    right,
    center: (left + right) / 2,
    y: positionToY(point.position)
  };
}

let editorDamageMarbleFilterCount = 0;

function addEditorDamageMarbleFilter(svg) {
  const svgNs = "http://www.w3.org/2000/svg";
  const filterId = `editorDamageMarble-${++editorDamageMarbleFilterCount}`;
  const defs = document.createElementNS(svgNs, "defs");
  const filter = document.createElementNS(svgNs, "filter");
  filter.id = filterId;
  filter.setAttribute("x", "-25%");
  filter.setAttribute("y", "-25%");
  filter.setAttribute("width", "150%");
  filter.setAttribute("height", "150%");

  const turbulence = document.createElementNS(svgNs, "feTurbulence");
  turbulence.setAttribute("type", "fractalNoise");
  turbulence.setAttribute("baseFrequency", "0.012 0.045");
  turbulence.setAttribute("numOctaves", "3");
  turbulence.setAttribute("seed", String(editorDamageMarbleFilterCount));
  turbulence.setAttribute("result", "noise");

  const color = document.createElementNS(svgNs, "feColorMatrix");
  color.setAttribute("in", "noise");
  color.setAttribute("type", "matrix");
  color.setAttribute(
    "values",
    "1.15 0 0 0 0.18  0 0.28 0 0 0.01  0 0 1.45 0 0.28  0 0 0 1 0"
  );
  color.setAttribute("result", "purpleNoise");

  const mask = document.createElementNS(svgNs, "feComposite");
  mask.setAttribute("in", "purpleNoise");
  mask.setAttribute("in2", "SourceGraphic");
  mask.setAttribute("operator", "in");
  mask.setAttribute("result", "marble");

  const blend = document.createElementNS(svgNs, "feBlend");
  blend.setAttribute("in", "SourceGraphic");
  blend.setAttribute("in2", "marble");
  blend.setAttribute("mode", "screen");

  filter.append(turbulence, color, mask, blend);
  defs.appendChild(filter);
  svg.appendChild(defs);
  return filterId;
}

function drawDamageLong(note) {
  const points = [...note.points].sort((a, b) => positionToNumber(a.position) - positionToNumber(b.position));
  const edgePoints = buildDamageLongEdgePoints(points, getDamagePointEdges);
  const handleEdges = points.map(getDamagePointEdges);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("editorDamageLongShape");
  svg.setAttribute("width", laneCount * laneWidth);
  svg.setAttribute("height", getChartVisualMetrics().totalHeight + 40);

  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  const marbleFilterId = addEditorDamageMarbleFilter(svg);
  polygon.setAttribute("filter", `url(#${marbleFilterId})`);
  const polygonPoints = [
    ...edgePoints.map(point => `${point.left},${point.y}`),
    ...edgePoints.slice().reverse().map(point => `${point.right},${point.y}`)
  ];
  polygon.setAttribute("points", polygonPoints.join(" "));
  polygon.addEventListener("contextmenu", (e) => {
    e.stopPropagation();
    e.preventDefault();
    removeNote(note);
  });
  svg.appendChild(polygon);
  editorCanvas.appendChild(svg);

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const edges = handleEdges[i];
    const handle = document.createElement("div");
    handle.classList.add("editorDamageLongPoint");
    handle.style.left = edges.left + "px";
    handle.style.top = (edges.y - 6) + "px";
    handle.style.width = (edges.right - edges.left) + "px";
    handle.title = "width " + point.width;

    if (activeDamagePointMenu?.note === note && activeDamagePointMenu?.point === point) {
      handle.classList.add("menuOpen");
      const menu = document.createElement("div");
      menu.classList.add("editorDamageCurveMenu");

      const menuOptions = [];
      if (i === 0 || (i > 0 && i < points.length - 1)) {
        menuOptions.push({ value: "delete", label: "削除" });
      }
      if (i < points.length - 1) {
        menuOptions.push(
          { value: "accelerate", label: "加速" },
          { value: "decelerate", label: "減速" },
          { value: "sine", label: "サイン" },
          { value: "cosine", label: "コサイン" }
        );
      }
      menuOptions.push({ value: "cancel", label: "キャンセル" });

      for (const option of menuOptions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.label;
        if (point.curve === option.value) {
          button.classList.add("selected");
        }

        button.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          e.preventDefault();
        });
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();

          if (option.value === "delete") {
            pushUndoState();
            if (i === 0) {
              removeNote(note, { recordHistory: false });
              return;
            }

            note.points = note.points.filter(pointItem => pointItem !== point);
          } else if (option.value === "cancel") {
            activeDamagePointMenu = null;
          } else {
            pushUndoState();
            point.curve = point.curve === option.value ? "linear" : option.value;
            activeDamagePointMenu = null;
          }

          renderNotes();
        });
        menu.appendChild(button);
      }

      handle.appendChild(menu);
    }

    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (selectedNoteType === "tap" || selectedNoteType === "long" || selectedNoteType === "dual") {
        return;
      }

      const handleRect = handle.getBoundingClientRect();
      const localX = e.clientX - handleRect.left;
      const edgeGrabWidth = Math.min(10, handleRect.width / 2);

      e.stopPropagation();
      e.preventDefault();

      if (localX > edgeGrabWidth && localX < handleRect.width - edgeGrabWidth) {
        beginNotePartMove(e, note, "damagePoint", point);
        return;
      }

      activeDamagePointMenu = null;
      pushUndoState();
      resizingDamagePoint = {
        point,
        edge: localX <= edgeGrabWidth ? "left" : "right",
        fixedLeft: point.damageLane,
        fixedRight: point.damageLane + point.width
      };
    });
    handle.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();
      activeDamagePointMenu = { note, point };
      renderNotes();
    });
    editorCanvas.appendChild(handle);
  }
}
function buildDamageLongEdgePoints(points, getEdges) {
  if (points.length <= 1) return points.map(getEdges);

  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = getEdges(points[i]);
    const end = getEdges(points[i + 1]);
    const steps = Math.max(8, Math.ceil(Math.abs(end.y - start.y) / 24));

    for (let step = 0; step <= steps; step++) {
      if (i > 0 && step === 0) continue;

      const t = step / steps;
      const curvedT = applyDamageCurve(t, points[i].curve);
      sampled.push({
        left: start.left + (end.left - start.left) * curvedT,
        right: start.right + (end.right - start.right) * curvedT,
        center: start.center + (end.center - start.center) * curvedT,
        y: start.y + (end.y - start.y) * t
      });
    }
  }

  return sampled;
}

// ---- 繝弱・繝・桃菴・----
function removeNote(note, { recordHistory = true } = {}) {
  if (recordHistory) pushUndoState();
  notes = notes.filter(n => n !== note);
  renderNotes();
}

function addNote(position, lane, damageLane = null) {
  const measurePosition = positionToNumber(position);
  if (measurePosition < 0 || measurePosition > totalMeasures) return;

  if (selectedNoteType === "damageDiamond" || selectedNoteType === "damageCircle") {
    const targetDamageLane = damageLane ?? lane * 2;
    const existing = notes.find(n =>
      n.type === selectedNoteType &&
      (n.damageLane ?? n.lane * 2) === targetDamageLane &&
      samePosition(n.position, position)
    );

    pushUndoState();

    if (existing) {
      removeNote(existing, { recordHistory: false });
      return;
    }

    notes.push({ type: selectedNoteType, damageLane: targetDamageLane, position: position });
    renderNotes();
    return;
  }

  if (selectedNoteType === "tap") {
    const existing = notes.find(n =>
      n.type === "tap" &&
      n.lane === lane &&
      samePosition(n.position, position)
    );

    pushUndoState();

    if (existing) {
      removeNote(existing, { recordHistory: false });
      return;
    }

    notes.push({ type: "tap", lane: lane, position: position });
    renderNotes();
  }

  if (selectedNoteType === "dual") {
    if (selectedDualLanes.length < 2) {
      alert("DUAL繝弱・繝・・2縺､莉･荳翫・繝ｬ繝ｼ繝ｳ繧帝∈謚槭＠縺ｦ縺上□縺輔＞");
      return;
    }

    pushUndoState();

    const existing = notes.find(n =>
      n.type === "dual" &&
      samePosition(n.position, position)
    );

    if (existing) {
      removeNote(existing, { recordHistory: false });
      return;
    }

    notes.push({
      type: "dual",
      lanes: [...selectedDualLanes].sort((a, b) => a - b),
      position: position
    });
    renderNotes();
  }
}

// ---- 繝槭え繧ｹ謫堺ｽ・----
function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function findDamageLongAt(x, y) {
  for (const note of notes) {
    if (note.type !== "damageLong") continue;
    const points = [...note.points].sort((a, b) => positionToNumber(a.position) - positionToNumber(b.position));

    for (const point of points) {
      const edges = getDamagePointEdges(point);
      if (x >= edges.left && x <= edges.right && Math.abs(y - edges.y) <= 14) {
        return note;
      }
    }

    for (let i = 0; i < points.length - 1; i++) {
      const a = getDamagePointEdges(points[i]);
      const b = getDamagePointEdges(points[i + 1]);
      const widthPx = ((points[i].width + points[i + 1].width) / 2) * damageLaneWidth;
      if (pointToSegmentDistance(x, y, a.center, a.y, b.center, b.y) <= Math.max(24, widthPx / 2 + 8)) {
        return note;
      }
    }
  }

  return null;
}

function addDamageLongPoint(position, damageLane, x, y) {
  const target = findDamageLongAt(x, y);
  if (!target) return;
  pushUndoState();

  for (const point of target.points) {
    const edges = getDamagePointEdges(point);
    if (x >= edges.left && x <= edges.right && Math.abs(y - edges.y) <= 14) {
      point.width = getDamageWidth();
      point.damageLane = Math.max(0, Math.min(damageLaneCount - point.width, damageLane));
      renderNotes();
      return;
    }
  }

  target.points.push(makeDamagePoint(position, damageLane));
  target.points.sort((a, b) => positionToNumber(a.position) - positionToNumber(b.position));
  renderNotes();
}

editorCanvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;

  const rect = editorCanvas.getBoundingClientRect();
  const scrollTop = editorCanvas.scrollTop;
  const y = e.clientY - rect.top + scrollTop;
  const x = e.clientX - rect.left;

  const lane = Math.floor(x / laneWidth);
  if (lane < 0 || lane >= laneCount) return;
  const damageLane = Math.max(0, Math.min(damageLaneCount - 1, Math.floor(x / damageLaneWidth)));

  const position = yToPosition(y);

  if (selectedNoteType === "damagePoint") {
    addDamageLongPoint(position, damageLane, x, y);
    return;
  }

  if (selectedNoteType === "damageLong") {
    pushUndoState();
    isDragging = true;
    dragStartPosition = position;
    dragNote = {
      type: "damageLong",
      points: [
        makeDamagePoint(position, damageLane),
        makeDamagePoint(addPositionStep(position), damageLane)
      ]
    };
    notes.push(dragNote);
    renderNotes();
    return;
  }

  if (selectedNoteType === "long") {
    pushUndoState();
    isDragging = true;
    dragStartPosition = position;
    dragNote = {
      type: "long",
      lane: lane,
      position: position,
      endPosition: addPositionStep(position)
    };
    notes.push(dragNote);
    renderNotes();
    return;
  }

  addNote(position, lane, damageLane);
});

editorCanvas.addEventListener("mousemove", (e) => {
  if (updateMovingNotePart(e)) return;

  if (resizingDamagePoint) {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const boundary = Math.max(0, Math.min(damageLaneCount, Math.round(x / damageLaneWidth)));
    const { point, edge, fixedLeft, fixedRight } = resizingDamagePoint;

    if (edge === "left") {
      const newLeft = Math.max(0, Math.min(fixedRight - 1, boundary));
      point.damageLane = newLeft;
      point.width = fixedRight - newLeft;
    } else {
      const newRight = Math.max(fixedLeft + 1, Math.min(damageLaneCount, boundary));
      point.damageLane = fixedLeft;
      point.width = newRight - fixedLeft;
    }

    clampDamagePoint(point);
    renderNotes();
    return;
  }

  if (!isDragging || !dragNote) return;

  const rect = editorCanvas.getBoundingClientRect();
  const scrollTop = editorCanvas.scrollTop;
  const y = e.clientY - rect.top + scrollTop;
  const position = yToPosition(y);

  if (comparePosition(position, dragStartPosition) > 0) {
    if (dragNote.type === "damageLong") {
      const rect = editorCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const damageLane = Math.max(0, Math.min(damageLaneCount - 1, Math.floor(x / damageLaneWidth)));
      dragNote.points[1] = makeDamagePoint(position, damageLane);
    } else {
      dragNote.endPosition = position;
    }
    renderNotes();
  }
});

editorCanvas.addEventListener("mouseup", () => {
  if (finishMovingNotePart()) return;

  if (resizingDamagePoint) {
    resizingDamagePoint = null;
    return;
  }

  if (!isDragging) return;
  isDragging = false;

  if (dragNote?.type === "damageLong") {
    const [start, end] = dragNote.points;
    if (comparePosition(end.position, start.position) <= 0) {
      notes = notes.filter(n => n !== dragNote);
      renderNotes();
    }
  } else if (dragNote && comparePosition(dragNote.endPosition, dragNote.position) <= 0) {
    notes = notes.filter(n => n !== dragNote);
    renderNotes();
  }

  dragStartPosition = null;
  dragNote = null;
});

window.addEventListener("mouseup", () => {
  finishMovingNotePart();
  resizingDamagePoint = null;
});

editorCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const rect = editorCanvas.getBoundingClientRect();
  const scrollTop = editorCanvas.scrollTop;
  const y = e.clientY - rect.top + scrollTop;
  const x = e.clientX - rect.left;

  const lane = Math.floor(x / laneWidth);
  const damageLane = Math.max(0, Math.min(damageLaneCount - 1, Math.floor(x / damageLaneWidth)));
  const position = yToPosition(y);
  const clickValue = positionToNumber(position);
  const tolerance = 0.5 / (timesig * gridDivision);

  const target = notes.find(n => {
    if (n.type === "dual") {
      return Math.abs(positionToNumber(n.position) - clickValue) <= tolerance;
    }

    if (n.type === "damageLong") {
      return findDamageLongAt(x, y) === n;
    }

    if (n.type === "damageDiamond" || n.type === "damageCircle") {
      return (n.damageLane ?? n.lane * 2) === damageLane && Math.abs(positionToNumber(n.position) - clickValue) <= tolerance;
    }

    if (n.type === "long") {
      const start = positionToNumber(n.position);
      const end = positionToNumber(n.endPosition);
      return n.lane === lane && clickValue >= Math.min(start, end) && clickValue <= Math.max(start, end);
    }

    return n.lane === lane && Math.abs(positionToNumber(n.position) - clickValue) <= tolerance;
  });

  if (target) removeNote(target);
});

// ---- 繝弱・繝・ｨｮ鬘槫・繧頑崛縺・----
document.querySelectorAll(".noteTypeBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedNoteType = btn.dataset.type;
    document.querySelectorAll(".noteTypeBtn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    document.getElementById("dualLaneGroup").style.display =
      selectedNoteType === "dual" ? "block" : "none";
  });
});

document.querySelectorAll(".dualLaneBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    const lane = Number(btn.dataset.lane);
    if (selectedDualLanes.includes(lane)) {
      selectedDualLanes = selectedDualLanes.filter(l => l !== lane);
      btn.classList.remove("selected");
    } else {
      selectedDualLanes.push(lane);
      btn.classList.add("selected");
    }
  });
});

// ---- 繝・Φ繝晏､牙喧 ----
document.getElementById("addTempoChange").addEventListener("click", () => {
  pushUndoState();
  tempoChanges.push({ measure: 2, division: "0/1", bpm: BPM, timesig: timesig });
  renderTempoChangeList();
});

function renderTempoChangeList() {
  const list = document.getElementById("tempoChangeList");
  list.innerHTML = "";

  tempoChanges.forEach((tc, i) => {
    const item = document.createElement("div");
    item.classList.add("tempoChangeItem");

    const row1 = document.createElement("div");
    row1.classList.add("tempoChangeRow");
    row1.innerHTML = `<span>蟆冗ｯ</span>`;

    const measureInput = document.createElement("input");
    measureInput.type = "number";
    measureInput.value = tc.measure;
    measureInput.style.width = "50px";
    measureInput.addEventListener("change", () => {
      const viewportAnchor = captureEditorViewport();
      pushUndoState();
      tc.measure = Number(measureInput.value);
      renderCanvas();
      restoreEditorViewport(viewportAnchor);
    });

    const divisionInput = document.createElement("input");
    divisionInput.type = "text";
    divisionInput.value = tc.division || "0/1";
    divisionInput.placeholder = "3/16";
    divisionInput.style.width = "54px";
    divisionInput.setAttribute("aria-label", "小節内位置");
    divisionInput.addEventListener("change", () => {
      const viewportAnchor = captureEditorViewport();
      pushUndoState();
      tc.division = normalizeTempoDivision(divisionInput.value);
      divisionInput.value = tc.division;
      renderCanvas();
      restoreEditorViewport(viewportAnchor);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("tempoDeleteBtn");
    deleteBtn.textContent = "蜑企勁";
    deleteBtn.addEventListener("click", () => {
      const viewportAnchor = captureEditorViewport();
      pushUndoState();
      tempoChanges.splice(i, 1);
      renderTempoChangeList();
      renderCanvas();
      restoreEditorViewport(viewportAnchor);
    });

    row1.appendChild(measureInput);
    row1.appendChild(divisionInput);
    row1.appendChild(deleteBtn);

    const row2 = document.createElement("div");
    row2.classList.add("tempoChangeRow");
    row2.innerHTML = `<span>BPM</span>`;

    const bpmInput2 = document.createElement("input");
    bpmInput2.type = "number";
    bpmInput2.value = tc.bpm;
    bpmInput2.style.width = "60px";
    bpmInput2.addEventListener("change", () => {
      pushUndoState();
      tc.bpm = Number(bpmInput2.value);
    });

    const timesigLabel = document.createElement("span");
    timesigLabel.textContent = "TS";

    const timesigInput2 = document.createElement("input");
    timesigInput2.type = "number";
    timesigInput2.value = tc.timesig;
    timesigInput2.style.width = "40px";
    timesigInput2.addEventListener("change", () => {
      const viewportAnchor = captureEditorViewport();
      pushUndoState();
      tc.timesig = Number(timesigInput2.value);
      renderCanvas();
      restoreEditorViewport(viewportAnchor);
    });

    row2.appendChild(bpmInput2);
    row2.appendChild(timesigLabel);
    row2.appendChild(timesigInput2);

    item.appendChild(row1);
    item.appendChild(row2);
    list.appendChild(item);
  });
}

// ---- 髻ｳ貅・----
document.getElementById("audioFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  audioControls.style.display = "flex";
});

function normalizeTempoDivision(value) {
  const match = String(value || "0/1").trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return "0/1";
  const denominator = Math.max(1, Number(match[2]));
  const numerator = Math.max(0, Math.min(denominator - 1, Number(match[1])));
  const divisor = gcd(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

function getTempoChangePosition(change) {
  const [numerator, denominator] = normalizeTempoDivision(change?.division).split("/").map(Number);
  return Math.max(0, Number(change?.measure || 1) - 1 + numerator / denominator);
}

function getTempoMap() {
  const changes = [
    { measure: 1, division: "0/1", bpm: BPM, timesig: timesig },
    ...tempoChanges
  ]
    .map(tc => ({
      measure: Math.max(1, Number(tc.measure)),
      division: normalizeTempoDivision(tc.division),
      position: getTempoChangePosition(tc),
      bpm: Number(tc.bpm),
      timesig: Number(tc.timesig)
    }))
    .filter(tc => tc.bpm > 0 && tc.timesig > 0)
    .sort((a, b) => a.position - b.position);

  const map = [];
  for (const tc of changes) {
    const last = map[map.length - 1];
    if (last && last.position === tc.position) {
      last.bpm = tc.bpm;
      last.timesig = tc.timesig;
    } else {
      map.push(tc);
    }
  }

  return map;
}

function getChartVisualMetrics() {
  const tempoMap = getTempoMap();
  const baseTimeSignature = Math.max(1, Number(timesig) || 4);
  const pixelsPerBeat = pixelsPerMeasure / baseTimeSignature;
  const timeSignatures = [];
  const heights = [];
  const cumulative = [0];
  let tempoIndex = 0;

  for (let measureIndex = 0; measureIndex < totalMeasures; measureIndex++) {
    while (tempoIndex + 1 < tempoMap.length && tempoMap[tempoIndex + 1].position <= measureIndex) {
      tempoIndex++;
    }
    const currentTimeSignature = Math.max(1, Number(tempoMap[tempoIndex]?.timesig || baseTimeSignature));
    const height = currentTimeSignature * pixelsPerBeat;
    timeSignatures.push(currentTimeSignature);
    heights.push(height);
    cumulative.push(cumulative[cumulative.length - 1] + height);
  }

  return { timeSignatures, heights, cumulative, totalHeight: cumulative[cumulative.length - 1] || 0 };
}

function getMusicMsFromPosition(position) {
  const targetPosition = Math.max(0, positionToNumber(position));
  const map = getTempoMap();
  let ms = 0;
  for (let index = 0; index < map.length; index++) {
    const current = map[index];
    const nextPosition = map[index + 1]?.position ?? targetPosition;
    const segmentEnd = Math.min(targetPosition, nextPosition);
    if (segmentEnd > current.position) {
      ms += (segmentEnd - current.position) * current.timesig * (60000 / current.bpm);
    }
    if (targetPosition <= nextPosition) break;
  }
  return ms;
}

function getPositionFromMusicMs(ms) {
  const map = getTempoMap();
  let remainingMs = Math.max(0, ms);

  for (let i = 0; i < map.length; i++) {
    const current = map[i];
    const next = map[i + 1];
    const measureDuration = current.timesig * (60000 / current.bpm);
    const segmentMeasures = Math.max(0, (next?.position ?? totalMeasures) - current.position);
    const segmentMs = segmentMeasures * measureDuration;

    if (remainingMs > segmentMs) {
      remainingMs -= segmentMs;
      continue;
    }

    const measureOffset = remainingMs / measureDuration;
    return makePosition(Math.round((current.position + measureOffset) * 1000000), 1000000);
  }

  return makePosition(totalMeasures, 1);
}

function msToTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// 蜀咲函
playButton.addEventListener("click", () => {
  if (!audioBuffer) return;
  if (isPlaying) stopPlayback();

  isPlaying = true;

  const judgeYInCanvas = editorCanvas.scrollTop + editorCanvas.clientHeight - 60;
  const currentPosition = yToPosition(judgeYInCanvas);

  const startMusicMs = getMusicMsFromPosition(currentPosition);
  const startAudioMs = startMusicMs + offsetMs;
  const startSec = Math.max(0, startAudioMs / 1000);
  const audioDelaySec = Math.max(0, -startAudioMs / 1000);

  audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioContext.destination);
  // 負のオフセットで音源位置が0秒より前になる場合は、譜面を先に進めて
  // 必要な時間だけ待ってから音源の0秒地点を再生する。
  audioSource.start(audioContext.currentTime + audioDelaySec, startSec);

  audioSource.onended = () => {
    if (isPlaying) stopPlayback();
  };

  playStartTime = audioContext.currentTime;
  playStartMs = startAudioMs;

  playButton.textContent = "蜀咲函荳ｭ";
  playButton.disabled = true;

  function updatePlayback() {
    if (!isPlaying) return;

    const elapsed = (audioContext.currentTime - playStartTime) * 1000;
    const currentAudioMs = playStartMs + elapsed;

    currentTimeEl.textContent = msToTime(Math.max(0, currentAudioMs));

    const currentMusicMs = currentAudioMs - offsetMs;
    const currentPosition = getPositionFromMusicMs(currentMusicMs);
    const noteY = positionToY(currentPosition);
    const targetScrollTop = noteY - editorCanvas.clientHeight + 60;

    editorCanvas.scrollTop = targetScrollTop;

    animationFrameId = requestAnimationFrame(updatePlayback);
  }

  animationFrameId = requestAnimationFrame(updatePlayback);
});

// 蛛懈ｭ｢
stopButton.addEventListener("click", stopPlayback);

function stopPlayback() {
  if (!isPlaying) return;
  isPlaying = false;

  if (audioSource) {
    try {
      audioSource.onended = null;
      audioSource.stop();
    } catch (e) {}
    audioSource = null;
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  playButton.textContent = "笆ｶ 蜀咲函";
  playButton.disabled = false;
}

// ---- 繧ｨ繧ｯ繧ｹ繝昴・繝・----

document.getElementById("exportButton").addEventListener("click", () => {
  const sortedNotes = [...notes].sort((a, b) =>
    positionToNumber(getNoteStartPosition(a)) - positionToNumber(getNoteStartPosition(b))
  );
  const sortedTempoChanges = [...tempoChanges].sort((a, b) =>
    getTempoChangePosition(a) - getTempoChangePosition(b)
  );

  let lines = [];
  lines.push(`@bpm,${BPM}`);
  lines.push(`@timesig,${timesig}`);
  lines.push(`@offset,${offsetMs}`);

  for (let tc of sortedTempoChanges) {
    lines.push(`@tempo,${tc.measure},${normalizeTempoDivision(tc.division)},${tc.bpm},${tc.timesig}`);
  }

  lines.push("");

  for (let note of sortedNotes) {
    if (note.type === "tap") {
      const { measure, numerator, denominator } = positionToMeasureDivision(note.position);
      lines.push(`${measure},${numerator}/${denominator},${note.lane}`);
    }

    if (note.type === "long") {
      const start = positionToMeasureDivision(note.position);
      const end = positionToMeasureDivision(note.endPosition);
      lines.push(`${start.measure},${start.numerator}/${start.denominator},${note.lane},long,${end.measure},${end.numerator}/${end.denominator}`);
    }

    if (note.type === "dual") {
      const { measure, numerator, denominator } = positionToMeasureDivision(note.position);
      const laneStr = note.lanes.join("|");
      lines.push(`${measure},${numerator}/${denominator},[${laneStr}],dual`);
    }

    if (note.type === "damageDiamond" || note.type === "damageCircle") {
      const { measure, numerator, denominator } = positionToMeasureDivision(note.position);
      const damageLane = note.damageLane ?? Math.max(0, Math.min(damageLaneCount - 1, note.lane * 2 + 1));
      const type = note.type === "damageDiamond" ? "damageDiamond" : "damageCircle";
      lines.push(`${type},${measure},${numerator}/${denominator},${getDamageX(damageLane)},42`);
    }

    if (note.type === "damageLong") {
      const pointParts = [...note.points]
        .sort((a, b) => positionToNumber(a.position) - positionToNumber(b.position))
        .flatMap(point => {
          const { measure, numerator, denominator } = positionToMeasureDivision(point.position);
          return [
            measure,
            `${numerator}/${denominator}`,
            getDamageLeftX(point.damageLane),
            Math.max(1, Math.min(10, Number(point.width || 2))),
            point.curve || "linear"
          ];
        });
      lines.push(`damageLong,${pointParts.join(",")}`);
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const fileNameInput = document.getElementById("exportFileNameInput");
let fileName = fileNameInput.value.trim();

if (!fileName) {
  fileName = "chart";
}

if (!fileName.endsWith(".txt")) {
  fileName += ".txt";
}

a.download = fileName;
  a.click();
});

saveProjectButton.addEventListener("click", () => {
  const name = saveNameInput.value.trim();

  if (!name) {
    alert("Enter a save name");
    return;
  }

  const projects = getSavedProjects();
  const exists = Boolean(projects[name]);

  if (exists && !confirm(`Overwrite ${name}?`)) {
    return;
  }

  projects[name] = getCurrentProjectData();
  setSavedProjects(projects);
  refreshSavedProjectSelect();
  savedProjectSelect.value = name;

  alert("Saved");
});

loadProjectButton.addEventListener("click", () => {
  const name = savedProjectSelect.value;
  if (!name) return;

  const projects = getSavedProjects();
  const data = projects[name];

  if (!data) {
    alert("Saved project not found");
    refreshSavedProjectSelect();
    return;
  }

  if (!confirm(`Load ${name}? Unsaved changes will be lost.`)) {
    return;
  }

  pushUndoState();
  applyProjectData(data);
  saveNameInput.value = name;
});

restoreAutoSaveButton.addEventListener("click", () => {
  const data = getAutoSaveData();
  if (!data) {
    updateAutoSaveRestoreButton();
    return;
  }

  if (!confirm("自動保存データを復元しますか？ 現在の未保存内容は失われます。")) {
    return;
  }

  pushUndoState();
  applyProjectData(data);
  saveNameInput.value = data.saveName || "";
});

deleteProjectButton.addEventListener("click", () => {
  const name = savedProjectSelect.value;
  if (!name) return;

  if (!confirm(`Delete ${name}?`)) {
    return;
  }

  const projects = getSavedProjects();
  delete projects[name];
  setSavedProjects(projects);
  refreshSavedProjectSelect();

  if (saveNameInput.value === name) {
    saveNameInput.value = "";
  }

  alert("Deleted");
});

importChartFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm(`Import ${file.name}? Unsaved changes will be lost.`)) {
    importChartFile.value = "";
    return;
  }

  const text = await file.text();
  pushUndoState();
  importChartText(text);

  saveNameInput.value = file.name.replace(/\.[^/.]+$/, "");
  importChartFile.value = "";
});

// ---- 蜈ｨ豸亥悉 ----
document.getElementById("clearButton").addEventListener("click", () => {
  if (confirm("Clear all notes?")) {
    pushUndoState();
    notes = [];
    renderNotes();
  }
});

// ---- 襍ｷ蜍・----
refreshSavedProjectSelect();
updateAutoSaveRestoreButton();
setInterval(autoSaveProject, AUTO_SAVE_INTERVAL_MS);
init();
