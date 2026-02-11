// import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
// Run with global THREE instance (loaded in HTML)

// --- Configuration ---
const CONFIG = {
    particleCount: 2000,
    particleSize: 0.15,
    heartColor: 0xff0055, // Deep pink/red
    backgroundColor: 0x110505, // Very dark red/black
    manualRotationSpeed: 0.005, // Mouse interaction
    autoRotationSpeed: 0.002,
    pulseSpeed: 1.5,
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.backgroundColor);
// Add some fog for depth
scene.fog = new THREE.FogExp2(CONFIG.backgroundColor, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 15;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance optimization
document.getElementById('canvas-container').appendChild(renderer.domElement);

// --- Heart Generation ---
function createHeartGeometry(count) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = []; // For varying particle sizes

    const color1 = new THREE.Color(0xff0055);
    const color2 = new THREE.Color(0xff6688); // Lighter pink

    for (let i = 0; i < count; i++) {
        // Heart curve parametric equations
        // x = 16sin^3(t)
        // y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
        // We need to distribute points nicely. Uniform random t isn't perfect but works.
        // To make it a volume, we can use rejection sampling or a specific 3D formulation.
        // Let's try a 3D volume approximation:
        // x, y, z random in box, check if inside heart equation.
        // Implicit: (x^2 + 9/4y^2 + z^2 - 1)^3 - x^2z^3 - 9/80y^2z^3 < 0
        // Scaled up by factor S.

        // Rejection sampling is slow for initialization if box is large.
        // Let's use a layered 2D approach with random Z depth.

        let t = Math.random() * Math.PI * 2;

        // Basic 2D heart shape
        let x = 16 * Math.pow(Math.sin(t), 3);
        let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

        // Scale down to fit camera
        const scale = 0.25;
        x *= scale;
        y *= scale;

        // Add volume (z-axis)
        // We want the heart to be puffy. The thickness is roughly related to the distance from center.
        // But the "cleft" makes simple distance tricky.
        // Let's just add random noise in Z, weighted by how "central" the point is?
        // Actually, let's just make it a shell for now, it looks cleaner.
        // Or distribute inside the shell.

        // Let's add multiple layers to fill it in
        const bloom = Math.random(); // 0 to 1
        // Move point towards center based on bloom to fill volume
        // Center of heart is roughly (0, 1) in unscaled coords? No, (0,0) is roughly center of mass.

        // Linear interpolation from (0,0,0) to (x,y,0)
        // But (0,0) is too low for the heart shape.

        // Better approach:
        // Just scatter points around the wireframe 2D shape with gaussian spread.
        const spread = 0.5 * Math.random();
        x += (Math.random() - 0.5) * spread;
        y += (Math.random() - 0.5) * spread;
        let z = (Math.random() - 0.5) * 4; // Thickness

        // Apply scale
        positions.push(x, y, z);

        // Color gradient based on position
        const mixedColor = color1.clone().lerp(color2, Math.random());
        colors.push(mixedColor.r, mixedColor.g, mixedColor.b);

        sizes.push(CONFIG.particleSize * (0.5 + Math.random()));
    }

    // Create a specific "Beat" animation attribute if needed, 
    // but for now we'll animate the whole group scale.

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1)); // We'll need a custom shader for per-particle size if using PointsMaterial default doesn't support array?
    // Standard PointsMaterial supports 'size' uniform, but not attribute unless modified.
    // Let's stick to uniform size for simplicity or use a shader material.
    // Actually, let's use a nice texture sprite.

    return geometry;
}


