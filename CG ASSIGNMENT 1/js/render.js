export const canvas = document.getElementById('glCanvas');
console.log(canvas);
export const gl = canvas.getContext('webgl');
console.log(gl);
// console.log(canvas.width);
if (!gl) alert('WebGL not supported');

const vsSource = `
attribute vec2 aPosition;
uniform mat3 uMatrix;
void main() {
  vec3 pos = uMatrix * vec3(aPosition, 1.0);
  gl_Position = vec4(pos.xy, 0, 1);
  gl_PointSize = 8.0;
}`;
const fsSource = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

function loadShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);
const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.error('Program link error:', gl.getProgramInfoLog(program));
}
gl.useProgram(program);

const aPosition = gl.getAttribLocation(program, 'aPosition');
const uColor = gl.getUniformLocation(program, 'uColor');
const uMatrix = gl.getUniformLocation(program, 'uMatrix');
const identity = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

export function draw(type, positions, color) {
  if (!positions || positions.length === 0) return;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix3fv(uMatrix, false, identity);
  gl.uniform4fv(uColor, color);
  gl.drawArrays(type, 0, positions.length / 2);
  gl.deleteBuffer(buffer);
}
