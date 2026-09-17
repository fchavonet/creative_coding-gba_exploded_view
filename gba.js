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

// Shared displacement for the small components on the rear PCB face.
const rearComponentsOffset = new THREE.Vector3(0, 0.35, -0.65);

// Shared displacement for the small components on the front PCB face.
const frontComponentsOffset = new THREE.Vector3(0, -0.25, 0.65);

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

// Build the T1 component with its base and eight metallic contacts.
function createTransformer() {
  const transformer = new THREE.Group();
  transformer.name = "transformer";

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b24,
    metalness: 0,
    roughness: 0.65
  });

  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0x303238,
    metalness: 0,
    roughness: 0.8
  });

  const contactMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 1,
    roughness: 0.3
  });

  // Square insulating base.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.58, 0.08),
    baseMaterial
  );

  base.position.z = 0.06;
  transformer.add(base);

  // Cylindrical body, perpendicular to the board.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.22, 32),
    coreMaterial
  );

  core.rotation.x = Math.PI / 2;
  core.position.z = 0.17;
  transformer.add(core);

  // Slightly raised circular top.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.025, 32),
    baseMaterial
  );

  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.29;
  transformer.add(cap);

  // Four contacts on each side.
  for (const y of [-0.33, 0.33]) {
    for (let i = 0; i < 4; i++) {
      const contact = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.14, 0.03),
        contactMaterial
      );

      contact.position.set(
        -0.225 + i * 0.15,
        y,
        0.025
      );

      transformer.add(contact);
    }
  }

  // Print just above the top surface.
  const label = createChipLabel(0.3, 0.18, ["T1"]);

  label.name = "transformer_label";
  label.position.z = 0.3035;

  transformer.add(label);

  return transformer;
}

// Build an electrolytic capacitor with its base and top markings.
function createCapacitor(radius, height, marking) {
  const capacitor = new THREE.Group();

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b24,
    metalness: 0,
    roughness: 0.65
  });

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 1,
    roughness: 0.3
  });

  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0xd5d7d5,
    metalness: 0.7,
    roughness: 0.4
  });

  // Square insulating base.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(
      radius * 2.2,
      radius * 2.2,
      0.05
    ),
    baseMaterial
  );

  base.position.z = 0.025;
  capacitor.add(base);

  // Metal can, perpendicular to the board.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 32),
    metalMaterial
  );

  body.rotation.x = Math.PI / 2;
  body.position.z = height / 2 + 0.04;
  capacitor.add(body);

  // Top disk overlapping the can slightly to avoid a gap.
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * 0.92,
      radius * 0.92,
      0.006,
      32
    ),
    topMaterial
  );

  top.rotation.x = Math.PI / 2;
  top.position.z = height + 0.042;
  capacitor.add(top);

  // Dark polarity stripe on the top surface.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, radius * 1.5, 0.004),
    baseMaterial
  );

  stripe.position.set(-radius * 0.6, 0, height + 0.047);
  capacitor.add(stripe);

  // Printed value, placed above the top disk.
  const label = createChipLabel(
    radius * 1.4,
    radius * 0.7,
    [marking]
  );

  label.name = "capacitor_label";
  label.position.set(radius * 0.1, 0, height + 0.046);
  label.material.color.set(0x353d3c);

  capacitor.add(label);

  return capacitor;
}

// Build the rear inductor and its printed marking.
function createInductor() {
  const inductor = new THREE.Group();
  inductor.name = "inductor";

  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x20232a,
    metalness: 0,
    roughness: 0.7
  });

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x245a6c,
    metalness: 0,
    roughness: 0.6
  });

  // Square base resting on the board.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.46, 0.04),
    darkMaterial
  );

  base.position.z = 0.02;
  inductor.add(base);

  // Cylindrical body.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.27, 32),
    bodyMaterial
  );

  body.rotation.x = Math.PI / 2;
  body.position.z = 0.15;
  inductor.add(body);

  // Dark circular top.
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.01, 32),
    darkMaterial
  );

  top.rotation.x = Math.PI / 2;
  top.position.z = 0.289;
  inductor.add(top);

  // Place the marking just above the top surface.
  const label = createChipLabel(0.27, 0.16, ["101"]);

  label.name = "inductor_label";
  label.position.z = 0.295;

  inductor.add(label);

  return inductor;
}

// Build the LCD ribbon socket, locking bar and 32 contacts.
function createLcdSocket() {
  const socket = new THREE.Group();
  socket.name = "lcd_socket";

  const housingMaterial = new THREE.MeshStandardMaterial({
    color: 0xe3d7b5,
    metalness: 0,
    roughness: 0.6
  });

  const latchMaterial = new THREE.MeshStandardMaterial({
    color: 0x20232a,
    metalness: 0,
    roughness: 0.55
  });

  const contactMaterial = new THREE.MeshStandardMaterial({
    color: 0xc6a45c,
    metalness: 1,
    roughness: 0.3
  });

  const mountingMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 1,
    roughness: 0.3
  });

  // Add a rectangular part in the socket's local coordinates.
  function addBox(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    socket.add(mesh);
  }

  // Ivory plastic housing.
  addBox(
    1.43, 0.31, 0.17,
    housingMaterial,
    0, 0, 0.11
  );

  // Dark locking bar along the ribbon entry.
  addBox(
    1.3, 0.06, 0.08,
    latchMaterial,
    0, 0.16, 0.2
  );

  // Exposed contact tails along the opposite edge.
  for (let i = 0; i < 32; i++) {
    addBox(
      0.014, 0.11, 0.025,
      contactMaterial,
      -0.62 + i * 0.04, -0.2, 0.022
    );
  }

  // Metal mounting tabs at both ends.
  for (const x of [-0.75, 0.75]) {
    addBox(
      0.09, 0.29, 0.05,
      mountingMaterial,
      x, 0, 0.035
    );
  }

  return socket;
}

