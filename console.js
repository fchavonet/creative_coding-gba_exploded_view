import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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

// Temporary cube.
const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);

const material = new THREE.MeshNormalMaterial();

const cube = new THREE.Mesh(geometry, material);

cube.rotation.x = 0.4;
cube.rotation.y = 0.6;

scene.add(cube);

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
