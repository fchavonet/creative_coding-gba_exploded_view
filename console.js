import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Container.
const stage = document.getElementById("stage");

// Scene.
const scene = new THREE.Scene();

// Camera.
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.z = 5;

// Renderer.
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

stage.appendChild(renderer.domElement);

// Camera controls.
const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.05;

controls.enablePan = false;

controls.minDistance = 3;
controls.maxDistance = 12;

// General lighting.
const hemisphereLight = new THREE.HemisphereLight(
  0xffffff,
  0x91889e,
  1.2
);

scene.add(hemisphereLight);

// Main light.
const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);

mainLight.position.set(-3, 5, 4);

scene.add(mainLight);

// Fill light.
const fillLight = new THREE.DirectionalLight(0xb8baff, 1);

fillLight.position.set(4, 1, -3);

scene.add(fillLight);

// Model container.
const gba = new THREE.Group();

scene.add(gba);

// Exploded view.
const spreadSlider = document.getElementById("spread");
const movableParts = [];

function updateExplosion() {
  const progress = Number(spreadSlider.value) / 100;

  for (const part of movableParts) {
    part.object.position.copy(part.initialPosition);
    part.object.position.addScaledVector(part.offset, progress);
  }
}

spreadSlider.addEventListener("input", updateExplosion);

// Model loader.
const loader = new GLTFLoader();

// Keep the largest connected part of the front shell.
function cleanShellGeometry(geometry) {
  const positions = geometry.getAttribute("position");
  const vertexKeys = new Map();
  const vertexIds = [];
  const parents = [];

  // Identify vertices that share the same position.
  for (let i = 0; i < positions.count; i++) {
    const key = [
      positions.getX(i).toFixed(5),
      positions.getY(i).toFixed(5),
      positions.getZ(i).toFixed(5)
    ].join(",");

    if (!vertexKeys.has(key)) {
      const id = vertexKeys.size;

      vertexKeys.set(key, id);
      parents.push(id);
    }

    vertexIds.push(vertexKeys.get(key));
  }

  // Find the connected component containing a vertex.
  function findRoot(id) {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]];
      id = parents[id];
    }

    return id;
  }

  let indices = [];

  if (geometry.index) {
    indices = Array.from(geometry.index.array);
  } else {
    for (let i = 0; i < positions.count; i++) {
      indices.push(i);
    }
  }

  // Connect the three vertices of each triangle.
  for (let i = 0; i < indices.length; i += 3) {
    const a = findRoot(vertexIds[indices[i]]);
    const b = findRoot(vertexIds[indices[i + 1]]);
    const c = findRoot(vertexIds[indices[i + 2]]);

    parents[b] = a;
    parents[c] = a;
  }

  // Count triangles in each connected component.
  const triangleCounts = new Map();
  let largestRoot = -1;
  let largestCount = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const root = findRoot(vertexIds[indices[i]]);
    const count = (triangleCounts.get(root) || 0) + 1;

    triangleCounts.set(root, count);

    if (count > largestCount) {
      largestRoot = root;
      largestCount = count;
    }
  }

  // Keep only triangles belonging to the main shell.
  const keptIndices = [];

  for (let i = 0; i < indices.length; i += 3) {
    const root = findRoot(vertexIds[indices[i]]);

    if (root === largestRoot) {
      keptIndices.push(
        indices[i],
        indices[i + 1],
        indices[i + 2]
      );
    }
  }

  geometry.setIndex(keptIndices);
}

async function loadConsole() {
  try {
    const gltf = await loader.loadAsync("./assets/gba.glb");

    // Remove disconnected fragments from both shells.
    for (const name of ["front", "rear"]) {
      const shell = gltf.scene.getObjectByName(name);

      if (shell && shell.isMesh) {
        shell.geometry = shell.geometry.clone();
        cleanShellGeometry(shell.geometry);
      }
    }

    gba.add(gltf.scene);

    // Measure the model.
    const bounds = new THREE.Box3().setFromObject(gba);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());

    // Fit the model to our current view.
    const largestDimension = Math.max(size.x, size.y, size.z);
    const scale = 3 / largestDimension;

    gba.scale.setScalar(scale);

    // Center the scaled model at the origin.
    gba.position.copy(center).multiplyScalar(-scale);

    // Configure the model parts.
    const partSettings = [
      // Shells.
      { name: "front", offset: new THREE.Vector3(-0.55, 0.3, 5.1) },
      { name: "rear", offset: new THREE.Vector3(0.3, 0, -3.1) },
      { name: "cover", offset: new THREE.Vector3(0.4, -0.8, -6.2) },

      // Battery compartment: follows the rear shell.
      { name: "battery_slot_left", offset: new THREE.Vector3(0.3, 0, -3.1) },
      { name: "battery_slot_right", offset: new THREE.Vector3(0.3, 0, -3.1) },

      // Screen and lens.
      { name: "lcd_face", offset: new THREE.Vector3(-0.2, 0.15, 3.4) },
      { name: "lens", offset: new THREE.Vector3(-0.55, 0.3, 6.4) },
      { name: "lens_frame", offset: new THREE.Vector3(-0.55, 0.3, 6.4) },

      // Front buttons.
      { name: "a", offset: new THREE.Vector3(1.65, 0.5, 6.2) },
      { name: "b", offset: new THREE.Vector3(1.15, 0.25, 6.2) },
      { name: "dpad", offset: new THREE.Vector3(-1.65, 0.35, 6.2) },
      { name: "start_key", offset: new THREE.Vector3(-1.15, -0.7, 6) },
      { name: "select_key", offset: new THREE.Vector3(-1.15, -0.7, 6) },

      // Shoulder buttons.
      { name: "left", offset: new THREE.Vector3(-1.5, 1.3, 1.5) },
      { name: "right", offset: new THREE.Vector3(1.5, 1.3, 1.5) },

      // Connectors and controls.
      { name: "jack", offset: new THREE.Vector3(0.8, -1.2, -0.2) },
      { name: "link", offset: new THREE.Vector3(0.1, 1.75, 0) },
      { name: "volume", offset: new THREE.Vector3(1.7, -0.8, -0.1) },
      { name: "switch", offset: new THREE.Vector3(-1.8, -0.8, 0) },
      { name: "led", offset: new THREE.Vector3(1.15, 0.5, 5.8) },

      // Imported screw meshes.
      { name: "screws", offset: new THREE.Vector3(0.35, 0, -4.3) }
    ];

    for (const settings of partSettings) {
      const object = gltf.scene.getObjectByName(settings.name);

      if (!object) {
        console.warn("Missing model part:", settings.name);
        continue;
      }

      movableParts.push({
        object: object,
        initialPosition: object.position.clone(),
        offset: settings.offset
      });
    }

    updateExplosion();
  } catch (error) {
    console.error("Failed to load the GBA model:", error);
  }
}

loadConsole();

// Keep the scene proportional when resizing.
function resizeScene() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

window.addEventListener("resize", resizeScene);

// Animation loop.
function animate() {
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
