// js/interaction.js
import { canvas } from "./render.js";
import {
  points, triangles, people, obstacle, vertexIds,
  updateTriangulation, render, isInObstacle, randomPointInTriangle,

  updatePersonTriangle, updateAfterTransform, getCenter, init,

  pointInPolygon, pointInTriangle

} from "./simulation.js";

// Interaction state
let selectedMode = '';// 
let dragging = false;
let selectedPerson = -1;
let lastMouse = { x: 0, y: 0 };
let dragTarget = null; // { type:'person'|'vertex'|'obstacle', idx?, id? }

// thresholds
const PICK_PERSON_DIST = 0.05;
const PICK_VERTEX_DIST = 0.05;
const EDGE_REMOVE_DIST = 0.03;
const PRECISE_STEP = 0.01;
const PRECISE_ANGLE = 0.1;
const PRECISE_SCALE = 1.01;
const MAX_PEOPLE = 100;

// UI helpers
export function updateUI() {
  const triCountEl = document.getElementById('triCount');
  const peopleCountEl = document.getElementById('peopleCount');
  const currentModeEl = document.getElementById('currentMode');
  const selectedItemEl = document.getElementById('selectedItem');

  if (triCountEl) triCountEl.textContent = triangles.length;
  if (peopleCountEl) peopleCountEl.textContent = people.length;
  const modeMap = {
    '': 'View Mode', 'r': 'Rotate Obstacle', 's': 'Scale Obstacle', 't': 'Move Obstacle',
    'm': 'Move Person', 'moveVertex': 'Move Vertex', 'editPeople': 'Edit People'
  };
  let modeText = modeMap[selectedMode] || 'View Mode';
  if (currentModeEl) currentModeEl.textContent = 'Current Mode: ' + modeText;
  let selectedText = selectedPerson >= 0 ? 'Person' : 'None';
  if (dragging && selectedMode !== 'm') selectedText = 'Obstacle/Vertex';
  if (selectedItemEl) selectedItemEl.textContent = selectedText;
}

function updateButtonStates(mode) {
  const mapping = {
    '': 'viewMode', 'r': 'rotateObstacle', 's': 'scaleObstacle',
    't': 'moveObstacle', 'm': 'movePerson', 'moveVertex': 'moveVertex', 'editPeople': 'addPerson'
  };
  const buttons = ['viewMode', 'rotateObstacle', 'scaleObstacle', 'moveObstacle', 'movePerson', 'moveVertex', 'addPerson'];
  const activeId = mapping[mode] || 'viewMode';
  buttons.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === activeId) el.classList.add('active'); else el.classList.remove('active');
  });
}

// mouse coordinate mapping
function getMouseNDC(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = 2 * ((e.clientX - rect.left) / rect.width) - 1;
  const my = 1 - 2 * ((e.clientY - rect.top) / rect.height);
  return { x: mx, y: my };
}

