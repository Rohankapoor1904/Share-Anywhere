const { LocalShareNode } = require('../../src/engine/LocalShareNode');
const { EngineEventType } = require('../../src/engine/EngineEvents');
const { NativeBridge } = require('../../src/native/NativeBridge');

// justified: NativeBridge is the native OS boundary (Android foreground service); the unit
// test asserts the JS layer computes and forwards the correct progress payload.
describe('Foreground-service notification progress (Issue 4)', () => {
  let node;

  beforeEach(async () => {
    node = new LocalShareNode();
    await node.start();
  });

  afterEach(async () => {
    await node.stop();
    jest.restoreAllMocks();
  });

  test('a transfer-progress event pushes a determinate percentage to the service', () => {
    const spy = jest.spyOn(NativeBridge, 'updateForegroundProgress').mockImplementation(() => {});

    node.events.emit(EngineEventType.TRANSFER_PROGRESS, {
      direction: 'send',
      fileName: 'video.mp4',
      transferredBytes: 524288,
      totalBytes: 1048576,
      speed: 1048576
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [title, content, percent] = spy.mock.calls[0];
    expect(title).toContain('Sending');
    expect(content).toContain('video.mp4');
    expect(content).toContain('50%');
    expect(percent).toBe(50);
  });

  test('receiving progress is labelled and clamped to 100', () => {
    const spy = jest.spyOn(NativeBridge, 'updateForegroundProgress').mockImplementation(() => {});

    node.events.emit(EngineEventType.TRANSFER_PROGRESS, {
      direction: 'receive',
      fileName: 'photo.jpg',
      transferredBytes: 2048,
      totalBytes: 1024,
      speed: 0
    });

    const [title, , percent] = spy.mock.calls[0];
    expect(title).toContain('Receiving');
    expect(percent).toBe(100);
  });

  test('unknown total size reports an indeterminate (-1) progress', () => {
    const spy = jest.spyOn(NativeBridge, 'updateForegroundProgress').mockImplementation(() => {});

    node.events.emit(EngineEventType.TRANSFER_PROGRESS, {
      direction: 'send',
      fileName: 'blob.bin',
      transferredBytes: 512,
      totalBytes: 0,
      speed: 0
    });

    const [, , percent] = spy.mock.calls[0];
    expect(percent).toBe(-1);
  });
});
