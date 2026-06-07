// ---- 設定 ----
let BPM = 180;
let timesig = 4;
let gridDivision = 4;
let totalMeasures = 50;
let offsetMs = 0;
const pixelsPerMeasure = 200;
const laneCount = 5;
const laneWidth = 100;

// ---- 状態 ----
let notes = [];
let tempoChanges = [];
let selectedNoteType = "tap";
let selectedDualLanes = [];
let isDragging = false;
let dragStartPosition = null;
let dragNote = null;

// ---- 音源 ----
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
const audioControls = document.getElementById("audioControls");
const playButton = document.getElementById("playButton");
const stopButton = document.getElementById("stopButton");
const currentTimeEl = document.getElementById("currentTime");
const saveNameInput = document.getElementById("saveNameInput");
const savedProjectSelect = document.getElementById("savedProjectSelect");
const saveProjectButton = document.getElementById("saveProjectButton");
const loadProjectButton = document.getElementById("loadProjectButton");
const deleteProjectButton = document.getElementById("deleteProjectButton");
const importChartFile = document.getElementById("importChartFile");

const PROJECT_STORAGE_KEY = "chartEditorProjects";

// ---- 初期化 ----
function init() {
  BPM = Number(bpmInput.value);
  timesig = Number(timesigInput.value);
  gridDivision = Number(gridInput.value);
  totalMeasures = Number(measuresInput.value);
  offsetMs = Number(offsetInput.value);
  renderCanvas();
}

bpmInput.addEventListener("change", init);
timesigInput.addEventListener("change", init);
gridInput.addEventListener("change", init);
measuresInput.addEventListener("change", init);
offsetInput.addEventListener("change", () => {
  offsetMs = Number(offsetInput.value);
});

// ---- 分数位置計算 ----
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
  const totalHeight = totalMeasures * pixelsPerMeasure;
  const fromTop = y - 20;
  const rawMeasurePosition = ((totalHeight - fromTop) / totalHeight) * totalMeasures;

  const unitsPerMeasure = timesig * gridDivision;
  const maxUnits = totalMeasures * unitsPerMeasure;
  const snappedUnits = Math.round(rawMeasurePosition * unitsPerMeasure);
  const clampedUnits = Math.max(0, Math.min(maxUnits, snappedUnits));

  return makePosition(clampedUnits, unitsPerMeasure);
}

function positionToY(position) {
  const totalHeight = totalMeasures * pixelsPerMeasure;
  const measurePosition = positionToNumber(position);

  return 20 + totalHeight - (measurePosition / totalMeasures) * totalHeight;
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
    console.error("保存データの読み込みに失敗:", e);
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

function applyProjectData(data) {
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
}

function refreshSavedProjectSelect() {
  const projects = getSavedProjects();
  const names = Object.keys(projects).sort();

  savedProjectSelect.innerHTML = "";

  if (names.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "保存データなし";
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
        bpm: Number(parts[2]),
        timesig: Number(parts[3])
      });
      continue;
    }

    const parts = line.split(",");

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
    const start = positionToMeasureDivision(note.position);
    maxMeasure = Math.max(maxMeasure, start.measure);

    if (note.type === "long") {
      const end = positionToMeasureDivision(note.endPosition);
      maxMeasure = Math.max(maxMeasure, end.measure);
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
 
// ---- キャンバス描画 ----
function renderCanvas() {
  const totalHeight = totalMeasures * pixelsPerMeasure;
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

  const totalVisualGrids = totalMeasures * timesig * gridDivision;

  for (let i = 0; i <= totalVisualGrids; i++) {
    const position = makePosition(i, timesig * gridDivision);
    const y = positionToY(position);
    const line = document.createElement("div");

    if (i % (timesig * gridDivision) === 0) {
      line.classList.add("measureLine");
      const label = document.createElement("span");
      label.classList.add("measureLabel");
      label.textContent = "M" + (i / (timesig * gridDivision) + 1);
      line.appendChild(label);
    } else if (i % gridDivision === 0) {
      line.classList.add("beatLine");
    } else {
      line.classList.add("gridLine");
    }

    line.style.top = y + "px";
    line.style.width = totalWidth + "px";
    editorCanvas.appendChild(line);
  }

  renderNotes();
  editorCanvas.scrollTop = editorCanvas.scrollHeight;
}

function renderNotes() {
  document.querySelectorAll(".editorNote").forEach(el => el.remove());
  for (let note of notes) {
    drawNote(note);
  }
  noteCountEl.textContent = "ノーツ数: " + notes.length;
}

function drawNote(note) {
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
  } else {
    const y = positionToY(note.position);
    el.style.top = (y - 5) + "px";
    el.style.height = "10px";
  }

  el.addEventListener("contextmenu", (e) => {
    e.stopPropagation();
    e.preventDefault();
    removeNote(note);
  });
  editorCanvas.appendChild(el);
}