// --- Mouse & keyboard handlers ---
canvas.addEventListener('mousedown', e => {
  const m = getMouseNDC(e);
  lastMouse = { x: m.x, y: m.y };

  // Move vertex mode
  if (selectedMode === 'moveVertex') {
    let found = -1;
    for (let id of vertexIds) {
      const d = Math.hypot(points[id].x - m.x, points[id].y - m.y);
      if (d < PICK_VERTEX_DIST) { found = id; break; }
    }
    if (found !== -1) { dragging = true; dragTarget = { type: 'vertex', id: found }; }
    updateUI(); return;
  }

  // Edit people mode (add/remove)
  if (selectedMode === 'editPeople') {
    let found = -1;
    for (let i = 0; i < people.length; i++) {
      const d = Math.hypot(people[i].x - m.x, people[i].y - m.y);
      if (d < PICK_PERSON_DIST) { found = i; break; }
    }
    if (found >= 0) {
      people.splice(found, 1);
    } else {
      if (people.length < MAX_PEOPLE && !pointInPolygon({ x: m.x, y: m.y }, obstacle.corners.map(i => points[i]))) {
        let p = { x: m.x, y: m.y, triIndex: -1 };
        // find triangle index
        for (let i = 0; i < triangles.length; i++) {
          if (pointInTriangle({ x: m.x, y: m.y }, points[triangles[i][0]], points[triangles[i][1]], points[triangles[i][2]])) {
            p.triIndex = i; break;
          }
        }
        people.push(p);
      }
    }
    render(); updateUI(); return;
  }

  // Move person mode: pick a person
  if (selectedMode === 'm') {
    let minD = PICK_PERSON_DIST;
    let picked = -1;
    for (let i = 0; i < people.length; i++) {
      let d = Math.hypot(people[i].x - m.x, people[i].y - m.y);
      if (d < minD) { minD = d; picked = i; }
    }
    if (picked >= 0) {
      dragging = true; selectedPerson = picked;
      dragTarget = { type: 'person', idx: picked };
    } else {
      selectedPerson = -1; dragTarget = null;
    }
    updateUI(); return;
  }


  if (['t', 'r', 's'].includes(selectedMode) && pointInPolygon({ x: m.x, y: m.y }, obstacle.corners.map(i => points[i]))) {
    dragging = true;
    dragTarget = { type: 'obstacle' };
    updateUI(); return;
  }
});

canvas.addEventListener('mousemove', e => {
  if (!dragging || !dragTarget) return;
  const m = getMouseNDC(e);

  if (dragTarget.type === 'person') {
    const idx = dragTarget.idx;
    people[idx].x = m.x; people[idx].y = m.y;
    updatePersonTriangle(idx);
    render(); return;
  }

  if (dragTarget.type === 'vertex') {
    const id = dragTarget.id;
    points[id].x = m.x; points[id].y = m.y;
    updateTriangulation(); render(); updateUI(); return;
  }

  if (dragTarget.type === 'obstacle') {
    let center = getCenter();
    if (selectedMode === 't') {
      let dx = m.x - lastMouse.x, dy = m.y - lastMouse.y;
      obstacle.corners.forEach(c => { points[c].x += dx; points[c].y += dy; });
    } else if (selectedMode === 'r') {
      let oldAngle = Math.atan2(lastMouse.y - center.y, lastMouse.x - center.x);
      let newAngle = Math.atan2(m.y - center.y, m.x - center.x);
      let delta = newAngle - oldAngle;
      obstacle.corners.forEach(c => {
        let dxp = points[c].x - center.x, dyp = points[c].y - center.y;
        points[c].x = center.x + dxp * Math.cos(delta) - dyp * Math.sin(delta);
        points[c].y = center.y + dxp * Math.sin(delta) + dyp * Math.cos(delta);
      });
    } else if (selectedMode === 's') {
      let oldDist = Math.hypot(lastMouse.x - center.x, lastMouse.y - center.y);
      let newDist = Math.hypot(m.x - center.x, m.y - center.y);
      let scale = (oldDist > 1e-9) ? (newDist / oldDist) : 1.0;
      obstacle.corners.forEach(c => {
        let dxp = points[c].x - center.x, dyp = points[c].y - center.y;
        points[c].x = center.x + dxp * scale;
        points[c].y = center.y + dyp * scale;
      });
    }
    lastMouse = { x: m.x, y: m.y };
    updateAfterTransform();
    return;
  }
});

canvas.addEventListener('mouseup', e => {
  if (dragging && selectedMode === 'm' && selectedPerson >= 0) {
    updatePersonTriangle(selectedPerson);
    if (isInObstacle(people[selectedPerson].x, people[selectedPerson].y)) {
      people.splice(selectedPerson, 1);
    }
    render();
  }
  dragging = false;
  selectedPerson = -1;
  dragTarget = null;
  updateUI();
});

