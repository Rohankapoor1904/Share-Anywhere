const {
  DeviceInfo,
  FileDescriptor,
  RemoteFileEntry,
  SessionRequest,
  SessionResponse,
  ChunkAck,
  CommitRequest,
  CommitResponse
} = require('../../nodejs-assets/nodejs-project/models');

describe('Wire Protocol Models Round-Trip Tests (§6, §12.1)', () => {
  test('DeviceInfo round-trips with full fields', () => {
    const original = new DeviceInfo({
      deviceId: 'dev-12345',
      displayName: 'MacBook Pro',
      address: '192.168.1.100',
      port: 53318,
      fingerprint: 'SHA256:abcd1234ef5678',
      platform: 'desktop',
      protocolVersion: 1,
      lastSeen: 1700000000000,
      discoveryChannel: 'mdns'
    });

    const json = original.toJSON();
    const restored = DeviceInfo.fromJSON(json);

    expect(restored.deviceId).toBe(original.deviceId);
    expect(restored.displayName).toBe(original.displayName);
    expect(restored.address).toBe(original.address);
    expect(restored.port).toBe(original.port);
    expect(restored.fingerprint).toBe(original.fingerprint);
    expect(restored.platform).toBe(original.platform);
    expect(restored.protocolVersion).toBe(original.protocolVersion);
    expect(restored.lastSeen).toBe(original.lastSeen);
    expect(restored.discoveryChannel).toBe(original.discoveryChannel);
  });

  test('DeviceInfo defaults handle missing/empty data', () => {
    const restored = DeviceInfo.fromJSON({});
    expect(restored.deviceId).toBe('');
    expect(restored.displayName).toBe('Unknown');
    expect(restored.address).toBe('0.0.0.0');
    expect(restored.port).toBe(53318);
    expect(restored.protocolVersion).toBe(1);
    expect(restored.platform).toBe('unknown');
    expect(restored.discoveryChannel).toBe('unknown');
  });

  test('FileDescriptor round-trips with full fields', () => {
    const original = new FileDescriptor({
      fileId: 'file-abc-99',
      fileName: 'document.pdf',
      fileSize: 10485760,
      mimeType: 'application/pdf',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    });

    const json = original.toJSON();
    const restored = FileDescriptor.fromJSON(json);

    expect(restored.fileId).toBe(original.fileId);
    expect(restored.fileName).toBe(original.fileName);
    expect(restored.fileSize).toBe(original.fileSize);
    expect(restored.mimeType).toBe(original.mimeType);
    expect(restored.sha256).toBe(original.sha256);
  });

  test('RemoteFileEntry round-trips correctly', () => {
    const original = new RemoteFileEntry({
      id: 'remote-1',
      name: 'photo.jpg',
      size: 409600,
      mimeType: 'image/jpeg',
      lastModified: 1699999999000
    });

    const json = original.toJSON();
    const restored = RemoteFileEntry.fromJSON(json);

    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.size).toBe(original.size);
    expect(restored.mimeType).toBe(original.mimeType);
    expect(restored.lastModified).toBe(original.lastModified);
  });

  test('SessionRequest round-trips with sender, files, and PIN', () => {
    const sender = new DeviceInfo({
      deviceId: 'sender-01',
      displayName: 'Pixel 8',
      address: '192.168.1.50',
      port: 53318,
      fingerprint: 'FINGERPRINT-AA',
      platform: 'android'
    });

    const file = new FileDescriptor({
      fileId: 'f-1',
      fileName: 'video.mp4',
      fileSize: 52428800,
      mimeType: 'video/mp4',
      sha256: 'deadbeef1234'
    });

    const original = new SessionRequest({
      sessionId: 'sess-xyz-777',
      sender,
      files: [file],
      pin: '482910'
    });

    const json = original.toJSON();
    const restored = SessionRequest.fromJSON(json);

    expect(restored.sessionId).toBe('sess-xyz-777');
    expect(restored.sender.deviceId).toBe('sender-01');
    expect(restored.sender.displayName).toBe('Pixel 8');
    expect(restored.files.length).toBe(1);
    expect(restored.files[0].fileId).toBe('f-1');
    expect(restored.files[0].fileName).toBe('video.mp4');
    expect(restored.pin).toBe('482910');
  });

  test('SessionResponse round-trips with resume offsets', () => {
    const original = new SessionResponse({
      sessionId: 'sess-xyz-777',
      accepted: true,
      reason: null,
      resume: {
        'f-1': 20971520
      }
    });

    const json = original.toJSON();
    const restored = SessionResponse.fromJSON(json);

    expect(restored.sessionId).toBe('sess-xyz-777');
    expect(restored.accepted).toBe(true);
    expect(restored.reason).toBeNull();
    expect(restored.resume['f-1']).toBe(20971520);
  });

  test('ChunkAck round-trips correctly', () => {
    const original = new ChunkAck({
      sessionId: 'sess-1',
      fileId: 'file-1',
      offset: 1048576,
      received: 1048576
    });

    const json = original.toJSON();
    const restored = ChunkAck.fromJSON(json);

    expect(restored.sessionId).toBe(original.sessionId);
    expect(restored.fileId).toBe(original.fileId);
    expect(restored.offset).toBe(1048576);
    expect(restored.received).toBe(1048576);
  });

  test('CommitRequest round-trips correctly', () => {
    const original = new CommitRequest({
      sessionId: 'sess-1',
      fileId: 'file-1',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      lastChunk: true
    });

    const json = original.toJSON();
    const restored = CommitRequest.fromJSON(json);

    expect(restored.sessionId).toBe(original.sessionId);
    expect(restored.fileId).toBe(original.fileId);
    expect(restored.sha256).toBe(original.sha256);
    expect(restored.lastChunk).toBe(true);
  });

  test('CommitResponse round-trips correctly', () => {
    const original = new CommitResponse({
      sessionId: 'sess-1',
      fileId: 'file-1',
      verified: true,
      savedPath: '/storage/emulated/0/Download/document.pdf',
      errorMessage: null
    });

    const json = original.toJSON();
    const restored = CommitResponse.fromJSON(json);

    expect(restored.sessionId).toBe('sess-1');
    expect(restored.fileId).toBe('file-1');
    expect(restored.verified).toBe(true);
    expect(restored.savedPath).toBe('/storage/emulated/0/Download/document.pdf');
    expect(restored.errorMessage).toBeNull();
  });
});
