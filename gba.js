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

let explosionProgress = 0;
let explosionTarget = 0;

const explosionSpeed = 8;

// Read the target position from the slider.
function updateExplosion() {
  explosionTarget = Number(spreadSlider.value) / 100;
}

spreadSlider.addEventListener("input", updateExplosion);

// Smoothly move the parts toward the target.
function animateExplosion(deltaTime) {
  const smoothing = 1 - Math.exp(-explosionSpeed * deltaTime);

  explosionProgress += (
    explosionTarget - explosionProgress
  ) * smoothing;

  // Reach the exact target when the remaining difference is tiny.
  if (Math.abs(explosionTarget - explosionProgress) < 0.0001) {
    explosionProgress = explosionTarget;
  }

  for (const part of movableParts) {
    part.object.position.copy(part.initialPosition);
    part.object.position.addScaledVector(
      part.offset,
      explosionProgress
    );
  }
}

// Shell visibility.
const hideShellCheckbox = document.getElementById("hide-shell");
const shellParts = [];

function updateShellVisibility() {
  const visible = !hideShellCheckbox.checked;

  for (const part of shellParts) {
    part.visible = visible;
  }
}

hideShellCheckbox.addEventListener("change", updateShellVisibility);

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

    // Collect the outer shell, protective window and screen.
    for (const name of [
      "front",
      "rear",
      "cover",
      "lens",
      "lens_frame",
      "lcd_face"
    ]) {
      const part = gltf.scene.getObjectByName(name);

      if (part) {
        shellParts.push(part);
      }
    }

    // Apply the checkbox state once the model is available.
    updateShellVisibility();

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

    // Add the circuit board in the model's coordinate system.
    const circuitBoard = await createCircuitBoard();
    gltf.scene.add(circuitBoard);

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

// Convert PCB image coordinates to model coordinates.
function pcbPoint(u, v) {
  return new THREE.Vector2(
    (u - 1000) * 0.00518,
    (580 - v) * 0.00518 + 0.02
  );
}

