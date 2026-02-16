import {
  Scene,
  PerspectiveCamera,
  WebGPURenderer,
  Mesh,
  BoxGeometry,
  SphereGeometry,
  MeshStandardNodeMaterial,
  DirectionalLight,
  AmbientLight,
  Color,
  GridHelper,
  Vector3,
  PointLight,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { uniform, vec3, float, color, oscSine, timerLocal } from "three/tsl";

/**
 * WebGPU Scene Manager
 * Modern Three.js WebGPU rendering with TSL shaders
 */
export class SceneWebGPU {
  constructor(canvas) {
    this.canvas = canvas;
    this.plcData = { position: 0, speed: 0 };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Objects
    this.mainCube = null;
    this.speedSphere = null;
    this.ring = null;
    this.pointLight = null;

    // TSL Uniforms
    this.plcPositionUniform = uniform(0);
    this.plcSpeedUniform = uniform(0);

    // Animation
    this.targetPosition = new Vector3();
    this.targetScale = new Vector3(1, 1, 1);

    this.isReady = false;
  }

  /**
   * Initialize scene (async for WebGPU)
   */
  async init() {
    // Scene
    this.scene = new Scene();
    this.scene.background = new Color(0x0a0a0a);

    // Camera
    this.camera = new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(6, 5, 8);

    // Renderer
    this.renderer = new WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      forceWebGL: false,
    });

    await this.renderer.init();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lighting
    this.setupLighting();

    // Objects with TSL materials
    this.setupObjects();

    // Controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 20;

    // Resize handler
    window.addEventListener("resize", () => this.onResize());

    this.isReady = true;
    console.log("✅ WebGPU Scene initialized");
  }

  /**
   * Setup lighting
   */
  setupLighting() {
    const ambientLight = new AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(10, 10, 5);
    this.scene.add(directionalLight);

    this.pointLight = new PointLight(0x667eea, 2, 100);
    this.pointLight.position.set(0, 5, 0);
    this.scene.add(this.pointLight);
  }

  /**
   * Setup scene objects with TSL materials
   */
  setupObjects() {
    // Grid
    const grid = new GridHelper(20, 20, 0x667eea, 0x222222);
    this.scene.add(grid);

    // Main cube with TSL color animation
    const cubeGeometry = new BoxGeometry(1, 1, 1);
    const cubeMaterial = new MeshStandardNodeMaterial({
      metalness: 0.7,
      roughness: 0.3,
    });

    // TSL: Animated color based on speed
    cubeMaterial.colorNode = vec3(
      float(0.4).add(this.plcSpeedUniform.mul(0.01)),
      float(0.5).add(oscSine(timerLocal(0.5)).mul(0.2)),
      float(0.9).sub(this.plcSpeedUniform.mul(0.01))
    );

    this.mainCube = new Mesh(cubeGeometry, cubeMaterial);
    this.mainCube.position.y = 0.5;
    this.scene.add(this.mainCube);

    // Speed sphere with TSL pulsating effect
    const sphereGeometry = new SphereGeometry(0.3, 32, 32);
    const sphereMaterial = new MeshStandardNodeMaterial({
      metalness: 0.5,
      roughness: 0.2,
    });

    // TSL: Pulsating color
    const pulseEffect = oscSine(timerLocal(2.0));
    sphereMaterial.colorNode = color(0x764ba2).mul(
      float(1.0).add(pulseEffect.mul(0.3))
    );

    // TSL: Dynamic emissive
    sphereMaterial.emissiveNode = color(0x764ba2).mul(
      float(0.2).add(this.plcSpeedUniform.abs().mul(0.05))
    );

    this.speedSphere = new Mesh(sphereGeometry, sphereMaterial);
    this.speedSphere.position.y = 2.5;
    this.scene.add(this.speedSphere);

    // Ring with TSL rainbow effect
    const ringGeometry = new BoxGeometry(3, 0.1, 0.1);
    const ringMaterial = new MeshStandardNodeMaterial({
      metalness: 0.9,
      roughness: 0.1,
    });

    // TSL: Rainbow color effect
    const timeNode = timerLocal(1.0);
    ringMaterial.colorNode = vec3(
      oscSine(timeNode),
      oscSine(timeNode.add(2.094)),
      oscSine(timeNode.add(4.189))
    )
      .mul(0.5)
      .add(0.5);

    this.ring = new Mesh(ringGeometry, ringMaterial);
    this.ring.position.y = 0.5;
    this.scene.add(this.ring);
  }

  /**
   * Update PLC data
   */
  updateData(data) {
    // IMPORTANT: Animations now depend on pos (DB1001.BYTE2), not clock
    // Save original pos value (0-255) for position calculation
    const rawPos = data.pos !== undefined 
      ? data.pos 
      : (data.byte2 !== undefined ? data.byte2 : 127);
    
    this.plcData = {
      position:
        data.status !== undefined
          ? (data.status - 127.5) / 25.5
          : data.byte1 !== undefined
          ? (data.byte1 - 127.5) / 25.5
          : 0,
      speed: rawPos / 25.5,  // For rotation (0-10)
      rawPos: rawPos          // Original value (0-255) for position
    };

    // Update TSL uniforms
    this.plcPositionUniform.value = this.plcData.position;
    this.plcSpeedUniform.value = this.plcData.speed;
  }

  /**
   * Render frame
   */
  render() {
    if (!this.isReady) return;

    const now = performance.now();

    // IMPORTANT: Cube position depends on pos (DB1001.BYTE2)
    // Position scale setup
    const scalePos = 15; // position on scene
    // 0 = -scalePos, 127 = 0, 255 = scalePos
    const rawPos = this.plcData.rawPos || 127; // Use original value (0-255)
    
    let cubeX;
    if (rawPos <= 127) {
      // From 0 to 127: from -15 to 0
      cubeX = -scalePos + (rawPos / 127) * scalePos;
    } else {
      // From 127 to 255: from 0 to +15
      cubeX = ((rawPos - 127) / 128) * scalePos;
    }
    
    this.targetPosition.set(cubeX, 0.5, 0);
    this.mainCube.position.lerp(this.targetPosition, 0.1);
    
    // Rotate based on speed (also depends on pos)
    this.mainCube.rotation.y += this.plcData.speed * 0.01;
    this.mainCube.rotation.x = Math.sin(now * 0.001) * 0.2;

    // Update speed sphere scale
    const speedMagnitude = Math.abs(this.plcData.speed);
    this.targetScale.setScalar(0.3 + speedMagnitude * 0.1);
    this.speedSphere.scale.lerp(this.targetScale, 0.1);

    // Orbit speed sphere around main cube
    this.speedSphere.position.x = Math.cos(now * 0.002) * 2.5;
    this.speedSphere.position.z = Math.sin(now * 0.002) * 2.5;

    // Rotate ring
    this.ring.rotation.y = now * 0.001;
    this.ring.rotation.x = Math.sin(now * 0.0005) * 0.3;

    // Update point light intensity
    this.pointLight.intensity = 2 + speedMagnitude * 0.1;

    // Update controls
    this.controls.update();

    // Render with WebGPU
    this.renderer.renderAsync(this.scene, this.camera);
  }

  /**
   * Handle window resize
   */
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Cleanup
   */
  dispose() {
    // Dispose geometries
    this.mainCube.geometry.dispose();
    this.speedSphere.geometry.dispose();
    this.ring.geometry.dispose();

    // Dispose materials
    this.mainCube.material.dispose();
    this.speedSphere.material.dispose();
    this.ring.material.dispose();

    // Dispose renderer
    this.renderer.dispose();
  }
}
