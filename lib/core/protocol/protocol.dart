/// Wire protocol constants and helpers for LocalShare.
///
/// The engine speaks a small, versioned REST protocol over TLS. It is
/// deliberately aligned in spirit with LocalSend Protocol v2 so we can add an
/// interop layer later, but it is an independent implementation.
library;

/// Current protocol version negotiated in the `/session` request.
const int kProtocolVersion = 1;
const int kControlProtocolVersion = 1;

/// mDNS service type used to advertise and browse this app.
const String kMdnsServiceType = '_localshare._tcp';

/// Prefix for our instance names, used to filter unrelated mDNS services.
const String kMdnsServiceNamePrefix = 'LocalShare-';

/// BLE 128-bit service UUID used to carry the discovery payload.
const String kBleServiceUuid = '6c4c6f63-616c-7368-6172-652d-30303031';

/// Default TCP port for native TLS transfers. Kept distinct from LocalSend (53317).
const int kDefaultPort = 53318;

/// Default chunk size (1 MiB). The sender may negotiate up to [kMaxChunkSize].
const int kDefaultChunkSize = 1024 * 1024;

/// Upper bound on a single chunk so a hostile peer cannot exhaust memory.
const int kMaxChunkSize = 16 * 1024 * 1024;

/// HTTP header carrying the device id, mirrored in mDNS/BLE advertisements.
const String kHeaderDeviceId = 'x-localshare-device-id';

/// HTTP header carrying the device display name.
const String kHeaderDeviceName = 'x-localshare-device-name';

/// HTTP header carrying the certificate fingerprint of the sender.
const String kHeaderFingerprint = 'x-localshare-fingerprint';

/// HTTP header carrying the session id for chunk/commit calls.
const String kHeaderSessionId = 'x-localshare-session-id';

/// Files are written with this suffix until verified, then renamed.
const String kPartialSuffix = '.localshare.part';

const String kFilesRoute = '/v1/files';
const String kFileDownloadRoute = '/v1/files/download';