// Create printed markings for a chip.
function createChipLabel(width, height, lines) {
  const labelWidth = width * 0.86;
  const labelHeight = height * 0.7;

  const canvas = document.createElement("canvas");

  canvas.width = 512;
  canvas.height = Math.round(
    canvas.width * labelHeight / labelWidth
  );

  const context = canvas.getContext("2d");
  const lineSpacing = canvas.height / (lines.length + 1);
  const fontSize = Math.floor(lineSpacing * 0.55);

  context.fillStyle = "#9a9d98";
  context.font = `${fontSize}px monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (let i = 0; i < lines.length; i++) {
    context.fillText(
      lines[i],
      canvas.width / 2,
      lineSpacing * (i + 1),
      canvas.width * 0.94
    );
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(labelWidth, labelHeight),
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      metalness: 0,
      roughness: 0.7
    })
  );

  label.name = "chip_label";

  // Place the print just above the package surface.
  label.position.z = 0.1285;

  return label;
}

// Build a chip package with metallic pins.
function createChip(width, height, horizontalPins, verticalPins) {
  const chip = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b24,
    metalness: 0,
    roughness: 0.5
  });

  const pinMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 1,
    roughness: 0.25
  });

  // Add a box using coordinates relative to the chip.
  function addBox(w, h, depth, material, x, y, z) {
    const geometry = new THREE.BoxGeometry(w, h, depth);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(x, y, z);
    chip.add(mesh);
  }

  // Main package, raised above the board.
  addBox(
    width, height, 0.105,
    bodyMaterial,
    0, 0, 0.075
  );

  const horizontalPitch = width / (horizontalPins + 1);
  const verticalPitch = height / (verticalPins + 1);

  for (const sign of [-1, 1]) {
    // Pins along the top and bottom edges.
    for (let i = 0; i < horizontalPins; i++) {
      const x = -width / 2 + (i + 1) * horizontalPitch;

      // Flat contact near the board.
      addBox(
        0.014, 0.11, 0.016,
        pinMaterial,
        x, sign * (height / 2 + 0.055), 0.009
      );

      // Raised section connecting to the package.
      addBox(
        0.014, 0.035, 0.057,
        pinMaterial,
        x, sign * (height / 2 + 0.01), 0.04
      );
    }

    // Pins along the left and right edges.
    for (let i = 0; i < verticalPins; i++) {
      const y = -height / 2 + (i + 1) * verticalPitch;

      addBox(
        0.11, 0.014, 0.016,
        pinMaterial,
        sign * (width / 2 + 0.055), y, 0.009
      );

      addBox(
        0.035, 0.014, 0.057,
        pinMaterial,
        sign * (width / 2 + 0.01), y, 0.04
      );
    }
  }

  // Add a small orientation mark on the package.
  const orientationMark = new THREE.Mesh(
    new THREE.CircleGeometry(0.025, 24),
    new THREE.MeshStandardMaterial({
      color: 0x30343a,
      metalness: 0,
      roughness: 0.65
    })
  );

  orientationMark.name = "chip_orientation_mark";

  orientationMark.position.set(
    -width * 0.4,
    -height * 0.36,
    0.1285
  );

  chip.add(orientationMark);

  return chip;
}

// Build the metal crystal package and its insulating base.
function createCrystal() {
  const crystal = new THREE.Group();
  crystal.name = "crystal";

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x20232a,
    metalness: 0,
    roughness: 0.65
  });

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 1,
    roughness: 0.3
  });

  // Add a rounded rectangular layer, extruded along local Z.
  function addLayer(width, height, depth, radius, z, material) {
    const x = -width / 2;
    const y = -height / 2;
    const shape = new THREE.Shape();

    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);

    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(
      x + width, y + height,
      x + width - radius, y + height
    );

    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);

    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: false,
      curveSegments: 12
    });

    const layer = new THREE.Mesh(geometry, material);
    layer.position.z = z;

    crystal.add(layer);
  }

  // Insulating base, metal casing and inset top lid.
  addLayer(0.29, 0.8, 0.035, 0.12, 0, baseMaterial);
  addLayer(0.27, 0.77, 0.12, 0.12, 0.035, metalMaterial);
  addLayer(0.23, 0.68, 0.015, 0.1, 0.15, metalMaterial);

  // Print along the length of the casing.
  const label = createChipLabel(0.68, 0.23, ["D419"]);

  label.name = "crystal_label";
  label.rotation.z = Math.PI / 2;
  label.position.z = 0.166;
  label.material.color.set(0x555555);

  crystal.add(label);

  return crystal;
}

// Fit the circuit board to the six fixed screw axes.
function alignCircuitBoard(board) {
  function alignPoint(point) {
    const x = point.x;
    const y = point.y;
    const xy = x * y;
    const yy = y * y;
    const xyy = x * yy;

    point.x =
      -0.0385680468
      + 0.986720407 * x
      + 0.00269863246 * y
      + 0.0111197408 * xy
      - 0.000674551318 * yy
      - 0.00131034960 * xyy;

    point.y =
      -0.0162130082
      + 0.000471694358 * x
      + 1.06370489 * y
      + 0.000117643643 * xy
      + 0.00425071363 * yy
      - 0.000301850031 * xyy;

    return point;
  }

  board.updateWorldMatrix(true, true);

  const worldToBoard = board.matrixWorld.clone().invert();
  const point = new THREE.Vector3();

  for (const child of board.children) {
    const initialPosition = child.position.clone();
    const alignedPosition = alignPoint(initialPosition.clone());
    const displacement = alignedPosition.clone().sub(initialPosition);

    // Transform every mesh in board coordinates, preserving its UVs.
    child.traverse((object) => {
      if (!object.isMesh) {
        return;
      }

      const meshToBoard = new THREE.Matrix4().multiplyMatrices(
        worldToBoard,
        object.matrixWorld
      );

      const boardToMesh = meshToBoard.clone().invert();

      object.geometry = object.geometry.clone();

      const positions = object.geometry.getAttribute("position");

      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        point.applyMatrix4(meshToBoard);

        alignPoint(point);

        // The child's new position supplies this displacement.
        point.sub(displacement);
        point.applyMatrix4(boardToMesh);

        positions.setXYZ(i, point.x, point.y, point.z);
      }

      positions.needsUpdate = true;

      object.geometry.computeVertexNormals();
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
    });

    child.position.copy(alignedPosition);

    // Keep the corrected position when the explosion animation runs.
    for (const part of movableParts) {
      if (part.object === child) {
        part.initialPosition.copy(alignedPosition);
      }
    }
  }

  board.updateWorldMatrix(true, true);
}

// Build the textured circuit board and its main chips.
async function createCircuitBoard() {
  const board = new THREE.Group();
  board.name = "pcb";
  board.position.z = -0.02;

  // Outline points measured on the reference image.
  const outline = [
    [81, 884], [130, 877], [134, 753], [104, 750],
    [92, 598], [79, 559], [79, 481], [101, 423],
    [105, 389], [144, 383], [148, 358], [121, 347],
    [120, 294], [158, 246], [293, 220], [298, 192],
    [367, 192], [389, 212], [435, 214], [482, 91],
    [502, 80], [558, 80], [561, 120], [610, 122],
    [615, 144], [656, 145], [659, 122], [707, 121],
    [711, 91], [1218, 91], [1224, 145], [1260, 145],
    [1266, 92], [1303, 93], [1307, 127], [1452, 128],
    [1457, 81], [1518, 82], [1536, 97], [1574, 210],
    [1615, 211], [1643, 195], [1716, 195], [1720, 218],
    [1855, 246], [1886, 272], [1900, 299], [1900, 350],
    [1917, 357], [1918, 422], [1930, 457], [1935, 494],
    [1916, 548], [1916, 756], [1936, 762], [1937, 907],
    [1924, 934], [1890, 944], [1883, 971], [1858, 980],
    [1850, 1000], [1560, 1080], [1510, 1104], [1459, 1104],
    [1458, 905], [1471, 880], [1470, 685], [1460, 649],
    [1150, 650], [1135, 662], [925, 662], [912, 649],
    [594, 648], [575, 663], [573, 705], [615, 718],
    [616, 753], [638, 771], [638, 820], [617, 834],
    [612, 862], [585, 874], [572, 895], [569, 997],
    [558, 1002], [558, 1054], [516, 1057], [406, 1028],
    [407, 990], [279, 951], [265, 985], [105, 941],
    [81, 919]
  ];

  const shape = new THREE.Shape();

  for (let i = 0; i < outline.length; i++) {
    const [u, v] = outline[i];
    const point = pcbPoint(u, v);

    if (i === 0) {
      shape.moveTo(point.x, point.y);
    } else {
      shape.lineTo(point.x, point.y);
    }
  }

  shape.closePath();

  // Hole center U, V and radius, in image pixels.
  const holes = [
    [510, 106, 17],
    [1505, 105, 17],
    [365, 302, 17],
    [1649, 302, 17],
    [1704, 423, 22],
    [399, 689, 16],
    [135, 698, 16],
    [333, 852, 16],
    [113, 910, 15],
    [1876, 644, 16],
    [1905, 909, 16],
    [1550, 960, 15],
    [1580, 1024, 15],
    [1775, 579, 14]
  ];

  for (const [u, v, radius] of holes) {
    const point = pcbPoint(u, v);
    const hole = new THREE.Path();

    hole.absarc(
      point.x,
      point.y,
      radius * 0.00518,
      0,
      Math.PI * 2,
      true
    );

    shape.holes.push(hole);
  }

  // Extrude the outline and center its thickness around Z = 0.
  const thickness = 0.07;

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 16
  });

  geometry.translate(0, 0, -thickness / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0x506b4c,
    metalness: 0,
    roughness: 0.74
  });

  const substrate = new THREE.Mesh(geometry, material);
  substrate.name = "pcb_substrate";

  board.add(substrate);

  // Load and align the front and back textures.
  const textureLoader = new THREE.TextureLoader();

  const imageWidth = 2000;
  const imageHeight = 1163;

  for (const face of ["front", "back"]) {
    const texture = await textureLoader.loadAsync(
      `./assets/pcb-${face}.png`
    );

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Reuse the outline and its holes for each flat surface.
    const faceGeometry = new THREE.ShapeGeometry(shape, 16);
    const positions = faceGeometry.getAttribute("position");
    const uv = faceGeometry.getAttribute("uv");

    for (let i = 0; i < positions.count; i++) {
      // Convert model coordinates back to image coordinates.
      let u = positions.getX(i) / 0.00518 + 1000;
      let v = 580 - (positions.getY(i) - 0.02) / 0.00518;

      // Mirror and align the back reference image.
      if (face === "back") {
        u = imageWidth + 6 - u;
        v -= 10;
      }

      uv.setXY(
        i,
        u / imageWidth,
        1 - v / imageHeight
      );
    }

    uv.needsUpdate = true;

    let side = THREE.FrontSide;
    let positionZ = thickness / 2 + 0.001;

    if (face === "back") {
      side = THREE.BackSide;
      positionZ = -thickness / 2 - 0.001;
    }

    const faceMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      metalness: 0,
      roughness: 0.72,
      side: side
    });

    const surface = new THREE.Mesh(faceGeometry, faceMaterial);
    surface.name = `pcb_${face}`;
    surface.position.z = positionZ;

    board.add(surface);
  }

  // Main chips, positioned using the reference image.
  const chipSettings = [
    {
      name: "cpu",
      u: 975,
      v: 352,
      width: 1.41,
      height: 0.98,
      horizontalPins: 38,
      verticalPins: 26,
      offset: new THREE.Vector3(-0.45, 0.5, 2.2),
      back: false,
      labels: [
        "CPU AGB A",
        "© 2000 Nintendo",
        "JAPAN ARM",
        "0244"
      ]
    },
    {
      name: "ram",
      u: 1332,
      v: 285,
      width: 0.83,
      height: 0.94,
      horizontalPins: 0,
      verticalPins: 24,
      offset: new THREE.Vector3(0.5, 0.8, 1.9),
      back: false,
      labels: [
        "JAPAN",
        "82D12160",
        "-10FN"
      ]
    },
    {
      name: "amp",
      u: 331,
      v: 670,
      width: 0.58,
      height: 0.36,
      horizontalPins: 9,
      verticalPins: 0,
      offset: new THREE.Vector3(1.35, -0.4, -1.7),
      back: true,
      labels: [
        "AMP AGB",
        "IR3R60N"
      ]
    },
    {
      name: "power",
      u: 1756,
      v: 379,
      width: 0.3,
      height: 0.44,
      horizontalPins: 0,
      verticalPins: 8,
      offset: new THREE.Vector3(-1.3, 0.5, -1.65),
      back: true,
      labels: [
        "MITSUMI",
        "514X"
      ]
    }
  ];

  for (const settings of chipSettings) {
    const chip = createChip(
      settings.width,
      settings.height,
      settings.horizontalPins,
      settings.verticalPins
    );

    chip.name = settings.name;

    // Convert back-photo coordinates to the board coordinate system.
    let u = settings.u;
    let v = settings.v;
    let z = thickness / 2 + 0.002;

    if (settings.back) {
      u = 2006 - u;
      v += 10;
      z = -thickness / 2 - 0.002;

      // Face outward from the back of the board.
      chip.rotation.y = Math.PI;
    }

    const point = pcbPoint(u, v);

    chip.position.set(point.x, point.y, z);

    // Attach the printed markings to the chip.
    chip.add(
      createChipLabel(
        settings.width,
        settings.height,
        settings.labels
      )
    );

    board.add(chip);

    // Register the chip with the existing explosion animation.
    movableParts.push({
      object: chip,
      initialPosition: chip.position.clone(),
      offset: settings.offset
    });
  }

  // Position the crystal on the front reference image.
  const crystal = createCrystal();
  const crystalPoint = pcbPoint(669, 304);

  crystal.position.set(
    crystalPoint.x,
    crystalPoint.y,
    thickness / 2 + 0.002
  );

  board.add(crystal);

  // Register its movement relative to the board.
  movableParts.push({
    object: crystal,
    initialPosition: crystal.position.clone(),
    offset: new THREE.Vector3(-1, 0.55, 1.85)
  });

  // Align the completed board, including its components and markings.
  alignCircuitBoard(board);

  return board;
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
let previousTime = performance.now();

function animate() {
  const currentTime = performance.now();

  // Elapsed time in seconds, capped to avoid jumps after a pause.
  const deltaTime = Math.min(
    (currentTime - previousTime) / 1000,
    0.05
  );

  previousTime = currentTime;

  animateExplosion(deltaTime);
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
