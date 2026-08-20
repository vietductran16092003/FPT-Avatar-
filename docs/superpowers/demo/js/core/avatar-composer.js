/* ============================================================
   AvatarComposer — turns the uploaded photo + frame + badge text
   into a final PNG and triggers the browser download.

   "Frame" is either a real PNG the admin uploaded for this template
   (frameImageUrl, drawn full-bleed over the photo — the same asset
   the template picker and live preview already show), or, for older
   templates that never got a real upload, a colored ring drawn on
   canvas as a fallback so they keep working.
   ============================================================ */

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function slugifyPart(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'avatar';
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

export class AvatarComposer {
  static async compose(campaign, badgeText, filenamePart, photo, transform, frameColor, frameImageUrl) {
    const size = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    const photoImg = await loadImage(photo);
    ctx.fillStyle = '#F7F9FB'; ctx.fillRect(0, 0, size, size);
    const coverScale = Math.max(size / photoImg.naturalWidth, size / photoImg.naturalHeight) * transform.scale;
    const drawW = photoImg.naturalWidth * coverScale, drawH = photoImg.naturalHeight * coverScale;
    const dx = (size - drawW) / 2 + transform.ox * size;
    const dy = (size - drawH) / 2 + transform.oy * size;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip();
    ctx.drawImage(photoImg, dx, dy, drawW, drawH);
    ctx.restore();

    if (frameImageUrl) {
      const frameImg = await loadImage(frameImageUrl);
      ctx.drawImage(frameImg, 0, 0, size, size);
    } else {
      const inset = size * 0.06, ringR = 12 * (size/400), ringW = 9 * (size/400);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = ringW + 4;
      roundRectPath(ctx, inset, inset, size - inset*2, size - inset*2, ringR);
      ctx.stroke();
      ctx.strokeStyle = frameColor; ctx.lineWidth = ringW;
      roundRectPath(ctx, inset, inset, size - inset*2, size - inset*2, ringR);
      ctx.stroke();
    }

    const inset = size * 0.06;
    let label = badgeText;
    let fontSize = Math.round(size*0.032);
    ctx.font = `800 ${fontSize}px 'Be Vietnam Pro', sans-serif`;
    const maxTextW = size * 0.8;
    while (ctx.measureText(label).width > maxTextW && fontSize > 14) {
      fontSize -= 2;
      ctx.font = `800 ${fontSize}px 'Be Vietnam Pro', sans-serif`;
    }
    if (ctx.measureText(label).width > maxTextW) {
      while (label.length > 3 && ctx.measureText(label + '…').width > maxTextW) label = label.slice(0, -1);
      label += '…';
    }
    const padX = size*0.032, padY = size*0.018;
    const textW = ctx.measureText(label).width;
    const pillW = textW + padX*2, pillH = fontSize + padY*2;
    const pillX = (size - pillW)/2, pillY = size - inset - pillH - size*0.02;
    ctx.fillStyle = frameColor;
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH/2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, size/2, pillY + pillH/2 + 1);

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('canvas export failed')); return; }
        const stamp = new Date();
        const pad = n => String(n).padStart(2,'0');
        const filename = `${campaign.slug}-${slugifyPart(filenamePart)}-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.png`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        resolve(filename);
      }, 'image/png');
    });
  }
}
