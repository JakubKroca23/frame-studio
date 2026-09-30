/* Filtered DWG → DXF for the browser. LibreDWG 0.13.4, GPL-3.0.
 * Drops line segments shorter than min_line millimetres so an exploded
 * chassis drawing does not become a hundred-megabyte string. */
#include <emscripten.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "dwg.h"

char *bit_convert_TU(const BITCODE_TU wstr);

static char *as_utf8(Dwg_Data *dwg, const char *raw) {
  if (!raw) return NULL;
  if (dwg->header.version >= R_2007) return bit_convert_TU((BITCODE_TU)raw);
  return strdup(raw);
}

/* Stubs for encode symbols left referenced when LibreDWG is built with
 * --disable-write. The reader does not call them. */
Dwg_Class *dwg_encode_get_class(Dwg_Data *dwg, Dwg_Object *obj) {
  (void)dwg;
  (void)obj;
  return NULL;
}
void in_postprocess_handles(Dwg_Object *obj) { (void)obj; }
void dwg_convert_LTYPE_strings_area(const Dwg_Data *dwg, Dwg_Object_LTYPE *_obj) {
  (void)dwg;
  (void)_obj;
}
int dwg_require_class(Dwg_Data *dwg, const char *dxfname, size_t len) {
  (void)dwg;
  (void)dxfname;
  (void)len;
  return 0;
}

static char *out_buf;
static size_t out_len;
static size_t out_cap;

static int grow(size_t extra) {
  if (out_len + extra + 1 < out_cap) return 1;
  size_t cap = out_cap ? out_cap : 1 << 20;
  while (out_len + extra + 1 >= cap) {
    if (cap > 80u << 20) return 0;
    cap *= 2;
  }
  char *next = (char *)realloc(out_buf, cap);
  if (!next) return 0;
  out_buf = next;
  out_cap = cap;
  return 1;
}

static void add(const char *text) {
  size_t n = strlen(text);
  if (!grow(n)) return;
  memcpy(out_buf + out_len, text, n);
  out_len += n;
  out_buf[out_len] = 0;
}

static void dxf_s(int code, const char *value) {
  char head[32];
  snprintf(head, sizeof head, "%d\n", code);
  add(head);
  add(value ? value : "");
  add("\n");
}

static void dxf_n(int code, double value) {
  char body[64];
  snprintf(body, sizeof body, "%.4f", value);
  dxf_s(code, body);
}

static char *clean(const char *text) {
  if (!text) return NULL;
  size_t n = strlen(text);
  char *copy = (char *)malloc(n + 1);
  if (!copy) return NULL;
  size_t j = 0;
  for (size_t i = 0; i < n; i++) {
    unsigned char c = (unsigned char)text[i];
    if (c == '\n' || c == '\r' || c == '\t') copy[j++] = ' ';
    else copy[j++] = (char)c;
  }
  copy[j] = 0;
  return copy;
}

static char *layer_name(Dwg_Data *dwg, Dwg_Object_Entity *ent) {
  if (!ent || !ent->layer) return strdup("0");
  Dwg_Object *obj = dwg_ref_object(dwg, ent->layer);
  if (!obj || obj->fixedtype != DWG_TYPE_LAYER || !obj->tio.object) return strdup("0");
  Dwg_Object_LAYER *layer = obj->tio.object->tio.LAYER;
  char *name = layer ? as_utf8(dwg, layer->name) : NULL;
  if (!name || !name[0]) {
    free(name);
    return strdup("0");
  }
  return name;
}

