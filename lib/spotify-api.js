const SpotifyWebApi = require('spotify-web-api-node')

export default new SpotifyWebApi({
  clientId: '',
  clientSecret: '',
  redirectUri: 'http://localhost:3000',
})
