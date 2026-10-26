// STEP 7 V5 project parsing and folder-scanning helpers.
// Kept independent from the analyzer UI so symbol-file support can evolve separately.
(function () {
  function normalizeSignalAddress(address) {
    return String(address || "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[,.:/]/g, "_");
  }

  function normalizeSymbolType(value) {
    const t = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    const aliases = {
      BOOL: "X",
      BIT: "X",
      X: "X",
      BYTE: "B",
      CHAR: "C",
      STRING: "S",
      INT: "I",
      DINT: "DI",
      WORD: "W",
      DWORD: "DW",
      REAL: "R",
      RINT: "RI",
      RDINT: "RDI",
      RWORD: "RW",
      RDWORD: "RDW",
      RREAL: "RR",
      LREAL: "LR",
      TIMER: "TMR",
      COUNTER: "CTR",
      DATEANDTIME: "DT",
      DT: "DT",
      DTZ: "DTZ",
      DTL: "DTL",
      DTLZ: "DTLZ",
    };
    return aliases[t] || "I";
  }
  function splitSymbolRecord(line) {
    const text = String(line || "")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!text || /^(symbol|name)[,;\t]/i.test(text) || /^\s*#/.test(text)) return null;
    // STEP 7 ASC: length,symbol. address datatype comment
    const asc = text.match(
      /^\s*\d+\s*,\s*([^,]+?)\s+((?:DB\s*\d+(?:\s*[,.:/]\s*[A-Z]+\s*\d+(?:\.\d+){0,2})?)|(?:[A-Z]+\s*\d+(?:\.\d+){0,2})|(?:PI|PQ|PE|PA|M|I|E|Q|A|T|C)[A-Z]*\s*\d+(?:\.\d+){0,2})\s+([A-Z][A-Z0-9_]*)?(?:\s+(.*))?$/i
    );
    if (asc)
      return {
        _SKZ: asc[1].replace(/[.\s]+$/, "").trim(),
        name: asc[1].replace(/[.\s]+$/, "").trim(),
        address: asc[2].trim(),
        type: asc[3] || "",
        comment: asc[4] || "",
        symbolName: asc[1].replace(/[.\s]+$/, "").trim(),
        operand: asc[2].trim(),
        dataType: asc[3] || "",
      };
    // CSV/TSV exports: symbol, address, data type, comment (quoted or unquoted)
    let cells = [];
    if (text.includes("\t")) cells = text.split("\t");
    else if (text.includes(",")) {
      let current = "",
        quoted = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
          if (quoted && text[i + 1] === '"') {
            current += '"';
            i++;
          } else quoted = !quoted;
        } else if (ch === "," && !quoted) {
          cells.push(current.trim());
          current = "";
        } else current += ch;
      }
      cells.push(current.trim());
    } else return null;
    cells = cells.map((v) =>
      v
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .trim()
    );
    if (cells.length < 2) return null;
    const addressIndex = cells.findIndex((v) =>
      /^(?:DB\s*\d+(?:\s*[,.:/]\s*[A-Z]+\s*\d+(?:\.\d+){0,2})?|(?:PI|PQ|PE|PA|M|I|E|Q|A|T|C)[A-Z]*\s*\d+(?:\.\d+){0,2})$/i.test(
        v
      )
    );
    if (addressIndex < 0) return null;
    const name = cells.find(
      (v, i) =>
        i !== addressIndex &&
        v &&
        !/^(BOOL|BYTE|CHAR|STRING|INT|DINT|WORD|DWORD|REAL|RINT|RDINT|RWORD|RDWORD|RREAL|LREAL|TIMER|COUNTER|DT|DTZ|DTL|DTLZ)$/i.test(
          v
        )
    );
    if (!name) return null;
    const type =
      cells.find(
        (v, i) =>
          i !== addressIndex &&
          /^(BOOL|BYTE|CHAR|STRING|INT|DINT|WORD|DWORD|REAL|RINT|RDINT|RWORD|RDWORD|RREAL|LREAL|TIMER|COUNTER|DT|DTZ|DTL|DTLZ|X|B|C|S|I|DI|W|DW|R|RI|RDI|RW|RDW|RR|LR)$/i.test(
            v
          )
      ) || "";
    return {
      _SKZ: name,
      name: name,
      address: cells[addressIndex],
      type: type,
      comment: cells
        .slice(addressIndex + 1)
        .filter(Boolean)
        .join(" "),
      symbolName: name,
      operand: cells[addressIndex],
      dataType: type,
    };
  }
  function normalizeStep7Address(value) {
    let address = String(value || "")
      .toUpperCase()
      .replace(/[\t\r\n]+/g, " ")
      .trim();
    address = address.replace(
      /^DB\s*(\d+)\s*[,.:/]\s*(DBX|DBB|DBW|DBD)\s*(\d+(?:\.\d+){0,2})$/,
      "DB$1,$2$3"
    );
    address = address.replace(
      /^DB\s*(\d+)\s+(DBX|DBB|DBW|DBD)\s*(\d+(?:\.\d+){0,2})$/,
      "DB$1,$2$3"
    );
    // nodeS7 expects compact operands such as M79.0 and I8.7.
    // dBASE records may contain padding (e.g. "M       79.0"); symbol search
    // compares addresses without whitespace, while this canonical value is used
    // when registering a live PLC signal with the backend.
    const area = address.match(/^(PI|PQ|PE|PA|M|I|E|Q|A|T|C)([A-Z]*)\s*(\d+(?:\.\d+){0,2})$/);
    if (area) return area[1] + area[2] + area[3];
    const db = address.match(/^(DB\s*\d+)\s*[,.:/]?\s*(DBX|DBB|DBW|DBD)\s*(\d+(?:\.\d+){0,2})$/);
    if (db) return db[1].replace(/\s+/g, "") + "," + db[2] + db[3];
    return address.replace(/\s+/g, " ").trim();
  }
  function step7DbfType(value) {
    const raw = String(value || "")
      .trim()
      .toUpperCase();
    const numeric = {
      1: "BOOL",
      2: "BYTE",
      3: "WORD",
      4: "INT",
      5: "DWORD",
      6: "REAL",
      7: "STRING",
      8: "DINT",
      9: "CHAR",
      10: "ARRAY",
      11: "STRUCT",
      12: "DATE_AND_TIME",
      13: "S5TIME",
      14: "TIME",
      15: "COUNTER",
      16: "TIMER",
    };
    return numeric[raw] || raw;
  }
  async function parseDbfSymbolFile(file) {
    const buffer = await file.arrayBuffer(),
      view = new DataView(buffer),
      bytes = new Uint8Array(buffer);
    if (bytes.length < 33) return [];
    const recordCount = view.getUint32(4, true),
      headerLength = view.getUint16(8, true),
      recordLength = view.getUint16(10, true);
    if (headerLength < 33 || recordLength < 2 || headerLength > bytes.length) return [];
    const fields = [];
    let pos = 32;
    while (pos < headerLength - 1 && bytes[pos] !== 0x0d) {
      if (pos + 32 > bytes.length) break;
      let end = pos;
      while (end < pos + 11 && bytes[end] !== 0 && bytes[end] !== 0x20) end++;
      const name = new TextDecoder("latin1").decode(bytes.slice(pos, end)).trim().toUpperCase();
      const length = bytes[pos + 16];
      if (!name || !length) break;
      fields.push({ name: name, length: length });
      pos += 32;
    }
    if (!fields.length) return [];
    let offset = 1;
    fields.forEach((f) => {
      f.offset = offset;
      offset += f.length;
    });
    const findField = (exact, terms = []) =>
      fields.find((f) => exact.includes(f.name)) ||
      fields.find((f) => terms.some((t) => f.name.includes(t)));
    // STEP 7 V5's native SYMLIST.DBF schema uses these exact field names.
    const nameField = findField(
      ["_SKZ"],
      ["SYMBOL", "SYMNAME", "SYM_NAME", "NAME", "MNEMONIC", "IDENT"]
    );
    const addressField = findField(
      ["_OPIEC", "_OPHIST"],
      ["ADDRESS", "OPERAND", "ADDR", "OPND", "OPIEC", "OPHIST", "ABSADR"]
    );
    const typeField = findField(
      ["_DATATYP", "_TYP"],
      ["DATATYP", "DATATYPE", "DATA_TYPE", "TYPE", "VAR_TYPE"]
    );
    const commentField = findField(["_COMMENT"], ["COMMENT", "COMM", "REMARK", "NOTE"]);
    if (!nameField || !addressField) return [];
    const rows = [],
      count = Math.min(recordCount, 100000),
      decoder = new TextDecoder("windows-1252");
    for (let i = 0; i < count; i++) {
      const base = headerLength + i * recordLength;
      if (base + recordLength > bytes.length) break;
      if (bytes[base] === 0x2a) continue;
      const get = (f) =>
        f
          ? decoder
              .decode(bytes.slice(base + f.offset, base + f.offset + f.length))
              .replace(/\0/g, "")
              .trim()
          : "";
      const name = get(nameField),
        address = normalizeStep7Address(get(addressField));
      if (!name || !address) continue;
      const type = step7DbfType(get(typeField));
      rows.push({
        _SKZ: name.replace(/\0/g, "").trim(),
        name: name.replace(/\0/g, "").trim(),
        address: address,
        type: type,
        comment: get(commentField),
        symbolName: name.replace(/\0/g, "").trim(),
        operand: get(addressField),
        dataType: get(typeField),
        _OPIEC: get(addressField),
        _DATATYP: get(typeField),
        _COMMENT: get(commentField),
      });
    }
    return rows;
  }

  function resolveProjectAddress(address, projectSymbols) {
    const symbols = Array.isArray(projectSymbols) ? projectSymbols : [];
    const target = normalizeStep7Address(address)
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/,BYTE(\d+)/, ",DBB$1");
    const direct = symbols.find(function (s) {
      return (
        normalizeStep7Address(s.address)
          .toUpperCase()
          .replace(/\s+/g, "")
          .replace(/,BYTE(\d+)/, ",DBB$1") === target
      );
    });
    if (direct) return direct;
    const m = target.match(/^DB(\d+),(?:DBB|DBW|DBD)(\d+)$/);
    if (!m) return null;
    return (
      projectSymbols.find(function (s) {
        return s._dbStructure && s.address.toUpperCase() === "DB" + m[1] + ",DBB" + m[2];
      }) || null
    );
  }
  function parseStep7DbStructure(text, filename) {
    const src = String(text || "");
    const m =
      src.match(/(?:DATA_BLOCK\s+)?DB\s*(\d+)\b/i) ||
      String(filename || "").match(/\bDB\s*(\d+)\b/i);
    if (!m) return [];
    const db = Number(m[1]),
      out = [];
    const sizes = {
      BOOL: 0,
      BYTE: 1, CHAR: 1, SINT: 1, USINT: 1,
      WORD: 2, INT: 2, UINT: 2, S5TIME: 2, DATE: 2,
      DWORD: 4, DINT: 4, UDINT: 4, REAL: 4, TIME: 4, TIME_OF_DAY: 4,
      LREAL: 8, LINT: 8, ULINT: 8, LTIME: 8, DATE_AND_TIME: 8, DT: 8,
      DTL: 12,
    };
    const varBlock = src.match(/\bVAR\b([\s\S]*?)\bEND_VAR\b/i);
    if (varBlock) {
      // SUBBLK memo text stores a DB's declarations in a VAR/END_VAR block.
      // Parse it with STEP 7's byte/bit alignment rules rather than expecting
      // an exported DATA_BLOCK ... STRUCT wrapper.
      const lines = varBlock[1].replace(/\r/g, "").split("\n");
      const pos = [0, 0];
      const stack = [];
      function alignEven() {
        if (pos[1]) { pos[0]++; pos[1] = 0; }
        if (pos[0] % 2) pos[0]++;
      }
      function alignByte() {
        if (pos[1]) { pos[0]++; pos[1] = 0; }
      }
      function add(name, type, comment, initial, byte, bit) {
        const path = stack.concat(name).filter(Boolean).join(".");
        const arrayElement = type.match(/\bOF\s+(\w+)$/i);
        const addressType = arrayElement ? arrayElement[1].toUpperCase() : type;
        const isBool = addressType === "BOOL";
        const area = ["BYTE", "CHAR", "SINT", "USINT"].includes(addressType) ? "DBB" :
          ["WORD", "INT", "UINT", "S5TIME", "DATE"].includes(addressType) ? "DBW" : "DBD";
        const addr = "DB" + db + "," + (isBool ? "DBX" + byte + "." + (bit || 0) : area + byte);
        out.push({
          _SKZ: path,
          name: path,
          address: addr,
          type: type,
          comment: comment || (initial ? "Initial value: " + initial : "DB structure field"),
          symbolName: path,
          operand: addr,
          dataType: type,
          _dbStructure: true,
          _byteOffset: byte,
          _bitOffset: isBool ? (bit || 0) : null,
          _initialValue: initial || "",
        });
      }
      let i = 0;
      while (i < lines.length) {
        const line = lines[i++].trim();
        if (!line) continue;
        let match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*STRUCT\b/i);
        if (match) { alignEven(); stack.push(match[1]); continue; }
        if (/^END_STRUCT\b/i.test(line)) { alignEven(); stack.pop(); continue; }

        match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s*([A-Za-z_][A-Za-z0-9_]*)\s*;\s*(?::=\s*([^;]*?))?\s*(?:\/\/(.*))?$/i);
        if (match) {
          const name = match[1], low = Number(match[2]), high = Number(match[3]);
          const type = match[4].toUpperCase(), initial = (match[5] || "").trim(), comment = (match[6] || "").trim();
          const count = high - low + 1;
          if (count > 0 && sizes[type] !== undefined) {
            alignEven();
            const byte = pos[0];
            add(name, "ARRAY[" + low + ".." + high + "] OF " + type, comment, initial, byte);
            if (type === "BOOL") pos[0] += Math.ceil(count / 8);
            else pos[0] += count * Math.max(1, sizes[type]);
            alignEven();
          }
          continue;
        }

        match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*(?:\/\/(.*))?$/i);
        if (match) {
          const name = match[1], low = Number(match[2]), high = Number(match[3]);
          const comment = (match[4] || "").trim();
          const next = (lines[i++] || "").trim();
          const element = next.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*;\s*(?::=\s*([^;]*?))?\s*(?:\/\/(.*))?$/);
          if (!element) { i--; continue; }
          const type = element[1].toUpperCase(), initial = (element[2] || "").trim();
          const fullComment = comment || (element[3] || "").trim();
          const count = high - low + 1;
          if (count > 0 && sizes[type] !== undefined) {
            alignEven();
            const byte = pos[0];
            add(name, "ARRAY[" + low + ".." + high + "] OF " + type, fullComment, initial, byte, type === "BOOL" ? 0 : undefined);
            if (type === "BOOL") pos[0] += Math.ceil(count / 8);
            else pos[0] += count * Math.max(1, sizes[type]);
            alignEven();
          }
          continue;
        }

        match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*:=\s*([^;]*?))?\s*;\s*(?:\/\/(.*))?$/);
        if (!match) continue;
        const name = match[1], type = match[2].toUpperCase();
        const initial = (match[3] || "").trim(), comment = (match[4] || "").trim();
        const str = type.match(/^STRING(?:\s*\[\s*(\d+)\s*\])?$/);
        const size = str ? 2 + Number(str[1] || 254) : sizes[type];
        if (size === undefined) continue;
        if (type === "BOOL") {
          add(name, type, comment, initial, pos[0], pos[1]);
          pos[1]++;
          if (pos[1] === 8) { pos[0]++; pos[1] = 0; }
        } else if (type === "BYTE" || type === "CHAR" || type === "SINT" || type === "USINT") {
          alignByte();
          add(name, type, comment, initial, pos[0]);
          pos[0] += size;
        } else {
          alignEven();
          add(name, type, comment, initial, pos[0]);
          pos[0] += size;
        }
      }
      alignEven();
      if (out.length) {
        // Expand ARRAY declarations into individually addressable fields, matching
        // STEP 7 offsets: BOOL elements are bit-packed; other elements use type size.
        const expanded = [];
        out.forEach(function (field) {
          const array = String(field.type || "").match(/^ARRAY\[(-?\d+)\.\.(-?\d+)\]\s+OF\s+(\w+)$/i);
          if (!array) {
            expanded.push(field);
            return;
          }
          const low = Number(array[1]), high = Number(array[2]);
          const elementType = array[3].toUpperCase();
          const count = high - low + 1;
          if (count <= 0 || count > 100000) return;
          const baseByte = Number(field._byteOffset) || 0;
          const baseBit = Number(field._bitOffset) || 0;
          const elementSize = sizes[elementType];
          if (elementType !== "BOOL" && elementSize === undefined) {
            expanded.push(field);
            return;
          }
          for (let index = low; index <= high; index++) {
            const relative = index - low;
            const byte = elementType === "BOOL"
              ? baseByte + Math.floor((baseBit + relative) / 8)
              : baseByte + relative * elementSize;
            const bit = elementType === "BOOL" ? (baseBit + relative) % 8 : null;
            const area = ["BYTE", "CHAR", "SINT", "USINT"].includes(elementType) ? "DBB" :
              ["WORD", "INT", "UINT", "S5TIME", "DATE"].includes(elementType) ? "DBW" : "DBD";
            const address = "DB" + db + "," + (elementType === "BOOL" ? "DBX" + byte + "." + bit : area + byte);
            const name = String(field.name || field._SKZ || "").replace(/\.$/, "") + "[" + index + "]";
            expanded.push({
              ...field,
              _SKZ: name,
              name: name,
              address: address,
              type: elementType,
              operand: address,
              dataType: elementType,
              _byteOffset: byte,
              _bitOffset: bit,
              _initialValue: "",
            });
          }
        });
        return expanded;
      }
    }

    // Fallback for textual AWL/SCL exports that express fields inside STRUCT.
    let inStruct = false, offset = 0, bit = -1;
    src.split(/\r?\n/).forEach(function (raw) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) return;
      if (/\bSTRUCT\b/i.test(line)) { inStruct = true; return; }
      if (/\bEND_STRUCT\b/i.test(line)) { inStruct = false; return; }
      if (!inStruct || /^(DATA_BLOCK|TITLE|VERSION|BEGIN|END_DATA_BLOCK)\b/i.test(line)) return;
      const f = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*;?$/);
      if (!f) return;
      const name = f[1], type = f[2].replace(/;$/, "").trim().toUpperCase();
      let size = sizes[type];
      const arr = type.match(/^ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s*(\w+)$/);
      if (arr && sizes[arr[3]] !== undefined)
        size = (Number(arr[2]) - Number(arr[1]) + 1) * Math.max(1, sizes[arr[3]]);
      const str = type.match(/^STRING(?:\s*\[\s*(\d+)\s*\])?$/);
      if (str) size = 2 + Number(str[1] || 254);
      if (size === undefined) return;
      if (type === "BOOL") {
        if (bit < 0 || bit > 7) { offset = Math.ceil(offset); bit = 0; }
        const addr = "DB" + db + ",DBX" + offset + "." + bit;
        out.push({ _SKZ: name, name, address: addr, type: "BOOL", comment: "DB structure field", symbolName: name, operand: addr, dataType: "BOOL", _dbStructure: true });
        bit++;
        if (bit > 7) { offset++; bit = -1; }
        return;
      }
      if (bit >= 0) { offset++; bit = -1; }
      if (size >= 2 && offset % 2) offset++;
      const prefix = size === 1 ? "DBB" : size === 2 ? "DBW" : size === 4 ? "DBD" : "DBB";
      const addr = "DB" + db + "," + prefix + offset;
      out.push({ _SKZ: name, name, address: addr, type, comment: "DB structure field · offset " + offset + " · " + type, symbolName: name, operand: addr, dataType: type, _dbStructure: true });
      offset += size;
    });
    return out;
  }
  async function readStep7DbtMemo(dbtBytes, blockNumber) {
    if (!dbtBytes || !Number.isInteger(blockNumber) || blockNumber <= 0) return "";
    const start = blockNumber * 512;
    if (start + 8 > dbtBytes.length) return "";
    const view = new DataView(dbtBytes.buffer, dbtBytes.byteOffset, dbtBytes.byteLength);
    // STEP 7's SUBBLK DBT memo header stores the total memo length at +4;
    // the first 8 bytes are the header. This matches the block reader used by
    // the DB 663 parser: payload = memoStart + 8, length = storedLength - 8.
    const storedLength = view.getUint32(start + 4, true);
    if (storedLength > 8 && storedLength <= dbtBytes.length - start) {
      const payload = dbtBytes.slice(start + 8, start + storedLength);
      const text = new TextDecoder("windows-1252").decode(payload).replace(/\0/g, "");
      const printable = (text.match(/[\t\r\n\x20-\x7E\u00A0-\u00FF]/g) || []).length;
      if (text.length && printable / text.length > 0.82) return text;
    }
    // Keep support for DBT variants that use a block-sized or FF FF 08 00
    // header instead of the length format above.
    const bytes = dbtBytes.slice(start, Math.min(dbtBytes.length, start + 512));
    let payload = bytes;
    if (bytes.length >= 8 && bytes[0] === 0xff && bytes[1] === 0xff &&
        bytes[2] === 0x08 && bytes[3] === 0x00) {
      const blockView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const length = [blockView.getUint32(4, true), blockView.getUint32(4, false)]
        .find((n) => n > 0 && n <= bytes.length - 8);
      if (length) payload = bytes.slice(8, 8 + length);
    } else {
      let stop = -1;
      for (let i = 0; i < bytes.length - 1; i++) {
        if (bytes[i] === 0x1a && bytes[i + 1] === 0x1a) { stop = i; break; }
      }
      if (stop > 0) payload = bytes.slice(0, stop);
    }
    const text = new TextDecoder("windows-1252").decode(payload).replace(/\0/g, "");
    const printable = (text.match(/[\t\r\n\x20-\x7E\u00A0-\u00FF]/g) || []).length;
    return text.length && printable / text.length > 0.82 ? text : "";
  }
  async function parseStep7SubblkDbf(file, dbtFile) {
    const buffer = await file.arrayBuffer(),
      view = new DataView(buffer),
      bytes = new Uint8Array(buffer);
    if (bytes.length < 33) return { rows: [], memoCount: 0 };
    const recordCount = view.getUint32(4, true),
      headerLength = view.getUint16(8, true),
      recordLength = view.getUint16(10, true);
    if (headerLength < 33 || recordLength < 2 || headerLength > bytes.length)
      return { rows: [], memoCount: 0 };
    const fields = [];
    let pos = 32;
    while (pos < headerLength - 1 && bytes[pos] !== 0x0d) {
      if (pos + 32 > bytes.length) break;
      let fieldEnd = pos;
      while (fieldEnd < pos + 11 && bytes[fieldEnd] !== 0 && bytes[fieldEnd] !== 0x20) fieldEnd++;
      const name = new TextDecoder("latin1")
        .decode(bytes.slice(pos, fieldEnd))
        .trim()
        .toUpperCase();
      const type = String.fromCharCode(bytes[pos + 11] || 0).toUpperCase(),
        length = bytes[pos + 16];
      if (!name || !length) break;
      fields.push({ name, type, length });
      pos += 32;
    }
    if (!fields.length) return { rows: [], memoCount: 0 };
    let offset = 1;
    fields.forEach((f) => {
      f.offset = offset;
      offset += f.length;
    });
    let dbtBytes = null;
    if (dbtFile) {
      try {
        dbtBytes = new Uint8Array(await (await dbtFile.getFile()).arrayBuffer());
      } catch (e) {
        console.warn("Could not read companion DBT", e);
      }
    }
    const rows = [],
      count = Math.min(recordCount, 100000),
      decoder = new TextDecoder("windows-1252");
    let memoCount = 0;
    for (let i = 0; i < count; i++) {
      const base = headerLength + i * recordLength;
      if (base + recordLength > bytes.length) break;
      if (bytes[base] === 0x2a) continue;
      const row = {};
      for (const f of fields) {
        const raw = decoder
          .decode(bytes.slice(base + f.offset, base + f.offset + f.length))
          .replace(/\0/g, "")
          .trim();
        row[f.name] = raw;
        if ((f.type === "M" || /^(MC5CODE|UDA|ADDINFO|SSBPART)$/i.test(f.name)) && dbtBytes) {
          const pointer = Number(raw);
          if (Number.isFinite(pointer) && pointer > 0) {
            const memo = await readStep7DbtMemo(dbtBytes, pointer);
            if (memo) {
              row[f.name + "_TEXT"] = memo;
              memoCount++;
            }
          }
        }
      }
      rows.push(row);
    }
    return { rows: rows, memoCount: memoCount, fields: fields.map((f) => f.name) };
  }
  async function walkStep7Folder(root) {
    const found = [],
      files = [],
      maxFiles = 12000;
    let visited = 0;
    async function walk(dir, depth, relativePath) {
      if (depth > 12 || visited >= maxFiles) return;
      for await (const entry of dir.values()) {
        if (visited >= maxFiles) break;
        if (entry.name.startsWith(".") || /^(node_modules|cache|temp|tmp)$/i.test(entry.name))
          continue;
        const path = relativePath ? relativePath + "/" + entry.name : entry.name;
        if (entry.kind === "directory") {
          await walk(entry, depth + 1, path);
          continue;
        }
        visited++;
        const ext = entry.name.split(".").pop().toLowerCase();
        if (
          [
            "asc",
            "sdf",
            "seq",
            "dif",
            "csv",
            "txt",
            "dbf",
            "dbt",
            "ydb",
            "cdb",
            "idb",
            "awl",
            "scl",
            "db",
            "udt",
          ].includes(ext)
        )
          files.push({ entry: entry, path: path });
      }
    }
    await walk(root, 0, "");
    const binaryCandidates = [],
      subblkFiles = [];
    for (const item of files) {
      const entry = item.entry,
        upper = entry.name.toUpperCase(),
        ext = upper.split(".").pop();
      if (upper === "SUBBLK.DBF") subblkFiles.push(item);
      const likelySymbol =
        ext === "ASC" ||
        ext === "SDF" ||
        ext === "SEQ" ||
        ext === "DIF" ||
        /SYM_TAB\.DBF$/.test(upper) ||
        /^SYM[_-]?\d*\.DBF$/.test(upper) ||
        /SYMBOL.*\.DBF$/.test(upper) ||
        /SYMLIST\.DBF$/.test(upper);
      const likelyStructure = ["AWL", "SCL", "DB", "UDT"].includes(ext);
      // SUBBLK.DBF is collected above but must not be parsed during project load.
      if (!likelySymbol && !likelyStructure) continue;
      try {
        const file = await entry.getFile();
        if (likelyStructure) {
          if (file.size > 15 * 1024 * 1024) continue;
          found.push(...parseStep7DbStructure(await file.text(), entry.name));
        } else if (ext === "DBF") {
          const rows = await parseDbfSymbolFile(file);
          if (rows.length) found.push(...rows);
          else if (likelySymbol)
            binaryCandidates.push(item.path + " (DBF found, symbol layout not recognized)");
        } else {
          if (file.size > 15 * 1024 * 1024) continue;
          const content = await file.text();
          content.split(/\r?\n/).forEach((line) => {
            const row = splitSymbolRecord(line);
            if (row && row.name && row.address) found.push(row);
          });
        }
      } catch (err) {
        console.warn("Could not inspect STEP 7 symbol file", item.path, err);
      }
    }
    // SUBBLK.DBF and its memo file can be large. Keep their file handles,
    // but defer parsing until the user explicitly requests a DB's fields by
    // typing a symbol/address followed by a dot in the analyzer input.
    const parsedDbStructures = new Set();
    const parsedDbRootNames = new Set();
    const pendingDbStructureLoads = new Map();
    async function loadDbStructures(requestedDb, requestedRootName) {
      const hasDbNumber = requestedDb !== null && requestedDb !== undefined &&
        Number.isInteger(Number(requestedDb)) && Number(requestedDb) >= 0;
      const dbNumber = hasDbNumber ? Number(requestedDb) : null;
      const rootName = String(requestedRootName || "").trim().replace(/\.+$/, "").trim();
      const normalizeRootName = (value) => String(value || "").trim().replace(/\.+$/, "").trim().replace(/^["']|["']$/g, "").toLowerCase();
      const rootKey = normalizeRootName(rootName);
      const cacheKey = dbNumber !== null ? "db:" + dbNumber : "name:" + rootKey;
      if (dbNumber !== null && parsedDbStructures.has(dbNumber)) {
        return found.filter(function (symbol) {
          const address = normalizeSignalAddress(symbol.address || symbol.operand || "");
          return new RegExp("^DB0*" + dbNumber + "(?:_|$)").test(address);
        });
      }
      if (dbNumber === null && parsedDbRootNames.has(rootKey)) {
        return found.filter(function (symbol) {
          return normalizeRootName(symbol._dbRootName) === rootKey;
        });
      }
      if (pendingDbStructureLoads.has(cacheKey)) return pendingDbStructureLoads.get(cacheKey);
      const task = (async function () {
        const added = [];
        const discoveredDbNumbers = new Set();
        for (const item of subblkFiles) {
          try {
            const directory = item.path.includes("/")
              ? item.path.slice(0, item.path.lastIndexOf("/") + 1)
              : "";
            const companion = files.find(
              (f) => f.path.toUpperCase() === (directory + "SUBBLK.DBT").toUpperCase()
            );
            const parsed = await parseStep7SubblkDbf(
              await item.entry.getFile(),
              companion && companion.entry
            );
            if (rootKey) {
              const sampleRows = parsed.rows.slice(0, 3).map(function (row) {
                const metadata = {};
                Object.keys(row).forEach(function (key) {
                  if (/_TEXT$/i.test(key)) return;
                  metadata[key] = String(row[key] || "").trim().slice(0, 100);
                });
                return metadata;
              });
              const matchingRows = parsed.rows.filter(function (row) {
                return Object.keys(row).some(function (key) {
                  if (/_TEXT$/i.test(key)) return false;
                  const value = String(row[key] || "").replace(/\0/g, "").trim();
                  return value.toLowerCase() === rootKey ||
                    /^DB\s*0*601$/i.test(value) ||
                    /^0*601$/.test(value);
                });
              }).slice(0, 12).map(function (row) {
                const metadata = {};
                Object.keys(row).forEach(function (key) {
                  if (/_TEXT$/i.test(key)) {
                    metadata[key + "_length"] = String(row[key] || "").length;
                    metadata[key + "_hasDeclaration"] = /\b(?:STRUCT|VAR)\b/i.test(String(row[key] || ""));
                  } else {
                    metadata[key] = String(row[key] || "").replace(/\0/g, "").trim().slice(0, 100);
                  }
                });
                return metadata;
              });
              console.info("[STEP7 SUBBLK scan]", {
                file: item.path,
                companionDbtFound: !!companion,
                rowCount: parsed.rows.length,
                memoCount: parsed.memoCount,
                fields: parsed.fields || [],
                sampleMetadata: sampleRows,
                matchingRows: matchingRows
              });
            }
            function valueFor(row, candidates) {
              const entries = Object.keys(row).map(function (key) {
                return { key: key, normalized: key.toUpperCase().replace(/[^A-Z0-9]/g, "") };
              });
              for (const candidate of candidates) {
                const normalized = candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
                const entry = entries.find(function (item) { return item.normalized === normalized; });
                if (entry && String(row[entry.key] || "").trim()) return String(row[entry.key]).trim();
              }
              return "";
            }
            function looksLikeDbType(value) {
              return /^(?:DB|DBLOCK|DATABLOCK|DATA_BLOCK|DATENBAUSTEIN)$/i.test(
                String(value || "").trim().replace(/[\s-]+/g, "_")
              );
            }
            function explicitlyNonDbType(value) {
              return /^(?:FB|FC|OB|SFB|SFC|UDT|FUNCTION_BLOCK|FUNCTION|ORGANIZATION_BLOCK)$/i.test(
                String(value || "").trim().replace(/[\s-]+/g, "_")
              );
            }
            for (const row of parsed.rows) {
              // SUBBLK.DBF schemas vary between STEP 7 releases. Normalize
              // field names and support common object-name/type aliases.
              const blockName = valueFor(row, [
                "BLKNAME", "BLOCKNAME", "OBJNAME", "OBJECTNAME", "NAME", "_SKZ", "SYMBOLNAME", "BLKIDENT", "IDENT"
              ]);
              const blockValue = valueFor(row, [
                "BLKNUMBER", "BLKNR", "BLOCKNR", "BLOCKNUMBER", "BLKNUM", "NUMBER", "BLKNO"
              ]);
              const blockType = valueFor(row, [
                "BLKTYPE", "BLKTYP", "BLOCKTYPE", "OBJTYPE", "OBJECTTYPE", "SUBBLKTYPE", "TYPE", "BLKCLASS"
              ]);
              const blockText = String(blockName + " " + blockValue);
              const match =
                blockText.match(/\bDB\s*0*(\d+)\b/i) ||
                String(blockValue).match(/^\s*0*(\d+)\s*$/);
              const rowDbNumber = match ? Number(match[1]) : null;
              const nameMatches = !!rootKey && normalizeRootName(blockName) === rootKey;
              // Diagnostic breadcrumbs contain metadata only (no DB structure
              // text), so users can report why a named DB lookup failed.
              if (rootKey && (nameMatches || /visu_add/i.test(blockName))) {
                console.info("[STEP7 DB lookup]", {
                  requestedRoot: rootName,
                  blockName: blockName,
                  blockNumber: blockValue,
                  blockType: blockType,
                  nameMatches: nameMatches,
                  textFields: Object.keys(row).filter((k) => /_TEXT$/i.test(k))
                });
              }
              const isExplicitDb = looksLikeDbType(blockType);
              const isExplicitNonDb = explicitlyNonDbType(blockType);
              // A DB and FB can share block number 663. Exact named lookup
              // takes precedence; numeric lookup must reject explicitly non-DB rows.
              if (isExplicitNonDb && !isExplicitDb) continue;
              if (dbNumber !== null) {
                if (rowDbNumber !== dbNumber && !nameMatches) continue;
                const hasDeclaration = Object.keys(row)
                  .filter((key) => /_TEXT$/i.test(key))
                  .some((key) =>
                    /\bSTRUCT\b/i.test(String(row[key] || "")) ||
                    /\bVAR\b[\s\S]*?\bEND_VAR\b/i.test(String(row[key] || ""))
                  );
                if (
                  !isExplicitDb &&
                  !/^DB\s*0*\d+$/i.test(blockName) &&
                  !nameMatches &&
                  !hasDeclaration
                ) continue;
              } else if (!nameMatches) {
                continue;
              }
              const resolvedDbNumber = rowDbNumber !== null ? rowDbNumber : dbNumber;
              if (resolvedDbNumber === null) continue;
              const body = Object.keys(row)
                .filter((k) => /_TEXT$/.test(k))
                .map((k) => row[k])
                .join("\n");
              if (!body || !(/STRUCT/i.test(body) || /\bVAR\b[\s\S]*?\bEND_VAR\b/i.test(body))) continue;
              const fields = parseStep7DbStructure(body, "DB" + resolvedDbNumber + ".DB");
              fields.forEach(function (field) {
                if (rootName) field._dbRootName = rootName;
                else if (blockName) field._dbRootName = blockName;
                field._sourceBlockName = blockName;
                field._sourceBlockType = blockType;
                field._sourceBlockNumber = rowDbNumber;
                field._OPIEC = field.address;
                field._DATATYP = field.dataType || field.type || "";
                field._COMMENT = field.comment || "DB structure field";
              });
              if (fields.length) {
                discoveredDbNumbers.add(resolvedDbNumber);
                added.push(...fields);
              }
            }
          } catch (err) {
            binaryCandidates.push(item.path + " (SUBBLK parse error: " + err.message + ")");
          }
        }
        const seen = new Set(found.map((symbol) => normalizeSignalAddress(symbol.address || symbol.operand || "")));
        added.forEach(function (symbol) {
          const id = normalizeSignalAddress(symbol.address || symbol.operand || "");
          if (symbol.name && symbol.address && !seen.has(id)) {
            seen.add(id);
            found.push(symbol);
          }
        });
        if (dbNumber !== null) parsedDbStructures.add(dbNumber);
        else parsedDbRootNames.add(rootKey);
        discoveredDbNumbers.forEach(function (number) { parsedDbStructures.add(number); });
        return added;
      })();
      pendingDbStructureLoads.set(cacheKey, task);
      try {
        return await task;
      } finally {
        pendingDbStructureLoads.delete(cacheKey);
      }
    }
    const dedup = new Map();
    found.forEach((s) => {
      s.name = String(s.name || "").trim();
      s.address = String(s.address || "").trim();
      if (!s.name || !s.address) return;
      const id = normalizeSignalAddress(s.address);
      if (!dedup.has(id)) dedup.set(id, s);
    });
    return {
      symbols: Array.from(dedup.values()),
      files: files.length,
      binaryCandidates: binaryCandidates,
      visited: visited,
      subblkFiles: subblkFiles.length,
      subblkRows: 0,
      subblkMemos: 0,
      subblkStructures: 0,
      loadDbStructures: loadDbStructures,
    };
  }

  window.SignalAnalyzerStep7 = {
    normalizeSymbolType,
    splitSymbolRecord,
    normalizeStep7Address,
    step7DbfType,
    parseDbfSymbolFile,
    resolveProjectAddress,
    parseStep7DbStructure,
    readStep7DbtMemo,
    parseStep7SubblkDbf,
    walkStep7Folder,
  };
})();
