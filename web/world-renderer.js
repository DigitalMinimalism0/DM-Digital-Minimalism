// An analytic 3D scene: camera rays cross a thick opening and intersect a moving
// height field. The ocean has world coordinates, normals, reflection and distance fog.
const VERTEX = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uViewport;
uniform vec4 uOpening;
uniform vec2 uLook;
uniform float uProgress;
uniform float uTime;
const float EYE = 1.25;
const float FOV = 0.51;

float heightAt(vec2 p) {
  return .16 * sin(p.x * .58 + p.y * .37 + uTime * .34)
       + .085 * sin(p.x * -.32 + p.y * .87 - uTime * .28)
       + .025 * sin(p.x * 1.62 + p.y * 1.13 + uTime * .5)
       + .008 * sin(p.x * 3.7 - p.y * 2.4 - uTime * .8);
}

vec2 gradientAt(vec2 p) {
  return vec2(.58,.37) * .16 * cos(p.x * .58 + p.y * .37 + uTime * .34)
       + vec2(-.32,.87) * .085 * cos(p.x * -.32 + p.y * .87 - uTime * .28)
       + vec2(1.62,1.13) * .025 * cos(p.x * 1.62 + p.y * 1.13 + uTime * .5)
       + vec2(3.7,-2.4) * .008 * cos(p.x * 3.7 - p.y * 2.4 - uTime * .8);
}

float sky(vec3 direction) {
  float horizon = exp(-max(direction.y, 0.0) * 6.0);
  return .01 + .19 * horizon;
}

vec3 directionAt(vec2 pixel, float pitch, float yaw) {
  vec2 uv = pixel / uViewport * 2.0 - 1.0;
  uv.x *= uViewport.x / uViewport.y;
  vec3 ray = normalize(vec3(uv * FOV, -1.0));
  ray.yz = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch)) * ray.yz;
  ray.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * ray.xz;
  return ray;
}

float ocean(vec3 origin, vec3 ray) {
  if (ray.y > -.003) return sky(ray);
  float nearT = (origin.y - .38) / -ray.y;
  float farT = min((origin.y + .38) / -ray.y, 220.0);
  if (nearT > 210.0) return sky(ray);
  for (int i = 0; i < 10; i++) {
    float mid = (nearT + farT) * .5;
    vec3 point = origin + ray * mid;
    if (point.y > heightAt(point.xz)) nearT = mid;
    else farT = mid;
  }
  float distance = (nearT + farT) * .5;
  vec3 point = origin + ray * distance;
  vec2 gradient = gradientAt(point.xz);
  vec3 normal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
  vec3 reflected = reflect(ray, normal);
  float fresnel = pow(1.0 - max(dot(normal, -ray), 0.0), 3.0);
  float diffuse = max(dot(normal, normalize(vec3(-.5,.8,-.25))), 0.0);
  float glint = pow(max(dot(reflected, normalize(vec3(-.35,.34,-.8))), 0.0), 24.0);
  float crest = smoothstep(.10,.27,point.y) * .055;
  float value = .028 + .065 * diffuse + fresnel * sky(reflected) * .85 + glint * .20 + crest;
  float fog = 1.0 - exp(-distance * .018);
  return mix(value, .20, fog);
}

