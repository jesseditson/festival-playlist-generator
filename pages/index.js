import React, {Component} from 'react'
import jsCookie from 'js-cookie'
import cookie from 'cookie'
import fetch from 'isomorphic-fetch'
import store from 'store'
import SpotifyWebApi from 'spotify-web-api-node'
import url from 'url'

let spotifyApi

const updateCredentials = ({access_token, refresh_token}) => {
  if (access_token) spotifyApi.setAccessToken(access_token)
  if (refresh_token) spotifyApi.setRefreshToken(refresh_token)
}

const getUser = async fail => {
  let user
  try {
    const res = await spotifyApi.getMe()
    user = res.body
  } catch (e) {
    console.error(`Error fetching user:`, e)
    if (fail) throw e
  }
  if (!user) {
    const {body} = await spotifyApi.refreshAccessToken()
    updateCredentials(body)
    return getUser(true)
  }
  return user
}

const getAllPlaylistItems = async (p, opts = {offset: 0, limit: 100}, prev = []) => {
  const {body} = await spotifyApi.getPlaylistTracks(p.owner.id, p.id, opts)
  opts.offset += body.items.length
  const items = prev.concat(body.items)
  if (opts.offset < body.total) {
    return getAllPlaylistItems(p, opts, items)
  } else {
    return items
  }
}

