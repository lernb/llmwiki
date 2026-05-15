import { readFileSync } from "fs";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const pdfMod = _require("pdf-parse");
const pkg = _require("pdf-parse/package.json");
console.log("version:", pkg.version);
console.log("exported:", Object.keys(pdfMod).join(", "));

// Check PDFParse instance methods
const buf = readFileSync(new URL("../sources/辅料长期合同.pdf", import.meta.url));
const parser = new pdfMod.PDFParse(buf);
const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(parser));
console.log("parser prototype methods:", proto.join(", "));
// Try all parse-like methods
for (const key of proto) {
  if (key.includes("ars") || key.includes("ext") || key.includes("ead") || key.includes("etText") || key.includes("etData") || key.includes("un")) {
    try {
      const result = parser[key]();
      console.log(`${key}() returned:`, typeof result, result?.text?.slice?.(0,50) || result?.slice?.(0,50) || JSON.stringify(result).slice(0,100));
    } catch(e) {
      console.log(`${key}() error:`, e.message?.slice(0,80));
    }
  }
}