// Build the curved LCD ribbon using the calibrated socket position.
function createLcdRibbon(socket) {
  const ribbon = new THREE.Group();
  ribbon.name = "lcd_ribbon";

  const x = socket.position.x;

  // Keep the front section behind the LCD and retain the socket connection.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, 1.75, 0.20),
    new THREE.Vector3(x, socket.position.y + 0.48, 0.20),
    new THREE.Vector3(x, socket.position.y + 0.48, -0.14),
    new THREE.Vector3(
      x,
      socket.position.y + 0.155,
      socket.position.z - 0.12
    )
  ]);

  const segments = 48;
  const halfWidth = 0.61;
  const vertices = [];
  const indices = [];

  // Create two vertices across the ribbon at each curve sample.
  for (let i = 0; i <= segments; i++) {
    const point = curve.getPoint(i / segments);

    vertices.push(
      point.x - halfWidth, point.y, point.z,
      point.x + halfWidth, point.y, point.z
    );

    if (i < segments) {
      const index = i * 2;

      indices.push(
        index, index + 1, index + 2,
        index + 1, index + 3, index + 2
      );
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const ribbonMaterial = new THREE.MeshStandardMaterial({
    color: 0xb96520,
    metalness: 0,
    roughness: 0.45,
    side: THREE.DoubleSide
  });

  ribbon.add(new THREE.Mesh(geometry, ribbonMaterial));

  const trackMaterial = new THREE.MeshStandardMaterial({
    color: 0xc6a45c,
    metalness: 1,
    roughness: 0.35
  });

  // Follow the ribbon surface with 32 slightly raised tracks.
  for (let track = 0; track < 32; track++) {
    const points = [];
    const offsetX = -0.58 + track * (1.16 / 31);

    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      const point = curve.getPoint(progress);
      const tangent = curve.getTangent(progress);

      const normal = new THREE.Vector3(
        0,
        -tangent.z,
        tangent.y
      ).normalize();

      point.x += offsetX;
      point.addScaledVector(normal, 0.005);

      points.push(point);
    }

    const trackGeometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      segments,
      0.003,
      4,
      false
    );

    ribbon.add(new THREE.Mesh(trackGeometry, trackMaterial));
  }

  return ribbon;
}

// Build the cartridge socket with molded guides and exposed solder tails.
const cartridgeMounts = [
  { u: 452, v: 590 },
  { u: 1447, v: 588 }
];

function createCartridgeSocket() {
  const socket = new THREE.Group();
  socket.name = "cartridge_socket";

  const housingMaterial = new THREE.MeshStandardMaterial({
    color: 0x101214,
    metalness: 0,
    roughness: 0.78
  });

  const contactMaterial = new THREE.MeshStandardMaterial({
    color: 0xbda365,
    metalness: 1,
    roughness: 0.35
  });

  const solderMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5c8c9,
    metalness: 0.9,
    roughness: 0.35
  });

  function addBox(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    socket.add(mesh);

    return mesh;
  }

  // Plastic base covering the PCB connection area.
  addBox(
    4.42, 1.34, 0.06,
    housingMaterial,
    0, -0.13, 0.045
  );

  // Broad outer wall.
  addBox(
    4.08, 0.94, 0.07,
    housingMaterial,
    0, -0.04, 0.445
  );

  // Raised lip along the cartridge opening.
  addBox(
    4.08, 0.065, 0.035,
    housingMaterial,
    0, 0.405, 0.492
  );

  // Lower plastic housing enclosing the contact terminations.
  addBox(
    4.42, 0.28, 0.45,
    housingMaterial,
    0, -0.64, 0.235
  );

  // Subtle molded ridge across the outer wall.
  addBox(
    3.92, 0.045, 0.018,
    housingMaterial,
    0, -0.34, 0.487
  );

  // Side guides and wider mounting feet.
  for (const sign of [-1, 1]) {
    addBox(
      0.14, 1.08, 0.45,
      housingMaterial,
      sign * 2.14, 0, 0.235
    );

    addBox(
      0.28, 0.28, 0.1,
      housingMaterial,
      sign * 2.14, -0.43, 0.075
    );

    // Short raised shoulder near the insertion end.
    addBox(
      0.2, 0.24, 0.08,
      housingMaterial,
      sign * 2.11, 0.36, 0.5
    );

    addBox(
      0.12, 0.2, 0.025,
      solderMaterial,
      sign * 2.25, -0.43, 0.018
    );
  }

  // Internal cartridge contacts and PCB-facing connection pins.
  const contactCount = 32;
  const contactSpan = 3.76;
  const contactPitch = contactSpan / (contactCount - 1);

  for (let i = 0; i < contactCount; i++) {
    const x = -contactSpan / 2 + i * contactPitch;

    // Contact strip inside the insertion channel.
    addBox(
      0.028, 0.54, 0.028,
      contactMaterial,
      x, -0.03, 0.09
    );

    // Raised contact area facing the cartridge.
    addBox(
      0.032, 0.16, 0.035,
      contactMaterial,
      x, -0.1, 0.115
    );

    // Connection pin emerging toward the PCB beneath the housing.
    addBox(
      0.026, 0.038, 0.12,
      contactMaterial,
      x, -0.64, -0.035
    );

    // Molded separators between adjacent contact strips.
    if (i < contactCount - 1) {
      addBox(
        0.018, 0.67, 0.035,
        housingMaterial,
        x + contactPitch / 2, 0.015, 0.092
      );
    }
  }

  // Side arms with retaining hooks passing through the PCB.
  for (const mount of cartridgeMounts) {
    // Coordinates relative to the socket, before board calibration.
    const x = (mount.u - 976) * 0.00518;
    const y = (458 - mount.v) * 0.00518;
    const sign = Math.sign(x);

    const rootX = sign * 2.1;
    const armWidth = Math.abs(x - rootX) + 0.09;
    const armCenterX = (rootX + x) / 2;

    // Horizontal arm connecting the housing to the slot.
    addBox(
      armWidth, 0.24, 0.12,
      housingMaterial,
      armCenterX, y, 0.105
    );

    // Narrow stem crossing the board.
    addBox(
      0.06, 0.19, 0.17,
      housingMaterial,
      x, y, -0.025
    );

    // Outward-facing retaining lip beneath the board.
    addBox(
      0.12, 0.19, 0.035,
      housingMaterial,
      x + sign * 0.035, y, -0.12
    );
  }

  return socket;
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