void main() {
  vec2 pixel = gl_FragCoord.xy / uResolution * uViewport;
  float p = uProgress;
  float cameraZ = 4.8 - 5.4 * smoothstep(0.0,.65,p) - 12.0 * smoothstep(.65,1.0,p);
  float gaze = smoothstep(.62,.92,p);
  float pitch = .065 * smoothstep(.48,.9,p) + uLook.y * gaze;
  float yaw = uLook.x * gaze;
  vec3 origin = vec3(0.0,EYE,cameraZ);
  vec3 ray = directionAt(pixel,pitch,yaw);
  vec2 openingCentre = vec2(
    (uOpening.x / uViewport.x * 2.0 - 1.0) * (uViewport.x/uViewport.y) * FOV * 4.8,
    EYE + (1.0 - uOpening.y / uViewport.y * 2.0) * FOV * 4.8
  );
  vec2 halfSize = vec2(uOpening.z / uViewport.y * FOV * 4.8);
  float wallDepth = clamp(halfSize.x * .6,.16,.36);

  // The front face and the four inner reveals are solid architectural surfaces.
  // Their occlusion changes as the camera travels through the opening.
  if (cameraZ > -wallDepth) {
    if (cameraZ > 0.0) {
      vec3 front = origin + ray * (cameraZ / -ray.z);
      vec2 q = abs(front.xy - openingCentre) - halfSize;
      if (max(q.x,q.y) > 0.0) {
        float edge = max(q.x,q.y);
        float rim = (1.0 - smoothstep(.016,.02,edge)) * .115;
        gl_FragColor = vec4(vec3(.0314 + rim),1.0);
        return;
      }
    }
    vec3 rear = origin + ray * ((cameraZ + wallDepth) / -ray.z);
    vec2 q = abs(rear.xy - openingCentre) - halfSize;
    if (max(q.x,q.y) > 0.0) {
      float side = q.x > q.y ? .105 : .19;
      float depthShade = clamp((cameraZ + wallDepth) / 2.0,.2,1.0);
      gl_FragColor = vec4(vec3(side * depthShade),1.0);
      return;
    }
  }

  // Continuous surface shading carries the form. The print screen only adds a
  // quiet material finish; it never replaces the sea with bright isolated dots.
  float cell = mix(2.5,uViewport.x < 621.0 ? 5.5 : 7.0,smoothstep(.15,.82,p));
  vec2 grid = floor(pixel / cell);
  float luminance = clamp(ocean(origin,ray),0.0,.6);
  float variation = 1.0 + sin(grid.x * 127.1 + grid.y * 311.7) * .035;
  float radius = sqrt(luminance * 1.65) * .48 * variation;
  float dotDistance = length(fract(pixel / cell) - .5);
  float antialias = .7 / cell * (uViewport.x / uResolution.x);
  float ink = 1.0 - smoothstep(radius - antialias,radius + antialias,dotDistance);
  float material = .34 * smoothstep(.05,.65,p) * (1.0 - smoothstep(-.18,.02,ray.y));
  float grain = fract(sin(dot(floor(pixel),vec2(12.9898,78.233))) * 43758.5453) - .5;
  float photographic = mix(luminance,luminance * .82 + .09 * ink,material) + grain * .005;
  gl_FragColor = vec4(vec3(photographic),1.0);
}
`;

export function createDepthWorld(canvas, { getOpening, reducedMotion, panelOpen, onUnavailable }) {
  if (!canvas) return null;
  let gl;
  try {
    gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
    });
  } catch {
    return null;
  }
  if (!gl) return null;
  let program;
  const shaders = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
    }
    program = gl.createProgram();
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));
  } catch {
    for (const shader of shaders) gl.deleteShader(shader);
    if (program) gl.deleteProgram(program);
    return null;
  }
  for (const shader of shaders) gl.deleteShader(shader);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const attribute = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(
    ['uResolution', 'uViewport', 'uOpening', 'uLook', 'uProgress', 'uTime'].map((name) => [
      name,
      gl.getUniformLocation(program, name),
    ]),
  );
  let frame = 0;
  let lastDraw = -1000;
  let previousProgress = -1;
  let previousLook = [0, 0];
  let time = 0;
  let previousTick = performance.now();
  let look = [0, 0];
  let targetLook = [0, 0];
  let lost = false;

  function resize(bounds = getOpening()) {
    const scale = Math.min(1, 1100 / innerWidth, 820 / innerHeight);
    canvas.width = Math.max(1, Math.round(innerWidth * scale));
    canvas.height = Math.max(1, Math.round(innerHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.uViewport, innerWidth, innerHeight);
    gl.uniform4f(
      uniforms.uOpening,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
      bounds.width,
      bounds.height,
    );
    previousProgress = -1;
  }

  function render(now) {
    frame = 0;
    if (document.hidden || lost) return;
    frame = requestAnimationFrame(render);
    if (now - lastDraw < 32) return;
    const maximum = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const raw = Math.min(1, Math.max(0, window.scrollY / maximum));
    const progress = reducedMotion() ? (raw > 0.995 ? 1 : 0) : raw;
    const activeWater = progress > 0.02 && !panelOpen() && !reducedMotion();
    const delta = Math.min((now - previousTick) / 1000, 0.1);
    previousTick = now;
    if (activeWater) time += delta;
    const canLook = progress > 0.9 && !panelOpen() && !reducedMotion();
    const target = canLook ? targetLook : [0, 0];
    look[0] += (target[0] - look[0]) * 0.12;
    look[1] += (target[1] - look[1]) * 0.12;
    const changed =
      Math.abs(look[0] - previousLook[0]) + Math.abs(look[1] - previousLook[1]) > 0.00005;
    if (progress === previousProgress && !activeWater && !changed) return;
    gl.uniform1f(uniforms.uProgress, progress);
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform2f(uniforms.uLook, look[0], look[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.dataset.progress = progress.toFixed(3);
    previousProgress = progress;
    previousLook = [...look];
    lastDraw = now;
  }

  const pointer = (event) => {
    if (event.pointerType === 'touch') return;
    targetLook = [
      (event.clientX / innerWidth - 0.5) * 0.045,
      (event.clientY / innerHeight - 0.5) * 0.024,
    ];
  };
  const resetLook = () => {
    targetLook = [0, 0];
  };
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame && !lost) {
      previousTick = performance.now();
      frame = requestAnimationFrame(render);
    }
  };
  const loseContext = (event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    canvas.parentElement.classList.remove('depth-active');
    document.body.classList.remove('depth-available');
    onUnavailable?.();
  };
  window.addEventListener('pointermove', pointer, { passive: true });
  window.addEventListener('blur', resetLook);
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('webglcontextlost', loseContext);
  resize();
  canvas.parentElement.classList.add('depth-active');
  document.body.classList.add('depth-available');
  frame = requestAnimationFrame(render);
  return {
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', pointer);
      window.removeEventListener('blur', resetLook);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', loseContext);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