// Create Texture for Particles (Soft Glow)
function createSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 100, 100, 1)');
    gradient.addColorStop(0.5, 'rgba(100, 0, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// Generate Heart
// Let's actually use a highly dense point cloud for a "premium" look.
// Approx 4000 points.
// We will simply use the mathematical formula for a 3D heart isosurface to reject samples.
// (x^2 + 9/4y^2 + z^2 - 1)^3 - x^2z^3 - 9/80y^2z^3 < 0
function createVolumeHeart(count) {
    const positions = [];
    const colors = [];

    const colorInside = new THREE.Color(0xff0033);
    const colorOutside = new THREE.Color(0xff5588);

    let i = 0;
    while (i < count) {
        // Random point in box [-1.5, 1.5] x [-1.5, 1.5] x [-1.5, 1.5]
        const x = (Math.random() - 0.5) * 3;
        const y = (Math.random() - 0.5) * 3;
        const z = (Math.random() - 0.5) * 3;

        // Prepare equation terms
        const x2 = x * x;
        const y2 = y * y;
        const z2 = z * z;

        const a = x2 + (9 / 4) * y2 + z2 - 1;
        const term1 = a * a * a;
        const term2 = x2 * (z * z * z);
        const term3 = (9 / 80) * y2 * (z * z * z);

        if (term1 - term2 - term3 <= 0) {
            // Point is inside!

            // Scale up for scene
            const S = 3.5;
            positions.push(x * S, y * S, z * S);

            // Radial gradient color from center
            const dist = Math.sqrt(x2 + y2 + z2);
            const mixed = colorInside.clone().lerp(colorOutside, dist);

            colors.push(mixed.r, mixed.g, mixed.b);
            i++;
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
}


const heartGeo = createVolumeHeart(5000);
const heartMat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    map: createSprite(), // Soft particle texture
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.8
});

const heartMesh = new THREE.Points(heartGeo, heartMat);
scene.add(heartMesh);


// --- Animation Loop ---
const clock = new THREE.Clock();
let mouseX = 0;
let mouseY = 0;

// Mouse Interaction
document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Button Logic
const yesBtn = document.getElementById('yes-btn');
const noBtn = document.getElementById('no-btn');
const title = document.getElementById('title');
const bouquetContainer = document.getElementById('bouquet-container');
const buttonsContainer = document.querySelector('.buttons');

// No Button Interaction: Runaway Proximity & Rotation
const moveNoButton = (mouseX, mouseY) => {
    const btnRect = noBtn.getBoundingClientRect();
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    // Distance from center
    const dist = Math.sqrt(Math.pow(mouseX - btnCenterX, 2) + Math.pow(mouseY - btnCenterY, 2));

    // Threshold to trigger movement
    if (dist < 150) { // 150px radius
        // Calculate new random position
        // Ensure it stays within viewport
        const padding = 50;
        const width = window.innerWidth - btnRect.width - padding * 2;
        const height = window.innerHeight - btnRect.height - padding * 2;

        const newX = Math.max(0, Math.random() * width + padding);
        const newY = Math.max(0, Math.random() * height + padding);

        // Add rotation for "ghumne" effect
        const randomRot = (Math.random() - 0.5) * 360 * 2; // -360 to +360

        noBtn.style.position = 'fixed'; // Use fixed to ignore scroll and parent flow
        noBtn.style.left = `${newX}px`;
        noBtn.style.top = `${newY}px`;
        noBtn.style.transform = `rotate(${randomRot}deg)`;
        noBtn.style.transition = "all 0.3s ease-out"; // Smooth but fast
    }
};

document.addEventListener('mousemove', (e) => {
    // Only if buttons are visible
    if (buttonsContainer.style.display !== 'none') {
        moveNoButton(e.clientX, e.clientY);
    }
});

// Also handle touch for mobile "cannot click"
noBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Force move even if they somehow clicked
    const newX = Math.random() * (window.innerWidth - 100);
    const newY = Math.random() * (window.innerHeight - 50);
    noBtn.style.position = 'fixed';
    noBtn.style.left = `${newX}px`;
    noBtn.style.top = `${newY}px`;
});