export default class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      ...props,
      artistsInPlaylist: {},
      selectedPlaylist: null,
      availablePlaylists: [],
      loadingPlaylist: false,
    }
  }
  static async getInitialProps({req}) {
    let access_token, refresh_token, user
    let errors = []
    let relURL = u => (req ? `http://${req.headers.host}${u}` : `${window.location.href}${u}`)
    if (!spotifyApi) {
      spotifyApi = new SpotifyWebApi(null, url.parse(relURL('/spotify')))
    }
    if (req && req.headers.cookie) {
      // Server
      const c = cookie.parse(req.headers.cookie)
      access_token = c.access_token
      refresh_token = c.refresh_token
      updateCredentials({access_token, refresh_token})
      user = await getUser()
      try {
        user = await getUser()
      } catch (e) {
        console.error(`Error fetching user: ${e.message}`)
        errors.push(e.message)
      }
    }
    const aRequest = await fetch(relURL('/artists'))
    const {artists, error} = await aRequest.json()
    if (error) errors.push(error)
    return {
      errors,
      user,
      artists: Object.keys(artists),
      artistInfo: artists,
    }
  }
  async updateArtist(uid, fn, filter) {
    let ca = store.get(uid) || {}
    if (filter(ca)) {
      ca = await fn(ca)
      store.set(uid, ca)
      const {artistInfo} = this.state
      artistInfo[uid] = ca
      this.setState({artistInfo})
    }
  }
  async componentDidMount() {
    let {artists, artistInfo, user} = this.props
    const access_token = jsCookie.get('access_token')
    const refresh_token = jsCookie.get('refresh_token')
    if (!spotifyApi) {
      spotifyApi = new SpotifyWebApi(
        null,
        url.parse(window.location.href.replace(/\/$/, '') + '/spotify'),
      )
    }
    updateCredentials({access_token, refresh_token})
    if (artists && user) {
      artists.forEach((uid, i) =>
        this.updateArtist(
          uid,
          async () => {
            const ca = artistInfo[uid]
            try {
              const {body} = await spotifyApi.searchArtists(ca.name)
              ca.artists = body.artists.items
            } catch (e) {
              console.error(`Error fetching ${ca.name}`, e)
            }
            return ca
          },
          a => !a.artists,
        ),
      )
    }
    if (user) {
      try {
        const {body} = await spotifyApi.getUserPlaylists(user.id)
        const availablePlaylists = body.items
        const playlistMap = availablePlaylists.reduce((o, p) => {
          o[p.id] = p
          return o
        }, {})
        this.setState({availablePlaylists, playlistMap})
      } catch (e) {
        console.error(`Error fetching playlists`, e)
      }
    }
  }
  async selectPlaylist(p) {
    if (!p) return this.setState({selectedPlaylist: null})
    const {user} = this.state
    this.setState({loadingPlaylist: true})
    const playlistItems = await getAllPlaylistItems(p)
    const artistsInPlaylist = playlistItems.reduce((o, i) => {
      i.track.artists.forEach(a => {
        o[a.id] = o[a.id] || []
        o[a.id].push(i.track)
      })
      return o
    }, {})
    this.setState({selectedPlaylist: p, artistsInPlaylist, loadingPlaylist: false})
  }
  async addTracksToPlaylist(a, root) {
    const {selectedPlaylist, artistsInPlaylist} = this.state
    if (artistsInPlaylist[a.id] && artistsInPlaylist[a.id].length > 0) {
      return
    }
    const {body} = await spotifyApi.getArtistTopTracks(a.id, 'US')
    const tracks = body.tracks.map(i => i.uri)
    try {
      await spotifyApi.addTracksToPlaylist(selectedPlaylist.owner.id, selectedPlaylist.id, tracks)
    } catch (e) {
      console.error(`Error adding tracks for ${root.name}`, e)
    }
  }
  removeFromPlaylist(a) {}
  addAllTopTracks() {
    const {artists} = this.props
    this.setState({loadingPlaylist: true})
    Promise.all(
      artists.map(async uid => {
        const root = store.get(uid) || {}
        const a = root.artists[0]
        if (!a) {
          return console.log(`Not found: ${root.name} (${root.country})`)
        }
        await this.addTracksToPlaylist(a, root)
      }),
    ).then(() => {
      const {selectedPlaylist} = this.state
      this.selectPlaylist(selectedPlaylist)
    })
  }
  artist(uid) {
    const {artistInfo} = this.props
    const root = store.get(uid) || {}
    const {artistsInPlaylist, selectedPlaylist} = this.state
    let artistList
    if (root.artists) {
      artistList = (
        <ul>
          {root.artists.map(a => {
            const click = () =>
              this.updateArtist(uid, ca => {
                ca.artistId = a.id
                return ca
              })
            const aTracks = artistsInPlaylist[a.id] || []
            const img = a.images[0] && a.images[0].url
            const styles = {
              backgroundColor: aTracks.length ? 'steelblue' : 'white',
            }
            return (
              <li key={a.id} style={styles}>
                <h3>{a.name}</h3>
                <p>{a.genres.join(' ')}</p>
                {img ? (
                  <p>
                    <img width="200" src={img} />
                  </p>
                ) : null}
                <a href={a.external_urls.spotify}>Open in Spotify</a>
                {selectedPlaylist ? (
                  <div>
                    <p>{aTracks.length} tracks on playlist</p>
                    {aTracks.length ? (
                      <button onClick={() => this.removeFromPlaylist(a)}>Remove all tracks</button>
                    ) : (
                      <button
                        onClick={async () => {
                          await this.addTracksToPlaylist(a, root)
                          this.selectPlaylist(selectedPlaylist)
                        }}
                      >
                        Add top tracks
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )
    }
    return (
      <li key={uid}>
        <h2>
          {root.name} ({root.country})
        </h2>
        {artistList}
      </li>
    )
  }
  render() {
    const {errors, artists, user} = this.props
    const {loadingPlaylist, playlistMap, availablePlaylists, selectedPlaylist} = this.state
    if (!user) {
      return (
        <div>
          <a href="/login">Log In to Spotify</a>
        </div>
      )
    }
    let plSelect = <span>Loading...</span>
    if (!loadingPlaylist && availablePlaylists.length) {
      plSelect = (
        <select
          value={selectedPlaylist ? selectedPlaylist.id : ''}
          onChange={e => this.selectPlaylist(playlistMap[e.target.value])}
        >
          <option>select a playlist</option>
          {availablePlaylists.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )
    }
    return (
      <div>
        <h4>
          Logged in as {user.display_name} ({user.id})
        </h4>
        {errors.length ? <span>Error: {errors.join(', ')}</span> : null}
        {plSelect}
        {artists.length && selectedPlaylist ? (
          <button onClick={() => this.addAllTopTracks()}>
            Add all top tracks from first matched artists
          </button>
        ) : null}
        {artists.length ? <ul>{artists.map(a => this.artist(a))}</ul> : null}
      </div>
    )
  }
}