// Build a three-terminal package matching its PCB pad spacing.
function createThreePinPackage(spanX, spanY) {
  const component = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x202326,
    metalness: 0,
    roughness: 0.65
  });

  const terminalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 0.85,
    roughness: 0.35
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(
      spanX * 0.6,
      spanY + 0.055,
      0.065
    ),
    bodyMaterial
  );

  body.position.z = 0.0475;
  component.add(body);

  // One terminal on the left, two on the right.
  const terminalPositions = [
    [-spanX / 2, 0],
    [spanX / 2, -spanY / 2],
    [spanX / 2, spanY / 2]
  ];

  for (const [x, y] of terminalPositions) {
    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(
        spanX * 0.5,
        0.04,
        0.025
      ),
      terminalMaterial
    );

    terminal.position.set(x, y, 0.0175);
    component.add(terminal);
  }

  return component;
}

// Build a five-terminal package with three contacts on the left.
function createFivePinPackage() {
  const component = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x202326,
    metalness: 0,
    roughness: 0.65
  });

  const terminalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 0.85,
    roughness: 0.35
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.15, 0.065),
    bodyMaterial
  );

  body.position.z = 0.0475;
  component.add(body);

  const terminalPositions = [
    [-0.08, 0.047],
    [-0.08, 0],
    [-0.08, -0.047],
    [0.08, 0.047],
    [0.08, -0.047]
  ];

  for (const [x, y] of terminalPositions) {
    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.028, 0.025),
      terminalMaterial
    );

    terminal.position.set(x, y, 0.0175);
    component.add(terminal);
  }

  return component;
}

// Build a small filter package with three terminals on each side.
function createPcbFilter() {
  const filter = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x202326,
    metalness: 0,
    roughness: 0.68
  });

  const terminalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 0.85,
    roughness: 0.32
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.29, 0.34, 0.10),
    bodyMaterial
  );

  body.position.z = 0.06;
  filter.add(body);

  // Three metal terminals on each side of the package.
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const terminal = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.055, 0.045),
        terminalMaterial
      );

      terminal.position.set(
        sign * 0.16,
        (i - 1) * 0.115,
        0.0275
      );

      filter.add(terminal);
    }
  }

  return filter;
}

