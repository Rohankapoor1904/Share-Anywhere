const kProtocolVersion = 1;
const kControlProtocolVersion = 1;
const kMdnsServiceType = '_localshare._tcp';
const kMdnsServiceNamePrefix = 'LocalShare-';
const kBleServiceUuid = '6c4c6f63-616c-7368-6172-652d-30303031';
const kDefaultPort = 53318;
const kLocalSendPort = 53317;
const kDefaultChunkSize = 1024 * 1024;
const kMaxChunkSize = 16 * 1024 * 1024;
const kHeaderDeviceId = 'x-localshare-device-id';
const kHeaderDeviceName = 'x-localshare-device-name';
const kHeaderFingerprint = 'x-localshare-fingerprint';
const kHeaderSessionId = 'x-localshare-session-id';
const kPartialSuffix = '.localshare.part';
const kPeerStaleMs = 15000;

module.exports = {
  kProtocolVersion,
  kControlProtocolVersion,
  kMdnsServiceType,
  kMdnsServiceNamePrefix,
  kBleServiceUuid,
  kDefaultPort,
  kLocalSendPort,
  kDefaultChunkSize,
  kMaxChunkSize,
  kHeaderDeviceId,
  kHeaderDeviceName,
  kHeaderFingerprint,
  kHeaderSessionId,
  kPartialSuffix,
  kPeerStaleMs
};
