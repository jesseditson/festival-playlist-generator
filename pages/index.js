import React, { Component } from "react";
import jsCookie from "js-cookie";
import cookie from "cookie";
import fetch from "isomorphic-fetch";
import store from "store";
import SpotifyWebApi from "spotify-web-api-node";

const spotifyApi = new SpotifyWebApi();

const updateCredentials = ({ access_token, refresh_token }) => {
  if (access_token) spotifyApi.setAccessToken(access_token);
  if (refresh_token) spotifyApi.setRefreshToken(refresh_token);
};

const getUser = async (fail) => {
  let user;
  try {
    const res = await spotifyApi.getMe();
    user = res.body;
  } catch (e) {
    console.error(`Error fetching user:`, e);
    if (fail) throw e;
  }
  if (!user) {
    // TODO: just clear cookies instead, or make server do this
    const { body } = await spotifyApi.refreshAccessToken();
    updateCredentials(body);
    return getUser(true);
  }
  return user;
};

const getAllPlaylistItems = async (
  p,
  opts = { offset: 0, limit: 100 },
  prev = []
) => {
  const { body } = await spotifyApi.getPlaylistTracks(p.id, opts);
  opts.offset += body.items.length;
  const items = prev.concat(body.items);
  if (opts.offset < body.total) {
    return getAllPlaylistItems(p, opts, items);
  } else {
    return items;
  }
};