// Add surface-mounted components on both PCB faces.
function addPcbSurfaceComponents(board, thickness) {
  const resistorMaterial = new THREE.MeshStandardMaterial({
    color: 0x252729,
    metalness: 0,
    roughness: 0.72
  });

  const ceramicMaterial = new THREE.MeshStandardMaterial({
    color: 0x9c8870,
    metalness: 0,
    roughness: 0.8
  });

  const terminalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 0.85,
    roughness: 0.35
  });

  // Pixel coordinates on each component's PCB texture.
  // Angle describes the component orientation in that image.
  const settings = [
    { name: "R7", u: 231, v: 648, type: "resistor", angle: 0 },
    { name: "C48", u: 231, v: 666, type: "capacitor", angle: 0 },
    { name: "R8", u: 231, v: 683, type: "resistor", angle: 0 },
    { name: "C49", u: 231, v: 701, type: "capacitor", angle: 0 },

    { name: "C45", u: 421, v: 674, type: "capacitor", angle: 0 },
    { name: "C46", u: 421, v: 692, type: "capacitor", angle: 0 },
    { name: "C47", u: 421, v: 708, type: "capacitor", angle: 0 },

    { name: "C38", u: 410, v: 609, type: "capacitor", angle: 90 },
    { name: "C39", u: 282, v: 573, type: "capacitor", angle: 90 },

    // Small components above the audio amplifier.
    { name: "R30", u: 391, v: 460, type: "resistor", angle: 0 },
    { name: "R31", u: 391, v: 480, type: "resistor", angle: 0 },

    // Components near the left shoulder switch.
    { name: "R43", u: 224, v: 352, type: "resistor", angle: 0 },
    { name: "C63", u: 260, v: 352, type: "capacitor", angle: 0 },
    { name: "R26", u: 438, v: 340, type: "resistor", angle: 90 },
    { name: "R18", u: 462, v: 340, type: "resistor", angle: 90 },
    { name: "R25", u: 418, v: 241, type: "resistor", angle: 0 },
    { name: "R10", u: 450, v: 239, type: "resistor", angle: 90 },

    // Components around the upper filter footprints.
    { name: "C20", u: 618, v: 219, type: "capacitor", angle: 0 },
    { name: "R35", u: 620, v: 260, type: "resistor", angle: 0 },
    { name: "C19", u: 813, v: 251, type: "capacitor", angle: 0 },
    { name: "C18", u: 850, v: 251, type: "capacitor", angle: 0 },

    // Components below the LCD connector.
    { name: "C14", u: 1064, v: 229, type: "capacitor", angle: 0 },
    { name: "C13", u: 1262, v: 229, type: "capacitor", angle: 0 },

    // Components near the right shoulder switch.
    { name: "C64", u: 1662, v: 220, type: "capacitor", angle: 0 },
    { name: "R44", u: 1696, v: 233, type: "resistor", angle: 0 },
    { name: "C25", u: 1710, v: 314, type: "capacitor", angle: 90 },

    // Components beside the power management chip.
    { name: "C22", u: 1838, v: 357, type: "capacitor", angle: 0 },
    { name: "C23", u: 1838, v: 380, type: "capacitor", angle: 0 },
    { name: "C24", u: 1841, v: 405, type: "capacitor", angle: 0 },
    { name: "C30", u: 1596, v: 418, type: "capacitor", angle: 0 },

    // Components near the electrolytic capacitors.
    { name: "C36", u: 1851, v: 534, type: "capacitor", angle: 90 },
    { name: "C35", u: 1855, v: 620, type: "capacitor", angle: 90 },
    { name: "R12", u: 1808, v: 593, type: "resistor", angle: 0 },

    // Small components around the power transistors.
    { name: "R29", u: 1540, v: 448, type: "resistor", angle: 0 },
    { name: "C61", u: 1540, v: 470, type: "capacitor", angle: 90 },
    { name: "R11", u: 1667, v: 457, type: "resistor", angle: 0 },
    { name: "R33", u: 1800, v: 428, type: "resistor", angle: 0 },
    { name: "R16", u: 1682, v: 578, type: "resistor", angle: 90 },

    // Larger ceramic capacitors.
    { name: "C56", u: 1647, v: 530, type: "capacitor", angle: 90, length: 0.21, width: 0.085 },
    { name: "C44", u: 1545, v: 659, type: "capacitor", angle: 0, length: 0.20, width: 0.09 },
    { name: "C43", u: 1675, v: 789, type: "capacitor", angle: 90, length: 0.20, width: 0.085 },

    // Components beside the lower electrolytic capacitors.
    { name: "C41", u: 1812, v: 691, type: "capacitor", angle: 90 },
    { name: "C40", u: 1831, v: 691, type: "capacitor", angle: 90 },

    // Resistor near the power switch.
    { name: "R13", u: 1796, v: 915, type: "resistor", angle: 90 },

    // Front face: components above the processor and memory.
    { name: "C34", u: 795, v: 206, type: "capacitor", angle: 0, front: true },
    { name: "R36", u: 982, v: 206, type: "resistor", angle: 0, front: true },
    { name: "C16", u: 1095, v: 201, type: "capacitor", angle: 0, front: true },
    { name: "C17", u: 1172, v: 209, type: "capacitor", angle: 90, front: true },

    // Front face: components below and beside the processor.
    { name: "C5", u: 817, v: 502, type: "capacitor", angle: 0, front: true },
    { name: "R5", u: 864, v: 507, type: "resistor", angle: 0, front: true },
    { name: "R40", u: 895, v: 505, type: "resistor", angle: 90, front: true },
    { name: "C6", u: 1122, v: 502, type: "capacitor", angle: 0, front: true },
    { name: "C15", u: 1166, v: 436, type: "capacitor", angle: 90, front: true },

    // Front face: capacitor below the memory.
    { name: "C7", u: 1381, v: 527, type: "capacitor", angle: 0, front: true },

    // Front face: components above and beside the crystal.
    { name: "R45", u: 499, v: 214, type: "resistor", angle: 90, front: true },
    { name: "C58", u: 523, v: 224, type: "capacitor", angle: 90, front: true },
    { name: "C52", u: 767, v: 341, type: "capacitor", angle: 0, front: true },
    { name: "C53", u: 767, v: 368, type: "capacitor", angle: 0, front: true },

    // Front face: components beside the Start button area.
    { name: "R32", u: 492, v: 689, type: "resistor", angle: 0, front: true },
    { name: "C37", u: 492, v: 706, type: "capacitor", angle: 0, front: true },

    // Front face: components below the A and B button contacts.
    { name: "C9", u: 1578, v: 690, type: "capacitor", angle: 90, front: true },
    { name: "C10", u: 1597, v: 690, type: "capacitor", angle: 90, front: true },
    { name: "C12", u: 1819, v: 659, type: "capacitor", angle: 0, front: true },

    // Front face: remaining components below the button contacts.
    { name: "R3", u: 1633, v: 690, type: "resistor", angle: 90, front: true },
    { name: "C11", u: 1652, v: 690, type: "capacitor", angle: 90, front: true },
    { name: "R4", u: 1685, v: 689, type: "resistor", angle: 90, front: true },

    // Front face: capacitor to the left of EM7.
    { name: "C62", u: 550, v: 433, type: "capacitor", angle: 0, front: true },

    // Front face: resistors above the speaker area.
    { name: "R19", u: 1614, v: 770, type: "resistor", angle: 0, front: true },
    { name: "R20", u: 1614, v: 790, type: "resistor", angle: 0, front: true },

    // Front face: vertical component column beside the crystal, top to bottom.
    { name: "C3", u: 728, v: 262, type: "capacitor", angle: 90, front: true },
    { name: "R1", u: 728, v: 290, type: "resistor", angle: 90, front: true },
    { name: "R41", u: 728, v: 319, type: "resistor", angle: 90, front: true },
    { name: "C4", u: 728, v: 348, type: "capacitor", angle: 90, front: true },

    // Front face: resistors below the processor.
    { name: "R39", u: 1069, v: 505, type: "resistor", angle: 90, front: true },
    { name: "R38", u: 1088, v: 505, type: "resistor", angle: 90, front: true },

    // Front face: filter above the processor.
    { name: "EM3", u: 1136, v: 205, type: "ferrite", angle: 0, length: 0.19, width: 0.09, front: true },

    // Front face: filter beside the crystal.
    { name: "EM7", u: 598, v: 429, type: "ferrite", angle: 0, length: 0.17, width: 0.08, front: true },

    // Front face: filters near the speaker area.
    { name: "EM4", u: 1506, v: 857, type: "ferrite", angle: 90, length: 0.15, width: 0.06, front: true },
    { name: "EM5", u: 1590, v: 825, type: "ferrite", angle: 90, length: 0.14, width: 0.06, front: true },
    { name: "EM6", u: 1563, v: 830, type: "ferrite", angle: 90, length: 0.14, width: 0.06, front: true }
  ];

  for (const settingsItem of settings) {
    const component = new THREE.Group();

    component.name = `pcb_${settingsItem.name}`;

    const length = settingsItem.length ?? 0.105;
    const width = settingsItem.width ?? 0.052;
    const terminalLength = length * 0.24;

    let height = 0.045;
    let bodyMaterial = ceramicMaterial;

    if (settingsItem.type === "resistor") {
      height = 0.028;
      bodyMaterial = resistorMaterial;
    }

    // Ferrite filters use a thicker dark body.
    if (settingsItem.type === "ferrite") {
      height = 0.06;
      bodyMaterial = resistorMaterial;
    }

    // Central ceramic or resistive body.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        length - terminalLength * 2,
        width,
        height
      ),
      bodyMaterial
    );

    body.position.z = height / 2;
    component.add(body);

    // Metallic terminals at both ends.
    for (const sign of [-1, 1]) {
      const terminal = new THREE.Mesh(
        new THREE.BoxGeometry(
          terminalLength,
          width + 0.004,
          height + 0.004
        ),
        terminalMaterial
      );

      terminal.position.set(
        sign * (length - terminalLength) / 2,
        0,
        height / 2
      );

      component.add(terminal);
    }

    // Use the rear face unless the entry explicitly selects the front.
    let u = 2006 - settingsItem.u;
    let v = settingsItem.v + 10;
    let z = -thickness / 2 - 0.004;
    let offset = rearComponentsOffset;

    component.rotation.y = Math.PI;

    if (settingsItem.front) {
      u = settingsItem.u;
      v = settingsItem.v;
      z = thickness / 2 + 0.004;
      offset = frontComponentsOffset;

      component.rotation.y = 0;
    }

    const point = pcbPoint(u, v);

    component.position.set(point.x, point.y, z);
    component.rotation.z = THREE.MathUtils.degToRad(
      -settingsItem.angle
    );

    board.add(component);

    // Move each face's small components together.
    movableParts.push({
      object: component,
      initialPosition: component.position.clone(),
      offset: offset.clone()
    });
  }
}

