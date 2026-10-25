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
              .replace(/\\0/g, "")
              .trim()
          : "";
      const name = get(nameField),
        address = normalizeStep7Address(get(addressField));
      if (!name || !address) continue;
      const type = step7DbfType(get(typeField));
      rows.push({
        name: name.replace(/\\0/g, "").trim(),
        address: address,
        type: type,
        comment: get(commentField),
        symbolName: name.replace(/\\0/g, "").trim(),
        operand: get(addressField),
        dataType: get(typeField),
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
    let inStruct = false,
      offset = 0,
      bit = -1;
    const sizes = {
      BOOL: 0,
      BYTE: 1,
      CHAR: 1,
      SINT: 1,
      USINT: 1,
      WORD: 2,
      INT: 2,
      UINT: 2,
      S5TIME: 2,
      DATE: 2,
      DWORD: 4,
      DINT: 4,
      UDINT: 4,
      REAL: 4,
      TIME: 4,
      TIME_OF_DAY: 4,
      LREAL: 8,
      LINT: 8,
      ULINT: 8,
      LTIME: 8,
      DATE_AND_TIME: 8,
      DT: 8,
      DTL: 12,
    };
    src.split(/\r?\n/).forEach(function (raw) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) return;
      if (/\bSTRUCT\b/i.test(line)) {
        inStruct = true;
        return;
      }
      if (/\bEND_STRUCT\b/i.test(line)) {
        inStruct = false;
        return;
      }
      if (!inStruct || /^(DATA_BLOCK|TITLE|VERSION|BEGIN|END_DATA_BLOCK)\b/i.test(line)) return;
      const f = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*;?$/);
      if (!f) return;
      const name = f[1],
        type = f[2].replace(/;$/, "").trim().toUpperCase();
      let size = sizes[type];
      const arr = type.match(/^ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s*(\w+)$/);
      if (arr && sizes[arr[3]] !== undefined)
        size = (Number(arr[2]) - Number(arr[1]) + 1) * Math.max(1, sizes[arr[3]]);
      const str = type.match(/^STRING(?:\s*\[\s*(\d+)\s*\])?$/);
      if (str) size = 2 + Number(str[1] || 254);
      if (size === undefined) return;
      if (type === "BOOL") {
        if (bit < 0 || bit > 7) {
          offset = Math.ceil(offset);
          bit = 0;
        }
        const addr = "DB" + db + ",DBX" + offset + "." + bit;
        out.push({
          name: name,
          address: addr,
          type: "BOOL",
          comment: "DB structure field",
          symbolName: name,
          operand: addr,
          dataType: "BOOL",
          _dbStructure: true,
        });
        bit++;
        if (bit > 7) {
          offset++;
          bit = -1;
        }
        return;
      }
      if (bit >= 0) {
        offset++;
        bit = -1;
      }
      if (size >= 2 && offset % 2) offset++;
      const prefix = size === 1 ? "DBB" : size === 2 ? "DBW" : size === 4 ? "DBD" : "DBB",
        addr = "DB" + db + "," + prefix + offset;
      out.push({
        name: name,
        address: addr,
        type: type,
        comment: "DB structure field · offset " + offset + " · " + type,
        symbolName: name,
        operand: addr,
        dataType: type,
        _dbStructure: true,
      });
      offset += size;
    });
    return out;
  }
  async function readStep7DbtMemo(dbtBytes, blockNumber) {
    if (!dbtBytes || !Number.isInteger(blockNumber) || blockNumber <= 0) return "";
    const start = blockNumber * 512;
    if (start >= dbtBytes.length) return "";
    const bytes = dbtBytes.slice(start, Math.min(dbtBytes.length, start + 512));
    let payload = bytes;
    if (
      bytes.length >= 8 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xff &&
      bytes[2] === 0x08 &&
      bytes[3] === 0x00
    ) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const length = [view.getUint32(4, true), view.getUint32(4, false)].find(
        (n) => n > 0 && n <= bytes.length - 8
      );
      if (length) payload = bytes.slice(8, 8 + length);
    } else {
      let stop = -1;
      for (let i = 0; i < bytes.length - 1; i++) {
        if (bytes[i] === 0x1a && bytes[i + 1] === 0x1a) {
          stop = i;
          break;
        }
      }
      if (stop > 0) payload = bytes.slice(0, stop);
    }
    const text = new TextDecoder("windows-1252").decode(payload);
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
    const pendingDbStructureLoads = new Map();
    async function loadDbStructures(requestedDb) {
      const dbNumber = Number(requestedDb);
      if (!Number.isInteger(dbNumber) || dbNumber < 0) return [];
      if (parsedDbStructures.has(dbNumber)) {
        return found.filter(function (symbol) {
          const address = normalizeSignalAddress(symbol.address || symbol.operand || "");
          return new RegExp("^DB0*" + dbNumber + "(?:_|$)").test(address);
        });
      }
      if (pendingDbStructureLoads.has(dbNumber)) return pendingDbStructureLoads.get(dbNumber);
      const task = (async function () {
        const added = [];
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
            for (const row of parsed.rows) {
              const blockValue = row.BLKNUMBER || row.BLKNR || row.NUMBER || row.BLOCKNR || "";
              const blockName = row.BLKNAME || row.NAME || row.BLOCKNAME || "";
              const match =
                String(blockName + " " + blockValue).match(/\bDB\s*0*(\d+)\b/i) ||
                String(blockValue).match(/^\s*0*(\d+)\s*$/);
              if (!match || Number(match[1]) !== dbNumber) continue;
              const body = Object.keys(row)
                .filter((k) => /_TEXT$/.test(k))
                .map((k) => row[k])
                .join("\n");
              if (!body || !/STRUCT/i.test(body)) continue;
              const fields = parseStep7DbStructure(body, "DB" + dbNumber + ".DB");
              if (fields.length) added.push(...fields);
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
        parsedDbStructures.add(dbNumber);
        return added;
      })();
      pendingDbStructureLoads.set(dbNumber, task);
      try {
        return await task;
      } finally {
        pendingDbStructureLoads.delete(dbNumber);
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
