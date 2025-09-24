// js/simulation.js
import { Vertex, delaunayTriangulate } from "./geometry.js";
import { gl, draw } from "./render.js";


export let points = [];
export let triangles = [];
export let edges = [];
export let people = [];
export let obstacle = { corners: [] };
export let vertexIds = [];

export const NUM_POINTS = 10;
export const DENSITY = 2;
export const OBSTACLE_SIZE = 0.4;
export const MAX_PEOPLE = 100;


export function pointInTriangle(pt, a, b, c) {
  const s1 = (a.x - pt.x)*(b.y - pt.y) - (b.x - pt.x)*(a.y - pt.y);
  const s2 = (b.x - pt.x)*(c.y - pt.y) - (c.x - pt.x)*(b.y - pt.y);
  const s3 = (c.x - pt.x)*(a.y - pt.y) - (a.x - pt.x)*(c.y - pt.y);
  const hasNeg = (s1 < 0) || (s2 < 0) || (s3 < 0);
  const hasPos = (s1 > 0) || (s2 > 0) || (s3 > 0);
  return !(hasNeg && hasPos);
}

export function pointInPolygon(pt, poly) {
  if (!poly || poly.length === 0) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const denom = (yj - yi) || 1e-12;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInObstacle(x, y) {
  if (!obstacle || !obstacle.corners || obstacle.corners.length < 3) return false;
  const obsPts = obstacle.corners.map(i => points[i]);
  return pointInPolygon({ x, y }, obsPts);
}

export function randomPointInTriangle(tri) {
  let a = points[tri[0]], b = points[tri[1]], c = points[tri[2]];
  let r1 = Math.random(), r2 = Math.random();
  if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
  let r3 = 1 - r1 - r2;
  return { x: a.x * r1 + b.x * r2 + c.x * r3, y: a.y * r1 + b.y * r2 + c.y * r3 };
}

function densityColor(count) {
  const TARGET = 4;
  const diff = count - TARGET;
  if (diff === 0) return [0.0, 0.6, 0.0, 0.45];
  if (diff > 0) {
    const t = Math.min(1, diff / (TARGET * 2));
    return [0.6 + 0.4 * t, 0.2 * (1 - t), 0.2 * (1 - t), 0.5];
  } else {
    const t = Math.min(1, Math.abs(diff) / TARGET);
    return [0.2 * (1 - t), 0.2 * (1 - t), 0.6 + 0.4 * t, 0.5];
  }
}

export function render() {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(1, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Triangles (with density coloring)
  for (let tIndex = 0; tIndex < triangles.length; tIndex++) {
    let tri = triangles[tIndex];
    const count = people.reduce((s, p) =>
      s + (pointInTriangle({ x: p.x, y: p.y }, points[tri[0]], points[tri[1]], points[tri[2]]) ? 1 : 0), 0);
    let color = densityColor(count);
    let pos = tri.flatMap(i => [points[i].x, points[i].y]);
    draw(gl.TRIANGLES, pos, color);
  }

  // Edges
  let edgePos = edges.flatMap(e => [points[e[0]].x, points[e[0]].y, points[e[1]].x, points[e[1]].y]);
  draw(gl.LINES, edgePos, [0, 0, 0, 1]);

  // Obstacle 
  if (obstacle.corners.length >= 3) {
    let obsFillPos = obstacle.corners.flatMap(i => [points[i].x, points[i].y]);
    draw(gl.TRIANGLE_FAN, obsFillPos, [0.8, 0.6, 0.4, 0.7]);
    let obsOutlinePos = obstacle.corners.flatMap(i => [points[i].x, points[i].y]);
    obsOutlinePos.push(points[obstacle.corners[0]].x, points[obstacle.corners[0]].y);
    draw(gl.LINE_STRIP, obsOutlinePos, [0.5, 0.3, 0.1, 1]);
  }

  // People
  let peoplePos = people.flatMap(p => [p.x, p.y]);
  draw(gl.POINTS, peoplePos, [0, 0, 0, 1]);
}

// --- Triangulation  ---
function getEdges(tris) {
  let edgeSet = new Set();
  for (let t of tris) {
    let pairs = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
    for (let p of pairs) {
      let sorted = [...p].sort((a, b) => a - b);
      edgeSet.add(sorted.join(','));
    }
  }
  return Array.from(edgeSet).map(s => s.split(',').map(Number));
}

export function updateTriangulation() {
  let vertices = points.map((p, i) => new Vertex(i, p.x, p.y));
  let tris = delaunayTriangulate(vertices);
  triangles = tris.map(t => [t.v0.id, t.v1.id, t.v2.id]);
  edges = getEdges(triangles);
}

// update which triangle a person belongs to
export function updatePersonTriangle(personIndex) {
  const person = people[personIndex];
  person.triIndex = -1;
  for (let i = 0; i < triangles.length; i++) {
    const triPoints = triangles[i].map(idx => points[idx]);
    if (pointInTriangle({ x: person.x, y: person.y }, triPoints[0], triPoints[1], triPoints[2])) {
      person.triIndex = i; break;
    }
  }
}

// recompute triangulation and remove people who fall outside or into obstacle
export function updateAfterTransform() {
  updateTriangulation();
  for (let i = people.length - 1; i >= 0; i--) {
    let p = people[i];
    p.triIndex = -1;
    for (let j = 0; j < triangles.length; j++) {
      const triPoints = triangles[j].map(idx => points[idx]);
      if (pointInTriangle({ x: p.x, y: p.y }, triPoints[0], triPoints[1], triPoints[2])) {
        p.triIndex = j; break;
      }
    }
    if (p.triIndex === -1 || isInObstacle(p.x, p.y)) people.splice(i, 1);
  }
  render();
}

// center of obstacle
export function getCenter() {
  if (!obstacle.corners.length) return { x: 0, y: 0 };
  let sumX = 0, sumY = 0;
  obstacle.corners.forEach(c => { sumX += points[c].x; sumY += points[c].y; });
  return { x: sumX / obstacle.corners.length, y: sumY / obstacle.corners.length };
}

// --- Initialization ---
export function init() {
  points = []; vertexIds = []; triangles = []; edges = []; people = [];
  obstacle = { corners: [4, 5, 6, 7] };

  // Outer rectangle corners
  points.push({ x: -1, y: -1 }); 
  points.push({ x: 1, y: -1 });  
  points.push({ x: 1, y: 1 });   
  points.push({ x: -1, y: 1 });  

  // Obstacle rectangle (4..7)
  let obsX = 0, obsY = 0;
  points.push({ x: obsX, y: obsY });                            
  points.push({ x: obsX + OBSTACLE_SIZE, y: obsY });           
  points.push({ x: obsX + OBSTACLE_SIZE, y: obsY + OBSTACLE_SIZE }); 
  points.push({ x: obsX, y: obsY + OBSTACLE_SIZE });             
  obstacle.corners = [4, 5, 6, 7];

  
  let attempts = 0;
  while (vertexIds.length < NUM_POINTS && attempts < 2000) {
    attempts++;
    const x = Math.random()*2 - 1;
    const y = Math.random()*2 - 1;
    if (pointInPolygon({ x, y }, obstacle.corners.map(i => points[i]))) continue;
    if (Math.hypot(x, y) > 1.5) continue;
    points.push({ x, y });
    vertexIds.push(points.length - 1);
  }

  updateTriangulation();

  // Add people randomly 
  people = [];
  for (let t = 0; t < triangles.length; t++) {
    let attempts = 0, added = 0;
    while (added < DENSITY && attempts < 100) {
      let pos = randomPointInTriangle(triangles[t]);
      attempts++;
      if (!isInObstacle(pos.x, pos.y)) {
        people.push({ x: pos.x, y: pos.y, triIndex: t });
        added++;
      }
    }
  }

  render();
}
