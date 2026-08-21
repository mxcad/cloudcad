const net = require('net');

function testTcpConnection(config) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: '连接超时' });
    }, 5000);

    socket.connect(config.port, config.host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

module.exports = {
  testTcpConnection,
};
