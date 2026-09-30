/**
 * LibreDWG's owned-entity chain sometimes runs past the end of a block and
 * pulls in geometry from the next block. Keep an entity only when its owner
 * handle is this block (model space uses owner 0). Also stop at last_entity.
 *
 * Applied to the published bundle; the package does not export a hook for this.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const target = new URL('../node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js', import.meta.url)
let source = readFileSync(target, 'utf8')
const idNullFrom = `const idToString = (id) => {
  if (typeof id === "string") return id.toUpperCase();
  return id.toString(16).toUpperCase();
};`
const idNullTo = `const idToString = (id) => {
  if (id == null) return "";
  if (typeof id === "string") return id.toUpperCase();
  return id.toString(16).toUpperCase();
};`
if (source.includes(idNullFrom)) {
  source = source.replace(idNullFrom, idNullTo)
  writeFileSync(target, source)
  console.log('patched idToString null guard')
}
if (source.includes('ownedHere')) {
  console.log('libredwg-web already patched')
  process.exit(0)
}

const idFrom = `const idToString = (id) => {
  return id.toString(16).toUpperCase();
};`
const idTo = `const idToString = (id) => {
  if (id == null) return "";
  if (typeof id === "string") return id.toUpperCase();
  return id.toString(16).toUpperCase();
};`

const callFrom = `let entities = this.convertEntities(obj, commonAttrs.handle);`
const callTo = `let entities = this.convertEntities(obj, commonAttrs.handle, commonAttrs.name);`

const fnFrom = `  convertEntities(obj, ownerHandle) {
    const libredwg = this.libredwg;
    const converter = this.entityConverter;
    const entities = [];
    let next = libredwg.get_first_owned_entity(obj);
    while (next) {
      const entity = converter.convert(next);
      if (entity) {
        entity.ownerBlockRecordSoftId = ownerHandle;
        entities.push(entity);
      }
      next = libredwg.get_next_owned_entity(obj, next);
    }
    return entities;
  }`
const fnTo = `  convertEntities(obj, ownerHandle, blockName) {
    const libredwg = this.libredwg;
    const converter = this.entityConverter;
    const tio = libredwg.dwg_object_to_object_tio(obj);
    let lastId = "";
    const lastRef = libredwg.dwg_dynapi_entity_value(tio, "last_entity").data;
    if (lastRef) lastId = idToString(libredwg.dwg_ref_get_absref(lastRef));
    const model = isModelSpace(blockName);
    const entities = [];
    let next = libredwg.get_first_owned_entity(obj);
    let guard = 0;
    while (next && guard++ < 200000) {
      const entityPtr = libredwg.dwg_object_to_entity(next);
      const owner = entityPtr ? libredwg.dwg_object_entity_get_ownerhandle_object(entityPtr) : null;
      const ownerId = owner ? idToString(owner.absolute_ref) : "";
      const ownedHere = ownerId === ownerHandle || (ownerId === "0" && model);
      if (ownedHere) {
        const entity = converter.convert(next);
        if (entity) {
          entity.ownerBlockRecordSoftId = ownerHandle;
          entities.push(entity);
        }
      }
      const handle = entityPtr ? libredwg.dwg_object_entity_get_handle_object(entityPtr) : null;
      const handleId = handle ? idToString(handle.value) : "";
      if (lastId && handleId === lastId) break;
      next = libredwg.get_next_owned_entity(obj, next);
    }
    return entities;
  }`

let next = source
for (const [from, to, label] of [
  [idFrom, idTo, 'idToString'],
  [callFrom, callTo, 'convertEntities call'],
  [fnFrom, fnTo, 'convertEntities'],
]) {
  if (!next.includes(from)) {
    console.error('patch anchor missing:', label)
    process.exit(1)
  }
  next = next.replace(from, to)
}
writeFileSync(target, next)
console.log('patched libredwg-web')