export default class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...props,
      artistsInPlaylist: {},
      selectedPlaylist: null,
      availablePlaylists: [],
      loadingPlaylist: false,
      expandedArtists: {},
      hideAdded: false,
      artistInfo: {},
    };
  }
  static async getInitialProps({ req }) {
    let access_token, refresh_token, user;
    let errors = [];
    let relURL = (u) => (req ? `http://${req.headers.host}${u}` : u);
    if (req && req.headers.cookie) {
      // Server
      const c = cookie.parse(req.headers.cookie);
      access_token = c.access_token;
      refresh_token = c.refresh_token;
      updateCredentials({ access_token, refresh_token });
      try {
        user = await getUser();
      } catch (e) {
        console.error(`Error fetching user: ${e.message}`);
        errors.push(e.message);
      }
    }
    const aRequest = await fetch(relURL("/artists"));
    const { artists, error } = await aRequest.json();
    if (error) errors.push(error);
    return {
      errors,
      user,
      artists: artists ? Object.keys(artists) : [],
      artistInfo: artists,
    };
  }
  async updateArtist(uid, fn, filter) {
    let ca = store.get(uid) || {};
    if (filter(ca)) {
      ca = await fn(ca);
      store.set(uid, ca);
      const { artistInfo } = this.state;
      artistInfo[uid] = ca;
      this.setState({ artistInfo });
    }
  }
  async componentDidMount() {
    let { artists, artistInfo, user } = this.props;
    const access_token = jsCookie.get("access_token");
    const refresh_token = jsCookie.get("refresh_token");
    updateCredentials({ access_token, refresh_token });
    if (artists && user) {
      artists.forEach((uid, i) =>
        this.updateArtist(
          uid,
          async () => {
            const ca = artistInfo[uid];
            try {
              const { body } = await spotifyApi.searchArtists(ca.name);
              ca.artists = body.artists.items;
            } catch (e) {
              console.error(`Error fetching ${ca.name}`, e);
            }
            return ca;
          },
          (a) => !a.artists
        )
      );
    }
    if (user) {
      try {
        const { body } = await spotifyApi.getUserPlaylists(user.id);
        const availablePlaylists = body.items;
        const playlistMap = availablePlaylists.reduce((o, p) => {
          o[p.id] = p;
          return o;
        }, {});
        const selectedPlaylsit = store.get("selectedPlaylist");
        this.setState({ availablePlaylists, playlistMap, selectedPlaylsit });
      } catch (e) {
        console.error(`Error fetching playlists`, e);
      }
    }
  }
  async selectPlaylist(p) {
    if (!p) return this.setState({ selectedPlaylist: null });
    const { user } = this.state;
    this.setState({ loadingPlaylist: true });
    const playlistItems = await getAllPlaylistItems(p);
    store.set("selectedPlaylist", p);
    const artistsInPlaylist = playlistItems.reduce((o, i) => {
      i.track.artists.forEach((a) => {
        o[a.id] = o[a.id] || [];
        o[a.id].push(i.track);
      });
      return o;
    }, {});
    this.setState({
      selectedPlaylist: p,
      artistsInPlaylist,
      loadingPlaylist: false,
    });
  }
  async addTracksToPlaylist(a, root) {
    const { selectedPlaylist, artistsInPlaylist } = this.state;
    if (artistsInPlaylist[a.id] && artistsInPlaylist[a.id].length > 0) {
      return;
    }
    const { body } = await spotifyApi.getArtistTopTracks(a.id, "US");
    const tracks = body.tracks.map((i) => i.uri);
    try {
      await spotifyApi.addTracksToPlaylist(selectedPlaylist.id, tracks);
      this.selectPlaylist(selectedPlaylist);
    } catch (e) {
      console.error(`Error adding tracks for ${root.name}`, e);
    }
  }
  async removeFromPlaylist(a, root) {
    const { selectedPlaylist, artistsInPlaylist } = this.state;
    if (!artistsInPlaylist[a.id] || artistsInPlaylist[a.id].length == 0) {
      return;
    }
    const tracks = artistsInPlaylist[a.id].map(({ uri }) => ({ uri }));
    try {
      await spotifyApi.removeTracksFromPlaylist(selectedPlaylist.id, tracks);
      this.selectPlaylist(selectedPlaylist);
    } catch (e) {
      console.error(`Error removing tracks for ${root.name}`, e);
    }
  }
  async addAllTopTracks() {
    const { artistsInPlaylist } = this.state;
    const { artists } = this.props;
    this.setState({ loadingPlaylist: true });
    // const chunks = artists.reduce((arr, uid) => {
    //   let lastNode = arr[arr.length - 1]
    //   if (lastNode.length < 10) {
    //     lastNode.push(uid)
    //   } else {
    //     arr.push([])
    //     lastNode = [uid]
    //   }
    //   arr[arr.length - 1] = lastNode
    //   return arr
    // }, [[]])
    // for (const chunk of chunks) {
    //     await Promise.all(
    //       chunk.map(async uid => {
    console.log(artists);
    for (const uid of artists) {
      const root = store.get(uid) || {};
      const a = root.artists[0];
      if (!a) {
        console.log(`Not found: ${root.name} (${root.country})`);
        break;
      }
      if (artistsInPlaylist[a.id] && artistsInPlaylist[a.id].length > 0) {
        break;
      }
      console.log(`Adding tracks for ${root.name} (${root.country})`);
      await this.addTracksToPlaylist(a, root);
      await new Promise((r) => setTimeout(r, 1000));
    }
    //   })
    // )
    const { selectedPlaylist } = this.state;
    this.selectPlaylist(selectedPlaylist);
  }
  artist(uid) {
    const root = store.get(uid) || {};
    const { artistsInPlaylist, selectedPlaylist, expandedArtists } = this.state;
    const artistOption = (a) => {
      const click = () =>
        this.updateArtist(uid, (ca) => {
          ca.artistId = a.id;
          return ca;
        });
      const aTracks = artistsInPlaylist[a.id] || [];
      const img = a.images[0] && a.images[0].url;
      const styles = {
        backgroundColor: aTracks.length ? "steelblue" : "white",
      };
      return (
        <li key={a.id} style={styles}>
          <h3>{a.name}</h3>
          <p>{a.genres.join(" ")}</p>
          {img ? (
            <p>
              <img width="200" src={img} />
            </p>
          ) : null}
          <a target="_blank" href={a.external_urls.spotify}>
            Open in Spotify
          </a>
          {selectedPlaylist ? (
            <div>
              <p>{aTracks.length} tracks on playlist</p>
              {aTracks.length ? (
                <button onClick={() => this.removeFromPlaylist(a, root)}>
                  Remove all tracks
                </button>
              ) : (
                <button onClick={() => this.addTracksToPlaylist(a, root)}>
                  Add top tracks
                </button>
              )}
            </div>
          ) : null}
        </li>
      );
    };
    let artistList;
    if (root.artists) {
      const defaultArtists = root.artists.filter(
        (a) => artistsInPlaylist[a.id]
      );
      artistList = (
        <ul>
          {expandedArtists[uid]
            ? root.artists.map(artistOption)
            : defaultArtists.map(artistOption)}
        </ul>
      );
    }
    return (
      <li key={uid}>
        <h2
          onClick={() => {
            expandedArtists[uid] = !expandedArtists[uid];
            this.setState({ expandedArtists });
          }}
        >
          {root.name}
          {root.country ? ` (${root.country})` : null}
        </h2>
        {artistList}
      </li>
    );
  }
  render() {
    const { errors, artists: allArtists, user } = this.props;
    const {
      loadingPlaylist,
      playlistMap,
      availablePlaylists,
      selectedPlaylist,
      hideAdded,
      artistsInPlaylist,
      artistInfo,
    } = this.state;
    if (!user) {
      return (
        <div>
          <a href="/login">Log In to Spotify</a>
        </div>
      );
    }
    let plSelect = <span>Loading...</span>;
    if (!loadingPlaylist && availablePlaylists.length) {
      plSelect = (
        <select
          value={selectedPlaylist ? selectedPlaylist.id : ""}
          onChange={(e) => this.selectPlaylist(playlistMap[e.target.value])}
        >
          <option>select a playlist</option>
          {availablePlaylists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      );
    }
    const artists = hideAdded
      ? allArtists.filter((a) => {
          const info = store.get(a);
          if (!info || !info.artists) return true;
          return !info.artists.some((a) => artistsInPlaylist[a.id]);
        })
      : allArtists;
    return (
      <div>
        <h4>
          Logged in as {user.display_name} ({user.id})
        </h4>
        {errors.length ? <span>Error: {errors.join(", ")}</span> : null}
        {plSelect}
        <br />
        <a href="#" onClick={() => this.setState({ hideAdded: !hideAdded })}>
          {hideAdded ? "Show Added" : "Hide Added"}
        </a>
        {artists.length && selectedPlaylist ? (
          <button onClick={() => this.addAllTopTracks()}>
            Add all top tracks from first matched artists
          </button>
        ) : null}
        {artists.length ? <ul>{artists.map((a) => this.artist(a))}</ul> : null}
      </div>
    );
  }
}