// Confetti Simple Implementation
function fireConfetti() {
    const colors = ['#ff0000', '#ffffff', '#ff69b4', '#ffd700'];
    const confettiCount = 200;

    // We can use a simple canvas overlay or just div elements.
    // Div elements are easiest to just append and animate with CSS.
    const container = document.body;

    for (let i = 0; i < confettiCount; i++) {
        const conf = document.createElement('div');
        conf.classList.add('confetti');
        conf.style.left = Math.random() * 100 + 'vw';
        conf.style.animationDuration = (Math.random() * 3 + 2) + 's';
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        // Random shape: square or circle
        if (Math.random() > 0.5) conf.style.borderRadius = '50%';
        container.appendChild(conf);

        // Remove after animation
        setTimeout(() => conf.remove(), 5000);
    }
}

yesBtn.addEventListener('click', () => {
    title.innerText = "I knew it! ❤️";
    title.style.animation = "pulse 0.5s infinite"; // Faster heart beat

    // Fire Confetti!
    fireConfetti();

    // Change particle colors
    const colors = heartMesh.geometry.attributes.color;
    // Gold/Yellow/White for flowers theme? Or just bright red/pink
    for (let i = 0; i < colors.count; i++) {
        colors.setXYZ(i, 1.0, 0.2, 0.4);
    }
    colors.needsUpdate = true;

    // Hide buttons
    buttonsContainer.style.display = 'none';

    // Show Bouquet
    bouquetContainer.classList.remove('hidden');

    CONFIG.pulseSpeed = 4.0;
});


// Typing Effect
const originalTextStr = "Will you be my Valentine?";
title.innerText = "";
let charIndex = 0;
function typeWriter() {
    if (charIndex < originalTextStr.length) {
        title.innerText += originalTextStr.charAt(charIndex);
        charIndex++;
        setTimeout(typeWriter, 100);
    }
}
// Start typing after a small delay
setTimeout(typeWriter, 1000);

// Floating Reasons Logic
const reasons = [
    "Your beautiful smile",
    "The way you laugh",
    "Your kindness",
    "How you make me feel",
    "Our memories",
    "Your eyes",
    "Everything about you",
    "You are my best friend",
    "Your warm hugs"
];

function createFloatingHeart() {
    const heart = document.createElement('div');
    heart.classList.add('floating-heart');
    heart.innerHTML = '❤️';

    // Position
    heart.style.left = Math.random() * 95 + 'vw';
    heart.style.animationDuration = (Math.random() * 10 + 10) + 's'; // 10-20s float

    // Add Tooltip
    const tooltip = document.createElement('div');
    tooltip.classList.add('reason-tooltip');
    tooltip.innerText = reasons[Math.floor(Math.random() * reasons.length)];
    heart.appendChild(tooltip);

    document.body.appendChild(heart);

    // Cleanup
    setTimeout(() => {
        heart.remove();
    }, 20000);
}

// Create hearts periodically
setInterval(createFloatingHeart, 2000);
// Initial batch
for (let i = 0; i < 5; i++) setTimeout(createFloatingHeart, i * 500);


function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();

    // Heartbeat: Scale
    // Heartbeat pattern: Lub-Dub .... Lub-Dub
    // sin wave is too regular.
    // Let's combine sines.
    // A nice heartbeat function: pow(sin(t), 63) * ... ? simpler:
    // Scale = 1 + 0.1 * sin(t * speed)

    // More realistic beat:
    // small beat followed by big beat.
    // f(t) = - (0.4 * sin(t) + 0.4 * sin(2*t) ...)
    // Let's just use a simple pulse for aesthetic.
    const pulse = Math.sin(time * CONFIG.pulseSpeed) * 0.05 + 1;
    heartMesh.scale.set(pulse, pulse, pulse);

    // Rotation: Auto + Mouse
    heartMesh.rotation.y += CONFIG.autoRotationSpeed;

    // Subtle mouse parallax on camera
    camera.position.x += (mouseX * 5 - camera.position.x) * 0.05;
    camera.position.y += (mouseY * 2 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    // Dynamic particle movement (Optional: jitter them slightly)
    // Access positions and add noise? (Too heavy for CPU every frame without shaders)
    // We'll stick to group transformations.

    renderer.render(scene, camera);
}

animate();
