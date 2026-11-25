export const kProtocolVersion = 1;
export const kControlProtocolVersion = 1;
export const kMdnsServiceType = '_localshare._tcp';
export const kMdnsServiceNamePrefix = 'LocalShare-';
export const kBleServiceUuid = '6c4c6f63-616c-7368-6172-652d-30303031';
export const kDefaultPort = 53318;
export const kLocalSendPort = 53317;
export const kDefaultChunkSize = 1024 * 1024;
export const kMaxChunkSize = 16 * 1024 * 1024;
export const kHeaderDeviceId = 'x-localshare-device-id';
export const kHeaderDeviceName = 'x-localshare-device-name';
export const kHeaderFingerprint = 'x-localshare-fingerprint';
export const kHeaderSessionId = 'x-localshare-session-id';
export const kPartialSuffix = '.localshare.part';
export const kPeerStaleMs = 45000;
// Google Nearby Connections (offline phone-to-phone transport)
export const kNearbyServiceId = 'com.rohan.localshare';
export const kNearbyProtocolVersion = 1;
// ConnectionsClient.MAX_BYTES_DATA_SIZE; control messages must fit in one BYTES payload.
export const kNearbyMaxControlBytes = 32768;
// Endpoint info rides in the BLE advertisement, so it is kept well under the radio limit.
export const kNearbyEndpointInfoMaxBytes = 120;
export const kNearbyOfferTimeoutMs = 120000;
export const kNearbyConnectTimeoutMs = 60000;
export const kNearbyAckTimeoutMs = 300000;

export default {
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
  kPeerStaleMs,
  kNearbyServiceId,
  kNearbyProtocolVersion,
  kNearbyMaxControlBytes,
  kNearbyEndpointInfoMaxBytes,
  kNearbyOfferTimeoutMs,
  kNearbyConnectTimeoutMs,
  kNearbyAckTimeoutMs
};

