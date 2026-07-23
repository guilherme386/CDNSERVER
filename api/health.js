module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;

  let proxyOk = false;
  try {
    const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
    const response = await fetch(proxyUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    proxyOk = response.ok || response.status === 405;
  } catch {
    proxyOk = false;
  }

  return res.status(proxyOk ? 200 : 503).json({
    status: proxyOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      proxy: proxyOk ? 'connected' : 'unreachable',
    },
  });
};