// Keyboard mode change 
document.addEventListener('keydown', e => {
  let key = e.key.toLowerCase();
  if (['r', 's', 't', 'm'].includes(key)) {
    selectedMode = key;
    updateButtonStates(key);
    updateUI();
    return;
  }
  let dx = 0, dy = 0, delta = 0, scaleFactor = 1;
  if (e.key === 'ArrowLeft') {
    if (selectedMode === 't') dx = -PRECISE_STEP;
    else if (selectedMode === 'r') delta = -PRECISE_ANGLE;
    else if (selectedMode === 's') scaleFactor = 1 / PRECISE_SCALE;
    else if (selectedMode === 'm' && selectedPerson >= 0) dx = -PRECISE_STEP;
  } else if (e.key === 'ArrowRight') {
    if (selectedMode === 't') dx = PRECISE_STEP;
    else if (selectedMode === 'r') delta = PRECISE_ANGLE;
    else if (selectedMode === 's') scaleFactor = PRECISE_SCALE;
    else if (selectedMode === 'm' && selectedPerson >= 0) dx = PRECISE_STEP;
  } else if (e.key === 'ArrowUp') {
    if (selectedMode === 't') dy = PRECISE_STEP;
    else if (selectedMode === 'r') delta = PRECISE_ANGLE;
    else if (selectedMode === 's') scaleFactor = PRECISE_SCALE;
    else if (selectedMode === 'm' && selectedPerson >= 0) dy = PRECISE_STEP;
  } else if (e.key === 'ArrowDown') {
    if (selectedMode === 't') dy = -PRECISE_STEP;
    else if (selectedMode === 'r') delta = -PRECISE_ANGLE;
    else if (selectedMode === 's') scaleFactor = 1 / PRECISE_SCALE;
    else if (selectedMode === 'm' && selectedPerson >= 0) dy = -PRECISE_STEP;
  }

  if (dx !== 0 || dy !== 0 || delta !== 0 || scaleFactor !== 1) {
    let center = getCenter();
    if (selectedMode === 't') {
      obstacle.corners.forEach(c => { points[c].x += dx; points[c].y += dy; });
    } else if (selectedMode === 'r') {
      obstacle.corners.forEach(c => {
        let dxp = points[c].x - center.x, dyp = points[c].y - center.y;
        points[c].x = center.x + dxp * Math.cos(delta) - dyp * Math.sin(delta);
        points[c].y = center.y + dxp * Math.sin(delta) + dyp * Math.cos(delta);
      });
    } else if (selectedMode === 's') {
      obstacle.corners.forEach(c => {
        let dxp = points[c].x - center.x, dyp = points[c].y - center.y;
        points[c].x = center.x + dxp * scaleFactor;
        points[c].y = center.y + dyp * scaleFactor;
      });
    } else if (selectedMode === 'm' && selectedPerson >= 0) {
      people[selectedPerson].x += dx;
      people[selectedPerson].y += dy;
      updatePersonTriangle(selectedPerson);
      render(); updateUI(); return;
    }
    updateAfterTransform();
  }
});


document.getElementById('viewMode').addEventListener('click', () => { selectedMode = ''; updateButtonStates(''); updateUI(); });
document.getElementById('rotateObstacle').addEventListener('click', () => { selectedMode = 'r'; updateButtonStates('r'); updateUI(); });
document.getElementById('scaleObstacle').addEventListener('click', () => { selectedMode = 's'; updateButtonStates('s'); updateUI(); });
document.getElementById('moveVertex').addEventListener('click', () => { selectedMode = 'moveVertex'; updateButtonStates('moveVertex'); updateUI(); });
document.getElementById('moveObstacle').addEventListener('click', () => { selectedMode = 't'; updateButtonStates('t'); updateUI(); });
document.getElementById('movePerson').addEventListener('click', () => { selectedMode = 'm'; updateButtonStates('m'); updateUI(); });
document.getElementById('addPerson').addEventListener('click', () => { selectedMode = 'editPeople'; updateButtonStates('editPeople'); updateUI(); });
document.getElementById('resetSimulation').addEventListener('click', () => { init(); render(); updateUI(); });


updateButtonStates('');
updateUI();