static char *owner_name(Dwg_Data *dwg, Dwg_Object_Entity *ent) {
  if (!ent) return strdup("*Model_Space");
  if (ent->entmode == 1) return strdup("*Paper_Space");
  if (ent->entmode == 2 || !ent->ownerhandle) return strdup("*Model_Space");
  Dwg_Object *obj = dwg_ref_object(dwg, ent->ownerhandle);
  if (!obj || obj->fixedtype != DWG_TYPE_BLOCK_HEADER || !obj->tio.object) return strdup("*Model_Space");
  Dwg_Object_BLOCK_HEADER *hdr = obj->tio.object->tio.BLOCK_HEADER;
  char *name = hdr ? as_utf8(dwg, hdr->name) : NULL;
  if (!name || !name[0]) {
    free(name);
    return strdup("*Model_Space");
  }
  return name;
}

static int paper_name(const char *name) {
  return name && (!strncmp(name, "*Paper", 6) || !strncmp(name, "*PAPER", 6));
}

static int model_name(const char *name) {
  return !name || !strcmp(name, "*Model_Space") || !strcmp(name, "*MODEL_SPACE");
}

typedef struct {
  char *name;
  char *buf;
  size_t len;
  size_t cap;
  double bx, by, bz;
} BlockOut;

static BlockOut *find_block(BlockOut *blocks, int *count, const char *name, double bx, double by, double bz) {
  for (int i = 0; i < *count; i++) {
    if (!strcmp(blocks[i].name, name)) return &blocks[i];
  }
  if (*count >= 256) return &blocks[0];
  BlockOut *slot = &blocks[*count];
  memset(slot, 0, sizeof *slot);
  slot->name = strdup(name);
  slot->bx = bx;
  slot->by = by;
  slot->bz = bz;
  (*count)++;
  return slot;
}

static void block_add(BlockOut *block, const char *text) {
  size_t n = strlen(text);
  if (block->len + n + 1 >= block->cap) {
    size_t cap = block->cap ? block->cap * 2 : 4096;
    while (block->len + n + 1 >= cap) cap *= 2;
    char *next = (char *)realloc(block->buf, cap);
    if (!next) return;
    block->buf = next;
    block->cap = cap;
  }
  memcpy(block->buf + block->len, text, n);
  block->len += n;
  block->buf[block->len] = 0;
}

static void capture_begin(void) {
  out_len = 0;
  if (out_buf) out_buf[0] = 0;
}

static char *capture_take(void) {
  char *text = out_buf ? strdup(out_buf) : strdup("");
  out_len = 0;
  if (out_buf) out_buf[0] = 0;
  return text;
}

static void emit_line(const char *layer, double x1, double y1, double x2, double y2, double min_line) {
  double dx = x2 - x1;
  double dy = y2 - y1;
  if (dx * dx + dy * dy < min_line * min_line) return;
  dxf_s(0, "LINE");
  dxf_s(8, layer);
  dxf_n(10, x1);
  dxf_n(20, y1);
  dxf_n(11, x2);
  dxf_n(21, y2);
}

static const char *acadver(Dwg_Data *dwg) {
  switch (dwg->header.version) {
    case R_2000:
    case R_2000i:
    case R_2002:
      return "AC1015";
    case R_2004:
      return "AC1018";
    case R_2007b:
      return "AC1021";
    case R_2010:
      return "AC1024";
    case R_2013:
      return "AC1027";
    case R_2018:
    case R_2018b:
      return "AC1032";
    default:
      return "AC1032";
  }
}

