### Festival lineup generator

## Usage:

- Create a Spotify app: https://developer.spotify.com/dashboard/applications
- Make a file `~/.secrets/festival-playlist-generator.env` with the following content

```
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
```

- Add .txt file to lineups folder (one line per band, optional location in parentheses after band name)
- Change path in artists.js to new text file
- {{npm install --engine-strict}}
- {{npm run dev}}
- Make a new playlist in spotify
- Open http://localhost:3000
