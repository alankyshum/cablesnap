/**
 * Manual mock for expo-file-system (SDK 55 class-based API).
 *
 * Tests interact via:
 *   const FileSystem = require('expo-file-system');
 *   FileSystem.__setFileState(uri, { exists, modificationTime })
 *   FileSystem.__setDirListing(uri, entries)   // entries = array of File/Directory instances
 *   FileSystem.__resetState()
 *   FileSystem.__getFileMoves()   → [{from, to}]
 *   FileSystem.__getFileDeletes() → [uri]
 *   FileSystem.__getDirCreates()  → [uri]
 */

const MOCK_DOC_URI = 'file:///var/mobile/Documents/';

let _fileState = new Map();    // uri → { exists, modificationTime }
let _dirListings = new Map();  // uri → File[] | Directory[]
let _fileMoves = [];
let _fileDeletes = [];
let _dirCreates = [];

function __resetState() {
  _fileState = new Map();
  _dirListings = new Map();
  _fileMoves = [];
  _fileDeletes = [];
  _dirCreates = [];
}

function __setFileState(uri, state) {
  _fileState.set(uri, state);
}

function __setDirListing(uri, entries) {
  _dirListings.set(uri, entries);
}

function __getFileMoves() { return [..._fileMoves]; }
function __getFileDeletes() { return [..._fileDeletes]; }
function __getDirCreates() { return [..._dirCreates]; }

function _resolveUri(...uris) {
  const parts = uris.map(u => (u && typeof u === 'object' && u.uri != null) ? u.uri : String(u));
  let uri = parts[0] || '';
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!uri.endsWith('/')) uri += '/';
    uri += seg;
  }
  return uri;
}

class Directory {
  constructor(...uris) {
    let uri = _resolveUri(...uris);
    if (!uri.endsWith('/')) uri += '/';
    this.uri = uri;
  }
  get exists() {
    return _dirListings.has(this.uri);
  }
  list() {
    return _dirListings.get(this.uri) ?? [];
  }
  create(_options) {
    _dirCreates.push(this.uri);
  }
  createFile(name, _mimeType) {
    return new File(this, name);
  }
  createDirectory(name) {
    return new Directory(this, name);
  }
}

class File {
  constructor(...uris) {
    this.uri = _resolveUri(...uris);
  }
  get exists() {
    return _fileState.get(this.uri)?.exists ?? false;
  }
  delete() {
    _fileDeletes.push(this.uri);
    const prev = _fileState.get(this.uri) ?? {};
    _fileState.set(this.uri, { ...prev, exists: false });
  }
  move(dest) {
    const destUri = (dest && typeof dest === 'object' && dest.uri != null) ? dest.uri : String(dest);
    _fileMoves.push({ from: this.uri, to: destUri });
  }
  info() {
    const state = _fileState.get(this.uri) ?? {};
    return {
      modificationTime: state.modificationTime ?? null,
      size: state.size ?? 0,
    };
  }
}

const document = new Directory(MOCK_DOC_URI);

const Paths = {
  document,
  cache: new Directory('file:///var/mobile/Cache/'),
};

module.exports = {
  File,
  Directory,
  Paths,
  __resetState,
  __setFileState,
  __setDirListing,
  __getFileMoves,
  __getFileDeletes,
  __getDirCreates,
};