EMSCRIPTEN_KEEPALIVE
char *dwg_filtered_dxf(const char *path, double min_line) {
  Dwg_Data dwg;
  memset(&dwg, 0, sizeof dwg);
  int err = dwg_read_file(path, &dwg);
  int fatal = err & (128 | 256 | 512 | 1024 | 2048 | 4096 | 8192);
  if (!dwg.num_objects || fatal) {
    dwg_free(&dwg);
    return NULL;
  }
  if (min_line < 0) min_line = 0;

  BlockOut blocks[256];
  int nblocks = 0;
  memset(blocks, 0, sizeof blocks);
  for (unsigned i = 0; i < dwg.num_objects; i++) {
    Dwg_Object *obj = &dwg.object[i];
    if (obj->fixedtype != DWG_TYPE_BLOCK_HEADER || obj->supertype != DWG_SUPERTYPE_OBJECT || !obj->tio.object) continue;
    Dwg_Object_BLOCK_HEADER *hdr = obj->tio.object->tio.BLOCK_HEADER;
    if (!hdr || !hdr->name) continue;
    char *nm = as_utf8(&dwg, hdr->name);
    if (!nm) continue;
    find_block(blocks, &nblocks, nm, hdr->base_pt.x, hdr->base_pt.y, hdr->base_pt.z);
    free(nm);
  }

  for (unsigned i = 0; i < dwg.num_objects; i++) {
    Dwg_Object *obj = &dwg.object[i];
    if (obj->supertype != DWG_SUPERTYPE_ENTITY || !obj->tio.entity) continue;
    Dwg_Object_Entity *ent = obj->tio.entity;
    char *owner = owner_name(&dwg, ent);
    if (paper_name(owner)) {
      free(owner);
      continue;
    }
    char *layer = layer_name(&dwg, ent);
    char *layer_clean = clean(layer);
    free(layer);
    const char *use_layer = layer_clean && layer_clean[0] ? layer_clean : "0";
    capture_begin();
    switch (obj->fixedtype) {
      case DWG_TYPE_LINE: {
        Dwg_Entity_LINE *line = ent->tio.LINE;
        if (line) emit_line(use_layer, line->start.x, line->start.y, line->end.x, line->end.y, min_line);
        break;
      }
      case DWG_TYPE_CIRCLE: {
        Dwg_Entity_CIRCLE *circle = ent->tio.CIRCLE;
        if (!circle || !(circle->radius > 0)) break;
        dxf_s(0, "CIRCLE");
        dxf_s(8, use_layer);
        dxf_n(10, circle->center.x);
        dxf_n(20, circle->center.y);
        dxf_n(40, circle->radius);
        break;
      }
      case DWG_TYPE_ARC: {
        Dwg_Entity_ARC *arc = ent->tio.ARC;
        if (!arc || !(arc->radius > 0)) break;
        dxf_s(0, "ARC");
        dxf_s(8, use_layer);
        dxf_n(10, arc->center.x);
        dxf_n(20, arc->center.y);
        dxf_n(40, arc->radius);
        dxf_n(50, arc->start_angle * 180.0 / M_PI);
        dxf_n(51, arc->end_angle * 180.0 / M_PI);
        break;
      }
      case DWG_TYPE_TEXT: {
        Dwg_Entity_TEXT *text = ent->tio.TEXT;
        if (!text || !text->text_value) break;
        char *decoded = as_utf8(&dwg, text->text_value);
        char *value = clean(decoded);
        free(decoded);
        if (!value || !value[0]) {
          free(value);
          break;
        }
        dxf_s(0, "TEXT");
        dxf_s(8, use_layer);
        dxf_n(10, text->ins_pt.x);
        dxf_n(20, text->ins_pt.y);
        dxf_s(1, value);
        free(value);
        break;
      }
      case DWG_TYPE_MTEXT: {
        Dwg_Entity_MTEXT *text = ent->tio.MTEXT;
        if (!text || !text->text) break;
        char *decoded = as_utf8(&dwg, text->text);
        char *value = clean(decoded);
        free(decoded);
        if (!value || !value[0]) {
          free(value);
          break;
        }
        dxf_s(0, "MTEXT");
        dxf_s(8, use_layer);
        dxf_n(10, text->ins_pt.x);
        dxf_n(20, text->ins_pt.y);
        dxf_s(1, value);
        free(value);
        break;
      }
      case DWG_TYPE_INSERT: {
        Dwg_Entity_INSERT *ins = ent->tio.INSERT;
        if (!ins || !ins->block_header) break;
        Dwg_Object *hdr_obj = dwg_ref_object(&dwg, ins->block_header);
        if (!hdr_obj || hdr_obj->fixedtype != DWG_TYPE_BLOCK_HEADER || !hdr_obj->tio.object) break;
        Dwg_Object_BLOCK_HEADER *hdr = hdr_obj->tio.object->tio.BLOCK_HEADER;
        if (!hdr || !hdr->name) break;
        char *decoded = as_utf8(&dwg, hdr->name);
        if (!decoded || paper_name(decoded) || model_name(decoded)) {
          free(decoded);
          break;
        }
        char *name = clean(decoded);
        free(decoded);
        if (!name || !name[0]) {
          free(name);
          break;
        }
        double sx = ins->scale.x == 0 ? 1 : ins->scale.x;
        double sy = ins->scale.y == 0 ? sx : ins->scale.y;
        dxf_s(0, "INSERT");
        dxf_s(8, use_layer);
        dxf_s(2, name);
        dxf_n(10, ins->ins_pt.x);
        dxf_n(20, ins->ins_pt.y);
        dxf_n(41, sx);
        dxf_n(42, sy);
        dxf_n(50, ins->rotation * 180.0 / M_PI);
        free(name);
        break;
      }
      default:
        break;
    }
    if (obj->fixedtype == DWG_TYPE_LWPOLYLINE) {
      Dwg_Entity_LWPOLYLINE *poly = ent->tio.LWPOLYLINE;
      capture_begin();
      if (poly && poly->num_points >= 2 && poly->num_points <= 8000 && poly->points) {
        dxf_s(0, "LWPOLYLINE");
        dxf_s(8, use_layer);
        char count[32];
        snprintf(count, sizeof count, "%u", (unsigned)poly->num_points);
        dxf_s(90, count);
        dxf_s(70, (poly->flag & 512) ? "1" : "0");
        for (BITCODE_BL v = 0; v < poly->num_points; v++) {
          dxf_n(10, poly->points[v].x);
          dxf_n(20, poly->points[v].y);
        }
      }
    }
    free(layer_clean);
    if (!out_len) {
      free(owner);
      continue;
    }
    BlockOut *slot = find_block(blocks, &nblocks, owner, 0, 0, 0);
    free(owner);
    char *chunk = capture_take();
    if (chunk) {
      block_add(slot, chunk);
      free(chunk);
    }
  }

  capture_begin();
  dxf_s(0, "SECTION");
  dxf_s(2, "HEADER");
  dxf_s(9, "$ACADVER");
  dxf_s(1, acadver(&dwg));
  dxf_s(9, "$INSUNITS");
  char units[16];
  snprintf(units, sizeof units, "%d", (int)dwg.header_vars.INSUNITS);
  dxf_s(70, units);
  dxf_s(0, "ENDSEC");
  dxf_s(0, "SECTION");
  dxf_s(2, "BLOCKS");
  BlockOut *model = NULL;
  for (int i = 0; i < nblocks; i++) {
    if (model_name(blocks[i].name)) {
      model = &blocks[i];
      continue;
    }
    if (paper_name(blocks[i].name) || !blocks[i].len) continue;
    dxf_s(0, "BLOCK");
    dxf_s(8, "0");
    dxf_s(2, blocks[i].name);
    dxf_s(70, "0");
    dxf_n(10, blocks[i].bx);
    dxf_n(20, blocks[i].by);
    dxf_n(30, blocks[i].bz);
    dxf_s(3, blocks[i].name);
    add(blocks[i].buf);
    dxf_s(0, "ENDBLK");
  }
  dxf_s(0, "ENDSEC");
  dxf_s(0, "SECTION");
  dxf_s(2, "ENTITIES");
  if (model && model->buf) add(model->buf);
  dxf_s(0, "ENDSEC");
  dxf_s(0, "EOF");

  char *result = out_buf ? strdup(out_buf) : NULL;
  for (int i = 0; i < nblocks; i++) {
    free(blocks[i].name);
    free(blocks[i].buf);
  }
  dwg_free(&dwg);
  out_len = 0;
  return result;
}
