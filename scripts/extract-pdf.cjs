const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFParse } = require("pdf-parse");

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node scripts/extract-pdf.cjs <pdf-path>");
    process.exit(1);
  }

  const full = path.resolve(process.cwd(), input);
  const bytes = await fs.readFile(full);
  const parser = new PDFParse({ data: bytes });
  const data = await parser.getText();
  await parser.destroy();
  process.stdout.write(data && data.text ? data.text : "");
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
