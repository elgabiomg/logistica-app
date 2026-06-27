import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const radius = size * 0.18;

  // Rounded rect background
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.arcTo(size, 0, size, radius, radius);
  ctx.lineTo(size, size - radius);
  ctx.arcTo(size, size, size - radius, size, radius);
  ctx.lineTo(radius, size);
  ctx.arcTo(0, size, 0, size - radius, radius);
  ctx.lineTo(0, radius);
  ctx.arcTo(0, 0, radius, 0, radius);
  ctx.closePath();

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#F5A623');
  grad.addColorStop(1, '#D4881A');
  ctx.fillStyle = grad;
  ctx.fill();

  // Truck body
  const s = size / 192; // scale factor
  ctx.fillStyle = 'rgba(255,255,255,0.95)';

  // Cargo box
  const bx = 30 * s, by = 70 * s, bw = 90 * s, bh = 60 * s;
  ctx.fillRect(bx, by, bw, bh);

  // Cab
  const cx2 = 120 * s, cy = 85 * s, cw = 42 * s, ch = 45 * s;
  ctx.beginPath();
  ctx.moveTo(cx2, cy);
  ctx.lineTo(cx2 + cw * 0.65, cy);
  ctx.arcTo(cx2 + cw, cy, cx2 + cw, cy + cw * 0.35, cw * 0.35);
  ctx.lineTo(cx2 + cw, cy + ch);
  ctx.lineTo(cx2, cy + ch);
  ctx.closePath();
  ctx.fill();

  // Windshield (dark)
  ctx.fillStyle = 'rgba(213, 136, 26, 0.85)';
  ctx.beginPath();
  ctx.moveTo((122) * s, (88) * s);
  ctx.lineTo((150) * s, (88) * s);
  ctx.arcTo((158) * s, (88) * s, (158) * s, (96) * s, 8 * s);
  ctx.lineTo((158) * s, (112) * s);
  ctx.lineTo((122) * s, (112) * s);
  ctx.closePath();
  ctx.fill();

  // Chassis / undercarriage bar
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(30 * s, 130 * s, 132 * s, 8 * s);

  // Wheels
  ctx.fillStyle = '#1a1a1a';
  [[60, 148], [145, 148]].forEach(([wx, wy]) => {
    ctx.beginPath();
    ctx.arc(wx * s, wy * s, 16 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F5A623';
    ctx.beginPath();
    ctx.arc(wx * s, wy * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
  });

  // "LO" text
  const fontSize = size * 0.14;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = `${size * 0.02}px`;
  ctx.fillText('LogiObra', size / 2, size * 0.91);

  return canvas.toBuffer('image/png');
}

writeFileSync('public/icon-192.png', generateIcon(192));
writeFileSync('public/icon-512.png', generateIcon(512));
console.log('✅ Íconos generados: icon-192.png y icon-512.png');
