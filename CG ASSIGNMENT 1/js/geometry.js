// Geometry primitives + triangulation
export class Vertex {
  constructor(id, x, y) { this.id = id; this.x = x; this.y = y; }
  equals(vertex) { return this.x === vertex.x && this.y === vertex.y; }
}

export class Edge {
  constructor(v0, v1) { this.v0 = v0; this.v1 = v1; }
  equals(edge) {
    return (this.v0.equals(edge.v0) && this.v1.equals(edge.v1)) ||
           (this.v0.equals(edge.v1) && this.v1.equals(edge.v0));
  }
}

export class Triangle {
  constructor(v0, v1, v2) {
    this.v0 = v0; this.v1 = v1; this.v2 = v2;
    this.circumCirc = this.calcCircumCirc(v0, v1, v2);
  }
  calcCircumCirc(v1, v2, v3) {
    let A = v2.x - v1.x, B = v2.y - v1.y, C = v3.x - v1.x, D = v3.y - v1.y;
    let E = A * (v1.x + v2.x) + B * (v1.y + v2.y);
    let F = C * (v1.x + v3.x) + D * (v1.y + v3.y);
    let G = 2 * (A * (v3.y - v2.y) - B * (v3.x - v2.x));
    if (Math.abs(G) < 1e-12) return { c: { x: 0, y: 0 }, r: Infinity };
    let cx = (D * E - B * F) / G;
    let cy = (A * F - C * E) / G;
    let dx = cx - v1.x, dy = cy - v1.y;
    return { c: { x: cx, y: cy }, r: Math.sqrt(dx * dx + dy * dy) };
  }
  inCircumcircle(v) {
    if (this.circumCirc.r === Infinity) return false;
    let dx = this.circumCirc.c.x - v.x, dy = this.circumCirc.c.y - v.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.circumCirc.r;
  }
}

// --- Delaunay helpers ---
export function superTriangle(vertices) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  vertices.forEach(v => {
    minx = Math.min(minx, v.x); miny = Math.min(miny, v.y);
    maxx = Math.max(maxx, v.x); maxy = Math.max(maxy, v.y);
  });
  let dx = (maxx - minx) * 10, dy = (maxy - miny) * 10;
  let v0 = new Vertex(-1, minx - dx, miny - dy * 3);
  let v1 = new Vertex(-2, minx - dx, maxy + dy);
  let v2 = new Vertex(-3, maxx + dx * 3, maxy + dy);
  return new Triangle(v0, v1, v2);
}

export function delaunayTriangulate(vertices) {
  let st = superTriangle(vertices);
  let triangles = [st];
  vertices.forEach(vertex => { triangles = addVertex(vertex, triangles); });
  return triangles.filter(triangle =>
    !(triangle.v0.id < 0 || triangle.v1.id < 0 || triangle.v2.id < 0));
}

function addVertex(vertex, triangles) {
  let edges = [];
  triangles = triangles.filter(triangle => {
    if (triangle.inCircumcircle(vertex)) {
      edges.push(new Edge(triangle.v0, triangle.v1));
      edges.push(new Edge(triangle.v1, triangle.v2));
      edges.push(new Edge(triangle.v2, triangle.v0));
      return false;
    }
    return true;
  });
  edges = uniqueEdges(edges);
  edges.forEach(edge => triangles.push(new Triangle(edge.v0, edge.v1, vertex)));
  return triangles;
}

function uniqueEdges(edges) {
  let unique = [];
  for (let i = 0; i < edges.length; ++i) {
    let isUnique = true;
    for (let j = 0; j < edges.length; ++j) {
      if (i !== j && edges[i].equals(edges[j])) { isUnique = false; break; }
    }
    if (isUnique) unique.push(edges[i]);
  }
  return unique;
}
