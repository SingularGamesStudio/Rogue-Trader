import sharp from "sharp"

const input = process.argv[2]
const output = process.argv[3] ?? "map-4096.webp"

if (!input) {
  console.error("Usage: node scripts/optimize-map.mjs input.jpg [output.webp]")
  process.exit(1)
}

await sharp(input)
  .rotate()
  .resize({
    width: 4096,
    height: 4096,
    fit: "inside",
    withoutEnlargement: true,
    kernel: sharp.kernel.lanczos3,
  })
  .sharpen({
    sigma: 0.65,
    m1: 1,
    m2: 2,
  })
  .webp({
    quality: 92,
    effort: 6,
    smartSubsample: true,
  })
  .toFile(output)

const info = await sharp(output).metadata()

console.log({
  output,
  width: info.width,
  height: info.height,
  format: info.format,
})