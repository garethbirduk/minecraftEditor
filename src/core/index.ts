/** Public surface of the framework-agnostic core. */

export * from "./nbt/types.js";
export { readNbt } from "./nbt/reader.js";
export type { NbtDocument } from "./nbt/reader.js";
export { writeNbt } from "./nbt/writer.js";

export * from "./model/grid.js";
export * from "./model/transform.js";
export * from "./model/blockstate-transform.js";
export * from "./model/composition.js";
export * from "./model/bake.js";

export { parseMcStructure } from "./mcstructure/parse.js";
export { serializeMcStructure } from "./mcstructure/serialize.js";

export * from "./project/json.js";

export { colorForBlock, isTransparentBlock } from "./blocks/colors.js";
export { buildDemoLibrary } from "./demo.js";
export type { DemoLibrary } from "./demo.js";
