const { TransferGateway } = require('./transfer-gateway');
const { LocalSendGateway } = require('./localsend-gateway');
const protocol = require('./protocol');

let transferGateway = null;
let localsendGateway = null;

async function start() {
  transferGateway = new TransferGateway({
    port: protocol.kDefaultPort
  });
  await transferGateway.start();

  localsendGateway = new LocalSendGateway({
    port: protocol.kLocalSendPort
  });
  await localsendGateway.start();

  // eslint-disable-next-line no-console
  console.info(`[LocalShare Node Gateway] Running on ports ${protocol.kDefaultPort} (TLS/HTTP) and ${protocol.kLocalSendPort} (LocalSend)`);
}

async function stop() {
  if (transferGateway) {
    await transferGateway.stop();
  }
  if (localsendGateway) {
    await localsendGateway.stop();
  }
}

// Handle termination signals
process.on('SIGINT', async () => {
  await stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stop();
  process.exit(0);
});

if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start node gateway:', err);
    process.exit(1);
  });
}

module.exports = {
  start,
  stop
};