// Build a shoulder switch with a round actuator and folded metal supports.
function createShoulderSwitch() {
  const shoulderSwitch = new THREE.Group();

  const housingMaterial = new THREE.MeshStandardMaterial({
    color: 0x17191c,
    metalness: 0,
    roughness: 0.72
  });

  const actuatorMaterial = new THREE.MeshStandardMaterial({
    color: 0x292c30,
    metalness: 0,
    roughness: 0.85
  });

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 0.9,
    roughness: 0.32
  });

  function addBox(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    shoulderSwitch.add(mesh);

    return mesh;
  }

  // Plastic core and slightly wider bottom base.
  addBox(
    0.40, 0.18, 0.40,
    housingMaterial,
    0, 0, 0.15
  );

  addBox(
    0.44, 0.035, 0.44,
    housingMaterial,
    0, -0.1075, 0.15
  );

  // Thin metal casing around the plastic core.
  for (const sign of [-1, 1]) {
    addBox(
      0.012, 0.18, 0.424,
      metalMaterial,
      sign * 0.206, 0, 0.15
    );

    addBox(
      0.424, 0.18, 0.012,
      metalMaterial,
      0, 0, 0.15 + sign * 0.206
    );
  }

  // Metal face surrounding the actuator.
  addBox(
    0.424, 0.012, 0.424,
    metalMaterial,
    0, 0.096, 0.15
  );

  // Dark collar at the base of the round actuator.
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.105, 0.025, 32),
    housingMaterial
  );

  collar.position.set(0, 0.1145, 0.15);
  shoulderSwitch.add(collar);

  // CylinderGeometry is already oriented along the Y axis.
  const actuator = new THREE.Mesh(
    new THREE.CylinderGeometry(0.082, 0.095, 0.14, 32),
    actuatorMaterial
  );

  actuator.position.set(0, 0.197, 0.15);
  shoulderSwitch.add(actuator);

  // Four small dark retaining studs on the metal face.
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const stud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.028, 0.014, 16),
        housingMaterial
      );

      stud.position.set(
        xSign * 0.16,
        0.109,
        0.15 + zSign * 0.16
      );

      shoulderSwitch.add(stud);
    }
  }

  // Folded side supports extending toward the PCB.
  for (const sign of [-1, 1]) {
    // Bridge joining the casing to the support.
    addBox(
      0.065, 0.035, 0.14,
      metalMaterial,
      sign * 0.2375, -0.065, 0.08
    );

    // Upright section of the folded support.
    addBox(
      0.018, 0.15, 0.14,
      metalMaterial,
      sign * 0.261, -0.1225, 0.08
    );

    // Flat mounting foot resting on the board.
    addBox(
      0.11, 0.23, 0.02,
      metalMaterial,
      sign * 0.225, -0.20, 0.01
    );

    // Narrow end of the mounting foot.
    addBox(
      0.055, 0.065, 0.02,
      metalMaterial,
      sign * 0.225, -0.3475, 0.01
    );

    // Electrical terminal emerging below the housing.
    addBox(
      0.028, 0.18, 0.025,
      metalMaterial,
      sign * 0.12, -0.215, 0.075
    );
  }

  return shoulderSwitch;
}

