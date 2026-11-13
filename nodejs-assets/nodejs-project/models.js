const { kProtocolVersion, kDefaultPort } = require('./protocol');

class DeviceInfo {
  constructor(data = {}) {
    this.deviceId = String(data.deviceId || '');
    this.displayName = String(data.displayName || 'Unknown');
    this.address = String(data.address || '0.0.0.0');
    this.port = typeof data.port === 'number' ? data.port : kDefaultPort;
    this.fingerprint = String(data.fingerprint || '');
    this.platform = String(data.platform || 'unknown');
    this.protocolVersion = typeof data.protocolVersion === 'number' ? data.protocolVersion : kProtocolVersion;
    this.lastSeen = typeof data.lastSeen === 'number' ? data.lastSeen : Date.now();
    this.discoveryChannel = String(data.discoveryChannel || 'unknown');
  }

  toJSON() {
    return {
      deviceId: this.deviceId,
      displayName: this.displayName,
      address: this.address,
      port: this.port,
      fingerprint: this.fingerprint,
      platform: this.platform,
      protocolVersion: this.protocolVersion,
      lastSeen: this.lastSeen,
      discoveryChannel: this.discoveryChannel
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid DeviceInfo payload: object required');
    }
    return new DeviceInfo(json);
  }
}

class FileDescriptor {
  constructor(data = {}) {
    this.fileId = String(data.fileId || '');
    this.fileName = String(data.fileName || '');
    this.fileSize = Number(data.fileSize) || 0;
    this.mimeType = String(data.mimeType || 'application/octet-stream');
    this.sha256 = String(data.sha256 || '');
  }

  toJSON() {
    return {
      fileId: this.fileId,
      fileName: this.fileName,
      fileSize: this.fileSize,
      mimeType: this.mimeType,
      sha256: this.sha256
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid FileDescriptor payload: object required');
    }
    return new FileDescriptor(json);
  }
}

class RemoteFileEntry {
  constructor(data = {}) {
    this.id = String(data.id || '');
    this.name = String(data.name || '');
    this.size = Number(data.size) || 0;
    this.mimeType = String(data.mimeType || 'application/octet-stream');
    this.lastModified = Number(data.lastModified) || Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      size: this.size,
      mimeType: this.mimeType,
      lastModified: this.lastModified
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid RemoteFileEntry payload: object required');
    }
    return new RemoteFileEntry(json);
  }
}

class SessionRequest {
  constructor(data = {}) {
    this.sessionId = String(data.sessionId || '');
    this.sender = data.sender instanceof DeviceInfo ? data.sender : new DeviceInfo(data.sender || {});
    this.files = Array.isArray(data.files)
      ? data.files.map((f) => (f instanceof FileDescriptor ? f : new FileDescriptor(f)))
      : [];
    this.pin = data.pin !== undefined && data.pin !== null ? String(data.pin) : null;
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      sender: this.sender.toJSON(),
      files: this.files.map((f) => f.toJSON()),
      pin: this.pin
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid SessionRequest payload: object required');
    }
    return new SessionRequest({
      sessionId: json.sessionId,
      sender: DeviceInfo.fromJSON(json.sender || {}),
      files: Array.isArray(json.files) ? json.files.map(FileDescriptor.fromJSON) : [],
      pin: json.pin
    });
  }
}

class SessionResponse {
  constructor(data = {}) {
    this.sessionId = String(data.sessionId || '');
    this.accepted = Boolean(data.accepted);
    this.reason = data.reason ? String(data.reason) : null;
    this.resume = data.resume && typeof data.resume === 'object' ? { ...data.resume } : {};
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      accepted: this.accepted,
      reason: this.reason,
      resume: this.resume
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid SessionResponse payload: object required');
    }
    return new SessionResponse(json);
  }
}

class ChunkAck {
  constructor(data = {}) {
    this.sessionId = String(data.sessionId || '');
    this.fileId = String(data.fileId || '');
    this.offset = Number(data.offset) || 0;
    this.received = Number(data.received) || 0;
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      fileId: this.fileId,
      offset: this.offset,
      received: this.received
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid ChunkAck payload: object required');
    }
    return new ChunkAck(json);
  }
}

class CommitRequest {
  constructor(data = {}) {
    this.sessionId = String(data.sessionId || '');
    this.fileId = String(data.fileId || '');
    this.sha256 = String(data.sha256 || '');
    this.lastChunk = Boolean(data.lastChunk);
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      fileId: this.fileId,
      sha256: this.sha256,
      lastChunk: this.lastChunk
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid CommitRequest payload: object required');
    }
    return new CommitRequest(json);
  }
}

class CommitResponse {
  constructor(data = {}) {
    this.sessionId = String(data.sessionId || '');
    this.fileId = String(data.fileId || '');
    this.verified = Boolean(data.verified);
    this.savedPath = data.savedPath ? String(data.savedPath) : null;
    this.errorMessage = data.errorMessage ? String(data.errorMessage) : null;
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      fileId: this.fileId,
      verified: this.verified,
      savedPath: this.savedPath,
      errorMessage: this.errorMessage
    };
  }

  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid CommitResponse payload: object required');
    }
    return new CommitResponse(json);
  }
}

module.exports = {
  DeviceInfo,
  FileDescriptor,
  RemoteFileEntry,
  SessionRequest,
  SessionResponse,
  ChunkAck,
  CommitRequest,
  CommitResponse
};