// ---- ノーツ操作 ----
function removeNote(note) {
  notes = notes.filter(n => n !== note);
  renderNotes();
}

function addNote(position, lane) {
  const measurePosition = positionToNumber(position);
  if (measurePosition < 0 || measurePosition > totalMeasures) return;

  if (selectedNoteType === "tap") {
    const existing = notes.find(n =>
      n.type === "tap" &&
      n.lane === lane &&
      samePosition(n.position, position)
    );

    if (existing) {
      removeNote(existing);
      return;
    }

    notes.push({ type: "tap", lane: lane, position: position });
    renderNotes();
  }

  if (selectedNoteType === "dual") {
    if (selectedDualLanes.length < 2) {
      alert("DUALノーツは2つ以上のレーンを選択してください");
      return;
    }

    const existing = notes.find(n =>
      n.type === "dual" &&
      samePosition(n.position, position)
    );

    if (existing) {
      removeNote(existing);
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

// ---- マウス操作 ----
editorCanvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;

  const rect = editorCanvas.getBoundingClientRect();
  const scrollTop = editorCanvas.scrollTop;
  const y = e.clientY - rect.top + scrollTop;
  const x = e.clientX - rect.left;

  const lane = Math.floor(x / laneWidth);
  if (lane < 0 || lane >= laneCount) return;

  const position = yToPosition(y);

  if (selectedNoteType === "long") {
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

  addNote(position, lane);
});

editorCanvas.addEventListener("mousemove", (e) => {
  if (!isDragging || !dragNote) return;

  const rect = editorCanvas.getBoundingClientRect();
  const scrollTop = editorCanvas.scrollTop;
  const y = e.clientY - rect.top + scrollTop;
  const position = yToPosition(y);

  if (comparePosition(position, dragStartPosition) > 0) {
    dragNote.endPosition = position;
    renderNotes();
  }
});

editorCanvas.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;

  if (dragNote && comparePosition(dragNote.endPosition, dragNote.position) <= 0) {
    notes = notes.filter(n => n !== dragNote);
    renderNotes();
  }

  dragStartPosition = null;
  dragNote = null;
});

editorCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const rect = editorCanvas.getBoundingClientRect();
  const scrollTop = editorCanvas.scrollTop;
  const y = e.clientY - rect.top + scrollTop;
  const x = e.clientX - rect.left;

  const lane = Math.floor(x / laneWidth);
  const position = yToPosition(y);
  const clickValue = positionToNumber(position);
  const tolerance = 0.5 / (timesig * gridDivision);

  const target = notes.find(n => {
    if (n.type === "dual") {
      return Math.abs(positionToNumber(n.position) - clickValue) <= tolerance;
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

// ---- ノーツ種類切り替え ----
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

// ---- テンポ変化 ----
document.getElementById("addTempoChange").addEventListener("click", () => {
  tempoChanges.push({ measure: 2, bpm: BPM, timesig: timesig });
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
    row1.innerHTML = `<span>小節</span>`;

    const measureInput = document.createElement("input");
    measureInput.type = "number";
    measureInput.value = tc.measure;
    measureInput.style.width = "50px";
    measureInput.addEventListener("change", () => {
      tc.measure = Number(measureInput.value);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("tempoDeleteBtn");
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      tempoChanges.splice(i, 1);
      renderTempoChangeList();
    });

    row1.appendChild(measureInput);
    row1.appendChild(deleteBtn);

    const row2 = document.createElement("div");
    row2.classList.add("tempoChangeRow");
    row2.innerHTML = `<span>BPM</span>`;

    const bpmInput2 = document.createElement("input");
    bpmInput2.type = "number";
    bpmInput2.value = tc.bpm;
    bpmInput2.style.width = "60px";
    bpmInput2.addEventListener("change", () => {
      tc.bpm = Number(bpmInput2.value);
    });

    const timesigLabel = document.createElement("span");
    timesigLabel.textContent = "拍子";

    const timesigInput2 = document.createElement("input");
    timesigInput2.type = "number";
    timesigInput2.value = tc.timesig;
    timesigInput2.style.width = "40px";
    timesigInput2.addEventListener("change", () => {
      tc.timesig = Number(timesigInput2.value);
    });

    row2.appendChild(bpmInput2);
    row2.appendChild(timesigLabel);
    row2.appendChild(timesigInput2);

    item.appendChild(row1);
    item.appendChild(row2);
    list.appendChild(item);
  });
}

// ---- 音源 ----
document.getElementById("audioFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  audioControls.style.display = "flex";
});

function getTempoMap() {
  const changes = [
    { measure: 1, bpm: BPM, timesig: timesig },
    ...tempoChanges
  ]
    .map(tc => ({
      measure: Math.max(1, Number(tc.measure)),
      bpm: Number(tc.bpm),
      timesig: Number(tc.timesig)
    }))
    .filter(tc => tc.bpm > 0 && tc.timesig > 0)
    .sort((a, b) => a.measure - b.measure);

  const map = [];
  for (const tc of changes) {
    const last = map[map.length - 1];
    if (last && last.measure === tc.measure) {
      last.bpm = tc.bpm;
      last.timesig = tc.timesig;
    } else {
      map.push(tc);
    }
  }

  return map;
}

function getMusicMsFromPosition(position) {
  const measurePosition = positionToNumber(position);
  const measureIndex = Math.floor(measurePosition);
  const measureFraction = measurePosition - measureIndex;
  const targetMeasure = measureIndex + 1;

  const map = getTempoMap();
  let ms = 0;

  for (let i = 0; i < map.length; i++) {
    const current = map[i];
    const next = map[i + 1];
    const startMeasure = current.measure;
    const endMeasure = next ? next.measure : totalMeasures + 1;

    if (targetMeasure >= endMeasure) {
      const measureCount = Math.max(0, endMeasure - startMeasure);
      ms += measureCount * current.timesig * (60000 / current.bpm);
      continue;
    }

    if (targetMeasure >= startMeasure) {
      const fullMeasures = targetMeasure - startMeasure;
      ms += fullMeasures * current.timesig * (60000 / current.bpm);
      ms += measureFraction * current.timesig * (60000 / current.bpm);
      return ms;
    }
  }

  return ms;
}

function getPositionFromMusicMs(ms) {
  const map = getTempoMap();
  let remainingMs = Math.max(0, ms);

  for (let i = 0; i < map.length; i++) {
    const current = map[i];
    const next = map[i + 1];
    const startMeasure = current.measure;
    const endMeasure = next ? next.measure : totalMeasures + 1;
    const measureDuration = current.timesig * (60000 / current.bpm);
    const segmentMeasures = Math.max(0, endMeasure - startMeasure);
    const segmentMs = segmentMeasures * measureDuration;

    if (remainingMs > segmentMs) {
      remainingMs -= segmentMs;
      continue;
    }

    const measureOffset = remainingMs / measureDuration;
    return makePosition(Math.round((startMeasure - 1 + measureOffset) * 1000000), 1000000);
  }

  return makePosition(totalMeasures, 1);
}

function msToTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// 再生
playButton.addEventListener("click", () => {
  if (!audioBuffer) return;
  if (isPlaying) stopPlayback();

  isPlaying = true;

  const judgeYInCanvas = editorCanvas.scrollTop + editorCanvas.clientHeight - 60;
  const currentPosition = yToPosition(judgeYInCanvas);

  const startMusicMs = getMusicMsFromPosition(currentPosition);
  const startAudioMs = startMusicMs + offsetMs;
  const startSec = Math.max(0, startAudioMs / 1000);

  audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioContext.destination);
  audioSource.start(0, startSec);

  audioSource.onended = () => {
    if (isPlaying) stopPlayback();
  };

  playStartTime = audioContext.currentTime;
  playStartMs = startAudioMs;

  playButton.textContent = "再生中";
  playButton.disabled = true;

  function updatePlayback() {
    if (!isPlaying) return;

    const elapsed = (audioContext.currentTime - playStartTime) * 1000;
    const currentAudioMs = playStartMs + elapsed;

    currentTimeEl.textContent = msToTime(currentAudioMs);

    const currentMusicMs = currentAudioMs - offsetMs;
    const currentPosition = getPositionFromMusicMs(currentMusicMs);
    const noteY = positionToY(currentPosition);
    const targetScrollTop = noteY - editorCanvas.clientHeight + 60;

    editorCanvas.scrollTop = targetScrollTop;

    animationFrameId = requestAnimationFrame(updatePlayback);
  }

  animationFrameId = requestAnimationFrame(updatePlayback);
});

