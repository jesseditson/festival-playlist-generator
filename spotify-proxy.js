// Spotify proxy
const https = require('https')
const spotifyApi = require('./lib/spotify-api')

const spotifyRequest = spotifyApi.getApiRequest()

module.exports = (req, res) => {
  const pReq = https.request(
    {
      host: spotifyRequest.getHost(),
      port: spotifyRequest.getPort(),
      // Proxy
      headers: req.headers,
      path: req.url.replace(/^\/spotify/i, ''),
      method: req.method,
    },
    pRes => pRes.pipe(res),
  )
  req.pipe(pReq)
}
