const SpotifyWebApi = require('spotify-web-api-node')
const secrets = require('load-secrets')

if (!secrets.CLIENT_ID || !secrets.CLIENT_SECRET) {
  throw new Error('Missing credentials. Set CLIENT_ID and CLIENT_SECRET.')
}

if (!process.env.REDIRECT_URI) {
  console.log('No REDIRECT_URI provided, setting to localhost:3000')
}

module.exports = new SpotifyWebApi({
  clientId: secrets.CLIENT_ID,
  clientSecret: secrets.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000',
})