// 停止
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

  playButton.textContent = "▶ 再生";
  playButton.disabled = false;
}

// ---- エクスポート ----
document.getElementById("exportButton").addEventListener("click", () => {
  const sortedNotes = [...notes].sort((a, b) =>
    positionToNumber(a.position) - positionToNumber(b.position)
  );
  const sortedTempoChanges = [...tempoChanges].sort((a, b) => a.measure - b.measure);

  let lines = [];
  lines.push(`@bpm,${BPM}`);
  lines.push(`@timesig,${timesig}`);
  lines.push(`@offset,${offsetMs}`);

  for (let tc of sortedTempoChanges) {
    lines.push(`@tempo,${tc.measure},${tc.bpm},${tc.timesig}`);
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
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "chart.txt";
  a.click();
});

saveProjectButton.addEventListener("click", () => {
  const name = saveNameInput.value.trim();

  if (!name) {
    alert("保存名を入力してください");
    return;
  }

  const projects = getSavedProjects();
  const exists = Boolean(projects[name]);

  if (exists && !confirm(`「${name}」を上書きしますか？`)) {
    return;
  }

  projects[name] = getCurrentProjectData();
  setSavedProjects(projects);
  refreshSavedProjectSelect();
  savedProjectSelect.value = name;

  alert("保存しました");
});

loadProjectButton.addEventListener("click", () => {
  const name = savedProjectSelect.value;
  if (!name) return;

  const projects = getSavedProjects();
  const data = projects[name];

  if (!data) {
    alert("保存データが見つかりません");
    refreshSavedProjectSelect();
    return;
  }

  if (!confirm(`「${name}」を読み込みますか？\n現在の未保存の編集内容は失われます。`)) {
    return;
  }

  applyProjectData(data);
  saveNameInput.value = name;
});

deleteProjectButton.addEventListener("click", () => {
  const name = savedProjectSelect.value;
  if (!name) return;

  if (!confirm(`「${name}」を削除しますか？`)) {
    return;
  }

  const projects = getSavedProjects();
  delete projects[name];
  setSavedProjects(projects);
  refreshSavedProjectSelect();

  if (saveNameInput.value === name) {
    saveNameInput.value = "";
  }

  alert("削除しました");
});

importChartFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm(`「${file.name}」を読み込みますか？\n現在の未保存の編集内容は失われます。`)) {
    importChartFile.value = "";
    return;
  }

  const text = await file.text();
  importChartText(text);

  saveNameInput.value = file.name.replace(/\.[^/.]+$/, "");
  importChartFile.value = "";
});

// ---- 全消去 ----
document.getElementById("clearButton").addEventListener("click", () => {
  if (confirm("全てのノーツを消去しますか？")) {
    notes = [];
    renderNotes();
  }
});

// ---- 起動 ----
refreshSavedProjectSelect();
init();