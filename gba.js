import * as THREE from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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

// Environment lighting for metallic reflections.
const roomEnvironment = new RoomEnvironment();
const pmremGenerator = new THREE.PMREMGenerator(renderer);

const environmentMap = pmremGenerator.fromScene(
  roomEnvironment,
  0.04
);

scene.environment = environmentMap.texture;

// Release the temporary generation resources.
roomEnvironment.dispose();
pmremGenerator.dispose();

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

// Keep the largest connected component of a shell.
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

// Build replacement screws at the original mounting positions.
function createScrews() {
  const screws = new THREE.Group();
  screws.name = "screws";

  const material = new THREE.MeshStandardMaterial({
    color: 0x8c9096,
    metalness: 0.9,
    roughness: 0.3
  });

  // Position X, Y, Z, head radius, shaft end along local Z.
  const placements = [
    [2.5962, 2.6456, -0.3723, 0.092, 0.38],
    [-2.59, 2.6456, -0.3723, 0.092, 0.38],
    [3.3263, 1.5459, -0.6701, 0.121, 0.5],
    [-3.3259, 1.5459, -0.6701, 0.121, 0.5],
    [4.4754, -1.7984, -0.5941, 0.121, 0.5],
    [-4.4752, -1.7984, -0.5941, 0.121, 0.5]
  ];

  for (const [x, y, z, radius, length] of placements) {
    const screw = new THREE.Group();
    screw.position.set(x, y, z);
    screws.add(screw);

    // Circular head.
    const headShape = new THREE.Shape();
    headShape.absarc(0, 0, radius, 0, Math.PI * 2, false);

    // Three-armed opening in the head.
    const recess = new THREE.Path();
    const outline = [];

    for (let arm = 0; arm < 3; arm++) {
      const angle = arm * Math.PI * 2 / 3;

      const points = [
        [radius * 0.68, -0.17],
        [radius * 0.68, 0.17],
        [radius * 0.19, Math.PI / 3]
      ];

      for (const [distance, offset] of points) {
        outline.push([
          Math.cos(angle + offset) * distance,
          Math.sin(angle + offset) * distance
        ]);
      }
    }

    outline.reverse();

    for (let i = 0; i < outline.length; i++) {
      const [pointX, pointY] = outline[i];

      if (i === 0) {
        recess.moveTo(pointX, pointY);
      } else {
        recess.lineTo(pointX, pointY);
      }
    }

    recess.closePath();
    headShape.holes.push(recess);

    const headGeometry = new THREE.ExtrudeGeometry(headShape, {
      depth: 0.038,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      curveSegments: 16
    });

    const head = new THREE.Mesh(headGeometry, material);
    screw.add(head);

    // Metal bottom beneath the recessed opening.
    const baseGeometry = new THREE.CylinderGeometry(
      radius * 0.94,
      radius * 0.94,
      0.018,
      32
    );

    const base = new THREE.Mesh(baseGeometry, material);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.045;
    screw.add(base);

    // Shaft.
    const shaftStart = 0.05;
    const shaftLength = length - shaftStart;

    const shaftGeometry = new THREE.CylinderGeometry(
      radius * 0.5,
      radius * 0.5,
      shaftLength,
      24
    );

    const shaft = new THREE.Mesh(shaftGeometry, material);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = shaftStart + shaftLength / 2;
    screw.add(shaft);

    // Helical thread around the shaft.
    const threadPoints = [];
    const turns = 7;
    const segments = turns * 28;

    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      const angle = progress * turns * Math.PI * 2;

      threadPoints.push(new THREE.Vector3(
        Math.cos(angle) * radius * 0.56,
        Math.sin(angle) * radius * 0.56,
        0.08 + progress * (length - 0.12)
      ));
    }

    const threadCurve = new THREE.CatmullRomCurve3(threadPoints);

    const threadGeometry = new THREE.TubeGeometry(
      threadCurve,
      segments,
      radius * 0.095,
      5,
      false
    );

    screw.add(new THREE.Mesh(threadGeometry, material));

    // Pointed tip.
    const tipGeometry = new THREE.ConeGeometry(
      radius * 0.49,
      0.08,
      20
    );

    const tip = new THREE.Mesh(tipGeometry, material);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = length + 0.005;
    screw.add(tip);
  }

  return screws;
}

async function loadConsole() {
  try {
    const gltf = await loader.loadAsync("./assets/gba.glb");

    configureScreenLens(gltf.scene);

    // Remove disconnected fragments from both shells.
    for (const name of ["front", "rear"]) {
      const shell = gltf.scene.getObjectByName(name);

      if (shell && shell.isMesh) {
        shell.geometry = shell.geometry.clone();
        cleanShellGeometry(shell.geometry);
      }
    }

    // Replace the imported screw meshes with detailed screws.
    const importedScrews = gltf.scene.getObjectByName("screws");

    if (importedScrews) {
      importedScrews.removeFromParent();
    }

    gltf.scene.add(createScrews());

    gba.add(gltf.scene);

    // Restore a silver finish on the battery contacts.
    for (const name of ["battery_slot_left", "battery_slot_right"]) {
      const contact = gltf.scene.getObjectByName(name);

      if (contact && contact.isMesh) {
        const material = contact.material.clone();

        material.map = null;
        material.metalnessMap = null;
        material.roughnessMap = null;

        material.color.set(0xbfc3c7);
        material.metalness = 1;
        material.roughness = 0.2;

        contact.material = material;
      }
    }

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

      // Replacement screws.
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

// Configure the printed border and the clear protective window.
function configureScreenLens(model) {
  const frame = model.getObjectByName("lens_frame");
  const glass = model.getObjectByName("lens");

  // Opaque printed border, preserving the original logo.
  if (frame && frame.isMesh) {
    frame.geometry = frame.geometry.clone();

    const positions = frame.geometry.getAttribute("position");

    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, 0.55);
    }

    positions.needsUpdate = true;
    frame.geometry.computeVertexNormals();
    frame.geometry.computeBoundingBox();
    frame.geometry.computeBoundingSphere();

    frame.material = new THREE.MeshStandardMaterial({
      map: frame.material.map,
      color: 0xffffff,
      metalness: 0,
      roughness: 0.35,
      envMapIntensity: 0.15,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide
    });
  }

  // Clear glass with sharp, restrained reflections.
  if (glass && glass.isMesh) {
    glass.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.025,
      transmission: 1,
      thickness: 0,
      ior: 1.49,
      opacity: 1,
      transparent: false,
      envMapIntensity: 0.6,
      side: THREE.DoubleSide
    });
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
