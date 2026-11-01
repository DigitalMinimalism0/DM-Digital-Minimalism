// The supplied sea reference uses a photographic halftone: each circle samples
// local luminance. These are the preserved photograph renderer's dot parameters.
export function renderHalftone(canvas, source) {
  if (!canvas || !source?.naturalWidth) return false;
  const context = canvas.getContext('2d');
  if (!context) return false;
  const size = Math.max(innerWidth, innerHeight);
  const resolution = Math.min(1800, Math.ceil(size * devicePixelRatio));
  const spacing = ((innerWidth < 621 ? 7 : 9) * resolution) / size;
  const columns = Math.ceil(resolution / spacing);
  const sample = document.createElement('canvas');
  sample.width = sample.height = columns;
  const sampler = sample.getContext('2d', { willReadFrequently: true });
  if (!sampler) return false;
  const crop = Math.min(source.naturalWidth, source.naturalHeight);
  sampler.drawImage(
    source,
    (source.naturalWidth - crop) / 2,
    (source.naturalHeight - crop) / 2,
    crop,
    crop,
    0,
    0,
    columns,
    columns,
  );
  const pixels = sampler.getImageData(0, 0, columns, columns).data;
  canvas.width = canvas.height = resolution;
  context.fillStyle = '#080808';
  context.fillRect(0, 0, resolution, resolution);
  context.fillStyle = '#c6c6c6';
  context.beginPath();
  for (let row = 0; row < columns; row++) {
    for (let column = 0; column < columns; column++) {
      const index = (row * columns + column) * 4;
      const luminance =
        (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
      const tone = Math.max(0, Math.min(1, (luminance - 0.055) / 0.9));
      const variation = 1 + Math.sin(column * 127.1 + row * 311.7) * 0.065;
      const radius = Math.sqrt(tone) * spacing * 0.47 * variation;
      if (radius < 0.25) continue;
      const x = (column + 0.5) * spacing;
      const y = (row + 0.5) * spacing;
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
  }
  context.fill();
  canvas.dataset.spacing = innerWidth < 621 ? '7' : '9';
  return true;
}