// Build the PCB-mounted power switch mechanism.
function createPowerSwitch() {
  const powerSwitch = new THREE.Group();

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc3c7,
    metalness: 0.9,
    roughness: 0.35
  });

  const plasticMaterial = new THREE.MeshStandardMaterial({
    color: 0x202226,
    metalness: 0,
    roughness: 0.75
  });

  function addBox(width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    powerSwitch.add(mesh);
  }

  // Insulating base.
  addBox(
    0.94, 0.25, 0.045,
    plasticMaterial,
    0, 0, 0.0225
  );

  // Metal cover.
  addBox(
    0.88, 0.22, 0.025,
    metalMaterial,
    0, 0, 0.205
  );

  // Rear wall, facing the electrical contacts.
  addBox(
    0.88, 0.025, 0.16,
    metalMaterial,
    0, 0.0975, 0.1125
  );

  // End walls and mounting tabs.
  for (const sign of [-1, 1]) {
    addBox(
      0.025, 0.22, 0.16,
      metalMaterial,
      sign * 0.4275, 0, 0.1125
    );

    addBox(
      0.12, 0.25, 0.025,
      metalMaterial,
      sign * 0.48, 0, 0.0125
    );
  }

  // Dark interior behind the opening facing the external slider.
  addBox(
    0.80, 0.035, 0.13,
    plasticMaterial,
    0, -0.055, 0.1125
  );

  // Lower metal lip framing the opening.
  addBox(
    0.88, 0.025, 0.025,
    metalMaterial,
    0, -0.0975, 0.045
  );

  // Shorten the actuator while preserving its engagement with the slider.
  addBox(
    0.16, 0.36, 0.105,
    plasticMaterial,
    0.20, -0.24, 0.115
  );

  // Four solder terminals distributed along the PCB pads.
  for (let i = 0; i < 4; i++) {
    addBox(
      0.11, 0.16, 0.025,
      metalMaterial,
      (i - 1.5) * 0.20, 0.17, 0.0175
    );
  }

  // Reduce the mechanism's depth while keeping its PCB mounting plane.
  powerSwitch.scale.z = 0.6;

  return powerSwitch;
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

  // Cut the two retaining slots through the board.
  for (const mount of cartridgeMounts) {
    const center = pcbPoint(
      2006 - mount.u,
      mount.v + 10
    );

    const halfWidth = 0.05;
    const halfHeight = 0.14;
    const radius = 0.025;

    const left = center.x - halfWidth;
    const right = center.x + halfWidth;
    const bottom = center.y - halfHeight;
    const top = center.y + halfHeight;

    const slot = new THREE.Path();

    // Clockwise rounded rectangle.
    slot.moveTo(left + radius, bottom);

    slot.quadraticCurveTo(left, bottom, left, bottom + radius);
    slot.lineTo(left, top - radius);
    slot.quadraticCurveTo(left, top, left + radius, top);

    slot.lineTo(right - radius, top);
    slot.quadraticCurveTo(right, top, right, top - radius);

    slot.lineTo(right, bottom + radius);
    slot.quadraticCurveTo(right, bottom, right - radius, bottom);

    slot.closePath();
    shape.holes.push(slot);
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

  // Position T1 on the front reference image.
  const transformer = createTransformer();
  const transformerPoint = pcbPoint(230, 846);

  transformer.position.set(
    transformerPoint.x,
    transformerPoint.y,
    thickness / 2 + 0.002
  );

  board.add(transformer);

  // Register its movement before calibrating the board.
  movableParts.push({
    object: transformer,
    initialPosition: transformer.position.clone(),
    offset: new THREE.Vector3(-1.25, -0.8, 1.6)
  });

  // Electrolytic capacitors positioned on the back reference image.
  const capacitorSettings = [
    { u: 1570, v: 577, radius: 0.28, height: 0.38, marking: "470" },
    { u: 1708, v: 646, radius: 0.21, height: 0.3, marking: "100" },
    { u: 432, v: 781, radius: 0.19, height: 0.28, marking: "100" },
    { u: 1756, v: 804, radius: 0.19, height: 0.28, marking: "100" }
  ];

  for (let i = 0; i < capacitorSettings.length; i++) {
    const settings = capacitorSettings[i];

    const capacitor = createCapacitor(
      settings.radius,
      settings.height,
      settings.marking
    );

    capacitor.name = `capacitor_${i + 1}`;

    // Convert back-photo coordinates to board coordinates.
    const point = pcbPoint(
      2006 - settings.u,
      settings.v + 10
    );

    capacitor.position.set(
      point.x,
      point.y,
      -thickness / 2 - 0.002
    );

    capacitor.rotation.y = Math.PI;
    board.add(capacitor);

    // Move the four capacitors together during the explosion.
    movableParts.push({
      object: capacitor,
      initialPosition: capacitor.position.clone(),
      offset: new THREE.Vector3(-0.25, -0.6, -2.25)
    });
  }

  // Position the inductor on the back reference image.
  const inductor = createInductor();
  const inductorPoint = pcbPoint(2006 - 1594, 834 + 10);

  inductor.position.set(
    inductorPoint.x,
    inductorPoint.y,
    -thickness / 2 - 0.002
  );

  inductor.rotation.y = Math.PI;
  board.add(inductor);

  // Register its movement before calibrating the board.
  movableParts.push({
    object: inductor,
    initialPosition: inductor.position.clone(),
    offset: new THREE.Vector3(0.35, -1.1, -2.1)
  });

  // Position the LCD socket on the back reference image.
  const lcdSocket = createLcdSocket();
  const lcdSocketPoint = pcbPoint(2006 - 1164, 157 + 10);

  lcdSocket.position.set(
    lcdSocketPoint.x,
    lcdSocketPoint.y,
    -thickness / 2 - 0.002
  );

  lcdSocket.rotation.y = Math.PI;
  board.add(lcdSocket);

  // Register its movement before calibrating the board.
  movableParts.push({
    object: lcdSocket,
    initialPosition: lcdSocket.position.clone(),
    offset: new THREE.Vector3(-0.2, 1.35, -1.2)
  });

  // Position the cartridge socket on the back reference image.
  const cartridgeSocket = createCartridgeSocket();
  const cartridgeSocketPoint = pcbPoint(2006 - 976, 458 + 10);

  cartridgeSocket.position.set(
    cartridgeSocketPoint.x,
    cartridgeSocketPoint.y,
    -thickness / 2 - 0.002
  );

  cartridgeSocket.rotation.y = Math.PI;
  board.add(cartridgeSocket);

  // Register its movement before calibrating the board.
  movableParts.push({
    object: cartridgeSocket,
    initialPosition: cartridgeSocket.position.clone(),
    offset: new THREE.Vector3(0, 1.6, -1.55)
  });

  // Filters positioned on the back PCB texture.
  const filterSettings = [
    { name: "EM2", u: 680, v: 197 },
    { name: "EM1", u: 837, v: 204 }
  ];

  for (const settings of filterSettings) {
    const filter = createPcbFilter();

    filter.name = `pcb_${settings.name}`;

    const point = pcbPoint(
      2006 - settings.u,
      settings.v + 10
    );

    filter.position.set(
      point.x,
      point.y,
      -thickness / 2 - 0.004
    );

    filter.rotation.y = Math.PI;

    board.add(filter);

    movableParts.push({
      object: filter,
      initialPosition: filter.position.clone(),
      offset: rearComponentsOffset.clone()
    });
  }

  // Three-terminal packages positioned on their respective PCB textures.
  const threePinSettings = [
    {
      name: "Q2",
      u: 1125,
      v: 238,
      spanX: 0.16,
      spanY: 0.11,
      angle: 0
    },
    {
      name: "Q5",
      u: 1624,
      v: 750,
      spanX: 0.135,
      spanY: 0.13,
      angle: 0
    },
    {
      name: "Q6",
      u: 1637,
      v: 482,
      spanX: 0.186,
      spanY: 0.13,
      angle: 180
    },

    // Package near the right shoulder switch.
    {
      name: "Q1",
      u: 1547,
      v: 256,
      spanX: 0.166,
      spanY: 0.11,
      angle: 0
    },

    // Package below the power management chip.
    {
      name: "Q12",
      u: 1838,
      v: 444,
      spanX: 0.166,
      spanY: 0.104,
      angle: 0
    },

    // Package beside the lower electrolytic capacitor.
    {
      name: "Q4",
      u: 1826,
      v: 857,
      spanX: 0.186,
      spanY: 0.14,
      angle: 90
    },

    // Three-terminal diode package above C43.
    {
      name: "D2",
      u: 1699,
      v: 738,
      spanX: 0.176,
      spanY: 0.145,
      angle: 0
    },
    // Front face: three-terminal package above the A/B button contacts.
    {
      name: "Q9",
      u: 1591,
      v: 356,
      spanX: 0.155,
      spanY: 0.104,
      angle: 0,
      front: true
    },
    // Front face: packages beside the Start and Select button area.
    {
      name: "Q7",
      u: 506,
      v: 645,
      spanX: 0.18,
      spanY: 0.14,
      angle: 90,
      front: true
    },
    {
      name: "D3",
      u: 506,
      v: 754,
      spanX: 0.17,
      spanY: 0.145,
      angle: 90,
      front: true
    }
  ];

  for (const settings of threePinSettings) {
    const component = createThreePinPackage(
      settings.spanX,
      settings.spanY
    );

    component.name = `pcb_${settings.name}`;

    // Use the rear face unless the entry selects the front.
    let u = 2006 - settings.u;
    let v = settings.v + 10;
    let z = -thickness / 2 - 0.004;
    let offset = rearComponentsOffset;

    component.rotation.y = Math.PI;

    if (settings.front) {
      u = settings.u;
      v = settings.v;
      z = thickness / 2 + 0.004;
      offset = frontComponentsOffset;

      component.rotation.y = 0;
    }

    const point = pcbPoint(u, v);

    component.position.set(point.x, point.y, z);
    component.rotation.z = THREE.MathUtils.degToRad(
      -settings.angle
    );

    board.add(component);

    movableParts.push({
      object: component,
      initialPosition: component.position.clone(),
      offset: offset.clone()
    });
  }

  // Five-terminal package above the front A/B button contacts.
  const u10 = createFivePinPackage();

  u10.name = "pcb_U10";

  const u10Point = pcbPoint(1646, 368);

  u10.position.set(
    u10Point.x,
    u10Point.y,
    thickness / 2 + 0.004
  );

  board.add(u10);

  movableParts.push({
    object: u10,
    initialPosition: u10.position.clone(),
    offset: frontComponentsOffset.clone()
  });

  // Initial shoulder switch placement on the front PCB texture.
  const shoulderSwitchSettings = [
    {
      name: "shoulder_switch_left",
      u: 185,
      v: 250,
      angle: 9,
      offset: new THREE.Vector3(-0.55, 0.8, 0.85)
    },
    {
      name: "shoulder_switch_right",
      u: 1815,
      v: 250,
      angle: -9,
      offset: new THREE.Vector3(0.55, 0.8, 0.85)
    }
  ];

  for (const settings of shoulderSwitchSettings) {
    const shoulderSwitch = createShoulderSwitch();
    const point = pcbPoint(settings.u, settings.v);

    shoulderSwitch.name = settings.name;

    shoulderSwitch.position.set(
      point.x,
      point.y,
      thickness / 2 + 0.004
    );

    shoulderSwitch.rotation.z = THREE.MathUtils.degToRad(
      settings.angle
    );

    board.add(shoulderSwitch);

    movableParts.push({
      object: shoulderSwitch,
      initialPosition: shoulderSwitch.position.clone(),
      offset: settings.offset.clone()
    });
  }

  // Initial power switch placement on the back PCB texture.
  const powerSwitch = createPowerSwitch();

  powerSwitch.name = "power_switch";

  const powerSwitchPoint = pcbPoint(2006 - 1660, 929 + 10);

  powerSwitch.position.set(
    powerSwitchPoint.x,
    powerSwitchPoint.y,
    -thickness / 2 - 0.004
  );

  powerSwitch.rotation.y = Math.PI;
  powerSwitch.rotation.z = THREE.MathUtils.degToRad(17);

  // Move the mechanism toward the slider along its local axis.
  powerSwitch.translateY(-0.05);

  board.add(powerSwitch);

  // Separate the mechanism from the external slider during the explosion.
  movableParts.push({
    object: powerSwitch,
    initialPosition: powerSwitch.position.clone(),
    offset: new THREE.Vector3(-1.3, -0.5, 0)
  });

  // Add small components before applying the PCB calibration.
  addPcbSurfaceComponents(board, thickness);

  // Align the completed board, including its components and markings.
  alignCircuitBoard(board);

  // Build the ribbon after calibration to use the socket's final position.
  const lcdRibbon = createLcdRibbon(lcdSocket);

  board.add(lcdRibbon);

  movableParts.push({
    object: lcdRibbon,
    initialPosition: lcdRibbon.position.clone(),
    offset: new THREE.Vector3(0.35, 1, 2.55)
  });

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
